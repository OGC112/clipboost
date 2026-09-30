const fs=require('fs');
const path=require('path');

const ROOT=process.cwd();
const APP=path.join(ROOT,'src','app.js');
const INDEX=path.join(ROOT,'index.html');
const PKG=path.join(ROOT,'package.json');
if(!fs.existsSync(APP)) throw new Error('src/app.js not found');

let src=fs.readFileSync(APP,'utf8');
const MARK='/* MINT-NAVIGATION-21.14.3 */';

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
    if(c==='{')depth++; else if(c==='}'){depth--;if(depth===0)return {start,end:i+1,text:source.slice(start,i+1)}}
  }
  throw new Error(`Could not parse ${name}`);
}
function replaceFunction(name,replacement){
  const r=functionRange(src,name);
  src=src.slice(0,r.start)+replacement+src.slice(r.end);
}

/* Add campaign-discover to valid pages. */
src=src.replace(
  "const validPages=new Set(['home','studio','campaigns','analytics','library','projects','settings']);",
  "const validPages=new Set(['home','campaign-discover','campaigns','analytics','studio','library','projects','settings']);"
);

/* Native top navigation split into two product modes. */
replaceFunction('top', `function top(){
    const u=state.desktopUpdate||{};
    const updatePill=['checking','downloading','ready','error'].includes(u.status)
      ? \`<button class="update-pill \${u.status}" id="updateCenterBtn" type="button"><span>\${u.status==='ready'?'✓':u.status==='error'?'!':'↻'}</span>\${u.status==='downloading'?\`Update \${Math.round(u.percent||0)}%\`:u.status==='checking'?'Checking update…':u.status==='ready'?\`Update \${escapeHtml(u.version||'')} ready\`:'Update issue'}</button>\`
      : '';
    return \`<header class="topbar mint-home-topbar mint-split-topbar">
      <button class="mint-home-brand" data-page="home" type="button">
        <span class="mint-home-logo"><i></i><b></b></span><strong>Mint</strong>
      </button>

      <nav class="mint-split-nav">
        <button data-page="home" class="mint-nav-home \${state.page==='home'?'active':''}" type="button">Home</button>

        <div class="mint-nav-group campaign-group">
          <span class="mint-nav-label">Campaigns</span>
          <div>
            <button data-page="campaign-discover" class="\${state.page==='campaign-discover'?'active':''}" type="button">Discover</button>
            <button data-page="campaigns" class="\${state.page==='campaigns'?'active':''}" type="button">Campaign Studio</button>
            <button data-page="analytics" class="\${state.page==='analytics'?'active':''}" type="button">Results</button>
          </div>
        </div>

        <i class="mint-nav-separator"></i>

        <div class="mint-nav-group create-group">
          <span class="mint-nav-label">Create</span>
          <div>
            <button data-page="studio" class="\${state.page==='studio'?'active':''}" type="button">AI Studio</button>
            <button data-page="library" class="\${state.page==='library'?'active':''}" type="button">Library</button>
            <button data-page="projects" class="\${state.page==='projects'?'active':''}" type="button">Projects</button>
          </div>
        </div>
      </nav>

      <div class="mint-home-top-actions mint-split-actions">
        \${updatePill}
        <label class="mint-home-search"><span>⌕</span><input type="text" placeholder="Search projects, campaigns, media…"></label>
        <button class="mint-home-icon-btn mint-settings-gear" data-page="settings" type="button" aria-label="Settings" title="Settings">⚙</button>
      </div>
    </header>\`
  }`);

