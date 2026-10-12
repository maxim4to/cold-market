import fs from 'node:fs';
import path from 'node:path';
import sanitizeHtml from 'sanitize-html';
import sharp from 'sharp';
import { tidyLegacyHtml, innerHtmlOf } from './legacy-html';
import { u } from './url';

export type Spec = { name: string; value: string };
export type SpecGroup = { group: string; fields: Spec[] };
export type ProductImage = { full?: string; medium?: string; thumb?: string; alt: string };
export type Product = {
  url: string;
  id: number | null;
  name: string;
  title: string;
  meta_description: string;
  meta_keywords: string;
  manufacturer: string | null;
  product_code: string | null;
  price: string | null;
  old_price: string | null;
  labels: string[];
  list_labels?: string[];
  list_old_price?: string | null;
  categories?: string[];
  specs: SpecGroup[];
  description_html: string;
  description_text: string;
  images: ProductImage[];
};
export type Category = {
  url: string;
  name: string;
  title: string;
  meta_description: string;
  meta_keywords: string;
  description_html: string;
  subcategories: { url: string; name: string; image: string | null }[];
  products: string[];
};

const dataDir = path.resolve(process.cwd(), 'data');
const load = <T>(f: string): T => JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf-8'));

export const products: Product[] = load('products.json');
export const categories: Category[] = load('categories.json');

export const productByUrl = new Map(products.map((p) => [p.url, p]));
export const categoryByUrl = new Map(categories.map((c) => [c.url, c]));
export const rootCategory = categoryByUrl.get('/')!;
export const topCategories = rootCategory.subcategories;

const parentOf = new Map<string, string>();
for (const c of categories) {
  for (const s of c.subcategories) {
    if (s.url !== c.url && !parentOf.has(s.url)) parentOf.set(s.url, c.url);
  }
}

export function categoryTrail(url: string): { url: string; name: string }[] {
  const trail: { url: string; name: string }[] = [];
  const seen = new Set<string>();
  let cur: string | undefined = url;
  while (cur && cur !== '/' && !seen.has(cur)) {
    seen.add(cur);
    const c = categoryByUrl.get(cur);
    if (c) trail.unshift({ url: c.url, name: c.name });
    cur = parentOf.get(cur);
  }
  return trail;
}

export function primaryCategory(p: Product): string | undefined {
  const own = '/' + p.url.split('/')[1] + '.html';
  if (categoryByUrl.has(own)) return own;
  return p.categories?.[0];
}

export function allLabels(p: Product): string[] {
  return [...new Set([...(p.labels || []), ...(p.list_labels || [])])];
}

