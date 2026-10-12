// Converts images downloaded by scraper/images.py into WebP copies under public/img.
// Usage: node scripts/build-images.mjs <dir-with-original-images>
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const src = process.argv[2];
if (!src) {
  console.error('usage: node scripts/build-images.mjs <originals-dir>');
  process.exit(1);
}
const out = path.resolve('public/img');
const jobs = [];

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(jpe?g|png|gif|webp)$/i.test(e.name)) jobs.push(p);
  }
}
walk(src);

const plan = [];
for (const file of jobs) {
  const rel = path.relative(src, file).split(path.sep).join('/');
  const base = path.basename(file).replace(/\.\w+$/, '');
  if (rel.includes('img_products/')) {
    if (base.startsWith('thumb_')) continue;
    const name = base.replace(/^(?:full_|thumb_)+/, '');
    plan.push({ file, dst: `p/${name}.webp`, width: 1200, normalize: true });
    plan.push({ file, dst: `p/t/${name}.webp`, width: 480, normalize: true });
  } else if (rel.includes('img_categories/')) {
    plan.push({ file, dst: `c/${base}.webp`, width: 640, normalize: true });
  } else {
    plan.push({ file, dst: 'site/' + rel.replace(/\.\w+$/, '.webp'), width: 1400 });
  }
}

const FORCE = process.env.FORCE === '1';
const FILL = 0.88; // share of the square canvas taken by the product's longer side
let done = 0, skipped = 0, failed = 0, normalized = 0;

// A photo counts as "product on light background" when its corners are near-white.
// Edge midpoints are not checked: tightly cropped products touch the edges there.
async function hasLightBackground(img) {
  const { data, info } = await img.clone().resize(32, 32, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => { const i = (y * info.width + x) * info.channels; return Math.min(data[i], data[i + 1], data[i + 2]); };
  return [px(0, 0), px(31, 0), px(0, 31), px(31, 31)].filter((v) => v > 235).length >= 3;
}

// Crops the empty light margins and centers the product on a square canvas with equal padding,
// so items shot with different margins look the same size in the catalog grid
async function normalizeToSquare(file, size) {
  const src = sharp(file, { animated: false }).rotate().flatten({ background: '#ffffff' });
  if (!(await hasLightBackground(src))) return null;
  const trimmed = await src.clone().trim({ background: '#ffffff', threshold: 28 }).toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = trimmed.info;
  const orig = await src.clone().metadata();
  // trimming to a sliver means the detection misfired; keep the original framing
  if (w < orig.width * 0.15 && h < orig.height * 0.15) return null;
  const inner = Math.round(size * FILL);
  const fitted = await sharp(trimmed.data).resize({ width: inner, height: inner, fit: 'inside', withoutEnlargement: false }).toBuffer({ resolveWithObject: true });
  const { width: fw, height: fh } = fitted.info;
  const left = Math.floor((size - fw) / 2), top = Math.floor((size - fh) / 2);
  return sharp(fitted.data).extend({ left, right: size - fw - left, top, bottom: size - fh - top, background: '#ffffff' });
}
const queue = plan.slice();
async function worker() {
  while (queue.length) {
    const { file, dst, width, normalize } = queue.shift();
    const target = path.join(out, dst);
    if (!FORCE && fs.existsSync(target) && fs.statSync(target).mtimeMs >= fs.statSync(file).mtimeMs) { skipped++; continue; }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    try {
      const norm = normalize ? await normalizeToSquare(file, width) : null;
      if (norm) {
        await norm.webp({ quality: 78, effort: 5 }).toFile(target);
        normalized++; done++;
        continue;
      }
      await sharp(file, { animated: false })
        .rotate()
        .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .webp({ quality: 78, effort: 5 })
        .toFile(target);
      done++;
    } catch (e) {
      failed++;
      console.error('fail', file, e.message);
    }
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
console.log({ planned: plan.length, done, normalized, skipped, failed });
