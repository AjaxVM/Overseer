import fs from 'fs';
import path from 'path';
import { DEFAULT_REPO_CONFIG, getOrInitRepoConfig } from '../config';
import type { RepoConfig } from '../config';
import {
  loadOrTrueUpProject,
  readRawProjectManifest,
  saveProjectManifest,
  buildShallowManifest,
  generateShortId,
  stringifyFrontmatter,
  syncTicketToManifest,
  reorderByKeys
} from '../manifest';
import type { RouteContext } from '../types';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function getNextTicketNumber(parentDir: string): number {
  if (!fs.existsSync(parentDir)) return 1;
  const entries = fs.readdirSync(parentDir, { withFileTypes: true });
  const files = entries
    .filter(entry => entry.isFile())
    .filter(entry => entry.name.toLowerCase().endsWith('.md'))
    .map(entry => entry.name);
  if (files.length === 0) {
    return 1;
  }
  const numbers = files
    .map(entry => parseInt(entry.split('-')[0], 10))
    .filter(n => !isNaN(n));
  if (numbers.length === 0) return 1;
  const latestFile = Math.max(...numbers);
  return Math.max(latestFile + 1, files.length + 1);
}

function generateHierarchicalTicketId(
  parentDir: string,
  repoRoot: string,
  repoConfig: RepoConfig,
  ticketNumber: number
): string {
  const projectsPath = path.join(repoRoot, repoConfig.projectsDir);
  const docsPath = path.join(repoRoot, repoConfig.docsDir);

  let relativePath = '';
  if (parentDir.startsWith(projectsPath)) {
    relativePath = path.relative(projectsPath, parentDir);
  } else if (parentDir.startsWith(docsPath)) {
    relativePath = path.relative(docsPath, parentDir);
  } else {
    relativePath = path.relative(repoRoot, parentDir);
  }

  const parentSegments = relativePath.split(path.sep).filter(Boolean).map(slugify);
  const idParts = [...parentSegments, String(ticketNumber)];
  return idParts.join('-');
}

function scanCategoryDirectory(categoryPath: string, isProjects: boolean): any[] {
  if (!fs.existsSync(categoryPath)) return [];
  const entries = fs.readdirSync(categoryPath, { withFileTypes: true });

  if (isProjects) {
    // For projects category: scan top-level projects shallowly
    return entries
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(entry => {
        const fullPath = path.join(categoryPath, entry.name);
        const manifest = readRawProjectManifest(fullPath);
        return {
          name: manifest?.name || entry.name,
          slug: entry.name,
          type: 'directory',
          path: fullPath,
          projectData: manifest,
          hasManifest: !!manifest,
          children: [] // Shallow! Detailed items loaded via /api/project
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } else {
    // For docs category: scan docs and subfolders
    return entries
      .filter(entry => (entry.isDirectory() && !entry.name.startsWith('.')) || entry.name.toLowerCase().endsWith('.md'))
      .map(entry => {
        const fullPath = path.join(categoryPath, entry.name);
        if (entry.isDirectory()) {
          return {
            name: entry.name,
            type: 'directory',
            path: fullPath,
            children: scanCategoryDirectory(fullPath, false)
          };
        } else {
          return {
            name: entry.name,
            type: 'file',
            path: fullPath
          };
        }
      });
  }
}

export function handleGetProjects(ctx: RouteContext, _req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  const combinedTree = Array.from(ctx.watchedRepoRoots).map(repoRoot => {
    const repoConfig = getOrInitRepoConfig(repoRoot);
    const docsPath = path.join(repoRoot, repoConfig.docsDir);
    const projectsPath = path.join(repoRoot, repoConfig.projectsDir);

    return {
      name: path.basename(repoRoot),
      type: 'repository',
      repoPath: repoRoot,
      config: repoConfig,
      children: [
        {
          name: repoConfig.docsDir,
          type: 'category',
          categoryType: 'docs',
          path: docsPath,
          children: scanCategoryDirectory(docsPath, false)
        },
        {
          name: repoConfig.projectsDir,
          type: 'category',
          categoryType: 'projects',
          path: projectsPath,
          children: scanCategoryDirectory(projectsPath, true)
        }
      ]
    };
  });

  return res.end(JSON.stringify(combinedTree));
}

export function handleGetProject(ctx: RouteContext, req: any, res: any) {
  const urlObj = new URL(req.url, 'http://localhost');
  const projectPath = urlObj.searchParams.get('path');
  if (!projectPath || !fs.existsSync(projectPath)) {
    res.statusCode = 404;
    return res.end(JSON.stringify({ error: 'Project path not found' }));
  }

  let targetRepoConfig = DEFAULT_REPO_CONFIG;
  let matchedRepoRoot: string | null = null;
  for (const repoRoot of ctx.watchedRepoRoots) {
    if (projectPath.startsWith(repoRoot)) {
      targetRepoConfig = getOrInitRepoConfig(repoRoot);
      matchedRepoRoot = repoRoot;
      break;
    }
  }

  // Serve the cached manifest as-is - don't block navigation on a live readdir/stat
  // walk of every ticket and sub-project on every request. The file watcher
  // (src/backend/index.ts) trues this up in the background off the request path and
  // pushes a projects-update event when something actually changed. A directory that
  // has never been touched at all has nothing cached yet - serve a cheap filename-only
  // shallow manifest immediately and run the real true-up in the background instead of
  // blocking this response on a full frontmatter-parse walk.
  const cachedManifest = readRawProjectManifest(projectPath);
  const manifest = cachedManifest || buildShallowManifest(projectPath);
  if (!cachedManifest) {
    setImmediate(() => {
      try {
        loadOrTrueUpProject(projectPath, targetRepoConfig);
      } catch (e) {
        // Best-effort background true-up - the shallow manifest already served this request.
      }
      ctx.server.ws.send({ type: 'custom', event: 'projects-update' });
    });
  }

  let description = '';
  const descFile =
    manifest.descriptionFile ||
    (fs.existsSync(path.join(projectPath, '_project.md')) ? '_project.md' : null);
  if (descFile) {
    const descPath = path.join(projectPath, descFile);
    if (fs.existsSync(descPath)) {
      try {
        description = fs.readFileSync(descPath, 'utf-8');
      } catch (e) {}
    }
  }

  let parentPath: string | null = null;
  if (matchedRepoRoot) {
    const projectsRoot = path.join(matchedRepoRoot, targetRepoConfig.projectsDir);
    const parentDir = path.dirname(projectPath);
    // The projects root itself is a valid landing node - only suppress the "up"
    // link when we're already there, not merely because a parent equals it.
    if (projectPath !== projectsRoot && parentDir.startsWith(projectsRoot)) {
      parentPath = parentDir;
    }
  }

  res.setHeader('Content-Type', 'application/json');
  return res.end(
    JSON.stringify({
      success: true,
      path: projectPath,
      repoPath: matchedRepoRoot,
      parentPath,
      manifest,
      description
    })
  );
}

export function handlePostProjectDescription(req: any, res: any) {
  let reqBody = '';
  req.on('data', (chunk: string) => {
    reqBody += chunk;
  });
  req.on('end', () => {
    try {
      const { projectPath, description } = JSON.parse(reqBody);
      if (!projectPath || !fs.existsSync(projectPath)) {
        throw new Error('Valid projectPath required');
      }
      const descPath = path.join(projectPath, '_project.md');
      fs.writeFileSync(descPath, description || '', 'utf-8');

      const manifest = readRawProjectManifest(projectPath);
      if (manifest && manifest.descriptionFile !== '_project.md') {
        manifest.descriptionFile = '_project.md';
        saveProjectManifest(projectPath, manifest);
      }

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true }));
    } catch (e: any) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: e.message }));
    }
  });
}

