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
    const recent=projects.filter(p=>!current||p.id!==current.id).slice(0,3);
    const imports=projects.filter(p=>p.externalSource).slice(0,3);

    const currentViews=current?.externalSource?.viewCount;
    const currentLikes=current?.externalSource?.likeCount;
    const currentClips=Number(current?.candidateCount||0);

    const recentRows=recent.length?recent.map((p,i)=>{
      const ps=projectDisplayState(p);
      const views=p.externalSource?.viewCount;
      return \`<button class="mint-nb-project" data-home-project="\${escapeHtml(p.id)}" type="button">
        <div class="mint-nb-project-thumb">\${p.externalSource?.thumbnail?\`<img src="\${escapeHtml(p.externalSource.thumbnail)}" alt="">\`:mediaThumb(i+1)}</div>
        <div class="mint-nb-project-copy"><strong>\${escapeHtml(p.originalName||'Project')}</strong><small>\${escapeHtml(p.campaignName?'Campaign Studio':'AI Studio')} · \${escapeHtml(ps.badge||'Project')}</small></div>
        <div class="mint-nb-project-data"><b>\${views!==undefined&&views!==null?formatCount(views):'—'}</b><small>views</small></div>
        <div class="mint-nb-project-data"><b>\${Number(p.candidateCount||0)}</b><small>clips</small></div>
        <span>→</span>
      </button>\`
    }).join(''):\`<div class="mint-nb-empty">No recent projects yet.</div>\`;

    const importRows=imports.length?imports.map((p,i)=>\`<button class="mint-nb-import" data-home-project="\${escapeHtml(p.id)}" type="button">
      <div class="mint-nb-import-thumb">\${p.externalSource?.thumbnail?\`<img src="\${escapeHtml(p.externalSource.thumbnail)}" alt="">\`:mediaThumb(i)}</div>
      <div><strong>\${escapeHtml(p.originalName||'Imported media')}</strong><small>\${escapeHtml(p.externalSource?.creatorName||p.externalSource?.platform||'Library source')}</small></div>
      <span>•••</span>
    </button>\`).join(''):\`<div class="mint-nb-empty">No recent imports.</div>\`;

    const t=activeCampaign?.totals||{};
    const campaignViews=Number(t.totalViews||0);
    const qualification=activeCampaign?Number(campaignQualification(activeCampaign)||0):0;
    const performance=qualification?Math.min(100,Math.round((campaignViews/qualification)*100)):null;
    const estimatedRevenue=Number(t.estimatedRevenue||0);
    const confirmedRevenue=Number(t.confirmedRevenue||activeCampaign?.confirmedPayout||0);
    const publishedCount=Number(t.postCount||activeCampaign?.posts?.length||0);

    return \`<div class="content mint-home-page mint-home-nb-v1417">
      <section class="mint-nb-heading">
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

      <section class="mint-nb-hero">
        <div class="mint-nb-current">
          <div class="mint-nb-section-head"><div><span>ϟ</span><b>Continue working</b></div>\${current?\`<em>\${escapeHtml(currentState?.badge||'Project')}</em>\`:''}</div>
          \${current?\`
          <div class="mint-nb-current-layout">
            <button class="mint-nb-current-media" data-home-project="\${escapeHtml(current.id)}" type="button">
              \${current.externalSource?.thumbnail?\`<img src="\${escapeHtml(current.externalSource.thumbnail)}" alt="">\`:mediaThumb(0)}
              <i>▶</i>
            </button>
            <div class="mint-nb-current-copy">
              <h2>\${escapeHtml(current.originalName||'Project')}</h2>
              <p>\${escapeHtml(current.campaignName?\`Campaign · \${current.campaignName}\`:'General AI Studio project')}</p>
              <div class="mint-nb-inline-stats">
                <div><b>\${currentViews!==undefined&&currentViews!==null?formatCount(currentViews):'—'}</b><small>Source views</small></div>
                <div><b>\${currentClips}</b><small>Clips created</small></div>
                <div><b>\${currentLikes!==undefined&&currentLikes!==null?formatCount(currentLikes):'—'}</b><small>Source likes</small></div>
              </div>
              <div class="mint-home-progress"><i style="width:\${Math.max(4,Math.min(100,Number(currentState?.progress||0)))}%"></i></div>
              <div class="mint-nb-progress"><span>\${escapeHtml(currentState?.progressLabel||currentState?.badge||'Project')}</span><b>\${Math.round(Number(currentState?.progress||0))}%</b></div>
              <button class="btn primary" data-home-project="\${escapeHtml(current.id)}">Continue project →</button>
            </div>
          </div>\`
          :\`<div class="mint-nb-empty">Nothing in progress.</div>\`}
        </div>

        <aside class="mint-nb-campaign">
          <div class="mint-nb-section-head"><div><span>◎</span><b>Active campaign</b></div>\${activeCampaign?'<em>Active</em>':''}</div>
          \${activeCampaign?\`
          <div class="mint-nb-campaign-name"><span>◎</span><div><h2>\${escapeHtml(activeCampaign.name)}</h2><p>\${escapeHtml(activeCampaign.provider||'Campaign')} · Creator campaign</p></div></div>
          <div class="mint-nb-metric-list">
            <div><span>Confirmed payout</span><b>\${formatMoney(confirmedRevenue,activeCampaign.currency||'USD')}</b></div>
            <div><span>Estimated payout</span><b>\${formatMoney(estimatedRevenue,activeCampaign.currency||'USD')}</b></div>
            <div><span>Target views</span><b>\${qualification?formatCount(qualification):'—'}</b></div>
            <div><span>Tracked views</span><b>\${formatCount(campaignViews)}</b></div>
            <div><span>Performance</span><b>\${performance===null?'—':performance+'%'}</b></div>
            <div><span>Published clips</span><b>\${publishedCount}</b></div>
          </div>
          <button class="btn primary full" data-home-campaign="\${escapeHtml(activeCampaign.id)}">Open Campaign Studio →</button>\`
          :\`<div class="mint-nb-empty">No active campaign.</div>\`}
        </aside>
      </section>

      <section class="mint-nb-work">
        <div class="mint-nb-work-left">
          <div class="mint-nb-section-title"><div><span>▣</span><div><b>Recent projects</b><small>Your latest creative work</small></div></div><button class="mint-nb-link" data-page="projects" type="button">View all →</button></div>
          <div class="mint-nb-project-list">\${recentRows}</div>
        </div>
        <div class="mint-nb-work-right">
          <div class="mint-nb-section-title"><div><span>⇧</span><div><b>Recent imports</b><small>Latest media added to Mint</small></div></div><button class="mint-nb-link" data-page="library" type="button">View all →</button></div>
          <div class="mint-nb-import-list">\${importRows}</div>
        </div>
      </section>
    </div>\`
  }`;

const r=functionRange(src,'home');
src=src.slice(0,r.start)+newHome+src.slice(r.end);
fs.writeFileSync(APP,src,'utf8');

let html=fs.readFileSync(INDEX,'utf8');
if(!html.includes('home-no-blocks-21.14.17.css')){
  html=html.replace('</head>','  <link rel="stylesheet" href="./src/home-no-blocks-21.14.17.css" />\n</head>');
}
fs.writeFileSync(INDEX,html,'utf8');

const pkg=JSON.parse(fs.readFileSync(PKG,'utf8'));
pkg.version='21.14.17';
if(pkg.scripts?.postinstall==='node scripts/apply-home-no-blocks-21.14.17.cjs') delete pkg.scripts.postinstall;
fs.writeFileSync(PKG,JSON.stringify(pkg,null,2)+'\n','utf8');

const lockPath=path.join(ROOT,'package-lock.json');
if(fs.existsSync(lockPath)){
  try{
    const lock=JSON.parse(fs.readFileSync(lockPath,'utf8'));
    lock.version='21.14.17';
    if(lock.packages?.['']) lock.packages[''].version='21.14.17';
    fs.writeFileSync(lockPath,JSON.stringify(lock,null,2)+'\n','utf8');
  }catch{}
}
console.log('Mint Home No Blocks 21.14.17 applied.');
