import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API runs on :5000 and Vite proxies /api to it, so the session cookie stays
// first-party and no CORS setup is needed.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:5000' } },
  build: { outDir: 'dist', sourcemap: false },
});
