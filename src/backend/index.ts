import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { DEFAULT_REPO_CONFIG, getOrInitOverseerGlobalConfig, GLOBAL_CONFIG_PATH } from './config';
import {
  loadOrTrueUpProject,
  syncTicketToManifest,
  readRawProjectManifest,
  saveProjectManifest,
  generateShortId,
  parseFrontmatter,
  stringifyFrontmatter
} from './manifest';

function getOrInitRepoConfig(repoRoot: string) {
  const repoConfigPath = path.join(repoRoot, 'overseer.json');

  if (!fs.existsSync(repoConfigPath)) {
    fs.writeFileSync(repoConfigPath, JSON.stringify(DEFAULT_REPO_CONFIG, null, 2) + '\n', 'utf-8');
    return DEFAULT_REPO_CONFIG;
  }

  try {
    const raw = fs.readFileSync(repoConfigPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      docsDir: parsed.docsDir || DEFAULT_REPO_CONFIG.docsDir,
      projectsDir: parsed.projectsDir || DEFAULT_REPO_CONFIG.projectsDir,
      frontmatterSchema: parsed.frontmatterSchema || DEFAULT_REPO_CONFIG.frontmatterSchema,
      idFormat: parsed.idFormat || (DEFAULT_REPO_CONFIG as any).idFormat || 'short-uuid'
    };
  } catch (e) {
    return DEFAULT_REPO_CONFIG;
  }
}

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
  repoConfig: any,
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

function openNativeFolderPicker(): Promise<string> {
  return new Promise((resolve, reject) => {
    const platform = os.platform();
    let command = '';
    if (platform === 'darwin') {
      command = `osascript -e 'POSIX path of (choose folder with prompt "Select Repository Root")'`;
    } else if (platform === 'win32') {
      command = `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Host $f.SelectedPath }"`;
    } else {
      command = `zenity --file-selection --directory || kdialog --getexistingdirectory`;
    }
    exec(command, (error, stdout) => {
      if (error || !stdout.trim()) reject(new Error('Folder selection cancelled.'));
      else resolve(stdout.trim());
    });
  });
}

