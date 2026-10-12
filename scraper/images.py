import sys, os, re, json, time, ssl, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
DATA, OUT = sys.argv[1], sys.argv[2]
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
ctx = ssl.create_default_context(cafile="/root/.ccr/ca-bundle.crt")
BASE = "https://coldmarket-tver.ru"

urls = set()
for p in json.load(open(os.path.join(DATA, 'products.json'))):
    for i in p['images']:
        urls.update(u for u in (i.get('full'), i.get('thumb')) if u)
for c in json.load(open(os.path.join(DATA, 'categories.json'))):
    urls.update(s['image'] for s in c['subcategories'] if s.get('image'))
for pg in json.load(open(os.path.join(DATA, 'pages.json'))).values():
    urls.update(re.findall(r'<img[^>]+src="([^"]+)"', pg['content_html']))
urls.update([BASE + '/images/2021/02/12/logoxm.png', BASE + '/images/favicon.ico', BASE + '/images/logoxm.png'])
urls = {urllib.parse.urljoin(BASE + '/', u) for u in urls}
urls = {u for u in urls if urllib.parse.urlparse(u).netloc == 'coldmarket-tver.ru'}

def get(u):
    dst = os.path.join(OUT, urllib.parse.unquote(urllib.parse.urlparse(u).path).lstrip('/'))
    if os.path.exists(dst) and os.path.getsize(dst) > 0:
        return 'skip', u
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    for i in range(5):
        try:
            r = urllib.request.urlopen(urllib.request.Request(urllib.parse.quote(u, safe=':/?=&%'), headers={"User-Agent": UA}), context=ctx, timeout=30)
            open(dst, 'wb').write(r.read())
            return 'ok', u
        except urllib.error.HTTPError as e:
            return 'http%d' % e.code, u
        except Exception:
            time.sleep(1 + i)
    return 'fail', u

res = {}
with ThreadPoolExecutor(8) as ex:
    for st, u in ex.map(get, sorted(urls)):
        res.setdefault(st, []).append(u)
        if st not in ('ok', 'skip'):
            print(st, u, flush=True)
print({k: len(v) for k, v in res.items()})
json.dump(res, open(os.path.join(OUT, '_result.json'), 'w'), indent=1)
