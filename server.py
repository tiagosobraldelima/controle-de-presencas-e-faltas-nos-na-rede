#!/usr/bin/env python3
"""
Servidor local para o Dashboard do Projeto Nós na Rede
Resolve problemas de CORS ao buscar dados do Google Sheets

Versão com correções de segurança:
- SSL verification habilitado (CERT_REQUIRED)
- Path traversal prevenido (canonicalização + whitelist)
- SSRF mitigado (whitelist de hosts)
- CSV injection prevenido (escape de fórmulas)
- Subprocess com timeout
"""

import http.server
import socketserver
import urllib.request
import urllib.error
import urllib.parse
import json
import os
import signal
import sys
import re
import ipaddress
import socket
from urllib.parse import urlparse, parse_qs
import ssl

# Tenta múltiplas portas
DEFAULT_PORTS = [8000, 8001, 8080, 8888]

# Whitelist de hosts permitidos para o proxy (evita SSRF)
ALLOWED_HOSTS = frozenset([
    'docs.google.com',
    'sheets.google.com',
    'sheets.googleapis.com',
    'accounts.google.com',
])

# Whitelist de extensões servidas como estáticas
ALLOWED_STATIC_EXTENSIONS = frozenset([
    '.html', '.css', '.js', '.json', '.png', '.jpg', '.jpeg',
    '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.map',
])

# MIME types
CONTENT_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.map': 'application/json',
}

# Diretório base para servir arquivos estáticos (segurança)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def create_ssl_context():
    """Cria contexto SSL seguro com verificação de certificados."""
    ctx = ssl.create_default_context()
    # Verificação habilitada por padrão (CERT_REQUIRED)
    ctx.check_hostname = True
    ctx.verify_mode = ssl.CERT_REQUIRED
    return ctx


def validate_target_url(url):
    """Valida URL para evitar SSRF. Retorna (ok, reason)."""
    try:
        parsed = urlparse(url)
    except Exception:
        return False, "URL inválida"

    # Apenas http/https
    if parsed.scheme not in ('http', 'https'):
        return False, "Esquema não permitido"

    if not parsed.hostname:
        return False, "Hostname ausente"

    # Whitelist de hosts
    if parsed.hostname.lower() not in ALLOWED_HOSTS:
        return False, f"Host '{parsed.hostname}' não permitido"

    # Bloquear IPs privados/reservados (defesa em profundidade)
    try:
        ip = socket.gethostbyname(parsed.hostname)
        ip_obj = ipaddress.ip_address(ip)
        if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_reserved or ip_obj.is_link_local:
            return False, "IP em range privado/reservado"
    except (socket.gaierror, ValueError):
        pass  # DNS falhou — SSL check vai capturar depois

    return True, "OK"


def sanitize_path(path):
    """Sanitiza path para prevenir path traversal. Retorna path absoluto ou None."""
    # Decodifica percent-encoding
    try:
        decoded = urllib.parse.unquote(path)
    except Exception:
        return None

    # Remove leading slashes
    cleaned = decoded.lstrip('/')

    # Resolve relative components
    requested = os.path.normpath(cleaned)

    # Previne path traversal: garante que está dentro do BASE_DIR
    full_path = os.path.abspath(os.path.join(BASE_DIR, requested))
    if not full_path.startswith(BASE_DIR):
        return None

    return full_path


def escape_csv_value(value):
    """Previne CSV injection escapando valores que começam com caracteres perigosos."""
    if not value:
        return value
    if isinstance(value, str) and value and value[0] in ('=', '+', '-', '@', '\t', '\r'):
        # Prefixa com tab para evitar interpretação como fórmula
        return "'" + value
    return value


