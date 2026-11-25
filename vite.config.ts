/*vite.config.ts*/

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isProd = mode === 'production';
  const backendPort = env.PORT || env.SERVER_PORT || '3000';
  const devProxyTarget = env.VITE_DEV_PROXY_TARGET || `http://127.0.0.1:${backendPort}`;

  return {
    base: '/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve('.'),
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: false,
      target: 'es2020',
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
              return 'react-vendor';
            }
            if (id.includes('node_modules/lucide-react')) {
              return 'ui-icons';
            }
            if (id.includes('node_modules/xlsx')) {
              return 'excel-export';
            }
            return undefined;
          },
        },
      },
    },
    server: {
      host: env.VITE_DEV_HOST || '0.0.0.0',
      port: Number(env.VITE_DEV_PORT || 3001),
      strictPort: true,
      proxy: {
        '/api': {
          target: devProxyTarget,
          changeOrigin: true,
        },
        '/uploads': {
          target: devProxyTarget,
          changeOrigin: true,
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Preserve this behavior to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Ignore backend runtime data directories so login/audit/store writes never reload the browser.
      watch:
        process.env.DISABLE_HMR === 'true'
          ? null
          : {
              ignored: [
                '**/database/**',
                '**/private_backups/**',
                '**/private_logs/**',
                '**/private_tmp/**',
                '**/uploads/**',
                '**/server/**',
                '**/server.ts',
                '**/tests/**',
                '**/deploy/**',
                '**/docs/**',
              ],
            },
    },
    preview: {
      host: '127.0.0.1',
      port: Number(env.VITE_PREVIEW_PORT || 4173),
      strictPort: true,
    },
    define: {
      __APP_PRODUCTION__: JSON.stringify(isProd),
    },
  };
});
