const fs=require('fs');
const path=require('path');
const ROOT=process.cwd();
const APP=path.join(ROOT,'src','app.js');
const SERVER=path.join(ROOT,'server','index.js');
const MAIN=path.join(ROOT,'desktop','main.cjs');
const PRELOAD=path.join(ROOT,'desktop','preload.cjs');
const INDEX=path.join(ROOT,'index.html');
const PKG=path.join(ROOT,'package.json');

const log=(m)=>console.log(`[Mint 21.15.0] ${m}`);
const warn=(m)=>console.warn(`[Mint 21.15.0] ${m}`);

function replaceOnce(source, from, to, label, required=true){
  if(source.includes(to)){ log(`${label}: already applied`); return source; }
  const i=source.indexOf(from);
  if(i<0){ if(required) throw new Error(`${label}: target not found`); warn(`${label}: target not found`); return source; }
  log(`${label}: applied`);
  return source.slice(0,i)+to+source.slice(i+from.length);
}
function insertBefore(source, marker, text, label, required=true){
  if(source.includes(text.trim().slice(0,80))){ log(`${label}: already applied`); return source; }
  const i=source.indexOf(marker);
  if(i<0){ if(required) throw new Error(`${label}: marker not found`); warn(`${label}: marker not found`); return source; }
  log(`${label}: applied`);
  return source.slice(0,i)+text+source.slice(i);
}
function safeWrite(file,content){ fs.writeFileSync(file,content,'utf8'); }

