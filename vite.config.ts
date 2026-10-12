import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const serverPort = Number(process.env.PORT ?? 3001);

export default defineConfig({
  plugins: [react()],
  root: 'src/client',
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)) },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': `http://localhost:${serverPort}`,
      '/socket.io': { target: `http://localhost:${serverPort}`, ws: true },
    },
  },
  build: {
    outDir: fileURLToPath(new URL('./dist/client', import.meta.url)),
    emptyOutDir: true,
    // bibliothèques dans des fichiers séparés : mises en cache par le navigateur d'une version du jeu à l'autre
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/three/')) return 'three';
          if (id.includes('/react') || id.includes('/scheduler/') || id.includes('/zustand/')) return 'react';
          if (id.includes('@supabase') || id.includes('socket.io') || id.includes('engine.io')) return 'net';
          return 'vendor';
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
});
