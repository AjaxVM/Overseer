import fs from 'fs';
import path from 'path';

import type { FastifyInstance } from 'fastify';

import { GLOBAL_CONFIG_PATH, getOrInitOverseerGlobalConfig, getOrInitRepoConfig } from '../config.ts';
import type { FrontmatterFieldConfig, RepoConfig } from '../config.ts';
import { loadOrTrueUpProject } from '../manifest.ts';
import type { RouteContext } from '../types.ts';

// Ensures a repo's docs/projects folders exist, and trues up the projects root's
// manifest against disk. Runs before the file watcher attaches, so a freshly
// cloned repo (no _project.json anywhere) still gets scanned on startup.
export function ensureRepoScaffold(repoRoot: string, repoConfig: RepoConfig) {
  const docsPath = path.join(repoRoot, repoConfig.docsDir);
  const projectsPath = path.join(repoRoot, repoConfig.projectsDir);

  if (!fs.existsSync(docsPath)) fs.mkdirSync(docsPath, { recursive: true });
  if (!fs.existsSync(projectsPath)) fs.mkdirSync(projectsPath, { recursive: true });

  // True up each top-level project dir's own manifest first, so a pre-existing project
  // folder (fresh clone, manually created dir) gets its _project.json eagerly instead of
  // only on first individual visit - without this, reorder writes silently no-op in
  // /api/project/reorder for any top-level project never yet navigated into.
  fs.readdirSync(projectsPath, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
    .forEach(entry => {
      loadOrTrueUpProject(path.join(projectsPath, entry.name), repoConfig);
    });

  loadOrTrueUpProject(projectsPath, repoConfig);

  return { docsPath, projectsPath };
}

export function repoRoutes(app: FastifyInstance, ctx: RouteContext) {
  // Backs the in-app folder browser in the Register Repository modal. Replaces the old
  // PowerShell/WinForms FolderBrowserDialog spawn, which took a couple of seconds to open
  // (process spawn + WinForms assembly load) and could open behind the browser window.
  // With no path given, starts at the directory the server was launched from - that's
  // almost always the most useful starting point (usually a sibling of the repo to register).
  app.get<{ Querystring: { path?: string } }>('/api/fs/browse', async request => {
    const targetPath = request.query.path || process.cwd();

    if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isDirectory()) {
      throw new Error('Not a valid directory');
    }

    let directories: { name: string; path: string }[] = [];
    try {
      directories = fs
        .readdirSync(targetPath, { withFileTypes: true })
        .filter(e => e.isDirectory() && !e.name.startsWith('.'))
        .map(e => ({ name: e.name, path: path.join(targetPath, e.name) }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
      // Permission-denied directories etc. - show an empty listing rather than erroring the whole browse.
    }

    const root = path.parse(targetPath).root;
    const parent = targetPath === root ? null : path.dirname(targetPath);

    return { path: targetPath, parent, directories };
  });

  app.post<{
    Body: { repoPath?: string; docsDir?: string; projectsDir?: string; frontmatterSchema?: FrontmatterFieldConfig[] };
  }>('/api/config/save', async request => {
    const { repoPath, docsDir, projectsDir, frontmatterSchema } = request.body;
    if (!repoPath) throw new Error('Repo path required');

    const repoConfigPath = path.join(repoPath, 'overseer.json');
    let existing = {};
    if (fs.existsSync(repoConfigPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(repoConfigPath, 'utf-8'));
      } catch (e) {}
    }

    const updatedConfig = {
      ...existing,
      docsDir: docsDir || 'docs',
      projectsDir: projectsDir || 'projects',
      frontmatterSchema: frontmatterSchema || []
    };

    fs.writeFileSync(repoConfigPath, JSON.stringify(updatedConfig, null, 2) + '\n', 'utf-8');
    ctx.broadcast();
    return { success: true };
  });

  app.post<{ Body: { repoPath: string } }>('/api/projects/add', async request => {
    const resolvedRepoRoot = path.resolve(request.body.repoPath);

    ensureRepoScaffold(resolvedRepoRoot, getOrInitRepoConfig(resolvedRepoRoot));

    const currentGlobalConfig = getOrInitOverseerGlobalConfig();
    if (!currentGlobalConfig.projectRoots.includes(resolvedRepoRoot)) {
      currentGlobalConfig.projectRoots.push(resolvedRepoRoot);
      fs.writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify(currentGlobalConfig, null, 2), 'utf-8');
    }

    ctx.watchRepo(resolvedRepoRoot);
    ctx.broadcast();
    return { success: true, repoPath: resolvedRepoRoot };
  });
}
