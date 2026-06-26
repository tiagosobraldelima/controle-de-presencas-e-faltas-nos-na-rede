/**
 * Dashboard Configuration
 * Projeto Nós na Rede - Fiocruz Brasília
 * 
 * Centralized configuration for the entire dashboard
 */

const Config = {
    // API Configuration
    API: {
        // Modo de operação:
        //   'auto'    - detecta automaticamente (recomendado)
        //   'static'  - GitHub Pages / hosting estático (fetch direto do Google Sheets)
        //   'proxy'   - servidor Python local (server.py)
        MODE: 'auto',

        // URLs para modo estático
        CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQoGnE2RG9yDysuCwJubfxoJcbbdC8yfeguHrKOXwxyiIGAKxy71hvp8Uow4-3gucHLQlBOqp24NdaU/pub?gid=1700106572&single=true&output=csv',

        // Proxies CORS públicos (fallback se fetch direto falhar por CORS)
        CORS_PROXIES: [
            // corsproxy.io - gratuito, sem limite agressivo
            (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
            // allorigins.win - alternativo
            (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        ],

        // Endpoints para modo proxy (servidor local)
        ENDPOINTS: {
            DATA: '/api/data',
            PROXY: '/proxy/'
        },

        TIMEOUT: 30000,
        RETRY_ATTEMPTS: 3,
        RETRY_DELAY: 1000
    },

    // Hosts de hosting estático (GitHub Pages, Netlify, Vercel, Cloudflare Pages)
    // Quando detectado, o dashboard usa modo 'static' automaticamente.
    STATIC_HOSTS: [
        'github.io',
        'netlify.app',
        'vercel.app',
        'pages.dev',
        'cloudflarepages.com',
        'surge.sh',
    ],

    // Course Configuration
    COURSE: {
        TOTAL_ENCONTROS: 5,
        TOTAL_PERIODOS: 10,
        PERIODS_PER_ENCONTRO: 2,
        MINIMUM_ATTENDANCE: 75, // %
        MINIMUM_GRADE: 60 // %
    },

    // Certification Criteria
    CRITERIA: {
        cargaHorariaTotal: 120,
        cargaHorariaEAD: 90,
        cargaHorariaPresencial: 30,
        numeroEncontros: 5,
        numeroPeriodos: 10,
        notaMinima: 60,
        frequenciaMinima: 75
    },

    // UI Configuration
    UI: {
        PAGE_LENGTH_OPTIONS: [10, 25, 50, 100, -1],
        DEFAULT_PAGE_LENGTH: 25,
        ANIMATION_DURATION: 300,
        MODAL_BACKDROP: 'static'
    },

    // Status Configuration
    STATUS: {
        PRESENTE: 'PRESENTE',
        AUSENTE: 'AUSENTE',
        INSCRITO: 'INSCRITO',
        DESISTENTE: 'DESISTENTE',
        CERTIFICADO: 'CERTIFICADO',
        EM_ANDAMENTO: 'EM_ANDAMENTO'
    },

    // Certification Eligibility (computed)
    CERTIFICACAO: {
        APTO: 'APTO',                 // Already meets 75% with margin
        NAO_PODE_FALTAR: 'NAO_PODE_FALTAR', // At threshold — cannot miss any more
        SEM_POSSIBILIDADE: 'SEM_POSSIBILIDADE' // Mathematically cannot reach 75%
    },

    // Chart Palette — alinhada com a identidade visual oficial
    CHARTS: {
        // Cores oficiais Nós na Rede
        PALETTE: [
            '#FF6B9B', // pink
            '#00BAD6', // cyan
            '#FFB800', // yellow
            '#4158D0', // purple
            '#00D084', // success
            '#FF6900', // orange
            '#4AEADC', // light cyan
            '#E84A7F', // dark pink
            '#0693E3', // blue
            '#FE2D2D'  // danger
        ],
        SEMANTIC: {
            presente: '#00D084',
            presenteLight: 'rgba(0, 208, 132, 0.18)',
            falta: '#FE2D2D',
            faltaLight: 'rgba(254, 45, 45, 0.18)',
            inscrito: '#00BAD6',
            desistente: '#FE2D2D',
            apto: '#00D084',
            alerta: '#FFB800',
            bloqueado: '#FE2D2D'
        },
        DEFAULTS: {
            fontFamily: "'Inter', sans-serif",
            fontSize: 12,
            borderRadius: 8,
            padding: 16,
            animationDuration: 800
        }
    },

    // Logging Configuration
    LOG: {
        ENABLED: true,
        LEVEL: 'debug', // debug, info, warn, error
        PREFIX: '[Dashboard]'
    }
};

// Freeze config to prevent modifications
Object.freeze(Config.API);
Object.freeze(Config.COURSE);
Object.freeze(Config.CRITERIA);
Object.freeze(Config.UI);
Object.freeze(Config.STATUS);
Object.freeze(Config.LOG);
Object.freeze(Config);

export default Config;
