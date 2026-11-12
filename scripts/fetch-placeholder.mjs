// Downloads the PLACEHOLDER hero painting from The Met Collection API and crops it to 16:9.
// It refuses to continue unless the API says the object is public domain.
// Output: assets-src/hero/painting.jpg  (then run `npm run images`)
//
// This is only used until Jo's own artwork arrives. See README → "Replace the hero painting".
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const OBJECT_ID = 435802; // Bronzino, "Portrait of a Young Man", 1530s
// Crop window as fractions of the original image: a 16:9 slice across the sitter's head and sleeves.
const CROP = { top: 0.085, widthFrac: 0.955 }; // slightly inside the panel so its raw edges do not show

const api = `https://collectionapi.metmuseum.org/public/collection/v1/objects/${OBJECT_ID}`;
const headers = { 'User-Agent': 'Mozilla/5.0 (image pipeline)' };

const meta = await (await fetch(api, { headers })).json();
if (!meta.isPublicDomain) throw new Error(`Object ${OBJECT_ID} is not marked public domain. Stop.`);
if (!meta.primaryImage) throw new Error('No primary image on this object.');

console.log(`${meta.title} — ${meta.artistDisplayName}, ${meta.objectDate}`);
console.log(`public domain: ${meta.isPublicDomain} · ${meta.objectURL}`);

const buf = Buffer.from(await (await fetch(meta.primaryImage, { headers })).arrayBuffer());
const src = sharp(buf);
const { width, height } = await src.metadata();
const w = Math.round(width * CROP.widthFrac);
const h = Math.round((w * 9) / 16);
const left = Math.round((width - w) / 2);
const top = Math.min(height - h, Math.round(height * CROP.top));

await mkdir('assets-src/hero', { recursive: true });
await src
  .extract({ left, top, width: w, height: h })
  .resize({ width: Math.min(w, 2560) })
  .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
  .toFile('assets-src/hero/painting.jpg');

await writeFile(
  'assets-src/hero/SOURCE.json',
  JSON.stringify(
    {
      placeholder: true,
      objectID: meta.objectID,
      title: meta.title,
      artist: meta.artistDisplayName,
      date: meta.objectDate,
      sourceUrl: meta.objectURL,
      imageUrl: meta.primaryImage,
      isPublicDomain: meta.isPublicDomain,
      license: 'Public domain (CC0 1.0) — The Met Open Access',
      original: { width, height },
      crop: { left, top, width: w, height: h },
    },
    null,
    2,
  ) + '\n',
);
console.log(`original ${width}×${height} → crop ${w}×${h} at (${left},${top}) → assets-src/hero/painting.jpg`);
