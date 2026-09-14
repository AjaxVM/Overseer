import fs from 'fs';
import path from 'path';

export interface TicketSummary {
  id: string;
  name: string;
  status: string;
  type?: string;
  fileName: string;
  filePath: string;
  mtime: number;
}

export interface SubProjectSummary {
  name: string;
  slug: string;
  path: string;
}

export interface ProjectManifest {
  name: string;
  id?: string;
  descriptionFile?: string;
  childOrder?: string[];
  projectmap: {
    tickets: TicketSummary[];
    subprojects: SubProjectSummary[];
  };
}

export function generateShortId(prefix?: string): string {
  const chars = '23456789abcdefghjkmnpqrstuvwxyz'; // readable base32 without ambiguous characters
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return prefix ? `${prefix}-${code}` : code;
}

export function parseFrontmatter(rawContent: string): { attributes: Record<string, any>; body: string } {
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
        attributes[key] = val
          .slice(1, -1)
          .split(',')
          .map(s => s.trim().replace(/^['"]|['"]$/g, ''));
      } else {
        attributes[key] = val.replace(/^['"]|['"]$/g, '');
      }
    }
  });

  return { attributes, body };
}

export function stringifyFrontmatter(attributes: Record<string, any>, body: string): string {
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

export function getProjectManifestPath(dir: string): string {
  const newManifest = path.join(dir, '_project.json');
  if (fs.existsSync(newManifest)) return newManifest;
  const oldManifest = path.join(dir, 'project.json');
  if (fs.existsSync(oldManifest)) return oldManifest;
  return newManifest;
}

export function readRawProjectManifest(dir: string): ProjectManifest | null {
  const manifestPath = getProjectManifestPath(dir);
  if (!fs.existsSync(manifestPath)) return null;

  try {
    const raw = fs.readFileSync(manifestPath, 'utf-8');
    const data = JSON.parse(raw);
    return {
      name: data.name || path.basename(dir),
      id: data.id,
      descriptionFile:
        data.descriptionFile ||
        (fs.existsSync(path.join(dir, '_project.md'))
          ? '_project.md'
          : fs.existsSync(path.join(dir, 'description.md'))
          ? 'description.md'
          : undefined),
      childOrder: data.childOrder || [],
      projectmap: data.projectmap || { tickets: [], subprojects: [] }
    };
  } catch (e) {
    return null;
  }
}

export function saveProjectManifest(dir: string, manifest: ProjectManifest): void {
  // Always write to _project.json to adhere to POC 15 proposal
  const targetPath = path.join(dir, '_project.json');
  fs.writeFileSync(targetPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
}

export function loadOrTrueUpProject(projectDir: string, _repoConfig?: any): ProjectManifest {
  if (!fs.existsSync(projectDir)) {
    return {
      name: path.basename(projectDir),
      projectmap: { tickets: [], subprojects: [] }
    };
  }

  const existingManifest = readRawProjectManifest(projectDir) || {
    name: path.basename(projectDir),
    projectmap: { tickets: [], subprojects: [] }
  };

  const cachedTicketsMap = new Map<string, TicketSummary>();
  (existingManifest.projectmap?.tickets || []).forEach(ticket => {
    cachedTicketsMap.set(ticket.fileName, ticket);
  });

  const entries = fs.readdirSync(projectDir, { withFileTypes: true });

  // 1. Detect subprojects
  const subprojects: SubProjectSummary[] = [];
  entries
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
    .forEach(entry => {
      const subDirPath = path.join(projectDir, entry.name);
      let subName = entry.name;
      const subManifest = readRawProjectManifest(subDirPath);
      if (subManifest?.name) {
        subName = subManifest.name;
      }
      subprojects.push({
        name: subName,
        slug: entry.name,
        path: subDirPath
      });
    });

  // 2. Detect tickets (.md files excluding _project.md / description.md / notes.md / comments.md)
  const ignoredFiles = new Set(['_project.md', 'description.md', 'notes.md', 'comments.md']);
  const ticketFiles = entries.filter(
    entry =>
      entry.isFile() &&
      entry.name.toLowerCase().endsWith('.md') &&
      !ignoredFiles.has(entry.name.toLowerCase())
  );

  let hasChanges = false;
  const updatedTickets: TicketSummary[] = [];

  ticketFiles.forEach(fileEntry => {
    const filePath = path.join(projectDir, fileEntry.name);
    try {
      const stat = fs.statSync(filePath);
      const cached = cachedTicketsMap.get(fileEntry.name);

      if (cached && cached.mtime === stat.mtimeMs) {
        updatedTickets.push(cached);
      } else {
        hasChanges = true;
        const raw = fs.readFileSync(filePath, 'utf-8');
        const { attributes, body } = parseFrontmatter(raw);

        const filenameParts = fileEntry.name.replace(/\.md$/i, '').split('-');
        const defaultId = attributes.id || filenameParts[0] || '';
        const defaultName =
          attributes.name ||
          body.split('\n').find(l => l.startsWith('# '))?.slice(2).trim() ||
          filenameParts.slice(1).join(' ') ||
          fileEntry.name;

        const ticketSummary: TicketSummary = {
          id: String(defaultId),
          name: String(defaultName),
          status: attributes.status || 'idea',
          type: attributes.type,
          fileName: fileEntry.name,
          filePath,
          mtime: stat.mtimeMs
        };
        updatedTickets.push(ticketSummary);
      }
    } catch (e) {
      // Skip files that fail to stat or read
    }
  });

  if (updatedTickets.length !== (existingManifest.projectmap?.tickets || []).length) {
    hasChanges = true;
  }
  if (subprojects.length !== (existingManifest.projectmap?.subprojects || []).length) {
    hasChanges = true;
  }

  // Sort tickets based on childOrder if present, else numeric/alphabetical
  const childOrder = existingManifest.childOrder || [];
  if (childOrder.length > 0) {
    const orderMap = new Map<string, number>();
    childOrder.forEach((id, idx) => orderMap.set(id, idx));

    updatedTickets.sort((a, b) => {
      const orderA = orderMap.has(a.id) ? orderMap.get(a.id)! : 999999;
      const orderB = orderMap.has(b.id) ? orderMap.get(b.id)! : 999999;
      if (orderA !== orderB) return orderA - orderB;
      const numA = parseInt(a.fileName.split('-')[0], 10);
      const numB = parseInt(b.fileName.split('-')[0], 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.name.localeCompare(b.name);
    });
  } else {
    updatedTickets.sort((a, b) => {
      const numA = parseInt(a.fileName.split('-')[0], 10);
      const numB = parseInt(b.fileName.split('-')[0], 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.name.localeCompare(b.name);
    });
  }

  const descFile = fs.existsSync(path.join(projectDir, '_project.md'))
    ? '_project.md'
    : fs.existsSync(path.join(projectDir, 'description.md'))
    ? 'description.md'
    : undefined;

  const finalManifest: ProjectManifest = {
    ...existingManifest,
    descriptionFile: descFile,
    projectmap: {
      tickets: updatedTickets,
      subprojects
    }
  };

  // Write _project.json if it didn't exist or if changes occurred
  const primaryManifestPath = path.join(projectDir, '_project.json');
  if (!fs.existsSync(primaryManifestPath) || hasChanges) {
    saveProjectManifest(projectDir, finalManifest);
  }

  return finalManifest;
}

export function syncTicketToManifest(
  ticketFilePath: string,
  attributes: Record<string, any>
): void {
  const projectDir = path.dirname(ticketFilePath);
  const fileName = path.basename(ticketFilePath);
  const manifest = readRawProjectManifest(projectDir);
  if (!manifest) return;

  let statMtime = Date.now();
  try {
    statMtime = fs.statSync(ticketFilePath).mtimeMs;
  } catch (e) {}

  let found = false;
  manifest.projectmap.tickets = (manifest.projectmap.tickets || []).map(ticket => {
    if (ticket.fileName === fileName || ticket.filePath === ticketFilePath) {
      found = true;
      return {
        ...ticket,
        id: attributes.id || ticket.id,
        name: attributes.name || ticket.name,
        status: attributes.status || ticket.status,
        type: attributes.type || ticket.type,
        mtime: statMtime
      };
    }
    return ticket;
  });

  if (!found) {
    manifest.projectmap.tickets.push({
      id: attributes.id || fileName.replace(/\.md$/i, ''),
      name: attributes.name || fileName,
      status: attributes.status || 'idea',
      type: attributes.type,
      fileName,
      filePath: ticketFilePath,
      mtime: statMtime
    });
  }

  saveProjectManifest(projectDir, manifest);
}
