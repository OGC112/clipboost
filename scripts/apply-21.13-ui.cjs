const fs=require('fs');
const path=require('path');

const file=path.join(process.cwd(),'src','app.js');
if(!fs.existsSync(file)) throw new Error('src/app.js not found');
let src=fs.readFileSync(file,'utf8');

const MARK='/* MINT-21.13-TRUE-REBUILD */';
if(src.includes(MARK)){
  console.log('Mint 21.13 UI already applied.');
  process.exit(0);
}

function functionRange(source,name){
  const needle=`function ${name}(`;
  const start=source.indexOf(needle);
  if(start<0) throw new Error(`Function ${name} not found`);
  let open=source.indexOf('{',start);
  let depth=0, mode='code', quote='', esc=false;
  for(let i=open;i<source.length;i++){
    const c=source[i], n=source[i+1];
    if(mode==='string'){
      if(esc){esc=false;continue}
      if(c==='\\'){esc=true;continue}
      if(c===quote){mode='code';quote=''}
      continue;
    }
    if(mode==='template'){
      if(esc){esc=false;continue}
      if(c==='\\'){esc=true;continue}
      if(c==='`'){mode='code'}
      continue;
    }
    if(mode==='line'){if(c==='\n')mode='code';continue}
    if(mode==='block'){if(c==='*'&&n==='/'){mode='code';i++}continue}
    if(c==="'"||c==='"'){mode='string';quote=c;continue}
    if(c==='`'){mode='template';continue}
    if(c==='/'&&n==='/'){mode='line';i++;continue}
    if(c==='/'&&n==='*'){mode='block';i++;continue}
    if(c==='{')depth++;
    else if(c==='}'){
      depth--;
      if(depth===0)return {start,end:i+1,text:source.slice(start,i+1)};
    }
  }
  throw new Error(`Could not parse ${name}`);
}
function replaceFunction(name,newSource){
  const r=functionRange(src,name);
  src=src.slice(0,r.start)+newSource+src.slice(r.end);
}
function replaceTailReturn(name,newReturn){
  const r=functionRange(src,name);
  const idx=r.text.lastIndexOf('return `');
  if(idx<0) throw new Error(`Final template return not found in ${name}`);
  const rebuilt=r.text.slice(0,idx)+newReturn+'\n  }';
  src=src.slice(0,r.start)+rebuilt+src.slice(r.end);
}

replaceFunction('side', `function side(){
    return \`<aside class="sidebar mint-native-sidebar" id="sidebar">
      <button data-page="home">Home</button>
      <button data-page="studio">AI Studio</button>
      <button data-page="campaigns">Campaign Studio</button>
      <button data-page="library">Library</button>
      <button data-page="projects">Projects</button>
      <button data-page="analytics">Results</button>
      <button data-page="settings">Settings</button>
    </aside>\`
  }`);

replaceFunction('top', `function top(){
    const u=state.desktopUpdate||{};
    const updatePill=['checking','downloading','ready','error'].includes(u.status)?\`<button class="update-pill \${u.status}" id="updateCenterBtn" type="button"><span>\${u.status==='ready'?'✓':u.status==='error'?'!':'↻'}</span>\${u.status==='downloading'?\`Update \${Math.round(u.percent||0)}%\`:u.status==='checking'?'Checking update…':u.status==='ready'?\`Update \${escapeHtml(u.version||'')} ready\`:'Update issue'}</button>\`:'';
    const links=[['home','Home'],['studio','AI Studio'],['campaigns','Campaign Studio'],['library','Library'],['projects','Projects'],['analytics','Results'],['settings','Settings']];
    return \`<header class="topbar mint-native-topbar">
      <button class="mint-native-brand" data-page="home" type="button"><span class="mint-native-mark"><i></i><b></b></span><strong>Mint</strong></button>
      <nav class="mint-native-nav">\${links.map(([id,label])=>\`<button data-page="\${id}" class="\${state.page===id?'active':''}" type="button">\${label}</button>\`).join('')}</nav>
      <div class="mint-native-actions">\${updatePill}<button class="mint-top-icon" type="button" title="Search">⌕</button><button class="mint-create-btn" data-page="\${state.page==='campaigns'?'campaigns':'studio'}" type="button">＋ Create</button><button class="mint-user-btn" data-page="settings" type="button">U</button></div>
    </header>\`
  }`);

