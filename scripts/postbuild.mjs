// Runs after `astro build`. Adds a modulepreload link for the main script module, so the browser
// fetches and compiles it early, while its execution waits until the first frame is on screen
// (see the boot script in src/layouts/Base.astro).
import { readdir, readFile, writeFile } from 'node:fs/promises';

const files = await readdir('dist/_astro');
const main = files.find((f) => /^main\.[\w-]+\.js$/.test(f));
if (!main) throw new Error('postbuild: main chunk not found in dist/_astro');

const file = 'dist/index.html';
let html = await readFile(file, 'utf8');
const link = `<link rel="modulepreload" href="/_astro/${main}">`;
if (!html.includes(link)) {
  if (!html.includes('</head>')) throw new Error('postbuild: </head> not found');
  html = html.replace('</head>', `${link}</head>`);
  await writeFile(file, html);
}
console.log(`postbuild: modulepreload → ${main}`);
