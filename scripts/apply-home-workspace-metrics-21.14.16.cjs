const fs=require('fs');
const path=require('path');
const ROOT=process.cwd();
const APP=path.join(ROOT,'src','app.js');
const INDEX=path.join(ROOT,'index.html');
const PKG=path.join(ROOT,'package.json');

let src=fs.readFileSync(APP,'utf8');

function functionRange(source,name){
  const needle=`function ${name}(`;
  const start=source.indexOf(needle);
  if(start<0) throw new Error(`Function ${name} not found`);
  let open=source.indexOf('{',start),depth=0,mode='code',quote='',esc=false;
  for(let i=open;i<source.length;i++){
    const c=source[i],n=source[i+1];
    if(mode==='string'){if(esc){esc=false;continue}if(c==='\\'){esc=true;continue}if(c===quote){mode='code';quote=''}continue}
    if(mode==='template'){if(esc){esc=false;continue}if(c==='\\'){esc=true;continue}if(c==='`')mode='code';continue}
    if(mode==='line'){if(c==='\n')mode='code';continue}
    if(mode==='block'){if(c==='*'&&n==='/'){mode='code';i++}continue}
    if(c==="'"||c==='"'){mode='string';quote=c;continue}
    if(c==='`'){mode='template';continue}
    if(c==='/'&&n==='/'){mode='line';i++;continue}
    if(c==='/'&&n==='*'){mode='block';i++;continue}
    if(c==='{')depth++;
    else if(c==='}'){depth--;if(depth===0)return {start,end:i+1};}
  }
  throw new Error(`Could not parse ${name}`);
}