replaceFunction('home', `function home(){
    const projects=Array.isArray(state.projects)?state.projects:[];
    const campaignsList=state.campaigns?.campaigns||[];
    const current=projects.find(p=>['ingesting','analyzing'].includes(p.status))||projects[0]||null;
    const activeCampaign=campaignsList.find(c=>String(c.status||'active')==='active')||campaignsList[0]||null;
    const currentState=current?projectDisplayState(current):null;
    const recent=projects.slice(0,4);
    const totalViews=campaignsList.reduce((n,c)=>n+Number(c.totals?.totalViews||0),0);
    const confirmed=campaignsList.reduce((n,c)=>n+Number(c.totals?.confirmedRevenue||0),0);
    const totalClips=projects.reduce((n,p)=>n+Number(p.candidateCount||0),0);
    const heroMedia=recent.filter(p=>p.externalSource?.thumbnail).slice(0,3);
    return \`<div class="content mint-home-v13">
      <section class="mint-home-hero-v13">
        <div class="mint-hero-copy-v13">
          <div class="eyebrow">CREATOR WORKSPACE</div>
          <h1>Turn content into <span>opportunities.</span></h1>
          <p>Find strong moments, edit faster, and keep campaign work organized without losing the creative flow.</p>
          <div class="mint-hero-actions-v13"><button class="btn primary" data-page="studio">＋ Create a clip</button><button class="btn secondary" data-page="library">Import content</button></div>
        </div>
        <div class="mint-hero-media-v13">
          \${heroMedia.length?heroMedia.map((p,i)=>\`<div class="hero-media-tile tile-\${i+1}"><img src="\${escapeHtml(p.externalSource.thumbnail)}" alt=""><span>\${escapeHtml(p.externalSource.creatorName||'Creator')}</span></div>\`).join(''):\`<div class="hero-media-placeholder"><b>Import creator content</b><span>Your latest sources will appear here.</span></div>\`}
        </div>
      </section>

      <section class="mint-home-work-v13">
        <div class="mint-home-main-v13">
          <div class="mint-section-heading"><div><div class="eyebrow">RECENT CONTENT</div><h2>Pick up where you left off</h2></div><button class="btn secondary compact-btn" data-page="projects">All projects →</button></div>
          <div class="mint-project-strip-v13">
            \${recent.length?recent.map((p,i)=>{const ps=projectDisplayState(p);return \`<button class="mint-project-tile-v13" data-home-project="\${escapeHtml(p.id)}">
              <div class="mint-project-media-v13">\${p.externalSource?.thumbnail?\`<img src="\${escapeHtml(p.externalSource.thumbnail)}" alt="">\`:mediaThumb(i)}<span>\${Number(p.candidateCount||0)} clips</span></div>
              <div class="mint-project-copy-v13"><strong>\${escapeHtml(p.originalName||'Project')}</strong><small>\${escapeHtml(p.campaignName?\`Campaign · \${p.campaignName}\`:'AI Studio')} · \${escapeHtml(ps.badge)}</small></div>
            </button>\`}).join(''):\`<div class="mint-empty-v13"><b>No projects yet</b><span>Import a creator video or upload a source to start.</span><button class="btn primary" data-page="library">Browse Library</button></div>\`}
          </div>

          <section class="mint-continue-v13">
            <div><div class="eyebrow">CURRENT WORK</div><h3>\${current?escapeHtml(current.originalName||'Project'):'Start a new edit'}</h3><p>\${current?escapeHtml(current.campaignName?\`Campaign · \${current.campaignName}\`:'General AI Studio project'):'Use AI Studio for long videos and quick shorts.'}</p></div>
            \${current?\`<div class="mint-continue-progress-v13"><div><i style="width:\${Math.max(4,Math.min(100,Number(currentState?.progress||0)))}%"></i></div><span>\${escapeHtml(currentState?.progressLabel||currentState?.badge||'Project')}</span></div><button class="btn primary" data-home-project="\${escapeHtml(current.id)}">Continue →</button>\`:\`<button class="btn primary" data-page="studio">Open AI Studio →</button>\`}
          </section>
        </div>

        <aside class="mint-home-side-v13">
          <section class="mint-active-campaign-v13">
            <div class="eyebrow">ACTIVE CAMPAIGN</div>
            \${activeCampaign?\`<div class="mint-campaign-brand-v13"><span>◎</span><div><h3>\${escapeHtml(activeCampaign.name)}</h3><small>\${escapeHtml(activeCampaign.provider||'Campaign')}</small></div></div>
            <div class="mint-campaign-facts-v13"><div><small>Payment</small><b>\${escapeHtml(campaignPaymentSummary(activeCampaign))}</b></div><div><small>Minimum</small><b>\${campaignQualification(activeCampaign)?formatCount(campaignQualification(activeCampaign)):'—'}</b></div><div><small>Tracked</small><b>\${formatCount(activeCampaign.totals?.totalViews||0)}</b></div></div>
            <button class="btn primary full" data-home-campaign="\${escapeHtml(activeCampaign.id)}">Open campaign →</button>\`:\`<div class="mint-empty-v13"><b>No campaign yet</b><span>Smart Import can mirror a real campaign and its rules.</span><button class="btn primary" data-page="campaigns">Add campaign</button></div>\`}
          </section>
          <section class="mint-mini-stats-v13">
            <div><small>Tracked views</small><b>\${formatCount(totalViews)}</b></div>
            <div><small>Confirmed payout</small><b>\${formatMoney(confirmed,activeCampaign?.currency||'USD')}</b></div>
            <div><small>AI clips</small><b>\${formatCount(totalClips)}</b></div>
          </section>
        </aside>
      </section>
    </div>\`
  }`);

