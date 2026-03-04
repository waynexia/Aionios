import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: [
      'shiki/bundle/web',
      '@xterm/xterm',
      '@xterm/addon-fit',
      '@xterm/addon-web-links'
    ]
  },
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts']
  }
});
