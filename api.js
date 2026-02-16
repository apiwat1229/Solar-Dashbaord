const SOLAR_API_KEY = 'KJ7ARUDREGXJM57D2YVEDY1T8KZ6LISU';
const SITE_ID = '4262188';
// Check if we are in development mode (localhost) to use the proxy
const IS_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const BASE_URL = IS_DEV ? '/solaredge' : 'https://monitoringapi.solaredge.com';

const SolarAPI = {
    async fetch(endpoint, params = {}) {
        const queryParams = new URLSearchParams({
            api_key: SOLAR_API_KEY,
            ...params
        });

        const url = `${BASE_URL}/site/${SITE_ID}/${endpoint}?${queryParams.toString()}`;
        console.log(`[API] Fetching: ${url}`);

        // Caching logic
        const cacheKey = `solar_data_${endpoint}_${JSON.stringify(params)}`;
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
            const { data, timestamp } = JSON.parse(cached);
            // Cache for 5 minutes
            if (Date.now() - timestamp < 5 * 60 * 1000) {
                return data;
            }
        }

        try {
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                const text = await response.text();
                console.error(`API Error (${response.status}):`, text);
                throw new Error(`API request failed with status ${response.status}`);
            }

            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('Expected JSON but received:', text.substring(0, 100));
                throw new Error('API returned non-JSON response');
            }

            const data = await response.json();

            sessionStorage.setItem(cacheKey, JSON.stringify({
                data,
                timestamp: Date.now()
            }));

            return data;
        } catch (error) {
            console.error(`Error fetching ${endpoint}:`, error);
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

    getEnergy(startDate, endDate, timeUnit = 'DAY') {
        return this.fetch('energy', { startDate, endDate, timeUnit });
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
