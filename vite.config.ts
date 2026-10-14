import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

// Production-only CSP (the dev server needs inline scripts for HMR).
const csp: Plugin = {
  name: 'inject-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace(
      '<!--CSP-->',
      `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'" />`,
    ),
}

export default defineConfig({
  base: './',
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  plugins: [
    react(),
    csp,
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: { build: { rollupOptions: { external: ['pg', 'pg-native'] } } },
      },
      preload: { input: 'electron/preload.ts' },
    }),
  ],
})
