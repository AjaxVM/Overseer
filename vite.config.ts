import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { overseerApiPlugin } from './src/server/overseerApiPlugin'

const overseerApiPluginInstance = overseerApiPlugin()

const port = overseerApiPluginInstance.config.port || 11111

console.log(`Serving on port: ${port}. To change port, set "port" in ~/overseer.config.json and restart server.`)

export default defineConfig({
  plugins: [solidPlugin(), overseerApiPluginInstance.plugin],
  server: { port: overseerApiPluginInstance.config.port || 11111, fs: { strict: false } }
});