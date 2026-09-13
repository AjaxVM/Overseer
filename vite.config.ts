import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { overseer } from './src/backend'

const overseerInstance = overseer()

const port = overseerInstance.config.port || 11111

console.log(`Serving on port: ${port}. To change port, set "port" in ~/overseer.config.json and restart server.`)

export default defineConfig({
  plugins: [solidPlugin(), overseerInstance.plugin],
  server: { port: overseerInstance.config.port || 11111, fs: { strict: false } }
});