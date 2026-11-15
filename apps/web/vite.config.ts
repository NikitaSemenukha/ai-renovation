import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Доступ к dev-серверу через туннель ngrok для показа прототипа
    allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app', '.ngrok.dev'],
    // API (apps/server): ключ ИИ живёт только там
    proxy: { '/api': 'http://localhost:8787' },
  },
});
