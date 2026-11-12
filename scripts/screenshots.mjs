// Visual QA: screenshots of every section at four viewports (plus a narrow WebKit phone),
// including mid-transition frames of every scroll scene.
// Output: qa/screenshots/<viewport>/NN-name.jpg
//
// Needs the built site to be served:  npm run build && npm run serve   (in another terminal)
// Then:                               npm run screenshots   [-- http://localhost:4321] [viewportName]
import { chromium, webkit } from '@playwright/test';
import { mkdir, rm } from 'node:fs/promises';
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

for (const vp of VIEWPORTS) {
  if (only && vp.name !== only) continue;
  const isWebkit = vp.engine === 'webkit';
  const browser = await (isWebkit ? webkit : chromium).launch(
    isWebkit ? {} : { args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  );
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dpr,
    isMobile: vp.mobile && !isWebkit ? true : undefined,
    hasTouch: vp.mobile,
  });
  const page = await ctx.newPage();
  const dir = path.resolve('qa/screenshots', vp.name);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  let n = 0;
  const shot = async (name) => {
    n += 1;
    const file = path.join(dir, `${String(n).padStart(2, '0')}-${name}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 84 });
    console.log(`  ${vp.name}/${path.basename(file)}`);
  };
  const scrollTo = async (y, wait = 1300) => {
    await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), Math.max(0, Math.round(y)));
    await page.waitForTimeout(wait);
  };
  const topOf = (sel) => page.evaluate((s) => document.querySelector(s).getBoundingClientRect().top + scrollY, sel);

  await page.goto(base, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.documentElement.classList.contains('scroll-ready'));
  await page.waitForTimeout(2500); // headline reveal
  await shot('hero');

  const H = vp.height;
  const collectionTop = await topOf('#collection');
  const pinned = await page.evaluate(
    () => getComputedStyle(document.querySelector('[data-hero-stage]')).position === 'sticky',
  );

  // ---- Scene I
  await page.mouse.move(vp.width * 0.42, vp.height * 0.4); // wakes the WebGL warm-up; also where the candle is
  await page.waitForTimeout(2500);
  if (pinned) {
    // desktop: headline lifts → painting fills the screen → becomes the drawing → paper slides over
    await scrollTo(H * 0.42);
    await shot('hero-painting-growing');
    await scrollTo(H * 0.9);
    await shot('hero-painting-full-bleed');
    await scrollTo(H * 1.25);
    await shot('hero-dissolve-mid');
    await scrollTo(H * 1.62, 1600);
    await shot('hero-lineart-candle');
    await scrollTo(collectionTop - H * 0.5);
    await shot('torn-ivory-over-ink');
  } else {
    // phones: the plate is held mid-screen, grows, becomes the drawing, the paper rises over it
    await scrollTo(H * 0.45);
    await shot('hero-plate-held');
    await scrollTo(H * 0.8);
    await shot('hero-dissolve-mid');
    await scrollTo(H * 1.1, 1600);
    await shot('hero-lineart');
    await scrollTo(collectionTop - H * 0.55);
    await shot('torn-ivory-over-ink');
  }

  // ---- Scene II: the fitting room (scroll walks through the looks)
  await scrollTo(collectionTop, 1800);
  await shot('collection-head');
  const scene = await page.evaluate(() => {
    const s = document.querySelector('[data-spreads]');
    const a = document.querySelector('[data-spread]:not([hidden])');
    const stick = getComputedStyle(a).position === 'sticky' ? parseFloat(getComputedStyle(a).top) || 0 : 0;
    return { start: s.getBoundingClientRect().top + scrollY - stick, run: Math.max(0, s.offsetHeight - a.offsetHeight) };
  });
  if (scene.run > 0) {
    await scrollTo(scene.start + scene.run * 0.02, 1800);
    await shot('look-I-off-the-rack');
    await scrollTo(scene.start + scene.run * 0.13, 1800);
    await shot('look-I-dressed');
    await scrollTo(scene.start + scene.run * 0.25, 2000);
    await shot('look-II-mid');
    await scrollTo(scene.start + scene.run * 0.42, 2000);
    await shot('look-III-mid');
    await scrollTo(scene.start + scene.run * 0.75, 2000);
    await shot('look-V-mid');
    await scrollTo(scene.start + scene.run * 0.97, 2000);
    await shot('look-VI-dressed');
    await scrollTo(scene.start + scene.run + H * 0.45, 1800);
    await shot('collection-box-price');
  } else {
    await scrollTo((await topOf('.spread:not([hidden]) .compare')) - H * 0.16, 1800);
    await shot('collection-compare');
  }

  // ---- Scene III
  const wardrobeTop = await topOf('#wardrobe');
  await scrollTo(wardrobeTop - H * 0.5);
  await shot('torn-ink-over-ivory');
  await scrollTo(wardrobeTop, 2400);
  await shot('wardrobe');
  await scrollTo(await page.evaluate(() => document.documentElement.scrollHeight), 2200);
  await shot('wardrobe-card-footer');

  await browser.close();
}
console.log('screenshots done → qa/screenshots/');