// ticketOrder is a list of ticket fileNames, subprojectOrder a list of subproject slugs,
// each in the new desired order - either or both may be sent. Array order in
// projectmap.tickets/subprojects is the order (no separate ordering field - poc/mxskv).
export function handlePostProjectReorder(req: any, res: any) {
  let reqBody = '';
  req.on('data', (chunk: string) => {
    reqBody += chunk;
  });
  req.on('end', () => {
    try {
      const { projectPath, ticketOrder, subprojectOrder } = JSON.parse(reqBody);
      if (!projectPath || !fs.existsSync(projectPath)) {
        throw new Error('Valid projectPath required');
      }
      const manifest = readRawProjectManifest(projectPath);
      if (!manifest) {
        throw new Error('Project manifest not found');
      }
      if (ticketOrder) {
        manifest.projectmap.tickets = reorderByKeys(manifest.projectmap.tickets, ticketOrder, t => t.fileName);
      }
      if (subprojectOrder) {
        manifest.projectmap.subprojects = reorderByKeys(manifest.projectmap.subprojects, subprojectOrder, s => s.slug);
      }
      saveProjectManifest(projectPath, manifest);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true }));
    } catch (e: any) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: e.message }));
    }
  });
}

// Display-name-only rename - the directory slug and every child path stay as-is.
export function handlePostProjectRename(ctx: RouteContext, req: any, res: any) {
  let reqBody = '';
  req.on('data', (chunk: string) => {
    reqBody += chunk;
  });
  req.on('end', () => {
    try {
      const { projectPath, name } = JSON.parse(reqBody);
      if (!projectPath || !fs.existsSync(projectPath) || !name || !String(name).trim()) {
        throw new Error('Valid projectPath and name are required.');
      }
      const manifest = readRawProjectManifest(projectPath);
      if (!manifest) {
        throw new Error('Project manifest not found');
      }
      manifest.name = String(name).trim();
      saveProjectManifest(projectPath, manifest);

      // A sub-project's display name is also cached on its PARENT's manifest (see
      // loadOrTrueUpProject's subManifestCache) - the file watcher only trues up the
      // renamed directory itself (dirname of the changed _project.json), never the
      // parent that lists it, so without this the parent's Sub-projects list keeps
      // showing the old name until something else happens to rescan it.
      const repoRoot = Array.from(ctx.watchedRepoRoots).find(root => projectPath.startsWith(root));
      if (repoRoot) {
        const repoConfig = getOrInitRepoConfig(repoRoot);
        const projectsRoot = path.join(repoRoot, repoConfig.projectsDir);
        const parentDir = path.dirname(projectPath);
        if (parentDir !== projectsRoot && parentDir.startsWith(projectsRoot)) {
          loadOrTrueUpProject(parentDir, repoConfig);
        }
      }

      ctx.server.ws.send({ type: 'custom', event: 'projects-update' });
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ success: true }));
    } catch (e: any) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: e.message }));
    }
  });
}

