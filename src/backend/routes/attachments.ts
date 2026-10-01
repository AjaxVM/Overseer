import fs from 'fs';
import path from 'path';
import { getOrInitRepoConfig } from '../config';
import {
  ATTACHMENT_EXTENSIONS,
  buildAttachmentFileName,
  isAttachmentFileName,
  loadOrTrueUpProject,
  parseAttachmentFileName,
  writePreservingEol
} from '../manifest';
import { slugify } from './projects';
import type { RouteContext } from '../types';

const CONTENT_TYPES: Record<string, string> = {
  md: 'text/markdown; charset=utf-8',
  html: 'text/html; charset=utf-8',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png'
};

function readJsonBody(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let reqBody = '';
    req.on('data', (chunk: string) => (reqBody += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(reqBody));
      } catch (e) {
        reject(new Error('Invalid request body'));
      }
    });
  });
}

// Finds any attachment already on disk for this ticket with the same slug, regardless
// of extension - names are unique per ticket independent of format (e.g. attaching a
// .png under a name that already has a .md attachment is a collision).
function findExistingAttachment(parentPath: string, ticketId: string, slug: string): string | null {
  const entries = fs.readdirSync(parentPath, { withFileTypes: true });
  const match = entries.find(entry => {
    if (!entry.isFile()) return false;
    const parsed = parseAttachmentFileName(entry.name);
    return parsed?.ticketId === ticketId && parsed.slug === slug;
  });
  return match ? path.join(parentPath, match.name) : null;
}

export async function handlePostAttachmentCreate(ctx: RouteContext, req: any, res: any) {
  try {
    const { parentPath, repoPath, ticketId, sourcePath, name, overwrite, blank } = await readJsonBody(req);
    if (!parentPath || !repoPath || !ticketId || !name?.trim()) {
      throw new Error('parentPath, repoPath, ticketId, and name are required.');
    }

    const slug = slugify(name);
    if (!slug) throw new Error('Name must contain at least one letter or number.');

    let ext: string;
    if (blank) {
      ext = 'md';
    } else {
      if (!sourcePath || !fs.existsSync(sourcePath)) throw new Error('Valid sourcePath is required.');
      ext = path.extname(sourcePath).slice(1).toLowerCase();
    }
    if (!ATTACHMENT_EXTENSIONS.includes(ext)) {
      throw new Error(`Unsupported attachment type ".${ext}". Supported: ${ATTACHMENT_EXTENSIONS.join(', ')}.`);
    }

    const existing = findExistingAttachment(parentPath, ticketId, slug);
    if (existing) {
      if (!overwrite) {
        res.statusCode = 409;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: 'An attachment with this name already exists.' }));
      }
      fs.unlinkSync(existing);
    }

    const fileName = buildAttachmentFileName(ticketId, slug, ext);
    const targetPath = path.join(parentPath, fileName);
    if (blank) {
      writePreservingEol(targetPath, `# ${name.trim()}\n`);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }

    const repoConfig = getOrInitRepoConfig(repoPath);
    loadOrTrueUpProject(parentPath, repoConfig);

    ctx.server.ws.send({ type: 'custom', event: 'projects-update' });
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ success: true, fileName, name: name.trim(), slug, ext }));
  } catch (e: any) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: e.message }));
  }
}

export function handleGetAttachmentRead(req: any, res: any) {
  const urlObj = new URL(req.url, 'http://localhost');
  const filePath = urlObj.searchParams.get('path');
  if (!filePath || !fs.existsSync(filePath) || !isAttachmentFileName(path.basename(filePath))) {
    res.statusCode = 404;
    return res.end(JSON.stringify({ error: 'Attachment not found' }));
  }
  const parsed = parseAttachmentFileName(path.basename(filePath))!;
  if (parsed.ext !== 'md' && parsed.ext !== 'html') {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'Use /api/attachment/raw for this file type' }));
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify({ path: filePath, ext: parsed.ext, content }));
}

export async function handlePostAttachmentSave(req: any, res: any) {
  try {
    const { path: filePath, content } = await readJsonBody(req);
    if (!filePath || !isAttachmentFileName(path.basename(filePath))) {
      throw new Error('Valid attachment path is required.');
    }
    const parsed = parseAttachmentFileName(path.basename(filePath))!;
    if (parsed.ext !== 'md' && parsed.ext !== 'html') throw new Error('Only markdown/html attachments are editable.');

    writePreservingEol(filePath, content || '');
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ success: true }));
  } catch (e: any) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: e.message }));
  }
}

export function handleGetAttachmentRaw(req: any, res: any) {
  const urlObj = new URL(req.url, 'http://localhost');
  const filePath = urlObj.searchParams.get('path');
  if (!filePath || !fs.existsSync(filePath) || !isAttachmentFileName(path.basename(filePath))) {
    res.statusCode = 404;
    return res.end('Attachment not found');
  }
  const parsed = parseAttachmentFileName(path.basename(filePath))!;
  res.setHeader('Content-Type', CONTENT_TYPES[parsed.ext] || 'application/octet-stream');
  return res.end(fs.readFileSync(filePath));
}

export async function handlePostAttachmentDelete(ctx: RouteContext, req: any, res: any) {
  try {
    const { attachmentPath, parentPath, repoPath } = await readJsonBody(req);
    if (!attachmentPath || !fs.existsSync(attachmentPath) || !isAttachmentFileName(path.basename(attachmentPath))) {
      throw new Error('Valid attachmentPath is required.');
    }
    fs.unlinkSync(attachmentPath);

    if (parentPath && repoPath && fs.existsSync(parentPath)) {
      const repoConfig = getOrInitRepoConfig(repoPath);
      loadOrTrueUpProject(parentPath, repoConfig);
    }

    ctx.server.ws.send({ type: 'custom', event: 'projects-update' });
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ success: true }));
  } catch (e: any) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: e.message }));
  }
}
