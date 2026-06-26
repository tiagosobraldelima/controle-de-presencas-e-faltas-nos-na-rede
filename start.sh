#!/bin/bash

# =============================================
#  Dashboard do Projeto Nós na Rede
#  Fiocruz Brasília - Monitoramento de Presenças
# =============================================

echo ""
echo "=============================================="
echo "  Dashboard do Projeto Nós na Rede"
echo "  Fiocruz Brasília"
echo "=============================================="
echo ""

# Verifica se python3 está disponível
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 não encontrado!"
    echo "   Por favor, instale o Python 3."
    exit 1
fi

# Navega para o diretório do script
cd "$(dirname "$0")"

echo "📁 Diretório: $(pwd)"
echo ""

# Verifica se o servidor já está rodando
if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "⚠️  Já existe um servidor rodando na porta 8000!"
    echo "   Abra o navegador em: http://localhost:8000"
else
    echo "🚀 Iniciando servidor..."
    echo ""
    python3 server.py
fi