class CORSProxyHandler(http.server.BaseHTTPRequestHandler):
    """Handler que adiciona headers CORS e faz proxy seguro para Google Sheets."""

    def log_message(self, format, *args):
        # Log silencioso para reduzir ruído
        if os.environ.get('NNR_DEBUG'):
            print(f"[{self.log_date_time_string()}] {args[0]}")

    def _set_cors_headers(self):
        """Adiciona headers CORS."""
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _send_json(self, status, payload):
        """Envia resposta JSON."""
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', len(body))
        self._set_cors_headers()
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._set_cors_headers()
        self.send_header('Access-Control-Max-Age', '86400')
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)

        # API de dados do Google Sheets
        if parsed.path == '/api/data':
            self.serve_google_sheets_data()
            return

        # Proxy CORS (com whitelist)
        if parsed.path.startswith('/proxy/'):
            self.handle_proxy()
            return

        # Health check endpoint
        if parsed.path == '/health':
            self._send_json(200, {'status': 'ok', 'service': 'nnr-dashboard'})
            return

        # Serve arquivos estáticos (com path traversal prevention)
        self.serve_static(parsed.path)

    def handle_proxy(self):
        """Handler de proxy CORS com whitelist de hosts."""
        try:
            qs = parse_qs(urlparse(self.path).query)
            target_url = qs.get('url', [''])[0]

            if not target_url:
                self._send_json(400, {'error': 'URL não especificada'})
                return

            # Valida URL (anti-SSRF)
            ok, reason = validate_target_url(target_url)
            if not ok:
                self._send_json(403, {'error': f'URL rejeitada: {reason}'})
                return

            ctx = create_ssl_context()

            req = urllib.request.Request(
                target_url,
                headers={
                    'User-Agent': 'ProjetoNosNaRede-Dashboard/1.0',
                    'Accept': 'text/csv,application/csv,*/*'
                }
            )

            with urllib.request.urlopen(req, context=ctx, timeout=30) as response:
                content = response.read()
                self.send_response(200)
                self.send_header('Content-Type', 'text/csv; charset=utf-8')
                self.send_header('Content-Length', len(content))
                self._set_cors_headers()
                self.end_headers()
                self.wfile.write(content)

        except urllib.error.HTTPError as e:
            self._send_json(e.code, {'error': f'HTTP Error: {e.code}'})
        except urllib.error.URLError as e:
            self._send_json(502, {'error': f'Connection error: {e.reason}'})
        except Exception as e:
            self._send_json(500, {'error': str(e)})

    def serve_static(self, request_path):
        """Serve arquivo estático com path traversal prevention."""
        # Default to index.html
        if not request_path or request_path == '/':
            self._serve_file(os.path.join(BASE_DIR, 'index.html'))
            return

        # Sanitiza path
        full_path = sanitize_path(request_path)
        if full_path is None:
            self._send_json(403, {'error': 'Acesso negado'})
            return

        # Verifica extensão permitida
        ext = os.path.splitext(full_path)[1].lower()
        if ext not in ALLOWED_STATIC_EXTENSIONS:
            self._send_json(404, {'error': 'Recurso não encontrado'})
            return

        if not os.path.isfile(full_path):
            # SPA fallback: serve index.html
            self._serve_file(os.path.join(BASE_DIR, 'index.html'))
            return

        self._serve_file(full_path)

    def _serve_file(self, full_path):
        """Serve um arquivo do disco."""
        ext = os.path.splitext(full_path)[1].lower()
        content_type = CONTENT_TYPES.get(ext, 'application/octet-stream')

        try:
            with open(full_path, 'rb') as f:
                content = f.read()

            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', len(content))
            self._set_cors_headers()
            # Cache agressivo para estáticos versionados
            self.send_header('Cache-Control', 'public, max-age=300')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            self.wfile.write(content)
        except OSError as e:
            self._send_json(500, {'error': f'Erro de leitura: {e}'})

    def serve_google_sheets_data(self):
        """Busca dados do Google Sheets e retorna como JSON."""
        GOOGLE_SHEET_CSV_URL = (
            'https://docs.google.com/spreadsheets/d/e/2PACX-1vQoGnE2RG9yDysuCwJubfxoJcbbdC8yfeguHrKOXwxyiIGAKxy71hvp8Uow4-3gucHLQlBOqp24NdaU/'
            'pub?gid=1700106572&single=true&output=csv'
        )

        try:
            ctx = create_ssl_context()

            req = urllib.request.Request(
                GOOGLE_SHEET_CSV_URL,
                headers={
                    'User-Agent': 'ProjetoNosNaRede-Dashboard/1.0',
                    'Accept': 'text/csv,application/csv,*/*'
                }
            )

            with urllib.request.urlopen(req, context=ctx, timeout=60) as response:
                # Limite de tamanho: 10MB
                content = response.read(10 * 1024 * 1024)
                csv_text = content.decode('utf-8')

            data = self.parse_csv(csv_text)

            # Sanitiza valores contra CSV injection
            sanitized = [
                {k: escape_csv_value(v) for k, v in row.items()}
                for row in data
            ]

            self._send_json(200, {
                'success': True,
                'count': len(sanitized),
                'data': sanitized
            })

        except urllib.error.HTTPError as e:
            self._send_json(e.code, {'success': False, 'error': f'HTTP Error: {e.code}'})
        except urllib.error.URLError as e:
            self._send_json(502, {'success': False, 'error': f'Connection error: {e.reason}'})
        except (ValueError, UnicodeDecodeError) as e:
            self._send_json(500, {'success': False, 'error': f'Dados inválidos: {e}'})
        except Exception as e:
            self._send_json(500, {'success': False, 'error': str(e)})

    def parse_csv(self, csv_text):
        """Parser CSV simples e seguro."""
        if not csv_text:
            return []

        try:
            lines = csv_text.replace('\r\n', '\n').replace('\r', '\n').strip().split('\n')
        except Exception:
            return []

        if len(lines) < 2:
            return []

        headers = self._parse_csv_line(lines[0])
        data = []

        for line in lines[1:]:
            if not line.strip():
                continue
            try:
                values = self._parse_csv_line(line)
            except Exception:
                continue

            row = {}
            for j, header in enumerate(headers):
                if j < len(values):
                    row[header.strip()] = values[j].strip()
            data.append(row)

        return data

    def _parse_csv_line(self, line):
        """Parser de uma linha CSV com suporte a aspas escapadas."""
        result = []
        current = []
        in_quotes = False
        i = 0
        n = len(line)

        while i < n:
            char = line[i]

            if char == '"':
                # Aspas escapada ""
                if in_quotes and i + 1 < n and line[i + 1] == '"':
                    current.append('"')
                    i += 2
                    continue
                in_quotes = not in_quotes
            elif char == ',' and not in_quotes:
                result.append(''.join(current))
                current = []
            else:
                current.append(char)
            i += 1

        result.append(''.join(current))
        return result


