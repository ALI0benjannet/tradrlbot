import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Base relative pour qu'Electron charge les assets depuis file://
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
