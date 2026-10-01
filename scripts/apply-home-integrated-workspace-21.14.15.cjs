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

    const recentRows=recent.length?recent.map((p,i)=>{
      const ps=projectDisplayState(p);
      return \`<button class="mint-integrated-project" data-home-project="\${escapeHtml(p.id)}" type="button">
        <div class="mint-integrated-thumb">\${p.externalSource?.thumbnail?\`<img src="\${escapeHtml(p.externalSource.thumbnail)}" alt="">\`:mediaThumb(i+1)}</div>
        <div class="mint-integrated-project-copy"><strong>\${escapeHtml(p.originalName||'Project')}</strong><small>\${escapeHtml(p.campaignName?'Campaign Studio':'AI Studio')} · \${escapeHtml(ps.badge||'Project')}</small></div>
        <span>\${Number(p.candidateCount||0)} clips</span>
      </button>\`
    }).join(''):\`<div class="mint-integrated-empty">No recent projects yet.</div>\`;

    const importRows=imports.length?imports.map((p,i)=>\`<button class="mint-integrated-import" data-home-project="\${escapeHtml(p.id)}" type="button">
      <div class="mint-integrated-import-thumb">\${p.externalSource?.thumbnail?\`<img src="\${escapeHtml(p.externalSource.thumbnail)}" alt="">\`:mediaThumb(i)}</div>
      <div><strong>\${escapeHtml(p.originalName||'Imported media')}</strong><small>\${escapeHtml(p.externalSource?.creatorName||p.externalSource?.platform||'Library source')}</small></div>
      <span>•••</span>
    </button>\`).join(''):\`<div class="mint-integrated-empty">No recent imports.</div>\`;

    return \`<div class="content mint-home-page mint-home-integrated-v1415">
      <section class="mint-integrated-heading">
        <div>
          <div class="eyebrow">MINT WORKSPACE</div>
          <h1>Your Mint <span class="mint-red-word">workspace</span></h1>
          <p>Create, manage and grow your content with AI. General clipping stays in AI Studio. Paid campaign work stays in Campaign Studio.</p>
        </div>
        <div class="mint-home-heading-actions">
          <button class="btn secondary" data-page="studio">✦ Open AI Studio</button>
          <button class="btn primary" data-page="campaigns">◎ Open Campaign Studio</button>
        </div>
      </section>

      <section class="mint-integrated-shell">
        <article class="mint-integrated-current">
          <div class="mint-integrated-title"><span>ϟ</span><div><b>Continue working</b><small>Current project</small></div>\${current?\`<em>\${escapeHtml(currentState?.badge||'Project')}</em>\`:''}</div>
          \${current?\`
          <div class="mint-integrated-current-body">
            <button class="mint-integrated-current-media" data-home-project="\${escapeHtml(current.id)}" type="button">
              \${current.externalSource?.thumbnail?\`<img src="\${escapeHtml(current.externalSource.thumbnail)}" alt="">\`:mediaThumb(0)}
              <i>▶</i>
            </button>
            <div class="mint-integrated-current-copy">
              <h2>\${escapeHtml(current.originalName||'Project')}</h2>
              <p>\${escapeHtml(current.campaignName?\`Campaign · \${current.campaignName}\`:'General AI Studio project')}</p>
              <div class="mint-home-progress"><i style="width:\${Math.max(4,Math.min(100,Number(currentState?.progress||0)))}%"></i></div>
              <div class="mint-integrated-progress"><span>\${escapeHtml(currentState?.progressLabel||currentState?.badge||'Project')}</span><b>\${Math.round(Number(currentState?.progress||0))}%</b></div>
              <button class="btn primary" data-home-project="\${escapeHtml(current.id)}">Continue project →</button>
            </div>
          </div>\`
          :\`<div class="mint-integrated-empty large">Nothing in progress.</div>\`}
        </article>

        <section class="mint-integrated-projects">
          <div class="mint-integrated-title"><span>▣</span><div><b>Recent projects</b><small>Latest creative work</small></div><button class="mint-integrated-link" data-page="projects" type="button">View all →</button></div>
          <div class="mint-integrated-project-list">\${recentRows}</div>
        </section>

        <aside class="mint-integrated-campaign">
          <div class="mint-integrated-title"><span>◎</span><div><b>Active campaign</b><small>Paid campaign workspace</small></div>\${activeCampaign?'<em>Active</em>':''}</div>
          \${activeCampaign?\`
          <div class="mint-integrated-campaign-head"><span>◎</span><div><h2>\${escapeHtml(activeCampaign.name)}</h2><p>\${escapeHtml(activeCampaign.provider||'Campaign')}</p></div></div>
          <div class="mint-integrated-campaign-stats">
            <div><small>Payment</small><b>\${escapeHtml(campaignPaymentSummary(activeCampaign))}</b></div>
            <div><small>Minimum</small><b>\${campaignQualification(activeCampaign)?formatCount(campaignQualification(activeCampaign)):'—'}</b></div>
            <div><small>Views</small><b>\${formatCount(activeCampaign.totals?.totalViews||0)}</b></div>
          </div>
          <button class="btn primary full" data-home-campaign="\${escapeHtml(activeCampaign.id)}">Open Campaign Studio →</button>\`
          :\`<div class="mint-integrated-empty">No active campaign.</div>\`}
        </aside>
      </section>

      <section class="mint-integrated-activity">
        <div class="mint-integrated-activity-head"><div><span>⇧</span><div><b>Recent imports</b><small>Latest media added to Mint</small></div></div><button class="mint-integrated-link" data-page="library" type="button">View all →</button></div>
        <div class="mint-integrated-imports">\${importRows}</div>
      </section>
    </div>\`
  }`;

const r=functionRange(src,'home');
src=src.slice(0,r.start)+newHome+src.slice(r.end);
fs.writeFileSync(APP,src,'utf8');

let html=fs.readFileSync(INDEX,'utf8');
if(!html.includes('home-integrated-workspace-21.14.15.css')){
  html=html.replace('</head>','  <link rel="stylesheet" href="./src/home-integrated-workspace-21.14.15.css" />\n</head>');
}
fs.writeFileSync(INDEX,html,'utf8');

const pkg=JSON.parse(fs.readFileSync(PKG,'utf8'));
pkg.version='21.14.15';
if(pkg.scripts?.postinstall==='node scripts/apply-home-integrated-workspace-21.14.15.cjs') delete pkg.scripts.postinstall;
fs.writeFileSync(PKG,JSON.stringify(pkg,null,2)+'\n','utf8');

const lockPath=path.join(ROOT,'package-lock.json');
if(fs.existsSync(lockPath)){
  try{
    const lock=JSON.parse(fs.readFileSync(lockPath,'utf8'));
    lock.version='21.14.15';
    if(lock.packages?.['']) lock.packages[''].version='21.14.15';
    fs.writeFileSync(lockPath,JSON.stringify(lock,null,2)+'\n','utf8');
  }catch{}
}
console.log('Mint Home Integrated Workspace 21.14.15 applied.');
