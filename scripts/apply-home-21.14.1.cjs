const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const APP = path.join(ROOT, 'src', 'app.js');
const INDEX = path.join(ROOT, 'index.html');
const PKG = path.join(ROOT, 'package.json');

if (!fs.existsSync(APP)) throw new Error('src/app.js not found');

let src = fs.readFileSync(APP, 'utf8');
const MARK = '/* MINT-HOME-21.14.1 */';

function functionRange(source, name) {
  const needle = `function ${name}(`;
  const start = source.indexOf(needle);
  if (start < 0) throw new Error(`Function ${name} not found`);
  let open = source.indexOf('{', start);
  let depth = 0, mode = 'code', quote = '', esc = false;

  for (let i = open; i < source.length; i++) {
    const c = source[i], n = source[i + 1];

    if (mode === 'string') {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === quote) { mode = 'code'; quote = ''; }
      continue;
    }
    if (mode === 'template') {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '`') mode = 'code';
      continue;
    }
    if (mode === 'line') { if (c === '\n') mode = 'code'; continue; }
    if (mode === 'block') { if (c === '*' && n === '/') { mode = 'code'; i++; } continue; }

    if (c === "'" || c === '"') { mode = 'string'; quote = c; continue; }
    if (c === '`') { mode = 'template'; continue; }
    if (c === '/' && n === '/') { mode = 'line'; i++; continue; }
    if (c === '/' && n === '*') { mode = 'block'; i++; continue; }

    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return { start, end: i + 1 };
    }
  }
  throw new Error(`Could not parse ${name}`);
}

function replaceFunction(name, replacement) {
  const r = functionRange(src, name);
  src = src.slice(0, r.start) + replacement + src.slice(r.end);
}

const sideFn = `function side(){
    return \`<aside class="sidebar mint-home-hidden-sidebar" id="sidebar">
      <button data-page="home">Home</button>
      <button data-page="studio">AI Studio</button>
      <button data-page="campaigns">Campaign Studio</button>
      <button data-page="library">Library</button>
      <button data-page="projects">Projects</button>
      <button data-page="analytics">Results</button>
      <button data-page="settings">Settings</button>
    </aside>\`
  }`;

const topFn = `function top(){
    const u=state.desktopUpdate||{};
    const updatePill=['checking','downloading','ready','error'].includes(u.status)
      ? \`<button class="update-pill \${u.status}" id="updateCenterBtn" type="button"><span>\${u.status==='ready'?'✓':u.status==='error'?'!':'↻'}</span>\${u.status==='downloading'?\`Update \${Math.round(u.percent||0)}%\`:u.status==='checking'?'Checking update…':u.status==='ready'?\`Update \${escapeHtml(u.version||'')} ready\`:'Update issue'}</button>\`
      : '';
    const links=[['home','Home'],['studio','AI Studio'],['campaigns','Campaign Studio'],['library','Library'],['projects','Projects'],['analytics','Results'],['settings','Settings']];
    return \`<header class="topbar mint-home-topbar">
      <button class="mint-home-brand" data-page="home" type="button">
        <span class="mint-home-logo"><i></i><b></b></span><strong>Mint</strong>
      </button>
      <nav class="mint-home-nav">\${links.map(([id,label])=>\`<button data-page="\${id}" class="\${state.page===id?'active':''}" type="button">\${label}</button>\`).join('')}</nav>
      <div class="mint-home-top-actions">
        \${updatePill}
        <label class="mint-home-search"><span>⌕</span><input type="text" placeholder="Search projects, campaigns, media…"></label>
        <button class="mint-home-icon-btn" type="button" aria-label="Notifications">♢</button>
      </div>
    </header>\`
  }`;

