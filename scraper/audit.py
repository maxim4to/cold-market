import sys, os, re, json, collections, html
D=sys.argv[1]
idx=json.load(open(os.path.join(D,'_index.json')))
rows=[]
for u,v in idx.items():
    if not v.get('file'): rows.append(dict(url=u,status=v['status'])); continue
    h=open(os.path.join(D,v['file'])).read()
    g=lambda p: (re.search(p,h,re.S|re.I) or [None,None])[1]
    title=html.unescape(g(r'<title>(.*?)</title>') or '').strip()
    desc=html.unescape(g(r'name="description" content="([^"]*)') or '')
    h1=[re.sub(r'<[^>]+>','',x).strip() for x in re.findall(r'<h1[^>]*>(.*?)</h1>',h,re.S)]
    price=g(r'id="block_price"[^>]*>\s*([^<]+)')
    isprod='product_id' in h and 'id="block_price"' in h
    imgs=re.findall(r'<img[^>]+src="([^"]+)"',h)
    noalt=len([1 for m in re.findall(r'<img[^>]*>',h) if not re.search(r'alt="[^"]+"',m)])
    rows.append(dict(url=u,status=v['status'],title=title,desc=desc,h1=h1,isprod=isprod,price=(price or '').strip(),imgs=len(imgs),noalt=noalt,size=len(h)))
json.dump(rows,open(os.path.join(D,'..','audit.json'),'w'),ensure_ascii=False,indent=1)
ok=[r for r in rows if r.get('title') is not None]
prods=[r for r in ok if r['isprod']]
print('pages',len(rows),'ok',len(ok),'non200',[ (r['url'],r['status']) for r in rows if r['status']!=200])
print('products',len(prods),'other',len(ok)-len(prods))
print('no description',sum(1 for r in ok if not r['desc'].strip()))
print('no h1',[r['url'] for r in ok if not r['h1']][:30])
dt=collections.Counter(r['title'] for r in ok); print('dup titles',[(t,c) for t,c in dt.items() if c>1][:15])
dd=collections.Counter(r['desc'] for r in ok if r['desc']); print('dup desc',sum(c for t,c in dd.items() if c>1))
print('prices',collections.Counter('none' if not r['price'] else ('zero' if r['price'].startswith('0') else 'set') for r in prods))
print('avg html KB',sum(r['size'] for r in ok)//len(ok)//1024,'imgs no alt total',sum(r['noalt'] for r in ok))
cats=collections.Counter(r['url'].split('/')[3] for r in prods); print('products by top path',cats.most_common())
