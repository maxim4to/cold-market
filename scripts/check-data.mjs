// Sanity checks for data/*.json before building. Errors break the site; warnings are worth a look.
// Usage: npm run check
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const load = (f) => JSON.parse(fs.readFileSync(path.join(root, 'data', f), 'utf-8'));
const products = load('products.json');
const categories = load('categories.json');
const errors = [];
const warnings = [];

const localWebp = (src) => {
  if (!src) return null;
  if (src.startsWith('/img/')) return src.replace(/^\/img\/p\/t\//, '/img/p/');
  const p = decodeURIComponent(src.startsWith('http') ? new URL(src).pathname : src);
  const m = p.match(/img_products\/(?:full_|thumb_)*([^/]+)\.\w+$/);
  const c = p.match(/img_categories\/([^/]+)\.\w+$/);
  if (m) return `/img/p/${m[1]}.webp`;
  if (c) return `/img/c/${c[1]}.webp`;
  return '/img/site' + p.replace(/\.\w+$/, '.webp');
};
const exists = (web) => fs.existsSync(path.join(root, 'public', web));
const pageUrl = /^\/[a-z0-9_\-/]+\.html$/;

const productUrls = new Map();
for (const p of products) {
  const where = p.url || `(без url) ${p.name}`;
  if (!p.url || !pageUrl.test(p.url)) errors.push(`товар ${where}: url должен быть вида /категория/slug.html`);
  if (productUrls.has(p.url)) errors.push(`товар ${where}: url повторяется`);
  productUrls.set(p.url, p);
  if (!p.name?.trim()) errors.push(`товар ${where}: пустое название (name)`);
  if (!p.title?.trim()) warnings.push(`товар ${where}: пустой title — будет плохо в поиске`);
  if (p.price != null && typeof p.price !== 'string') errors.push(`товар ${where}: price должен быть строкой вида "12 345 руб."`);
  if (!Array.isArray(p.specs)) errors.push(`товар ${where}: specs должен быть массивом групп`);
  if (!Array.isArray(p.images)) errors.push(`товар ${where}: images должен быть массивом`);
  for (const im of p.images || []) {
    const web = localWebp(im.full);
    if (!web) errors.push(`товар ${where}: у фото нет full`);
    else if (!exists(web)) warnings.push(`товар ${where}: нет файла public${web} — фото грузится со старого сайта`);
  }
}

const categoryUrls = new Set(categories.map((c) => c.url));
if (categoryUrls.size !== categories.length) errors.push('в categories.json есть повторяющиеся url');
for (const c of categories) {
  if (c.url !== '/' && !pageUrl.test(c.url)) errors.push(`категория ${c.url}: url должен быть вида /slug.html`);
  if (!c.name?.trim() && c.url !== '/') errors.push(`категория ${c.url}: пустое название`);
  for (const s of c.subcategories || []) {
    if (!categoryUrls.has(s.url)) warnings.push(`категория ${c.url}: подкатегория ${s.url} не найдена в categories.json`);
    if (s.image && !exists(localWebp(s.image))) warnings.push(`категория ${c.url}: нет картинки плитки для ${s.url}`);
  }
  for (const u of c.products || []) if (!productUrls.has(u)) errors.push(`категория ${c.url}: товар ${u} не найден в products.json`);
}
if (!categoryUrls.has('/')) errors.push('нет корневой категории "/" — главная не покажет каталог');

const listed = new Set(categories.flatMap((c) => c.products || []));
for (const p of products) if (!listed.has(p.url)) warnings.push(`товар ${p.url} не входит ни в одну категорию — его не видно в каталоге`);

const show = (title, list, max = 40) => {
  if (!list.length) return;
  console.log(`\n${title} (${list.length}):`);
  list.slice(0, max).forEach((l) => console.log('  - ' + l));
  if (list.length > max) console.log(`  … и ещё ${list.length - max}`);
};
show('Ошибки', errors);
show('Предупреждения', warnings, 15);
console.log(`\nТоваров: ${products.length}, категорий: ${categories.length}. ${errors.length ? 'Есть ошибки — исправьте перед сборкой.' : 'Ошибок нет.'}`);
process.exit(errors.length ? 1 : 0);