replaceTailReturn('studio', `return \`<div class="content studio-v13">
      <div class="page-title studio-title-v13">
        <div><div class="eyebrow">AI VIDEO EDITOR</div><h1>AI Studio</h1><p>\${videoTitle}</p></div>
        <div class="tabs"><button class="btn secondary">Save</button><button class="btn secondary" id="exportAllBtn" \${hasLocal&&candidates.length&&!state.exportAllBusy?'':'disabled'}>\${state.exportAllBusy?'Exporting all…':'Export all clips'}</button><button class="btn primary" id="exportBtn" \${hasLocal&&!state.exportBusy?'':'disabled'}>\${state.exportBusy?'Exporting…':'Export edited clip'}</button></div>
      </div>

      \${analysisStatus}

      <div class="studio-workspace-v13">
        <main class="studio-primary-v13">
          \${uploader}
          <section class="card studio-source-v13">
            <div class="studio-source-head-v13"><div><div class="eyebrow">SOURCE</div><h3>\${escapeHtml(videoTitle)}</h3></div><span>\${hasLocal?'Ready':linked?'Linked':'No source'}</span></div>
            <div class="video studio-video-v13">\${realVideo}</div>
            <div class="timeline studio-timeline-v13"><div class="section-head"><strong>Smart timeline</strong><span class="muted">\${analyzing?\`Local AI: \${escapeHtml(analysisStage||'analyzing')}\${transcriptionDetail} · \${Math.round(ingestProgress)}%\`:hasLocal?(v.candidates?.length||0)+' strong clip'+((v.candidates?.length||0)===1?'':'s')+' found · quality-gated':ingesting?'Automatic ingestion in progress':linked?'Source linked — ingest to analyze':'Upload a video to analyze it'}</span></div>\${timelineMarkup}</div>
            <div class="moments studio-moments-v13">\${moments}</div>
          </section>
        </main>

        <aside class="studio-rail-v13">
          <section class="card short-panel studio-preview-v13">
            <div class="section-head"><div><div class="eyebrow">PREVIEW · \${candidates.length?selected+1:0}/\${candidates.length}</div><h3>Short preview</h3></div><span>•••</span></div>
            <div class="phone tall">\${realPhone}</div>
            <div class="clip-range"><label>Start <input id="clipStart" type="number" step="0.1" value="\${Number(c.start||0).toFixed(1)}"></label><label>End <input id="clipEnd" type="number" step="0.1" value="\${Number(c.end||30).toFixed(1)}"></label></div>
            <div class="preview-note">Preview uses the same renderer as final export.</div>
          </section>

          <section class="card controls studio-ai-v13">
            <div class="section-head"><div><div class="eyebrow">AI TOOLS</div><h3>Automatic editing</h3></div><span>✦</span></div>
            <div class="auto-director-card"><div class="auto-director-status"><span class="auto-director-dot"></span><div><strong>Auto Director</strong><small>Adapts the edit to speech, scenes and framing.</small></div></div><div class="auto-director-tags">\${autoTags.map(x=>\`<span>\${escapeHtml(x)}</span>\`).join('')}</div></div>
            <div class="selectrow"><span>Captions</span><select id="captionPreferenceSelect"><option value="auto" \${state.captionPreference==='auto'?'selected':''}>Auto (recommended)</option><option value="on" \${state.captionPreference==='on'?'selected':''}>Always on</option><option value="off" \${state.captionPreference==='off'?'selected':''}>Off</option></select></div>
            <div class="caption-color-control"><div class="caption-color-head"><span>Caption color</span><small>Social presets</small></div><div class="caption-color-palette">\${[['auto','Auto'],['white','White'],['yellow','Yellow'],['lime','Lime'],['cyan','Cyan'],['pink','Pink'],['red','Red']].map(([value,label])=>\`<button type="button" class="caption-color-chip \${state.captionColor===value?'active':''}" data-caption-color="\${value}"><i class="caption-swatch swatch-\${value}">\${value==='auto'?'A':''}</i><span>\${label}</span></button>\`).join('')}</div></div>
            <div class="quality-explainer"><b>Automatic per clip</b><span>Framing, face safety, silence cuts, captions and zooms are chosen from the actual source.</span></div>
            \${editPlan?\`<div class="edit-plan-card"><span class="eyebrow">EDIT PLAN</span><strong>\${activeSummary.cuts} silence cuts · \${activeSummary.disfluencies} speech cleanups · \${activeSummary.zooms} zooms</strong><small>\${activeSummary.reframes} reframe pass\${trackingInfo?\` · \${trackingInfo.faceCountMax||0} faces max\`:''}\${editApplied?.preset?\` · \${escapeHtml(editApplied.preset)} profile\`:''}</small></div>\`:''}
            <button class="btn primary full generate" id="generateVariationsBtn" \${hasLocal&&!analyzing&&!state.regenerating?'':'disabled title="Wait for analysis to finish"'}>\${state.regenerating?'↻ Generating clips…':analyzing?'↻ Local AI analyzing…':hasLocal?'✦ Generate variations':ingesting?'↻ Processing source…':'⇧ Ingest source first'}</button>
          </section>
        </aside>
      </div>
      \${campaignStudio}\${transcriptPanel}
    </div>\``);

