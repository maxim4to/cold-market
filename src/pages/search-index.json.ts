import type { APIRoute } from 'astro';
import {
  products, categoryByUrl, primaryCategory, localImage, displayPrice, allLabels, catalogLinks, categories,
} from '../lib/catalog';

// Compact index loaded by the header search on first open.
// p: [name, brand, url, price, thumb, category #, sale?] — thumb is a file name in /img/p/t/ (or a full path),
// category # points into k (category names). c: [name, url, product count] for the "Разделы" block.
export const GET: APIRoute = () => {
  const k: string[] = [];
  const kIndex = new Map<string, number>();
  const cat = (name: string) => {
    if (!kIndex.has(name)) { kIndex.set(name, k.length); k.push(name); }
    return kIndex.get(name)!;
  };
  const p = products
    .filter((x) => categoryByUrl.get(primaryCategory(x) || '') || x.categories?.length)
    .map((x) => {
      const thumb = localImage(x.images[0]?.thumb || x.images[0]?.medium, 'thumb') || '';
      const own = thumb.match(/^\/img\/p\/t\/(.+)\.webp$/);
      return [
        x.name,
        x.manufacturer || '',
        x.url.replace(/\.html$/, ''),
        displayPrice(x.price).replace(/ руб\.$/, ''),
        own ? own[1] : thumb,
        cat(categoryByUrl.get(primaryCategory(x) || '')?.name || ''),
        allLabels(x).includes('Sale') ? 1 : 0,
      ];
    });
  const c = catalogLinks(categories.filter((x) => x.url !== '/')).map((x) => [x.name, x.url, x.count]);
  return new Response(JSON.stringify({ k, p, c }), { headers: { 'Content-Type': 'application/json' } });
};
