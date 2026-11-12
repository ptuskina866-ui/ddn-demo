"""Capture the public ddn.by catalogue and optimize its images for a static demo."""
from __future__ import annotations
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlsplit, urljoin, unquote
from html.parser import HTMLParser
from html import unescape, escape
import xml.etree.ElementTree as ET
import hashlib, json, re, time, threading, io, datetime, argparse
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT/'cache'
ASSETS = ROOT/'dist/assets/source'
DATA = ROOT/'dist/data'
MANIFEST = ROOT/'manifest'
for d in [CACHE,ASSETS,DATA,MANIFEST]: d.mkdir(parents=True,exist_ok=True)
BASE = 'https://ddn.by'
WORKERS = 6
IMAGE_WORKERS = 12
REFRESH = False
ERRORS=[]
lock = threading.Lock()
HEADERS = {'User-Agent':'DreamDesignDemo/1.0 (public content capture for site redesign)','Accept-Encoding':'identity'}

def canon(url):
    url=unescape(urljoin(BASE+'/',url)).strip()
    return url.replace('http://ddn.by','https://ddn.by').replace('https://www.ddn.by','https://ddn.by')

def fetch(url, label=None, attempts=3):
    url=canon(url)
    key=hashlib.sha1(url.encode()).hexdigest()
    file=CACHE/(key+'.bin'); meta=CACHE/(key+'.json')
    if file.exists() and meta.exists() and not REFRESH:
        return file.read_bytes(),json.loads(meta.read_text('utf-8')).get('headers',{})
    for attempt in range(attempts):
        try:
            with urlopen(Request(url,headers=HEADERS),timeout=45) as r:
                data=r.read(); headers=dict(r.headers)
            file.write_bytes(data)
            meta.write_text(json.dumps({'url':url,'label':label,'headers':headers},ensure_ascii=False),'utf-8')
            return data,headers
        except Exception as e:
            if attempt+1==attempts:
                with lock: ERRORS.append({'url':url,'error':str(e),'stage':label})
                return b'',{}
            time.sleep(.5*(attempt+1))

def text(html):
    html=re.sub(r'<(script|style)\b[^>]*>.*?</\1>','',html,flags=re.S|re.I)
    html=re.sub(r'<(?:br\s*/?|/p|/div|/li|/h[1-6])>','\n',html,flags=re.I)
    html=re.sub('<[^>]+>',' ',html)
    html=unescape(html).replace('\xa0',' ')
    return re.sub(r'[ \t]+',' ',re.sub(r'\n\s*\n+','\n',html)).strip()

def get_json(url,label):
    data,headers=fetch(url,label)
    try:return json.loads(data),headers
    except Exception:return [],headers

def rest_all(endpoint):
    url=f'{BASE}/wp-json/wp/v2/{endpoint}?per_page=100&_embed=1&page=1'
    first,headers=get_json(url,endpoint)
    pages=int(headers.get('X-WP-TotalPages',1))
    total=int(headers.get('X-WP-Total',len(first) if isinstance(first,list) else 0))
    results=first if isinstance(first,list) else []
    if pages>1:
        with ThreadPoolExecutor(max_workers=3) as pool:
            futures={pool.submit(get_json,f'{BASE}/wp-json/wp/v2/{endpoint}?per_page=100&_embed=1&page={p}',endpoint):p for p in range(2,pages+1)}
            for f in as_completed(futures):
                data,_=f.result()
                if isinstance(data,list):results.extend(data)
    print(f'REST {endpoint}: {len(results)}/{total}',flush=True)
    return sorted(results,key=lambda x:x['id']),{'expected':total,'captured':len(results),'pages':pages}

def sitemap(kind):
    raw,_=fetch(f'{BASE}/wp-sitemap-{kind}-1.xml','sitemap')
    if not raw:return []
    root=ET.fromstring(raw)
    return [x.text for x in root.iter() if x.tag.endswith('loc')]

def raw_images(html):
    return [canon(x) for x in re.findall(r'<img\b[^>]*?\bsrc=["\']([^"\']+)',html,re.I) if not x.startswith('data:')]

