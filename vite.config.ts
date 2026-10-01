import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

import { getOrInitOverseerGlobalConfig } from './src/backend/config.ts';

// Keeps the app on the same URL as `npm start`, with the dev API one port up
// (see src/backend/index.ts --api-only).
const appPort = getOrInitOverseerGlobalConfig().port || 11111;

export default defineConfig({
  plugins: [solidPlugin()],
  server: {
    port: appPort,
    // Falling forward to the next free port would land on the API's port.
    strictPort: true,
    proxy: { '/api': `http://localhost:${appPort + 1}` }
  }
});
