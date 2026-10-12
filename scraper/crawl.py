import sys, os, re, time, json, hashlib, urllib.request, urllib.parse, ssl, threading
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
OUT=sys.argv[1]; BASE="https://coldmarket-tver.ru"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
ctx=ssl.create_default_context(cafile="/root/.ccr/ca-bundle.crt")
SKIP=re.compile(r'\.(jpg|jpeg|png|gif|webp|svg|ico|css|js|pdf|zip|doc|docx|xls|xlsx|mp4|woff2?|ttf)(\?|$)',re.I)
BAD=re.compile(r'(task=|/cart|/user|/login|/wishlist|/korzina/|/korzina\.html|format=|print=|tmpl=|orderby|order=|/search|/checkout|add_to_cart|/register|/vendor)',re.I)
class P(HTMLParser):
    def __init__(s): super().__init__(); s.l=[]
    def handle_starttag(s,t,a):
        if t=='a':
            for k,v in a:
                if k=='href' and v: s.l.append(v)
def fetch(u):
    for i in range(5):
        try:
            r=urllib.request.urlopen(urllib.request.Request(u,headers={"User-Agent":UA}),context=ctx,timeout=20)
            return r.status, r.geturl(), r.read().decode('utf-8','replace')
        except urllib.error.HTTPError as e: return e.code,u,''
        except Exception: time.sleep(1+i)
    return 0,u,''
ip=os.path.join(OUT,"_index.json")
idx=json.load(open(ip)) if os.path.exists(ip) else {}
lock=threading.Lock(); seen=set()
def links(fu,h):
    p=P(); p.feed(h); r=[]
    for l in p.l:
        a=urllib.parse.urljoin(fu,l.replace('&amp;','&')).split('#')[0]; pu=urllib.parse.urlparse(a)
        if pu.netloc not in ('coldmarket-tver.ru','www.coldmarket-tver.ru'): continue
        a=BASE+pu.path+(('?'+pu.query) if pu.query else '')
        if not SKIP.search(a) and not BAD.search(a): r.append(a)
    return r
def work(u):
    if u in idx and idx[u].get('file'):
        h=open(os.path.join(OUT,idx[u]['file'])).read(); fu=idx[u]['final']
    else:
        st,fu,h=fetch(u); fn=hashlib.md5(u.encode()).hexdigest()[:12]+".html"
        if h: open(os.path.join(OUT,fn),'w').write(h)
        with lock: idx[u]={"status":st,"final":fu,"file":fn if h else None}
        print(st,u,flush=True)
    return links(fu,h)
frontier=[BASE+"/"]
with ThreadPoolExecutor(8) as ex:
    while frontier:
        batch=[u for u in dict.fromkeys(frontier) if u not in seen]; seen.update(batch)
        nxt=[]
        for r in ex.map(work,batch): nxt+=r
        frontier=[u for u in nxt if u not in seen]
        with lock: json.dump(idx,open(ip,'w'),ensure_ascii=False,indent=1)
        print("== level done, next",len(set(frontier)),flush=True)
