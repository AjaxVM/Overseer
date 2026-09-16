import fs from 'fs';
import { parseFrontmatter, stringifyFrontmatter, syncTicketToManifest } from '../manifest';

export function handleGetFileRead(req: any, res: any) {
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

export function handlePostFileSave(req: any, res: any) {
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
}
