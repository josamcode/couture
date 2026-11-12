// Screenshots the before/after demo pages in demo-looks/<slug>/ and exports
// optimised AVIF + WebP previews to public/img/looks/<slug>/.
//
//   node scripts/demo-shots.mjs            -> every look
//   node scripts/demo-shots.mjs noir       -> just one look
//
// Set DEMO_PREVIEW_DIR to change where the JPEG review copies go
// (they are for eyeballing only and never belong in the repo).

import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = path.join(ROOT, 'demo-looks');
const OUT_DIR = path.join(ROOT, 'public', 'img', 'looks');
const PREVIEW_DIR =
  process.env.DEMO_PREVIEW_DIR ||
  path.join(tmpdir(), 'couture-demo-previews');

const PAGES = ['off-the-rack', 'couture'];
const VIEWPORT = { width: 1600, height: 1000 };
const SIZES = [
  { suffix: '1600', width: 1600, height: 1000 },
  { suffix: '800', width: 800, height: 500 },
];
const AVIF = { quality: 55, effort: 6 };
const WEBP = { quality: 78, effort: 6 };

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function listSlugs(only) {
  const entries = await readdir(SRC_DIR, { withFileTypes: true });
  const slugs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  if (!only) return slugs;
  if (!slugs.includes(only)) {
    throw new Error(`Unknown look "${only}". Available: ${slugs.join(', ') || '(none)'}`);
  }
  return [only];
}

async function write(pipeline, file, summary) {
  const info = await pipeline.toFile(file);
  console.log(`  wrote ${rel(file).padEnd(52)} ${kb(info.size).padStart(9)}`);
  if (summary) summary.push({ file: rel(file), size: info.size });
}

async function shoot(browser, slug, name, summary) {
  const htmlFile = path.join(SRC_DIR, slug, `${name}.html`);
  if (!(await exists(htmlFile))) throw new Error(`Missing ${rel(htmlFile)}`);

  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (err) => problems.push(`page error: ${err.message}`));
  page.on('requestfailed', (req) => problems.push(`request failed: ${req.url()}`));
  page.on('request', (req) => {
    const url = req.url();
    if (!url.startsWith('file:') && !url.startsWith('data:')) {
      problems.push(`external request (pages must be self-contained): ${url}`);
    }
  });

  try {
    await page.goto(pathToFileURL(htmlFile).href, { waitUntil: 'load' });
    // Force every declared face to load, then wait for the font set to settle.
    const fontReport = await page.evaluate(async () => {
      await Promise.allSettled([...document.fonts].map((f) => f.load()));
      await document.fonts.ready;
      return [...document.fonts].map((f) => ({
        family: f.family.replace(/["']/g, ''),
        weight: f.weight,
        style: f.style,
        status: f.status,
      }));
    });
    const broken = fontReport.filter((f) => f.status !== 'loaded');
    for (const f of broken) problems.push(`font not loaded: ${f.family} ${f.weight} ${f.style} (${f.status})`);
    await page.waitForTimeout(350);

    if (problems.length) throw new Error(`${rel(htmlFile)}\n    - ${problems.join('\n    - ')}`);

    const families = [...new Set(fontReport.map((f) => f.family))].join(', ');
    console.log(`\n${slug}/${name}.html  (fonts: ${families || 'none'})`);

    const png = await page.screenshot({ type: 'png', fullPage: false });

    const outDir = path.join(OUT_DIR, slug);
    await mkdir(outDir, { recursive: true });
    for (const size of SIZES) {
      const base = () =>
        sharp(png).resize(size.width, size.height, { fit: 'cover', kernel: 'lanczos3' });
      await write(base().avif(AVIF), path.join(outDir, `${name}-${size.suffix}.avif`), summary);
      await write(base().webp(WEBP), path.join(outDir, `${name}-${size.suffix}.webp`), summary);
    }

    await mkdir(PREVIEW_DIR, { recursive: true });
    const preview = path.join(PREVIEW_DIR, `${slug}-${name}.jpg`);
    const info = await sharp(png).resize({ width: 1200 }).jpeg({ quality: 84, mozjpeg: true }).toFile(preview);
    console.log(`  wrote ${preview}  ${kb(info.size)}`);
  } finally {
    await context.close();
  }
}

async function main() {
  const slugs = await listSlugs(process.argv[2]);
  if (!slugs.length) throw new Error(`No look folders found in ${rel(SRC_DIR)}`);

  const summary = [];
  const browser = await chromium.launch();
  try {
    for (const slug of slugs) {
      for (const name of PAGES) await shoot(browser, slug, name, summary);
    }
  } finally {
    await browser.close();
  }

  const total = summary.reduce((sum, f) => sum + f.size, 0);
  console.log(`\nDone: ${summary.length} images for ${slugs.length} look(s), ${kb(total)} in total.`);
}

main().catch((err) => {
  console.error(`\ndemo-shots failed: ${err.message}`);
  process.exit(1);
});
