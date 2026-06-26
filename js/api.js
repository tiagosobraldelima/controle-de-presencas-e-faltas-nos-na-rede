/**
 * API Module
 * Projeto Nós na Rede - Fiocruz Brasília
 *
 * Handles all HTTP requests with retry pattern and caching
 */

import Config from './config.js';

class APIClient {
    constructor() {
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
        this.pendingRequests = new Map();
        this.maxCacheSize = 50; // previne memory leak
    }

    /**
     * Log message with prefix
     */
    log(level, ...args) {
        if (Config.LOG.ENABLED) {
            console[level](Config.LOG.PREFIX, ...args);
        }
    }

    /**
     * Check if cached data is still valid
     */
    isCacheValid(key) {
        const cached = this.cache.get(key);
        if (!cached) return false;
        return Date.now() - cached.timestamp < this.cacheTimeout;
    }

    /**
     * Get from cache
     */
    getFromCache(key) {
        if (this.isCacheValid(key)) {
            this.log('info', 'Cache hit:', key);
            return this.cache.get(key).data;
        }
        return null;
    }

    /**
     * Set cache (with size limit to prevent memory leak)
     */
    setCache(key, data) {
        // Limpa entries antigas se passar do limite
        if (this.cache.size >= this.maxCacheSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) this.cache.delete(firstKey);
        }
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    /**
     * Clear all cache
     */
    clearCache() {
        this.cache.clear();
        this.log('info', 'Cache cleared');
    }

    /**
     * Sleep utility for retry delays
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Fetch with retry pattern + exponential backoff
     */
    async fetchWithRetry(url, options = {}, attempt = 1) {
        const { retries = Config.API.RETRY_ATTEMPTS, delay = Config.API.RETRY_DELAY } = options;

        // Exponential backoff: delay * 2^(attempt-1)
        const backoffDelay = delay * Math.pow(2, attempt - 1);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), Config.API.TIMEOUT);

        try {
            this.log('debug', `Fetch attempt ${attempt}/${retries}:`, url);

            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const err = new Error(`HTTP ${response.status}: ${response.statusText}`);
                err.status = response.status;
                err.retryable = response.status >= 500; // 5xx retry, 4xx don't
                throw err;
            }

            const contentType = response.headers.get('content-type') || '';
            if (!contentType.includes('application/json')) {
                throw new Error(`Resposta não-JSON recebida (Content-Type: ${contentType})`);
            }

            return await response.json();

        } catch (error) {
            clearTimeout(timeoutId);

            // AbortError = timeout - retryable
            const isTimeout = error.name === 'AbortError';
            // TypeError (sem internet) - retryable
            const isNetwork = error instanceof TypeError;
            const retryable = isTimeout || isNetwork || error.retryable !== false;

            this.log('warn', `Fetch failed (attempt ${attempt}):`, error.message);

            if (attempt < retries && retryable) {
                this.log('info', `Retrying in ${backoffDelay}ms...`);
                await this.sleep(backoffDelay);
                return this.fetchWithRetry(url, options, attempt + 1);
            }

            throw error;
        }
    }

    /**
     * Fetch data from API with caching and dedup
     */
    async fetchData(endpoint, useCache = true) {
        const cacheKey = endpoint;

        // Check cache first
        if (useCache) {
            const cached = this.getFromCache(cacheKey);
            if (cached) return cached;
        }

        // Dedup: se já tem uma request em andamento, aguarda
        if (this.pendingRequests.has(cacheKey)) {
            this.log('info', 'Awaiting pending request:', cacheKey);
            return this.pendingRequests.get(cacheKey);
        }

        const requestPromise = this.fetchWithRetry(endpoint)
            .then(data => {
                this.setCache(cacheKey, data);
                return data;
            })
            .finally(() => {
                this.pendingRequests.delete(cacheKey);
            });

        this.pendingRequests.set(cacheKey, requestPromise);

        return requestPromise;
    }

    /**
     * Fetch dashboard data
     */
    async fetchDashboardData() {
        this.log('info', 'Fetching dashboard data...');

        const result = await this.fetchData(Config.API.ENDPOINTS.DATA);

        if (!result || !result.success) {
            throw new Error((result && result.error) || 'Failed to fetch data');
        }

        this.log('info', `Fetched ${result.count} records`);
        return result.data || [];
    }

    /**
     * Force refresh (bypass cache)
     */
    async forceRefresh() {
        this.clearCache();
        return this.fetchDashboardData();
    }
}

// Create singleton instance
const apiClient = new APIClient();

export default apiClient;