def featured(row):
    media=row.get('_embedded',{}).get('wp:featuredmedia',[])
    if not media:return ''
    media=media[0]
    if not isinstance(media,dict):return ''
    sizes=media.get('media_details',{}).get('sizes',{})
    for key in ['large','medium_large','1536x1536','full']:
        if key in sizes:return canon(sizes[key]['source_url'])
    return canon(media.get('source_url','')) if media.get('source_url') else ''

def unique(items):return list(dict.fromkeys(x for x in items if x))
def weapon(name):return bool(re.search(r'винтовк|пневмат|пл[iіи]са|крын[iіи]ц|оружи',name,re.I))

class Cleaner(HTMLParser):
    allowed={'p','br','strong','b','em','i','ul','ol','li','h2','h3','h4','table','thead','tbody','tr','th','td','blockquote','span','div','a'}
    void={'br'}
    def __init__(self):super().__init__(convert_charrefs=True);self.out=[];self.skip=0
    def handle_starttag(self,tag,attrs):
        if tag in {'script','style','iframe','form','button','select','textarea','input','noscript'}:self.skip+=1;return
        if self.skip:return
        if tag in self.allowed:
            safe=''
            if tag=='a':
                href=dict(attrs).get('href','')
                if href.startswith(('mailto:','tel:')):safe=f' href="{escape(href,quote=True)}"'
            if tag in {'td','th'}:
                for key in ['colspan','rowspan']:
                    val=dict(attrs).get(key,'')
                    if val.isdigit():safe+=f' {key}="{val}"'
            self.out.append('<'+tag+safe+'>')
    def handle_endtag(self,tag):
        if tag in {'script','style','iframe','form','button','select','textarea','input','noscript'}:
            if self.skip:self.skip-=1
            return
        if not self.skip and tag in self.allowed and tag not in self.void:self.out.append('</'+tag+'>')
    def handle_data(self,data):
        if not self.skip:self.out.append(escape(data))

def clean_html(html):
    html=re.sub(r'\[[^\]]*\]','',html)
    c=Cleaner()
    try:c.feed(html)
    except Exception:return '<p>'+escape(text(html))+'</p>'
    result=''.join(c.out)
    result=re.sub(r'<p>\s*</p>','',result)
    return result

def clean_page_html(html, slug):
    body=clean_html(html)
    if slug=='contacts':
        body=re.sub(r'<p\b[^>]*>[^<]*(?:Официальный дилер в Российской Федерации|plisa-russia)[^<]*</p>','',body,flags=re.I)
    return body

def slug_from_url(url):return unquote(urlsplit(url).path.rstrip('/').split('/')[-1])

