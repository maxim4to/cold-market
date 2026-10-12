import sys, os, re, json, html, urllib.parse
from bs4 import BeautifulSoup
D, OUT = sys.argv[1], sys.argv[2]
BASE = "https://coldmarket-tver.ru"
idx = json.load(open(os.path.join(D, '_index.json')))

def clean(s):
    return re.sub(r'\s+', ' ', html.unescape(s or '')).strip()

def path_of(u):
    p = urllib.parse.urlparse(u)
    return p.path + (('?' + p.query) if p.query else '')

def meta(soup, name):
    m = soup.find('meta', attrs={'name': name})
    return clean(m['content']) if m and m.get('content') else ''

def inner_html(el):
    if not el:
        return ''
    return ''.join(str(c) for c in el.contents).strip()

products, categories, pages = {}, {}, {}
listing = {}  # product path -> data seen in category listings (labels, list price)

for url, v in idx.items():
    if not v.get('file') or 'korzina' in url:
        continue
    raw = open(os.path.join(D, v['file']), encoding='utf-8', errors='replace').read()
    soup = BeautifulSoup(raw, 'lxml')
    path = path_of(url)
    title = clean(soup.title.string if soup.title else '')
    common = dict(url=path, title=title, meta_description=meta(soup, 'description'), meta_keywords=meta(soup, 'keywords'))
    body = soup.find(id='comjshop')

    if soup.find('form', class_='productfull'):
        form = soup.find('form', class_='productfull')
        pid = form.find('input', id='product_id')
        cid = form.find('input', id='category_id')
        h1 = soup.find('h1')
        images = []
        for a in form.select('a.lightbox'):
            img = a.find('img')
            images.append(dict(full=a.get('href'), medium=img.get('src') if img else None,
                               alt=clean(img.get('alt')) if img else ''))
        thumbs = [i.get('src') for i in form.select('img.jshop_img_thumb')]
        for i, t in enumerate(thumbs):
            if i < len(images):
                images[i]['thumb'] = t
        groups = []
        ef = form.find('div', class_='extra_fields')
        if ef:
            for g in ef.find_all('div', class_='block_efg') or [ef]:
                gname = g.find('div', class_='extra_fields_group')
                items = [dict(name=clean(e.find(class_='extra_fields_name').get_text()),
                              value=clean(e.find(class_='extra_fields_value').get_text()))
                         for e in g.find_all('div', class_='extra_fields_el')
                         if e.find(class_='extra_fields_name')]
                if items:
                    groups.append(dict(group=clean(gname.get_text()) if gname else '', fields=items))
        price_el = form.find(id='block_price')
        old_el = form.find(id='old_price')
        old_wrap = form.find('div', class_='old_price')
        man = form.find('div', class_='manufacturer_name')
        code = form.find(id='product_code')
        avail = form.find(class_=re.compile('not_available|available'))
        desc = form.find('div', class_='jshop_prod_description')
        labels = [clean(i.get('alt')) for i in form.select('.product_label img')]
        products[path] = dict(
            **common,
            id=int(pid['value']) if pid and pid.get('value', '').isdigit() else None,
            category_id=int(cid['value']) if cid and cid.get('value', '').isdigit() else None,
            name=clean(h1.get_text()) if h1 else '',
            manufacturer=clean(man.find('span').get_text()) if man and man.find('span') else None,
            product_code=clean(code.get_text()) if code else None,
            price=clean(price_el.get_text()) if price_el else None,
            old_price=clean(old_el.get_text()) if old_el and old_wrap and 'display:none' not in (old_wrap.get('style') or '').replace(' ', '') else None,
            labels=labels,
            availability=clean(avail.get_text()) if avail else None,
            specs=groups,
            description_html=inner_html(desc),
            description_text=clean(desc.get_text(' ')) if desc else '',
            images=images,
        )
    elif body and (body.find('div', class_='jshop_list_category') is not None or body.find(id='comjshop_list_product')):
        h1 = body.find('h1')
        base_path = urllib.parse.urlparse(url).path
        cat = categories.setdefault(base_path, dict(url=base_path, title=title, meta_description=common['meta_description'],
                                                    meta_keywords=common['meta_keywords'], name='', description_html='',
                                                    subcategories=[], products=[]))
        if '?start=' not in path:
            cat.update(name=clean(h1.get_text()) if h1 else '', title=title,
                       description_html=inner_html(body.find('div', class_='category_description')))
            for c in body.select('.jshop_list_category a'):
                href = c.get('href')
                if not href or href in [s['url'] for s in cat['subcategories']]:
                    continue
                img = c.find('img')
                if img or c.get_text(strip=True):
                    ex = next((s for s in cat['subcategories'] if s['url'] == href), None)
                    if not ex:
                        cat['subcategories'].append(dict(url=href, name='', image=None))
                        ex = cat['subcategories'][-1]
                    if img:
                        ex['image'] = img.get('src')
                    if c.get_text(strip=True):
                        ex['name'] = clean(c.get_text())
        for pdiv in body.select('#comjshop_list_product div.product'):
            a = pdiv.select_one('.name a')
            if not a:
                continue
            ppath = a.get('href')
            if ppath not in cat['products']:
                cat['products'].append(ppath)
            price = pdiv.select_one('.jshop_price span')
            old = pdiv.select_one('.old_price span')
            listing.setdefault(ppath, dict(list_price=clean(price.get_text()) if price else None,
                                           list_old_price=clean(old.get_text()) if old else None,
                                           list_labels=[clean(i.get('alt')) for i in pdiv.select('.product_label img')],
                                           categories=[]))
            if base_path not in listing[ppath]['categories']:
                listing[ppath]['categories'].append(base_path)
    else:
        main = soup.find(id='sp-component') or soup.find('main')
        h1 = soup.find('h1')
        pages[path] = dict(**common, h1=clean(h1.get_text()) if h1 else '',
                           content_html=inner_html(main) if main else '')

for p, l in listing.items():
    if p in products:
        products[p].update(l)
for c in categories.values():
    # subcategory names fall back to the category's own H1 when the tile has image only
    for s in c['subcategories']:
        if not s['name'] and s['url'] in categories:
            s['name'] = categories[s['url']]['name']

os.makedirs(OUT, exist_ok=True)
missing = sorted(set(listing) - set(products))
json.dump(sorted(products.values(), key=lambda x: x['url']), open(os.path.join(OUT, 'products.json'), 'w'), ensure_ascii=False, indent=1)
json.dump(sorted(categories.values(), key=lambda x: x['url']), open(os.path.join(OUT, 'categories.json'), 'w'), ensure_ascii=False, indent=1)
json.dump(pages, open(os.path.join(OUT, 'pages.json'), 'w'), ensure_ascii=False, indent=1)
print('products', len(products), 'categories', len(categories), 'pages', len(pages), 'listed-but-not-fetched', len(missing))
print('no price', sum(1 for p in products.values() if not p['price']), 'zero price', sum(1 for p in products.values() if p['price'] and p['price'].startswith('0 ')))
print('pages:', list(pages)[:40])
