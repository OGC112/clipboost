(() => {
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const route=()=>String(location.hash||'#/home').replace(/^#\/?/,'').split(/[?&]/)[0]||'home';
  const esc=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  function nativeNavigate(page){
    const original=$(`#sidebar [data-page="${page}"]`);
    if(original){ original.click(); return; }
    const fallback=$(`[data-page="${page}"]`);
    if(fallback){ fallback.click(); return; }
    if(page==='analytics') location.hash='#/analytics';
  }

  const cache={time:0,library:null,projects:[],campaigns:[]};
  async function getData(){
    if(Date.now()-cache.time<12000)return cache;
    try{
      const [l,p,c]=await Promise.allSettled([
        fetch('/api/library/creators').then(r=>r.ok?r.json():({creators:[]})),
        fetch('/api/projects').then(r=>r.ok?r.json():([])),
        fetch('/api/campaigns').then(r=>r.ok?r.json():({campaigns:[]}))
      ]);
      cache.library=l.status==='fulfilled'?l.value:{creators:[]};
      cache.projects=p.status==='fulfilled'?(Array.isArray(p.value)?p.value:(p.value?.projects||[])):[];
      cache.campaigns=c.status==='fulfilled'?(Array.isArray(c.value)?c.value:(c.value?.campaigns||[])):[];
      cache.time=Date.now();
    }catch{}
    return cache;
  }

  function mediaItems(data){
    const out=[];
    for(const c of data?.library?.creators||[]){
      for(const v of c.videos||[])out.push({...v,creator:c});
      for(const v of c.vods||[])out.push({...v,creator:c});
      for(const v of c.clips||[])out.push({...v,creator:c});
    }
    return out.filter(x=>x.thumbnail).sort((a,b)=>new Date(b.publishedAt||b.createdAt||0)-new Date(a.publishedAt||a.createdAt||0));
  }

  function logo(){
    return `<span class="m212-logo"><i></i><b></b></span><strong>Mint</strong>`;
  }

  function shell(){
    const top=$('.topbar');
    if(!top||top.dataset.m212==='1')return;
    top.dataset.m212='1';
    const current=route();
    const updater=$('#updateCenterBtn',top);
    top.className='topbar m212-topbar';
    top.innerHTML=`
      <button class="m212-brand" data-m212-page="home">${logo()}</button>
      <nav class="m212-nav">
        ${[['home','Home'],['studio','AI Studio'],['campaigns','Campaign Studio'],['library','Library'],['projects','Projects'],['analytics','Results'],['settings','Settings']]
          .map(([id,label])=>`<button data-m212-page="${id}" class="${current===id?'active':''}">${label}</button>`).join('')}
      </nav>
      <div class="m212-actions">
        <button class="m212-icon">⌕</button>
        <button class="m212-icon">♢</button>
        <button class="m212-create" data-m212-page="${current==='campaigns'?'campaigns':'studio'}">＋ Create</button>
        <button class="m212-avatar" data-m212-page="settings">U</button>
      </div>`;
    if(updater)$('.m212-actions',top)?.prepend(updater);
    $('.sidebar')?.classList.add('m212-sidebar-hidden');
  }

  function renameBrand(){
    const root=$('#app');if(!root)return;
    const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];while(w.nextNode())nodes.push(w.currentNode);
    for(const n of nodes){
      if(['SCRIPT','STYLE','TEXTAREA'].includes(n.parentElement?.tagName))continue;
      if(n.nodeValue?.includes('ClipBoost'))n.nodeValue=n.nodeValue.replaceAll('ClipBoost','Mint');
    }
    document.title='Mint';
  }

  async function home(){
    if(route()!=='home')return;
    const host=$('.simple-home-v2');
    if(!host||host.dataset.m212==='1')return;
    host.dataset.m212='1';
    const data=await getData();
    if(route()!=='home'||!document.body.contains(host))return;
    const media=mediaItems(data);
    const active=data.campaigns.filter(c=>String(c.status||'active')==='active');

    const current=$('.simple-continue',host);
    const campaign=$('.simple-campaign',host);
    const recent=$('.simple-recent',host);

    const hero=document.createElement('section');
    hero.className='m212-home-hero';
    hero.innerHTML=`
      <div class="m212-hero-copy">
        <span class="m212-kicker">Creator workspace</span>
        <h1>Turn content into <em>opportunities.</em></h1>
        <p>Find strong moments, edit faster, and keep paid campaign work in its own focused flow.</p>
        <div class="m212-hero-actions">
          <button class="m212-primary" data-m212-page="studio">＋ Create a clip</button>
          <button class="m212-secondary" data-m212-page="library">Import content</button>
        </div>
      </div>
      <div class="m212-home-media">
        ${media.slice(0,3).map((m,i)=>`<div class="shot s${i+1}"><img src="${esc(m.thumbnail)}" alt="" referrerpolicy="no-referrer"><span>${esc(m.creator?.name||'Creator')}</span></div>`).join('')}
      </div>`;
    host.prepend(hero);

    const oldHead=$('.simple-home-head',host);
    if(oldHead)oldHead.remove();

    const main=document.createElement('section');
    main.className='m212-home-main';
    const left=document.createElement('div');left.className='m212-home-left';
    const right=document.createElement('aside');right.className='m212-home-right';
    if(recent)left.appendChild(recent);
    if(current)left.appendChild(current);
    if(campaign)right.appendChild(campaign);

    const discovery=document.createElement('section');
    discovery.className='m212-discovery-card';
    discovery.innerHTML=`
      <header><div><span class="m212-kicker">Discover</span><h2>Creator content</h2></div><button data-m212-page="library">Browse library →</button></header>
      <div class="m212-discovery-grid">
        ${media.slice(0,3).map(m=>`<article><img src="${esc(m.thumbnail)}" alt="" referrerpolicy="no-referrer"><strong>${esc((m.title||'Creator content').slice(0,52))}</strong><small>${esc(m.creator?.name||'Library')}</small></article>`).join('')||'<div class="m212-empty">Import creator content to populate this section.</div>'}
      </div>`;
    left.prepend(discovery);

    const campaignStack=document.createElement('section');
    campaignStack.className='m212-campaign-stack';
    campaignStack.innerHTML=`<header><span class="m212-kicker">Campaigns</span><h2>${active.length?`${active.length} active campaign${active.length===1?'':'s'}`:'No active campaigns'}</h2></header>`;
    if(active.length){
      for(const c of active.slice(0,3)){
        const b=document.createElement('button');
        b.className='m212-campaign-pill';
        b.dataset.m212Page='campaigns';
        b.innerHTML=`<span>◎</span><div><strong>${esc(c.name||'Campaign')}</strong><small>${esc(c.provider||'Campaign')}</small></div><b>Open →</b>`;
        campaignStack.appendChild(b);
      }
    }
    right.prepend(campaignStack);

    main.append(left,right);
    host.appendChild(main);

    const oldGrid=$('.simple-home-grid',host);
    if(oldGrid && !oldGrid.children.length)oldGrid.remove();
  }

  async function studio(){
    if(route()!=='studio')return;
    const host=$('.content');
    if(!host||host.dataset.m212Studio==='1')return;
    host.dataset.m212Studio='1';
    host.classList.add('m212-studio');

    const data=await getData();
    const media=mediaItems(data).slice(0,4);

    const title=$('.page-title',host);
    if(title){
      title.classList.add('m212-studio-head');
      const h=$('h1',title),p=$('p',title);
      if(h)h.textContent='AI Studio';
      if(p)p.textContent='From source to short-form edit in one focused workspace.';
      title.insertAdjacentHTML('beforeend',`
        <div class="m212-studio-strip">
          ${media.map(m=>`<img src="${esc(m.thumbnail)}" alt="" referrerpolicy="no-referrer">`).join('')}
        </div>`);
    }

    const uploader=$('.upload-card',host);
    const layout=$('.studio-layout',host);
    if(!layout)return;

    const main=$('.studio-main',layout);
    const preview=$('.short-panel',layout);
    const controls=$('.controls',layout);

    const workspace=document.createElement('section');
    workspace.className='m212-editor-shell';

    const sourceCol=document.createElement('div');
    sourceCol.className='m212-source-column';
    if(uploader)sourceCol.appendChild(uploader);
    if(main)sourceCol.appendChild(main);

    const rail=document.createElement('aside');
    rail.className='m212-ai-rail';
    rail.innerHTML=`<div class="m212-rail-tabs"><button class="active">Preview</button><button>AI Tools</button></div>`;
    if(preview)rail.appendChild(preview);
    if(controls)rail.appendChild(controls);

    workspace.append(sourceCol,rail);
    layout.replaceWith(workspace);

    const feature=document.createElement('section');
    feature.className='m212-feature-row';
    feature.innerHTML=`
      <button><span>▣</span><b>Auto clips</b><small>Find strong moments</small></button>
      <button><span>CC</span><b>Captions</b><small>Style automatically</small></button>
      <button><span>✂</span><b>Smart edit</b><small>Cut & reframe</small></button>
      <button><span>✦</span><b>Highlights</b><small>Key moments</small></button>`;
    title?.insertAdjacentElement('afterend',feature);

    $$('.auto-director-tags',host).forEach(box=>box.classList.add('m212-tag-row'));
  }

  function campaigns(){
    if(route()!=='campaigns')return;
    const host=$('.content');
    if(!host||host.dataset.m212Campaigns==='1')return;
    host.dataset.m212Campaigns='1';
    host.classList.add('m212-campaigns');

    const title=$('.campaign-page-title',host)||$('.page-title',host);
    if(title){
      title.classList.add('m212-campaign-head');
      title.insertAdjacentHTML('beforeend','<div class="m212-target"><i></i><b></b><span>➶</span></div>');
    }

    const importBox=$('.campaign-import-compact',host);
    const list=$('.campaign-list-real',host);
    const detail=$('.campaign-detail-compact',host);

    const intro=document.createElement('section');
    intro.className='m212-campaign-overview';
    intro.innerHTML=`
      <div class="m212-flow">
        <span><i>1</i>Add sources</span><b>→</b>
        <span><i>2</i>Create clips</span><b>→</b>
        <span><i>3</i>Set rules</span><b>→</b>
        <span><i>4</i>Track results</span>
      </div>`;
    title?.insertAdjacentElement('afterend',intro);

    const work=document.createElement('section');
    work.className='m212-campaign-work';

    const left=document.createElement('aside');
    left.className='m212-campaign-sidebar';
    left.innerHTML='<div class="m212-section-label">Campaigns</div>';
    if(list)left.appendChild(list);
    if(importBox)left.appendChild(importBox);

    const main=document.createElement('div');
    main.className='m212-campaign-main';
    if(detail)main.appendChild(detail);

    work.append(left,main);
    intro.insertAdjacentElement('afterend',work);
  }

  function library(){
    if(route()!=='library')return;
    const host=$('.content');
    if(!host||host.dataset.m212Library==='1')return;
    host.dataset.m212Library='1';
    host.classList.add('m212-library');

    const title=$('.page-title',host);
    if(title){
      const h=$('h1',title),p=$('p',title);
      if(h)h.textContent='Content Library';
      if(p)p.textContent='Browse creators and source platforms, then send the best content to AI Studio.';
      title.classList.add('m212-library-head');
    }

    const platforms=$('.library-platform-tabs',host);
    const creators=$('.library-card',host);
    const toolbar=$('.library-toolbar',host);
    const media=$('.yt-vod-list',host);

    const shell=document.createElement('section');
    shell.className='m212-library-shell';
    const side=document.createElement('aside');
    side.className='m212-library-side';
    side.innerHTML='<div class="m212-section-label">Sources</div>';
    if(platforms)side.appendChild(platforms);
    if(creators)side.appendChild(creators);

    const main=document.createElement('div');
    main.className='m212-library-main';
    if(toolbar)main.appendChild(toolbar);
    if(media)main.appendChild(media);

    shell.append(side,main);
    title?.insertAdjacentElement('afterend',shell);

    if(media)media.classList.add('m212-library-grid');
    $$('.yt-vod-item',host).forEach(x=>x.classList.add('m212-library-card'));
  }

  async function projects(){
    if(route()!=='projects')return;
    const host=$('.content');
    if(!host||host.dataset.m212Projects==='1')return;
    host.dataset.m212Projects='1';
    host.classList.add('m212-projects');

    const data=await getData();
    const media=mediaItems(data);

    const title=$('.page-title',host);
    if(title){
      const h=$('h1',title),p=$('p',title);
      if(h)h.textContent='Projects';
      if(p)p.textContent='All AI Studio and Campaign Studio work in one place.';
      title.insertAdjacentHTML('afterend',`
        <div class="m212-project-filters">
          <button class="active">All</button><button>AI Studio</button><button>Campaign Studio</button>
          <span></span><button>Active</button><button>Draft</button><button>Completed</button>
        </div>`);
    }

    const list=$('.projects',host);
    if(list)list.classList.add('m212-project-grid');
    $$('.project-row',host).forEach((card,i)=>{
      card.classList.add('m212-project-card');
      const thumb=$('.project-source-thumb',card);
      if(thumb && media[i%Math.max(1,media.length)]?.thumbnail){
        thumb.innerHTML=`<img class="m212-project-thumb" src="${esc(media[i%media.length].thumbnail)}" alt="" referrerpolicy="no-referrer">`;
      }
    });
  }

  function results(){
    if(route()!=='analytics')return;
    const host=$('.content');
    if(!host||host.dataset.m212Results==='1')return;
    host.dataset.m212Results='1';
    host.classList.add('m212-results');

    const title=$('.page-title',host);
    if(title){
      const p=$('p',title);
      if(p)p.textContent='See what is working across clips and campaigns.';
    }

    const kpis=$('.mint-results-kpis',host)||$('[class*="results-kpis"]',host);
    const chart=$('.mint28-results-chart',host)||$('[class*="results-chart"]',host);
    const table=$('.mint-results-table',host);

    if(kpis)kpis.classList.add('m212-results-kpis');

    const hero=document.createElement('section');
    hero.className='m212-results-main';

    const chartWrap=document.createElement('div');
    chartWrap.className='m212-results-chart';
    chartWrap.innerHTML='<div class="m212-section-label">Performance</div><h2>Views & payout</h2>';
    if(chart)chartWrap.appendChild(chart);

    const top=document.createElement('aside');
    top.className='m212-top-clips';
    top.innerHTML=`
      <div class="m212-section-label">Content</div>
      <h2>Top performing clips</h2>
      <div class="m212-empty">Top clips appear here as tracked campaign data arrives.</div>`;

    hero.append(chartWrap,top);
    if(kpis)kpis.insertAdjacentElement('afterend',hero);
    else title?.insertAdjacentElement('afterend',hero);

    if(table)table.classList.add('m212-results-table');
  }

  if(!window.__m212Bound){
    window.__m212Bound=true;
    document.addEventListener('click',e=>{
      const b=e.target.closest('[data-m212-page]');
      if(!b)return;
      e.preventDefault();
      nativeNavigate(b.dataset.m212Page);
    });
  }

  async function enhance(){
    shell();renameBrand();
    await Promise.allSettled([home(),studio(),projects()]);
    campaigns();library();results();
  }

  let queued=false;
  function schedule(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;enhance().catch(()=>{})});
  }

  new MutationObserver(schedule).observe(document.getElementById('app'),{childList:true,subtree:true});
  window.addEventListener('hashchange',()=>{cache.time=0;schedule()});
  window.addEventListener('popstate',schedule);
  schedule();
})();
