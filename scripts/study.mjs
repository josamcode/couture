// Phase 0 reference study. Opens each reference site in a real browser,
// scrolls slowly with the mouse wheel, and saves screenshots + page facts.
// Output: qa/research/<name>/NN.jpg and qa/research/<name>/facts.json
// (screenshots of third-party sites are git-ignored: they are study notes, not assets).
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SITES = [
  { name: 'shopify-renaissance', url: 'https://www.shopify.com/editions/winter2026', shots: 16 },
  { name: 'oryzo', url: 'https://oryzo.ai/', shots: 10 },
  { name: 'obsidian-assembly', url: 'https://obsidianassembly.com/', shots: 10 },
];

const only = process.argv[2];
const out = path.resolve('qa/research');

const browser = await chromium.launch({
  headless: process.env.HEADLESS === '1',
  args: ['--ignore-gpu-blocklist', '--window-position=2000,0'],
});

for (const site of SITES) {
  if (only && site.name !== only) continue;
  const dir = path.join(out, site.name);
  await mkdir(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const requests = [];
  page.on('request', (r) => {
    const t = r.resourceType();
    if (t === 'script' || t === 'font') requests.push({ t, url: r.url().slice(0, 200) });
  });
  console.log('→', site.url);
  try {
    await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (e) {
    console.log('  goto failed:', e.message);
  }
  await page.waitForTimeout(7000);

  const facts = await page.evaluate(() => {
    const cs = (el) => (el ? getComputedStyle(el) : null);
    const heads = [...document.querySelectorAll('h1,h2,h3')].slice(0, 14).map((h) => {
      const s = cs(h);
      return {
        tag: h.tagName,
        text: (h.textContent || '').trim().slice(0, 80),
        font: s.fontFamily.slice(0, 80),
        size: s.fontSize,
        weight: s.fontWeight,
        style: s.fontStyle,
        lh: s.lineHeight,
        ls: s.letterSpacing,
        color: s.color,
      };
    });
    const b = cs(document.body);
    return {
      title: document.title,
      scrollHeight: document.documentElement.scrollHeight,
      bodyBg: b.backgroundColor,
      bodyColor: b.color,
      bodyFont: b.fontFamily.slice(0, 100),
      fonts: [...new Set([...document.fonts].map((f) => `${f.family} ${f.weight} ${f.style}`))].slice(0, 30),
      canvases: document.querySelectorAll('canvas').length,
      svgs: document.querySelectorAll('svg').length,
      videos: document.querySelectorAll('video').length,
      htmlClass: document.documentElement.className.slice(0, 200),
      heads,
      libs: {
        gsap: !!window.gsap,
        ScrollTrigger: !!window.ScrollTrigger,
        lenis: !!window.lenis || document.documentElement.className.includes('lenis'),
        three: !!window.THREE || !!window.__THREE__,
      },
    };
  });

  const snap = (file) =>
    page
      .screenshot({ path: path.join(dir, file), type: 'jpeg', quality: 70, timeout: 45000 })
      .catch(() => console.log('  screenshot failed:', file));
  await snap('00.jpg');
  const total = facts.scrollHeight;
  const stepPx = Math.max(300, Math.round((total - 900) / site.shots));
  await page.mouse.move(720, 450);
  for (let i = 1; i <= site.shots; i++) {
    // slow wheel scroll so scroll-driven animation actually plays
    let moved = 0;
    while (moved < stepPx) {
      await page.mouse.wheel(0, 120);
      moved += 120;
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(1300);
    const y = await page.evaluate(() => Math.round(window.scrollY));
    await snap(`${String(i).padStart(2, '0')}.jpg`);
    console.log(`  shot ${i} @ ${y}px`);
  }
  facts.finalScrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  facts.scripts = [...new Set(requests.filter((r) => r.t === 'script').map((r) => r.url))].slice(0, 40);
  facts.fontFiles = [...new Set(requests.filter((r) => r.t === 'font').map((r) => r.url))].slice(0, 20);
  await writeFile(path.join(dir, 'facts.json'), JSON.stringify(facts, null, 2));
  await ctx.close();
}
await browser.close();