/* Add a dedicated Campaign Discover page. */
const insertAt=src.indexOf('function campaigns(){');
if(insertAt<0) throw new Error('campaigns function not found');
const discoverFn = `function campaignDiscover(){
    const list=state.campaigns?.campaigns||[];
    const active=list.filter(c=>String(c.status||'active')==='active');
    const cards=list.length?list.map(c=>{
      const t=c.totals||{};
      const readiness=campaignReadiness(c);
      const q=campaignQualification(c);
      return \`<article class="campaign-discover-card-v143">
        <div class="campaign-discover-card-top-v143">
          <div><span class="campaign-state \${escapeHtml(c.status||'active')}">\${escapeHtml(c.status||'active')}</span><small>\${escapeHtml(c.provider||'Campaign')}</small></div>
          <span class="campaign-discover-score-v143">\${readiness.score}% setup</span>
        </div>
        <h3>\${escapeHtml(c.name||'Campaign')}</h3>
        <p>\${escapeHtml(String(c.brief||c.objective||'No campaign brief saved yet.').slice(0,150))}</p>
        <div class="campaign-discover-facts-v143">
          <div><small>Payment</small><b>\${escapeHtml(campaignPaymentSummary(c))}</b></div>
          <div><small>Minimum</small><b>\${q?formatCount(q):'—'}</b></div>
          <div><small>Tracked</small><b>\${formatCount(t.totalViews||0)}</b></div>
        </div>
        <div class="campaign-discover-actions-v143">
          <button class="btn secondary" data-campaign-discover-select="\${escapeHtml(c.id)}">View details</button>
          <button class="btn primary" data-campaign-open-studio="\${escapeHtml(c.id)}">Edit in Campaign Studio →</button>
        </div>
      </article>\`;
    }).join(''):\`<div class="campaign-discover-empty-v143"><b>No campaigns yet</b><span>Paste a campaign page or create one manually.</span></div>\`;

    return \`<div class="content campaign-discover-v143">
      <section class="campaign-discover-header-v143">
        <div>
          <div class="eyebrow">CAMPAIGN DISCOVERY</div>
          <h1>Find and manage campaigns</h1>
          <p>Bring campaign opportunities into Mint, review every requirement, then open the selected campaign in Campaign Studio.</p>
        </div>
        <button class="btn primary" data-page="campaigns">Open Campaign Studio →</button>
      </section>

      <section class="campaign-discover-import-v143">
        <div>
          <div class="eyebrow">SMART IMPORT</div>
          <h3>Import a campaign from its real page</h3>
          <p>Paste the campaign URL. Mint can open the authenticated page and read the campaign requirements without an API.</p>
        </div>
        <div class="campaign-discover-import-controls-v143">
          <input id="campaignImportUrl" value="\${escapeHtml(state.campaignDraftUrl||'')}" placeholder="Paste campaign URL">
          <button class="btn secondary" id="importCampaignBtn" \${state.campaignBusy?'disabled':''}>\${state.campaignBusy?'Waiting…':'Smart Import'}</button>
          <button class="btn primary" id="newCampaignBtn">＋ Add campaign</button>
        </div>
      </section>

      <section class="campaign-discover-summary-v143">
        <article><small>Total campaigns</small><b>\${list.length}</b></article>
        <article><small>Active</small><b>\${active.length}</b></article>
        <article><small>Tracked views</small><b>\${formatCount(list.reduce((n,c)=>n+Number(c.totals?.totalViews||0),0))}</b></article>
        <article><small>Confirmed payout</small><b>\${formatMoney(list.reduce((n,c)=>n+Number(c.totals?.confirmedRevenue||0),0),list[0]?.currency||'USD')}</b></article>
      </section>

      <section class="campaign-discover-grid-v143">
        \${state.campaignsLoading?'<div class="campaign-discover-empty-v143">Loading campaigns…</div>':cards}
      </section>
    </div>\`
  }

  `;
src=src.slice(0,insertAt)+discoverFn+src.slice(insertAt);

/* Register the new page in render(). */
src=src.replace(
  "const pages={home,studio,campaigns,analytics,library,projects,settings};",
  "const pages={home,'campaign-discover':campaignDiscover,studio,campaigns,analytics,library,projects,settings};"
);

/* Add bindings for discover -> studio/details. */
const bindNeedle="document.querySelectorAll('[data-home-campaign]').forEach(el=>el.onclick=()=>{state.campaignSelected=el.dataset.homeCampaign;state.campaignTab='overview';navigate('campaigns')});";
if(!src.includes(bindNeedle)) throw new Error('Home campaign binding not found');
src=src.replace(bindNeedle, bindNeedle + `
    document.querySelectorAll('[data-campaign-open-studio]').forEach(el=>el.onclick=()=>{state.campaignSelected=el.dataset.campaignOpenStudio;state.campaignTab='overview';navigate('campaigns')});
    document.querySelectorAll('[data-campaign-discover-select]').forEach(el=>el.onclick=()=>{state.campaignSelected=el.dataset.campaignDiscoverSelect;state.campaignTab='overview';navigate('campaigns')});`
);

if(!src.includes(MARK)) src=MARK+'\n'+src;
fs.writeFileSync(APP,src,'utf8');

let html=fs.readFileSync(INDEX,'utf8');
if(!html.includes('navigation-21.14.3.css')){
  html=html.replace('</head>','  <link rel="stylesheet" href="./src/navigation-21.14.3.css" />\n</head>');
}
fs.writeFileSync(INDEX,html,'utf8');

const pkg=JSON.parse(fs.readFileSync(PKG,'utf8'));
pkg.version='21.14.3';
if(pkg.scripts?.postinstall==='node scripts/apply-navigation-21.14.3.cjs') delete pkg.scripts.postinstall;
fs.writeFileSync(PKG,JSON.stringify(pkg,null,2)+'\n','utf8');

const lockPath=path.join(ROOT,'package-lock.json');
if(fs.existsSync(lockPath)){
  try{
    const lock=JSON.parse(fs.readFileSync(lockPath,'utf8'));
    lock.version='21.14.3';
    if(lock.packages?.['']) lock.packages[''].version='21.14.3';
    fs.writeFileSync(lockPath,JSON.stringify(lock,null,2)+'\n','utf8');
  }catch{}
}

console.log('Mint navigation split 21.14.3 applied.');
