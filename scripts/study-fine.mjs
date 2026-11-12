// Fine-grained pass over one stretch of a reference site (small steps, to read transitions and easing).
// usage: node scripts/study-fine.mjs <url> <name> <startY> <endY> <stepPx>
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const [url, name, start, end, step] = process.argv.slice(2);
const dir = path.resolve('qa/research', name, 'fine');
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--window-position=2000,0'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
await page.waitForTimeout(7000);
await page.mouse.move(720, 450);
let y = 0;
const wheelTo = async (target) => {
  while (y < target) { await page.mouse.wheel(0, 100); y += 100; await page.waitForTimeout(50); }
};
await wheelTo(Number(start));
let i = 0;
for (let t = Number(start); t <= Number(end); t += Number(step)) {
  await wheelTo(t);
  await page.waitForTimeout(1200);
  const sy = await page.evaluate(() => Math.round(window.scrollY));
  const buf = await page.screenshot({ type: 'png', timeout: 45000 }).catch(() => null);
  if (buf) await sharp(buf).resize(960).jpeg({ quality: 68 }).toFile(path.join(dir, `${String(i).padStart(2, '0')}-${sy}.jpg`));
  i++;
}
await browser.close();
console.log('done', i);
