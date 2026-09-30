(() => {
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const route=()=>String(location.hash||'#/home').replace(/^#\/?/,'').split(/[?&]/)[0]||'home';

  function nativeNavigate(page){
    const original=$(`#sidebar [data-page="${page}"]`);
    if(original){ original.click(); return; }
    const fallback=$(`[data-page="${page}"]`);
    if(fallback){ fallback.click(); return; }
    if(page==='analytics'){ location.hash='#/analytics'; }
  }

  const cache={time:0,projects:[],campaigns:[],library:null};
  async function loadData(force=false){
    if(!force && Date.now()-cache.time<10000)return cache;
    try{
      const [p,c,l]=await Promise.allSettled([
        fetch('/api/projects').then(r=>r.ok?r.json():[]),
        fetch('/api/campaigns').then(r=>r.ok?r.json():({campaigns:[]})),
        fetch('/api/library/creators').then(r=>r.ok?r.json():({creators:[]}))
      ]);
      cache.projects=p.status==='fulfilled'?(Array.isArray(p.value)?p.value:(p.value?.projects||[])):[];
      cache.campaigns=c.status==='fulfilled'?(Array.isArray(c.value)?c.value:(c.value?.campaigns||[])):[];
      cache.library=l.status==='fulfilled'?l.value:{creators:[]};
      cache.time=Date.now();
    }catch{}
    return cache;
  }

  function libraryMedia(data){
    const creators=data?.library?.creators||[];
    const all=[];
    creators.forEach(c=>{
      (c.videos||[]).forEach(v=>all.push({...v,creator:c,platform:'youtube'}));
      (c.vods||[]).forEach(v=>all.push({...v,creator:c,platform:'twitch'}));
      (c.clips||[]).forEach(v=>all.push({...v,creator:c,platform:'twitch'}));
    });
    return all.filter(x=>x.thumbnail).sort((a,b)=>new Date(b.publishedAt||b.createdAt||0)-new Date(a.publishedAt||a.createdAt||0));
  }

  const fmt=n=>{
    const x=Number(n||0);
    if(x>=1e9)return `${(x/1e9).toFixed(x>=1e10?0:1)}B`;
    if(x>=1e6)return `${(x/1e6).toFixed(x>=1e7?0:1)}M`;
    if(x>=1e3)return `${(x/1e3).toFixed(x>=1e4?0:1)}K`;
    return String(Math.round(x));
  };
  const money=(n,c='USD')=>{
    try{return new Intl.NumberFormat('en-US',{style:'currency',currency:c||'USD',maximumFractionDigits:0}).format(Number(n||0))}
    catch{return `$${Math.round(Number(n||0))}`}
  };

  function brand(){
    return `<span class="m211-logo"><i></i><b></b></span><strong>Mint</strong>`;
  }

  function shell(){
    const top=$('.topbar');
    if(!top || top.dataset.m211==='1')return;
    top.dataset.m211='1';
    const current=route();
    const update=$('#updateCenterBtn',top);
    top.className='topbar m211-topbar';
    top.innerHTML=`
      <button class="m211-brand" type="button" data-m211-page="home">${brand()}</button>
      <nav class="m211-nav">
        ${[['home','Home'],['studio','AI Studio'],['campaigns','Campaign Studio'],['library','Library'],['projects','Projects'],['analytics','Results'],['settings','Settings']]
          .map(([id,label])=>`<button type="button" data-m211-page="${id}" class="${current===id?'active':''}">${label}</button>`).join('')}
      </nav>
      <div class="m211-top-actions">
        <button class="m211-icon" aria-label="Search">⌕</button>
        <button class="m211-icon" aria-label="Notifications">♢</button>
        <button class="m211-create" type="button" data-m211-page="${current==='campaigns'?'campaigns':'studio'}">＋ Create</button>
        <button class="m211-avatar" type="button" data-m211-page="settings">U</button>
      </div>`;
    if(update) $('.m211-top-actions',top)?.prepend(update);
    $('.sidebar')?.classList.add('m211-hide-sidebar');
  }

  function picture(url,alt=''){
    return url?`<img src="${esc(url)}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer">`:'<span class="m211-gradient-art"></span>';
  }

  async function home(){
    if(route()!=='home')return;
    const host=$('.simple-home-v2');
    if(!host || host.dataset.m211==='1')return;
    host.dataset.m211='1';
    const data=await loadData();
    if(route()!=='home' || !document.body.contains(host))return;

    const media=libraryMedia(data).slice(0,6);
    const active=data.campaigns.filter(c=>String(c.status||'active')==='active');
    const trackedViews=data.campaigns.reduce((s,c)=>s+Number(c?.totals?.totalViews||0),0);
    const confirmed=data.campaigns.reduce((s,c)=>s+Number(c?.totals?.confirmedRevenue||0),0);
    const clips=data.projects.reduce((s,p)=>s+Number(p?.candidateCount||0),0);
    const currency=data.campaigns.find(c=>c.currency)?.currency||'USD';

    host.innerHTML=`
      <section class="m211-home-hero">
        <div class="m211-home-copy">
          <h1>Turn content<br>into <span>opportunities</span></h1>
          <p>Create, edit and publish high-performing clips with AI.</p>
          <div class="m211-hero-actions">
            <button class="m211-btn primary" data-m211-page="studio">＋ Create a clip</button>
            <button class="m211-btn secondary" data-m211-page="library">⇧ Import content</button>
          </div>
        </div>
        <div class="m211-media-collage" aria-hidden="true">
          <div class="m211-media-card c1">${picture(media[0]?.thumbnail,media[0]?.title)}<small>0:32</small></div>
          <div class="m211-media-card c2">${picture(media[1]?.thumbnail,media[1]?.title)}<small>0:28</small></div>
          <div class="m211-media-card c3">${picture(media[2]?.thumbnail,media[2]?.title)}<small>0:41</small></div>
          <div class="m211-note">From long<br>videos to viral<br>clips ✦</div>
          <div class="m211-socials"><i>▶</i><i>♪</i><i>◎</i></div>
        </div>
      </section>

      <section class="m211-kpis">
        <article><span class="m211-kpi-icon purple">◉</span><div><small>Tracked Views</small><strong>${fmt(trackedViews)}</strong><em>${trackedViews?'Real tracked data':'Waiting for tracked data'}</em></div></article>
        <article><span class="m211-kpi-icon mint">$</span><div><small>Confirmed Payout</small><strong>${money(confirmed,currency)}</strong><em>${confirmed?'Confirmed earnings':'No payout confirmed yet'}</em></div></article>
        <article><span class="m211-kpi-icon pink">◎</span><div><small>Active Campaigns</small><strong>${active.length}</strong><em>${data.campaigns.length} total</em></div></article>
        <article><span class="m211-kpi-icon blue">▶</span><div><small>Video Clips</small><strong>${fmt(clips)}</strong><em>${data.projects.length} project${data.projects.length===1?'':'s'}</em></div></article>
      </section>

      <section class="m211-home-sections">
        <article class="m211-panel">
          <header><h2>Recent Clips</h2><button data-m211-page="projects">See all →</button></header>
          <div class="m211-recent-grid">
            ${media.length?media.slice(0,4).map((m,i)=>`<button class="m211-recent-card" data-m211-page="library">
              <div class="m211-thumb">${picture(m.thumbnail,m.title)}<span>${m.duration?Math.round(Number(m.duration)/60)+':'+String(Math.round(Number(m.duration)%60)).padStart(2,'0'):'Media'}</span></div>
              <strong>${esc(m.title||'Creator content')}</strong>
              <small>${esc(m.creator?.name||'Library')}</small>
            </button>`).join(''):`<div class="m211-empty">Import creator content to populate this section.</div>`}
          </div>
        </article>
        <article class="m211-panel">
          <header><h2>Active Campaigns</h2><button data-m211-page="campaigns">See all →</button></header>
          <div class="m211-campaign-mini-list">
            ${active.length?active.slice(0,3).map((c,i)=>`<button class="m211-campaign-mini" data-m211-page="campaigns">
              <span class="m211-campaign-pic p${i}">◎</span>
              <span><strong>${esc(c.name||'Campaign')}</strong><small>${esc(c.provider||'Campaign')}</small></span>
              <b>${c?.totals?.confirmedRevenue?money(c.totals.confirmedRevenue,c.currency||currency):'Active'}</b>
            </button>`).join(''):`<div class="m211-empty">No active campaign yet.</div>`}
          </div>
        </article>
      </section>`;
  }

  async function studio(){
    if(route()!=='studio')return;
    const host=$('.content');
    if(!host || host.dataset.m211Studio==='1')return;
    host.dataset.m211Studio='1';
    host.classList.add('m211-studio');

    const data=await loadData();
    const media=libraryMedia(data).slice(0,4);
    const title=$('.page-title',host);
    if(title){
      title.classList.add('m211-studio-hero');
      const h=$('h1',title),p=$('p',title);
      if(h)h.textContent='AI Studio';
      if(p)p.textContent='Turn any video into engaging short clips with AI.';
      if(!$('.m211-studio-collage',title)){
        title.insertAdjacentHTML('beforeend',`
          <div class="m211-studio-collage" aria-hidden="true">
            <div class="shot s1">${picture(media[0]?.thumbnail)}</div>
            <div class="shot s2">${picture(media[1]?.thumbnail)}</div>
            <div class="shot s3">${picture(media[2]?.thumbnail)}</div>
            <div class="shot s4">${picture(media[3]?.thumbnail)}</div>
            <div class="timeline"></div>
            <div class="m211-sticky-note">Edit<br>Faster<br>Smarter<br>Better ✦</div>
          </div>`);
      }
      if(!$('.m211-tool-row',host)){
        title.insertAdjacentHTML('afterend',`
          <section class="m211-tool-row">
            <article><span>▣</span><b>Auto Clips</b><small>Find the best moments</small></article>
            <article><span>CC</span><b>Auto Captions</b><small>Accurate & styled</small></article>
            <article><span>✂</span><b>Smart Edits</b><small>Cut, resize, enhance</small></article>
            <article><span>✦</span><b>AI Highlights</b><small>Key moments</small></article>
            <article><span>文</span><b>Translate</b><small>Multiple languages</small></article>
          </section>`);
      }
    }
    $('.upload-card',host)?.classList.add('m211-upload');
    $('.studio-layout',host)?.classList.add('m211-editor');
  }

  function campaigns(){
    if(route()!=='campaigns')return;
    const host=$('.content');
    if(!host || host.dataset.m211Campaigns==='1')return;
    host.dataset.m211Campaigns='1';
    host.classList.add('m211-campaigns');
    const title=$('.campaign-page-title',host)||$('.page-title',host);
    if(title){
      title.classList.add('m211-campaign-hero');
      if(!$('.m211-target-hero',title))title.insertAdjacentHTML('beforeend',`
        <div class="m211-target-hero" aria-hidden="true">
          <i></i><b></b><span>➶</span><em>Turn brand<br>partnerships<br>into viral clips</em>
        </div>`);
      if(!$('.m211-stepbar',host))title.insertAdjacentHTML('afterend',`
        <section class="m211-stepbar">
          <div><i>1</i><span>Add Sources</span></div><b>›</b>
          <div><i>2</i><span>Create Clips</span></div><b>›</b>
          <div><i>3</i><span>Set Rules</span></div><b>›</b>
          <div><i>4</i><span>Track Results</span></div>
        </section>`);
    }
    $('.campaign-import-compact',host)?.classList.add('m211-smart-import');
    $('.campaign-list-real',host)?.classList.add('m211-campaign-list');
    $('.campaign-detail-compact',host)?.classList.add('m211-campaign-detail');
  }

  function library(){
    if(route()!=='library')return;
    const host=$('.content');
    if(!host || host.dataset.m211Library==='1')return;
    host.dataset.m211Library='1';
    host.classList.add('m211-library');
    const title=$('.page-title',host);
    if(title){
      const h=$('h1',title),p=$('p',title);
      if(h)h.textContent='Content Library';
      if(p)p.textContent='Get content from YouTube, Twitch, X and more from different creators.';
    }
    $('.library-platform-tabs',host)?.classList.add('m211-platforms');
    $('.yt-vod-list',host)?.classList.add('m211-media-grid');
    $$('.yt-vod-item',host).forEach(x=>x.classList.add('m211-library-card'));
  }

  function projects(){
    if(route()!=='projects')return;
    const host=$('.content');
    if(!host || host.dataset.m211Projects==='1')return;
    host.dataset.m211Projects='1';
    host.classList.add('m211-projects');
    const title=$('.page-title',host);
    if(title){
      const h=$('h1',title),p=$('p',title);
      if(h)h.textContent='My projects';
      if(p)p.textContent='Manage all your AI Studio and Campaign Studio projects in one place.';
    }
    $('.projects',host)?.classList.add('m211-project-grid');
    $$('.project-row',host).forEach(x=>x.classList.add('m211-project-card'));
  }

  function results(){
    if(route()!=='analytics')return;
    const host=$('.content');
    if(!host || host.dataset.m211Results==='1')return;
    host.dataset.m211Results='1';
    host.classList.add('m211-results');
    const title=$('.page-title',host);
    if(title){
      const h=$('h1',title),p=$('p',title);
      if(h)h.textContent='Results';
      if(p)p.textContent='Track the performance of your clips and campaigns.';
    }
  }

  function rename(){
    const root=$('#app');if(!root)return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(n=>{
      if(['SCRIPT','STYLE','TEXTAREA'].includes(n.parentElement?.tagName))return;
      if(n.nodeValue?.includes('ClipBoost'))n.nodeValue=n.nodeValue.replaceAll('ClipBoost','Mint');
    });
    document.title='Mint';
  }

  if(!window.__m211Bound){
    window.__m211Bound=true;
    document.addEventListener('click',e=>{
      const b=e.target.closest('[data-m211-page]');
      if(!b)return;
      e.preventDefault();
      nativeNavigate(b.dataset.m211Page);
    });
  }

  async function enhance(){
    shell();
    rename();
    await Promise.allSettled([home(),studio()]);
    campaigns();library();projects();results();
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
