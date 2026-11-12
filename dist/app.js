'use strict';

(() => {
  const main = document.getElementById('main');
  const header = document.getElementById('header');
  const footer = document.getElementById('footer');
  const PAGE_SIZE = 24;
  let site;
  let categories = new Map();
  let productMap = new Map();
  let projectMap = new Map();
  let listingProducts = [];
  let canonicalProductIds = new Map();
  let selectedFiles = [];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text = html => { const d = document.createElement('div'); d.innerHTML = html || ''; return d.textContent.trim(); };
  const norm = value => String(value || '').toLowerCase().replace(/ё/g, 'е');
  const route = (path, params = {}) => '#/' + path.replace(/^\/+/, '') + (Object.values(params).some(v => v !== '' && v != null) ? '?' + new URLSearchParams(Object.entries(params).filter(([,v]) => v !== '' && v != null)) : '');
  const icon = name => ({arrow:'<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" stroke-width="1.5"/></svg>',upload:'<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M16 22V5m-6 6 6-6 6 6M6 21v6h20v-6" stroke="currentColor" stroke-width="1.5"/></svg>',search:'<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="1.5"/><path d="m16 16 5 5" stroke="currentColor" stroke-width="1.5"/></svg>'}[name] || '');
  const image = (src, alt, cls = '', eager = false) => src ? `<img src="${esc(src)}" alt="${esc(alt)}" class="${cls}" loading="${eager ? 'eager' : 'lazy'}" decoding="async">` : '<div class="image-placeholder" aria-hidden="true">DREAM DESIGN</div>';
  const asset = (...keys) => keys.map(k => site.assets?.[k]).find(v => typeof v === 'string') || '';
  const catNames = p => (p.categoryIds || []).map(id => categories.get(String(id))?.name || '').join(' ');
  const haystack = p => norm(`${p.name} ${catNames(p)} ${p.descriptionText || ''}`);
  const normalProducts = () => listingProducts;
  const normalProjects = () => site.projects.filter(p => !p.isWeapon && !/лыжероллер/i.test(p.name));

  const directionDefinitions = [
    {slug:'custom',name:'Индивидуальная мебель',caption:'Мебель для офисов, кафе и общественных пространств по вашему проекту.',pattern:/офис|руководител|кабинет|переговор|конференц|мебель loft|кухн|ресеп|рецепц/,categoryPattern:/офис|кабинет|кухн|loft/},
    {slug:'kindergarten',name:'Для детских садов',caption:'Мебель и оснащение для групп, спален, раздевалок и игровых зон.',pattern:/детск|игруш|игров|кроватк|воспитател|паровоз|калейдоскоп/,categoryPattern:/детск/},
    {slug:'school',name:'Для школ',caption:'Учебные места, системы хранения и решения для общих пространств.',pattern:/школ|ученич|учебн|лингафон|амфитеатр|гимнаст|компьютер|пособи/,categoryPattern:/школ/},
    {slug:'cabinet',name:'Корпусная мебель',caption:'Столы, шкафы, кухни и системы хранения.',pattern:/корпусн/,categoryPattern:/^корпусная мебель$/},
    {slug:'soft',name:'Мягкая мебель',caption:'Диваны, кресла, банкетки и пуфы.',pattern:/мягкая мебель|диван|кресл|банкет|пуф/,categoryPattern:/^мягкая мебель$/},
    {slug:'industrial',name:'Промышленная мебель',caption:'Рабочие столы, стеллажи и оснащение производства.',pattern:/промышлен|тележк|комплектован|верстак/,categoryPattern:/промышлен/},
    {slug:'metal',name:'Изделия из металла',caption:'Мебель LOFT, подстолья, полки и другие металлоизделия.',pattern:/изделия из металла|loft|подстоль|мангал|скамей/,categoryPattern:/изделия из металла/},
    {slug:'sewing',name:'Швейные изделия',caption:'Спецодежда и текстиль собственного производства.',pattern:/швейн|спецодеж|халат|перчатк|комбинезон|костюм|брюки|чехол/,categoryPattern:/швейн/},
    {slug:'interior',name:'Предметы интерьера',caption:'Декор, сувениры и детали для интерьеров.',pattern:/предметы интерьера|сувенир|бутылочниц|фотограф|венок|панно|декораци|развивающ/,categoryPattern:/предметы интерьера/},
    {slug:'composite',name:'Композитные изделия',caption:'Изделия из композитных материалов.',pattern:/композит/,categoryPattern:/композит/},
    {slug:'rollers',name:'Лыжероллеры',caption:'Спортивное снаряжение собственного производства.',pattern:/лыжероллер/,categoryPattern:/лыжероллер/},
  ];

  function directionProducts(def) {
    const matchedCats = site.categories.filter(c => def.categoryPattern.test(norm(c.name))).map(c => String(c.id));
    let expanded = new Set(matchedCats);
    for (let i=0; i<5; i++) site.categories.forEach(c => { if (expanded.has(String(c.parentId))) expanded.add(String(c.id)); });
    return normalProducts().filter(p => (p.categoryIds || []).some(id => expanded.has(String(id))) || def.pattern.test(haystack(p)));
  }
  function directionImage(def) {
    const projectCovers={custom:['proekt-ofisnoj-mebeli',0],kindergarten:['detskij-sad-dinosad',0],school:['shkola-talantov-v-novoj-borovoj',3]};
    const chosen=projectCovers[def.slug];
    if(chosen){const cover=site.projects.find(p=>p.slug===chosen[0])?.images?.[chosen[1]];if(cover)return cover;}
    const preferred = site.categories.find(c => def.categoryPattern.test(norm(c.name)) && c.image);
    return asset(def.slug) || preferred?.image || directionProducts(def).find(p => p.images?.length)?.images[0] || asset('hero','home','chair');
  }
  function productCard(p) {
    const meta = (p.categoryIds || []).map(id => categories.get(String(id))?.name).filter(Boolean).slice(0,1).join('');
    return `<article class="product-card"><a href="${route('product/'+encodeURIComponent(p.slug))}">${image(p.images?.[0],p.name)}<div class="card-body"><span class="product-meta">${esc(meta)}</span><h3>${esc(p.name)}</h3><span class="card-link">Подробнее ${icon('arrow')}</span></div></a></article>`;
  }
  function projectCard(p) {
    return `<article class="project-card"><a href="${route('project/'+encodeURIComponent(p.slug))}">${image(p.images?.[0],p.name)}<div class="card-body"><span class="eyebrow">Выполненный проект</span><h3>${esc(p.name)}</h3><span class="card-link">Посмотреть проект ${icon('arrow')}</span></div></a></article>`;
  }
  function directionCard(def, wide = false) {
    return `<article class="direction-card${wide?' wide':''}"><a href="${route('direction/'+def.slug)}">${image(directionImage(def),def.name)}<div class="card-body"><h3>${esc(def.name)}</h3><p>${esc(def.caption)}</p><span class="card-link">Посмотреть направление ${icon('arrow')}</span></div></a></article>`;
  }
  const breadcrumb = items => `<nav class="breadcrumb container" aria-label="Путь по сайту"><a href="#/">Главная</a>${items.map(([label,href])=>`<span aria-hidden="true">/</span>${href?`<a href="${href}">${esc(label)}</a>`:`<span aria-current="page">${esc(label)}</span>`}`).join('')}</nav>`;
  const pageHeading = (title, intro='', eyebrow='') => `<div class="page-heading container">${eyebrow?`<p class="eyebrow">${esc(eyebrow)}</p>`:''}<h1>${esc(title)}</h1>${intro?`<p class="lead">${esc(intro)}</p>`:''}</div>`;

  function renderHeader(path) {
    const active = path.split('/')[0];
    const links = [['catalog','Продукция'],['projects','Наши работы'],['about','О компании'],['contacts','Контакты']];
    const isReference = active === 'reference' || (active==='product' && productMap.get(decodeURIComponent(path.split('/')[1]||''))?.isWeapon) || (active==='project' && projectMap.get(decodeURIComponent(path.split('/')[1]||''))?.isWeapon);
    const logo = asset('logoDark','logo','logoLight');
    header.innerHTML = `<header class="site-header"><div class="container header-inner"><a class="brand" href="#/" aria-label="Dream Design — главная">${logo?image(logo,'Dream Design','',true):'<span>DREAM<br>DESIGN</span>'}</a><nav class="main-nav" aria-label="Основное меню">${links.map(([to,label])=>`<a href="${route(to)}" class="nav-link${active===to||(active==='direction'&&to==='catalog')||(active==='product'&&to==='catalog')?' active':''}">${label}</a>`).join('')}</nav><div class="header-actions"><a class="search-link" href="${route('catalog/all')}" aria-label="Поиск по каталогу">${icon('search')}</a>${!isReference?`<a class="button button-primary button-small" href="${route('request')}">Отправить заявку ${icon('arrow')}</a>`:''}<button class="mobile-toggle" type="button" aria-label="Открыть меню" aria-expanded="false"><span></span><span></span></button></div></div><nav class="mobile-menu container" aria-label="Мобильное меню">${links.map(([to,label])=>`<a href="${route(to)}">${label}</a>`).join('')}<a href="${route('structure')}">Схема разделов</a></nav></header>`;
    header.querySelector('.mobile-toggle').addEventListener('click', event => {
      const b = event.currentTarget, open = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', String(open)); b.setAttribute('aria-label',open?'Закрыть меню':'Открыть меню');
      header.querySelector('.mobile-menu').classList.toggle('is-open', open);
    });
  }
  function renderFooter() {
    const logo = asset('logoLight','logo','logoDark');
    const extraPages = site.pages.filter(p => /ваканс/i.test(p.title)).slice(0,1);
    footer.innerHTML = `<footer class="site-footer"><div class="container footer-grid"><div class="footer-brand">${logo?image(logo,'Dream Design'):'<strong>DREAM DESIGN</strong>'}<p>Собственное производство.<br>Мебель и решения для ваших проектов.</p><a href="https://ddn.by/" target="_blank" rel="noopener noreferrer">Действующий сайт ddn.by ↗</a></div><div class="footer-links"><h2>Направления</h2><a href="${route('direction/custom')}">Индивидуальная мебель</a><a href="${route('direction/kindergarten')}">Для детских садов</a><a href="${route('direction/school')}">Для школ</a><a href="${route('catalog')}">Вся продукция</a></div><div class="footer-links"><h2>Компания</h2><a href="${route('projects')}">Наши работы</a><a href="${route('about')}">О компании</a><a href="${route('contacts')}">Контакты</a>${extraPages.map(p=>`<a href="${route('page/'+encodeURIComponent(p.slug))}">${esc(p.title)}</a>`).join('')}<a href="${route('structure')}">Схема разделов</a><a href="${route('reference')}">Спортивная пневматика · справка</a></div><div class="footer-links"><h2>Связаться с нами</h2><a href="tel:+375293406374">+375 29 340-63-74</a><a href="mailto:info@ddn.by">info@ddn.by</a><p>Смолевичи<br>ул. Садовая, 18</p></div></div><div class="container footer-bottom"><span>Dream Design · демонстрационная версия</span><span>Для обсуждения структуры и оформления</span><a href="${route('privacy')}">О форме и данных</a></div></footer>`;
  }

  function home() {
    const featured = normalProjects().filter(p=>p.images?.length).slice(0,3);
    const hero = directionImage(directionDefinitions[0]) || asset('hero','home','chair');
    return `<section class="hero container"><div class="hero-copy"><p class="eyebrow">Dream Design · собственное производство</p><h1>Мебель для<br>ваших проектов</h1><p class="lead">Индивидуальные решения для бизнеса, школ и детских садов. От отдельного предмета до оснащения пространства.</p><div class="hero-actions"><a class="button button-primary" href="${route('catalog')}">Смотреть направления ${icon('arrow')}</a><a class="button button-outline" href="${route('request')}">Обсудить проект</a></div><p class="hero-note">Производим в Смолевичах, Беларусь</p></div><div class="hero-media">${image(hero,'Мебель и интерьеры Dream Design','',true)}<div class="hero-caption"><span>Создаём мебель под вашу задачу</span><a href="${route('projects')}" aria-label="Посмотреть выполненные проекты">${icon('arrow')}</a></div></div></section>
    <section class="section container"><div class="section-heading"><div><p class="eyebrow">Выберите направление</p><h2>Что мы изготавливаем</h2></div><a class="card-link" href="${route('catalog')}">Все направления ${icon('arrow')}</a></div><div class="directions-grid">${directionDefinitions.slice(0,3).map(d=>directionCard(d)).join('')}</div></section>
    <section class="section container"><div class="split-feature"><div class="split-media">${image(asset('chair','about') || directionImage(directionDefinitions[6]),'Мебель собственного производства')}</div><div class="split-copy"><p class="eyebrow">От идеи до готового интерьера</p><h2>Собственное производство<br>в Смолевичах</h2><p>Корпусная и мягкая мебель, металлообработка, швейное производство. Подбираем материалы и исполнение под конкретную задачу.</p><p>Покажите нам план помещения, эскиз или техническое задание — обсудим, как реализовать ваш проект.</p><a class="button button-primary" href="${route('about')}">О производстве ${icon('arrow')}</a></div></div></section>
    ${featured.length?`<section class="section container"><div class="section-heading"><div><p class="eyebrow">Решения в реальных пространствах</p><h2>Наши работы</h2></div><a class="card-link" href="${route('projects')}">Все проекты ${icon('arrow')}</a></div><div class="projects-grid">${featured.map(projectCard).join('')}</div></section>`:''}
    <section class="section container"><div class="section-heading"><div><p class="eyebrow">Другие возможности производства</p><h2>Другие направления</h2></div></div><div class="directions-grid secondary-directions">${[6,7,8].map(i=>directionCard(directionDefinitions[i])).join('')}</div></section>
    ${requestStrip()}`;
  }
  function requestStrip() {
    return `<section class="request-strip"><div class="container"><div><p class="eyebrow">Есть идея или готовый проект</p><h2>Давайте обсудим вашу задачу</h2><p>Опишите, что нужно изготовить, и приложите чертежи или техническое задание.</p></div><a class="button button-light" href="${route('request')}">Отправить заявку ${icon('arrow')}</a></div></section>`;
  }
  function catalogLanding() {
    return breadcrumb([['Продукция']])+pageHeading('Продукция и направления','Выберите нужное направление или найдите изделие в общем каталоге.','Возможности производства')+`<section class="section container catalog-intro"><form class="catalog-toolbar" data-search-form><label class="search-field">${icon('search')}<input name="q" type="search" aria-label="Поиск по названию изделия" placeholder="Найти стол, шкаф, диван…"></label><button class="button button-primary" type="submit">Найти</button><a class="button button-outline" href="${route('catalog/all')}">Весь каталог</a></form><h2>Мебель и оснащение</h2><div class="directions-grid">${directionDefinitions.slice(0,6).map(d=>directionCard(d)).join('')}</div></section><section class="section container"><div class="section-heading"><h2>Другие направления производства</h2></div><div class="directions-grid">${directionDefinitions.slice(6).filter(d=>directionProducts(d).length||d.slug==='composite').map(d=>directionCard(d)).join('')}</div><p class="reference-link"><a href="${route('reference')}">Справочная информация о спортивной пневматике ${icon('arrow')}</a></p></section>`+requestStrip();
  }
  function categoryDescendants(id) {
    const ids = new Set([String(id)]);
    for(let i=0;i<5;i++) site.categories.forEach(c=>{if(ids.has(String(c.parentId)))ids.add(String(c.id));});
    return ids;
  }
  function categorySidebar(currentSlug) {
    const roots = site.categories.filter(c => !c.parentId || c.parentId === '0' || c.parentId === 0);
    const rows = roots.length ? roots : site.categories;
    return `<aside class="catalog-sidebar"><h2>Разделы каталога</h2><a class="sidebar-link${currentSlug==='all'?' active':''}" href="${route('catalog/all')}">Все изделия</a>${rows.map(c=>`<a class="sidebar-link${currentSlug===c.slug?' active':''}" href="${route('category/'+encodeURIComponent(c.slug))}">${esc(c.name)}</a>`).join('')}<div class="sidebar-help"><p>Нужно индивидуальное решение?</p><a class="card-link" href="${route('request')}">Отправить проект ${icon('arrow')}</a></div></aside>`;
  }
  function mobileCategoryPicker(currentSlug) {
    return `<label class="mobile-category-picker">Раздел каталога<select data-category-picker aria-label="Раздел каталога"><option value="${route('catalog/all')}">Все изделия</option>${site.categories.map(c=>`<option value="${route('category/'+encodeURIComponent(c.slug))}"${c.slug===currentSlug?' selected':''}>${c.parentId?'— ':''}${esc(c.name)}</option>`).join('')}</select></label>`;
  }
  function catalogResults(list, params, path, title, intro='', currentSlug='all', projectList=[]) {
    const query = params.get('q') || '';
    const sort = params.get('sort') || 'source';
    if(query) list = list.filter(p=>haystack(p).includes(norm(query)));
    if(sort==='name') list = [...list].sort((a,b)=>a.name.localeCompare(b.name,'ru'));
    else if(sort==='recent') list = [...list].reverse();
    const totalPages = Math.max(1, Math.ceil(list.length/PAGE_SIZE));
    const page = Math.min(Math.max(1,Number(params.get('page'))||1),totalPages);
    const visible = list.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);
    const purl = n => route(path,{q:query,sort:sort==='source'?'':sort,page:n===1?'':n});
    const children = site.categories.filter(c=>c.parentId && categories.get(String(c.parentId))?.slug===currentSlug);
    const pager = totalPages>1?`<nav class="pagination" aria-label="Страницы каталога">${page>1?`<a class="page-button" href="${purl(page-1)}" aria-label="Предыдущая страница">←</a>`:''}${Array.from({length:totalPages},(_,i)=>i+1).filter(n=>n===1||n===totalPages||Math.abs(n-page)<3).map((n,i,ns)=>(i&&n-ns[i-1]>1?'<span>…</span>':'')+`<a class="page-button${page===n?' active':''}" href="${purl(n)}"${page===n?' aria-current="page"':''}>${n}</a>`).join('')}${page<totalPages?`<a class="page-button" href="${purl(page+1)}" aria-label="Следующая страница">→</a>`:''}</nav>`:'';
    return breadcrumb([['Продукция',route('catalog')],[title]])+pageHeading(title,intro)+`<section class="section container catalog-section"><div class="catalog-layout">${categorySidebar(currentSlug)}<div class="catalog-results">${mobileCategoryPicker(currentSlug)}<form class="catalog-toolbar" data-search-form data-path="${esc(path)}"><label class="search-field">${icon('search')}<input name="q" type="search" value="${esc(query)}" placeholder="Поиск в этом разделе" aria-label="Поиск в разделе"></label><select name="sort" aria-label="Порядок изделий"><option value="source"${sort==='source'?' selected':''}>Исходный порядок</option><option value="name"${sort==='name'?' selected':''}>По названию</option><option value="recent"${sort==='recent'?' selected':''}>В обратном порядке</option></select><button class="button button-primary button-small" type="submit">Найти</button></form>${children.length?`<div class="filter-chips">${children.map(c=>`<a class="chip" href="${route('category/'+encodeURIComponent(c.slug))}">${esc(c.name)}</a>`).join('')}</div>`:''}<div class="results-count" aria-live="polite">${list.length ? `Найдено изделий: ${list.length}${totalPages>1?` · страница ${page} из ${totalPages}`:''}`:'По вашему запросу ничего не найдено'}</div>${visible.length?`<div class="catalog-grid">${visible.map(productCard).join('')}</div>`:`<div class="empty-state"><h2>${query?'Попробуйте другой запрос':'Решение под вашу задачу'}</h2><p>${query?'Измените название или выберите другой раздел.':'Расскажите, какое оснащение вам необходимо. Обсудим материалы, исполнение и комплектацию.'}</p><a class="button button-outline" href="${query?route(path):route('request')}">${query?'Сбросить поиск':'Отправить проект'}</a></div>`}${pager}</div></div></section>${projectList.length?`<section class="section container"><div class="section-heading"><h2>${path==='direction/rollers'?'Подробнее о направлении':'Примеры выполненных проектов'}</h2></div><div class="projects-grid">${projectList.slice(0,3).map(projectCard).join('')}</div></section>`:''}`;
  }

  function sanitizeHtml(raw, {images = true} = {}) {
    const parsed = new DOMParser().parseFromString(raw || '', 'text/html');
    parsed.querySelectorAll('script,style,iframe,object,embed,form,input,button,textarea,select,link,meta').forEach(el=>el.remove());
    if(!images) parsed.querySelectorAll('img,picture,figure').forEach(el=>el.remove());
    parsed.querySelectorAll('*').forEach(el=>{
      for(const attr of [...el.attributes]) if(attr.name.startsWith('on')||['style','srcset','sizes','id'].includes(attr.name))el.removeAttribute(attr.name);
      if(el.tagName==='IMG') { el.loading='lazy'; el.removeAttribute('width');el.removeAttribute('height'); }
      if(el.tagName==='A') {
        const href=el.getAttribute('href')||'';
        if(/^(javascript|data):/i.test(href))el.removeAttribute('href');
        else if(/\.(?:jpe?g|png|webp|gif)(?:\?|$)/i.test(href)){
          const mapped=site.assets?.sourceMap?.[href] || (href.startsWith('assets/')?href:'');
          if(mapped){el.setAttribute('href',mapped);el.dataset.lightbox=mapped;}
          else {el.setAttribute('target','_blank');el.setAttribute('rel','noopener noreferrer');}
        }
        else if(/^https?:\/\/(?:www\.)?ddn\.by(?:\/|$)/i.test(href)||href.startsWith('/'))el.setAttribute('href',sourceRoute(href));
        else if(/^https?:/i.test(href)){el.setAttribute('target','_blank');el.setAttribute('rel','noopener noreferrer');}
      }
    });
    if(!images) parsed.querySelectorAll('a').forEach(el=>{if(!el.textContent.trim())el.remove();});
    return parsed.body.innerHTML;
  }
  function sourceRoute(url) {
    try {
      const u = new URL(url,'https://ddn.by');
      const parts = decodeURIComponent(u.pathname).split('/').filter(Boolean);
      const slug = parts.at(-1)||'';
      if(!parts.length)return '#/';
      if(productMap.has(slug))return route('product/'+encodeURIComponent(slug));
      if(projectMap.has(slug))return route('project/'+encodeURIComponent(slug));
      if(site.categories.some(c=>c.slug===slug))return route('category/'+encodeURIComponent(slug));
      if(/our-works/.test(slug))return route('projects');
      if(/contact|kontak/.test(slug))return route('contacts');
      if(/about|company|kompani/.test(slug))return route('about');
      if(/catalog/.test(slug))return route('catalog');
      if(site.pages.some(p=>p.slug===slug))return route('page/'+encodeURIComponent(slug));
      return '#/catalog';
    } catch {return '#/catalog';}
  }
  function gallery(images, name) {
    images = [...new Set(images||[])].filter(Boolean);
    return `<div class="gallery"><button class="gallery-main" type="button" data-lightbox="${esc(images[0]||'')}" aria-label="Увеличить фотографию">${image(images[0],name,'',true)}</button>${images.length>1?`<div class="gallery-thumbs">${images.map((src,i)=>`<button type="button" class="thumb${i===0?' active':''}" data-gallery-src="${esc(src)}" aria-label="Фотография ${i+1}">${image(src,name)}</button>`).join('')}</div>`:''}</div>`;
  }
  function productPage(slug) {
    const p = productMap.get(slug);
    if(!p)return notFound();
    if(p.isWeapon)return referencePage(p.name);
    const cat = (p.categoryIds||[]).map(id=>categories.get(String(id))).find(Boolean);
    const related = normalProducts().filter(x=>canonicalProductIds.get(x.id)!==canonicalProductIds.get(p.id)&&(x.categoryIds||[]).some(id=>(p.categoryIds||[]).includes(id))).slice(0,4);
    const attrs = (p.attributes||[]).map(a=>Array.isArray(a)?{name:a[0],value:a[1]}:a).filter(a=>a.name && (a.value || a.options));
    return breadcrumb([['Продукция',route('catalog')],...(cat?[[cat.name,route('category/'+encodeURIComponent(cat.slug))]]:[]),[p.name]])+`<section class="section container product-section"><div class="product-layout">${gallery(p.images,p.name)}<div class="product-info"><p class="eyebrow">Dream Design · собственное производство</p><h1>${esc(p.name)}</h1>${cat?`<a class="product-category" href="${route('category/'+encodeURIComponent(cat.slug))}">${esc(cat.name)}</a>`:''}<div class="rich-text">${sanitizeHtml(p.descriptionHtml)||`<p>${esc(p.descriptionText||'Исполнение и комплектацию можно обсудить с учётом вашей задачи.')}</p>`}</div>${attrs.length?`<dl class="details-grid">${attrs.map(a=>`<div class="detail-item"><dt>${esc(a.name)}</dt><dd>${esc(a.value||a.options.join(', '))}</dd></div>`).join('')}</dl>`:''}<a class="button button-primary" href="${route('request',{product:p.slug})}">Обсудить изготовление ${icon('arrow')}</a><p class="product-help">К заявке можно приложить чертежи или техническое задание.</p></div></div></section>${related.length?`<section class="section container related-section"><div class="section-heading"><h2>В этом направлении</h2></div><div class="catalog-grid">${related.map(productCard).join('')}</div></section>`:''}`;
  }
  function projectsPage(params) {
    const filter=params.get('type')||'all';
    let list=normalProjects();
    const type=p=>/школ|талант/i.test(p.name)?'school':/детск|диносад|птичий/i.test(p.name)?'kindergarten':/квартир|проект дома|частн/i.test(p.name)?'residential':/mercedes|штабной модуль/i.test(p.name)?'other':'business';
    if(filter!=='all')list=list.filter(p=>type(p)===filter);
    return breadcrumb([['Наши работы']])+pageHeading('Наши работы','Посмотрите, как мебель и индивидуальные решения выглядят в реализованных проектах.','Отдельные изделия и целые пространства')+`<section class="section container"><div class="filter-chips">${[['all','Все проекты'],['business','Бизнес и общественные пространства'],['residential','Частные интерьеры'],['kindergarten','Детские сады'],['school','Школы'],['other','Другие проекты']].map(([key,label])=>`<a class="chip${filter===key?' active':''}" href="${route('projects',{type:key==='all'?'':key})}"${filter===key?' aria-current="true"':''}>${label}</a>`).join('')}</div>${list.length?`<div class="projects-grid">${list.map(projectCard).join('')}</div>`:'<div class="empty-state"><p>В этом разделе пока нет опубликованных проектов.</p><a class="button button-outline" href="#/projects">Все проекты</a></div>'}</section>`+requestStrip();
  }
  function projectPage(slug) {
    const p=projectMap.get(slug);
    if(!p)return notFound();
    if(p.isWeapon)return referencePage(p.name);
    if(/лыжероллер/i.test(p.name)) return breadcrumb([['Продукция',route('catalog')],['Лыжероллеры',route('direction/rollers')]])+pageHeading(p.name,'','Спортивное снаряжение')+`<section class="section container project-detail"><div class="project-cover">${image(p.images?.[0],p.name,'',true)}</div><div class="rich-text project-description">${sanitizeHtml(p.descriptionHtml,{images:false})}</div>${p.images?.length>1?`<div class="project-gallery">${p.images.slice(1).map((src,index)=>`<button class="project-gallery-item" type="button" data-lightbox="${esc(src)}" aria-label="Увеличить фотографию ${index+2}">${image(src,p.name)}</button>`).join('')}</div>`:''}<a class="button button-outline" href="${route('direction/rollers')}">Вернуться в направление ${icon('arrow')}</a></section>`;
    const school=/школ|талант/i.test(p.name), kinder=/детск|диносад|птичий/i.test(p.name);
    const target=school?'school':kinder?'kindergarten':'custom';
    return breadcrumb([['Наши работы',route('projects')],[p.name]])+pageHeading(p.name,'','Выполненный проект')+`<section class="section container project-detail"><div class="project-cover">${image(p.images?.[0],p.name,'',true)}</div><div class="rich-text project-description">${sanitizeHtml(p.descriptionHtml,{images:false})||`<p>${esc(p.descriptionText||'Пример реализации проекта Dream Design.')}</p>`}</div>${p.images?.length>1?`<div class="project-gallery">${p.images.slice(1).map((src,index)=>`<button class="project-gallery-item" type="button" data-lightbox="${esc(src)}" aria-label="Увеличить фотографию проекта ${index+2}">${image(src,p.name)}</button>`).join('')}</div>`:''}<div class="project-actions"><a class="button button-primary" href="${route('direction/'+target)}">Продукция этого направления ${icon('arrow')}</a><a class="button button-outline" href="${route('request',{project:p.slug})}">Обсудить похожий проект</a></div></section>`;
  }
  function aboutPage() {
    const source=site.pages.find(p=>/о компании|about|о нас/i.test(p.title+' '+p.slug));
    const img=asset('about','chair')||source?.images?.[0]||directionImage(directionDefinitions[0]);
    return breadcrumb([['О компании']])+pageHeading('Собственное производство Dream Design','Создаём мебель и решения для жилых, рабочих и общественных пространств.','Смолевичи · Беларусь')+`<section class="section container"><div class="split-feature"><div class="split-media">${image(img,'Производство и мебель Dream Design','',true)}</div><div class="split-copy"><h2>Возможности для вашего проекта</h2><p>На предприятии работают участки корпусной и индивидуальной мебели, мягкой мебели, швейного производства и металлообработки.</p><p>Опыт специалистов, собственная производственная база и оборудование позволяют работать с разными материалами и задачами.</p><a class="button button-primary" href="${route('catalog')}">Направления производства ${icon('arrow')}</a></div></div>${source?`<div class="rich-text company-content">${sanitizeHtml(source.html||source.descriptionHtml)||`<p>${esc(source.text||'')}</p>`}</div>`:''}</section>`+requestStrip();
  }
  function contactsPage() {
    const original=site.pages.find(p=>/контакт|contact/i.test(p.title+' '+p.slug));
    return breadcrumb([['Контакты']])+pageHeading('Контакты','Расскажите о вашей задаче — обсудим подходящее решение.','Dream Design')+`<section class="section container"><div class="contacts-grid"><div class="contact-card"><p class="eyebrow">Телефон</p><h2><a href="tel:+375293406374">+375 29 340-63-74</a></h2><a href="tel:+375177655251">+375 17 765-52-51</a><p>Контакты действующего сайта компании</p></div><div class="contact-card"><p class="eyebrow">Электронная почта</p><h2><a href="mailto:info@ddn.by">info@ddn.by</a></h2><p>Для общих вопросов и обсуждения проектов</p></div><div class="contact-card"><p class="eyebrow">Адрес производства</p><h2>Смолевичи</h2><p>Республика Беларусь, Минская область,<br>ул. Садовая, 18, 222201</p></div></div>${original?`<div class="rich-text company-content">${sanitizeHtml(original.html)||`<p>${esc(original.text||'')}</p>`}</div>`:''}<div class="contact-request"><h2>У вас есть чертёж или техническое задание?</h2><p>Покажите задачу через форму заявки.</p><a class="button button-primary" href="${route('request')}">Перейти к форме ${icon('arrow')}</a></div></section>`;
  }
  function requestPage(params) {
    const product=productMap.get(params.get('product'));
    const project=projectMap.get(params.get('project'));
    const context=product&&!product.isWeapon?'Интересует изготовление: '+product.name+'.':project&&!project.isWeapon?'Хочу обсудить проект по примеру: '+project.name+'.':'';
    selectedFiles=[];
    return breadcrumb([['Отправить заявку']])+`<section class="section container"><div class="form-layout"><div class="form-intro"><p class="eyebrow">Давайте начнём с вашей идеи</p><h1>Расскажите<br>о проекте</h1><p class="lead">Опишите, что нужно изготовить. Приложите чертежи, эскизы или техническое задание.</p><p>Чем подробнее исходные материалы, тем проще обсудить конструкцию, размеры и исполнение.</p><div class="form-contact"><p>Контакты компании</p><a href="tel:+375293406374">+375 29 340-63-74</a><a href="mailto:info@ddn.by">info@ddn.by</a></div></div><form class="request-form" novalidate><div class="form-notice"><strong>Демонстрационная форма</strong><p>Можно проверить заполнение и выбор файлов. Данные и файлы никуда не отправляются.</p></div><div class="form-row"><div class="form-field"><label for="request-name">Ваше имя <span aria-hidden="true">*</span></label><input id="request-name" name="name" autocomplete="name" required maxlength="100" placeholder="Как к вам обращаться"><span class="field-error" id="name-error"></span></div><div class="form-field"><label for="request-company">Организация</label><input id="request-company" name="company" autocomplete="organization" maxlength="150" placeholder="Необязательно"></div></div><div class="form-row"><div class="form-field"><label for="request-phone">Телефон</label><input id="request-phone" name="phone" type="tel" autocomplete="tel" placeholder="+375 …" aria-describedby="contact-error"></div><div class="form-field"><label for="request-email">Электронная почта</label><input id="request-email" name="email" type="email" autocomplete="email" placeholder="name@example.com" aria-describedby="contact-error"></div></div><span class="field-error" id="contact-error"></span><div class="form-field"><label for="request-message">Что нужно изготовить <span aria-hidden="true">*</span></label><textarea id="request-message" name="message" rows="5" required maxlength="6000" placeholder="Расскажите о задаче, размерах, количестве и пожеланиях">${esc(context)}</textarea><span class="field-error" id="message-error"></span></div><div class="form-field"><label for="request-files">Чертежи и техническое задание</label><label class="upload-zone" for="request-files">${icon('upload')}<strong>Выберите файлы или перетащите сюда</strong><span>PDF, JPG, PNG, DOCX, XLSX, DWG, DXF<br>До 5 файлов по 10 МБ, всего до 25 МБ</span><input class="upload-input" id="request-files" name="files" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx,.dwg,.dxf"></label><ul class="file-list" aria-live="polite"></ul><span class="field-error" id="files-error"></span><button class="file-clear" type="button" data-clear-files hidden>Очистить выбор файлов</button></div><label class="checkbox-field"><input type="checkbox" name="consent" required><span>Понимаю, что это демонстрация и заявка не будет отправлена.</span></label><span class="field-error" id="consent-error"></span><button class="button button-primary" type="submit">Проверить заявку ${icon('arrow')}</button><div class="form-message" role="status" aria-live="polite" tabindex="-1"></div></form></div></section>`;
  }
  function bindForm() {
    const form=main.querySelector('.request-form'); if(!form)return;
    const upload=form.querySelector('.upload-zone'), input=form.querySelector('#request-files');
    const clearFiles=form.querySelector('[data-clear-files]');
    const allowed=/\.(pdf|jpe?g|png|docx|xlsx|dwg|dxf)$/i;
    function resetStatus(){const status=form.querySelector('.form-message');status.className='form-message';status.textContent='';}
    form.addEventListener('input',resetStatus);
    function renderFiles() {
      form.querySelector('.file-list').innerHTML=selectedFiles.map((f,i)=>`<li class="file-item"><span><strong>${esc(f.name)}</strong><small>${(f.size/1024/1024).toFixed(2)} МБ</small></span><button type="button" data-remove-file="${i}" aria-label="Убрать ${esc(f.name)}">×</button></li>`).join('');
      clearFiles.hidden=!selectedFiles.length&&!form.querySelector('#files-error').textContent;
    }
    function acceptFiles(files) {
      resetStatus();
      const errors=[];
      for(const f of files){
        if(!allowed.test(f.name)){errors.push(`Формат файла «${f.name}» не поддерживается.`);continue;}
        if(f.size>10*1024*1024){errors.push(`Файл «${f.name}» больше 10 МБ.`);continue;}
        if(selectedFiles.some(x=>x.name===f.name&&x.size===f.size)){continue;}
        if(selectedFiles.length>=5){errors.push('Можно выбрать не больше 5 файлов.');break;}
        if(selectedFiles.reduce((n,x)=>n+x.size,0)+f.size>25*1024*1024){errors.push('Общий размер файлов не должен превышать 25 МБ.');continue;}
        selectedFiles.push(f);
      }
      form.querySelector('#files-error').textContent=errors.join(' ');input.value='';renderFiles();
    }
    clearFiles.addEventListener('click',()=>{selectedFiles=[];input.value='';form.querySelector('#files-error').textContent='';resetStatus();renderFiles();});
    input.addEventListener('change',()=>acceptFiles([...input.files]));
    upload.addEventListener('dragover',e=>{e.preventDefault();upload.classList.add('is-dragging');});
    upload.addEventListener('dragleave',()=>upload.classList.remove('is-dragging'));
    upload.addEventListener('drop',e=>{e.preventDefault();upload.classList.remove('is-dragging');acceptFiles([...e.dataTransfer.files]);});
    form.querySelector('.file-list').addEventListener('click',e=>{const b=e.target.closest('[data-remove-file]');if(b){selectedFiles.splice(Number(b.dataset.removeFile),1);resetStatus();renderFiles();}});
    form.addEventListener('submit',e=>{
      e.preventDefault();
      const values=new FormData(form), name=String(values.get('name')||'').trim(), phone=String(values.get('phone')||'').trim(), email=String(values.get('email')||'').trim(), message=String(values.get('message')||'').trim();
      const errors={name:!name?'Укажите ваше имя.':'',contact:!phone&&!email?'Укажите телефон или электронную почту.':email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?'Проверьте электронную почту.':phone&&phone.replace(/\D/g,'').length<7?'Проверьте номер телефона.':'',message:!message?'Кратко опишите вашу задачу.':'',consent:!values.get('consent')?'Подтвердите, что понимаете демонстрационный режим.':'',files:form.querySelector('#files-error').textContent.trim()};
      Object.entries(errors).forEach(([key,value])=>{form.querySelector('#'+key+'-error').textContent=value;});
      const status=form.querySelector('.form-message');
      if(Object.values(errors).some(Boolean)){status.className='form-message error';status.textContent='Проверьте отмеченные поля.';form.querySelector('.field-error:not(:empty)')?.scrollIntoView({block:'center',behavior:'smooth'});return;}
      status.className='form-message success';status.innerHTML=`<strong>Заявка заполнена корректно</strong><p>Вы выбрали файлов: ${selectedFiles.length}. Это демонстрация: заявка и файлы не отправлены. Можно изменить данные и проверить форму ещё раз.</p>`;status.focus();
    });
  }
  function referencePage(model='') {
    const records=site.products.filter(p=>p.isWeapon);
    return breadcrumb([['Спортивная пневматика']])+pageHeading(model||'Спортивная пневматика','Справочная информация о направлении производства.','Информация и документы')+`<section class="section container reference-page"><div class="rich-text"><p>Спортивная пневматика представлена отдельным справочным разделом. Сведения не смешиваются с мебелью и материалами для школ и детских садов.</p><h2>Наименования в исходных материалах компании</h2><ul>${records.map(p=>`<li>${esc(p.name)}</li>`).join('')}</ul><h2>Документация и безопасность</h2><p>Правовой статус конкретного изделия, его назначение и требования к обращению следует определять по действующим документам производителя и применимому законодательству. Для публикации документов необходима отдельная проверка их актуальности.</p><p>В этой демонстрационной части отсутствуют цены, оформление заказа и коммерческие рекомендации.</p><a class="button button-outline" href="${route('direction/rollers')}">Лыжероллеры в отдельном разделе</a></div></section>`;
  }
  function structurePage() {
    return breadcrumb([['Схема разделов']])+pageHeading('Как устроен сайт','Понятные направления, продукция и примеры выполненных проектов.','Структура для согласования')+`<section class="section container structure-page"><div class="structure-grid"><div><h2><a href="${route('catalog')}">Продукция</a></h2><h3>Мебель и оснащение</h3><ul>${directionDefinitions.slice(0,6).map(d=>`<li><a href="${route('direction/'+d.slug)}">${esc(d.name)}</a></li>`).join('')}</ul><h3>Другие направления производства</h3><ul>${directionDefinitions.slice(6).map(d=>`<li><a href="${route('direction/'+d.slug)}">${esc(d.name)}</a></li>`).join('')}</ul><p><a href="${route('reference')}">Спортивная пневматика · справочная информация</a></p></div><div><h2><a href="${route('projects')}">Наши работы</a></h2><p>Реализованные проекты и оснащённые объекты. Подходящая продукция связана с примерами работ.</p><h2><a href="${route('about')}">О компании</a></h2><p>Производство и возможности компании.</p><h2><a href="${route('contacts')}">Контакты</a></h2><p>Телефоны, почта и адрес производства.</p><h2><a href="${route('request')}">Форма заявки</a></h2><p>Описание задачи, чертежи и техническое задание.</p></div></div></section>`;
  }
  function privacyPage() {
    return breadcrumb([['О форме и данных']])+pageHeading('Демонстрационная форма')+`<section class="section container"><div class="rich-text"><p>Этот сайт подготовлен для согласования структуры и оформления Dream Design.</p><p>Заполнение формы, выбор и проверка файлов происходят в вашем браузере. Форма не отправляет обращения, не загружает файлы на сервер и не сохраняет их после закрытия страницы. Сторонние счётчики аналитики в демонстрацию не включены.</p><p>При использовании общедоступного сайта GitHub Pages действуют правила его хостинга. Эта страница описывает только работу демонстрационной формы и не является политикой действующего сайта компании.</p><a class="button button-outline" href="${route('request')}">Вернуться к форме</a></div></section>`;
  }
  function genericPage(slug) {
    const p=site.pages.find(p=>p.slug===slug);if(!p||p.service||['my-account','checkout'].includes(slug))return notFound();
    return breadcrumb([[p.title]])+pageHeading(p.title)+`<section class="section container"><div class="rich-text">${sanitizeHtml(p.html)||`<p>${esc(p.text||'')}</p>`}</div></section>`;
  }
  function notFound() {return pageHeading('Страница не найдена','Выберите направление в каталоге или вернитесь на главную.')+`<section class="section container empty-state"><a class="button button-primary" href="#/catalog">Перейти в каталог ${icon('arrow')}</a></section>`;}
  function bindInteractions() {
    main.querySelector('[data-category-picker]')?.addEventListener('change',event=>{location.hash=event.target.value;});
    main.querySelectorAll('[data-search-form]').forEach(form=>form.addEventListener('submit',event=>{event.preventDefault();const values=new FormData(form);location.hash=route(form.dataset.path||'catalog/all',{q:String(values.get('q')||'').trim(),sort:values.get('sort')==='source'?'':values.get('sort')});}));
    main.querySelectorAll('[data-gallery-src]').forEach(b=>b.addEventListener('click',()=>{const gallery=b.closest('.gallery');gallery.querySelector('.gallery-main img').src=b.dataset.gallerySrc;gallery.querySelector('.gallery-main').dataset.lightbox=b.dataset.gallerySrc;gallery.querySelectorAll('.thumb').forEach(x=>x.classList.toggle('active',x===b));}));
    main.querySelectorAll('[data-lightbox]').forEach(b=>b.addEventListener('click',event=>{event.preventDefault();if(!b.dataset.lightbox)return;const dialog=document.getElementById('lightbox');dialog.querySelector('img').src=b.dataset.lightbox;dialog.querySelector('img').alt=b.querySelector('img')?.alt||'Фотография';dialog.showModal();}));
    bindForm();
    main.querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{if(img.dataset.fallback)return;img.dataset.fallback='true';img.classList.add('image-unavailable');img.alt=img.alt||'Фотография изделия';}));
  }
  function render() {
    if(!site)return;
    const raw=location.hash.replace(/^#\/?/,'');
    const [path, query='']=raw.split('?');
    const parts=path.split('/');
    const slug=decodeURIComponent(parts[1]||'');
    const params=new URLSearchParams(query);
    let markup;
    let title='Dream Design';
    if(!path){markup=home();title='Мебель для ваших проектов';}
    else if(path==='catalog'){markup=catalogLanding();title='Продукция';}
    else if(path==='catalog/all'){markup=catalogResults(normalProducts(),params,path,'Весь каталог','Изделия и решения собственного производства.');title='Каталог';}
    else if(parts[0]==='category'){
      const cat=site.categories.find(c=>c.slug===slug);
      if(cat){const ids=categoryDescendants(cat.id);markup=catalogResults(normalProducts().filter(p=>(p.categoryIds||[]).some(id=>ids.has(String(id)))),params,path,cat.name,text(cat.description||''),slug);title=cat.name;}
      else markup=notFound();
    }
    else if(parts[0]==='direction'){
      const def=directionDefinitions.find(d=>d.slug===slug);
      if(def){const related=normalProjects().filter(p=>slug==='school'?/школ|талант/i.test(p.name):slug==='kindergarten'?/детск|диносад|птичий/i.test(p.name):slug==='custom'?!/школ|детск|лыжероллер/i.test(p.name):false);markup=catalogResults(directionProducts(def),params,path,def.name,def.caption,slug,related);title=def.name;if(slug==='rollers'){const article=site.projects.find(p=>!p.isWeapon&&/лыжероллер/i.test(p.name));if(article)markup+=`<section class="section container direction-article"><h2>О лыжероллерах Dream Design</h2><p>Фотографии и сведения о спортивном снаряжении собственного производства.</p><a class="card-link" href="${route('project/'+encodeURIComponent(article.slug))}">Подробнее о направлении ${icon('arrow')}</a></section>`;}}
      else markup=notFound();
    }
    else if(parts[0]==='product'){markup=productPage(slug);title=productMap.get(slug)?.name||'Изделие';}
    else if(parts[0]==='projects'){markup=projectsPage(params);title='Наши работы';}
    else if(parts[0]==='project'){markup=projectPage(slug);title=projectMap.get(slug)?.name||'Проект';}
    else if(path==='about'){markup=aboutPage();title='О компании';}
    else if(path==='contacts'){markup=contactsPage();title='Контакты';}
    else if(path==='request'){markup=requestPage(params);title='Отправить заявку';}
    else if(path==='reference'){markup=referencePage();title='Спортивная пневматика · справка';}
    else if(path==='structure'){markup=structurePage();title='Схема разделов';}
    else if(path==='privacy'){markup=privacyPage();title='О форме и данных';}
    else if(parts[0]==='page'){markup=genericPage(slug);title=site.pages.find(p=>p.slug===slug)?.title||'Информация';}
    else markup=notFound();
    main.innerHTML=markup;document.title=title+' — Dream Design · демонстрация';renderHeader(path);bindInteractions();window.scrollTo({top:0,behavior:'instant'});
  }
  const lightbox=document.getElementById('lightbox');
  lightbox.querySelector('button').addEventListener('click',()=>lightbox.close());
  lightbox.addEventListener('click',event=>{if(event.target===lightbox)lightbox.close();});
  document.addEventListener('click',event=>{const link=event.target.closest('a[href="#main"]');if(link){event.preventDefault();main.focus();main.scrollIntoView();}});
  window.addEventListener('hashchange',render);
  fetch('data/site.json').then(response=>{if(!response.ok)throw new Error('Каталог не загрузился');return response.json();}).then(data=>{
    site=data;site.categories ||= [];site.products ||= [];site.projects ||= [];site.pages ||= [];site.assets ||= {};
    categories=new Map(site.categories.map(c=>[String(c.id),c]));productMap=new Map(site.products.map(p=>[p.slug,p]));projectMap=new Map(site.projects.map(p=>[p.slug,p]));
    const signatures=new Map();listingProducts=[];canonicalProductIds=new Map();
    for(const p of site.products){
      if(p.isWeapon)continue;
      const signature=JSON.stringify([norm(p.name),(p.descriptionHtml||'').trim(),(p.descriptionText||'').trim(),p.images||[],[...(p.categoryIds||[])].sort(),p.attributes||[]]);
      if(signatures.has(signature))canonicalProductIds.set(p.id,signatures.get(signature));
      else {signatures.set(signature,p.id);canonicalProductIds.set(p.id,p.id);listingProducts.push(p);}
    }
    renderFooter();render();
  }).catch(()=>{main.innerHTML='<section class="section container error-state"><h1>Не удалось загрузить каталог</h1><p>Проверьте соединение и обновите страницу.</p><button class="button button-primary" type="button" onclick="location.reload()">Попробовать ещё раз</button></section>';});
})();