const homeFn = `function home(){
    const projects=Array.isArray(state.projects)?state.projects:[];
    const campaignsList=state.campaigns?.campaigns||[];
    const current=projects.find(p=>['ingesting','analyzing'].includes(p.status))||projects[0]||null;
    const activeCampaign=campaignsList.find(c=>String(c.status||'active')==='active')||campaignsList[0]||null;
    const currentState=current?projectDisplayState(current):null;
    const recent=projects.slice(0,3);
    const imports=projects.filter(p=>p.externalSource).slice(0,3);

    const recentCards=recent.length ? recent.map((p,i)=>{
      const ps=projectDisplayState(p);
      return \`<button class="mint-home-project-card" data-home-project="\${escapeHtml(p.id)}" type="button">
        <div class="mint-home-project-thumb">
          \${p.externalSource?.thumbnail?\`<img src="\${escapeHtml(p.externalSource.thumbnail)}" alt="">\`:mediaThumb(i)}
          <span>\${Number(p.candidateCount||0)} clips</span>
        </div>
        <div class="mint-home-project-meta">
          <strong>\${escapeHtml(p.originalName||'Project')}</strong>
          <small>\${escapeHtml(p.campaignName?'Campaign Studio':'AI Studio')} · \${escapeHtml(ps.badge||'Project')}</small>
        </div>
      </button>\`;
    }).join('') : \`<div class="mint-home-empty"><b>No projects yet</b><span>Import content or upload a source to get started.</span><button class="btn primary" data-page="library">Browse Library</button></div>\`;

    const importRows=imports.length ? imports.map((p,i)=>\`<button class="mint-home-import-row" data-home-project="\${escapeHtml(p.id)}" type="button">
      <div class="mint-home-import-thumb">\${p.externalSource?.thumbnail?\`<img src="\${escapeHtml(p.externalSource.thumbnail)}" alt="">\`:mediaThumb(i)}</div>
      <div><strong>\${escapeHtml(p.originalName||'Imported media')}</strong><small>\${escapeHtml(p.externalSource?.creatorName||p.externalSource?.platform||'Library source')}</small></div>
      <span>•••</span>
    </button>\`).join('') : \`<div class="mint-home-small-empty">Recent imported media will appear here.</div>\`;

    return \`<div class="content mint-home-page">
      <section class="mint-home-heading">
        <div>
          <div class="eyebrow">MINT WORKSPACE</div>
          <h1>Your Mint workspace</h1>
          <p>Create, manage and grow your content with AI. General clipping stays in AI Studio. Paid campaign work stays in Campaign Studio.</p>
        </div>
        <div class="mint-home-heading-actions">
          <button class="btn secondary" data-page="studio">✦ Open AI Studio</button>
          <button class="btn primary" data-page="campaigns">◎ Open Campaign Studio</button>
        </div>
      </section>

      <section class="mint-home-primary-grid">
        <article class="mint-home-continue">
          <header><div><span>ϟ</span><b>Continue working</b></div>\${current?\`<em>\${escapeHtml(currentState?.badge||'Project')}</em>\`:''}</header>
          \${current?\`
            <div class="mint-home-continue-body">
              <div class="mint-home-continue-media">\${current.externalSource?.thumbnail?\`<img src="\${escapeHtml(current.externalSource.thumbnail)}" alt="">\`:mediaThumb(0)}<i>▶</i></div>
              <div class="mint-home-continue-copy">
                <h2>\${escapeHtml(current.originalName||'Project')}</h2>
                <p>\${escapeHtml(current.campaignName?\`Campaign · \${current.campaignName}\`:'General AI Studio project')}</p>
                <div class="mint-home-progress"><i style="width:\${Math.max(4,Math.min(100,Number(currentState?.progress||0)))}%"></i></div>
                <div class="mint-home-progress-label"><span>\${escapeHtml(currentState?.progressLabel||currentState?.badge||'Project')}</span><b>\${Math.round(Number(currentState?.progress||0))}%</b></div>
                <div class="mint-home-continue-actions"><button class="btn primary" data-home-project="\${escapeHtml(current.id)}">▶ Continue project →</button><button class="mint-home-more" type="button">•••</button></div>
              </div>
            </div>\`
          : \`<div class="mint-home-empty large"><b>Nothing in progress</b><span>Start from AI Studio or import content from your Library.</span><button class="btn primary" data-page="studio">Create a project</button></div>\`}
        </article>

        <aside class="mint-home-campaign">
          <header><div><span>◎</span><b>Active campaign</b></div>\${activeCampaign?'<em>Active</em>':''}</header>
          \${activeCampaign?\`
            <div class="mint-home-campaign-brand"><span>◎</span><div><h2>\${escapeHtml(activeCampaign.name)}</h2><p>\${escapeHtml(activeCampaign.provider||'Campaign')} · Creator campaign</p></div></div>
            <div class="mint-home-campaign-stats">
              <div><span>▣</span><small>Payment</small><b>\${escapeHtml(campaignPaymentSummary(activeCampaign))}</b></div>
              <div><span>▥</span><small>Minimum</small><b>\${campaignQualification(activeCampaign)?formatCount(campaignQualification(activeCampaign)):'—'}</b></div>
              <div><span>◉</span><small>Tracked views</small><b>\${formatCount(activeCampaign.totals?.totalViews||0)}</b></div>
            </div>
            <button class="btn primary full" data-home-campaign="\${escapeHtml(activeCampaign.id)}">Open Campaign Studio →</button>\`
          : \`<div class="mint-home-empty large"><b>No active campaign</b><span>Import or create a campaign to see it here.</span><button class="btn primary" data-page="campaigns">Add campaign</button></div>\`}
        </aside>
      </section>

      <section class="mint-home-lower-grid">
        <article class="mint-home-recent">
          <header><div><span>▣</span><div><b>Recent projects</b><small>Pick up where you left off or explore your latest creations.</small></div></div><button class="btn secondary compact-btn" data-page="projects">View all →</button></header>
          <div class="mint-home-project-grid">\${recentCards}</div>
        </article>

        <aside class="mint-home-imports">
          <header><div><span>⇧</span><div><b>Recent imports</b><small>Your latest media imports.</small></div></div><button class="btn secondary compact-btn" data-page="library">View all →</button></header>
          <div class="mint-home-import-list">\${importRows}</div>
        </aside>
      </section>
    </div>\`
  }`;

replaceFunction('side', sideFn);
replaceFunction('top', topFn);
replaceFunction('home', homeFn);

if (!src.includes(MARK)) src = MARK + '\n' + src;
fs.writeFileSync(APP, src, 'utf8');

// Ensure the new stylesheet is loaded.
let html = fs.readFileSync(INDEX, 'utf8');
if (!html.includes('home-21.14.1.css')) {
  html = html.replace('</head>', '  <link rel="stylesheet" href="./src/home-21.14.1.css" />\n</head>');
}
html = html.replace(/<title>.*?<\/title>/i, '<title>Mint</title>');
fs.writeFileSync(INDEX, html, 'utf8');

// Remove this one-shot postinstall after it has applied.
const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));
pkg.version = '21.14.1';
if (pkg.scripts?.postinstall === 'node scripts/apply-home-21.14.1.cjs') delete pkg.scripts.postinstall;
fs.writeFileSync(PKG, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

const lockPath = path.join(ROOT, 'package-lock.json');
if (fs.existsSync(lockPath)) {
  try {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    lock.version = '21.14.1';
    if (lock.packages?.['']) lock.packages[''].version = '21.14.1';
    fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n', 'utf8');
  } catch {}
}

console.log('Mint Home 21.14.1 applied.');