def main():
    captured=datetime.datetime.now(datetime.timezone.utc).isoformat()
    fetch(BASE+'/robots.txt','robots')
    fetch(BASE+'/wp-sitemap.xml','sitemap-index')
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures={key:pool.submit(rest_all,key) for key in ['product','posts','pages']}
        rest={key:f.result() for key,f in futures.items()}
    raw_products,product_stats=rest['product']; raw_posts,post_stats=rest['posts']; raw_pages,page_stats=rest['pages']
    category_urls=sitemap('taxonomies-product_cat')
    product_sitemap=sitemap('posts-product')
    post_sitemap=sitemap('posts-post')
    page_sitemap=sitemap('posts-page')
    if not raw_products or len(raw_products)!=product_stats['expected'] or len(raw_products)!=len(product_sitemap):
        raise RuntimeError('Incomplete product capture; existing public data was left unchanged')
    if len(raw_posts)!=post_stats['expected'] or len(raw_pages)!=page_stats['expected']:
        raise RuntimeError('Incomplete page or project capture; existing public data was left unchanged')
    home_bytes,_=fetch(BASE+'/','home')
    home=home_bytes.decode('utf-8','replace')
    (CACHE/'home.html').write_text(home,'utf-8')
    names={canon(u):text(t) for u,t in re.findall(r'<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)</a>',home,re.S|re.I) if 'product-category/' in u}

    category_data=[]
    for url in category_urls:
        parts=urlsplit(url).path.strip('/').split('/')[1:]
        slug=parts[-1]
        category_data.append({'id':slug,'slug':slug,'name':names.get(canon(url),slug.replace('-',' ').capitalize()),'parentId':parts[-2] if len(parts)>1 else None,'url':canon(url),'description':'','image':'','productIds':[]})
    categories_by_slug={c['slug']:c for c in category_data}

    # Catalogue archive classes expose the full product/category relationships.
    archive_pages=(len(raw_products)+15)//16
    archive_urls=[BASE+'/catalog/']+[f'{BASE}/catalog/page/{n}/' for n in range(2,archive_pages+1)]
    relations={}; archive_product_ids=set(); archive_stats={}
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures={pool.submit(fetch,u,'catalog-archive'):u for u in archive_urls+category_urls}
        for i,f in enumerate(as_completed(futures),1):
            u=futures[f]; raw,_=f.result(); html=raw.decode('utf-8','replace')
            if '/product-category/' in u:
                cat=categories_by_slug.get(slug_from_url(u))
                title=re.search(r'<h1[^>]*>(.*?)</h1>',html,re.S|re.I)
                if cat and title:cat['name']=text(title.group(1))
                desc=re.search(r'<div[^>]+class=["\'][^"\']*term-description[^"\']*["\'][^>]*>(.*?)</div>',html,re.S|re.I)
                if cat and desc:cat['description']=text(desc.group(1))
            else:
                ids=[]
                for cls in re.findall(r'<li\b[^>]+class=["\']([^"\']*\btype-product\b[^"\']*)["\']',html):
                    match=re.search(r'\bpost-(\d+)\b',cls)
                    if not match:continue
                    pid=match.group(1); ids.append(pid);archive_product_ids.add(pid)
                    relations[pid]=re.findall(r'\bproduct_cat-([^\s]+)',cls)
                archive_stats[u]={'products':len(ids),'ok':bool(raw)}
            if i%15==0:print(f'Archives/categories: {i}/{len(futures)}',flush=True)

    products=[]; projects=[]; pages=[]; wanted=set()
    for row in raw_products:
        name=text(row['title']['rendered']); is_weapon=weapon(name)
        html=row.get('content',{}).get('rendered','')
        imgs=[] if is_weapon else unique([featured(row)]+raw_images(html))
        wanted.update(imgs)
        if is_weapon:
            description='Справочная запись о спортивной пневматике. Документы и правовая классификация требуют отдельного согласования.'
            body='<p>'+description+'</p>'
        else:body=clean_html(html);description=text(body)
        pid=str(row['id']); cat_ids=relations.get(pid,[])
        products.append({'id':pid,'slug':row['slug'],'name':name,'url':canon(row['link']),'categoryIds':cat_ids,'images':imgs,'descriptionHtml':body,'descriptionText':description,'attributes':[],'isWeapon':is_weapon})
        for cid in cat_ids:
            if cid in categories_by_slug:categories_by_slug[cid]['productIds'].append(pid)

    for row in raw_posts:
        name=text(row['title']['rendered']);is_weapon=weapon(name)
        html=row.get('content',{}).get('rendered','')
        imgs=[] if is_weapon else unique([featured(row)]+raw_images(html))
        wanted.update(imgs)
        term_groups=row.get('_embedded',{}).get('wp:term',[])
        cats=[term['slug'] for terms in term_groups for term in terms if isinstance(term,dict) and term.get('taxonomy')=='category']
        if is_weapon:body='<p>Справочная запись о спортивном направлении. Материалы не относятся к мебельным проектам.</p>'
        else:body=clean_html(html)
        projects.append({'id':str(row['id']),'slug':row['slug'],'name':name,'url':canon(row['link']),'images':imgs,'descriptionHtml':body,'descriptionText':text(body),'categorySlugs':cats,'isWeapon':is_weapon})

    # Pages include builder-generated content, so preserve a public HTML snapshot too.
    for row in raw_pages:
        html=row.get('content',{}).get('rendered','')
        imgs=unique([featured(row)]+raw_images(html));wanted.update(imgs)
        body=clean_page_html(html,row['slug'])
        pages.append({'slug':row['slug'],'title':text(row['title']['rendered']),'url':canon(row['link']),'html':body,'text':text(body),'images':imgs,'service':row['slug'] in ['my-account','checkout']})

    home_imgs=unique(raw_images(home))
    named_assets={}
    def find(pattern):return next((u for u in home_imgs if re.search(pattern,u,re.I)),'')
    named_assets['logoDark']=find('logo-dark')
    named_assets['logoLight']=next((u for u in home_imgs if '/logo-' in u and 'logo-dark' not in u),'')
    named_assets['chair']=find('/chair-')
    named_assets['hero']=find('our-works') or find('DD_office')
    named_assets['about']=find('our-works')
    named_assets['homeDirections']=unique([find(p) for p in ['DD_office','DD_001','sv_010','izdeliya-iz-metalla','shveinye-izd','rollers-01']])
    wanted.update(home_imgs)
    backgrounds=unique([canon(u) for u in re.findall(r'\bdata-src=["\']([^"\']+)',home,re.I)])
    named_assets['heroBackground']=next((u for u in backgrounds if 'bg-main-dark' in u),'')
    named_assets['heroTexture']=next((u for u in backgrounds if 'home-hero-texture' in u),'')
    named_assets['aboutBackground']=next((u for u in backgrounds if 'bg-d-' in u),'')
    named_assets['favicon']=BASE+'/wp-content/uploads/favicon.png'
    wanted.update(backgrounds)
    wanted.add(named_assets['favicon'])
    # Copy public stylesheet and logo dependencies for visual reference, without JS/counters.
    css_urls=re.findall(r'<link[^>]+href=["\']([^"\']+\.css[^"\']*)',home,re.I)
    css_reference=[]
    for u in css_urls:
        if '/themes/yootheme/' in u:
            raw,_=fetch(u,'theme-css')
            filename='theme-original.css';(CACHE/filename).write_bytes(raw)
            css=raw.decode('utf-8','replace')
            refs=[]
            for ref in re.findall(r'url\(["\']?([^\)"\']+)',css):
                if ref.startswith('data:'):continue
                resolved=canon(urljoin(u,ref));refs.append(resolved)
                if re.search(r'\.(?:woff2?|ttf|otf)(?:\?|$)',resolved):
                    fontdata,_=fetch(resolved,'font')
                    if fontdata:
                        fontname='font-'+hashlib.sha1(resolved.encode()).hexdigest()[:12]+Path(urlsplit(resolved).path).suffix
                        (ASSETS/fontname).write_bytes(fontdata)
                        css_reference.append({'url':resolved,'path':'assets/source/'+fontname})
            (MANIFEST/'theme-reference.json').write_text(json.dumps({'url':u,'dependencyUrls':refs,'fonts':css_reference},ensure_ascii=False,indent=2),'utf-8')

    # Source-only image requests are optimized, never hotlinked by the demo.
    wanted={u for u in wanted if urlsplit(u).hostname in {'ddn.by','www.ddn.by'} and re.search(r'\.(?:png|jpe?g|webp|gif|svg)(?:\?|$)',u,re.I)}
    image_errors=[];asset_map={};downloaded_bytes=0
    def asset(url):
        nonlocal downloaded_bytes
        digest=hashlib.sha1(url.encode()).hexdigest()[:16]
        is_svg=urlsplit(url).path.lower().endswith('.svg')
        target=ASSETS/(digest+('.svg' if is_svg else '.webp'))
        if target.exists() and not REFRESH:return url,'assets/source/'+target.name
        try:
            with urlopen(Request(url,headers=HEADERS),timeout=35) as r:raw=r.read()
            temporary=target.with_suffix(target.suffix+'.tmp')
            if is_svg:
                svg=raw.decode('utf-8','replace')
                svg=re.sub(r'<script\b.*?</script>','',svg,flags=re.S|re.I)
                temporary.write_text(svg,'utf-8')
            else:
                im=ImageOps.exif_transpose(Image.open(io.BytesIO(raw)))
                im.thumbnail((1600,1600),Image.Resampling.LANCZOS)
                im=im.convert('RGBA' if 'A' in im.getbands() else 'RGB')
                im.save(temporary,'WEBP',quality=86,method=4)
            temporary.replace(target)
            with lock:downloaded_bytes+=len(raw)
            return url,'assets/source/'+target.name
        except Exception as e:
            with lock:image_errors.append({'url':url,'error':str(e)})
            return url,''

    print(f'Downloading {len(wanted)} unique images',flush=True)
    with ThreadPoolExecutor(max_workers=IMAGE_WORKERS) as pool:
        futures=[pool.submit(asset,u) for u in sorted(wanted)]
        for i,f in enumerate(as_completed(futures),1):
            url,path=f.result()
            if path:asset_map[url]=path
            if i%50==0:print(f'Images {i}/{len(futures)}',flush=True)
    for group in [products,projects,pages]:
        for row in group:row['images']=unique([asset_map.get(u,'') for u in row['images']])
    for cat in category_data:
        first=next((x for x in products if x['id'] in cat['productIds'] and x['images'] and not x['isWeapon']),None)
        cat['image']=first['images'][0] if first else ''
    for k,v in named_assets.items():
        named_assets[k]=[asset_map.get(u,'') for u in v if asset_map.get(u)] if isinstance(v,list) else asset_map.get(v,'')
    named_assets['fonts']=css_reference
    named_assets['sourceMap']=asset_map
    report={'capturedAt':captured,'sourceUrl':BASE,'rest':{'products':product_stats,'posts':post_stats,'pages':page_stats},'sitemap':{'products':len(product_sitemap),'posts':len(post_sitemap),'pages':len(page_sitemap),'categories':len(category_urls)},'archives':{'expectedPages':archive_pages,'capturedPages':sum(x['ok'] for x in archive_stats.values()),'uniqueProductIds':len(archive_product_ids),'pages':archive_stats},'assets':{'requested':len(wanted),'captured':len(asset_map),'optimizedBytes':sum(p.stat().st_size for p in ASSETS.iterdir() if p.is_file()),'downloadedBytesThisRun':downloaded_bytes,'errors':image_errors},'neutralWeaponRecords':{'products':sum(x['isWeapon'] for x in products),'posts':sum(x['isWeapon'] for x in projects)},'sourceGaps':{'productsWithoutDescription':[x['id'] for x in products if not x['descriptionText'] and not x['isWeapon']],'productsWithoutSourceImage':[str(x['id']) for x in raw_products if not weapon(text(x['title']['rendered'])) and not featured(x) and not raw_images(x.get('content',{}).get('rendered',''))]},'errors':ERRORS,'missingCategoryProducts':[x['id'] for x in products if not x['categoryIds']]}
    report['publicContentAdjustments']=['Weapon product and post records are neutral informational entries without images, commercial descriptions, pricing or ordering.','Weapon-direction dealer paragraph removed from public contacts; original retained only in non-published cache.','Page text rebuilt from sanitized HTML to exclude YOOtheme builder metadata.']
    data={'sourceUrl':BASE,'capturedAt':captured,'company':{'name':'Dream Design','description':'Собственное производство мебели и оснащения. Индивидуальные решения для частных и общественных пространств.','contacts':{'phone':'+375 29 340-63-74','additionalPhone':'+375 17 765-52-51','email':'info@ddn.by','address':'222201, Республика Беларусь, Минская область, г. Смолевичи, ул. Садовая, 18','instagram':'https://www.instagram.com/dreamdesign_sm/'}},'categories':category_data,'products':products,'projects':projects,'pages':pages,'assets':named_assets,'stats':{'products':len(products),'categories':len(category_data),'projects':len(projects),'pages':len(pages),'images':len(asset_map),'neutralWeaponProducts':sum(x['isWeapon'] for x in products)}}
    target=DATA/'site.json'
    temporary=target.with_suffix('.tmp')
    temporary.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),'utf-8')
    temporary.replace(target)
    (MANIFEST/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8')
    print(json.dumps(data['stats'],ensure_ascii=False),flush=True)
    print('Saved '+str(DATA/'site.json'),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh',action='store_true',help='Refresh cached public HTML, API data and image assets')
    args=parser.parse_args()
    REFRESH=args.refresh
    main()
