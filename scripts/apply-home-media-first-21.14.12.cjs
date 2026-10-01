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
    else if(c==='}'){depth--; if(depth===0) return {start,end:i+1};}
  }
  throw new Error(`Could not parse ${name}`);
}

const newHome = `function home(){
    const projects=Array.isArray(state.projects)?state.projects:[];
    const campaignsList=state.campaigns?.campaigns||[];
    const current=projects.find(p=>['ingesting','analyzing'].includes(p.status))||projects[0]||null;
    const activeCampaign=campaignsList.find(c=>String(c.status||'active')==='active')||campaignsList[0]||null;
    const currentState=current?projectDisplayState(current):null;
    const recent=projects.slice(0,4);
    const imports=projects.filter(p=>p.externalSource).slice(0,4);

    const recentCards=recent.length ? recent.map((p,i)=>{
      const ps=projectDisplayState(p);
      return \`<button class="mint-editorial-project" data-home-project="\${escapeHtml(p.id)}" type="button">
        <div class="mint-editorial-project-media">
          \${p.externalSource?.thumbnail?\`<img src="\${escapeHtml(p.externalSource.thumbnail)}" alt="">\`:mediaThumb(i)}
          <span>\${Number(p.candidateCount||0)} clips</span>
        </div>
        <div class="mint-editorial-project-copy">
          <strong>\${escapeHtml(p.originalName||'Project')}</strong>
          <small>\${escapeHtml(p.campaignName?'Campaign Studio':'AI Studio')} · \${escapeHtml(ps.badge||'Project')}</small>
        </div>
      </button>\`;
    }).join('') : \`<div class="mint-editorial-empty">No recent projects yet.</div>\`;

    const importRows=imports.length ? imports.map((p,i)=>\`<button class="mint-editorial-import" data-home-project="\${escapeHtml(p.id)}" type="button">
      <div class="mint-editorial-import-thumb">\${p.externalSource?.thumbnail?\`<img src="\${escapeHtml(p.externalSource.thumbnail)}" alt="">\`:mediaThumb(i)}</div>
      <div class="mint-editorial-import-copy"><strong>\${escapeHtml(p.originalName||'Imported media')}</strong><small>\${escapeHtml(p.externalSource?.creatorName||p.externalSource?.platform||'Library source')}</small></div>
      <span>•••</span>
    </button>\`).join('') : \`<div class="mint-editorial-empty">No recent imports.</div>\`;

    return \`<div class="content mint-home-page mint-home-editorial-v1412">
      <section class="mint-editorial-heading">
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

      <section class="mint-editorial-main">
        <article class="mint-editorial-feature">
          <div class="mint-editorial-section-label"><span>ϟ</span><b>Continue working</b>\${current?\`<em>\${escapeHtml(currentState?.badge||'Project')}</em>\`:''}</div>
          \${current?\`
            <button class="mint-editorial-feature-media" data-home-project="\${escapeHtml(current.id)}" type="button">
              \${current.externalSource?.thumbnail?\`<img src="\${escapeHtml(current.externalSource.thumbnail)}" alt="">\`:mediaThumb(0)}
              <span class="mint-editorial-play">▶</span>
              <div class="mint-editorial-feature-overlay">
                <div>
                  <small>\${escapeHtml(current.campaignName?\`Campaign · \${current.campaignName}\`:'General AI Studio project')}</small>
                  <h2>\${escapeHtml(current.originalName||'Project')}</h2>
                </div>
                <span>Continue →</span>
              </div>
            </button>
            <div class="mint-editorial-progress-row">
              <div class="mint-home-progress"><i style="width:\${Math.max(4,Math.min(100,Number(currentState?.progress||0)))}%"></i></div>
              <div><span>\${escapeHtml(currentState?.progressLabel||currentState?.badge||'Project')}</span><b>\${Math.round(Number(currentState?.progress||0))}%</b></div>
            </div>\`
          : \`<div class="mint-editorial-empty large"><b>Nothing in progress</b><span>Start from AI Studio or import content from your Library.</span><button class="btn primary" data-page="studio">Create a project</button></div>\`}
        </article>

        <aside class="mint-editorial-side">
          <div class="mint-editorial-section-label"><span>◎</span><b>Active campaign</b>\${activeCampaign?'<em>Active</em>':''}</div>
          \${activeCampaign?\`
            <div class="mint-editorial-campaign">
              <div class="mint-editorial-campaign-head">
                <span>◎</span>
                <div><h2>\${escapeHtml(activeCampaign.name)}</h2><p>\${escapeHtml(activeCampaign.provider||'Campaign')} · Creator campaign</p></div>
              </div>
              <dl>
                <div><dt>Payment</dt><dd>\${escapeHtml(campaignPaymentSummary(activeCampaign))}</dd></div>
                <div><dt>Minimum</dt><dd>\${campaignQualification(activeCampaign)?formatCount(campaignQualification(activeCampaign)):'—'}</dd></div>
                <div><dt>Tracked views</dt><dd>\${formatCount(activeCampaign.totals?.totalViews||0)}</dd></div>
              </dl>
              <button class="btn primary full" data-home-campaign="\${escapeHtml(activeCampaign.id)}">Open Campaign Studio →</button>
            </div>\`
          : \`<div class="mint-editorial-empty large"><b>No active campaign</b><span>Import or create a campaign to see it here.</span><button class="btn primary" data-page="campaigns">Add campaign</button></div>\`}
        </aside>
      </section>

      <section class="mint-editorial-work">
        <div class="mint-editorial-projects-wrap">
          <div class="mint-editorial-work-head">
            <div><span>▣</span><div><b>Recent projects</b><small>Your latest creative work.</small></div></div>
            <button class="mint-editorial-link" data-page="projects" type="button">View all →</button>
          </div>
          <div class="mint-editorial-projects-row">\${recentCards}</div>
        </div>

        <aside class="mint-editorial-imports-wrap">
          <div class="mint-editorial-work-head">
            <div><span>⇧</span><div><b>Recent imports</b><small>Latest media added to Mint.</small></div></div>
            <button class="mint-editorial-link" data-page="library" type="button">View all →</button>
          </div>
          <div class="mint-editorial-imports-list">\${importRows}</div>
        </aside>
      </section>
    </div>\`
  }`;

const r=functionRange(src,'home');
src=src.slice(0,r.start)+newHome+src.slice(r.end);
fs.writeFileSync(APP,src,'utf8');

let html=fs.readFileSync(INDEX,'utf8');
if(!html.includes('home-media-first-21.14.12.css')){
  html=html.replace('</head>','  <link rel="stylesheet" href="./src/home-media-first-21.14.12.css" />\n</head>');
}
fs.writeFileSync(INDEX,html,'utf8');

const pkg=JSON.parse(fs.readFileSync(PKG,'utf8'));
pkg.version='21.14.12';
if(pkg.scripts?.postinstall==='node scripts/apply-home-media-first-21.14.12.cjs') delete pkg.scripts.postinstall;
fs.writeFileSync(PKG,JSON.stringify(pkg,null,2)+'\n','utf8');

const lockPath=path.join(ROOT,'package-lock.json');
if(fs.existsSync(lockPath)){
  try{
    const lock=JSON.parse(fs.readFileSync(lockPath,'utf8'));
    lock.version='21.14.12';
    if(lock.packages?.['']) lock.packages[''].version='21.14.12';
    fs.writeFileSync(lockPath,JSON.stringify(lock,null,2)+'\n','utf8');
  }catch{}
}
console.log('Mint Home media-first 21.14.12 applied.');