replaceTailReturn('library', `return \`<div class="content library-v13">
      <div class="page-title library-title-v13">
        <div><div class="eyebrow">CONTENT DISCOVERY</div><h1>Content Library</h1><p>Browse creators and source platforms, then send the strongest content to AI Studio.</p></div>
        <div class="library-head-actions">\${status}<button class="btn secondary" id="refreshLibrary" \${!creators.length||state.libraryRefreshBusy?'disabled':''}>\${state.libraryRefreshBusy?'↻ Refreshing…':\`↻ Refresh \${platform==='youtube'?'YouTube':'Twitch'}\`}</button><button class="btn primary" id="addCreator">+ Add creator</button></div>
      </div>
      \${state.libraryError&&!state.addCreatorOpen?\`<div class="library-banner error">\${escapeHtml(state.libraryError)}</div>\`:state.libraryRefreshMessage?\`<div class="library-banner success">\${escapeHtml(state.libraryRefreshMessage)}</div>\`:''}
      <div class="library-shell-v13">
        <aside class="library-sidebar-v13">
          <div class="library-side-block-v13"><div class="eyebrow">SOURCES</div><div class="library-platform-tabs library-platform-vertical-v13"><button data-library-platform="youtube" class="\${platform==='youtube'?'active':''}">▶ YouTube <span>\${allCreators.filter(c=>c.platform==='youtube').length}</span></button><button data-library-platform="twitch" class="\${platform==='twitch'?'active':''}">▣ Twitch <span>\${allCreators.filter(c=>c.platform==='twitch').length}</span></button></div></div>
          <div class="library-side-block-v13"><div class="section-head"><div><div class="eyebrow">FOLLOWING</div><h3>\${platform==='youtube'?'Creators':'Streamers'}</h3></div><span class="muted">\${creators.length}</span></div><div class="creator-row creator-stack-v13">\${state.libraryLoading&&!state.libraryLoaded?'<div class="library-loading">Loading library…</div>':creatorsHtml}</div></div>
        </aside>

        <main class="library-main-v13">
          <div class="library-toolbar library-toolbar-v13"><div class="tabs library-tabs">\${subTabs}</div><div class="library-filters">\${creatorFilter}\${sortSelect}</div></div>
          <section class="library-media-grid-v13">\${state.libraryLoading&&!state.libraryLoaded?'<div class="library-loading big">Fetching your library…</div>':mediaHtml}\${historyFooter}</section>
        </main>
      </div>
      \${modal}\${preview}\${livePlayer}
    </div>\``);

