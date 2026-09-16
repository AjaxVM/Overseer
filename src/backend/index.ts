import path from 'path';
import { getOrInitOverseerGlobalConfig, getOrInitRepoConfig } from './config';
import {
  handleGetProjects,
  handleGetProject,
  handlePostProjectDescription,
  handlePostProjectReorder,
  handlePostItemCreate
} from './routes/projects';
import { handleGetFileRead, handlePostFileSave } from './routes/files';
import {
  ensureRepoScaffold,
  handlePostConfigSave,
  handlePostDialogPickFolder,
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

        let watcherTimeout: NodeJS.Timeout | null = null;
        server.watcher.on('all', (_event: string, file: string) => {
          if (file.includes('.git') || file.includes('node_modules')) return;

          const isTracked = Array.from(watchedRepoRoots).some(repoRoot => {
            const repoConfig = getOrInitRepoConfig(repoRoot);
            return (
              file.startsWith(path.join(repoRoot, repoConfig.docsDir)) ||
              file.startsWith(path.join(repoRoot, repoConfig.projectsDir)) ||
              file === path.join(repoRoot, 'overseer.json')
            );
          });

          if (isTracked) {
            if (watcherTimeout) clearTimeout(watcherTimeout);
            watcherTimeout = setTimeout(() => {
              server.ws.send({ type: 'custom', event: 'projects-update', file });
            }, 150);
          }
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
          if (req.url === '/api/config/save' && req.method === 'POST') return handlePostConfigSave(ctx, req, res);
          if (req.url === '/api/dialog/pick-folder' && req.method === 'POST') return handlePostDialogPickFolder(req, res);
          if (req.url === '/api/projects/add' && req.method === 'POST') return handlePostProjectsAdd(ctx, req, res);

          next();
        });
      }
    }
  };
}
