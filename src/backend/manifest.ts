import fs from 'fs';
import path from 'path';

export interface TicketSummary {
  id: string;
  name: string;
  status: string;
  type?: string;
  assignee?: string;
  fileName: string;
  filePath: string; // derived at read time from (dir, fileName) - never persisted
}

export interface SubProjectSummary {
  name: string;
  slug: string;
  path: string; // derived at read time from (dir, slug) - never persisted
}

export interface ProjectManifest {
  name: string;
  id?: string;
  descriptionFile?: string;
  projectmap: {
    tickets: TicketSummary[];
    subprojects: SubProjectSummary[];
  };
}

// On-disk shape only - no absolute paths, no filesystem mtimes, so the file is safe to
// commit and diffs stay stable across machines/collaborators.
interface PersistedTicketSummary {
  id: string;
  name: string;
  status: string;
  type?: string;
  assignee?: string;
  fileName: string;
}

interface PersistedSubProjectSummary {
  name: string;
  slug: string;
}

interface PersistedProjectManifest {
  name: string;
  id?: string;
  descriptionFile?: string;
  projectmap: {
    tickets: PersistedTicketSummary[];
    subprojects: PersistedSubProjectSummary[];
  };
}

// Mtime-based staleness cache, keyed by absolute path and shared across all projects.
// Intentionally in-memory only (not persisted into _project.json) so the file stays
// portable - resets on dev-server restart, which is fine since re-scanning a project's
// ticket files is cheap at this tool's scale.
const ticketCache = new Map<string, { mtime: number; summary: TicketSummary }>();
const subManifestCache = new Map<string, { mtime: number; name: string }>();

// Trued-up manifests computed by the passive file watcher that differ from what's on
// disk, keyed by project dir - held in memory instead of written straight to disk so a
// bulk filesystem change the watcher merely observes (e.g. a git checkout/merge) never
// dirties the working tree on its own. Cleared once committed via commitPendingManifest,
// or once a later true-up finds the on-disk state matches again.
const pendingManifestCache = new Map<string, ProjectManifest>();

function toPersistedManifest(manifest: ProjectManifest): PersistedProjectManifest {
  return {
    name: manifest.name,
    id: manifest.id,
    descriptionFile: manifest.descriptionFile,
    projectmap: {
      tickets: manifest.projectmap.tickets.map(({ filePath, ...rest }) => rest),
      subprojects: manifest.projectmap.subprojects.map(({ path: _path, ...rest }) => rest)
    }
  };
}

function serializeManifest(manifest: ProjectManifest): string {
  return JSON.stringify(toPersistedManifest(manifest), null, 2) + '\n';
}

// Ignores pure line-ending differences (CRLF vs LF) so a file checked out with
// core.autocrlf-converted CRLF doesn't register as "changed" just because we generate
// LF-only content in memory.
function contentEquals(a: string, b: string): boolean {
  return a.replace(/\r\n/g, '\n') === b.replace(/\r\n/g, '\n');
}

// A plain fs.writeFileSync always emits exactly the LF-only string we hand it, silently
// flipping every line of a CRLF-checked-out file (see core.autocrlf) - that makes an
// otherwise-unchanged file look modified to git, and turns one real content change into
// a whole-file diff. Preserving whichever eol style the file already had avoids both.
export function writePreservingEol(filePath: string, content: string): void {
  let eol = '\n';
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, 'utf-8');
    if (existing.includes('\r\n')) eol = '\r\n';
  }
  const normalized = content.replace(/\r\n/g, '\n');
  fs.writeFileSync(filePath, eol === '\r\n' ? normalized.replace(/\n/g, '\r\n') : normalized, 'utf-8');
}

// Applies an explicit key order to a list, keyed by keyFn(item). Keys not present in
// `items` are ignored; items not mentioned in `order` keep their relative position at
// the end. Used both to persist a drag-and-drop reorder and, during true-up, to keep a
// freshly-rescanned list in its previously-known order (array order is the order - see
// poc/mxskv) rather than re-deriving it from a separate ordering field on every scan.
export function reorderByKeys<T>(items: T[], order: string[], keyFn: (item: T) => string): T[] {
  const byKey = new Map(items.map(item => [keyFn(item), item]));
  const ordered: T[] = [];
  order.forEach(key => {
    const item = byKey.get(key);
    if (item) {
      ordered.push(item);
      byKey.delete(key);
    }
  });
  byKey.forEach(item => ordered.push(item));
  return ordered;
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
    const tickets: TicketSummary[] = (data.projectmap?.tickets || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      type: t.type,
      assignee: t.assignee,
      fileName: t.fileName,
      filePath: path.join(dir, t.fileName)
    }));
    const subprojects: SubProjectSummary[] = (data.projectmap?.subprojects || []).map((s: any) => ({
      name: s.name,
      slug: s.slug,
      path: path.join(dir, s.slug)
    }));
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
      projectmap: { tickets, subprojects }
    };
  } catch (e) {
    return null;
  }
}

