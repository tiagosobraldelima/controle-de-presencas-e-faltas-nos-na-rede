/**
 * API Module
 * Projeto Nós na Rede - Fiocruz Brasília
 *
 * Suporta dois modos de operação:
 *   - 'static'  : fetch direto do Google Sheets (CORS liberado)
 *                 com fallback para proxies CORS públicos
 *   - 'proxy'   : usa o servidor Python local (server.py) via /api/data
 *
 * Detecção automática via Config.API.MODE = 'auto' ou hostname em STATIC_HOSTS.
 */

import Config from './config.js';

class APIClient {
    constructor() {
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutos
        this.pendingRequests = new Map();
        this.maxCacheSize = 50;

        // Detecta o modo de operação uma vez no construtor
        this.mode = this._detectMode();
        this._log('info', `API mode: ${this.mode}`);
    }

    /**
     * Detecta o modo com base em Config.API.MODE + hostname
     */
    _detectMode() {
        if (Config.API.MODE === 'static') return 'static';
        if (Config.API.MODE === 'proxy') return 'proxy';

        // 'auto': checa hostname
        const host = window.location.hostname.toLowerCase();
        if (host === 'localhost' || host === '127.0.0.1' || host === '') {
            return 'proxy';
        }
        if (Config.STATIC_HOSTS.some(h => host.endsWith(h))) {
            return 'static';
        }
        // file:// ou outro — assume estático por segurança
        if (window.location.protocol === 'file:') {
            return 'static';
        }
        // Default: proxy (servidor local)
        return 'proxy';
    }

    _log(level, ...args) {
        if (Config.LOG.ENABLED) {
            console[level](Config.LOG.PREFIX, ...args);
        }
    }

    // ============================================================
    // Cache helpers
    // ============================================================

    isCacheValid(key) {
        const cached = this.cache.get(key);
        if (!cached) return false;
        return Date.now() - cached.timestamp < this.cacheTimeout;
    }

    getFromCache(key) {
        if (this.isCacheValid(key)) {
            this._log('info', 'Cache hit:', key);
            return this.cache.get(key).data;
        }
        return null;
    }

