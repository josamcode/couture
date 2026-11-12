// Image pipeline for the hero painting.
//   in : assets-src/hero/painting.(jpg|png|webp)   — any size, ideally 16:9 and ≥ 2560 px wide
//   out: public/img/hero/painting-{640,960,1280,1920,2560}.{avif,webp} + painting-1280.jpg (last-resort fallback)
// Run: npm run images   (this also runs the line-art script afterwards)
import { existsSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export const WIDTHS = [640, 960, 1280, 1920, 2560];
export const RATIO = 16 / 9;
export const OUT_DIR = 'public/img/hero';

export function findSource() {
  for (const ext of ['jpg', 'jpeg', 'png', 'webp', 'avif']) {
    const p = `assets-src/hero/painting.${ext}`;
    if (existsSync(p)) return p;
  }
  throw new Error('No source image. Put your painting at assets-src/hero/painting.jpg (16:9).');
}

// Quality per width: the small sizes are what phones download, so they are tuned hardest.
const AVIF_Q = { 640: 64, 960: 63, 1280: 62, 1920: 58, 2560: 54 };
const WEBP_Q = { 640: 82, 960: 81, 1280: 80, 1920: 78, 2560: 74 };

async function main() {
  const src = findSource();
  const meta = await sharp(src).metadata();
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`source ${src} ${meta.width}×${meta.height}`);
  if (Math.abs(meta.width / meta.height - RATIO) > 0.01) {
    console.log('  note: source is not 16:9; it will be centre-cropped to 16:9.');
  }

  for (const w of WIDTHS) {
    const h = Math.round(w / RATIO);
    const base = sharp(src).resize(w, h, { fit: 'cover', position: 'attention', withoutEnlargement: false });
    const avif = path.join(OUT_DIR, `painting-${w}.avif`);
    const webp = path.join(OUT_DIR, `painting-${w}.webp`);
    await base.clone().avif({ quality: AVIF_Q[w], effort: 7, chromaSubsampling: '4:2:0' }).toFile(avif);
    await base.clone().webp({ quality: WEBP_Q[w], effort: 6 }).toFile(webp);
    const [a, b] = await Promise.all([stat(avif), stat(webp)]);
    console.log(`  ${w}×${h}  avif ${(a.size / 1024).toFixed(0)} KB · webp ${(b.size / 1024).toFixed(0)} KB`);
  }
  const jpg = path.join(OUT_DIR, 'painting-1280.jpg');
  await sharp(src).resize(1280, 720, { fit: 'cover', position: 'attention' }).jpeg({ quality: 74, mozjpeg: true }).toFile(jpg);
  console.log(`  fallback ${jpg} ${((await stat(jpg)).size / 1024).toFixed(0)} KB`);

  // Hard gate from the brief: the size phones load (1280w covers a 412 px screen at DPR ≤ 3) must stay ≤ 250 KB.
  const mobile = (await stat(path.join(OUT_DIR, 'painting-1280.avif'))).size;
  if (mobile > 250 * 1024) {
    throw new Error(`Hero AVIF for phones is ${(mobile / 1024).toFixed(0)} KB (> 250 KB budget). Lower AVIF_Q[1280].`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/images.mjs')) {
  await main();
}
