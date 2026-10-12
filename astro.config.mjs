import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: process.env.SITE_URL || 'https://coldmarket-tver.ru',
  base: process.env.BASE_PATH || '/',
  // URLs of the old Joomla site end with .html — keep them 1:1 for SEO
  build: { format: 'file' },
  trailingSlash: 'ignore',
  vite: { plugins: [tailwindcss()] },
});
