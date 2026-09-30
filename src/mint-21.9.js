(() => {
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const route=()=>String(location.hash||'#/home').replace(/^#\/?/,'').split(/[?&]/)[0]||'home';
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
  const go=page=>{location.hash=`#/${page}`};

  function logo(){
    return `<span class="m219-logo-mark"><i></i><b></b></span><strong>Mint</strong>`;
  }

  function shell(){
    const top=$('.topbar');
    if(!top)return;
    const r=route();
    const oldUpdate=$('#updateCenterBtn',top);
    top.className='topbar m219-topbar';
    top.innerHTML=`
      <button type="button" class="m219-brand" data-m219-route="home">${logo()}</button>
      <nav class="m219-nav">
        ${[['home','Home'],['studio','AI Studio'],['campaigns','Campaign Studio'],['library','Library'],['projects','Projects'],['analytics','Results'],['settings','Settings']]
          .map(([id,label])=>`<button type="button" data-m219-route="${id}" class="${r===id?'active':''}">${label}</button>`).join('')}
      </nav>
      <div class="m219-actions">
        <label class="m219-search"><span>⌕</span><input type="text" placeholder="Search projects, campaigns, media…"></label>
        <button class="m219-create" type="button" data-m219-route="${r==='campaigns'?'campaigns':'studio'}">＋ Create</button>
        <button class="m219-avatar" type="button" data-m219-route="settings" aria-label="Settings">U</button>
      </div>`;
    if(oldUpdate) $('.m219-actions',top).prepend(oldUpdate);
    $('.sidebar')?.classList.add('m219-hidden-sidebar');
    document.body.dataset.m219Route=r;
    document.title='Mint';
  }

  async function data(){
    if(window.__m219Data && Date.now()-window.__m219Data.time<12000)return window.__m219Data;
    let projects=[],campaigns=[];
    try{
      const [pr,cr]=await Promise.all([fetch('/api/projects'),fetch('/api/campaigns')]);
      if(pr.ok){const p=await pr.json();projects=Array.isArray(p)?p:(p.projects||[])}
      if(cr.ok){const c=await cr.json();campaigns=Array.isArray(c)?c:(c.campaigns||[])}
    }catch{}
    window.__m219Data={projects,campaigns,time:Date.now()};
    return window.__m219Data;
  }

  function thumb(p,i=0){
    const src=p?.externalSource?.thumbnail||p?.thumbnail||'';
    if(src)return `<img src="${esc(src)}" alt="" loading="lazy">`;
    return `<div class="m219-fallback t${i%4}"><span class="head"></span><span class="body"></span><i></i></div>`;
  }

  async function home(){
    if(route()!=='home')return;
    const host=$('.simple-home-v2');
    if(!host || host.dataset.m219==='1')return;
    host.dataset.m219='1';
    const {projects,campaigns}=await data();
    if(route()!=='home'||!document.body.contains(host))return;
    const active=campaigns.filter(c=>String(c.status||'active')==='active');
    const views=campaigns.reduce((s,c)=>s+Number(c?.totals?.totalViews||0),0);
    const payout=campaigns.reduce((s,c)=>s+Number(c?.totals?.confirmedRevenue||0),0);
    const clips=projects.reduce((s,p)=>s+Number(p?.candidateCount||0),0);
    const currency=campaigns.find(c=>c.currency)?.currency||'USD';
    const recent=projects.slice(0,4);
    const activeCards=active.slice(0,3);

    host.innerHTML=`
      <section class="m219-home-hero">
        <div class="m219-hero-copy">
          <h1>Turn content<br>into <span>opportunities</span></h1>
          <p>Create, edit and publish high-performing clips with AI.</p>
          <div class="m219-hero-buttons">
            <button class="m219-primary" data-m219-route="studio">⊕ Create a clip</button>
            <button class="m219-secondary" data-m219-route="library">▣ Import content</button>
          </div>
        </div>
        <div class="m219-hero-visual" aria-hidden="true">
          <div class="m219-screen s1">${recent[0]?thumb(recent[0],0):'<div class="m219-scene"></div>'}<b>0:32</b></div>
          <div class="m219-screen s2">${recent[1]?thumb(recent[1],1):'<div class="m219-scene"></div>'}<b>0:28</b></div>
          <div class="m219-screen s3">${recent[2]?thumb(recent[2],2):'<div class="m219-scene"></div>'}<b>0:41</b></div>
          <div class="m219-bubble">✦</div>
        </div>
      </section>

      <section class="m219-kpis">
        <article><span class="ico eye">◉</span><div><small>Tracked Views</small><strong>${fmt(views)}</strong><em>${views?'Real campaign tracking':'No tracked views yet'}</em></div></article>
        <article><span class="ico cash">$</span><div><small>Confirmed Payout</small><strong>${money(payout,currency)}</strong><em>${payout?'Confirmed earnings':'No confirmed payout yet'}</em></div></article>
        <article><span class="ico target">◎</span><div><small>Active Campaigns</small><strong>${active.length}</strong><em>${campaigns.length} total</em></div></article>
        <article><span class="ico play">▶</span><div><small>Video Clips</small><strong>${fmt(clips)}</strong><em>${projects.length} project${projects.length===1?'':'s'}</em></div></article>
      </section>

      <section class="m219-home-grid">
        <article class="m219-panel m219-recent">
          <header><h2>Recent Clips</h2><button data-m219-route="projects">See all →</button></header>
          <div class="m219-clip-grid">
            ${recent.length?recent.map((p,i)=>`<button class="m219-clip-card" data-m219-route="projects">
              <div class="m219-thumb">${thumb(p,i)}<span>${Number(p.candidateCount||0)} clips</span></div>
              <strong>${esc((p.originalName||'Project').replace(/^Trailer\s*/i,''))}</strong>
              <small>${esc(p.externalSource?.creatorName||p.campaignName||'AI Studio')}</small>
            </button>`).join(''):`<div class="m219-empty">Create or import a source to see recent clips here.</div>`}
          </div>
        </article>
        <article class="m219-panel m219-campaign-list">
          <header><h2>Active Campaigns</h2><button data-m219-route="campaigns">See all →</button></header>
          <div>
            ${activeCards.length?activeCards.map((c,i)=>`<button class="m219-campaign-mini" data-m219-route="campaigns">
              <span class="m219-campaign-icon c${i%3}">◎</span>
              <span><strong>${esc(c.name||'Campaign')}</strong><small>${esc(c.provider||'Campaign')}</small></span>
              <b>${c?.totals?.confirmedRevenue?money(c.totals.confirmedRevenue,c.currency||currency):'Active'}</b>
            </button>`).join(''):`<div class="m219-empty">No active campaign yet.</div>`}
          </div>
        </article>
      </section>`;
  }

  function studio(){
    if(route()!=='studio')return;
    const host=$('.content');
    if(!host || host.dataset.m219Studio==='1')return;
    host.dataset.m219Studio='1';
    host.classList.add('m219-studio');

    const pageTitle=$('.page-title',host);
    if(pageTitle){
      pageTitle.classList.add('m219-studio-head');
      const h=$('h1',pageTitle),p=$('p',pageTitle);
      if(h)h.textContent='AI Studio';
      if(p)p.textContent='Turn any video into engaging short clips with AI.';
    }

    const layout=$('.studio-layout',host);
    const upload=$('#dropZone',host)?.closest('.card')||$('#dropZone',host)?.parentElement;
    if(upload)upload.classList.add('m219-upload');

    if(!$('.m219-feature-row',host) && pageTitle){
      const f=document.createElement('section');
      f.className='m219-feature-row';
      f.innerHTML=`
        <article><span>▣</span><b>Auto Clips</b><small>Find the best moments</small></article>
        <article><span>CC</span><b>Auto Captions</b><small>Accurate & styled</small></article>
        <article><span>✦</span><b>Smart Edits</b><small>Cut, resize, enhance</small></article>
        <article><span>⌁</span><b>AI Highlights</b><small>Key moments</small></article>
        <article><span>文</span><b>Translate</b><small>Multiple languages</small></article>`;
      pageTitle.after(f);
    }
    if(layout)layout.classList.add('m219-editor');
  }

  async function campaigns(){
    if(route()!=='campaigns')return;
    const host=$('.content');
    if(!host || host.dataset.m219Campaigns==='1')return;
    host.dataset.m219Campaigns='1';
    host.classList.add('m219-campaigns');
    const {campaigns}=await data();
    if(route()!=='campaigns'||!document.body.contains(host))return;

    const title=$('.campaign-page-title',host)||$('.page-title',host);
    if(title){
      title.classList.add('m219-campaign-hero');
      if(!$('.m219-target-art',title))title.insertAdjacentHTML('beforeend','<div class="m219-target-art"><i></i><b></b><span>➶</span></div>');
    }
    if(title&&!$('.m219-steps',host)){
      title.insertAdjacentHTML('afterend',`<section class="m219-steps">
        <div><i>1</i><span>Add Sources</span></div><b>›</b>
        <div><i>2</i><span>Create Clips</span></div><b>›</b>
        <div><i>3</i><span>Set Rules</span></div><b>›</b>
        <div><i>4</i><span>Track Results</span></div>
      </section>`);
    }

    const importBox=$('.campaign-import-compact',host);
    if(importBox)importBox.classList.add('m219-import-box');

    const list=$('.campaign-list-real',host);
    if(list){
      list.classList.add('m219-active-campaigns');
      if(!list.previousElementSibling?.classList.contains('m219-section-title')){
        list.insertAdjacentHTML('beforebegin','<div class="m219-section-title"><h2>Active Campaigns</h2><span>Real saved campaigns</span></div>');
      }
    }
    const detail=$('.campaign-detail-compact',host);
    if(detail)detail.classList.add('m219-campaign-workspace');
  }

  function library(){
    if(route()!=='library')return;
    const host=$('.content');
    if(!host || host.dataset.m219Library==='1')return;
    host.dataset.m219Library='1';
    host.classList.add('m219-library');
    const title=$('.page-title',host);
    if(title){
      const h=$('h1',title),p=$('p',title);
      if(h)h.textContent='Content Library';
      if(p)p.textContent='Get content from YouTube, Twitch, X and creators in one place.';
    }
    const list=$('.yt-vod-list',host);
    if(list)list.classList.add('m219-library-grid');
    $$('.yt-vod-item',host).forEach(x=>x.classList.add('m219-media-card'));
    $('.library-platform-tabs',host)?.classList.add('m219-source-tabs');
    $('.library-card',host)?.classList.add('m219-creators-panel');
  }

  function projects(){
    if(route()!=='projects')return;
    const host=$('.content');
    if(!host || host.dataset.m219Projects==='1')return;
    host.dataset.m219Projects='1';
    host.classList.add('m219-projects');
    const list=$('.projects',host);
    if(list)list.classList.add('m219-project-grid');
    $$('.project-row',host).forEach(x=>x.classList.add('m219-project-card'));
  }

  function results(){
    if(route()!=='analytics')return;
    const host=$('.content');
    if(!host || host.dataset.m219Results==='1')return;
    host.dataset.m219Results='1';
    host.classList.add('m219-results');
    const title=$('.page-title',host);
    if(title){
      const p=$('p',title);
      if(p)p.textContent='Track the real performance of your clips and campaigns.';
    }
  }

  function brandText(){
    const root=$('#app'); if(!root)return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(n=>{
      if(['SCRIPT','STYLE','TEXTAREA'].includes(n.parentElement?.tagName))return;
      if(n.nodeValue?.includes('ClipBoost'))n.nodeValue=n.nodeValue.replaceAll('ClipBoost','Mint');
    });
  }

  function bindDelegation(){
    if(window.__m219Bound)return;
    window.__m219Bound=true;
    document.addEventListener('click',e=>{
      const b=e.target.closest('[data-m219-route]');
      if(!b)return;
      e.preventDefault();
      go(b.dataset.m219Route);
    });
  }

  async function run(){
    shell();
    bindDelegation();
    brandText();
    await Promise.allSettled([home(),campaigns()]);
    studio();library();projects();results();
  }

  let queued=false;
  function schedule(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;run().catch(()=>{})});
  }
  new MutationObserver(schedule).observe(document.getElementById('app'),{childList:true,subtree:true});
  window.addEventListener('hashchange',()=>{window.__m219Data=null;schedule()});
  window.addEventListener('popstate',schedule);
  schedule();
})();
