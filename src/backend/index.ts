import fs from 'fs';
import type { ServerResponse } from 'http';
import path from 'path';

import fastifyStatic from '@fastify/static';
import { watch } from 'chokidar';
import Fastify from 'fastify';
import type { FastifyError } from 'fastify';

import { getOrInitOverseerGlobalConfig, getOrInitRepoConfig } from './config.ts';
import type { RepoConfig } from './config.ts';
import { loadOrTrueUpProject } from './manifest.ts';
import { attachmentRoutes } from './routes/attachments.ts';
import { fileRoutes } from './routes/files.ts';
import { projectRoutes } from './routes/projects.ts';
import { ensureRepoScaffold, repoRoutes } from './routes/repos.ts';
import type { RouteContext } from './types.ts';

const globalConfig = getOrInitOverseerGlobalConfig();
const appPort = globalConfig.port || 11111;
// `npm run dev` passes this. Vite then owns the app port (see vite.config.ts) and
// proxies /api to the next one up, and a stale dist/ from an earlier build isn't served.
const apiOnly = process.argv.includes('--api-only');
const port = apiOnly ? appPort + 1 : appPort;
const clientDist = path.join(import.meta.dirname, '../../dist');

const app = Fastify({ bodyLimit: 10 * 1024 * 1024 });

app.setErrorHandler((err: FastifyError, _request, reply) => {
  reply.code(err.statusCode ?? 400).send({ error: err.message });
});

const sseClients = new Set<ServerResponse>();
const broadcast = () => {
  for (const client of sseClients) client.write('event: projects-update\ndata: {}\n\n');
};

app.get('/api/events', (request, reply) => {
  reply.hijack();
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  // Flushes headers immediately so EventSource reports open before the first broadcast.
  reply.raw.write(':\n\n');
  sseClients.add(reply.raw);
  request.raw.on('close', () => sseClients.delete(reply.raw));
});

const watchedRepoRoots = new Set<string>();
const watcher = watch([], {
  ignoreInitial: true,
  ignored: file => file.includes('.git') || file.includes('node_modules')
});

const watchRepo = (repoRoot: string) => {
  const repoConfig = getOrInitRepoConfig(repoRoot);
  watchedRepoRoots.add(repoRoot);
  watcher.add([
    path.join(repoRoot, repoConfig.docsDir),
    path.join(repoRoot, repoConfig.projectsDir),
    path.join(repoRoot, 'overseer.json')
  ]);
};

for (const repoRoot of globalConfig.projectRoots || []) {
  ensureRepoScaffold(repoRoot, getOrInitRepoConfig(repoRoot));
  watchRepo(repoRoot);
}

// GET /api/project serves the cached manifest without touching disk beyond one
// JSON read (see routes/projects.ts) - this is what actually keeps that cache
// fresh, off the request path, so navigation is never blocked on a readdir/stat
// walk. Directories touched during the debounce window are queued and trued up
// just before the projects-update broadcast fires.
let watcherTimeout: NodeJS.Timeout | null = null;
const pendingTrueUps = new Map<string, RepoConfig>();

watcher.on('all', (_event, file) => {
  const matchedRepo = Array.from(watchedRepoRoots).find(repoRoot => {
    const repoConfig = getOrInitRepoConfig(repoRoot);
    return (
      file.startsWith(path.join(repoRoot, repoConfig.docsDir)) ||
      file.startsWith(path.join(repoRoot, repoConfig.projectsDir)) ||
      file === path.join(repoRoot, 'overseer.json')
    );
  });
  if (!matchedRepo) return;

  const repoConfig = getOrInitRepoConfig(matchedRepo);
  const projectsRoot = path.join(matchedRepo, repoConfig.projectsDir);
  if (file.startsWith(projectsRoot) && file !== projectsRoot) {
    pendingTrueUps.set(path.dirname(file), repoConfig);
  }

  if (watcherTimeout) clearTimeout(watcherTimeout);
  watcherTimeout = setTimeout(() => {
    for (const [dir, cfg] of pendingTrueUps) {
      try {
        loadOrTrueUpProject(dir, cfg, { persist: false });
      } catch (e) {
        // Best-effort background refresh - a live nav request still falls back
        // to a synchronous true-up if nothing is cached yet for that directory.
      }
    }
    pendingTrueUps.clear();
    broadcast();
  }, 150);
});

const ctx: RouteContext = { watchedRepoRoots, watchRepo, broadcast };
projectRoutes(app, ctx);
fileRoutes(app);
attachmentRoutes(app, ctx);
repoRoutes(app, ctx);

if (!apiOnly && fs.existsSync(clientDist)) {
  app.register(fastifyStatic, { root: clientDist });
}

await app.listen({ port, host: 'localhost' });

if (apiOnly) {
  console.log(`Overseer API on http://localhost:${port}. Open the app at http://localhost:${appPort}.`);
} else {
  console.log(`Overseer on http://localhost:${port}. To change port, set "port" in ~/.overseer.config.json and restart.`);
}
