// Converts original images into WebP copies under public/img and measures product boxes (data/image-boxes.json).
// Usage: node scripts/build-images.mjs <dir>   e.g. `assets` for new photos in assets/products and assets/categories,
// or the scraper/images.py download folder for the legacy site's images. FORCE=1 re-encodes everything.
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
  // assets/generated holds full-size sources of hand-placed site images, not conversion input
  if (rel.startsWith('generated/')) continue;
  // legacy downloads keep the old site's folders; new photos go to assets/products and assets/categories
  if (/(^|\/)(img_products|products)\//.test(rel)) {
    if (base.startsWith('thumb_')) continue;
    const name = base.replace(/^(?:full_|thumb_)+/, '');
    plan.push({ file, dst: `p/${name}.webp`, width: 1200, box: `p/${name}` });
    plan.push({ file, dst: `p/t/${name}.webp`, width: 480 });
  } else if (/(^|\/)(img_categories|categories)\//.test(rel)) {
    plan.push({ file, dst: `c/${base}.webp`, width: 640, box: `c/${base}` });
  } else {
    plan.push({ file, dst: 'site/' + rel.replace(/\.\w+$/, '.webp'), width: 1400 });
  }
}

const FORCE = process.env.FORCE === '1';
let done = 0, skipped = 0, failed = 0;
const boxesFile = path.resolve('data/image-boxes.json');
const boxes = FORCE || !fs.existsSync(boxesFile) ? {} : JSON.parse(fs.readFileSync(boxesFile, 'utf-8'));

// A photo counts as "product on light background" when its corners are near-white.
// Edge midpoints are not checked: tightly cropped products touch the edges there.
async function hasLightBackground(img) {
  const { data, info } = await img.clone().resize(32, 32, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => { const i = (y * info.width + x) * info.channels; return Math.min(data[i], data[i + 1], data[i + 2]); };
  return [px(0, 0), px(31, 0), px(0, 31), px(31, 31)].filter((v) => v > 235).length >= 3;
}

// Bounding box of the product, ignoring thin faint overlays such as supplier watermarks:
// threshold to a "non-background" mask, erase thin strokes with a morphological opening,
// then take the box of the large connected blobs. Returns null for line-art (drawings).
async function contentBox(img) {
  const meta = await img.clone().metadata();
  const scale = Math.min(1, 400 / Math.max(meta.width, meta.height));
  const W = Math.max(1, Math.round(meta.width * scale)), H = Math.max(1, Math.round(meta.height * scale));
  const { data, info } = await img.clone().resize(W, H, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const m = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) { const k = i * info.channels; m[i] = Math.min(data[k], data[k + 1], data[k + 2]) < 236 ? 1 : 0; }
  const R = 3;
  const morph = (src, erode) => {
    const tmp = new Uint8Array(W * H), out = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = erode ? 1 : 0;
      for (let d = -R; d <= R && (erode ? v : !v); d++) { const xx = x + d; const s2 = xx < 0 || xx >= W ? 0 : src[y * W + xx]; v = erode ? v & s2 : v | s2; }
      tmp[y * W + x] = v;
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = erode ? 1 : 0;
      for (let d = -R; d <= R && (erode ? v : !v); d++) { const yy = y + d; const s2 = yy < 0 || yy >= H ? 0 : tmp[yy * W + x]; v = erode ? v & s2 : v | s2; }
      out[y * W + x] = v;
    }
    return out;
  };
  const opened = morph(morph(m, true), false);
  const label = new Int32Array(W * H), comps = [];
  for (let i = 0; i < W * H; i++) {
    if (!opened[i] || label[i]) continue;
    const c = { area: 0, x0: W, y0: H, x1: 0, y1: 0 }, stack = [i]; label[i] = comps.length + 1;
    while (stack.length) {
      const j = stack.pop(), x = j % W, y = (j / W) | 0;
      c.area++; c.x0 = Math.min(c.x0, x); c.x1 = Math.max(c.x1, x); c.y0 = Math.min(c.y0, y); c.y1 = Math.max(c.y1, y);
      for (const n of [j - 1, j + 1, j - W, j + W]) {
        if (n < 0 || n >= W * H || label[n] || !opened[n]) continue;
        if ((n === j - 1 && x === 0) || (n === j + 1 && x === W - 1)) continue;
        label[n] = comps.length + 1; stack.push(n);
      }
    }
    comps.push(c);
  }
  if (!comps.length) return null;
  const biggest = Math.max(...comps.map((c) => c.area));
  if (biggest < W * H * 0.01) return null;
  const keepIds = new Set(comps.map((c, n) => (c.area >= biggest * 0.04 ? n + 1 : 0)).filter(Boolean));
  // morphological reconstruction: grow the kept blobs through the raw mask, so thin light parts
  // attached to the product (blade edges, wire shelves) come back while detached watermarks stay out
  const seen = new Uint8Array(W * H), stack = [];
  for (let i = 0; i < W * H; i++) if (keepIds.has(label[i])) { seen[i] = 1; stack.push(i); }
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  while (stack.length) {
    const j = stack.pop(), x = j % W, y = (j / W) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const n = yy * W + xx;
      if (seen[n] || !m[n]) continue;
      seen[n] = 1; stack.push(n);
    }
  }
  x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(W - 1, x1 + 1); y1 = Math.min(H - 1, y1 + 1);
  const left = Math.floor(x0 / scale), top = Math.floor(y0 / scale);
  return { left, top, width: Math.min(meta.width - left, Math.ceil((x1 - x0 + 1) / scale)), height: Math.min(meta.height - top, Math.ceil((y1 - y0 + 1) / scale)) };
}

// Product bounding box as fractions of the image plus the image aspect ratio. The catalog grid uses it
// to zoom each photo so products shot with different margins look the same size; files stay unmodified.
async function measureBox(file) {
  const img = sharp(file, { animated: false }).rotate().flatten({ background: '#ffffff' });
  if (!(await hasLightBackground(img))) return null;
  const meta = await img.clone().toBuffer({ resolveWithObject: true }).then((r) => r.info);
  let box = await contentBox(img);
  if (!box) {
    const t = await img.clone().trim({ background: '#ffffff', threshold: 28 }).toBuffer({ resolveWithObject: true });
    box = { left: -(t.info.trimOffsetLeft ?? 0), top: -(t.info.trimOffsetTop ?? 0), width: t.info.width, height: t.info.height };
  }
  // a sliver means the detection misfired
  if (box.width < meta.width * 0.15 && box.height < meta.height * 0.15) return null;
  const r = (v) => Math.round(v * 10000) / 10000;
  return { x: r(box.left / meta.width), y: r(box.top / meta.height), w: r(box.width / meta.width), h: r(box.height / meta.height), a: r(meta.width / meta.height) };
}

const queue = plan.slice();
async function worker() {
  while (queue.length) {
    const { file, dst, width, box } = queue.shift();
    const target = path.join(out, dst);
    try {
      if (box && !(box in boxes)) boxes[box] = await measureBox(file);
      if (!FORCE && fs.existsSync(target) && fs.statSync(target).mtimeMs >= fs.statSync(file).mtimeMs) { skipped++; continue; }
      fs.mkdirSync(path.dirname(target), { recursive: true });
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
const sorted = Object.fromEntries(Object.entries(boxes).filter(([, v]) => v).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(boxesFile, JSON.stringify(sorted));
console.log({ planned: plan.length, done, skipped, failed, boxes: Object.keys(sorted).length });