replaceFunction('projects', `function projects(){
    const list=Array.isArray(state.projects)?state.projects:[];
    const cards=list.length?list.map((p,i)=>{const ui=projectDisplayState(p);return \`<article class="project-card-v13">
      <button class="project-cover-v13" data-open-project="\${escapeHtml(p.id)}">\${p.externalSource?.thumbnail?\`<img src="\${escapeHtml(p.externalSource.thumbnail)}" alt="">\`:mediaThumb(i)}<span class="project-type-v13">\${p.campaignId?'Campaign Studio':'AI Studio'}</span></button>
      <div class="project-body-v13"><div><strong>\${escapeHtml(p.originalName||'Untitled project')}</strong><small>\${escapeHtml(p.externalSource?.creatorName||'Local upload')} · \${relativeDate(p.createdAt)}</small></div><span class="status \${ui.done?'done':''}">\${ui.badge}</span></div>
      <div class="project-progress-v13"><div><i style="width:\${ui.progress}%"></i></div><span>\${ui.progressLabel}</span></div>
      <div class="project-actions-v13"><button class="btn secondary" data-open-project="\${escapeHtml(p.id)}">Open</button><button class="icon-btn project-delete-btn" type="button" data-delete-project="\${escapeHtml(p.id)}" data-delete-project-name="\${escapeHtml(p.originalName||'Untitled project')}" title="\${['ingesting','analyzing'].includes(p.status)?'Stop processing and delete project':'Delete project'}">×</button></div>
    </article>\`}).join(''):\`<div class="projects-empty-v13"><b>No projects yet</b><span>Send a YouTube video or Twitch VOD from Library to AI Studio.</span><button class="btn primary" data-page="library">Open Library</button></div>\`;
    return \`<div class="content projects-v13">
      <div class="page-title"><div><div class="eyebrow">WORKFLOW</div><h1>Projects</h1><p>All AI Studio and Campaign Studio work in one place.</p></div><button class="btn primary" data-page="library">＋ From Library</button></div>
      <div class="project-filterbar-v13"><span class="active">All</span><span>AI Studio</span><span>Campaign Studio</span><i></i><small>\${list.length} project\${list.length===1?'':'s'}</small></div>
      <section class="projects-grid-v13">\${state.projectsLoading?'<div class="projects-empty-v13">Loading projects…</div>':cards}</section>
    </div>\`
  }`);

