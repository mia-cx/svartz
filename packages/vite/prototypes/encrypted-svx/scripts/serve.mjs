import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

// No authentication or decryption endpoint: serve only adapter-static output.
export async function serve(port = 0, allowBlob = true) {
  const root = resolve('build');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (!pathname.startsWith('/prototype/')) { response.writeHead(404).end(); return; }
      const relative = pathname.slice('/prototype/'.length);
      const file = resolve(root, relative.endsWith('/') || !relative ? relative + 'index.html' : relative);
      if (!file.startsWith(root + sep)) { response.writeHead(404).end(); return; }
      const data = await readFile(file);
      response.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
      if (!allowBlob) response.setHeader('Content-Security-Policy', "script-src 'self' 'unsafe-inline'");
      response.end(data);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'EISDIR') response.writeHead(404).end();
      else { console.error(error); response.writeHead(500).end(); }
    }
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  return server;
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await serve(Number(process.env.PORT ?? 4178));
  console.log('Static prototype: http://127.0.0.1:' + server.address().port + '/prototype/');
}
