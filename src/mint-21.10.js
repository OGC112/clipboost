(() => {
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const route=()=>String(location.hash||'#/home').replace(/^#\/?/,'').split(/[?&]/)[0]||'home';

  function nativeNavigate(page){
    const original=q(`#sidebar [data-page="${page}"]`);
    if(original){
      original.click();
      return;
    }
    const fallback=q(`[data-page="${page}"]`);
    if(fallback){
      fallback.click();
      return;
    }
    // Results/analytics is a valid app route but is not present in the
    // legacy hidden sidebar. app.js listens to hashchange/popstate and will
    // update its own state + render safely.
    if(page==='analytics'){
      location.hash='#/analytics';
      return;
    }
  }

  function brandLogo(){
    return `<span class="m210-mark"><i></i><b></b></span><strong>Mint</strong>`;
  }

  function enhanceShell(){
    const top=q('.topbar');
    if(!top || top.dataset.m210==='1') return;
    top.dataset.m210='1';
    const current=route();
    const update=q('#updateCenterBtn',top);
    top.className='topbar m210-topbar';
    top.innerHTML=`
      <button type="button" class="m210-brand" data-m210-page="home">${brandLogo()}</button>
      <nav class="m210-nav" aria-label="Main navigation">
        ${[['home','Home'],['studio','AI Studio'],['campaigns','Campaign Studio'],['library','Library'],['projects','Projects'],['analytics','Results'],['settings','Settings']]
          .map(([id,label])=>`<button type="button" data-m210-page="${id}" class="${current===id?'active':''}">${label}</button>`).join('')}
      </nav>
      <div class="m210-actions">
        <label class="m210-search"><span>⌕</span><input type="text" placeholder="Search projects, campaigns, media…"></label>
        <button type="button" class="m210-create" data-m210-page="${current==='campaigns'?'campaigns':'studio'}">＋ Create</button>
        <button type="button" class="m210-avatar" data-m210-page="settings" aria-label="Settings">U</button>
      </div>`;
    if(update) q('.m210-actions',top)?.prepend(update);
    q('.sidebar')?.classList.add('m210-sidebar-hidden');
  }

  function enhanceHome(){
    if(route()!=='home') return;
    const host=q('.simple-home-v2');
    if(!host || host.dataset.m210==='1') return;
    host.dataset.m210='1';

    const head=q('.simple-home-head',host);
    if(head){
      head.classList.add('m210-home-hero');
      const title=q('h1',head), p=q('p',head);
      if(title) title.innerHTML='Turn content<br>into <span>opportunities</span>';
      if(p) p.textContent='Create, edit and publish high-performing clips with AI.';
      if(!q('.m210-hero-art',head)){
        head.insertAdjacentHTML('beforeend',`
          <div class="m210-hero-art" aria-hidden="true">
            <div class="m210-art-card a1"><span></span><i></i><b>0:32</b></div>
            <div class="m210-art-card a2"><span></span><i></i><b>0:28</b></div>
            <div class="m210-art-card a3"><span></span><i></i><b>0:41</b></div>
            <div class="m210-play">▶</div>
          </div>`);
      }
    }

    const grid=q('.simple-home-grid',host);
    if(grid) grid.classList.add('m210-home-main');
    q('.simple-recent',host)?.classList.add('m210-home-recent');
  }

  function enhanceStudio(){
    if(route()!=='studio') return;
    const host=q('.content');
    if(!host || host.dataset.m210Studio==='1') return;
    host.dataset.m210Studio='1';
    host.classList.add('m210-studio');

    const title=q('.page-title',host);
    if(title){
      title.classList.add('m210-studio-title');
      const h=q('h1',title),p=q('p',title);
      if(h) h.textContent='AI Studio';
      if(p) p.textContent='Turn any video into engaging short clips with AI.';
      if(!q('.m210-studio-art',title)){
        title.insertAdjacentHTML('beforeend','<div class="m210-studio-art" aria-hidden="true"><span></span><i></i><b></b></div>');
      }
      if(!q('.m210-feature-row',host)){
        title.insertAdjacentHTML('afterend',`
          <section class="m210-feature-row">
            <article><span>▣</span><b>Auto Clips</b><small>Find the best moments</small></article>
            <article><span>CC</span><b>Auto Captions</b><small>Accurate & styled</small></article>
            <article><span>✦</span><b>Smart Edits</b><small>Cut, resize, enhance</small></article>
            <article><span>⌁</span><b>AI Highlights</b><small>Key moments</small></article>
            <article><span>文</span><b>Translate</b><small>Multiple languages</small></article>
          </section>`);
      }
    }
    q('.upload-card',host)?.classList.add('m210-upload-card');
    q('.studio-layout',host)?.classList.add('m210-editor-layout');
  }

  function enhanceCampaigns(){
    if(route()!=='campaigns') return;
    const host=q('.content');
    if(!host || host.dataset.m210Campaigns==='1') return;
    host.dataset.m210Campaigns='1';
    host.classList.add('m210-campaigns');

    const title=q('.campaign-page-title',host)||q('.page-title',host);
    if(title){
      title.classList.add('m210-campaign-title');
      if(!q('.m210-target',title)) title.insertAdjacentHTML('beforeend','<div class="m210-target" aria-hidden="true"><i></i><b></b><span>➶</span></div>');
      if(!q('.m210-campaign-steps',host)){
        title.insertAdjacentHTML('afterend',`
          <section class="m210-campaign-steps">
            <div><i>1</i><span>Add Sources</span></div><b>›</b>
            <div><i>2</i><span>Create Clips</span></div><b>›</b>
            <div><i>3</i><span>Set Rules</span></div><b>›</b>
            <div><i>4</i><span>Track Results</span></div>
          </section>`);
      }
    }
    q('.campaign-import-compact',host)?.classList.add('m210-campaign-import');
    q('.campaign-list-real',host)?.classList.add('m210-campaign-list');
    q('.campaign-detail-compact',host)?.classList.add('m210-campaign-detail');
  }

  function enhanceLibrary(){
    if(route()!=='library') return;
    const host=q('.content');
    if(!host || host.dataset.m210Library==='1') return;
    host.dataset.m210Library='1';
    host.classList.add('m210-library');

    const title=q('.page-title',host);
    if(title){
      const h=q('h1',title),p=q('p',title);
      if(h) h.textContent='Content Library';
      if(p) p.textContent='Get content from YouTube, Twitch, X and creators in one place.';
    }
    q('.library-platform-tabs',host)?.classList.add('m210-source-tabs');
    q('.yt-vod-list',host)?.classList.add('m210-media-grid');
    qa('.yt-vod-item',host).forEach(x=>x.classList.add('m210-media-card'));
  }

  function enhanceProjects(){
    if(route()!=='projects') return;
    const host=q('.content');
    if(!host || host.dataset.m210Projects==='1') return;
    host.dataset.m210Projects='1';
    host.classList.add('m210-projects');
    q('.projects',host)?.classList.add('m210-project-grid');
    qa('.project-row',host).forEach(x=>x.classList.add('m210-project-card'));
  }

  function enhanceResults(){
    if(route()!=='analytics') return;
    const host=q('.content');
    if(!host || host.dataset.m210Results==='1') return;
    host.dataset.m210Results='1';
    host.classList.add('m210-results');
    const title=q('.page-title',host);
    if(title){
      const p=q('p',title);
      if(p) p.textContent='Track the real performance of your clips and campaigns.';
    }
  }

  function renameBrand(){
    const root=q('#app');
    if(!root)return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    for(const node of nodes){
      if(['SCRIPT','STYLE','TEXTAREA'].includes(node.parentElement?.tagName))continue;
      if(node.nodeValue?.includes('ClipBoost')) node.nodeValue=node.nodeValue.replaceAll('ClipBoost','Mint');
    }
    document.title='Mint';
  }

  if(!window.__m210Bound){
    window.__m210Bound=true;
    document.addEventListener('click',e=>{
      const btn=e.target.closest('[data-m210-page]');
      if(!btn)return;
      e.preventDefault();
      nativeNavigate(btn.dataset.m210Page);
    });
  }

  function enhance(){
    enhanceShell();
    renameBrand();
    enhanceHome();
    enhanceStudio();
    enhanceCampaigns();
    enhanceLibrary();
    enhanceProjects();
    enhanceResults();
  }

  let queued=false;
  const schedule=()=>{
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{
      queued=false;
      try{enhance()}catch(err){console.warn('Mint 21.10 enhancement skipped:',err)}
    });
  };
  new MutationObserver(schedule).observe(document.getElementById('app'),{childList:true,subtree:true});
  window.addEventListener('hashchange',schedule);
  window.addEventListener('popstate',schedule);
  schedule();
})();
