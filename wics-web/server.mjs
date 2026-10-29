// wics-web static server (no dependencies). Serves ./public and /config.json.
// The browser talks to the Tree directly: Master (REST + terra.events.v1 WebSocket) and its Gateway.
//   node server.mjs   env: PORT=28900 MASTER_URL=http://127.0.0.1:28080 GATEWAY_URL=http://127.0.0.1:28788 ROBOT_NODE=<node id> ROBOT_MODULE=lab.hanium.rdk-bridge
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const port = Number(process.env.PORT || 28900);
const config = {
  masterUrl: process.env.MASTER_URL || 'http://127.0.0.1:28080',
  gatewayUrl: process.env.GATEWAY_URL || 'http://127.0.0.1:28788',
  nodeId: process.env.ROBOT_NODE || '',
  moduleId: process.env.ROBOT_MODULE || 'lab.hanium.rdk-bridge',
};
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/config.json') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(config));
  }
  const rel = normalize(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^([/\\])+/, '');
  if (rel.startsWith('..')) { res.writeHead(400); return res.end(); }
  try {
    const body = await readFile(join(root, rel));
    res.writeHead(200, { 'Content-Type': types[extname(rel)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`wics-web http://127.0.0.1:${port}`));
