import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: resolve(here),
  plugins: [react()],
  server: {host: '0.0.0.0', allowedHosts: ['terminal.local'], proxy: {'/api': 'http://127.0.0.1:8787'}},
  preview: {host: '0.0.0.0', allowedHosts: ['terminal.local']},
  build: {outDir: 'dist', emptyOutDir: true, sourcemap: true},
});
