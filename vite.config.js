import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  build: { rollupOptions: { output: { manualChunks(id) {
    if (id.includes('node_modules')) return 'vendor';
    if (id.includes('.generated.js')) return 'patch-data';
  } } } },
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
