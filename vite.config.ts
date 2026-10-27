import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.GITLIB_PORT ?? 4817);

export default defineConfig({
  root: fileURLToPath(new URL('./src/client', import.meta.url)),
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('./dist/client', import.meta.url)),
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${port}`,
        // Модули клиента src/client/api/*.ts тоже начинаются с /api — их отдаёт Vite, а не сервер.
        bypass: (req) => (/\.tsx?(\?|$)/.test(req.url ?? '') ? req.url : undefined),
      },
      '/avatars': `http://localhost:${port}`,
    },
  },
});