export function priceNumber(price: string | null): number | null {
  if (!price) return null;
  const n = Number(price.replace(/[^\d]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const SRC_HOST = 'https://coldmarket-tver.ru';

const publicDir = path.resolve(process.cwd(), 'public');

// Maps an image URL of the old site to its WebP copy in /public/img (see scripts/build-images.mjs).
// Until the copy exists the original URL is used, so the site can go live before all photos are converted.
export function localImage(src: string | null | undefined, size: 'full' | 'thumb' = 'full'): string | null {
  if (!src) return null;
  if (src.startsWith('/img/')) return src;
  let p = src.startsWith('http') ? new URL(src).pathname : src;
  p = decodeURIComponent(p);
  let local: string;
  const m = p.match(/img_products\/(?:full_|thumb_)*([^/]+)\.\w+$/);
  const c = p.match(/img_categories\/([^/]+)\.\w+$/);
  if (m) local = `/img/p/${size === 'thumb' ? 't/' : ''}${m[1]}.webp`;
  else if (c) local = `/img/c/${c[1]}.webp`;
  else local = '/img/site' + p.replace(/\.\w+$/, '.webp');
  return fs.existsSync(path.join(publicDir, local)) ? local : originalImage(src);
}

export function originalImage(src: string): string {
  return src.startsWith('http') ? src : SRC_HOST + src;
}

const allowedTags = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'sup', 'sub', 'ul', 'ol', 'li', 'h2', 'h3', 'h4',
  'table', 'thead', 'tbody', 'tr', 'td', 'th', 'dl', 'dt', 'dd', 'span', 'div', 'a', 'x-h',
];

const staticPages = new Set(['/', '/about.html', '/kontakty.html', '/services.html']);
const knownPage = (p: string) =>
  staticPages.has(p) || productByUrl.has(p) || categoryByUrl.has(p) || p in infoPages ||
  (p.startsWith('/img/') && fs.existsSync(path.join(publicDir, p)));

// Links of the old site: keep the ones that lead to a page of this site (with the base path),
// turn the rest (other sites, dead files like /images/prices/price.xls) into plain text.
function legacyLink(href: string): string | null {
  if (/^(mailto|tel):/.test(href)) return href;
  let p = href.trim().replace(/^https?:\/\/(www\.)?coldmarket-tver\.ru/i, '');
  if (!p || /^[a-z]+:|^\/\/|^#/i.test(p)) return null;
  if (!p.startsWith('/')) p = '/' + p;
  const [pathname, hash = ''] = p.split('#');
  const clean = decodeURI(pathname.split('?')[0]);
  return knownPage(clean) ? u(clean) + (hash ? '#' + hash : '') : null;
}

const descTitle = /^о?писание( товара)?\s*:?$/i;

export function cleanHtml(html: string, opts: { dropTitle?: boolean } = { dropTitle: true }): string {
  const safe = sanitizeHtml(html || '', {
    allowedTags,
    allowedAttributes: { a: ['href'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'] },
    transformTags: {
      // old descriptions use h2 for minor headings; demote so the page keeps one clear outline
      h1: 'h3',
      h2: 'h3',
      h5: 'h4',
      h6: 'h4',
      nobr: 'span',
      // big-font divs were used as headings; tidyLegacyHtml decides by their text
      div: (tagName, attribs) => ({ tagName: /font-size:\s*(2\d|[3-9]\d)px/.test(attribs.style || '') ? 'x-h' : 'div', attribs: {} }),
      a: (tagName, attribs) => {
        const href = legacyLink(attribs.href || '');
        return href ? { tagName: 'a', attribs: { href } } : { tagName: 'span', attribs: {} };
      },
    },
  });
  return tidyLegacyHtml(safe, { dropTitle: opts.dropTitle ? descTitle : undefined });
}

export function plain(html: string): string {
  return sanitizeHtml(html || '', { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim();
}

export type InfoPage = { url: string; title: string; meta_description: string; h1: string; content_html: string };
export const infoPages: Record<string, InfoPage> = load('pages.json');

export function infoContent(url: string): string {
  const p = infoPages[url];
  if (!p) return '';
  // the legacy wrapper also holds the old <h1>, which would repeat the page title as plain text
  const body = innerHtmlOf(p.content_html, (a) => a.itemprop === 'articleBody') ?? p.content_html;
  return cleanHtml(body, { dropTitle: false });
}

export function infoImages(url: string): string[] {
  const p = infoPages[url];
  return p ? [...p.content_html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]) : [];
}

// The old site uses "1 руб." as a placeholder for products without a public price
export function displayPrice(price: string | null): string {
  const n = priceNumber(price);
  return !n || n <= 1 ? 'Цена по запросу' : price!;
}

type Box = { x: number; y: number; w: number; h: number; a: number };
const boxesPath = path.join(dataDir, 'image-boxes.json');
const imageBoxes: Record<string, Box> = fs.existsSync(boxesPath) ? JSON.parse(fs.readFileSync(boxesPath, 'utf-8')) : {};
const FILL = 0.88;

// Inline style that zooms a photo inside a frame of the given aspect ratio (width / height) so the
// product's box fits FILL of the frame, using boxes measured by scripts/build-images.mjs.
// Null when no box is known for the image.
export function framedStyle(src: string | null | undefined, frameAspect = 1): string | null {
  if (!src) return null;
  const path = decodeURIComponent(src);
  const m = path.match(/img_products\/(?:full_|thumb_)*([^/]+)\.\w+$/);
  const c = path.match(/img_categories\/([^/]+)\.\w+$/);
  const b = m ? imageBoxes[`p/${m[1]}`] : c ? imageBoxes[`c/${c[1]}`] : undefined;
  if (!b) return null;
  // frame height = 1, frame width = frameAspect, image height = s, image width = b.a * s
  const s = FILL * Math.min(frameAspect / (b.w * b.a), 1 / b.h);
  const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
  return [
    `width:${pct((b.a * s) / frameAspect)}`,
    `height:${pct(s)}`,
    `left:${pct((frameAspect / 2 - (b.x + b.w / 2) * b.a * s) / frameAspect)}`,
    `top:${pct(0.5 - (b.y + b.h / 2) * s)}`,
  ].join(';');
}

// Products of a category and all its subcategories (unique, existing pages only)
const productSets = new Map<string, Set<string>>();
export function categoryProductUrls(url: string, seen = new Set<string>()): Set<string> {
  const cached = productSets.get(url);
  if (cached) return cached;
  seen.add(url);
  const c = categoryByUrl.get(url);
  const set = new Set((c?.products || []).filter((p) => productByUrl.has(p)));
  for (const s of c?.subcategories || []) {
    if (!seen.has(s.url)) for (const p of categoryProductUrls(s.url, seen)) set.add(p);
  }
  productSets.set(url, set);
  return set;
}
export const productCount = (url: string) => categoryProductUrls(url).size;

export function plural(n: number, [one, few, many]: [string, string, string]): string {
  const d = n % 10, h = n % 100;
  return d === 1 && h !== 11 ? one : d >= 2 && d <= 4 && (h < 12 || h > 14) ? few : many;
}
export const productsLabel = (n: number) => `${n} ${plural(n, ['товар', 'товара', 'товаров'])}`;

// The old "Ремонт оборудования" catalog section is empty; the service page is the useful target.
// Its category page is still built so the old URL keeps working.
const categoryLinkOverrides: Record<string, string> = { '/remont-oborudovaniya.html': '/services/ro.html' };
export type CatalogLink = { url: string; name: string; image: string | null; count: number };
export function catalogLinks(list: { url: string; name: string; image: string | null }[]): CatalogLink[] {
  return list.flatMap((c) => {
    const override = categoryLinkOverrides[c.url];
    const count = productCount(c.url);
    if (override) return [{ ...c, url: override, count: 0 }];
    return count > 0 ? [{ ...c, count }] : [];
  });
}
export const topCatalogLinks = catalogLinks(topCategories);

// Display-only clean-up of spec values: "+" / "-" flags and empty rows
export function specFields(fields: Spec[]): Spec[] {
  return fields
    .map((f) => {
      const v = (f.value || '').trim();
      return { name: (f.name || '').trim(), value: v === '+' ? 'есть' : /^[-–—]$/.test(v) ? 'нет' : v };
    })
    .filter((f) => f.name && f.value);
}

// Keeps short tokens like "б/у" from breaking at the slash
export const noBreakSlash = (s: string) => s.replace(/(^|[\s(«"])([^\s/]{1,3})\/([^\s/]{1,3})(?=$|[\s,.()»"])/g, '$1$2/\u2060$3');

const sizeCache = new Map<string, Promise<{ width: number; height: number } | null>>();
// Natural size of a local /img/... file (null for remote or unknown images)
export function imageSize(src: string | null | undefined): Promise<{ width: number; height: number } | null> {
  if (!src || !src.startsWith('/img/')) return Promise.resolve(null);
  let p = sizeCache.get(src);
  if (!p) {
    p = sharp(path.join(publicDir, src)).metadata()
      .then((m) => (m.width && m.height ? { width: m.width, height: m.height } : null))
      .catch(() => null);
    sizeCache.set(src, p);
  }
  return p;
}
