(function(){
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const route=()=>String(location.hash||'#/home').replace(/^#\/?/,'').split(/[?&]/)[0]||'home';

  function addStudioTools(){
    if(route()!=='studio') return;
    const content=q('.mint-studio');
    if(!content || q('.mint28-studio-tools',content)) return;
    const title=q('.page-title',content);
    const uploader=q('#dropZone',content)?.closest('.card') || q('.uploader',content) || q('[class*="upload"]',content);
    if(!title) return;
    const strip=document.createElement('section');
    strip.className='mint28-studio-tools';
    strip.innerHTML=`
      <article><span>▣</span><div><b>Auto Clips</b><small>Find the strongest moments</small></div></article>
      <article><span>CC</span><div><b>Auto Captions</b><small>Accurate, social-ready captions</small></div></article>
      <article><span>✦</span><div><b>Smart Edits</b><small>Cut, reframe and enhance</small></div></article>
      <article><span>◎</span><div><b>AI Highlights</b><small>Key moments from long videos</small></div></article>
      <article><span>文</span><div><b>Translate</b><small>Prepare multiple languages</small></div></article>`;
    title.after(strip);
    if(uploader) uploader.classList.add('mint28-upload-card');
  }

  function addCampaignSteps(){
    if(route()!=='campaigns')return;
    const content=q('.mint-campaigns');
    if(!content || q('.mint28-campaign-steps',content))return;
    const header=q('.campaign-page-title',content) || q('.page-title',content);
    if(!header)return;
    const steps=document.createElement('section');
    steps.className='mint28-campaign-steps';
    steps.innerHTML=`
      <div><i>1</i><span><b>Add Sources</b><small>Connect creators or official media</small></span></div>
      <em>→</em>
      <div><i>2</i><span><b>Create Clips</b><small>Generate campaign-ready cuts</small></span></div>
      <em>→</em>
      <div><i>3</i><span><b>Set Rules</b><small>Titles, tags and formats</small></span></div>
      <em>→</em>
      <div><i>4</i><span><b>Track Results</b><small>Views, payout and performance</small></span></div>`;
    header.after(steps);
    q('.campaign-list-real',content)?.classList.add('mint28-campaign-list');
  }

  function cardifyLibrary(){
    if(route()!=='library')return;
    const content=q('.mint-library');
    if(!content || q('.mint28-library-grid',content))return;
    const actionButtons=qa('[data-send-studio-id]',content);
    const rows=[];
    for(const btn of actionButtons){
      let p=btn.parentElement;
      let found=null;
      for(let depth=0;depth<7 && p && p!==content;depth++,p=p.parentElement){
        const hasMedia=!!q('img',p);
        const hasPreview=!!q('[data-preview-id]',p);
        if(hasMedia && hasPreview){found=p;break;}
      }
      if(found && !rows.includes(found))rows.push(found);
    }
    if(rows.length<2)return;
    const grid=document.createElement('section');
    grid.className='mint28-library-grid';
    rows[0].before(grid);
    rows.forEach(row=>{row.classList.add('mint28-library-card');grid.appendChild(row)});
  }

  function projectCards(){
    if(route()!=='projects')return;
    qa('.mint-projects .project-row').forEach(x=>x.classList.add('mint28-project-card'));
  }

  function fixResults(){
    if(route()!=='analytics')return;
    const content=q('.mint-analytics')||q('.mint-results')||q('.content');
    if(!content)return;
    const table=q('.mint-results-table',content);
    if(!table)return;
    const contexts=qa('.mint-results-context',content);
    let keeper=contexts[0];
    contexts.slice(1).forEach(x=>x.remove());
    if(!keeper){
      keeper=document.createElement('div');
      keeper.className='mint-results-context';
      keeper.innerHTML='<span class="mint-results-orb">↗</span><div><b>Performance appears here when tracked campaign data arrives.</b><small>Mint keeps this page factual and never invents growth curves or views.</small></div>';
    }
    if(keeper.parentElement!==table)table.prepend(keeper);

    if(!q('.mint28-results-chart',content)){
      const chart=document.createElement('section');
      chart.className='mint28-results-chart card';
      chart.innerHTML=`<div class="section-head"><div><h3>Views & payout</h3><small>Tracked campaign data over time</small></div></div>
      <div class="mint28-empty-chart"><span></span><span></span><span></span><span></span><strong>Waiting for tracked data</strong></div>`;
      table.before(chart);
    }
  }

  function home(){
    if(route()!=='home')return;
    const content=q('.mint-home');
    if(!content)return;
    const hero=q('.mint-home-hero',content);
    if(hero)hero.classList.add('mint28-home-hero');
    const recent=q('.simple-recent',content);
    if(recent)recent.classList.add('mint28-recent');
  }

  function cleanBrand(){
    document.documentElement.classList.add('mint28');
    document.body.dataset.mint28Route=route();
    qa('.mint-nav button').forEach(btn=>btn.classList.toggle('active',btn.dataset.mintPage===route()));
  }

  function run(){
    cleanBrand();
    home();
    addStudioTools();
    addCampaignSteps();
    cardifyLibrary();
    projectCards();
    fixResults();
  }

  let queued=false;
  const schedule=()=>{
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;try{run()}catch(e){console.warn('Mint 21.8 enhancement skipped',e)}});
  };
  new MutationObserver(schedule).observe(document.getElementById('app'),{childList:true,subtree:true});
  window.addEventListener('hashchange',schedule);
  window.addEventListener('popstate',schedule);
  schedule();
})();
