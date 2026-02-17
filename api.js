const SOLAR_API_KEY = 'KJ7ARUDREGXJM57D2YVEDY1T8KZ6LISU';
const SITE_ID = '4262188';
// Check if we are in development mode (localhost) to use the proxy
const IS_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const BASE_URL = IS_DEV ? '/solaredge' : 'https://monitoringapi.solaredge.com';

const CACHE_DURATIONS = {
    'details': 60 * 60 * 1000,          // 1 hour
    'overview': 15 * 60 * 1000,         // 15 minutes
    'power': 15 * 60 * 1000,            // 15 minutes
    'energy': 24 * 60 * 60 * 1000,      // 24 hours (Historical data doesn't change)
    'currentPowerFlow': 10 * 60 * 1000, // 10 minutes
    'envBenefits': 12 * 60 * 60 * 1000, // 12 hours
    'inventory': 12 * 60 * 60 * 1000,   // 12 hours
    'powerDetails': 15 * 60 * 1000      // 15 minutes
};

const SolarAPI = {
    async fetch(endpoint, params = {}) {
        const queryParams = new URLSearchParams({
            api_key: SOLAR_API_KEY,
            ...params
        });

        const url = `${BASE_URL}/site/${SITE_ID}/${endpoint}?${queryParams.toString()}`;
        const cacheKey = `solar_data_${endpoint}_${JSON.stringify(params)}`;
        const lastSuccessKey = `solar_last_success_${endpoint}`;

        // Check for rate-limiting block
        const blockedUntil = localStorage.getItem('solar_api_blocked_until');
        if (blockedUntil && Date.now() < parseInt(blockedUntil)) {
            // Try specific cache first
            let cached = localStorage.getItem(cacheKey);

            // Fallback to last success if current param cache is missing (e.g. new day)
            if (!cached) {
                cached = localStorage.getItem(lastSuccessKey);
                if (cached) console.log(`[API] Throttled - Falling back to last successful ${endpoint}`);
            }

            if (cached) return JSON.parse(cached).data;
            throw new Error(`API rate limited until ${new Date(parseInt(blockedUntil)).toLocaleTimeString()}`);
        }

        // Standard TTL Caching
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            const { data, timestamp } = JSON.parse(cached);
            const duration = CACHE_DURATIONS[endpoint] || 15 * 60 * 1000;
            if (Date.now() - timestamp < duration) {
                console.log(`[API] Cache Hit: ${endpoint}`);
                return data;
            }
        }

        console.log(`[API] Fetching: ${url}`);
        try {
            const response = await fetch(url, { headers: { 'Accept': 'application/json' } });

            if (response.status === 429) {
                const blockTime = Date.now() + 60 * 60 * 1000;
                localStorage.setItem('solar_api_blocked_until', blockTime.toString());
                throw new Error('API Daily limit quota exceeded.');
            }

            if (!response.ok) throw new Error(`API request failed with status ${response.status}`);
            const data = await response.json();

            // Store in cache and as last success
            const cacheEntry = { data, timestamp: Date.now() };
            localStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
            localStorage.setItem(lastSuccessKey, JSON.stringify(cacheEntry));

            localStorage.removeItem('solar_api_blocked_until');
            return data;
        } catch (error) {
            // Last resort: return any last successful data
            const lastSuccess = localStorage.getItem(lastSuccessKey);
            if (lastSuccess) {
                console.warn(`[API] Using last success fallback for ${endpoint}`);
                return JSON.parse(lastSuccess).data;
            }
            throw error;
        }
    },

    getDetails() {
        return this.fetch('details');
    },

    getOverview() {
        return this.fetch('overview');
    },

    getPower(startTime, endTime) {
        return this.fetch('power', { startTime, endTime });
    },

    getEnergy(startTime, endTime, timeUnit = 'DAY') {
        return this.fetch('energyDetails', {
            startTime,
            endTime,
            timeUnit,
            meters: 'PRODUCTION,PURCHASED'
        });
    },

    getPowerFlow() {
        return this.fetch('currentPowerFlow');
    },

    getEnvBenefits() {
        return this.fetch('envBenefits');
    },

    getInventory() {
        return this.fetch('inventory');
    },

    getPowerDetails(startTime, endTime) {
        return this.fetch('powerDetails', {
            startTime,
            endTime,
            meters: 'PRODUCTION,CONSUMPTION,PURCHASED'
        });
    }
};

window.SolarAPI = SolarAPI;
