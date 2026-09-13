import fs, { type Dirent } from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { DEFAULT_REPO_CONFIG, getOrInitOverseerGlobalConfig, GLOBAL_CONFIG_PATH } from './config'

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
      frontmatterSchema: parsed.frontmatterSchema || DEFAULT_REPO_CONFIG.frontmatterSchema
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
  const files = entries.filter(entry => entry.isFile()).filter(entry => entry.name.toLowerCase().endsWith('.md')).map(entry => entry.name)
  if (files.length === 0) {
    return 1
  }
  const latestFile = Math.max(...files.map(entry => parseInt(entry.split('-')[0])))
  return Math.max(latestFile + 1, files.length + 1)
}

function generateHierarchicalTicketId(parentDir: string, repoRoot: string, repoConfig: any, ticketNumber: number): string {
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

function parseFrontmatter(rawContent: string) {
  const match = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { attributes: {}, body: rawContent };
  
  const yamlStr = match[1];
  const body = match[2];
  const attributes: Record<string, any> = {};
  
  yamlStr.split('\n').forEach(line => {
    const colonIdx = line.indexOf(':');
    if (colonIdx !== -1) {
      const key = line.slice(0, colonIdx).trim();
      let val = line.slice(colonIdx + 1).trim();
      if (val.startsWith('[') && val.endsWith(']')) {
        attributes[key] = val.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
      } else {
        attributes[key] = val.replace(/^['"]|['"]$/g, '');
      }
    }
  });
  
  return { attributes, body };
}

function stringifyFrontmatter(attributes: Record<string, any>, body: string) {
  const keys = Object.keys(attributes).filter(k => k.trim().length > 0);
  if (keys.length === 0) return body;
  
  let yaml = '---\n';
  for (const [k, v] of Object.entries(attributes)) {
    if (!k.trim()) continue;
    if (Array.isArray(v)) {
      yaml += `${k}: [${v.join(', ')}]\n`;
    } else {
      yaml += `${k}: ${v}\n`;
    }
  }
  yaml += '---\n';
  return yaml + body;
}

function sortPathChildren (a: Dirent, b: Dirent) {
  const aDir = a.isDirectory()
  const bDir = b.isDirectory()
  if (aDir && !bDir) {
    return -1
  } else if (bDir && !aDir) {
    return 1
  } else if (aDir && bDir) {
    return a.name.localeCompare(b.name)
  }

  // file preference is final
  const aNum = parseInt(a.name.split('-')[0])
  const bNum = parseInt(b.name.split('-')[0])
  return (aNum - bNum)
}

function scanDirectory(dir: string): any[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() || entry.name.toLowerCase().endsWith('.md'))
    .sort(sortPathChildren);
  
  return entries.map(entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      let projectData = null;
      const projectJsonPath = path.join(fullPath, 'project.json');
      
      if (fs.existsSync(projectJsonPath)) {
        try {
          projectData = JSON.parse(fs.readFileSync(projectJsonPath, 'utf-8'));
        } catch (e) {}
      }
      
      return {
        name: entry.name,
        type: 'directory',
        path: fullPath,
        projectData,
        children: scanDirectory(fullPath)
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
      // const globalConfig = getOrInitOverseerGlobalConfig();
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

      server.watcher.on('all', (_event: string, file: string) => {
        const isTracked = Array.from(watchedRepoRoots).some(repoRoot => {
          const repoConfig = getOrInitRepoConfig(repoRoot);
          return file.startsWith(path.join(repoRoot, repoConfig.docsDir)) ||
                 file.startsWith(path.join(repoRoot, repoConfig.projectsDir)) ||
                 file === path.join(repoRoot, 'overseer.json');
        });

        if (isTracked) {
          server.ws.send({ type: 'custom', event: 'projects-update' });
        }
      });

      server.middlewares.use((req: any, res: any, next: any) => {
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
                  children: scanDirectory(docsPath)
                },
                {
                  name: repoConfig.projectsDir,
                  type: 'category',
                  categoryType: 'projects',
                  path: projectsPath,
                  children: scanDirectory(projectsPath)
                }
              ]
            };
          });
          return res.end(JSON.stringify(combinedTree));
        }

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

        if (req.url === '/api/file/save' && req.method === 'POST') {
          let reqBody = '';
          req.on('data', (chunk: string) => { reqBody += chunk; });
          req.on('end', () => {
            try {
              const { path: filePath, attributes, body } = JSON.parse(reqBody);
              if (!filePath) throw new Error('File path required');
              const fileContent = stringifyFrontmatter(attributes, body);
              fs.writeFileSync(filePath, fileContent, 'utf-8');
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
          req.on('data', (chunk: string) => { reqBody += chunk; });
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
                
                // Save clean project name in project.json without ID
                fs.writeFileSync(
                  path.join(newDirPath, 'project.json'),
                  JSON.stringify({ name: name.trim() }, null, 2) + '\n',
                  'utf-8'
                );

                server.ws.send({ type: 'custom', event: 'projects-update' });
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ success: true, createdPath: newDirPath }));
              } else {
                // Tickets are prefixed strictly by next sequential number in folder: <nextNum>-<title-slug>.md
                const ticketNum = getNextTicketNumber(parentPath);
                const generatedId = generateHierarchicalTicketId(parentPath, repoPath, repoConfig, ticketNum);
                const fileName = `${ticketNum}-${itemSlug}.md`;
                
                const newFilePath = path.join(parentPath, fileName);
                if (fs.existsSync(newFilePath)) {
                  throw new Error(`File "${fileName}" already exists in target directory.`);
                }

                const initialAttributes: Record<string, any> = { id: generatedId };
                (repoConfig.frontmatterSchema || []).forEach((field: any) => {
                  if (field.name === 'id') return;
                  if (field.type === 'enum' && field.options?.length > 0) {
                    initialAttributes[field.name] = field.options[0];
                  } else {
                    initialAttributes[field.name] = '';
                  }
                });

                const initialBody = `# ${name.trim()}\n\nWrite details or specifications here...`;
                const fileContent = stringifyFrontmatter(initialAttributes, initialBody);

                fs.writeFileSync(newFilePath, fileContent, 'utf-8');

                server.ws.send({ type: 'custom', event: 'projects-update' });
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ success: true, createdPath: newFilePath, id: generatedId }));
              }
            } catch (e: any) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: e.message }));
            }
          });
          return;
        }

        if (req.url === '/api/config/save' && req.method === 'POST') {
          let reqBody = '';
          req.on('data', (chunk: string) => { reqBody += chunk; });
          req.on('end', () => {
            try {
              const { repoPath, docsDir, projectsDir, frontmatterSchema } = JSON.parse(reqBody);
              if (!repoPath) throw new Error('Repo path required');
              
              const repoConfigPath = path.join(repoPath, 'overseer.json');
              let existing = {};
              if (fs.existsSync(repoConfigPath)) {
                try { existing = JSON.parse(fs.readFileSync(repoConfigPath, 'utf-8')); } catch (e) {}
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

        if (req.url === '/api/projects/add' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: string) => { body += chunk; });
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
  }};
}