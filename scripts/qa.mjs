// Visual QA: serves dist/ locally, screenshots key pages on phone and desktop widths and flags horizontal overflow.
// Usage: npm run build && npm run qa [-- /path.html /other.html]
// Screenshots land in qa-shots/ (git-ignored). Needs Chromium: CHROME_PATH or a Playwright-installed browser.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';

const dist = path.resolve('dist');
const base = (process.env.BASE_PATH || '').replace(/\/$/, '');
const out = path.resolve('qa-shots');
const pages = process.argv.slice(2).length ? process.argv.slice(2) : [
  '/', '/kontakty.html', '/about.html', '/services/ro.html', '/services/project.html',
  '/metallicheskie-dveri.html', '/rasprodazha.html', '/morozilnye-bonety/lar-boneta-haier-gts1850g.html',
];
const widths = [360, 393, 1366];

if (!fs.existsSync(dist)) {
  console.error('Нет папки dist — сначала npm run build');
  process.exit(1);
}
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.xml': 'application/xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (base && p.startsWith(base)) p = p.slice(base.length) || '/';
  let file = path.join(dist, p);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}${base}`;

const fallback = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath = process.env.CHROME_PATH || (fs.existsSync(fallback) ? fallback : undefined);
const browser = await chromium.launch({ executablePath });
fs.mkdirSync(out, { recursive: true });
let problems = 0;
for (const w of widths) {
  const mobile = w < 800;
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  for (const p of pages) {
    const res = await page.goto(origin + p, { waitUntil: 'load' });
    if (!res || res.status() !== 200) { console.log(`✗ ${w}px ${p}: HTTP ${res?.status()}`); problems++; continue; }
    // load lazy images, then go back to the top for a full-page shot
    for (let i = 0; i < 20; i++) { await page.mouse.wheel(0, 800); await page.waitForTimeout(40); }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    const ok = sw <= w;
    if (!ok) problems++;
    const name = `${(p.replace(/\.html$/, '').replace(/[/]+/g, '_').replace(/^_|_$/g, '') || 'home')}-${w}.png`;
    await page.screenshot({ path: path.join(out, name), fullPage: true });
    console.log(`${ok ? '✓' : '✗'} ${w}px ${p}${ok ? '' : ` — страница шире экрана (${sw}px)`} → qa-shots/${name}`);
  }
  await ctx.close();
}
await browser.close();
server.close();
console.log(problems ? `\nПроблем: ${problems}. Посмотрите скриншоты.` : '\nГоризонтальной прокрутки нет. Посмотрите скриншоты глазами.');
process.exit(problems ? 1 : 0);