export function overseer() {
  const globalConfig = getOrInitOverseerGlobalConfig();

  return {
    config: globalConfig,
    plugin: {
      name: 'overseer-api',
      configureServer(server: any) {
        let watchedRepoRoots = new Set<string>(globalConfig.projectRoots || []);

        watchedRepoRoots.forEach(repoRoot => {
          const repoConfig = getOrInitRepoConfig(repoRoot);
          const docsPath = path.join(repoRoot, repoConfig.docsDir);
          const projectsPath = path.join(repoRoot, repoConfig.projectsDir);

          if (!fs.existsSync(docsPath)) fs.mkdirSync(docsPath, { recursive: true });
          if (!fs.existsSync(projectsPath)) fs.mkdirSync(projectsPath, { recursive: true });

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
          // GET /api/projects (Shallow & Fast)
          if (req.url === '/api/projects' && req.method === 'GET') {
            res.setHeader('Content-Type', 'application/json');
            const combinedTree = Array.from(watchedRepoRoots).map(repoRoot => {
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

          // GET /api/project?path=... (Loads manifest, tickets, sub-projects, and description)
          if (req.url.startsWith('/api/project?') && req.method === 'GET') {
            const urlObj = new URL(req.url, 'http://localhost');
            const projectPath = urlObj.searchParams.get('path');
            if (!projectPath || !fs.existsSync(projectPath)) {
              res.statusCode = 404;
              return res.end(JSON.stringify({ error: 'Project path not found' }));
            }

            let targetRepoConfig = DEFAULT_REPO_CONFIG;
            let matchedRepoRoot: string | null = null;
            for (const repoRoot of watchedRepoRoots) {
              if (projectPath.startsWith(repoRoot)) {
                targetRepoConfig = getOrInitRepoConfig(repoRoot);
                matchedRepoRoot = repoRoot;
                break;
              }
            }

            const manifest = loadOrTrueUpProject(projectPath, targetRepoConfig);

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
              if (parentDir.startsWith(projectsRoot) && parentDir !== projectsRoot) {
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

          // POST /api/project/description
          if (req.url === '/api/project/description' && req.method === 'POST') {
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
            return;
          }

          // POST /api/project/reorder
          if (req.url === '/api/project/reorder' && req.method === 'POST') {
            let reqBody = '';
            req.on('data', (chunk: string) => {
              reqBody += chunk;
            });
            req.on('end', () => {
              try {
                const { projectPath, childOrder } = JSON.parse(reqBody);
                if (!projectPath || !fs.existsSync(projectPath)) {
                  throw new Error('Valid projectPath required');
                }
                const manifest = readRawProjectManifest(projectPath);
                if (manifest) {
                  manifest.childOrder = childOrder;
                  saveProjectManifest(projectPath, manifest);
                }
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true }));
              } catch (e: any) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: e.message }));
              }
            });
            return;
          }

          // GET /api/file/read
          if (req.url.startsWith('/api/file/read') && req.method === 'GET') {
            const urlObj = new URL(req.url, 'http://localhost');
            const filePath = urlObj.searchParams.get('path');
            if (!filePath || !fs.existsSync(filePath)) {
              res.statusCode = 404;
              return res.end(JSON.stringify({ error: 'File not found' }));
            }
            const raw = fs.readFileSync(filePath, 'utf-8');
            const { attributes, body } = parseFrontmatter(raw);
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ path: filePath, attributes, body }));
          }

          // POST /api/file/save
          if (req.url === '/api/file/save' && req.method === 'POST') {
            let reqBody = '';
            req.on('data', (chunk: string) => {
              reqBody += chunk;
            });
            req.on('end', () => {
              try {
                const { path: filePath, attributes, body } = JSON.parse(reqBody);
                if (!filePath) throw new Error('File path required');
                const fileContent = stringifyFrontmatter(attributes, body);
                fs.writeFileSync(filePath, fileContent, 'utf-8');

                // Sync ticket to project manifest!
                if (filePath.toLowerCase().endsWith('.md')) {
                  syncTicketToManifest(filePath, attributes);
                }

                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true }));
              } catch (e: any) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: e.message }));
              }
            });
            return;
          }

          // POST /api/item/create
          if (req.url === '/api/item/create' && req.method === 'POST') {
            let reqBody = '';
            req.on('data', (chunk: string) => {
              reqBody += chunk;
            });
            req.on('end', () => {
              try {
                const { parentPath, repoPath, type, name } = JSON.parse(reqBody);
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

                  server.ws.send({ type: 'custom', event: 'projects-update' });
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
                    if (field.type === 'enum' && field.options?.length > 0) {
                      initialAttributes[field.name] = field.options[0];
                    } else {
                      initialAttributes[field.name] = '';
                    }
                  });

                  const initialBody = `# ${name.trim()}\n\nWrite details or specifications here...`;
                  const fileContent = stringifyFrontmatter(initialAttributes, initialBody);

                  fs.writeFileSync(newFilePath, fileContent, 'utf-8');

                  // Update manifest in parent project
                  syncTicketToManifest(newFilePath, initialAttributes);

                  server.ws.send({ type: 'custom', event: 'projects-update' });
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
            return;
          }

          // POST /api/config/save
          if (req.url === '/api/config/save' && req.method === 'POST') {
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
                server.ws.send({ type: 'custom', event: 'projects-update' });

                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true }));
              } catch (e: any) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: e.message }));
              }
            });
            return;
          }

          // POST /api/dialog/pick-folder
          if (req.url === '/api/dialog/pick-folder' && req.method === 'POST') {
            res.setHeader('Content-Type', 'application/json');
            openNativeFolderPicker()
              .then(folderPath => res.end(JSON.stringify({ folderPath })))
              .catch(err => {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: err.message }));
              });
            return;
          }

          // POST /api/projects/add
          if (req.url === '/api/projects/add' && req.method === 'POST') {
            let body = '';
            req.on('data', (chunk: string) => {
              body += chunk;
            });
            req.on('end', () => {
              try {
                const { repoPath } = JSON.parse(body);
                const resolvedRepoRoot = path.resolve(repoPath);

                const repoConfig = getOrInitRepoConfig(resolvedRepoRoot);
                const docsPath = path.join(resolvedRepoRoot, repoConfig.docsDir);
                const projectsPath = path.join(resolvedRepoRoot, repoConfig.projectsDir);

                if (!fs.existsSync(docsPath)) fs.mkdirSync(docsPath, { recursive: true });
                if (!fs.existsSync(projectsPath)) fs.mkdirSync(projectsPath, { recursive: true });

                const currentGlobalConfig = getOrInitOverseerGlobalConfig();
                if (!currentGlobalConfig.projectRoots.includes(resolvedRepoRoot)) {
                  currentGlobalConfig.projectRoots.push(resolvedRepoRoot);
                  fs.writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify(currentGlobalConfig, null, 2), 'utf-8');
                }

                watchedRepoRoots.add(resolvedRepoRoot);
                server.watcher.add(docsPath);
                server.watcher.add(projectsPath);
                server.watcher.add(path.join(resolvedRepoRoot, 'overseer.json'));
                server.ws.send({ type: 'custom', event: 'projects-update' });

                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, repoPath: resolvedRepoRoot }));
              } catch (e: any) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: e.message }));
              }
            });
            return;
          }

          next();
        });
      }
    }
  };
}