replaceFunction('analytics', `function analytics(){
    const campaignsList=state.campaigns?.campaigns||[];
    const posts=campaignsList.flatMap(c=>(c.posts||[]).map(p=>({...p,campaignName:c.name,campaignId:c.id,currency:c.currency||'USD'})));
    const trackedViews=campaignsList.reduce((n,c)=>n+Number(c.totals?.totalViews||0),0);
    const estimated=campaignsList.reduce((n,c)=>n+Number(c.totals?.estimatedRevenue||0),0);
    const confirmed=campaignsList.reduce((n,c)=>n+Number(c.totals?.confirmedRevenue||0),0);
    const published=campaignsList.reduce((n,c)=>n+Number(c.totals?.postCount||0),0);
    const maxViews=Math.max(1,...posts.map(p=>Number(p.views||0)));
    const topPosts=[...posts].sort((a,b)=>Number(b.views||0)-Number(a.views||0)).slice(0,5);
    const performance=posts.length?\`<div class="results-bars-v13">\${posts.slice(0,8).map(p=>\`<div><span>\${escapeHtml(p.platform||p.campaignName||'Post')}</span><i><b style="width:\${Math.max(2,Number(p.views||0)/maxViews*100)}%"></b></i><strong>\${formatCount(p.views||0)}</strong></div>\`).join('')}</div>\`:\`<div class="results-empty-chart-v13"><span>↗</span><div><b>Performance appears when published campaign posts are tracked.</b><small>No invented growth curve is shown before real data exists.</small></div></div>\`;
    const top=topPosts.length?topPosts.map(p=>\`<article class="top-post-v13"><span>\${escapeHtml((p.platform||'Post').slice(0,2))}</span><div><strong>\${escapeHtml(p.title||p.campaignName||'Published clip')}</strong><small>\${formatCount(p.views||0)} views\${Number(p.payout||0)?\` · \${formatMoney(p.payout,p.currency)}\`:''}</small></div></article>\`).join(''):\`<div class="results-empty-v13">Top clips will appear after real tracking data arrives.</div>\`;
    const campaignRows=campaignsList.length?campaignsList.map(c=>\`<button class="campaign-result-row-v13" data-result-campaign="\${escapeHtml(c.id)}"><span><strong>\${escapeHtml(c.name)}</strong><small>\${escapeHtml(c.provider||'Campaign')}</small></span><b>\${formatCount(c.totals?.totalViews||0)} views</b><b>\${formatMoney(c.totals?.estimatedRevenue||0,c.currency||'USD')}</b><b>\${formatMoney(c.totals?.confirmedRevenue||0,c.currency||'USD')}</b><em>Open →</em></button>\`).join(''):\`<div class="results-empty-v13">No campaigns yet.</div>\`;
    return \`<div class="content results-v13">
      <div class="page-title"><div><div class="eyebrow">REAL PERFORMANCE</div><h1>Results</h1><p>Track the performance of published campaign clips using real saved metrics.</p></div></div>
      <section class="results-kpis-v13"><article><small>Tracked views</small><b>\${formatCount(trackedViews)}</b></article><article><small>Estimated payout</small><b>\${formatMoney(estimated,campaignsList[0]?.currency||'USD')}</b></article><article><small>Confirmed payout</small><b>\${formatMoney(confirmed,campaignsList[0]?.currency||'USD')}</b></article><article><small>Published clips</small><b>\${formatCount(published)}</b></article></section>
      <section class="results-main-v13"><article class="card results-performance-v13"><div class="section-head"><div><div class="eyebrow">PERFORMANCE</div><h3>Views by published clip</h3></div></div>\${performance}</article><aside class="card results-top-v13"><div class="section-head"><div><div class="eyebrow">CONTENT</div><h3>Top performing clips</h3></div></div>\${top}</aside></section>
      <section class="card results-campaigns-v13"><div class="section-head"><div><div class="eyebrow">CAMPAIGNS</div><h3>Campaign performance</h3></div></div><div class="campaign-result-head-v13"><span>Campaign</span><span>Views</span><span>Estimated</span><span>Confirmed</span><span></span></div>\${campaignRows}</section>
    </div>\`
  }`);

