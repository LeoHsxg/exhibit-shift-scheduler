import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // firebase.ts 用 top-level await 讀取 Hosting 自動提供的設定
    target: 'es2022',
    // exceljs 很大，但只在按「匯出 Excel」時才載入
    chunkSizeWarningLimit: 1000,
  },
});
