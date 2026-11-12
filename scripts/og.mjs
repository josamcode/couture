// Open Graph image (1200×630) in brand style: ink background, the H1, the mark.
// Rendered from HTML with the real fonts (Playwright), so it always matches the site.
//   npm run og   → public/og.png
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

const font = (pkg, file) => pathToFileURL(path.resolve(`node_modules/@fontsource/${pkg}/files/${file}`)).href;

// the mark: Jo's PNG if it is there, otherwise the vector
const png = 'public/brand/couture-ui-mark-transparent.png';
const mark = existsSync(png)
  ? `data:image/png;base64,${(await sharp(png).trim().resize({ height: 240 }).png().toBuffer()).toString('base64')}`
  : `data:image/svg+xml;base64,${(await readFile('public/brand/couture-ui-mark.svg')).toString('base64')}`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Bodoni;src:url(${font('bodoni-moda', 'bodoni-moda-latin-400-normal.woff2')}) format('woff2');font-style:normal}
@font-face{font-family:Bodoni;src:url(${font('bodoni-moda', 'bodoni-moda-latin-400-italic.woff2')}) format('woff2');font-style:italic}
@font-face{font-family:Jost;src:url(${font('jost', 'jost-latin-400-normal.woff2')}) format('woff2');font-weight:400}
@font-face{font-family:Jost;src:url(${font('jost', 'jost-latin-500-normal.woff2')}) format('woff2');font-weight:500}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;background:#0B0B0C;color:#F4F1EA;position:relative;overflow:hidden;font-family:Jost}
.pad{position:absolute;inset:56px 64px}
.eyebrow{font-size:17px;letter-spacing:.24em;text-transform:uppercase;color:#8C877E}
h1{font:400 104px/0.98 Bodoni;letter-spacing:-0.018em;margin-top:34px}
h1 em{font-style:italic}
.dot{color:#A3122A}
.foot{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:flex-end;justify-content:space-between}
.word{display:flex;align-items:baseline;font:400 40px/1 Bodoni}
.word i{width:8px;height:8px;border-radius:50%;background:#A3122A;margin:0 12px 0 6px}
.word b{font:500 17px/1 Jost;letter-spacing:.3em}
.mark{height:118px}
.rule{position:absolute;left:0;right:0;bottom:150px;height:1px;background:#2A2826}
</style></head><body><div class="pad">
<p class="eyebrow">I · The atelier</p>
<h1>AI makes off-the-rack.<br>We make <em>couture</em><span class="dot">.</span></h1>
<div class="rule"></div>
<div class="foot"><div class="word">Couture<i></i><b>UI</b></div><img class="mark" src="${mark}" alt=""></div>
</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
// loaded from a real file so the local font files are allowed to load
await mkdir('.astro', { recursive: true });
const tmp = path.resolve('.astro/og.html');
await writeFile(tmp, html);
await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
const loaded = await page.evaluate(() => [...document.fonts].every((f) => f.status === 'loaded'));
if (!loaded) throw new Error('og: fonts did not load');
const shot = await page.screenshot({ type: 'png' });
await rm(tmp, { force: true });
await browser.close();
await sharp(shot).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile('public/og.png');
console.log('og image → public/og.png');
