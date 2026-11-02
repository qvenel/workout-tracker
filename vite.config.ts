import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Dev only: serves a local copy of the data repo under /__local-data/ so the UI can be
 * exercised without a GitHub token. Point LOCAL_DATA_DIR at a scratch copy, never at
 * the real clone: "commits" overwrite files there.
 */
function localData(): Plugin {
  const root = path.resolve(process.env.LOCAL_DATA_DIR ?? '.local-data');
  return {
    name: 'local-data',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__local-data', (req, res) => {
        const rel = decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\/+/, '');
        if (req.method === 'POST' && rel === '__commit') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', () => {
            const { files } = JSON.parse(body) as { files: { path: string; content: string }[] };
            for (const f of files) {
              const p = path.join(root, f.path);
              fs.mkdirSync(path.dirname(p), { recursive: true });
              fs.writeFileSync(p, f.content);
            }
            res.end('{}');
          });
          return;
        }
        const p = path.join(root, rel);
        if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.end(fs.readFileSync(p));
      });
    },
  };
}

export default defineConfig({
  base: '/workout-tracker/',
  plugins: [
    preact(),
    localData(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Workout Tracker',
        short_name: 'Workout',
        description: 'Log calisthenics workouts',
        lang: 'fr',
        start_url: '/workout-tracker/',
        scope: '/workout-tracker/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F4F5F3',
        theme_color: '#F4F5F3',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallbackDenylist: [/^\/__local-data/],
      },
    }),
  ],
});
