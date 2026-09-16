import fs from 'fs';
import os from 'os';
import path from 'path';
import { exec } from 'child_process';
import { GLOBAL_CONFIG_PATH, getOrInitOverseerGlobalConfig, getOrInitRepoConfig } from '../config';
import type { RepoConfig } from '../config';
import { readRawProjectManifest, saveProjectManifest } from '../manifest';
import type { RouteContext } from '../types';

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

// Ensures a repo's docs/projects folders exist, and that the projects root has
// its own manifest so it shows a friendly name instead of the raw folder name
// once it's used as a landing view.
export function ensureRepoScaffold(repoRoot: string, repoConfig: RepoConfig) {
  const docsPath = path.join(repoRoot, repoConfig.docsDir);
  const projectsPath = path.join(repoRoot, repoConfig.projectsDir);

  if (!fs.existsSync(docsPath)) fs.mkdirSync(docsPath, { recursive: true });
  if (!fs.existsSync(projectsPath)) fs.mkdirSync(projectsPath, { recursive: true });

  if (!readRawProjectManifest(projectsPath)) {
    saveProjectManifest(projectsPath, {
      name: path.basename(repoRoot),
      projectmap: { tickets: [], subprojects: [] }
    });
  }

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

export function handlePostDialogPickFolder(_req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  openNativeFolderPicker()
    .then(folderPath => res.end(JSON.stringify({ folderPath })))
    .catch(err => {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: err.message }));
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
