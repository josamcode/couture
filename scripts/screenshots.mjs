// Visual QA: screenshots of every section at four viewports, plus mid-transition frames
// (painting dissolve, both torn edges). Output: qa/screenshots/<viewport>/NN-name.jpg
//
// Needs the built site to be served:  npm run build && npm run preview   (in another terminal)
// Then:                               npm run screenshots   [-- http://localhost:4321] [viewportName]
import { chromium, webkit } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const base = args.find((a) => a.startsWith('http')) ?? 'http://localhost:4321';
const only = args.find((a) => !a.startsWith('http'));

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844, dpr: 2, mobile: true },
  { name: '768x1024', width: 768, height: 1024, dpr: 1, mobile: true },
  { name: '1440x900', width: 1440, height: 900, dpr: 1, mobile: false },
  { name: '1920x1080', width: 1920, height: 1080, dpr: 1, mobile: false },
  // narrow, short viewport in WebKit: what Instagram's in-app browser on an iPhone looks like
  { name: '375x640-webkit', width: 375, height: 640, dpr: 2, mobile: true, engine: 'webkit' },
];

const settle = (page, ms = 900) => page.waitForTimeout(ms);

for (const vp of VIEWPORTS) {
  if (only && vp.name !== only) continue;
  const engine = vp.engine === 'webkit' ? webkit : chromium;
  const browser = await engine.launch(
    vp.engine === 'webkit' ? {} : { args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  );
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dpr,
    isMobile: vp.mobile && vp.engine !== 'webkit' ? true : undefined,
    hasTouch: vp.mobile,
  });
  const page = await ctx.newPage();
  const dir = path.resolve('qa/screenshots', vp.name);
  await mkdir(dir, { recursive: true });
  let n = 0;
  const shot = async (name) => {
    n += 1;
    const file = path.join(dir, `${String(n).padStart(2, '0')}-${name}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 84 });
    console.log(`  ${vp.name}/${path.basename(file)}`);
  };
  const scrollTo = async (y, wait = 900) => {
    await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), Math.max(0, Math.round(y)));
    await settle(page, wait);
  };
  const topOf = (sel) => page.evaluate((s) => document.querySelector(s).getBoundingClientRect().top + scrollY, sel);

  await page.goto(base, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await settle(page, 3200); // headline reveal + WebGL start
  await shot('hero');

  const H = vp.height;
  const collectionTop = await topOf('#collection');
  const pinned = await page.evaluate(() => getComputedStyle(document.querySelector('[data-hero-stage]')).position === 'sticky');

  if (pinned) {
    await scrollTo(H * 0.3);
    await shot('hero-dissolve-mid');
    await scrollTo(H * 0.75);
    await shot('hero-lineart');
    await scrollTo(collectionTop - H * 0.5);
    await shot('torn-ivory-over-ink');
  } else {
    await scrollTo(H * 0.28);
    await shot('hero-dissolve-mid');
    await scrollTo(H * 0.6);
    await shot('hero-lineart');
    await scrollTo(collectionTop - H * 0.55);
    await shot('torn-ivory-over-ink');
  }

  await scrollTo(collectionTop, 1600);
  await shot('collection-head');
  const compareTop = await topOf('.spread:not([hidden]) .compare');
  await scrollTo(compareTop - H * 0.16, 1200);
  await page.waitForTimeout(3800); // let the "show me" sweep finish
  await shot('collection-compare');
  const boxTop = await topOf('.spread:not([hidden]) .box');
  await scrollTo(boxTop - H * 0.35);
  await shot('collection-box-price');

  // a second look, to see the swap result
  await page.locator('button[data-look="noir"]').click();
  await settle(page, 1800);
  const headTop = await topOf('.spread:not([hidden]) [data-spread-head]');
  await scrollTo(headTop - H * 0.18, 1200);
  await shot('collection-look-noir');

  const wardrobeTop = await topOf('#wardrobe');
  await scrollTo(wardrobeTop - H * 0.5);
  await shot('torn-ink-over-ivory');
  await scrollTo(wardrobeTop, 2200);
  await shot('wardrobe');
  await scrollTo(await page.evaluate(() => document.documentElement.scrollHeight), 1600);
  await shot('wardrobe-card-footer');

  await browser.close();
}
console.log('screenshots done → qa/screenshots/');
