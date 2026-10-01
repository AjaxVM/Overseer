import fs from 'fs';

import type { FastifyInstance } from 'fastify';

import { parseFrontmatter, stringifyFrontmatter, trueUpAfterWrite, writePreservingEol } from '../manifest.ts';

export function fileRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { path?: string } }>('/api/file/read', async (request, reply) => {
    const filePath = request.query.path;
    if (!filePath || !fs.existsSync(filePath)) {
      return reply.code(404).send({ error: 'File not found' });
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { attributes, body } = parseFrontmatter(raw);
    return { path: filePath, attributes, body };
  });

  app.post<{ Body: { path?: string; attributes: Record<string, any>; body: string } }>(
    '/api/file/save',
    async request => {
      const { path: filePath, attributes, body } = request.body;
      if (!filePath) throw new Error('File path required');
      writePreservingEol(filePath, stringifyFrontmatter(attributes, body));

      if (filePath.toLowerCase().endsWith('.md')) trueUpAfterWrite(filePath);

      return { success: true };
    }
  );
}
