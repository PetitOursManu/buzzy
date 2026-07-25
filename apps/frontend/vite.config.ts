import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Le frontend est servi par le backend en production. En développement,
// le proxy redirige /api vers le backend Express (port 3000).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
