import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Two separate sites from one project: student app (index.html) and admin dashboard (admin.html).
const adminRewrite = () => ({
  name: 'admin-rewrite',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url && /^\/admin(\/|\?|$)/.test(req.url)) req.url = '/admin.html';
      next();
    });
  },
  configurePreviewServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url && /^\/admin(\/|\?|$)/.test(req.url)) req.url = '/admin.html';
      next();
    });
  },
});

export default defineConfig({
  plugins: [react(), adminRewrite()],
  server: { port: 5173, proxy: { '/api': { target: process.env.VITE_PROXY_TARGET || 'http://localhost:5000', changeOrigin: true } } },
  build: { rollupOptions: { input: { student: resolve(__dirname, 'index.html'), admin: resolve(__dirname, 'admin.html') } } },
});
