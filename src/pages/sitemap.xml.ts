import type { APIRoute } from 'astro';
import { categories, products } from '../lib/catalog';
import { abs } from '../lib/url';

export const GET: APIRoute = ({ site }) => {
  const urls = [
    '/', '/about.html', '/services/project.html', '/services/montaz.html', '/services/to.html', '/services/ro.html', '/kontakty.html',
    ...categories.filter((c) => c.url !== '/').map((c) => c.url),
    ...products.map((p) => p.url),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((x) => `<url><loc>${abs(x, site)}</loc></url>`)
    .join('\n')}\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
};
