// Line-art generator: turns the hero painting into ivory lines on transparent.
//   grayscale → median + light blur → Sobel X/Y (sharp.convolve) → magnitude → soft threshold → ivory on alpha
//   out: public/img/hero/lineart-{640,1280,1920,2560}.{avif,webp}
// Run: npm run lineart   (or `npm run images`, which runs both)
//
// Tuning knobs (change, re-run, look at public/img/hero/lineart-1280.webp on a dark background):
const TUNE = {
  workWidth: 1920, // edges are detected at this size, then resized
  clahe: 96, // local-contrast window (px): lets dark-on-dark folds register as edges
  claheSlope: 5, // 1 = off, higher = more hidden detail (and more noise)
  median: 5, // removes craquelure and canvas weave before edge detection
  blur: 1.5, // larger = fewer, broader strokes
  low: 0.17, // soft threshold start (fraction of the 99.6th-percentile gradient)
  high: 0.6, // soft threshold end; anything stronger is a full-strength line
  gamma: 0.8, // < 1 lifts faint lines, > 1 hides them
  despeckle: 3, // median on the finished line mask: removes isolated dots
  soften: 0.45, // final anti-alias blur
};
const IVORY = { r: 0xf4, g: 0xf1, b: 0xea };

import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { WIDTHS, RATIO, OUT_DIR, findSource } from './images.mjs';

const src = findSource();
const W = TUNE.workWidth;
const H = Math.round(W / RATIO);

// Pass 1 (its own sharp pipeline, because sharp runs CLAHE late in a fixed order):
// local contrast, so folds hidden in dark cloth register as edges.
const prepped = await sharp(src)
  .resize(W, H, { fit: 'cover', position: 'attention' })
  .greyscale()
  .clahe({ width: TUNE.clahe, height: TUNE.clahe, maxSlope: TUNE.claheSlope })
  .png()
  .toBuffer();
// Pass 2: denoise, then edges.
const grey = sharp(prepped).median(TUNE.median).blur(TUNE.blur);

// Sobel kernels. sharp clamps to 0..255, so the signed result is stored as value/8 + 128.
const sobel = (kernel) =>
  grey
    .clone()
    .convolve({ width: 3, height: 3, kernel, scale: 8, offset: 128 })
    .toColourspace('b-w')
    .raw()
    .toBuffer({ resolveWithObject: true });
const [sx, sy] = await Promise.all([
  sobel([-1, 0, 1, -2, 0, 2, -1, 0, 1]),
  sobel([-1, -2, -1, 0, 0, 0, 1, 2, 1]),
]);

const n = W * H;
const ch = sx.info.channels; // 1 for b-w, but never assume: index by the real stride
if (sx.info.width !== W || sx.info.height !== H) throw new Error('unexpected Sobel buffer size');
const gx = sx.data;
const gy = sy.data;
const mag = new Float32Array(n);
for (let i = 0; i < n; i++) mag[i] = Math.hypot(gx[i * ch] - 128, gy[i * ch] - 128);

// Normalise against a high percentile so one hard edge does not flatten everything else.
const hist = new Uint32Array(256);
for (let i = 0; i < n; i++) hist[Math.min(255, Math.round(mag[i]))]++;
let acc = 0;
let p = 255;
for (let v = 0; v < 256; v++) {
  acc += hist[v];
  if (acc >= n * 0.996) {
    p = Math.max(v, 4);
    break;
  }
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mask = Buffer.alloc(n);
for (let i = 0; i < n; i++) {
  const v = Math.min(1, mag[i] / p);
  mask[i] = Math.round(255 * Math.pow(smooth(TUNE.low, TUNE.high, v), TUNE.gamma));
}

const alpha = await sharp(mask, { raw: { width: W, height: H, channels: 1 } })
  .median(TUNE.despeckle)
  .blur(TUNE.soften)
  .toColourspace('b-w')
  .raw()
  .toBuffer({ resolveWithObject: true });
const ach = alpha.info.channels;

const rgba = Buffer.alloc(n * 4);
for (let i = 0; i < n; i++) {
  rgba[i * 4] = IVORY.r;
  rgba[i * 4 + 1] = IVORY.g;
  rgba[i * 4 + 2] = IVORY.b;
  rgba[i * 4 + 3] = alpha.data[i * ach];
}
const art = sharp(rgba, { raw: { width: W, height: H, channels: 4 } });

await mkdir(OUT_DIR, { recursive: true });
for (const w of WIDTHS) {
  const h = Math.round(w / RATIO);
  const out = art.clone().resize(w, h, { kernel: w > W ? 'cubic' : 'lanczos3' });
  const avif = path.join(OUT_DIR, `lineart-${w}.avif`);
  const webp = path.join(OUT_DIR, `lineart-${w}.webp`);
  await out.clone().avif({ quality: 42, effort: 7 }).toFile(avif);
  await out.clone().webp({ quality: 50, alphaQuality: 62, effort: 6 }).toFile(webp);
  const [a, b] = await Promise.all([stat(avif), stat(webp)]);
  console.log(`  lineart ${w}×${h}  avif ${(a.size / 1024).toFixed(0)} KB · webp ${(b.size / 1024).toFixed(0)} KB`);
}
console.log(`line-art done (gradient p99.6 = ${p})`);
