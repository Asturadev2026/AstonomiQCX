import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // API proxy (Phase B): the web app calls /api/v1/* and Vite forwards to NestJS
    proxy: {
      // SSE streaming endpoint — must NOT buffer the response or tokens never reach the browser.
      // selfHandleResponse:true lets us pipe the upstream response directly without any
      // buffering. Without this Vite accumulates the entire SSE body before forwarding it.
      '/api/v1/ai/ask/stream': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        selfHandleResponse: true,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, _req, res) => {
            // Copy status and headers from upstream to client
            res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
            // Pipe the stream directly — no buffering
            proxyRes.pipe(res);
          });
        },
      },
      // All other API calls — standard buffered proxy
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
});