    setCache(key, data) {
        if (this.cache.size >= this.maxCacheSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) this.cache.delete(firstKey);
        }
        this.cache.set(key, { data, timestamp: Date.now() });
    }

    clearCache() {
        this.cache.clear();
        this._log('info', 'Cache cleared');
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ============================================================
    // Fetch com retry + exponential backoff (genérico)
    // ============================================================

    async fetchWithRetry(url, options = {}, attempt = 1) {
        const { retries = Config.API.RETRY_ATTEMPTS, delay = Config.API.RETRY_DELAY } = options;
        const backoffDelay = delay * Math.pow(2, attempt - 1);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), Config.API.TIMEOUT);

        try {
            this._log('debug', `Fetch attempt ${attempt}/${retries}:`, url);
            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
                redirect: 'follow'  // Segue redirects do Google Sheets
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const err = new Error(`HTTP ${response.status}: ${response.statusText}`);
                err.status = response.status;
                err.retryable = response.status >= 500;
                throw err;
            }

            return response;

        } catch (error) {
            clearTimeout(timeoutId);

            const isTimeout = error.name === 'AbortError';
            const isNetwork = error instanceof TypeError;
            const retryable = isTimeout || isNetwork || error.retryable !== false;

            this._log('warn', `Fetch failed (attempt ${attempt}):`, error.message);

            if (attempt < retries && retryable) {
                this._log('info', `Retrying in ${backoffDelay}ms...`);
                await this.sleep(backoffDelay);
                return this.fetchWithRetry(url, options, attempt + 1);
            }

            throw error;
        }
    }

    // ============================================================
    // Modo PROXY — servidor Python local
    // ============================================================

    async _fetchViaProxy() {
        const cacheKey = 'proxy:' + Config.API.ENDPOINTS.DATA;
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        if (this.pendingRequests.has(cacheKey)) {
            return this.pendingRequests.get(cacheKey);
        }

        const promise = this.fetchWithRetry(Config.API.ENDPOINTS.DATA)
            .then(async r => {
                const json = await r.json();
                if (!json || !json.success) {
                    throw new Error((json && json.error) || 'Failed to fetch data');
                }
                this._log('info', `Fetched ${json.count} records via proxy`);
                this.setCache(cacheKey, json.data || []);
                return json.data || [];
            })
            .finally(() => this.pendingRequests.delete(cacheKey));

        this.pendingRequests.set(cacheKey, promise);
        return promise;
    }

    // ============================================================
    // Modo STATIC — fetch direto do Google Sheets
    // ============================================================

    /**
     * Parser CSV client-side (compatível com o que server.py gera)
     */
    _parseCSV(csvText) {
        if (!csvText) return [];

        const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.length > 0);
        if (lines.length < 2) return [];

        const parseLine = (line) => {
            const result = [];
            let current = [];
            let inQuotes = false;
            let i = 0;
            const n = line.length;

            while (i < n) {
                const ch = line[i];
                if (ch === '"') {
                    if (inQuotes && line[i + 1] === '"') {
                        current.push('"');
                        i += 2;
                        continue;
                    }
                    inQuotes = !inQuotes;
                } else if (ch === ',' && !inQuotes) {
                    result.push(current.join(''));
                    current = [];
                } else {
                    current.push(ch);
                }
                i += 1;
            }
            result.push(current.join(''));
            return result;
        };

        const headers = parseLine(lines[0]).map(h => h.trim());
        const data = [];

        for (let li = 1; li < lines.length; li++) {
            const values = parseLine(lines[li]);
            const row = {};
            for (let j = 0; j < headers.length; j++) {
                row[headers[j]] = (j < values.length ? values[j] : '').trim();
            }
            data.push(row);
        }

        return data;
    }

    /**
     * Escapa valores contra CSV/Excel injection
     */
    _escapeCSVInjection(value) {
        if (value === null || value === undefined) return '';
        const s = String(value);
        if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) {
            return "'" + s;
        }
        return s;
    }

    /**
     * Tenta fetch direto do Google Sheets
     * Safari bloqueia cookies de terceiros durante o redirect 307 → tentamos
     * com `credentials: 'omit'` para evitar que a política ITP quebre o fluxo.
     */
    async _fetchDirect(url) {
        const response = await this.fetchWithRetry(url, {
            headers: { 'Accept': 'text/csv,*/*' },
            credentials: 'omit',
            cache: 'no-store'
        });
        const text = await response.text();
        // Validação: precisa começar com header CSV (não pode ser HTML de erro)
        if (text && /^<\s*(!doctype|html|head|body)/i.test(text.trim())) {
            throw new Error('Resposta HTML recebida (proxy CORS pode estar bloqueado)');
        }
        if (text && !/[,;\t]/.test(text.substring(0, 500))) {
            throw new Error('Resposta não parece ser CSV');
        }
        return text;
    }

    /**
     * Tenta fetch via um proxy CORS público
     */
    async _fetchViaPublicProxy(url) {
        for (const proxyFn of Config.API.CORS_PROXIES) {
            const proxiedUrl = proxyFn(url);
            try {
                this._log('info', `Tentando proxy CORS: ${proxiedUrl.substring(0, 80)}...`);
                const response = await this.fetchWithRetry(proxiedUrl, {
                    headers: { 'Accept': 'text/csv,*/*' }
                });
                const text = await response.text();
                if (text && text.length > 0) {
                    return text;
                }
            } catch (e) {
                this._log('warn', `Proxy falhou: ${e.message}`);
                continue;
            }
        }
        throw new Error('Todos os proxies CORS públicos falharam');
    }

    /**
     * Fetch de dados em modo estático com estratégia em camadas
     */
    async _fetchStatic() {
        const cacheKey = 'static:' + Config.API.CSV_URL;
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        if (this.pendingRequests.has(cacheKey)) {
            return this.pendingRequests.get(cacheKey);
        }

        const promise = (async () => {
            const url = Config.API.CSV_URL;
            let csvText = null;
            let strategy = 'unknown';
            const errors = [];

            // 1) Tenta direto (Google Sheets libera CORS: *)
            try {
                csvText = await this._fetchDirect(url);
                strategy = 'direct';
            } catch (directErr) {
                errors.push(`direct: ${directErr.message}`);
                this._log('warn', `Fetch direto falhou (${directErr.message}), tentando proxies públicos...`);
            }

            // 2) Fallback para proxies CORS públicos
            if (csvText === null) {
                try {
                    csvText = await this._fetchViaPublicProxy(url);
                    strategy = 'public-proxy';
                } catch (proxyErr) {
                    errors.push(`proxy: ${proxyErr.message}`);
                    throw new Error(`Fetch direto e proxies falharam. Detalhes: ${errors.join(' | ')}`);
                }
            }

            this._log('info', `Fetch via ${strategy}`);

            // Parse + sanitize
            const raw = this._parseCSV(csvText);
            const sanitized = raw.map(row => {
                const out = {};
                for (const k of Object.keys(row)) {
                    out[k] = this._escapeCSVInjection(row[k]);
                }
                return out;
            });

            this._log('info', `Parsed ${sanitized.length} records (static mode)`);
            this.setCache(cacheKey, sanitized);
            return sanitized;
        })().finally(() => this.pendingRequests.delete(cacheKey));

        this.pendingRequests.set(cacheKey, promise);
        return promise;
    }

    // ============================================================
    // Public API
    // ============================================================

    /**
     * Retorna dados do dashboard (escolhe modo automaticamente)
     */
    async fetchDashboardData() {
        if (this.mode === 'static') {
            return this._fetchStatic();
        }
        return this._fetchViaProxy();
    }

    /**
     * Force refresh — limpa cache e recarrega
     */
    async forceRefresh() {
        this.clearCache();
        return this.fetchDashboardData();
    }

    /**
     * Informa se está em modo estático (usado pela UI para esconder server instructions)
     */
    isStatic() {
        return this.mode === 'static';
    }

    /**
     * Informa o modo atual (para debug)
     */
    getMode() {
        return this.mode;
    }
}

const apiClient = new APIClient();
export default apiClient;
