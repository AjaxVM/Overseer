import fs from 'fs';
import path from 'path';
import { GLOBAL_CONFIG_PATH, getOrInitOverseerGlobalConfig, getOrInitRepoConfig } from '../config';
import type { RepoConfig } from '../config';
import { loadOrTrueUpProject } from '../manifest';
import type { RouteContext } from '../types';

// Backs the in-app folder browser in the Register Repository modal. Replaces the old
// PowerShell/WinForms FolderBrowserDialog spawn, which took a couple of seconds to open
// (process spawn + WinForms assembly load) and could open behind the browser window.
// With no path given, starts at the directory the dev server was launched from - that's
// almost always the most useful starting point (usually a sibling of the repo to register).
export function handleGetFsBrowse(req: any, res: any) {
  const urlObj = new URL(req.url, 'http://localhost');
  const requested = urlObj.searchParams.get('path') || '';
  const targetPath = requested || process.cwd();

  if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isDirectory()) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'Not a valid directory' }));
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

  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ path: targetPath, parent, directories }));
}

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
  // only on first individual visit - without this, childOrder writes silently no-op in
  // handlePostProjectReorder for any top-level project never yet navigated into.
  fs.readdirSync(projectsPath, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
    .forEach(entry => {
      loadOrTrueUpProject(path.join(projectsPath, entry.name), repoConfig);
    });

  loadOrTrueUpProject(projectsPath, repoConfig);

  return { docsPath, projectsPath };
}

export function handlePostConfigSave(ctx: RouteContext, req: any, res: any) {
  let reqBody = '';
  req.on('data', (chunk: string) => {
    reqBody += chunk;
  });
  req.on('end', () => {
    try {
      const { repoPath, docsDir, projectsDir, frontmatterSchema } = JSON.parse(reqBody);
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
      ctx.server.ws.send({ type: 'custom', event: 'projects-update' });

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true }));
    } catch (e: any) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: e.message }));
    }
  });
}

export function handlePostProjectsAdd(ctx: RouteContext, req: any, res: any) {
  let body = '';
  req.on('data', (chunk: string) => {
    body += chunk;
  });
  req.on('end', () => {
    try {
      const { repoPath } = JSON.parse(body);
      const resolvedRepoRoot = path.resolve(repoPath);

      const repoConfig = getOrInitRepoConfig(resolvedRepoRoot);
      const { docsPath, projectsPath } = ensureRepoScaffold(resolvedRepoRoot, repoConfig);

      const currentGlobalConfig = getOrInitOverseerGlobalConfig();
      if (!currentGlobalConfig.projectRoots.includes(resolvedRepoRoot)) {
        currentGlobalConfig.projectRoots.push(resolvedRepoRoot);
        fs.writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify(currentGlobalConfig, null, 2), 'utf-8');
      }

      ctx.watchedRepoRoots.add(resolvedRepoRoot);
      ctx.server.watcher.add(docsPath);
      ctx.server.watcher.add(projectsPath);
      ctx.server.watcher.add(path.join(resolvedRepoRoot, 'overseer.json'));
      ctx.server.ws.send({ type: 'custom', event: 'projects-update' });

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, repoPath: resolvedRepoRoot }));
    } catch (e: any) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: e.message }));
    }
  });
}
