import path from 'path';
import { getOrInitOverseerGlobalConfig, getOrInitRepoConfig } from './config';
import type { RepoConfig } from './config';
import { loadOrTrueUpProject } from './manifest';
import {
  handleGetProjects,
  handleGetProject,
  handlePostProjectDescription,
  handlePostProjectReorder,
  handlePostItemCreate,
  handlePostItemDelete
} from './routes/projects';
import { handleGetFileRead, handlePostFileSave } from './routes/files';
import {
  ensureRepoScaffold,
  handleGetFsBrowse,
  handlePostConfigSave,
  handlePostProjectsAdd
} from './routes/repos';
import type { RouteContext } from './types';

export function overseer() {
  const globalConfig = getOrInitOverseerGlobalConfig();

  return {
    config: globalConfig,
    plugin: {
      name: 'overseer-api',
      configureServer(server: any) {
        const watchedRepoRoots = new Set<string>(globalConfig.projectRoots || []);

        watchedRepoRoots.forEach(repoRoot => {
          const repoConfig = getOrInitRepoConfig(repoRoot);
          const { docsPath, projectsPath } = ensureRepoScaffold(repoRoot, repoConfig);

          server.watcher.add(docsPath);
          server.watcher.add(projectsPath);
          server.watcher.add(path.join(repoRoot, 'overseer.json'));
        });

        // GET /api/project serves the cached manifest without touching disk beyond one
        // JSON read (see routes/projects.ts) - this is what actually keeps that cache
        // fresh, off the request path, so navigation is never blocked on a readdir/stat
        // walk. Directories touched during the debounce window are queued and trued up
        // just before the projects-update broadcast fires.
        let watcherTimeout: NodeJS.Timeout | null = null;
        const pendingTrueUps = new Map<string, RepoConfig>();

        server.watcher.on('all', (_event: string, file: string) => {
          if (file.includes('.git') || file.includes('node_modules')) return;

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
                loadOrTrueUpProject(dir, cfg);
              } catch (e) {
                // Best-effort background refresh - a live nav request still falls back
                // to a synchronous true-up if nothing is cached yet for that directory.
              }
            }
            pendingTrueUps.clear();
            server.ws.send({ type: 'custom', event: 'projects-update', file });
          }, 150);
        });

        server.middlewares.use((req: any, res: any, next: any) => {
          const ctx: RouteContext = { watchedRepoRoots, server };

          if (req.url === '/api/projects' && req.method === 'GET') return handleGetProjects(ctx, req, res);
          if (req.url.startsWith('/api/project?') && req.method === 'GET') return handleGetProject(ctx, req, res);
          if (req.url === '/api/project/description' && req.method === 'POST') return handlePostProjectDescription(req, res);
          if (req.url === '/api/project/reorder' && req.method === 'POST') return handlePostProjectReorder(req, res);
          if (req.url.startsWith('/api/file/read') && req.method === 'GET') return handleGetFileRead(req, res);
          if (req.url === '/api/file/save' && req.method === 'POST') return handlePostFileSave(req, res);
          if (req.url === '/api/item/create' && req.method === 'POST') return handlePostItemCreate(ctx, req, res);
          if (req.url === '/api/item/delete' && req.method === 'POST') return handlePostItemDelete(ctx, req, res);
          if (req.url === '/api/config/save' && req.method === 'POST') return handlePostConfigSave(ctx, req, res);
          if (req.url.startsWith('/api/fs/browse') && req.method === 'GET') return handleGetFsBrowse(req, res);
          if (req.url === '/api/projects/add' && req.method === 'POST') return handlePostProjectsAdd(ctx, req, res);

          next();
        });
      }
    }
  };
}
