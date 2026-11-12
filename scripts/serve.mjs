// A small static server for dist/ that behaves like the production host (Cloudflare):
// it applies the rules in dist/_headers, compresses text (brotli / gzip), and sends ETags.
// Used by the Playwright tests, the screenshot script and Lighthouse, so local results match production.
//   node scripts/serve.mjs [port]      (default 4321)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const ROOT = path.resolve('dist');
const PORT = Number(process.argv[2] || process.env.PORT || 4321);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.svg', '.json', '.txt', '.xml']);

// ---- _headers (Cloudflare format): "path pattern" lines followed by indented "Name: value" lines ----
async function loadHeaderRules() {
  let text = '';
  try {
    text = await readFile(path.join(ROOT, '_headers'), 'utf8');
  } catch {
    return [];
  }
  const rules = [];
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (/^\s/.test(raw)) {
      const i = raw.indexOf(':');
      if (current && i > 0) current.headers.push([raw.slice(0, i).trim(), raw.slice(i + 1).trim()]);
    } else {
      const pattern = raw.trim();
      const re = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
      current = { re, headers: [] };
      rules.push(current);
    }
  }
  return rules;
}
const rules = await loadHeaderRules();

const cache = new Map(); // file path + encoding → { body, etag }

async function load(file, encoding) {
  const key = `${file}|${encoding}`;
  const { mtimeMs } = await stat(file);
  const hit = cache.get(key);
  if (hit && hit.mtimeMs === mtimeMs) return hit;
  let body = await readFile(file);
  if (encoding === 'br') {
    body = brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } });
  } else if (encoding === 'gzip') {
    body = gzipSync(body, { level: 9 });
  }
  const etag = `"${createHash('sha1').update(body).digest('hex').slice(0, 20)}"`;
  const entry = { body, etag, mtimeMs };
  cache.set(key, entry);
  return entry;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = path.join(ROOT, pathname);
    if (!file.startsWith(ROOT) || pathname === '/_headers') {
      res.writeHead(404).end('Not found');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const accepts = String(req.headers['accept-encoding'] || '');
    const encoding = COMPRESSIBLE.has(ext) ? (accepts.includes('br') ? 'br' : accepts.includes('gzip') ? 'gzip' : '') : '';
    const { body, etag } = await load(file, encoding);

    const headers = {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'public, max-age=0, must-revalidate', // Cloudflare's default for HTML and unlisted paths
      ETag: etag,
      Vary: 'Accept-Encoding',
    };
    for (const rule of rules) {
      if (rule.re.test(pathname === '/index.html' ? '/' : pathname) || rule.re.test(pathname)) {
        for (const [k, v] of rule.headers) headers[k] = v;
      }
    }
    if (encoding) headers['Content-Encoding'] = encoding;

    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers).end();
      return;
    }
    headers['Content-Length'] = body.length;
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
});

server.listen(PORT, () => console.log(`serving dist/ like production → http://localhost:${PORT}`));
