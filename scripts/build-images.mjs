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
    const name = base.replace(/^full_/, '');
    plan.push({ file, dst: `p/${name}.webp`, width: 1200 });
    plan.push({ file, dst: `p/t/${name}.webp`, width: 480 });
  } else if (rel.includes('img_categories/')) {
    plan.push({ file, dst: `c/${base}.webp`, width: 640 });
  } else {
    plan.push({ file, dst: 'site/' + rel.replace(/\.\w+$/, '.webp'), width: 1400 });
  }
}

let done = 0, skipped = 0, failed = 0;
const queue = plan.slice();
async function worker() {
  while (queue.length) {
    const { file, dst, width } = queue.shift();
    const target = path.join(out, dst);
    if (fs.existsSync(target) && fs.statSync(target).mtimeMs >= fs.statSync(file).mtimeMs) { skipped++; continue; }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    try {
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
console.log({ planned: plan.length, done, skipped, failed });
