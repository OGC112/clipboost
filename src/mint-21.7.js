const MINT = {
  route(){
    return String(location.hash||'#/home').replace(/^#\/?/,'').split(/[?&]/)[0] || 'home';
  },
  fmt(n){
    const x=Number(n||0);
    if(x>=1e9)return (x/1e9).toFixed(x>=1e10?0:1)+'B';
    if(x>=1e6)return (x/1e6).toFixed(x>=1e7?0:1)+'M';
    if(x>=1e3)return (x/1e3).toFixed(x>=1e4?0:1)+'K';
    return String(Math.round(x));
  },
  money(n,currency='USD'){
    try{return new Intl.NumberFormat('en-US',{style:'currency',currency,maximumFractionDigits:0}).format(Number(n||0))}
    catch{return '$'+Math.round(Number(n||0))}
  },
  navigate(page){
    const hidden=document.querySelector(`#sidebar [data-page="${page}"]`);
    if(hidden){ hidden.click(); return; }
    location.hash=`#/${page}`;
  },
  brandText(root=document.body){
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    for(const node of nodes){
      if(!node.parentElement)continue;
      if(['SCRIPT','STYLE','CODE','TEXTAREA'].includes(node.parentElement.tagName))continue;
      if(node.nodeValue.includes('ClipBoost')) node.nodeValue=node.nodeValue.replaceAll('ClipBoost','Mint');
    }
    document.title='Mint';
  },
  logo(){
    return `<span class="mint-mark" aria-hidden="true"><i></i><b></b></span><strong>Mint</strong>`;
  },
  shell(){
    const app=document.querySelector('.app');
    const main=document.querySelector('.main');
    const top=document.querySelector('.topbar');
    if(!app||!main||!top)return;

    document.body.dataset.mintRoute=this.route();
    if(top.dataset.mint==='1')return;
    top.dataset.mint='1';

    const route=this.route();
    const nav=[
      ['home','Home'],
      ['studio','AI Studio'],
      ['campaigns','Campaign Studio'],
      ['library','Library'],
      ['projects','Projects'],
      ['analytics','Results']
    ];

    const existingSearch=top.querySelector('.search');
    const existingUpdate=top.querySelector('#updateCenterBtn');
    const mobile=top.querySelector('#menu');

    top.innerHTML=`
      <div class="mint-brand" role="button" tabindex="0">${this.logo()}</div>
      <nav class="mint-nav">
        ${nav.map(([id,label])=>`<button type="button" data-mint-page="${id}" class="${route===id?'active':''}">${label}</button>`).join('')}
      </nav>
      <div class="mint-top-actions">
        <div class="mint-search-slot"></div>
        <button class="mint-create" type="button">+ Create</button>
        <button class="mint-avatar" type="button">U</button>
      </div>
    `;
    if(mobile) top.prepend(mobile);
    if(existingSearch) top.querySelector('.mint-search-slot').replaceWith(existingSearch);
    if(existingUpdate) top.querySelector('.mint-top-actions').prepend(existingUpdate);

    top.querySelector('.mint-brand').onclick=()=>this.navigate('home');
    top.querySelector('.mint-brand').onkeydown=e=>{if(e.key==='Enter'||e.key===' ')this.navigate('home')};
    top.querySelectorAll('[data-mint-page]').forEach(btn=>btn.onclick=()=>this.navigate(btn.dataset.mintPage));
    top.querySelector('.mint-create').onclick=()=>this.navigate(route==='campaigns'?'campaigns':'studio');

    document.querySelector('.sidebar')?.setAttribute('aria-hidden','true');
  },
  pageIdentity(){
    const route=this.route();
    const content=document.querySelector('.content');
    if(!content)return;
    content.classList.add('mint-content',`mint-${route}`);

    const title=content.querySelector('.page-title h1');
    const desc=content.querySelector('.page-title p');
    const eyebrow=content.querySelector('.page-title .eyebrow');

    if(route==='studio'){
      if(eyebrow)eyebrow.textContent='AI VIDEO EDITOR';
      if(desc && !document.querySelector('.campaign-studio')) desc.textContent='Edit long videos or generate short clips with AI. General projects only.';
    }
    if(route==='campaigns'){
      if(eyebrow)eyebrow.textContent='CAMPAIGN WORKSPACE';
    }
    if(route==='library'){
      if(title)title.textContent='Content Library';
    }
    if(route==='projects'){
      if(desc)desc.textContent='All AI Studio and Campaign Studio projects in one place.';
    }
  },
  async homeDashboard(){
    if(this.route()!=='home')return;
    const content=document.querySelector('.simple-home-v2');
    if(!content||content.querySelector('.mint-home-kpis'))return;

    let campaigns=[],projects=[];
    try{
      const [cr,pr]=await Promise.all([fetch('/api/campaigns'),fetch('/api/projects')]);
      if(cr.ok){
        const d=await cr.json();
        campaigns=Array.isArray(d)?d:(d.campaigns||[]);
      }
      if(pr.ok){
        const d=await pr.json();
        projects=Array.isArray(d)?d:(d.projects||[]);
      }
    }catch{}

    if(this.route()!=='home'||!document.querySelector('.simple-home-v2'))return;
    const active=campaigns.filter(c=>String(c.status||'active')==='active');
    const views=campaigns.reduce((s,c)=>s+Number(c?.totals?.totalViews||0),0);
    const confirmed=campaigns.reduce((s,c)=>s+Number(c?.totals?.confirmedRevenue||0),0);
    const clipCount=projects.reduce((s,p)=>s+Number(p?.candidateCount||0),0);
    const currency=campaigns.find(c=>c.currency)?.currency||'USD';

    const kpis=document.createElement('section');
    kpis.className='mint-home-kpis';
    kpis.innerHTML=`
      <article><span class="mint-kpi-icon eye">◉</span><small>Tracked campaign views</small><b>${this.fmt(views)}</b><em>From published campaign posts</em></article>
      <article><span class="mint-kpi-icon money">$</span><small>Confirmed payout</small><b>${this.money(confirmed,currency)}</b><em>Campaign-approved earnings</em></article>
      <article><span class="mint-kpi-icon target">◎</span><small>Active campaigns</small><b>${active.length}</b><em>${campaigns.length} total campaigns</em></article>
      <article><span class="mint-kpi-icon clips">▶</span><small>AI clips</small><b>${this.fmt(clipCount)}</b><em>Across ${projects.length} projects</em></article>
    `;
    const head=content.querySelector('.simple-home-head');
    head?.after(kpis);

    if(head){
      const h=head.querySelector('h1');
      const p=head.querySelector('p');
      if(h)h.innerHTML='Turn content into <span>opportunities.</span>';
      if(p)p.textContent='Edit, repurpose and launch high-performing clips while keeping paid campaign work in its own focused workspace.';
      head.classList.add('mint-home-hero');
    }
  },
  async realResults(){
    if(this.route()!=='analytics')return;
    const content=document.querySelector('.content');
    if(!content||content.dataset.realResults==='1')return;
    content.dataset.realResults='1';

    let campaigns=[];
    try{
      const r=await fetch('/api/campaigns');
      if(r.ok){
        const d=await r.json();
        campaigns=Array.isArray(d)?d:(d.campaigns||[]);
      }
    }catch{}

    const totalViews=campaigns.reduce((s,c)=>s+Number(c?.totals?.totalViews||0),0);
    const confirmed=campaigns.reduce((s,c)=>s+Number(c?.totals?.confirmedRevenue||0),0);
    const estimated=campaigns.reduce((s,c)=>s+Number(c?.totals?.estimatedRevenue||0),0);
    const posts=campaigns.reduce((s,c)=>s+Number(c?.totals?.postCount||0),0);
    const active=campaigns.filter(c=>String(c.status||'active')==='active').length;
    const currency=campaigns.find(c=>c.currency)?.currency||'USD';
    const rows=[...campaigns].sort((a,b)=>Number(b?.totals?.totalViews||0)-Number(a?.totals?.totalViews||0));

    content.innerHTML=`
      <div class="page-title mint-results-title">
        <div><div class="eyebrow">REAL PERFORMANCE</div><h1>Results</h1><p>Verified campaign tracking only. Metrics stay hidden when Mint does not have the data.</p></div>
      </div>
      <section class="mint-results-kpis">
        <article><small>Tracked views</small><b>${this.fmt(totalViews)}</b><span>Published campaign posts</span></article>
        <article><small>Estimated payout</small><b>${this.money(estimated,currency)}</b><span>From saved campaign terms</span></article>
        <article><small>Confirmed payout</small><b>${this.money(confirmed,currency)}</b><span>Campaign-approved earnings</span></article>
        <article><small>Published clips</small><b>${posts}</b><span>${active} active campaigns</span></article>
      </section>
      <section class="card mint-results-table">
        <div class="section-head"><div><div class="eyebrow">CAMPAIGNS</div><h3>Campaign performance</h3></div></div>
        ${rows.length?rows.map(c=>`
          <button type="button" class="mint-result-row" data-open-result-campaign="${String(c.id||'')}">
            <span><b>${String(c.name||'Campaign')}</b><small>${String(c.provider||'Campaign')}</small></span>
            <span><small>Views</small><b>${this.fmt(c?.totals?.totalViews||0)}</b></span>
            <span><small>Published</small><b>${Number(c?.totals?.postCount||0)}</b></span>
            <span><small>Estimated</small><b>${this.money(c?.totals?.estimatedRevenue||0,c.currency||currency)}</b></span>
            <span><small>Confirmed</small><b>${this.money(c?.totals?.confirmedRevenue||0,c.currency||currency)}</b></span>
            <strong>Open →</strong>
          </button>`).join(''):`<div class="campaign-mini-empty">No campaign performance is tracked yet.</div>`}
      </section>
    `;
    content.querySelectorAll('[data-open-result-campaign]').forEach(btn=>btn.onclick=()=>this.navigate('campaigns'));
  },
  campaignEditorIdentity(){
    const campaignMode=document.querySelector('.campaign-studio');
    if(this.route()==='studio'&&campaignMode){
      document.body.dataset.mintCampaignEditor='true';
      const title=document.querySelector('.page-title h1');
      const eyebrow=document.querySelector('.page-title .eyebrow');
      if(title)title.textContent='Campaign Editor';
      if(eyebrow)eyebrow.textContent='CAMPAIGN STUDIO';
      const nav=document.querySelector('[data-mint-page="campaigns"]');
      document.querySelectorAll('.mint-nav button').forEach(x=>x.classList.remove('active'));
      nav?.classList.add('active');
    }else{
      delete document.body.dataset.mintCampaignEditor;
    }
  },
  enhance(){
    this.shell();
    this.pageIdentity();
    this.brandText(document.querySelector('#app')||document.body);
    this.campaignEditorIdentity();
    this.homeDashboard();
    this.realResults();
  }
};

let pending=false;
const run=()=>{
  if(pending)return;
  pending=true;
  requestAnimationFrame(()=>{
    pending=false;
    try{MINT.enhance()}catch(e){console.warn('Mint UI enhancement skipped:',e)}
  });
};

new MutationObserver(run).observe(document.getElementById('app'),{childList:true,subtree:true});
window.addEventListener('hashchange',run);
window.addEventListener('popstate',run);
run();
