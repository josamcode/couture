// Bundle-size gate. Runs at the end of `npm run build` and FAILS the build when a budget is broken.
// Budgets come from the brief. Do not raise them to make this pass: fix the cause.
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';

const DIST = 'dist';
const KB = 1024;
const BUDGET = {
  totalJsGzip: 150 * KB, // all JavaScript, compressed, including GSAP, Lenis and OGL
  heroMobile: 250 * KB, // the LCP image at the size phones load
  fontsTotal: 120 * KB, // four Latin-subset woff2 files
  html: 120 * KB, // uncompressed document (it carries all CSS inline)
};

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

const files = await walk(DIST);
const rows = [];
let jsGzip = 0;
let jsBrotli = 0;

for (const f of files.filter((f) => f.endsWith('.js') || f.endsWith('.mjs'))) {
  const buf = await readFile(f);
  const gz = gzipSync(buf, { level: 9 }).length;
  const br = brotliCompressSync(buf).length;
  jsGzip += gz;
  jsBrotli += br;
  rows.push([path.relative(DIST, f), buf.length, gz, br]);
}

// Inline scripts in the HTML count too.
const html = await readFile(path.join(DIST, 'index.html'), 'utf8');
const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
if (inline.trim()) {
  const buf = Buffer.from(inline);
  const gz = gzipSync(buf, { level: 9 }).length;
  jsGzip += gz;
  jsBrotli += brotliCompressSync(buf).length;
  rows.push(['(inline scripts in index.html)', buf.length, gz, brotliCompressSync(buf).length]);
}

// What is render-critical: only the entry module referenced by the HTML. Everything else is lazy.
const entry = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);

const kb = (n) => `${(n / KB).toFixed(1)} KB`;
console.log('\nJavaScript (raw / gzip / brotli)');
for (const [name, raw, gz, br] of rows.sort((a, b) => b[2] - a[2])) {
  const tag = entry.some((e) => e.endsWith(path.basename(name))) ? '  ← entry (loads with the page)' : '';
  console.log(`  ${name.padEnd(58)} ${kb(raw).padStart(9)} ${kb(gz).padStart(9)} ${kb(br).padStart(9)}${tag}`);
}
console.log(`  ${'TOTAL'.padEnd(58)} ${''.padStart(9)} ${kb(jsGzip).padStart(9)} ${kb(jsBrotli).padStart(9)}`);

const fonts = files.filter((f) => f.endsWith('.woff2'));
let fontsTotal = 0;
for (const f of fonts) fontsTotal += (await stat(f)).size;
const hero = (await stat(path.join(DIST, 'img/hero/painting-1280.avif'))).size;
const htmlSize = Buffer.byteLength(html);

const checks = [
  ['Total JS (gzip)', jsGzip, BUDGET.totalJsGzip],
  ['Hero image, phone size (painting-1280.avif)', hero, BUDGET.heroMobile],
  [`Fonts (${fonts.length} woff2 files)`, fontsTotal, BUDGET.fontsTotal],
  ['index.html (uncompressed, CSS inline)', htmlSize, BUDGET.html],
];
console.log('\nBudgets');
let failed = false;
for (const [label, value, max] of checks) {
  const ok = value <= max;
  if (!ok) failed = true;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(46)} ${kb(value).padStart(9)}  (max ${kb(max)})`);
}

// The entry chunk must not pull in the lazy libraries.
const entryFile = rows.find(([name]) => entry.some((e) => e.endsWith(path.basename(name))));
if (entryFile) {
  const src = await readFile(path.join(DIST, entryFile[0]), 'utf8');
  for (const [lib, probe] of [
    ['OGL', 'unable to create webgl context'],
    ['Lenis', 'lenis-smooth'],
  ]) {
    const leaked = src.includes(probe);
    if (leaked) failed = true;
    console.log(`  ${leaked ? 'FAIL' : 'PASS'}  ${lib} is not in the entry chunk`);
  }
}

if (failed) {
  console.error('\nBudget check FAILED.\n');
  process.exit(1);
}
console.log('\nBudget check passed.\n');