const newHome = `function home(){
    const projects=Array.isArray(state.projects)?state.projects:[];
    const campaignsList=state.campaigns?.campaigns||[];
    const current=projects.find(p=>['ingesting','analyzing'].includes(p.status))||projects[0]||null;
    const activeCampaign=campaignsList.find(c=>String(c.status||'active')==='active')||campaignsList[0]||null;
    const currentState=current?projectDisplayState(current):null;
    const recent=projects.filter(p=>!current||p.id!==current.id).slice(0,2);
    const imports=projects.filter(p=>p.externalSource).slice(0,3);

    const currentViews=current?.externalSource?.viewCount;
    const currentLikes=current?.externalSource?.likeCount;
    const currentClips=Number(current?.candidateCount||0);

    const recentCards=recent.length?recent.map((p,i)=>{
      const ps=projectDisplayState(p);
      const views=p.externalSource?.viewCount;
      return \`<button class="mint-v1416-project-card" data-home-project="\${escapeHtml(p.id)}" type="button">
        <div class="mint-v1416-project-media">
          \${p.externalSource?.thumbnail?\`<img src="\${escapeHtml(p.externalSource.thumbnail)}" alt="">\`:mediaThumb(i+1)}
          <span>\${Number(p.candidateCount||0)} clips</span>
        </div>
        <div class="mint-v1416-project-copy">
          <strong>\${escapeHtml(p.originalName||'Project')}</strong>
          <small>\${escapeHtml(p.campaignName?'Campaign Studio':'AI Studio')} · \${escapeHtml(ps.badge||'Project')}</small>
          <div class="mint-v1416-project-metrics">
            <span>◉ \${views!==undefined&&views!==null?formatCount(views):'—'} views</span>
            <span>▣ \${Number(p.candidateCount||0)} clips</span>
          </div>
        </div>
      </button>\`
    }).join(''):\`<div class="mint-v1416-empty">No recent projects yet.</div>\`;

    const importRows=imports.length?imports.map((p,i)=>\`<button class="mint-v1416-import" data-home-project="\${escapeHtml(p.id)}" type="button">
      <div class="mint-v1416-import-thumb">\${p.externalSource?.thumbnail?\`<img src="\${escapeHtml(p.externalSource.thumbnail)}" alt="">\`:mediaThumb(i)}</div>
      <div><strong>\${escapeHtml(p.originalName||'Imported media')}</strong><small>\${escapeHtml(p.externalSource?.creatorName||p.externalSource?.platform||'Library source')}</small></div>
      <span>•••</span>
    </button>\`).join(''):\`<div class="mint-v1416-empty">No recent imports.</div>\`;

    const campaignTotals=activeCampaign?.totals||{};
    const campaignViews=Number(campaignTotals.totalViews||0);
    const qualification=activeCampaign?Number(campaignQualification(activeCampaign)||0):0;
    const performance=qualification?Math.min(100,Math.round((campaignViews/qualification)*100)):null;
    const estimatedRevenue=Number(campaignTotals.estimatedRevenue||0);
    const confirmedRevenue=Number(campaignTotals.confirmedRevenue||activeCampaign?.confirmedPayout||0);
    const publishedCount=Number(campaignTotals.postCount||activeCampaign?.posts?.length||0);

    return \`<div class="content mint-home-page mint-home-v1416">
      <section class="mint-v1416-heading">
        <div>
          <div class="eyebrow">MINT WORKSPACE</div>
          <h1>Your Mint <span class="mint-red-word">workspace</span></h1>
          <p>Create, manage and grow your content with AI. General clipping stays in AI Studio. Paid campaign work stays in Campaign Studio.</p>
        </div>
        <div class="mint-home-heading-actions">
          <button class="btn secondary" data-page="studio">✦ Open AI Studio →</button>
          <button class="btn primary" data-page="campaigns">◎ Open Campaign Studio →</button>
        </div>
      </section>

      <section class="mint-v1416-layout">
        <div class="mint-v1416-left">
          <article class="mint-v1416-panel mint-v1416-current">
            <header>
              <div><span>ϟ</span><div><b>Continue working</b><small>Current project</small></div></div>
              \${current?\`<em>● \${escapeHtml(currentState?.badge||'Project')}</em>\`:''}
            </header>
            \${current?\`
              <div class="mint-v1416-current-body">
                <button class="mint-v1416-current-media" data-home-project="\${escapeHtml(current.id)}" type="button">
                  \${current.externalSource?.thumbnail?\`<img src="\${escapeHtml(current.externalSource.thumbnail)}" alt="">\`:mediaThumb(0)}
                  <i>▶</i>
                </button>
                <div class="mint-v1416-current-copy">
                  <h2>\${escapeHtml(current.originalName||'Project')}</h2>
                  <p>\${escapeHtml(current.campaignName?\`Campaign · \${current.campaignName}\`:'General AI Studio project')}</p>
                  <div class="mint-home-progress"><i style="width:\${Math.max(4,Math.min(100,Number(currentState?.progress||0)))}%"></i></div>
                  <div class="mint-v1416-progress"><span>\${escapeHtml(currentState?.progressLabel||currentState?.badge||'Project')}</span><b>\${Math.round(Number(currentState?.progress||0))}%</b></div>
                  <div class="mint-v1416-current-actions">
                    <button class="btn primary" data-home-project="\${escapeHtml(current.id)}">Continue project →</button>
                    <div class="mint-v1416-mini-metric"><span>◉</span><div><b>\${currentViews!==undefined&&currentViews!==null?formatCount(currentViews):'—'}</b><small>Source views</small></div></div>
                    <div class="mint-v1416-mini-metric"><span>▣</span><div><b>\${currentClips}</b><small>Clips created</small></div></div>
                    \${currentLikes!==undefined&&currentLikes!==null?\`<div class="mint-v1416-mini-metric"><span>♥</span><div><b>\${formatCount(currentLikes)}</b><small>Source likes</small></div></div>\`:''}
                  </div>
                </div>
              </div>\`
            :\`<div class="mint-v1416-empty large">Nothing in progress.</div>\`}
          </article>

          <section class="mint-v1416-panel mint-v1416-projects">
            <header><div><span>▣</span><div><b>Recent projects</b><small>Your latest creative work</small></div></div><button class="mint-v1416-link" data-page="projects" type="button">View all →</button></header>
            <div class="mint-v1416-project-grid">\${recentCards}</div>
          </section>
        </div>

        <aside class="mint-v1416-right">
          <section class="mint-v1416-panel mint-v1416-campaign">
            <header><div><span>◎</span><div><b>Active campaign</b><small>Paid campaign workspace</small></div></div>\${activeCampaign?'<em>● Active</em>':''}</header>
            \${activeCampaign?\`
              <div class="mint-v1416-campaign-head">
                <span>◎</span>
                <div><h2>\${escapeHtml(activeCampaign.name)}</h2><p>\${escapeHtml(activeCampaign.provider||'Campaign')} · Creator campaign</p></div>
              </div>
              <div class="mint-v1416-campaign-grid">
                <div><span>$</span><small>Confirmed payout</small><b>\${formatMoney(confirmedRevenue,activeCampaign.currency||'USD')}</b></div>
                <div><span>↗</span><small>Estimated payout</small><b>\${formatMoney(estimatedRevenue,activeCampaign.currency||'USD')}</b></div>
                <div><span>◎</span><small>Target views</small><b>\${qualification?formatCount(qualification):'—'}</b></div>
                <div><span>◉</span><small>Tracked views</small><b>\${formatCount(campaignViews)}</b></div>
                <div><span>⌁</span><small>Performance</small><b>\${performance===null?'—':performance+'%'}</b></div>
                <div><span>▣</span><small>Published clips</small><b>\${publishedCount}</b></div>
              </div>
              <button class="btn primary full" data-home-campaign="\${escapeHtml(activeCampaign.id)}">Open Campaign Studio →</button>\`
            :\`<div class="mint-v1416-empty">No active campaign.</div>\`}
          </section>

          <section class="mint-v1416-panel mint-v1416-imports-panel">
            <header><div><span>⇧</span><div><b>Recent imports</b><small>Latest media added to Mint</small></div></div><button class="mint-v1416-link" data-page="library" type="button">View all →</button></header>
            <div class="mint-v1416-import-list">\${importRows}</div>
          </section>
        </aside>
      </section>
    </div>\`
  }`;

const r=functionRange(src,'home');
src=src.slice(0,r.start)+newHome+src.slice(r.end);
fs.writeFileSync(APP,src,'utf8');

let html=fs.readFileSync(INDEX,'utf8');
if(!html.includes('home-workspace-metrics-21.14.16.css')){
  html=html.replace('</head>','  <link rel="stylesheet" href="./src/home-workspace-metrics-21.14.16.css" />\n</head>');
}
fs.writeFileSync(INDEX,html,'utf8');

const pkg=JSON.parse(fs.readFileSync(PKG,'utf8'));
pkg.version='21.14.16';
if(pkg.scripts?.postinstall==='node scripts/apply-home-workspace-metrics-21.14.16.cjs') delete pkg.scripts.postinstall;
fs.writeFileSync(PKG,JSON.stringify(pkg,null,2)+'\n','utf8');

const lockPath=path.join(ROOT,'package-lock.json');
if(fs.existsSync(lockPath)){
  try{
    const lock=JSON.parse(fs.readFileSync(lockPath,'utf8'));
    lock.version='21.14.16';
    if(lock.packages?.['']) lock.packages[''].version='21.14.16';
    fs.writeFileSync(lockPath,JSON.stringify(lock,null,2)+'\n','utf8');
  }catch{}
}
console.log('Mint Home Workspace Metrics 21.14.16 applied.');