try {
  let app=fs.readFileSync(APP,'utf8');
  let server=fs.readFileSync(SERVER,'utf8');
  let main=fs.readFileSync(MAIN,'utf8');
  let preload=fs.readFileSync(PRELOAD,'utf8');
  let html=fs.readFileSync(INDEX,'utf8');

  // ------------------------------------------------------------
  // Frameless Windows shell + renderer controls
  // ------------------------------------------------------------
  main=replaceOnce(main,
`    width:1600, height:980, minWidth:1100, minHeight:720,
    backgroundColor:'#050913', show:false, autoHideMenuBar:true,
    icon:path.join(appRoot(), 'desktop', 'assets', 'clipboost.ico'),`,
`    width:1600, height:980, minWidth:1100, minHeight:720,
    backgroundColor:'#050913', show:false, autoHideMenuBar:true,
    frame:false, titleBarStyle:'hidden',
    icon:path.join(appRoot(), 'desktop', 'assets', 'clipboost.ico'),`,
'frameless BrowserWindow');

  main=insertBefore(main,
`ipcMain.on('desktop:activity', () => markRendererActivity());`,
`ipcMain.handle('desktop:window-minimize', () => { if(mainWindow&&!mainWindow.isDestroyed())mainWindow.minimize(); return {ok:true}; });
ipcMain.handle('desktop:window-maximize', () => {
  if(!mainWindow||mainWindow.isDestroyed())return {ok:false};
  if(mainWindow.isMaximized())mainWindow.unmaximize();else mainWindow.maximize();
  return {ok:true,maximized:mainWindow.isMaximized()};
});
ipcMain.handle('desktop:window-close', () => { if(mainWindow&&!mainWindow.isDestroyed())mainWindow.close(); return {ok:true}; });
ipcMain.handle('desktop:window-state', () => ({ok:true,maximized:Boolean(mainWindow&&!mainWindow.isDestroyed()&&mainWindow.isMaximized())}));

`,
'window IPC');

  preload=replaceOnce(preload,
`  reportActivity: () => ipcRenderer.send('desktop:activity')`,
`  minimizeWindow: () => ipcRenderer.invoke('desktop:window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('desktop:window-maximize'),
  closeWindow: () => ipcRenderer.invoke('desktop:window-close'),
  getWindowState: () => ipcRenderer.invoke('desktop:window-state'),
  reportActivity: () => ipcRenderer.send('desktop:activity')`,
'preload window bridge');

  app=replaceOnce(app,
`        <button class="mint-home-icon-btn mint-settings-gear" data-page="settings" type="button" aria-label="Settings" title="Settings">⚙</button>
      </div>`,
`        <button class="mint-home-icon-btn mint-settings-gear" data-page="settings" type="button" aria-label="Settings" title="Settings">⚙</button>
        <div class="mint-window-controls" aria-label="Window controls">
          <button type="button" id="mintWindowMin" title="Minimize" aria-label="Minimize">—</button>
          <button type="button" id="mintWindowMax" title="Maximize" aria-label="Maximize">□</button>
          <button type="button" id="mintWindowClose" class="close" title="Close" aria-label="Close">×</button>
        </div>
      </div>`,
'top window controls');

  app=replaceOnce(app,
`    const m=document.getElementById('menu');if(m)m.onclick=()=>document.getElementById('sidebar').classList.toggle('open');`,
`    const m=document.getElementById('menu');if(m)m.onclick=()=>document.getElementById('sidebar').classList.toggle('open');
    const winMin=document.getElementById('mintWindowMin');if(winMin)winMin.onclick=()=>window.clipboostDesktop?.minimizeWindow?.();
    const winMax=document.getElementById('mintWindowMax');if(winMax)winMax.onclick=()=>window.clipboostDesktop?.maximizeWindow?.();
    const winClose=document.getElementById('mintWindowClose');if(winClose)winClose.onclick=()=>window.clipboostDesktop?.closeWindow?.();`,
'bind window controls');

  // ------------------------------------------------------------
  // AI Studio preflight
  // ------------------------------------------------------------
  app=insertBefore(app,
`  async function uploadVideo(file){`,
`  async function ensureStudioPreflight({needsDownload=false}={}){
    try{
      const r=await fetch('/api/system/health');
      const h=await readJsonResponse(r,'AI Studio preflight failed');
      state.aiPreflight=h;
      const critical=[['FFmpeg',h.ffmpeg],['FFprobe',h.ffprobe],['Python',h.python],['faster-whisper',h.whisper]];
      if(needsDownload)critical.push(['yt-dlp',h.ytDlp]);
      const missing=critical.filter(([,x])=>!x?.ok).map(([name])=>name);
      if(missing.length){
        showNotice({kind:'danger',eyebrow:'AI Studio preflight',title:'Local AI is not ready',message:\`Missing: \${missing.join(', ')}. Open Settings → System health before processing.\`});
        return false;
      }
      if(!h.ollama?.ok&&!state.aiPreflightOllamaWarned){
        state.aiPreflightOllamaWarned=true;
        showNotice({kind:'warning',eyebrow:'AI Studio preflight',title:'Ollama is unavailable',message:'Mint can continue with deterministic clip selection, but semantic selection will run in degraded mode.'});
      }
      return true;
    }catch(e){
      showNotice({kind:'danger',eyebrow:'AI Studio preflight',title:'Could not verify local AI',message:e.message||'System health check failed.'});
      return false;
    }
  }

`,
'AI Studio preflight helper');

  app=replaceOnce(app,
`  async function uploadVideo(file){
    if(!file) return;
    state.uploadStatus='uploading'; state.uploadProgress=8; render();`,
`  async function uploadVideo(file){
    if(!file) return;
    if(!(await ensureStudioPreflight({needsDownload:false})))return;
    state.uploadStatus='uploading'; state.uploadProgress=8; render();`,
'local upload preflight');

  app=replaceOnce(app,
`      const r=await fetch(\`/api/videos/\${uploaded.id}/analyze\`,{method:'POST'}); const data=await readJsonResponse(r,'Analysis failed');
      state.video=data; state.selectedCandidate=0; state.uploadStatus='idle'; state.uploadProgress=100; render();`,
`      const r=await fetch(\`/api/videos/\${uploaded.id}/analyze\`,{method:'POST'}); const data=await readJsonResponse(r,'Analysis failed');
      state.video=data; state.selectedCandidate=0; state.uploadStatus='idle'; state.uploadProgress=100; render();
      pollProjectUntilSettled(uploaded.id);`,
'background local analysis client');

  app=replaceOnce(app,
`  async function startProjectIngestion(id){
    try{
      const r=await fetch(\`/api/projects/\${encodeURIComponent(id)}/ingest\`,{method:'POST'});`,
`  async function startProjectIngestion(id){
    try{
      if(!(await ensureStudioPreflight({needsDownload:true})))return;
      const r=await fetch(\`/api/projects/\${encodeURIComponent(id)}/ingest\`,{method:'POST'});`,
'external ingest preflight');

  // Poll ready/degraded/failed cleanly.
  app=replaceOnce(app,
`        if(data.status==='ready')state.selectedCandidate=0;
        state.projects=null;
        render();
        if(data.processingInterrupted){`,
`        if(['ready','degraded'].includes(data.status))state.selectedCandidate=0;
        state.projects=null;
        render();
        if(data.status==='degraded')showNotice({kind:'warning',eyebrow:'AI Studio',title:'Analysis completed in degraded mode',message:data.analysis?.aiError||'A local AI component fell back to deterministic processing.'});
        if(data.status==='failed')showNotice({kind:'danger',eyebrow:'AI Studio',title:'Analysis failed',message:data.analysis?.error||'The project could not be analyzed.'});
        if(data.processingInterrupted){`,
'poll degraded/failed');

  app=replaceOnce(app,
`    if(p?.status==='ready')return {progress:100,progressLabel:'Ready',badge:'Ready',done:true};`,
`    if(p?.status==='ready')return {progress:100,progressLabel:'Ready',badge:'Ready',done:true};
    if(p?.status==='degraded')return {progress:100,progressLabel:'Ready with fallback',badge:'Degraded',done:true};
    if(p?.status==='failed')return {progress:100,progressLabel:'Failed',badge:'Failed',done:false};`,
'project degraded states');

  // Generate variations now follows the background job instead of waiting on one HTTP request.
  app=replaceOnce(app,
`        const data=await readJsonResponse(r,'Could not generate clip variations');
        state.video=data;state.selectedCandidate=0;
      }catch(e){showNotice({kind:'danger',title:'Generation failed',message:e.message||'Could not generate clip variations'})}`,
`        const data=await readJsonResponse(r,'Could not generate clip variations');
        state.video=data;state.selectedCandidate=0;pollProjectUntilSettled(state.video.id);
      }catch(e){showNotice({kind:'danger',title:'Generation failed',message:e.message||'Could not generate clip variations'})}`,
'background variations client');

  // ------------------------------------------------------------
  // Campaign Studio becomes campaign-aware editor using same editor engine.
  // ------------------------------------------------------------
  const campaignEditorHelper=`  function campaignEditorView(c){
    let editor=studio();
    const context=\`<section class="mint-campaign-editor-context">
      <div class="mint-campaign-editor-context-main">
        <span class="campaign-state \${escapeHtml(c.status||'active')}">\${escapeHtml(c.status||'active')}</span>
        <div><b>\${escapeHtml(c.name||'Campaign')}</b><small>\${escapeHtml(c.provider||'Campaign')} · \${escapeHtml(campaignPaymentSummary(c))}</small></div>
      </div>
      <div class="mint-campaign-editor-context-stats">
        <span><small>Minimum</small><b>\${campaignQualification(c)?formatCount(campaignQualification(c)):'—'}</b></span>
        <span><small>Tracked</small><b>\${formatCount(c.totals?.totalViews||0)}</b></span>
        <span><small>Rules</small><b>\${(c.requirements||[]).length+(c.requiredHashtags||[]).length+(c.requiredMentions||[]).length}</b></span>
      </div>
      <div class="mint-campaign-editor-context-actions">
        <button class="btn secondary" id="campaignEditorRulesBtn">Rules</button>
        <button class="btn secondary" id="campaignEditorResultsBtn">Results</button>
        <button class="btn secondary" id="exitCampaignEditorBtn">Campaign manager</button>
      </div>
    </section>\`;
    editor=editor.replace('mint-studio-page-v142','mint-studio-page-v142 mint-campaign-editor-page-v150');
    editor=editor.replace('<div class="eyebrow">AI VIDEO EDITOR</div>','<div class="eyebrow">CAMPAIGN VIDEO EDITOR</div>');
    editor=editor.replace('<h1>AI Studio</h1>',\`<h1>Campaign Studio <span class="mint-editor-campaign-name">· \${escapeHtml(c.name)}</span></h1>\`);
    editor=editor.replace('Turn any source into polished short-form clips with AI-assisted editing.','Edit approved campaign media with campaign-aware clipping, rules and compliance.');
    editor=editor.replace('<section class="mint-studio-toolstrip-v142">',context+'<section class="mint-studio-toolstrip-v142">');
    return editor;
  }

`;
  app=insertBefore(app,`  function campaigns(){`,campaignEditorHelper,'campaign editor helper');

  app=replaceOnce(app,
`  function campaigns(){
    const list=state.campaigns?.campaigns||[];const active=selectedCampaign();const totals=`,
`  function campaigns(){
    const list=state.campaigns?.campaigns||[];const active=selectedCampaign();
    if(state.campaignEditorOpen&&active&&state.video?.campaign?.id===active.id)return campaignEditorView(active);
    const totals=`,
'campaign editor route');

  app=replaceOnce(app,
`  async function startCampaignCreating(){
    const c=selectedCampaign();if(!c)return;state.campaignTab='overview';render();
    setTimeout(()=>document.querySelector('.campaign-studio-v2-grid')?.scrollIntoView({behavior:'smooth',block:'start'}),0);
    if(!(c.sourceUrls||[]).length&&!(c.resourceUrls||[]).length)showNotice({kind:'info',eyebrow:'Campaign Studio',title:'Add an authorized source first',message:'Smart Import or the Sources tab can add the official videos and campaign asset packs before generation.'});
  }`,
`  async function startCampaignCreating(){
    const c=selectedCampaign();if(!c)return;
    const first=(c.sourceUrls||[])[0];
    if(first)return openCampaignSource(first.id);
    state.campaignTab='sources';render();
    showNotice({kind:'info',eyebrow:'Campaign Studio',title:'Add an authorized source first',message:'Campaign Studio is now the campaign video editor. Add or choose an approved source to start editing.'});
  }`,
'campaign start opens editor');

  app=replaceOnce(app,
`async function openCampaignSource(sourceId){const c=selectedCampaign();if(!c||state.projectBusy)return;state.projectBusy=true;render();try{const r=await fetch(\`/api/campaigns/\${encodeURIComponent(c.id)}/source-project\`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceId})});const data=await readJsonResponse(r,'Could not create campaign project');state.video=data;state.selectedCandidate=0;state.campaignVariants=null;state.campaignCompliance=null;try{localStorage.setItem('clipboost:lastProjectId',data.id)}catch{}navigate('studio');startProjectIngestion(data.id)}catch(e){showNotice({kind:'danger',title:'Could not open campaign source',message:e.message||'Could not create campaign project'})}finally{state.projectBusy=false}}`,
`async function openCampaignSource(sourceId){const c=selectedCampaign();if(!c||state.projectBusy)return;state.projectBusy=true;render();try{const r=await fetch(\`/api/campaigns/\${encodeURIComponent(c.id)}/source-project\`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceId})});const data=await readJsonResponse(r,'Could not create campaign project');state.video=data;state.selectedCandidate=0;state.campaignVariants=null;state.campaignCompliance=null;state.campaignEditorOpen=true;try{localStorage.setItem('clipboost:lastProjectId',data.id)}catch{}navigate('campaigns');startProjectIngestion(data.id)}catch(e){showNotice({kind:'danger',title:'Could not open campaign source',message:e.message||'Could not create campaign project'})}finally{state.projectBusy=false}}`,
'campaign source stays in Campaign Studio');

  app=replaceOnce(app,
`  async function openProject(id){
    try{const r=await fetch(\`/api/videos/\${encodeURIComponent(id)}\`);state.video=await readJsonResponse(r,'Could not open project');state.selectedCandidate=0;state.campaignVariants=null;state.campaignCompliance=null;try{localStorage.setItem('clipboost:lastProjectId',id)}catch{}navigate('studio');if(['ingesting','analyzing'].includes(state.video?.status))pollProjectUntilSettled(id)}catch(e){showNotice({kind:'danger',title:'Could not open project',message:e.message||'Could not open project'})}
  }`,
`  async function openProject(id){
    try{const r=await fetch(\`/api/videos/\${encodeURIComponent(id)}\`);state.video=await readJsonResponse(r,'Could not open project');state.selectedCandidate=0;state.campaignVariants=null;state.campaignCompliance=null;try{localStorage.setItem('clipboost:lastProjectId',id)}catch{}if(state.video?.campaign?.id||state.video?.campaignId){state.campaignSelected=state.video.campaign?.id||state.video.campaignId;state.campaignEditorOpen=true;navigate('campaigns')}else{state.campaignEditorOpen=false;navigate('studio')}if(['ingesting','analyzing'].includes(state.video?.status))pollProjectUntilSettled(id)}catch(e){showNotice({kind:'danger',title:'Could not open project',message:e.message||'Could not open project'})}
  }`,
'campaign projects open Campaign Studio');

  app=insertBefore(app,
`    const openStudioCampaign=document.getElementById('openStudioCampaignBtn');`,
`    const exitCampaignEditor=document.getElementById('exitCampaignEditorBtn');if(exitCampaignEditor)exitCampaignEditor.onclick=()=>{state.campaignEditorOpen=false;state.campaignTab='overview';render()};
    const campaignEditorRules=document.getElementById('campaignEditorRulesBtn');if(campaignEditorRules)campaignEditorRules.onclick=()=>{state.campaignEditorOpen=false;state.campaignTab='rules';render()};
    const campaignEditorResults=document.getElementById('campaignEditorResultsBtn');if(campaignEditorResults)campaignEditorResults.onclick=()=>{state.campaignEditorOpen=false;state.campaignTab='results';render()};

`,
'campaign editor bindings');

  // ------------------------------------------------------------
  // Server reliability: health includes Whisper
  // ------------------------------------------------------------
  server=replaceOnce(server,
`    python: { ok:false, detail:python },
    tracking: { ok:false, detail:'OpenCV face tracking' },`,
`    python: { ok:false, detail:python },
    whisper: { ok:false, detail:'faster-whisper not checked' },
    tracking: { ok:false, detail:'OpenCV face tracking' },`,
'health whisper result');

  server=replaceOnce(server,
`    run(python,['--version'],{timeout:8000}).then(x=>{result.python={ok:true,detail:(x.stdout||x.stderr).trim()||python}}).catch(()=>{}),
    run(python,['-c','import cv2; print(cv2.__version__)'],{timeout:8000}).then(x=>{result.tracking={ok:true,detail:\`OpenCV \${String(x.stdout||x.stderr).trim()} ready\`}}).catch(()=>{}),`,
`    run(python,['--version'],{timeout:8000}).then(x=>{result.python={ok:true,detail:(x.stdout||x.stderr).trim()||python}}).catch(()=>{}),
    run(python,['-c','import faster_whisper; print(getattr(faster_whisper,"__version__","ready"))'],{timeout:8000}).then(x=>{result.whisper={ok:true,detail:\`faster-whisper \${String(x.stdout||x.stderr).trim()} ready\`}}).catch(()=>{}),
    run(python,['-c','import cv2; print(cv2.__version__)'],{timeout:8000}).then(x=>{result.tracking={ok:true,detail:\`OpenCV \${String(x.stdout||x.stderr).trim()} ready\`}}).catch(()=>{}),`,
'health whisper check');

  // Analysis diagnostics and degraded status.
  server=replaceOnce(server,
`    meta.status = 'ready';
    meta.updatedAt = new Date().toISOString();
    meta.analysis = {`,
`    const semanticUsed=Boolean(candidates.some(x=>x?.signals?.semantic));
    const contextReviewed=Boolean(candidates.some(x=>x?.signals?.contextReviewed));
    if(!aiError && transcript?.words?.length && !semanticUsed) aiError='Ollama semantic selection was unavailable or returned no usable clips. Deterministic quality selection was used.';
    meta.status = aiError ? 'degraded' : 'ready';
    meta.updatedAt = new Date().toISOString();
    meta.analysis = {`,
'analysis degraded status');

  server=replaceOnce(server,
`      aiConfigured: true,
      aiError,
      clipCountPreference,`,
`      aiConfigured: true,
      aiError,
      whisperStatus: transcript?.words?.length ? 'ok' : 'failed',
      semanticEngine: semanticUsed ? 'ollama' : 'heuristic-fallback',
      contextReview: contextReviewed ? 'ollama' : 'fallback',
      degraded: Boolean(aiError),
      clipCountPreference,`,
'analysis engine diagnostics');

  const bgHelper=`async function startBackgroundAnalysis(projectId, options = {}) {
  const id=String(projectId||'');
  if(projectTaskIsActive(id)) return await readMeta(id);
  const meta=await readMeta(id);
  meta.status='analyzing';
  meta.updatedAt=new Date().toISOString();
  meta.analysis={...(meta.analysis||{}),stage:'queued',progress:5,error:null,interrupted:false};
  await writeMeta(meta);
  void withProjectTask(id,()=>analyzeProject(id,options)).catch(async err=>{
    try{
      const current=await readMeta(id);
      current.status='failed';
      current.updatedAt=new Date().toISOString();
      current.analysis={...(current.analysis||{}),stage:'failed',progress:Number(current.analysis?.progress||0),error:err?.message||'Analysis failed',aiError:err?.message||'Analysis failed'};
      await writeMeta(current);
    }catch{}
    console.error('Background analysis failed:',err);
  });
  return meta;
}

`;
  server=insertBefore(server,`app.post('/api/videos/:id/analyze', async (req, res, next) => {`,bgHelper,'background analysis helper');

  server=replaceOnce(server,
`app.post('/api/videos/:id/analyze', async (req, res, next) => {
  try {
    deletedProjectIds.delete(String(req.params.id));
    res.json(await withProjectTask(req.params.id, () => analyzeProject(req.params.id, { clipCount: req.body?.clipCount ?? 'auto' })));
  } catch (e) { next(e); }
});`,
`app.post('/api/videos/:id/analyze', async (req, res, next) => {
  try {
    deletedProjectIds.delete(String(req.params.id));
    const meta=await startBackgroundAnalysis(req.params.id,{clipCount:req.body?.clipCount??'auto'});
    res.status(202).json(meta);
  } catch (e) { next(e); }
});`,
'background analyze endpoint');

  // ------------------------------------------------------------
  // CSS entry
  // ------------------------------------------------------------
  if(!html.includes('functional-editor-21.15.0.css')){
    html=html.replace('</head>','  <link rel="stylesheet" href="./src/functional-editor-21.15.0.css" />\n</head>');
    log('CSS entry: applied');
  }

  // Commit all text files only after every required replacement succeeded.
  safeWrite(APP,app);
  safeWrite(SERVER,server);
  safeWrite(MAIN,main);
  safeWrite(PRELOAD,preload);
  safeWrite(INDEX,html);

  // Remove our own postinstall so the published repository remains clean.
  const pkg=JSON.parse(fs.readFileSync(PKG,'utf8'));
  pkg.version='21.15.0';
  pkg.description='Mint functional editor pass: compact AI Studio, campaign editor, frameless shell, reliability';
  if(pkg.scripts?.postinstall==='node scripts/apply-functional-editor-21.15.0.cjs')delete pkg.scripts.postinstall;
  fs.writeFileSync(PKG,JSON.stringify(pkg,null,2)+'\n','utf8');
  const lock=path.join(ROOT,'package-lock.json');
  if(fs.existsSync(lock)){
    try{
      const x=JSON.parse(fs.readFileSync(lock,'utf8'));x.version='21.15.0';if(x.packages?.[''])x.packages[''].version='21.15.0';
      fs.writeFileSync(lock,JSON.stringify(x,null,2)+'\n','utf8');
    }catch(e){warn('package-lock version could not be updated: '+e.message)}
  }
  log('all changes applied successfully');
} catch (error) {
  // Avoid trapping Auto Publisher in an npm-install retry loop.
  // Nothing is written before all required text transformations succeed.
  console.error('[Mint 21.15.0] patch skipped:',error?.stack||error);
  try{
    const pkg=JSON.parse(fs.readFileSync(PKG,'utf8'));
    if(pkg.scripts?.postinstall==='node scripts/apply-functional-editor-21.15.0.cjs')delete pkg.scripts.postinstall;
    fs.writeFileSync(PKG,JSON.stringify(pkg,null,2)+'\n','utf8');
  }catch{}
  process.exitCode=0;
}