export function saveProjectManifest(dir: string, manifest: ProjectManifest): void {
  // Always write to _project.json to adhere to POC 15 proposal
  const targetPath = path.join(dir, '_project.json');
  writePreservingEol(targetPath, serializeManifest(manifest));
}

// Cheap, read-only stand-in for loadOrTrueUpProject, used only on a project's first-ever
// request (no _project.json on disk yet) so navigation never blocks on a full
// readdir+frontmatter-parse walk. Derives everything from filenames alone (no file
// reads), never writes to disk, and is superseded moments later by the real
// loadOrTrueUpProject run in the background (see routes/projects.ts).
export function buildShallowManifest(projectDir: string): ProjectManifest {
  const entries = fs.readdirSync(projectDir, { withFileTypes: true });

  const subprojects: SubProjectSummary[] = entries
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
    .map(entry => ({ name: entry.name, slug: entry.name, path: path.join(projectDir, entry.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const ignoredFiles = new Set(['_project.md', 'description.md', 'notes.md', 'comments.md']);
  const tickets: TicketSummary[] = entries
    .filter(
      entry =>
        entry.isFile() &&
        entry.name.toLowerCase().endsWith('.md') &&
        !ignoredFiles.has(entry.name.toLowerCase())
    )
    .map(entry => {
      const filenameParts = entry.name.replace(/\.md$/i, '').split('-');
      return {
        id: filenameParts[0] || '',
        name: filenameParts.slice(1).join(' ') || entry.name,
        status: 'idea',
        fileName: entry.name,
        filePath: path.join(projectDir, entry.name)
      };
    })
    .sort((a, b) => {
      const numA = parseInt(a.fileName.split('-')[0], 10);
      const numB = parseInt(b.fileName.split('-')[0], 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.name.localeCompare(b.name);
    });

  const descriptionFile = fs.existsSync(path.join(projectDir, '_project.md'))
    ? '_project.md'
    : fs.existsSync(path.join(projectDir, 'description.md'))
    ? 'description.md'
    : undefined;

  return {
    name: path.basename(projectDir),
    descriptionFile,
    projectmap: { tickets, subprojects }
  };
}

export function getPendingManifest(projectDir: string): ProjectManifest | null {
  return pendingManifestCache.get(projectDir) || null;
}

// Persists a pending manifest computed by a passive true-up (see loadOrTrueUpProject's
// `persist: false` path) once the user explicitly asks to sync it in. Returns whether
// there was anything pending to write.
export function commitPendingManifest(projectDir: string): boolean {
  const pending = pendingManifestCache.get(projectDir);
  if (!pending) return false;
  saveProjectManifest(projectDir, pending);
  pendingManifestCache.delete(projectDir);
  return true;
}

export function loadOrTrueUpProject(
  projectDir: string,
  _repoConfig?: any,
  opts?: { persist?: boolean }
): ProjectManifest {
  const persist = opts?.persist !== false;
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

  const entries = fs.readdirSync(projectDir, { withFileTypes: true });

  // 1. Detect subprojects. A sub-directory's own manifest mtime gates whether we
  // re-read it - without this, every navigation re-read every sub-project's
  // _project.json on every request, even when nothing under it had changed.
  const scannedSubprojects = new Map<string, SubProjectSummary>();
  entries
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
    .forEach(entry => {
      const subDirPath = path.join(projectDir, entry.name);
      const subManifestPath = getProjectManifestPath(subDirPath);
      let subMtime: number | undefined;
      try {
        subMtime = fs.statSync(subManifestPath).mtimeMs;
      } catch (e) {
        subMtime = undefined;
      }

      const cached = subManifestCache.get(subManifestPath);
      if (cached && subMtime !== undefined && cached.mtime === subMtime) {
        scannedSubprojects.set(entry.name, { name: cached.name, slug: entry.name, path: subDirPath });
        return;
      }

      let subName = entry.name;
      const subManifest = readRawProjectManifest(subDirPath);
      if (subManifest?.name) {
        subName = subManifest.name;
      }
      if (subMtime !== undefined) {
        subManifestCache.set(subManifestPath, { mtime: subMtime, name: subName });
      }
      scannedSubprojects.set(entry.name, { name: subName, slug: entry.name, path: subDirPath });
    });

  // A never-before-seen subproject falls back to alphabetical; a known one keeps its
  // existing position in projectmap.subprojects (see reorderByKeys - array order is the
  // order, poc/mxskv) instead of being re-sorted on every scan.
  const scannedSubprojectsList = Array.from(scannedSubprojects.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const subprojects = reorderByKeys(
    scannedSubprojectsList,
    (existingManifest.projectmap?.subprojects || []).map(s => s.slug),
    s => s.slug
  );

  // 2. Detect tickets (.md files excluding _project.md / description.md / notes.md / comments.md)
  const ignoredFiles = new Set(['_project.md', 'description.md', 'notes.md', 'comments.md']);
  const ticketFiles = entries.filter(
    entry =>
      entry.isFile() &&
      entry.name.toLowerCase().endsWith('.md') &&
      !ignoredFiles.has(entry.name.toLowerCase())
  );

  const scannedTickets = new Map<string, TicketSummary>();

  ticketFiles.forEach(fileEntry => {
    const filePath = path.join(projectDir, fileEntry.name);
    try {
      const stat = fs.statSync(filePath);
      const cached = ticketCache.get(filePath);

      if (cached && cached.mtime === stat.mtimeMs) {
        scannedTickets.set(fileEntry.name, cached.summary);
      } else {
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
          assignee: attributes.assignee,
          fileName: fileEntry.name,
          filePath
        };
        ticketCache.set(filePath, { mtime: stat.mtimeMs, summary: ticketSummary });
        scannedTickets.set(fileEntry.name, ticketSummary);
      }
    } catch (e) {
      // Skip files that fail to stat or read
    }
  });

  // A never-before-seen ticket falls back to numeric-prefix-then-alphabetical; a known
  // one keeps its existing position in projectmap.tickets instead of being re-sorted on
  // every scan (array order is the order - childOrder is gone, see poc/mxskv).
  const scannedTicketsList = Array.from(scannedTickets.values()).sort((a, b) => {
    const numA = parseInt(a.fileName.split('-')[0], 10);
    const numB = parseInt(b.fileName.split('-')[0], 10);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a.name.localeCompare(b.name);
  });
  const updatedTickets = reorderByKeys(
    scannedTicketsList,
    (existingManifest.projectmap?.tickets || []).map(t => t.fileName),
    t => t.fileName
  );

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

  // Write _project.json only if its content actually changed. A content comparison
  // (rather than a cache-hit/miss flag) is required here because the mtime cache is
  // cold on every dev-server restart - without this, a cold-cache re-derivation of
  // otherwise-unchanged data would force a rewrite (and a spurious git diff) on every
  // restart, since the old flag conflated "not in memory cache" with "actually changed".
  const primaryManifestPath = path.join(projectDir, '_project.json');
  const serialized = serializeManifest(finalManifest);
  let hasChanged = true;
  if (fs.existsSync(primaryManifestPath)) {
    try {
      hasChanged = !contentEquals(fs.readFileSync(primaryManifestPath, 'utf-8'), serialized);
    } catch (e) {
      hasChanged = true;
    }
  }

  if (!hasChanged) {
    pendingManifestCache.delete(projectDir);
  } else if (persist) {
    saveProjectManifest(projectDir, finalManifest);
    pendingManifestCache.delete(projectDir);
  } else {
    // Passive true-up (file watcher): hold the reconciled result in memory instead of
    // writing it, so a bulk change the watcher merely observed (e.g. a git checkout)
    // never auto-dirties the working tree. The caller surfaces this via
    // getPendingManifest so the UI can offer an explicit "sync now".
    pendingManifestCache.set(projectDir, finalManifest);
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

  // `attributes` is always the ticket's complete current attribute set, so a field the
  // user just cleared to blank arrives as ''. Falling back to the old value with `||`
  // would make clearing a field impossible to persist - a presence check distinguishes
  // "field is set to blank" from "field is absent from this save" instead.
  const hasOwn = (key: string) => Object.prototype.hasOwnProperty.call(attributes, key);

  let found = false;
  manifest.projectmap.tickets = (manifest.projectmap.tickets || []).map(ticket => {
    if (ticket.fileName === fileName || ticket.filePath === ticketFilePath) {
      found = true;
      return {
        ...ticket,
        id: attributes.id || ticket.id,
        name: attributes.name || ticket.name,
        status: hasOwn('status') ? attributes.status || '' : ticket.status,
        type: hasOwn('type') ? attributes.type || undefined : ticket.type,
        assignee: hasOwn('assignee') ? attributes.assignee || undefined : ticket.assignee
      };
    }
    return ticket;
  });

  if (!found) {
    manifest.projectmap.tickets.push({
      id: attributes.id || fileName.replace(/\.md$/i, ''),
      name: attributes.name || fileName,
      status: attributes.status || 'idea',
      type: attributes.type || undefined,
      assignee: attributes.assignee || undefined,
      fileName,
      filePath: ticketFilePath
    });
  }

  saveProjectManifest(projectDir, manifest);
}