export function handlePostItemCreate(ctx: RouteContext, req: any, res: any) {
  let reqBody = '';
  req.on('data', (chunk: string) => {
    reqBody += chunk;
  });
  req.on('end', () => {
    try {
      const { parentPath, repoPath, type, name, attributes } = JSON.parse(reqBody);
      if (!parentPath || !repoPath || !name.trim()) {
        throw new Error('parentPath, repoPath, and name are required.');
      }

      const repoConfig = getOrInitRepoConfig(repoPath);
      const itemSlug = slugify(name);

      if (type === 'directory') {
        // Directories are named purely by title slug
        const newDirPath = path.join(parentPath, itemSlug);
        if (fs.existsSync(newDirPath)) {
          throw new Error(`Directory "${itemSlug}" already exists in parent.`);
        }
        fs.mkdirSync(newDirPath, { recursive: true });

        // Save clean project name and projectmap in _project.json
        saveProjectManifest(newDirPath, {
          name: name.trim(),
          projectmap: { tickets: [], subprojects: [] }
        });

        // True up parent project manifest if parent is a project directory
        loadOrTrueUpProject(parentPath, repoConfig);

        ctx.server.ws.send({ type: 'custom', event: 'projects-update' });
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ success: true, createdPath: newDirPath }));
      } else {
        // Tickets: support short-uuid or sequential based on repoConfig.idFormat
        let generatedId = '';
        let fileName = '';

        if (repoConfig.idFormat === 'sequential') {
          const ticketNum = getNextTicketNumber(parentPath);
          generatedId = generateHierarchicalTicketId(parentPath, repoPath, repoConfig, ticketNum);
          fileName = `${ticketNum}-${itemSlug}.md`;
        } else {
          do {
            generatedId = generateShortId();
            fileName = `${generatedId}-${itemSlug}.md`;
          } while (fs.existsSync(path.join(parentPath, fileName)));
        }

        const newFilePath = path.join(parentPath, fileName);
        if (fs.existsSync(newFilePath)) {
          throw new Error(`File "${fileName}" already exists in target directory.`);
        }

        const initialAttributes: Record<string, any> = {
          id: generatedId,
          name
        };
        (repoConfig.frontmatterSchema || []).forEach((field: any) => {
          if (field.name === 'id') return;
          if (field.name === 'name') return;
          initialAttributes[field.name] = attributes?.[field.name] ?? '';
        });

        const initialBody = `# ${name.trim()}\n\nWrite details or specifications here...`;
        const fileContent = stringifyFrontmatter(initialAttributes, initialBody);

        fs.writeFileSync(newFilePath, fileContent, 'utf-8');

        // Update manifest in parent project
        syncTicketToManifest(newFilePath, initialAttributes);

        ctx.server.ws.send({ type: 'custom', event: 'projects-update' });
        res.setHeader('Content-Type', 'application/json');
        return res.end(
          JSON.stringify({ success: true, createdPath: newFilePath, id: generatedId })
        );
      }
    } catch (e: any) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: e.message }));
    }
  });
}

// Deletes a ticket file or a project/sub-project directory, then trues up the parent
// project's manifest so the removed entry disappears immediately rather than waiting on
// the file watcher's debounce window.
export function handlePostItemDelete(ctx: RouteContext, req: any, res: any) {
  let reqBody = '';
  req.on('data', (chunk: string) => {
    reqBody += chunk;
  });
  req.on('end', () => {
    try {
      const { itemPath, type, parentPath, repoPath } = JSON.parse(reqBody);
      if (!itemPath || !fs.existsSync(itemPath)) {
        throw new Error('Valid itemPath required');
      }

      if (type === 'directory') {
        fs.rmSync(itemPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(itemPath);
      }

      if (parentPath && repoPath && fs.existsSync(parentPath)) {
        const repoConfig = getOrInitRepoConfig(repoPath);
        loadOrTrueUpProject(parentPath, repoConfig);
      }

      ctx.server.ws.send({ type: 'custom', event: 'projects-update' });
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ success: true }));
    } catch (e: any) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: e.message }));
    }
  });
}
