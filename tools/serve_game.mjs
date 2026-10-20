import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.mp3': 'audio/mpeg' };

export function serveGame(port = 0) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const pathname = decodeURIComponent(url.pathname);
      const filename = pathname.startsWith('/assets/audio/')
        ? path.join(root, 'assets/audio', path.basename(pathname))
        : pathname.startsWith('/generated-assets/')
        ? path.join(root, pathname.endsWith('.json') ? 'assets/json' : 'assets/images', path.basename(pathname))
        : path.join(root, 'game js', pathname.replace(/^\/game\//, '').replace(/^\//, '') || 'index.html');
      if (!filename.startsWith(root)) throw new Error('Invalid path');
      const data = await fs.readFile(filename);
      res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}

export function serveFlutter(port = 0) {
  const webRoot = path.join(root, 'build/web');
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const filename = path.resolve(webRoot, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!filename.startsWith(webRoot + path.sep)) throw new Error('Invalid path');
      const data = await fs.readFile(filename);
      res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || (filename.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream') });
      res.end(data);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await serveGame(Number(process.argv[2]) || 8080);
  console.log(`Game: http://127.0.0.1:${server.address().port}/game/index.html`);
}
