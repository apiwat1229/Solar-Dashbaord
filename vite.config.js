import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        proxy: {
            '/solaredge': {
                target: 'https://monitoringapi.solaredge.com',
                changeOrigin: true,
                secure: false,
                rewrite: (path) => path.replace(/^\/solaredge/, '')
            }
        }
    }
});
