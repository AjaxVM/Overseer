import fs from 'fs';
import path from 'path';

import type { FastifyInstance } from 'fastify';

import { getOrInitRepoConfig } from '../config.ts';
import {
  ATTACHMENT_EXTENSIONS,
  buildAttachmentFileName,
  isAttachmentFileName,
  loadOrTrueUpProject,
  parseAttachmentFileName,
  writePreservingEol
} from '../manifest.ts';
import { slugify } from './projects.ts';
import type { RouteContext } from '../types.ts';

const CONTENT_TYPES: Record<string, string> = {
  md: 'text/markdown; charset=utf-8',
  html: 'text/html; charset=utf-8',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png'
};

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

export function attachmentRoutes(app: FastifyInstance, ctx: RouteContext) {
  app.post<{
    Body: {
      parentPath?: string;
      repoPath?: string;
      ticketId?: string;
      sourcePath?: string;
      name?: string;
      overwrite?: boolean;
      blank?: boolean;
    };
  }>('/api/attachment/create', async (request, reply) => {
    const { parentPath, repoPath, ticketId, sourcePath, name, overwrite, blank } = request.body;
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
        return reply.code(409).send({ error: 'An attachment with this name already exists.' });
      }
      fs.unlinkSync(existing);
    }

    const fileName = buildAttachmentFileName(ticketId, slug, ext);
    const targetPath = path.join(parentPath, fileName);
    if (blank) {
      writePreservingEol(targetPath, `# ${name.trim()}\n`);
    } else {
      fs.copyFileSync(sourcePath!, targetPath);
    }

    loadOrTrueUpProject(parentPath, getOrInitRepoConfig(repoPath));

    ctx.broadcast();
    return { success: true, fileName, name: name.trim(), slug, ext };
  });

  app.get<{ Querystring: { path?: string } }>('/api/attachment/read', async (request, reply) => {
    const filePath = request.query.path;
    if (!filePath || !fs.existsSync(filePath) || !isAttachmentFileName(path.basename(filePath))) {
      return reply.code(404).send({ error: 'Attachment not found' });
    }
    const parsed = parseAttachmentFileName(path.basename(filePath))!;
    if (parsed.ext !== 'md' && parsed.ext !== 'html') {
      throw new Error('Use /api/attachment/raw for this file type');
    }
    return { path: filePath, ext: parsed.ext, content: fs.readFileSync(filePath, 'utf-8') };
  });

  app.post<{ Body: { path?: string; content?: string } }>('/api/attachment/save', async request => {
    const { path: filePath, content } = request.body;
    if (!filePath || !isAttachmentFileName(path.basename(filePath))) {
      throw new Error('Valid attachment path is required.');
    }
    const parsed = parseAttachmentFileName(path.basename(filePath))!;
    if (parsed.ext !== 'md' && parsed.ext !== 'html') throw new Error('Only markdown/html attachments are editable.');

    writePreservingEol(filePath, content || '');
    return { success: true };
  });

  app.get<{ Querystring: { path?: string } }>('/api/attachment/raw', async (request, reply) => {
    const filePath = request.query.path;
    if (!filePath || !fs.existsSync(filePath) || !isAttachmentFileName(path.basename(filePath))) {
      return reply.code(404).type('text/plain').send('Attachment not found');
    }
    const parsed = parseAttachmentFileName(path.basename(filePath))!;
    return reply.type(CONTENT_TYPES[parsed.ext] || 'application/octet-stream').send(fs.readFileSync(filePath));
  });

  app.post<{ Body: { attachmentPath?: string; parentPath?: string; repoPath?: string } }>(
    '/api/attachment/delete',
    async request => {
      const { attachmentPath, parentPath, repoPath } = request.body;
      if (!attachmentPath || !fs.existsSync(attachmentPath) || !isAttachmentFileName(path.basename(attachmentPath))) {
        throw new Error('Valid attachmentPath is required.');
      }
      fs.unlinkSync(attachmentPath);

      if (parentPath && repoPath && fs.existsSync(parentPath)) {
        loadOrTrueUpProject(parentPath, getOrInitRepoConfig(repoPath));
      }

      ctx.broadcast();
      return { success: true };
    }
  );
}