replaceFunction('campaigns', `function campaigns(){
    const list=state.campaigns?.campaigns||[];
    const active=selectedCampaign();
    const totals=list.reduce((a,c)=>{a.views+=Number(c.totals?.totalViews||0);a.confirmed+=Number(c.totals?.confirmedRevenue||0);a.posts+=Number(c.totals?.postCount||0);return a},{views:0,confirmed:0,posts:0});
    const importRecovery=state.campaignImportDraft?\`<div class="campaign-import-recovery"><span><b>Unsaved import</b><small>\${escapeHtml(state.campaignImportDraft.name||'Campaign')} · review saved automatically</small></span><button class="btn secondary compact-btn" id="reopenCampaignImportBtn">Review</button><button class="icon-btn danger-lite" id="discardCampaignImportBtn">×</button></div>\`:'';
    const importBar=\`<section class="campaign-import-v13"><div><div class="eyebrow">SMART IMPORT</div><h3>Import a real campaign</h3><p>Paste the campaign page. Mint can open the authenticated page and read its requirements without an API.</p></div><div class="campaign-import-controls-v13"><input id="campaignImportUrl" value="\${escapeHtml(state.campaignDraftUrl||'')}" placeholder="Paste campaign URL"><button class="btn secondary" id="importCampaignBtn" \${state.campaignBusy?'disabled':''}>\${state.campaignBusy?'Waiting…':'Smart Import'}</button><button class="btn primary" id="newCampaignBtn">＋ Add</button></div>\${importRecovery}</section>\`;
    const cards=list.length?list.map(c=>{const t=c.totals||{},ready=campaignReadiness(c),q=campaignQualification(c);return \`<button class="campaign-nav-card-v13 \${active?.id===c.id?'active':''}" data-campaign-select="\${escapeHtml(c.id)}"><div><span class="campaign-state \${c.status}">\${escapeHtml(c.status||'active')}</span><small>\${escapeHtml(c.provider||'Campaign')}</small></div><strong>\${escapeHtml(c.name)}</strong><p>\${escapeHtml(campaignPaymentSummary(c))}</p><div class="campaign-nav-meta-v13"><span>\${formatCount(t.totalViews||0)} views</span><span>\${q?formatCount(q)+' min':'No minimum'}</span><span>\${ready.score}% setup</span></div></button>\`}).join(''):\`<div class="campaign-empty-v13"><b>No campaigns yet</b><span>Add or import a campaign to create a focused workspace.</span><button class="btn primary" id="emptyNewCampaignBtn">Add first campaign</button></div>\`;
    const detail=active?campaignDetail(active):\`<section class="card campaign-detail campaign-detail-empty"><b>Select a campaign</b><span>Sources, rules, clip creation and results will appear here.</span></section>\`;
    const formOverlay=state.campaignFormOpen?\`<div class="campaign-form-backdrop" id="campaignFormBackdrop"><div class="campaign-form-drawer">\${campaignForm(state.campaignFormOpen==='edit'?active:state.campaignFormOpen==='import'?state.campaignImportDraft:null,state.campaignFormOpen==='edit'?'edit':state.campaignFormOpen==='import'?'import':'new')}</div></div>\`:'';
    return \`<div class="content campaigns-v13">
      <section class="campaign-hero-v13"><div><div class="eyebrow">PAID CAMPAIGN WORKSPACE</div><h1>Campaign Studio</h1><p>Move from sources to clips, rules and results without mixing campaign work into general editing.</p></div><div class="campaign-summary-v13"><span><b>\${list.length}</b><small>Campaigns</small></span><span><b>\${formatCount(totals.views)}</b><small>Views</small></span><span><b>\${totals.posts}</b><small>Published</small></span><span><b>\${formatMoney(totals.confirmed,active?.currency||'USD')}</b><small>Confirmed</small></span></div></section>
      <div class="campaign-flow-v13"><span><i>1</i>Add sources</span><b>→</b><span><i>2</i>Create clips</span><b>→</b><span><i>3</i>Set rules</span><b>→</b><span><i>4</i>Track results</span></div>
      \${state.campaignMessage?\`<div class="settings-banner">\${escapeHtml(state.campaignMessage)}</div>\`:''}
      <div class="campaign-shell-v13"><aside class="campaign-sidebar-v13"><div class="campaign-sidebar-head-v13"><div><div class="eyebrow">YOUR CAMPAIGNS</div><h3>Campaigns</h3></div><button class="btn primary compact-btn" id="newCampaignBtn">＋</button></div><div class="campaign-nav-list-v13">\${state.campaignsLoading?'<div class="campaign-empty-v13">Loading campaigns…</div>':cards}</div>\${importBar}</aside><main class="campaign-main-v13">\${detail}</main></div>
      \${formOverlay}
    </div>\`
  }`);

src=MARK+'\n'+src;
fs.writeFileSync(file,src,'utf8');
console.log('Mint 21.13 structural UI applied directly to src/app.js');
