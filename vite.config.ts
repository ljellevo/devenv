import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
export default defineConfig({
  root: 'src/renderer', base: './', plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': resolve('src/renderer') } },
  build: { outDir: '../../dist/renderer', emptyOutDir: true },
  server: { host: '127.0.0.1', port: 4783, strictPort: true },
});
