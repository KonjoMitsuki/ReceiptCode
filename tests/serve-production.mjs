// Serve the same production artifact at a domain root and a subpath, without
// SPA fallback: a missing JS/CSS file must fail instead of returning index.html.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('dist');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = pathname.replace(/^\/receipt2jan\//, '/');
    const filename = resolve(root, `.${relative.endsWith('/') ? `${relative}index.html` : relative}`);
    if (!filename.startsWith(root + sep)) throw new Error('Invalid path');
    const body = await readFile(filename);
    response.writeHead(200, { 'Content-Type': mime[extname(filename)] ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
}).listen(4175, '127.0.0.1');
