import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    // NOTE: GEMINI_API_KEY is intentionally NOT injected into the client bundle here.
    // No code in src/ currently calls the Gemini API - the dependency/env var were
    // leftover AI Studio scaffolding. If an AI-assisted feature is built later, call it
    // through an authenticated Firebase Cloud Function that holds the key server-side,
    // never via a build-time `define` (which would ship the secret inside the compiled
    // app - a real risk once this is packaged as an iOS/Android binary).
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.png'],
        manifest: {
          name: 'Railway Signalling Logbook',
          short_name: 'Signalling Logbook',
          description: 'Digital logbook for railway signalling professionals to track work history, equipment maintenance, and certifications.',
          theme_color: '#0f2a4a',
          background_color: '#ffffff',
          display: 'standalone',
          start_url: '/',
          icons: [
            // TODO: replace with real branded icon assets (192x192 and 512x512 PNG,
            // plus a maskable variant) before relying on this for install prompts.
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
