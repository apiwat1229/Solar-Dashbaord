import { defineConfig } from 'vite';

export default defineConfig({
    base: './',
    server: {
        port: 5173,
        strictPort: true, // Fail if port is busy
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
