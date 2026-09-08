import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: 'dist',
  resolve: { alias: { three: fileURLToPath(new URL('./dist/vendor/three.module.js', import.meta.url)) } },
  server: { host: '0.0.0.0', allowedHosts: ['terminal.local'] },
});
