import fs from 'node:fs';
import path from 'node:path';
import sanitizeHtml from 'sanitize-html';

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
  let p = src.startsWith('http') ? new URL(src).pathname : src;
  p = decodeURIComponent(p);
  let local: string;
  const m = p.match(/img_products\/(?:full_|thumb_)?([^/]+)\.\w+$/);
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
  'table', 'thead', 'tbody', 'tr', 'td', 'th', 'dl', 'dt', 'dd', 'span', 'div', 'a', 'nobr',
];

export function cleanHtml(html: string): string {
  return sanitizeHtml(html || '', {
    allowedTags,
    allowedAttributes: { a: ['href'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'] },
    transformTags: {
      // old descriptions use h2 for minor headings; demote so the page keeps one clear outline
      h2: 'h3',
      a: (tagName, attribs) => {
        const href = attribs.href || '';
        const external = /^https?:/.test(href) && !href.includes('coldmarket-tver.ru');
        return { tagName: external ? 'span' : 'a', attribs: external ? {} : { href: href.replace(SRC_HOST, '') } };
      },
    },
    exclusiveFilter: (frame) => ['p', 'span', 'div'].includes(frame.tag) && !frame.text.trim() && !frame.mediaChildren?.length,
  })
    .replace(/(&nbsp;|\s)+(<\/p>)/g, '$2')
    .replace(/(<br \/>\s*){3,}/g, '<br /><br />');
}

export function plain(html: string): string {
  return sanitizeHtml(html || '', { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim();
}

export type InfoPage = { url: string; title: string; meta_description: string; h1: string; content_html: string };
export const infoPages: Record<string, InfoPage> = load('pages.json');

export function infoContent(url: string): string {
  const p = infoPages[url];
  if (!p) return '';
  return sanitizeHtml(p.content_html, {
    allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'table', 'thead', 'tbody', 'tr', 'td', 'th'],
    allowedAttributes: { td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'] },
    exclusiveFilter: (frame) => ['p', 'li'].includes(frame.tag) && !frame.text.trim(),
  })
    .replace(/<li>\s*<p>([\s\S]*?)<\/p>\s*<\/li>/g, '<li>$1</li>')
    .replace(/<p>\s*<br \/>/g, '<p>');
}

export function infoImages(url: string): string[] {
  const p = infoPages[url];
  return p ? [...p.content_html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]) : [];
}