class ReusableTCPServer(socketserver.ThreadingTCPServer):
    """Servidor TCP reutilizável com threading."""
    allow_reuse_address = True
    daemon_threads = True


def kill_process_on_port(port):
    """Mata processo usando a porta especificada."""
    try:
        result = subprocess.run(
            ['lsof', '-ti', f':{port}'],
            capture_output=True, text=True,
            timeout=5
        )
        if result.stdout.strip():
            pids = result.stdout.strip().split('\n')
            for pid in pids:
                try:
                    pid_int = int(pid.strip())
                    if pid_int > 0:
                        os.kill(pid_int, signal.SIGTERM)
                        print(f"Processo {pid} na porta {port} encerrado.")
                except (ValueError, OSError, ProcessLookupError):
                    pass
            return True
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return False


def main():
    import subprocess

    print("=" * 60)
    print("  Dashboard do Projeto Nós na Rede")
    print("  Fiocruz Brasília - Monitoramento de Presenças")
    print("=" * 60)

    port = None
    for p in DEFAULT_PORTS:
        try:
            server = ReusableTCPServer(("", p), CORSProxyHandler)
            port = p
            print(f"✅ Servidor iniciado com sucesso na porta {p}!")
            break
        except OSError as e:
            if "Address already in use" in str(e):
                print(f"⚠️  Porta {p} já está em uso.")
                try:
                    response = input(f"Deseja encerrar o processo na porta {p}? (s/n): ").strip().lower()
                except EOFError:
                    response = 'n'
                if response == 's':
                    kill_process_on_port(p)
                    try:
                        server = ReusableTCPServer(("", p), CORSProxyHandler)
                        port = p
                        print(f"✅ Servidor iniciado com sucesso na porta {p}!")
                        break
                    except OSError:
                        continue
            else:
                print(f"❌ Erro: {e}")
                continue

    if port is None:
        print("\n❌ Não foi possível encontrar uma porta livre!")
        sys.exit(1)

    print()
    print("=" * 60)
    print(f"  🌐 Acesse:        http://localhost:{port}")
    print(f"  📊 API de dados:   http://localhost:{port}/api/data")
    print(f"  ❤️  Health check:  http://localhost:{port}/health")
    print()
    print("  Pressione Ctrl+C para parar o servidor")
    print("=" * 60)
    print()

    def signal_handler(sig, frame):
        print("\nEncerrando servidor...")
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor encerrado.")


if __name__ == '__main__':
    main()