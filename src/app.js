(function(){
  const validPages=new Set(['home','studio','analytics','library','trends','projects','settings']);
  function pageFromHash(){
    const raw=String(location.hash||'').replace(/^#\/?/,'').split(/[?&]/)[0].trim();
    return validPages.has(raw)?raw:'home';
  }
  function loadEditorPrefs(){try{return JSON.parse(localStorage.getItem('clipboost:editorPrefs')||'{}')}catch{return {}}}
  const editorPrefs=loadEditorPrefs();
  const state={page:pageFromHash(), video:null, restoringProject:false, uploadProgress:0, uploadStatus:'idle', selectedCandidate:0, library:null, libraryLoaded:false, libraryLoading:false, libraryError:'', youtubeConfigured:null, twitchConfigured:null, libraryPlatform:'youtube', librarySection:'videos', librarySort:'newest', libraryCreatorFilter:'all', addCreatorOpen:false, addCreatorBusy:false, creatorPlatform:'youtube', creatorQuery:'', creatorSearchResults:[], creatorSearchLoading:false, previewVideo:null, livePlayer:null, libraryLoadMoreBusy:false, libraryRefreshBusy:false, libraryRefreshMessage:'', youtubeHistoryExpanded:false, projectBusy:false, projects:null, projectsLoading:false, captionPreference:editorPrefs.captionPreference||'auto', captionColor:editorPrefs.captionColor||'auto', regenerating:false, timelineSeek:null, candidatePreviewLoading:false, candidatePreviewLoadingIndex:-1, candidatePreviewError:'', candidatePreviewRequestId:0, candidatePreviewAutoplay:false, editPreset:editorPrefs.editPreset||'dynamic', editIntensity:editorPrefs.editIntensity||'balanced', trackingMode:editorPrefs.trackingMode||'speaker', cameraMovement:editorPrefs.cameraMovement||'balanced', captionStyle:editorPrefs.captionStyle||'bold', captionPosition:editorPrefs.captionPosition||'bottom', captionSize:editorPrefs.captionSize||'medium', captionColor:editorPrefs.captionColor||'white', cleanupMode:editorPrefs.cleanupMode||'captions', zoomStyle:editorPrefs.zoomStyle||'natural', editOptions:{autoReframe:true,speakerTracking:true,reactionDetection:true,sceneAwareCuts:true,silenceRemoval:true,dynamicZoom:true,captions:true,...(editorPrefs.editOptions||{})}, exportBusy:false, exportAllBusy:false, settings:null, settingsLoading:false, settingsSaving:false, settingsMessage:'', desktopSettings:null, systemHealth:null, systemHealthLoading:false, desktopUpdate:{status:'idle',version:null,percent:0}, uiModal:null};
  function persistEditorPrefs(){try{localStorage.setItem('clipboost:editorPrefs',JSON.stringify({captionPreference:state.captionPreference,captionColor:state.captionColor||'auto'}))}catch{}}
  let uiModalResolve=null;
  let rememberedReadyVersions=[];
  try{rememberedReadyVersions=JSON.parse(sessionStorage.getItem('clipboost:updateReadyPrompted')||'[]');if(!Array.isArray(rememberedReadyVersions))rememberedReadyVersions=[]}catch{rememberedReadyVersions=[]}
  const updateReadyPromptedVersions=new Set(rememberedReadyVersions.map(String));
  let updateInstallStarting=false;
  function rememberReadyVersion(version){
    const key=String(version||'unknown');
    updateReadyPromptedVersions.add(key);
    try{sessionStorage.setItem('clipboost:updateReadyPrompted',JSON.stringify([...updateReadyPromptedVersions].slice(-8)))}catch{}
  }
  function modalIcon(kind='info'){
    return {success:'✓',danger:'!',warning:'!',update:'↻',info:'i'}[kind]||'i';
  }
  function modalMarkup(){
    const m=state.uiModal;if(!m)return '';
    const kind=m.kind||'info';
    const mode=m.mode||'notice';
    const actions=mode==='progress'?`<div class="cb-modal-installing"><span class="cb-modal-spinner" aria-hidden="true"></span><span>${escapeHtml(m.progressLabel||'Installing…')}</span></div>`:`<div class="cb-modal-actions">${mode==='confirm'?`<button class="btn secondary" id="cbModalCancel" type="button">${escapeHtml(m.cancelLabel||'Cancel')}</button>`:''}<button class="btn ${kind==='danger'?'danger':'primary'}" id="cbModalConfirm" type="button">${escapeHtml(m.confirmLabel||'OK')}</button></div>`;
    return `<div class="cb-modal-backdrop" id="cbModalBackdrop"><section class="cb-modal cb-modal-${kind} ${mode==='progress'?'cb-modal-progress':''}" role="dialog" aria-modal="true" aria-labelledby="cbModalTitle"><div class="cb-modal-top"><div class="cb-modal-icon">${modalIcon(kind)}</div><div class="cb-modal-copy"><div class="eyebrow">${escapeHtml(m.eyebrow||'ClipBoost')}</div><h2 id="cbModalTitle">${escapeHtml(m.title||'ClipBoost')}</h2><p>${escapeHtml(m.message||'')}</p>${m.detail?`<div class="cb-modal-detail">${escapeHtml(m.detail)}</div>`:''}</div></div>${actions}</section></div>`;
  }
  function openModal(options={}){
    if(uiModalResolve){try{uiModalResolve(false)}catch{}uiModalResolve=null}
    return new Promise(resolve=>{uiModalResolve=resolve;state.uiModal={mode:'notice',kind:'info',eyebrow:'ClipBoost',confirmLabel:'OK',...options};render();});
  }
  function finishModal(result){const resolve=uiModalResolve;uiModalResolve=null;state.uiModal=null;render();if(resolve)resolve(result)}
  function showNotice(options={}){return openModal({mode:'notice',...options})}
  function confirmAction(options={}){return openModal({mode:'confirm',cancelLabel:'Cancel',confirmLabel:'Confirm',...options})}
  async function promptReadyUpdate(version,{force=false}={}){
    const key=String(version||'unknown');
    if(updateInstallStarting)return;
    if(state.uiModal?.purpose==='update-ready'&&state.uiModal?.updateVersion===key)return;
    if(!force&&updateReadyPromptedVersions.has(key))return;
    rememberReadyVersion(key);
    const ok=await confirmAction({purpose:'update-ready',updateVersion:key,kind:'update',eyebrow:'Update ready',title:`ClipBoost ${key==='unknown'?'':key} is ready`,message:'The update has finished downloading.',detail:'One click only. ClipBoost will close, update invisibly in the background, then reopen automatically.',confirmLabel:'Restart & install',cancelLabel:'Later'});
    if(!ok)return;
    updateInstallStarting=true;
    uiModalResolve=null;
    state.uiModal={mode:'progress',kind:'update',eyebrow:'Seamless update',title:'Installing ClipBoost…',message:'Preparing a clean restart with the new version.',detail:'You will not see the Windows installer. ClipBoost will reopen automatically when the update is finished.',progressLabel:'Applying update in the background…'};
    render();
    await new Promise(resolve=>setTimeout(resolve,120));
    try{
      const result=await window.clipboostDesktop?.installUpdate?.();
      if(result?.ok===false)throw new Error(result.error||'The update could not be installed.');
    }catch(error){
      updateInstallStarting=false;
      showNotice({kind:'danger',eyebrow:'Updates',title:'Installation could not start',message:error?.message||'ClipBoost could not start the update installer.'});
    }
  }
  function navigate(page,{replace=false}={}){
    if(!validPages.has(page)) page='home';
    state.page=page;
    const next=`#/${page}`;
    if(location.hash!==next){
      if(replace) history.replaceState(null,'',next); else history.pushState(null,'',next);
    }
    render();
    window.scrollTo(0,0);
    if(page==='studio'&&!state.video) setTimeout(restoreLastStudioProject,0);
  }
  const nav=[['home','⌂','Home'],['studio','✦','AI Studio'],['analytics','▥','Analytics'],['library','▣','Library'],['trends','↗','Trends'],['projects','▤','Projects']];
  const vods=[
    ['Kameto','Just Chatting','2h 14m','12 clips detected'],
    ['Squeezie','React','1h 02m','8 clips detected'],
    ['Inoxtag','Minecraft','1h 48m','15 clips detected'],
    ['Amine','Discussion','2h 31m','10 clips detected']
  ];
  const topics=[['GTA VI','+284% mentions'],['New Twitch drama','+173% mentions'],['Valorant update','+121% mentions'],['MrBeast','+98% mentions'],['Olympic Games','+76% mentions']];
  const colors=['purple','rose','blue','green','violet'];
  function spark(c='blue'){return `<svg class="spark ${c}" viewBox="0 0 120 30"><polyline points="0,25 12,22 24,24 36,17 48,20 60,14 72,16 84,10 96,12 108,6 120,4"/></svg>`}
  function avatar(seed='purple',size='md'){return `<div class="avatar-art ${seed} ${size}"><span class="hair"></span><span class="head"></span><span class="body"></span></div>`}
  function mediaThumb(i=0,large=false){return `<div class="media-thumb t${i%5} ${large?'large':''}"><div class="ambient"></div>${avatar(colors[i%colors.length], large?'lg':'md')}<span class="cam-dot"></span></div>`}
  function clip(score,label,i=0){return `<div class="clip"><div class="clip-thumb">${mediaThumb(i)}<div class="score">${score}</div><span class="clip-tag">AI pick</span></div><div class="clip-info"><strong>${label}</strong><small>00:42 – 01:08</small></div></div>`}
  function phone(tall=''){return `<div class="phone ${tall}"><div class="phone-stage">${avatar('purple','xl')}<span class="phone-chip">9:16</span></div><div class="caption">THAT WAS<br><b>INSANE!</b></div><div class="phone-progress"><i></i></div></div>`}
  function side(){return `<aside class="sidebar" id="sidebar"><div><div class="logo"><div class="logo-mark"></div><span>ClipBoost</span></div><div class="nav">${nav.map(([id,ico,l])=>`<button data-page="${id}" class="${state.page===id?'active':''}"><span class="ico">${ico}</span><span>${l}</span></button>`).join('')}</div></div><div class="side-bottom"><div class="nav"><button><span class="ico">♟</span><span>Team</span></button><button data-page="settings" class="${state.page==='settings'?'active':''}"><span class="ico">⚙</span><span>Settings</span></button></div><div class="profile"><div class="avatar">A</div><div><strong>Alex</strong><small>Creator</small></div></div></div></aside>`}
  function top(){const titles={home:'Home',studio:'AI Studio',analytics:'Analytics',library:'Library',trends:'Trends',projects:'Projects',settings:'Settings'};const u=state.desktopUpdate||{};const updatePill=['checking','downloading','ready','error'].includes(u.status)?`<button class="update-pill ${u.status}" id="updateCenterBtn" type="button"><span>${u.status==='ready'?'✓':u.status==='error'?'!':'↻'}</span>${u.status==='downloading'?`Update ${Math.round(u.percent||0)}%`:u.status==='checking'?'Checking update…':u.status==='ready'?`Update ${escapeHtml(u.version||'')} ready`:'Update issue'}</button>`:'';return `<header class="topbar"><div class="top-left"><button class="btn secondary mobile" id="menu">☰</button><div><div class="eyebrow">Workspace / ClipBoost</div><h2>${titles[state.page]}</h2></div></div><div class="top-actions">${updatePill}<div class="search">⌕ <input placeholder="Search anything..."></div><button class="icon-btn">◌</button><button class="icon-btn">◉</button></div></header>`}
  function kpi(a,b,c,idx=0){return `<div class="card kpi"><div class="kpi-top"><small>${a}</small><span class="kpi-icon">${['◉','↗','✦','▤'][idx%4]}</span></div><strong>${b}</strong><div class="delta">${c}</div>${spark(['blue','purple','green','blue'][idx%4])}</div>`}
  function home(){return `<div class="content home-content">
    <div class="hero-grid">
      <section class="card hero">
        <div class="hero-copy"><span class="pill">✦ AI Creator OS</span><h1>Welcome back, Alex 👋</h1><p>Turn long-form videos into high-performing shorts automatically.</p><div class="urlbox"><input placeholder="Paste a YouTube, Twitch or TikTok URL..."><button class="btn primary" data-page="studio">Analyze ↗</button></div><div class="platforms"><span>▶ YouTube</span><span>▣ Twitch</span><span>♪ TikTok</span><span>◎ Instagram</span></div></div>
        <div class="hero-preview">${phone()}<div class="chips"><span>1 video</span><span>20+ shorts</span><span>In minutes</span></div></div>
      </section>
      <section class="card opps"><div class="section-head"><div><div class="eyebrow">AI detection</div><h3>Latest opportunities</h3></div><span class="muted">View all ›</span></div><div class="clip-grid">${clip(92,'Viral moment',0)}${clip(88,'Funny reaction',1)}${clip(86,'Strong take',2)}${clip(83,'Epic moment',3)}</div></section>
    </div>
    <section class="section"><div class="section-head"><div><div class="eyebrow">Last 30 days</div><h3>Global performance</h3></div><span class="muted">All platforms</span></div><div class="kpis">${kpi('Total views','18.4M','+24.8%',0)}${kpi('Engagement rate','7.8%','+12.1%',1)}${kpi('Followers gained','+42.8K','+18.3%',2)}${kpi('Shorts published','184','+26.4%',3)}</div></section>
    <div class="lower-grid"><section class="card panel"><div class="section-head"><div><div class="eyebrow">Library</div><h3>Recent VODs</h3></div><span class="muted">View all ›</span></div><div class="vod-row">${vods.map((v,i)=>`<div class="vod">${mediaThumb(i)}<div class="vod-meta"><strong>${v[0]} · ${v[1]}</strong><small>${v[2]} · ${v[3]}</small></div></div>`).join('')}</div></section><section class="card panel insight"><div class="orb">✦</div><div class="eyebrow">AI insight</div><h3>Your “Reaction” content outperforms by 38%</h3><p>Shorts between 24 and 38 seconds with an immediate hook have your best retention.</p><button class="btn secondary" data-page="analytics">View analysis</button></section></div>
  </div>`}
  function externalEmbed(source){
    if(!source)return '';
    const host=location.hostname||'localhost';
    if(source.platform==='youtube') return `https://www.youtube.com/embed/${encodeURIComponent(source.id)}?rel=0`;
    if(source.platform==='twitch'&&source.mediaType==='clip') return `https://clips.twitch.tv/embed?clip=${encodeURIComponent(source.id)}&parent=${encodeURIComponent(host)}`;
    if(source.platform==='twitch'&&source.mediaType==='vod') return `https://player.twitch.tv/?video=${encodeURIComponent(source.id)}&parent=${encodeURIComponent(host)}&autoplay=false`;
    return '';
  }
  function studio(){
    let wave=''; for(let i=0;i<160;i++) wave+=`<i style="height:${8+(i*23)%34}px"></i>`;
    const v=state.video;
    const candidates=(v&&v.candidates&&v.candidates.length?v.candidates:[]);
    const selected=candidates.length?Math.min(state.selectedCandidate||0,candidates.length-1):0;
    const c=candidates[selected]||{start:0,end:30,score:0,reason:'No clip selected'};
    const timelineDuration=Math.max(1,Number(v?.details?.duration||0));
    const timelineSignals=v?.analysis?.timeline||{};
    const timelineScenes=Array.isArray(timelineSignals.scenes)?timelineSignals.scenes:[];
    const timelineSilences=Array.isArray(timelineSignals.silences)?timelineSignals.silences:[];
    const pct=t=>Math.max(0,Math.min(100,(Number(t||0)/timelineDuration)*100));
    const silenceLayers=timelineSilences.slice(0,500).map(s=>{const left=pct(s.start),right=pct(s.end),width=Math.max(.15,right-left);return `<span class="timeline-silence" style="left:${left}%;width:${width}%" title="Silence ${formatTime(s.start)}–${formatTime(s.end)}"></span>`}).join('');
    const sceneLayers=timelineScenes.slice(0,500).map(t=>`<span class="timeline-scene" style="left:${pct(t)}%" title="Scene change ${formatTime(t)}"></span>`).join('');
    const clipLayers=candidates.slice(0,40).map((m,i)=>{const left=pct(m.start),width=Math.max(.8,pct(m.end)-left);return `<button type="button" class="timeline-clip ${i===selected?'active':''}" style="left:${left}%;width:${width}%" data-candidate="${i}" data-timeline-start="${Number(m.start||0)}" title="#${i+1} ${escapeHtml(m.title||m.reason||'Clip')} · ${formatTime(m.start)}–${formatTime(m.end)}"><span>${i+1}</span></button>`}).join('');
    const selectedStart=pct(c.start),selectedWidth=Math.max(0,pct(c.end)-selectedStart);
    const timelineMarkup=`<div class="smart-timeline" id="smartTimeline" data-duration="${timelineDuration}"><div class="smart-wave">${wave}</div><div class="timeline-silences-layer">${silenceLayers}</div><div class="timeline-scenes-layer">${sceneLayers}</div><div class="timeline-selected-range" style="left:${selectedStart}%;width:${selectedWidth}%"></div><div class="timeline-clips-layer">${clipLayers}</div><div class="timeline-playhead" id="timelinePlayhead" style="left:${pct(state.timelineSeek??c.start)}%"></div></div><div class="timeline-axis"><span>00:00</span><span>${formatTime(timelineDuration*.25)}</span><span>${formatTime(timelineDuration*.5)}</span><span>${formatTime(timelineDuration*.75)}</span><span>${formatTime(timelineDuration)}</span></div><div class="timeline-legend"><span><i class="legend-clip"></i>AI clips</span><span><i class="legend-scene"></i>Scene changes</span><span><i class="legend-silence"></i>Silence</span></div>`;
    const editPlan=c?.previewMeta?.editPlan||c?.editPlan||null;
    const planSummary=editPlan?.summary||{cuts:0,zooms:0,reframes:0};
    const autoDirector=c?.previewMeta?.autoDirector||null;
    const editApplied=c?.previewMeta?.editApplied||null;
    const autoTags=autoDirector?.labels?.length?autoDirector.labels:['Speech-aware','Scene-aware','Smart framing','Adaptive captions'];
    const hasLocal=Boolean(v?.sourceUrl); const linked=Boolean(v?.externalSource&&!hasLocal);
    const ingesting=Boolean(v&&v.status==='ingesting'&&v.externalSource&&!hasLocal);
    const analyzing=Boolean(v&&v.status==='analyzing');
    const working=ingesting||analyzing;
    const ingestError=String(v?.ingestion?.error||'');
    const ingestProgress=Math.max(0,Math.min(100,Number(analyzing?(v?.analysis?.progress??0):(v?.ingestion?.progress??0))));
    const videoTitle=v?`${v.originalName}${v.details?.duration?` · ${Math.round(v.details.duration)} sec`:''}`:'No video uploaded yet';
    const uploadLabel=state.uploadStatus==='uploading'?'Uploading…':state.uploadStatus==='analyzing'?'Analyzing video…':'Upload video';
    const analysisStage=String(v?.analysis?.stage||'').replace(/-/g,' ');
    const transcriptionDetail=(v?.analysis?.stage==='transcription'||v?.analysis?.stage==='transcription-retry')&&v?.analysis?.transcriptionChunks?` · ${v.analysis.transcriptionChunk||0}/${v.analysis.transcriptionChunks} chunks${v.analysis.transcriptionWorkers?` · ${v.analysis.transcriptionWorkers} workers`:''}${v.analysis.transcriptionSkippedSeconds?` · ${Math.round(v.analysis.transcriptionSkippedSeconds/60)}m silence skipped`:''}`:'';
    const ingestTitle=analyzing?`Analyzing with Local AI…`:ingesting?'Downloading source automatically…':ingestError?'Automatic ingestion needs attention':linked?'Source linked — ready for automatic ingestion':v?'Upload another video':'Upload your first video';
    const ingestCopy=analyzing?`Local AI is processing the downloaded video. ${analysisStage?`Current step: ${escapeHtml(analysisStage)}.`:''} Transcription now runs in resumable chunks and automatically retries a stalled chunk.`:ingesting?'ClipBoost is fetching the source, then it will run FFmpeg + local transcription automatically.':ingestError?`Automatic ingestion failed: ${escapeHtml(ingestError)}`:linked?'ClipBoost can fetch this public source automatically. Use this only for content you own or have permission to reuse.':'Drag & drop a video here, or choose a file from your computer.';
    const uploader=`<section class="card upload-card ${linked?'needs-source':''} ${working?'is-ingesting':''}" id="dropZone">
      <input id="videoFile" class="native-file-input" type="file" accept=".mp4,video/mp4,video/*">
      <div class="upload-icon">${working?'↻':'⇧'}</div>
      <div class="upload-copy"><strong>${ingestTitle}</strong><span>${ingestCopy}</span>${working?`<div class="upload-progress"><i style="width:${Math.max(5,ingestProgress)}%"></i></div><small>${escapeHtml(v?.analysis?.stage||v?.ingestion?.stage||'working')}${transcriptionDetail} · ${Math.round(ingestProgress)}%</small>`:state.uploadStatus!=='idle'?`<div class="upload-progress"><i style="width:${state.uploadProgress}%"></i></div><small>${uploadLabel}</small>`:'<small class="upload-ready-hint">Automatic ingestion uses yt-dlp locally. Manual file upload remains available as a fallback.</small>'}</div>
      <div class="upload-actions">${linked&&!working?`<button class="btn primary" id="autoIngestBtn" type="button">${ingestError?'Retry automatic ingest':'Ingest automatically'}</button>`:''}<label class="btn ${linked?'secondary':'primary'} upload-file-label" for="videoFile">${linked?'Choose local file':v&&state.uploadStatus==='idle'?'Choose another video':uploadLabel}</label></div>
    </section>`;
    const embed=linked?externalEmbed(v.externalSource):'';
    const realVideo=hasLocal?`<video id="sourceVideo" class="real-video" controls preload="metadata" src="${v.sourceUrl}"></video>`:linked&&embed?`<iframe class="studio-source-embed" src="${embed}" title="${escapeHtml(v.originalName||'Linked source')}" frameborder="0" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe>`:`${mediaThumb(0,true)}<div class="caption">UPLOAD A <b>VIDEO</b></div><div class="play">▶</div>`;
    const firstCaption=(c.captions||[])[0]?.text||c.hook||'';
    const clipStartValue=Number(c.start||0),clipEndValue=Math.max(clipStartValue+.25,Number(c.end||clipStartValue+30)),clipDuration=Math.max(.25,clipEndValue-clipStartValue);
    const clipPreviewLoading=state.candidatePreviewLoading&&state.candidatePreviewLoadingIndex===selected;
    const previewError=state.candidatePreviewError&&state.candidatePreviewLoadingIndex===selected?state.candidatePreviewError:'';
    const trackingInfo=c.previewMeta?.tracking||null;
    const trackingWarning=c.previewMeta?.trackingWarning||'';
    const trackingBadge=trackingInfo?`<div class="tracking-badge ${trackingWarning?'warning':''}"><span>◉</span><b>${trackingWarning?'Tracking fallback':`${trackingInfo.faceCountMax||0} face${Number(trackingInfo.faceCountMax||0)===1?'':'s'}`}</b><small>${trackingWarning?'Center framing used':`${trackingInfo.speakerSwitches||0} switches · ${trackingInfo.reactionPeaks||0} reactions`}</small></div>`:'';
    const realPhone=hasLocal&&candidates.length?(c.previewUrl?`<video id="shortVideo" class="real-short-video" controls preload="metadata" playsinline src="${c.previewUrl}" data-segmented="1"></video><div class="ai-score-chip">AI ${Math.round(c.score||0)}</div><div class="rendered-badge">EDITED PREVIEW</div>${trackingBadge}`:`<div class="clip-preview-loading">${c.thumbnailUrl?`<img src="${c.thumbnailUrl}" alt="Selected clip">`:''}<div class="clip-preview-loading-overlay"><span class="preview-spinner">↻</span><strong>${clipPreviewLoading?'Rendering edited preview…':previewError?'Preview unavailable':'Preparing edited preview…'}</strong><small>${previewError?escapeHtml(previewError):'Applying silence cuts, reframing, zooms and captions to this preview.'}</small>${previewError?'<button class="btn secondary" id="retryClipPreview" type="button">Retry preview</button>':''}</div></div>`):`<div class="linked-phone-placeholder"><span>${linked?'SOURCE LINKED':'NO CLIP YET'}</span><b>${linked?'Upload the file to generate shorts':'Upload and analyze a video'}</b></div>`;
    const moments=candidates.length?`<div class="moments-head"><strong>${candidates.length} clip${candidates.length===1?'':'s'} generated</strong><span>Click any clip to preview it</span></div>${candidates.slice(0,40).map((m,i)=>`<button class="clip candidate-btn ${i===selected?'candidate-active':''}" data-candidate="${i}"><div class="clip-thumb">${m.thumbnailUrl?`<img src="${m.thumbnailUrl}" alt="clip thumbnail">`:mediaThumb(i)}<div class="score">${Math.round(m.score||0)}</div><span class="clip-tag">#${i+1} · ${m.editPlan?'AI edit plan':m.signals?.semantic?'Local AI':'AI pick'}</span></div><div class="clip-info"><strong>${escapeHtml(m.title||m.reason||'Candidate clip')}</strong><small>${formatTime(m.start||0)} – ${formatTime(m.end||0)} · ${Math.round(m.duration||0)}s</small>${m.quality?`<div class="quality-mini"><span>Hook ${Math.round(m.quality.hook||0)}</span><span>Story ${Math.round(m.quality.story||0)}</span><span>Complete ${Math.round(m.quality.completeness||0)}</span><span>Retention ${Math.round(m.quality.retention||0)}</span><span>Clean ${Math.round(m.quality.cleanSpeech||0)}</span></div>`:''}${m.hook?`<em>${escapeHtml(m.hook)}</em>`:''}<p>${escapeHtml(m.reason||'')}</p></div></button>`).join('')}`:`<div class="studio-empty-moments">${analyzing?'Local AI is still analyzing this video. Only clips that pass the quality bar will appear.':linked?'Upload the linked source file to detect moments.':'Upload a video and ClipBoost will keep only moments that pass the quality bar.'}</div>`;
    const ai=v?.analysis||{};
    const transcriptPreview=(v?.transcript?.captions||[]).slice(0,10).map(x=>`<div class="transcript-line"><span>${formatTime(x.start)}</span><p>${escapeHtml(x.text)}</p></div>`).join('');
    const analysisStatus=hasLocal?`<section class="card ai-analysis-bar ${ai.aiError?'warning':''}"><div><span class="eyebrow">ANALYSIS ENGINE</span><strong>${escapeHtml(ai.engine||'Ready to analyze')}</strong><small>${ai.wordCount?`${formatCount(ai.wordCount)} cleaned words · ${formatCount(ai.captionCount||0)} caption groups${ai.transcriptCleanup?.removedWords?` · ${formatCount(ai.transcriptCleanup.removedWords)} fillers/repeats cleaned`:''}`:analyzing?`Chunked transcription · ${Math.round(Number(ai.transcriptionProgress||0))}% complete`:'Local faster-whisper + Quality Engine analysis'}</small></div><div class="analysis-pills"><span>${ai.scenesDetected||0} scenes</span><span>${ai.silencesDetected||0} pauses</span><span class="${ai.transcription&&ai.transcription!=='not-configured'?'ok':''}">${ai.transcription&&ai.transcription!=='not-configured'?'✓ transcript':analyzing?'Transcribing…':'No transcript'}</span>${ai.retryAttempt?`<span class="warning-pill">Retry ${ai.retryAttempt}</span>`:''}</div>${ai.warning?`<p>${escapeHtml(ai.warning)}</p>`:''}${ai.aiError?`<p>${escapeHtml(ai.aiError)}</p>`:''}</section>`:'';
    const transcriptPanel=v?.transcript?.captions?.length?`<section class="card transcript-panel"><div class="section-head"><div><div class="eyebrow">WORD-SYNCED CAPTIONS</div><h3>Transcript preview</h3></div><span class="muted">${formatCount(v.transcript.words?.length||0)} words</span></div><div class="transcript-list">${transcriptPreview}</div></section>`:'';
    const activeSummary={cuts:Number(editApplied?.silenceCuts??planSummary.cuts??0),disfluencies:Number(editApplied?.speechCleanupCuts??0),zooms:Number(editApplied?.zooms??planSummary.zooms??0),reframes:editApplied?.reframed===false?0:Number(planSummary.reframes??0)};
    return `<div class="content"><div class="page-title"><div><div class="eyebrow">Video project</div><h1>AI Studio</h1><p>${videoTitle}</p></div><div class="tabs"><button class="btn secondary">Save</button><button class="btn secondary" id="exportAllBtn" ${hasLocal&&candidates.length&&!state.exportAllBusy?'':'disabled'}>${state.exportAllBusy?'Exporting all…':'Export all clips'}</button><button class="btn primary" id="exportBtn" ${hasLocal&&!state.exportBusy?'':'disabled'}>${state.exportBusy?'Exporting…':'Export edited clip'}</button></div></div>${uploader}${analysisStatus}<div class="studio-layout"><section class="card studio-main"><div class="video">${realVideo}</div><div class="timeline"><div class="section-head"><strong>Smart timeline</strong><span class="muted">${analyzing?`Local AI: ${escapeHtml(analysisStage||'analyzing')}${transcriptionDetail} · ${Math.round(ingestProgress)}%`:hasLocal?(v.candidates?.length||0)+' strong clip'+((v.candidates?.length||0)===1?'':'s')+' found · quality-gated':ingesting?'Automatic ingestion in progress':linked?'Source linked — ingest to analyze':'Upload a video to analyze it'}</span></div>${timelineMarkup}</div><div class="moments">${moments}</div></section><section class="card short-panel"><div class="section-head"><div><div class="eyebrow">Version ${candidates.length?selected+1:0}/${candidates.length}</div><h3>Short preview</h3></div><span>•••</span></div><div class="phone tall">${realPhone}</div><div class="clip-range"><label>Start <input id="clipStart" type="number" step="0.1" value="${Number(c.start||0).toFixed(1)}"></label><label>End <input id="clipEnd" type="number" step="0.1" value="${Number(c.end||30).toFixed(1)}"></label></div><div class="preview-note">Preview uses the same edit renderer as the final export.</div></section><section class="card controls"><div class="section-head"><div><div class="eyebrow">AI director</div><h3>Automatic editing</h3></div><span>✦</span></div><div class="auto-director-card"><div class="auto-director-status"><span class="auto-director-dot"></span><div><strong>Auto Director</strong><small>ClipBoost adapts every clip to the source instead of applying one fixed preset.</small></div></div><div class="auto-director-tags">${autoTags.map(x=>`<span>${escapeHtml(x)}</span>`).join('')}</div>${autoDirector?.reason?`<p>${escapeHtml(autoDirector.reason)}</p>`:''}</div><div class="selectrow"><span>Captions</span><select id="captionPreferenceSelect"><option value="auto" ${state.captionPreference==='auto'?'selected':''}>Auto (recommended)</option><option value="on" ${state.captionPreference==='on'?'selected':''}>Always on</option><option value="off" ${state.captionPreference==='off'?'selected':''}>Off</option></select></div><div class="caption-color-control"><div class="caption-color-head"><span>Caption color</span><small>Popular social presets</small></div><div class="caption-color-palette">${[['auto','Auto'],['white','White'],['yellow','Yellow'],['lime','Lime'],['cyan','Cyan'],['pink','Pink'],['red','Red']].map(([value,label])=>`<button type="button" class="caption-color-chip ${state.captionColor===value?'active':''}" data-caption-color="${value}"><i class="caption-swatch swatch-${value}">${value==='auto'?'A':''}</i><span>${label}</span></button>`).join('')}</div></div><div class="caption-format-note">No punctuation · short social-style caption beats</div><div class="quality-explainer"><b>Automatic per clip</b><span>Clip selection has no quota. Framing, face safety, silence cuts, speech cleanup, caption design and zooms are chosen from the actual speech and visual activity.</span></div>${editPlan?`<div class="edit-plan-card"><span class="eyebrow">AUTO EDIT PLAN</span><strong>${activeSummary.cuts} silence cuts · ${activeSummary.disfluencies} speech cleanups · ${activeSummary.zooms} zooms</strong><small>${activeSummary.reframes} reframe pass${trackingInfo?` · ${trackingInfo.faceCountMax||0} faces max · ${trackingInfo.speakerSwitches||0} speaker switches`:''}${editApplied?.preset?` · ${escapeHtml(editApplied.preset)} profile`:''}</small></div>`:''}<button class="btn primary full generate" id="generateVariationsBtn" ${hasLocal&&!analyzing&&!state.regenerating?'':'disabled title="Wait for analysis to finish"'}>${state.regenerating?'↻ Generating clips…':analyzing?'↻ Local AI analyzing…':hasLocal?'✦ Generate variations':ingesting?'↻ Processing source…':'⇧ Ingest source first'}</button></section></div>${transcriptPanel}</div>`}

  function formatTime(sec){const s=Math.max(0,Number(sec)||0);const m=Math.floor(s/60);return `${String(m).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`}

  async function uploadVideo(file){
    if(!file) return;
    state.uploadStatus='uploading'; state.uploadProgress=8; render();
    try{
      const fd=new FormData(); if(state.video?.status==='linked'&&state.video?.id)fd.append('projectId',state.video.id); fd.append('video',file);
      const xhr=new XMLHttpRequest();
      const uploaded=await new Promise((resolve,reject)=>{
        xhr.open('POST','/api/videos');
        xhr.upload.onprogress=e=>{if(e.lengthComputable){state.uploadProgress=Math.max(8,Math.round((e.loaded/e.total)*70)); const bar=document.querySelector('.upload-progress i'); if(bar)bar.style.width=state.uploadProgress+'%';}};
        xhr.onload=()=>{try{const data=JSON.parse(xhr.responseText||'{}'); if(xhr.status>=200&&xhr.status<300)resolve(data); else reject(new Error(data.error||'Upload failed'));}catch(e){reject(e)}};
        xhr.onerror=()=>reject(new Error('Upload failed')); xhr.send(fd);
      });
      state.video=uploaded; try{localStorage.setItem('clipboost:lastProjectId',uploaded.id)}catch{} state.uploadStatus='analyzing'; state.uploadProgress=78; render();
      const r=await fetch(`/api/videos/${uploaded.id}/analyze`,{method:'POST'}); const data=await readJsonResponse(r,'Analysis failed');
      state.video=data; state.selectedCandidate=0; state.uploadStatus='idle'; state.uploadProgress=100; render();
    }catch(e){state.uploadStatus='idle'; state.uploadProgress=0; showNotice({kind:'danger',title:'Upload failed',message:e.message||'Upload failed'}); render();}
  }

  function currentRenderOptions(){return {autoDirector:true,captionPreference:state.captionPreference||'auto',captionColor:state.captionColor||'auto'}}
  function invalidateRenderedPreviews(){for(const cand of (state.video?.candidates||[])){cand.previewUrl=null;cand.previewEdited=false;cand.previewMeta=null}state.candidatePreviewError='';state.candidatePreviewLoading=false;}
  async function exportCurrent(){
    const v=state.video; if(!v?.sourceUrl) return showNotice({kind:'warning',title:'Source file required',message:'Upload or ingest the source file before exporting this clip.'});
    const index=state.selectedCandidate||0;const start=Number(document.getElementById('clipStart')?.value||v.candidates?.[index]?.start||0); const end=Number(document.getElementById('clipEnd')?.value||v.candidates?.[index]?.end||start+30);
    state.exportBusy=true;render();
    try{const r=await fetch(`/api/videos/${v.id}/export`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({index,start,end,options:currentRenderOptions()})});const data=await readJsonResponse(r,'Export failed');window.open(data.url,'_blank');}
    catch(e){showNotice({kind:'danger',title:'Export failed',message:e.message||'Export failed'})} finally {state.exportBusy=false;render()}
  }
  async function exportAll(){
    const v=state.video;if(!v?.sourceUrl||!(v.candidates||[]).length)return;
    if(state.exportAllBusy)return;state.exportAllBusy=true;render();
    try{const r=await fetch(`/api/videos/${v.id}/export-all`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({options:currentRenderOptions()})});const data=await readJsonResponse(r,'Export all failed');showNotice({kind:'success',title:'Export complete',message:`${data.count||0} edited clips exported successfully.`});if(window.clipboostDesktop?.openExportsFolder)window.clipboostDesktop.openExportsFolder();}
    catch(e){showNotice({kind:'danger',title:'Export failed',message:e.message||'Export all failed'})}finally{state.exportAllBusy=false;render()}
  }
  function chart(){return `<svg viewBox="0 0 900 260" preserveAspectRatio="none">${[40,90,140,190,240].map(y=>`<line class="gridline" x1="0" x2="900" y1="${y}" y2="${y}"/>`).join('')}<polyline class="line1" points="0,215 70,198 140,202 210,168 280,175 350,141 420,150 490,112 560,130 630,92 700,104 780,55 900,31"/><polyline class="line2" points="0,224 70,215 140,204 210,190 280,193 350,166 420,172 490,152 560,160 630,137 700,145 780,105 900,88"/><polyline class="line3" points="0,230 70,225 140,218 210,209 280,214 350,198 420,202 490,183 560,188 630,172 700,178 780,150 900,134"/></svg>`}
  function analytics(){let heat='';['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach((d,r)=>{heat+=`<div class="heatrow"><span>${d}</span>${Array.from({length:10},(_,c)=>`<i class="heatcell" style="opacity:${.18+(((r*3+c*5)%8)+1)*.09}"></i>`).join('')}</div>`});let bars=[['Gaming / Reaction',32],['Hot takes',27],['Storytelling',21],['News / Drama',12],['Tutorials / Tips',8]].map(x=>`<div class="barrow"><span>${x[0]}</span><div class="bar"><i style="width:${x[1]*2.3}%"></i></div><b>${x[1]}%</b></div>`).join('');return `<div class="content"><div class="page-title"><div><div class="eyebrow">Multi-platform intelligence</div><h1>Account analytics</h1><p>Understand what performs and why.</p></div><div class="tabs"><button class="tab active">▶ YouTube</button><button class="tab">♪ TikTok</button><button class="tab">◎ Instagram</button><button class="tab">Last 30 days</button></div></div><div class="kpis">${kpi('Total views','18.7M','+24.8%',0)}${kpi('Followers','1.42M','+12.4%',1)}${kpi('Engagement rate','7.8%','+12.1%',2)}${kpi('Average views','482K','+18.3%',3)}</div><div class="analytics-grid"><section class="card chart"><div class="section-head"><h3>Views over time</h3><span class="muted">Views</span></div>${chart()}</section><section class="card donut-card"><div class="section-head"><h3>Views distribution</h3></div><div class="donut"></div><div class="legend"><span><i class="yt"></i>YouTube 48%</span><span><i class="tt"></i>TikTok 34%</span><span><i class="ig"></i>Instagram 18%</span></div></section><section class="card top-content span2"><div class="section-head"><h3>Top content</h3><span class="muted">View all ›</span></div><div class="topclips">${Array.from({length:5},(_,i)=>`<div class="topclip">${mediaThumb(i)}<span>${['2.4M','1.8M','1.2M','960K','742K'][i]} views</span></div>`).join('')}</div></section><section class="card heat"><h3>Best posting times</h3><div class="heatmap">${heat}</div></section><section class="card dna"><h3>Top performing content types</h3>${bars}</section></div></div>`}
  function formatCount(n){const x=Number(n||0);if(x>=1e9)return (x/1e9).toFixed(x>=1e10?0:1)+'B';if(x>=1e6)return (x/1e6).toFixed(x>=1e7?0:1)+'M';if(x>=1e3)return (x/1e3).toFixed(x>=1e4?0:1)+'K';return String(x)}
  function formatDuration(sec){const n=Math.max(0,Math.floor(Number(sec)||0));const h=Math.floor(n/3600),m=Math.floor((n%3600)/60),ss=n%60;return h?`${h}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`:`${m}:${String(ss).padStart(2,'0')}`}
  function relativeDate(value){if(!value)return '';const d=new Date(value),diff=Math.max(0,Date.now()-d.getTime());const min=Math.floor(diff/60000);if(min<60)return `${Math.max(1,min)}m ago`;const h=Math.floor(min/60);if(h<24)return `${h}h ago`;const days=Math.floor(h/24);if(days<30)return `${days}d ago`;return d.toLocaleDateString()}
  function sortLibraryItems(items){
    const list=[...items];
    const dateOf=x=>new Date(x.publishedAt||x.createdAt||0).getTime()||0;
    const viewsOf=x=>Number(x.viewCount||0);
    if(state.librarySort==='oldest') return list.sort((a,b)=>dateOf(a)-dateOf(b));
    if(state.librarySort==='views-desc') return list.sort((a,b)=>viewsOf(b)-viewsOf(a));
    if(state.librarySort==='views-asc') return list.sort((a,b)=>viewsOf(a)-viewsOf(b));
    return list.sort((a,b)=>dateOf(b)-dateOf(a));
  }
  function mediaRow(item,creator,platform,type){
    const isYT=platform==='youtube';
    const previewKind=isYT?'youtube':(type==='clip'?'twitch-clip':'twitch-vod');
    const thumb=item.thumbnail||'';
    const icon=isYT?'▶':'▣';
    const stats=[`${formatCount(item.viewCount)} views`];
    if(isYT&&item.likeCount)stats.push(`${formatCount(item.likeCount)} likes`);
    if(type==='clip'&&item.creatorName)stats.push(`Clipped by ${escapeHtml(item.creatorName)}`);
    if(platform==='twitch'&&type==='vod'&&item.videoType)stats.push(escapeHtml(item.videoType==='archive'?'Past broadcast':item.videoType==='highlight'?'Highlight':'Upload'));
    return `<div class="yt-vod-item library-media-row"><button class="yt-thumb yt-preview-trigger" type="button" data-preview-kind="${previewKind}" data-preview-id="${escapeHtml(item.id)}" data-preview-title="${escapeHtml(item.title)}" data-preview-url="${escapeHtml(item.url||'')}"><img src="${escapeHtml(thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer"><span>${formatDuration(item.duration)}</span><i class="preview-play">▶</i></button><div class="yt-vod-copy"><div class="platform-line"><span class="${isYT?'youtube-dot':'twitch-dot'}">${icon}</span><small>${escapeHtml(creator.name)} · ${relativeDate(item.publishedAt||item.createdAt)}</small></div><strong>${escapeHtml(item.title)}</strong><div class="yt-stats">${stats.map(x=>`<span>${x}</span>`).join('')}</div></div><div class="vod-actions"><button class="btn primary send-studio-btn" type="button" data-send-studio-platform="${escapeHtml(platform)}" data-send-studio-creator="${escapeHtml(creator.id)}" data-send-studio-type="${escapeHtml(type)}" data-send-studio-id="${escapeHtml(item.id)}">✦ Send to AI Studio</button><button class="btn secondary preview-btn" type="button" data-preview-kind="${previewKind}" data-preview-id="${escapeHtml(item.id)}" data-preview-title="${escapeHtml(item.title)}" data-preview-url="${escapeHtml(item.url||'')}">▶ Preview</button><a class="btn secondary" href="${escapeHtml(item.url||'#')}" target="_blank" rel="noreferrer">Open ↗</a></div></div>`;
  }
  function library(){
    const allCreators=state.library?.creators||[];
    const platform=state.libraryPlatform||'youtube';
    const creators=allCreators.filter(c=>c.platform===platform);
    if(!creators.some(c=>c.id===state.libraryCreatorFilter))state.libraryCreatorFilter='all';
    const filteredCreators=state.libraryCreatorFilter==='all'?creators:creators.filter(c=>c.id===state.libraryCreatorFilter);
    let section=state.librarySection;
    if(platform==='youtube'&&!['videos','shorts','saved'].includes(section))section=state.librarySection='videos';
    if(platform==='twitch'&&!['vods','clips','live'].includes(section))section=state.librarySection='vods';
    let items=[];
    if(platform==='youtube') {
      let youtubeItems=filteredCreators.flatMap(c=>(c.videos||[]).map(v=>({...v,creator:c,mediaType:'video'})));
      if(!state.youtubeHistoryExpanded){
        const fallback=new Date();fallback.setUTCMonth(fallback.getUTCMonth()-3);
        youtubeItems=youtubeItems.filter(v=>new Date(v.publishedAt||0)>=fallback);
      }
      if(section==='shorts') items=youtubeItems.filter(v=>Number(v.duration||0)>0&&Number(v.duration||0)<=180);
      else if(section==='videos') items=youtubeItems.filter(v=>!Number(v.duration||0)||Number(v.duration||0)>180);
      else items=[];
    }
    else if(section==='clips') items=filteredCreators.flatMap(c=>(c.clips||[]).map(v=>({...v,creator:c,mediaType:'clip'})));
    else if(section==='vods') items=filteredCreators.flatMap(c=>(c.vods||[]).map(v=>({...v,creator:c,mediaType:'vod'})));
    items=sortLibraryItems(items);
    const creatorsHtml=creators.length?creators.map(c=>`<div class="creator creator-live ${c.isLive?'is-live':''} ${state.libraryCreatorFilter===c.id?'selected':''}" role="button" tabindex="0" data-filter-creator="${escapeHtml(c.id)}" title="Show only ${escapeHtml(c.name)}"><div class="creator-avatar-wrap">${creatorAvatarMarkup(c)}${c.isLive?'<span class="live-dot">LIVE</span>':''}<button class="creator-remove" data-remove-platform="${escapeHtml(c.platform)}" data-remove-id="${escapeHtml(c.id)}" data-remove-name="${escapeHtml(c.name)}" title="Remove ${escapeHtml(c.name)}">×</button></div><span>${escapeHtml(c.name)}</span><small>${platform==='youtube'?`${formatCount(c.subscribers)} subs`:(c.isLive?`${formatCount(c.live?.viewerCount||0)} watching`:'Offline')}</small></div>`).join(''):`<div class="library-empty-inline"><span>${platform==='youtube'?'▶':'▣'}</span><div><b>No ${platform==='youtube'?'YouTube creators':'Twitch streamers'} followed yet</b><small>Add one to start building this section of your library.</small></div></div>`;
    let mediaHtml='';
    if(platform==='twitch'&&section==='live'){
      const liveRows=filteredCreators.filter(c=>c.isLive&&c.live);
      mediaHtml=liveRows.length?liveRows.map(c=>{const login=c.login||c.handle||'';const liveUrl=c.channelUrl||`https://www.twitch.tv/${login}`;const liveData=`data-live-channel="${escapeHtml(login)}" data-live-name="${escapeHtml(c.name||login)}" data-live-title="${escapeHtml(c.live.title||'Live stream')}" data-live-url="${escapeHtml(liveUrl)}" data-live-viewers="${Number(c.live.viewerCount||0)}" data-live-game="${escapeHtml(c.live.gameName||c.gameName||'Twitch')}"`;return `<div class="yt-vod-item library-media-row live-media-row"><button class="yt-thumb yt-preview-trigger live-open-trigger" type="button" ${liveData} aria-label="Watch ${escapeHtml(c.name||login)} live in ClipBoost"><img src="${escapeHtml(c.live.thumbnail||c.avatar||'')}" alt="" loading="lazy"><span class="live-badge">LIVE</span><i class="preview-play">▶</i></button><div class="yt-vod-copy live-copy" ${liveData} role="button" tabindex="0"><div class="platform-line"><span class="twitch-dot">▣</span><small>${escapeHtml(c.name)} · ${formatCount(c.live.viewerCount||0)} viewers</small></div><strong>${escapeHtml(c.live.title||'Live stream')}</strong><div class="yt-stats"><span>${escapeHtml(c.live.gameName||c.gameName||'Twitch')}</span><span>Started ${relativeDate(c.live.startedAt)}</span></div></div><div class="vod-actions"><button class="btn primary preview-btn live-watch-btn" type="button" ${liveData}>▶ Watch live</button><button class="btn secondary" type="button" data-refresh-live="1">↻ Refresh</button></div></div>`}).join(''):`<div class="library-empty"><div class="library-empty-icon twitch">▣</div><h3>No followed streamer is live right now</h3><p>Live status refreshes automatically while this tab is open.</p><button class="btn secondary" type="button" data-refresh-live="1">↻ Check live now</button></div>`;
    }else{
      const youtubeEmptyTitle=section==='shorts'?'No YouTube Shorts found':section==='saved'?'No saved videos yet':'No long-form YouTube videos found';
      const youtubeEmptyText=section==='shorts'?'ClipBoost currently groups uploads up to 3 minutes as Shorts.':section==='saved'?'Saved content will appear here.':'Try another creator or refresh YouTube to fetch the latest uploads.';
      mediaHtml=items.length?items.map(v=>mediaRow(v,v.creator,platform,v.mediaType)).join(''):`<div class="library-empty"><div class="library-empty-icon ${platform==='twitch'?'twitch':''}">${platform==='youtube'?'▶':'▣'}</div><h3>${platform==='youtube'?youtubeEmptyTitle:section==='clips'?'No public Twitch clips found':'No public Twitch videos found'}</h3><p>${platform==='youtube'?youtubeEmptyText:section==='clips'?'This streamer may not have public clips available. Try Refresh Twitch or another streamer.':'Some streamers disable past broadcasts or remove them quickly. ClipBoost now also checks public highlights and uploads.'}</p>${platform==='youtube'?'<button class="btn primary" id="emptyAddCreator">+ Add creator</button>':'<button class="btn secondary" id="emptyRefreshTwitch">↻ Refresh Twitch</button>'}</div>`;
    }
    const statusYT=state.youtubeConfigured===false?`<span class="integration-badge error">YouTube API not configured</span>`:`<span class="integration-badge ok">● YouTube connected</span>`;
    const statusTW=state.twitchConfigured===false?`<span class="integration-badge error">Twitch API not configured</span>`:`<span class="integration-badge twitch-ok">● Twitch connected</span>`;
    const status=platform==='youtube'?statusYT:statusTW;
    const results=(state.creatorSearchResults||[]).map(c=>`<button class="creator-search-result" type="button" data-add-channel="${escapeHtml(c.id||c.login||c.handle||'')}" data-add-input="${escapeHtml(c.login||c.handle||c.id||'')}">${creatorAvatarMarkup(c,'search-avatar')}<div class="grow"><strong>${escapeHtml(c.name)}</strong><small>${platform==='youtube'?`${escapeHtml(c.handle||'')}${c.handle?' · ':''}${formatCount(c.subscribers)} subscribers`:`@${escapeHtml(c.login||c.handle||'')}${c.isLive?' · LIVE':''}`}</small><p>${escapeHtml((c.description||'').slice(0,120))}</p></div><span class="result-add">Add</span></button>`).join('');
    const query=escapeHtml(state.creatorQuery||'');
    const searchState=state.creatorSearchLoading?`<div class="creator-search-state">Searching ${platform==='youtube'?'YouTube':'Twitch'}…</div>`:(state.creatorQuery&&state.creatorQuery.length>=2&&!results?`<div class="creator-search-state">No matching ${platform==='youtube'?'channels':'streamers'} found. You can still paste an exact ${platform==='youtube'?'@handle or URL':'username or Twitch URL'}.</div>`:'');
    const modal=state.addCreatorOpen?`<div class="modal-backdrop" id="creatorModalBackdrop"><div class="card creator-modal smart-search-modal"><button class="modal-close" id="closeCreatorModal">×</button><div class="modal-platform-switch"><button type="button" data-creator-platform="youtube" class="${state.creatorPlatform==='youtube'?'active':''}">▶ YouTube</button><button type="button" data-creator-platform="twitch" class="${state.creatorPlatform==='twitch'?'active':''}">▣ Twitch</button></div><div class="eyebrow">Smart creator search</div><h2>Find a ${state.creatorPlatform==='youtube'?'YouTube creator':'Twitch streamer'}</h2><p>Type a name, ${state.creatorPlatform==='youtube'?'@handle or channel URL':'username or Twitch channel URL'}. ClipBoost will suggest matching accounts.</p><form id="creatorForm"><label>Creator</label><div class="creator-search-box"><input id="creatorInput" value="${query}" placeholder="${state.creatorPlatform==='youtube'?'MrBeast, @Kameto, or a YouTube URL':'Kameto, xQc, or a Twitch URL'}" autocomplete="off"><button type="submit" class="btn secondary" ${state.creatorSearchLoading?'disabled':''}>Search</button></div></form><div class="creator-search-results">${searchState}${results}</div><div class="modal-actions"><button type="button" class="btn secondary" id="cancelCreator">Cancel</button>${state.creatorQuery?`<button type="button" class="btn primary" id="addExactCreator" ${state.addCreatorBusy?'disabled':''}>${state.addCreatorBusy?'Adding…':'Add exact input'}</button>`:''}</div>${state.libraryError?`<div class="library-error">${escapeHtml(state.libraryError)}</div>`:''}</div></div>`:'';
    let preview='';
    if(state.previewVideo){
      const p=state.previewVideo;const host=location.hostname||'localhost';let src='';let label='Preview';
      if(p.kind==='youtube'){src=`https://www.youtube.com/embed/${encodeURIComponent(p.id)}?autoplay=1&rel=0`;label='YouTube preview'}
      if(p.kind==='twitch-vod'){src=`https://player.twitch.tv/?video=v${encodeURIComponent(p.id)}&parent=${encodeURIComponent(host)}&autoplay=true`;label='Twitch VOD preview'}
      if(p.kind==='twitch-clip'){src=`https://clips.twitch.tv/embed?clip=${encodeURIComponent(p.id)}&parent=${encodeURIComponent(host)}&autoplay=true`;label='Twitch clip preview'}
      preview=`<div class="modal-backdrop video-preview-backdrop" id="videoPreviewBackdrop"><div class="card video-preview-modal"><button class="modal-close" id="closeVideoPreview">×</button><div class="eyebrow">${label}</div><h2>${escapeHtml(p.title||'Video preview')}</h2><div class="video-embed-wrap"><iframe src="${src}" title="${escapeHtml(p.title||'Video preview')}" frameborder="0" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe></div><div class="preview-modal-footer"><span>Playback availability depends on the creator and platform embed settings.</span><a class="btn secondary" href="${escapeHtml(p.url||'#')}" target="_blank" rel="noreferrer">Open on ${p.kind==='youtube'?'YouTube':'Twitch'} ↗</a></div></div></div>`;
    }
    let livePlayer='';
    if(state.livePlayer){
      const p=state.livePlayer;
      const channel=String(p.channel||'').replace(/[^a-zA-Z0-9_]/g,'');
      const twitchUrl=`https://www.twitch.tv/${encodeURIComponent(channel)}`;
      livePlayer=`<div class="modal-backdrop twitch-live-backdrop" id="twitchLiveBackdrop"><div class="card twitch-live-modal" role="dialog" aria-modal="true" aria-labelledby="twitchLiveTitle"><div class="twitch-live-head"><div class="twitch-live-status"><span class="live-pulse"></span><div><div class="eyebrow">LIVE ON TWITCH</div><h2 id="twitchLiveTitle">${escapeHtml(p.name||channel)}</h2><p>${escapeHtml(p.title||'Live stream')}</p></div></div><div class="twitch-live-actions"><span class="twitch-live-meta">${formatCount(p.viewers||0)} viewers · ${escapeHtml(p.game||'Twitch')}</span><a class="btn secondary" href="${escapeHtml(p.url||twitchUrl)}" target="_blank" rel="noreferrer">Open on Twitch ↗</a><button class="modal-close twitch-live-close" id="closeTwitchLive" type="button" aria-label="Close live player">×</button></div></div><div class="twitch-live-stage"><div class="twitch-live-loading" id="twitchLiveLoading"><span class="preview-spinner">↻</span><strong>Opening live stream…</strong><small>Loading Twitch securely inside ClipBoost.</small></div><webview id="twitchLiveWebview" class="twitch-live-webview" src="${twitchUrl}" partition="persist:clipboost-twitch" webpreferences="contextIsolation=yes,nodeIntegration=no,sandbox=yes" aria-label="${escapeHtml((p.name||channel)+' Twitch live')}"></webview></div><div class="twitch-live-footer"><span>Playback runs in an isolated Twitch web session. Closing this popup stops the stream.</span><button class="btn secondary" type="button" id="reloadTwitchLive">↻ Reload player</button></div></div></div>`;
    }
    const selectedCreator=creators.find(c=>c.id===state.libraryCreatorFilter);
    const creatorFilter=`${selectedCreator?`<button type="button" class="active-creator-filter" id="clearCreatorFilter">${creatorAvatarMarkup(selectedCreator,'filter-avatar')}<span>${escapeHtml(selectedCreator.name)}</span><b>×</b></button>`:''}<select id="libraryCreatorFilter" class="library-select"><option value="all">All ${platform==='youtube'?'creators':'streamers'}</option>${creators.map(c=>`<option value="${escapeHtml(c.id)}" ${state.libraryCreatorFilter===c.id?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}</select>`;
    const sortSelect=section==='live'?'':`<select id="librarySort" class="library-select"><option value="newest" ${state.librarySort==='newest'?'selected':''}>Newest → Oldest</option><option value="oldest" ${state.librarySort==='oldest'?'selected':''}>Oldest → Newest</option><option value="views-desc" ${state.librarySort==='views-desc'?'selected':''}>Most viewed</option><option value="views-asc" ${state.librarySort==='views-asc'?'selected':''}>Least viewed</option></select>`;
    const subTabs=platform==='youtube'?`<button class="tab ${section==='videos'?'active':''}" data-library-section="videos">Long videos</button><button class="tab ${section==='shorts'?'active':''}" data-library-section="shorts">Shorts</button><button class="tab ${section==='saved'?'active':''}" data-library-section="saved">Saved</button>`:`<button class="tab ${section==='vods'?'active':''}" data-library-section="vods">VODs</button><button class="tab ${section==='clips'?'active':''}" data-library-section="clips">Clips</button><button class="tab ${section==='live'?'active':''}" data-library-section="live">Live</button>`;
    const cutoff3m=new Date();cutoff3m.setUTCMonth(cutoff3m.getUTCMonth()-3);
    const loadedYoutube=platform==='youtube'?filteredCreators.reduce((sum,c)=>sum+(c.videos||[]).filter(v=>state.youtubeHistoryExpanded||new Date(v.publishedAt||0)>=cutoff3m).length,0):0;
    const knownYoutubeTotal=platform==='youtube'?filteredCreators.reduce((sum,c)=>sum+Number(c.videoCount||0),0):0;
    // Old library records may not have a saved page token. Treat those as
    // loadable whenever YouTube reports more uploads than we currently have;
    // the backend will initialize pagination automatically on the first click.
    const historyCreators=platform==='youtube'&&section!=='saved'?filteredCreators.filter(c=>Boolean(c.youtubeNextPageToken)||Number(c.videoCount||0)>(c.videos||[]).length):[];
    const historyLabel=historyCreators.length===1&&filteredCreators.length===1?`Load older videos from ${escapeHtml(filteredCreators[0].name)}`:`Load older videos`;
    const historyFooter=platform==='youtube'&&section!=='saved'&&filteredCreators.length?`<div class="library-history-footer"><div><strong>${state.youtubeHistoryExpanded?`${loadedYoutube} uploads loaded`:`Last 3 months · ${loadedYoutube} uploads`}</strong><small>${state.youtubeHistoryExpanded?'Older history is loaded progressively, 50 uploads at a time.':'Showing recent uploads only. Load older videos when you need more history.'}</small></div>${historyCreators.length?`<button class="btn primary" id="loadMoreYoutube" ${state.libraryLoadMoreBusy?'disabled':''}>${state.libraryLoadMoreBusy?'Loading older videos…':historyLabel}</button>`:`<span class="history-complete">✓ All available uploads loaded</span>`}</div>`:'';
    return `<div class="content"><div class="page-title"><div><div class="eyebrow">Auto-ingestion</div><h1>Library</h1><p>Keep YouTube uploads and Twitch VODs, clips and live streams separated and easy to browse.</p></div><div class="library-head-actions">${status}<button class="btn secondary" id="refreshLibrary" ${!creators.length||state.libraryRefreshBusy?'disabled':''}>${state.libraryRefreshBusy?'↻ Refreshing…':`↻ Refresh ${platform==='youtube'?'YouTube':'Twitch'}`}</button><button class="btn primary" id="addCreator">+ Add creator</button></div></div>${state.libraryError&&!state.addCreatorOpen?`<div class="library-banner error">${escapeHtml(state.libraryError)}</div>`:state.libraryRefreshMessage?`<div class="library-banner success">${escapeHtml(state.libraryRefreshMessage)}</div>`:''}<div class="library-platform-tabs"><button data-library-platform="youtube" class="${platform==='youtube'?'active':''}">▶ YouTube <span>${allCreators.filter(c=>c.platform==='youtube').length}</span></button><button data-library-platform="twitch" class="${platform==='twitch'?'active':''}">▣ Twitch <span>${allCreators.filter(c=>c.platform==='twitch').length}</span></button></div><section class="card library-card"><div class="section-head"><h3>Following on ${platform==='youtube'?'YouTube':'Twitch'}</h3><span class="muted">${creators.length} ${platform==='youtube'?'creator':'streamer'}${creators.length===1?'':'s'}</span></div><div class="creator-row">${state.libraryLoading&&!state.libraryLoaded?'<div class="library-loading">Loading library…</div>':creatorsHtml}</div></section><div class="library-toolbar"><div class="tabs library-tabs">${subTabs}</div><div class="library-filters">${creatorFilter}${sortSelect}</div></div><section class="card library-card yt-vod-list">${state.libraryLoading&&!state.libraryLoaded?'<div class="library-loading big">Fetching your library…</div>':mediaHtml}${historyFooter}</section>${modal}${preview}${livePlayer}</div>`;
  }
  function escapeHtml(value=''){return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function creatorAvatarMarkup(c,size='normal'){const name=(c&&c.name)||'Creator';const initial=escapeHtml(String(name).trim().charAt(0).toUpperCase()||'?');const src=escapeHtml((c&&c.avatar)||'');const img=src?'<img src="'+src+'" alt="'+escapeHtml(name)+'" referrerpolicy="no-referrer" loading="lazy" onerror="this.style.display=\'none\'">':'';return '<div class="creator-avatar-fallback '+escapeHtml(size)+'"><span>'+initial+'</span>'+img+'</div>';}
  async function pollProjectUntilSettled(id){
    clearTimeout(window.__clipboostProjectPoll);
    try{
      const r=await fetch(`/api/videos/${encodeURIComponent(id)}`);
      const data=await readJsonResponse(r,'Could not refresh project');
      state.video=data;render();
      if(['ingesting','analyzing'].includes(data.status)){
        window.__clipboostProjectPoll=setTimeout(()=>pollProjectUntilSettled(id),1500);
      }else if(data.status==='ready'){
        state.selectedCandidate=0;state.projects=null;render();
      }
    }catch(e){console.warn(e);window.__clipboostProjectPoll=setTimeout(()=>pollProjectUntilSettled(id),2500)}
  }
  async function startProjectIngestion(id){
    try{
      const r=await fetch(`/api/projects/${encodeURIComponent(id)}/ingest`,{method:'POST'});
      const data=await readJsonResponse(r,'Automatic ingestion could not start');
      state.video=data;render();pollProjectUntilSettled(id);
    }catch(e){
      if(state.video){state.video={...state.video,ingestion:{...(state.video.ingestion||{}),error:e.message||'Automatic ingestion failed'}}}
      render();
    }
  }
  async function sendLibraryItemToStudio(platform,creatorId,mediaType,mediaId){
    if(state.projectBusy)return;state.projectBusy=true;state.libraryError='';render();
    try{
      const r=await fetch('/api/projects/from-library',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({platform,creatorId,mediaType,mediaId})});
      const data=await readJsonResponse(r,'Could not create AI Studio project');
      state.video=data;state.selectedCandidate=0;state.uploadStatus='idle';state.uploadProgress=0;state.projects=null;try{localStorage.setItem('clipboost:lastProjectId',data.id)}catch{} navigate('studio');
      startProjectIngestion(data.id);
    }catch(e){state.libraryError=e.message||'Could not send source to AI Studio';render()}finally{state.projectBusy=false}
  }
  async function loadProjects(){
    if(state.projectsLoading)return;state.projectsLoading=true;
    try{const r=await fetch('/api/projects');state.projects=await readJsonResponse(r,'Could not load projects')}catch(e){state.projects=[]}finally{state.projectsLoading=false;render()}
  }
  async function openProject(id){
    try{const r=await fetch(`/api/videos/${encodeURIComponent(id)}`);state.video=await readJsonResponse(r,'Could not open project');state.selectedCandidate=0;try{localStorage.setItem('clipboost:lastProjectId',id)}catch{}navigate('studio');if(['ingesting','analyzing'].includes(state.video?.status))pollProjectUntilSettled(id)}catch(e){showNotice({kind:'danger',title:'Could not open project',message:e.message||'Could not open project'})}
  }
  async function restoreLastStudioProject(){
    if(state.page!=='studio'||state.video||state.restoringProject)return;
    let id='';try{id=localStorage.getItem('clipboost:lastProjectId')||''}catch{}
    if(!id)return;
    state.restoringProject=true;
    try{
      const r=await fetch(`/api/videos/${encodeURIComponent(id)}`);
      state.video=await readJsonResponse(r,'Could not restore project');
      state.selectedCandidate=0;
      render();
      if(['ingesting','analyzing'].includes(state.video?.status))pollProjectUntilSettled(id);
    }catch(e){try{localStorage.removeItem('clipboost:lastProjectId')}catch{}}
    finally{state.restoringProject=false}
  }
  async function readJsonResponse(response, fallbackMessage='Request failed'){
    const text=await response.text();
    let data={};
    if(text){
      try{data=JSON.parse(text)}catch(_){
        throw new Error(`${fallbackMessage} (server returned an invalid response, HTTP ${response.status})`);
      }
    }
    if(!response.ok)throw new Error(data?.error||`${fallbackMessage} (HTTP ${response.status})`);
    return data;
  }
  async function refreshTwitchLive({silent=false}={}){
    if(state.libraryPlatform!=='twitch')return;
    if(state.twitchLiveRefreshing)return;
    state.twitchLiveRefreshing=true;
    if(!silent){state.libraryError='';render()}
    try{
      const r=await fetch('/api/library/twitch/live',{method:'POST'});
      const data=await readJsonResponse(r,'Could not refresh Twitch live status');
      if(data?.library)state.library=data.library;
      state.twitchLiveLastRefresh=Date.now();
    }catch(e){
      if(!silent)state.libraryError=e.message||'Could not refresh Twitch live status';
    }finally{
      state.twitchLiveRefreshing=false;
      render();
    }
  }
  function scheduleTwitchLiveRefresh(){
    clearTimeout(window.__clipboostTwitchLiveRefresh);
    if(state.page!=='library'||state.libraryPlatform!=='twitch'||state.librarySection!=='live')return;
    const age=Date.now()-Number(state.twitchLiveLastRefresh||0);
    if(age>20000)setTimeout(()=>refreshTwitchLive({silent:true}),80);
    window.__clipboostTwitchLiveRefresh=setTimeout(async()=>{
      await refreshTwitchLive({silent:true});
      scheduleTwitchLiveRefresh();
    },60000);
  }
  async function loadLibrary(){if(state.libraryLoading)return;state.libraryLoading=true;state.libraryError='';render();try{const [lib,status]=await Promise.all([fetch('/api/library/creators'),fetch('/api/integrations/status')]);const data=await readJsonResponse(lib,'Could not load library');const st=await readJsonResponse(status,'Could not read integration status');state.library=data;state.youtubeConfigured=Boolean(st?.youtube?.configured);state.twitchConfigured=Boolean(st?.twitch?.configured);state.libraryLoaded=true;}catch(e){state.libraryError=e.message||'Could not load library';state.libraryLoaded=true;}finally{state.libraryLoading=false;render()}}
  async function addCreatorByPlatform(input){const platform=state.creatorPlatform||state.libraryPlatform||'youtube';state.addCreatorBusy=true;state.libraryError='';render();try{const r=await fetch(`/api/library/${platform}/creator`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({input})});const data=await readJsonResponse(r,'Could not add creator');state.library=data.library;state.libraryLoaded=true;state.addCreatorOpen=false;state.libraryPlatform=platform;state.librarySection=platform==='youtube'?'videos':'vods';}catch(e){state.libraryError=e.message||'Could not add creator'}finally{state.addCreatorBusy=false;render()}}
  async function searchCreators(query){
    const platform=state.creatorPlatform||'youtube';const q=String(query||'').trim();state.creatorQuery=q;state.libraryError='';
    if(q.length<2){state.creatorSearchResults=[];state.creatorSearchLoading=false;render();return}
    state.creatorSearchLoading=true;render();
    try{const r=await fetch(`/api/library/${platform}/search?q=${encodeURIComponent(q)}`);const data=await readJsonResponse(r,'Search failed');state.creatorSearchResults=data.results||[]}
    catch(e){state.libraryError=e.message||'Search failed';state.creatorSearchResults=[]}
    finally{state.creatorSearchLoading=false;render();setTimeout(()=>{const el=document.getElementById('creatorInput');if(el){el.focus();el.setSelectionRange(el.value.length,el.value.length)}},0)}
  }
  async function removeCreator(platform,id,name){
    const label=name||'this creator';
    const ok=await confirmAction({kind:'danger',eyebrow:'Library',title:`Remove ${label}?`,message:'This creator and the videos currently loaded from them will disappear from your Library.',detail:'You can add the creator again later. Existing AI Studio projects are not deleted.',confirmLabel:'Remove creator'});
    if(!ok)return;
    state.libraryError='';
    try{const r=await fetch(`/api/library/creators/${encodeURIComponent(platform)}/${encodeURIComponent(id)}`,{method:'DELETE'});const data=await readJsonResponse(r,'Could not remove creator');state.library=data;state.libraryLoaded=true;showNotice({kind:'success',eyebrow:'Library',title:'Creator removed',message:`${label} was removed from your Library.`})}
    catch(e){state.libraryError=e.message||'Could not remove creator';showNotice({kind:'danger',title:'Could not remove creator',message:state.libraryError})}finally{render()}
  }
  async function refreshCurrentLibrary(){
    const platform=state.libraryPlatform||'youtube';
    if(state.libraryRefreshBusy)return;
    const creators=(state.library?.creators||[]).filter(x=>x.platform===platform);
    if(!creators.length){state.libraryRefreshMessage=`No ${platform==='youtube'?'YouTube creators':'Twitch streamers'} to refresh.`;render();return}
    if(platform==='youtube')state.youtubeHistoryExpanded=false;
    state.libraryRefreshBusy=true;state.libraryError='';state.libraryRefreshMessage=`Refreshing ${platform==='youtube'?'YouTube':'Twitch'}…`;render();
    try{
      const r=await fetch(`/api/library/${platform}/refresh-all`,{method:'POST'});
      const data=await readJsonResponse(r,`Could not refresh ${platform}`);
      state.library=data.library;state.libraryLoaded=true;
      const failed=Array.isArray(data.errors)?data.errors.length:0;
      if(failed&&Number(data.refreshed||0)===0){state.libraryError=data.errors?.[0]?.error||'Refresh failed';state.libraryRefreshMessage=''}
      else state.libraryRefreshMessage=failed?`Refreshed ${data.refreshed||0} · ${failed} failed`:`Refreshed ${data.refreshed||creators.length} ${platform==='youtube'?'creator':'streamer'}${(data.refreshed||creators.length)===1?'':'s'} just now`;
    }catch(e){state.libraryError=e.message||'Refresh failed';state.libraryRefreshMessage=''}
    finally{state.libraryRefreshBusy=false;render()}
  }
  async function loadMoreYoutubeHistory(){
    if(state.libraryLoadMoreBusy)return;
    const creators=(state.library?.creators||[]).filter(c=>c.platform==='youtube'&&(state.libraryCreatorFilter==='all'||c.id===state.libraryCreatorFilter)&&(Boolean(c.youtubeNextPageToken)||Number(c.videoCount||0)>(c.videos||[]).length));
    if(!creators.length)return;
    state.libraryLoadMoreBusy=true;state.libraryError='';state.youtubeHistoryExpanded=true;render();
    try{
      for(const c of creators){
        const r=await fetch(`/api/library/youtube/load-more/${encodeURIComponent(c.id)}`,{method:'POST'});
        const data=await readJsonResponse(r,`Could not load older videos for ${c.name}`);state.library=data.library;
      }
      state.libraryLoaded=true;
    }catch(e){state.libraryError=e.message||'Could not load older YouTube videos'}
    finally{state.libraryLoadMoreBusy=false;render()}
  }
  function minichart(seed){return `<svg class="mini-chart" viewBox="0 0 90 28"><polyline points="${Array.from({length:8},(_,i)=>`${i*12},${24-((i*7+seed*5)%20)}`).join(' ')}"/></svg>`}
  function trends(){return `<div class="content"><div class="page-title"><div><div class="eyebrow">Trend intelligence</div><h1>Trends</h1><p>Track the topics, clips, creators and sounds gaining momentum.</p></div><button class="btn secondary">◉ Live monitoring</button></div><div class="tabs trend-tabs"><button class="tab active">Topics</button><button class="tab">Viral clips</button><button class="tab">Creators</button><button class="tab">Sounds</button><button class="tab">Hashtags</button></div><div class="trend-grid"><section class="card topics"><div class="section-head"><h3>Trending topics</h3><span class="muted">Real time</span></div>${topics.map((t,i)=>`<div class="trend-row"><span class="rank">${i+1}</span><span class="topicball">${t[0][0]}</span><div class="grow"><strong>${t[0]}</strong><small>${t[1]}</small></div>${minichart(i)}</div>`).join('')}</section><section class="card trend-clips"><div class="section-head"><h3>Clips gaining traction</h3><span class="muted">Velocity</span></div>${['1.2M views','960K views','740K views','680K views'].map((v,i)=>`<div class="trend-row"><span class="rank">${i+1}</span><div class="trend-thumb">${avatar(colors[i%5],'sm')}</div><div class="grow"><strong>${v}</strong><small>+${14-i*2}K/h</small></div><span>♡</span></div>`).join('')}</section><section class="card sounds"><h3>Trending sounds</h3>${['Original sound','No way','Gaming vibe','The moment'].map((s,i)=>`<div class="trend-row"><span class="rank">${i+1}</span><span class="topicball">♪</span><div class="grow"><strong>${s}</strong><small>${480-i*72}K uses</small></div><span>▶</span></div>`).join('')}</section><section class="card hashtags"><h3>Trending hashtags</h3>${[['#gta6','2.4M videos'],['#twitchfr','1.8M videos'],['#valorant','1.2M videos'],['#gaming','980K videos']].map((s,i)=>`<div class="trend-row"><span class="topicball">#</span><div class="grow"><strong>${s[0]}</strong><small>${s[1]}</small></div>${minichart(i+4)}</div>`).join('')}</section></div></div>`}
  function projects(){
    const list=Array.isArray(state.projects)?state.projects:[];
    const rows=list.length?list.map((p,i)=>`<div class="project-row"><div class="project-source-thumb">${p.externalSource?.thumbnail?`<img src="${escapeHtml(p.externalSource.thumbnail)}" alt="">`:mediaThumb(i)}</div><div><strong>${escapeHtml(p.originalName||'Untitled project')}</strong><div class="muted">${escapeHtml(p.externalSource?.creatorName||'Local upload')} · ${relativeDate(p.createdAt)}</div></div><div class="project-progress"><div class="progress"><i style="width:${p.status==='ready'?100:p.status==='linked'?15:55}%"></i></div><span>${p.status==='ready'?'Ready':p.status==='linked'?'Linked':'Processing'}</span></div><span class="status ${p.status==='ready'?'done':''}">${p.status==='linked'?'Needs source file':p.status==='ready'?'Ready':'In progress'}</span><div class="project-row-actions"><button class="btn secondary" data-open-project="${escapeHtml(p.id)}">Open</button><button class="icon-btn project-delete-btn" type="button" data-delete-project="${escapeHtml(p.id)}" data-delete-project-name="${escapeHtml(p.originalName||'Untitled project')}" title="Delete project">×</button></div></div>`).join(''):`<div class="projects-empty"><b>No real projects yet</b><span>Send a YouTube video or Twitch VOD from Library to AI Studio.</span><button class="btn primary" data-page="library">Open Library</button></div>`;
    return `<div class="content"><div class="page-title"><div><div class="eyebrow">Workflow</div><h1>My projects</h1><p>Sources sent from your Library appear here automatically.</p></div><button class="btn primary" data-page="library">+ From Library</button></div><section class="card projects">${state.projectsLoading?'<div class="projects-empty">Loading projects…</div>':rows}</section></div>`
  }

  async function removeProject(id,name){
    const label=name||'this project';
    const ok=await confirmAction({kind:'danger',eyebrow:'Projects',title:`Delete ${label}?`,message:'This removes the project, its local source file, cached transcript and generated previews from ClipBoost.',detail:'Previously exported MP4 files are kept in your exports folder.',confirmLabel:'Delete project'});
    if(!ok)return;
    try{
      const r=await fetch(`/api/projects/${encodeURIComponent(id)}`,{method:'DELETE'});
      await readJsonResponse(r,'Could not delete project');
      if(state.video?.id===id)state.video=null;
      try{if(localStorage.getItem('clipboost:lastProjectId')===id)localStorage.removeItem('clipboost:lastProjectId')}catch{}
      state.projects=null;await loadProjects();
      showNotice({kind:'success',eyebrow:'Projects',title:'Project deleted',message:`${label} was removed from ClipBoost.`});
    }catch(e){showNotice({kind:'danger',eyebrow:'Projects',title:'Could not delete project',message:e.message||'Could not delete project'})}
  }
  async function loadSettings(){
    if(state.settingsLoading)return;state.settingsLoading=true;
    try{
      const r=await fetch('/api/settings');const data=await readJsonResponse(r,'Could not load settings');
      state.settings=data.values||{};
      if(window.clipboostDesktop?.getSettings){try{state.desktopSettings=await window.clipboostDesktop.getSettings()}catch{}}
    }catch(e){state.settingsMessage=e.message||'Could not load settings'}
    finally{state.settingsLoading=false;render()}
  }
  async function loadSystemHealth(){
    if(state.systemHealthLoading)return;state.systemHealthLoading=true;render();
    try{const r=await fetch('/api/system/health');state.systemHealth=await readJsonResponse(r,'Could not run system check')}catch(e){state.systemHealth={error:e.message||'System check failed'}}
    finally{state.systemHealthLoading=false;render()}
  }
  function healthItem(label,item){const ok=Boolean(item?.ok);return `<div class="health-item ${ok?'ok':'bad'}"><span class="health-dot">${ok?'✓':'!'}</span><div><strong>${label}</strong><small>${escapeHtml(item?.detail||'Not checked')}</small></div></div>`}
  function settings(){
    const s=state.settings||{};const d=state.desktopSettings||{};
    const checked=v=>v?'checked':'';
    const option=(value,label,current)=>`<option value="${value}" ${String(current)===String(value)?'selected':''}>${label}</option>`;
    return `<div class="content settings-page"><div class="page-title"><div><div class="eyebrow">Desktop configuration</div><h1>Settings</h1><p>Manage integrations, local AI processing, exports and Windows behavior.</p></div><div class="settings-actions"><button class="btn secondary" id="openConfigBtn">Open .env</button><button class="btn primary" id="saveSettingsBtn" ${state.settingsSaving?'disabled':''}>${state.settingsSaving?'Saving…':'Save settings'}</button></div></div>
    ${state.settingsMessage?`<div class="settings-banner">${escapeHtml(state.settingsMessage)}</div>`:''}
    <div class="settings-grid">
      <section class="card settings-card"><div class="section-head"><div><div class="eyebrow">Integrations</div><h3>YouTube & Twitch</h3></div></div>
        <label class="field"><span>YouTube API key</span><input id="setYoutubeKey" value="${escapeHtml(s.YOUTUBE_API_KEY||'')}" placeholder="API key"></label>
        <label class="field"><span>Twitch Client ID</span><input id="setTwitchId" value="${escapeHtml(s.TWITCH_CLIENT_ID||'')}" placeholder="Client ID"></label>
        <label class="field"><span>Twitch Client Secret</span><input id="setTwitchSecret" type="password" value="${escapeHtml(s.TWITCH_CLIENT_SECRET||'')}" placeholder="Client Secret"></label>
        <small class="settings-note">Secret values are masked. Leave a masked value unchanged to keep the existing secret.</small>
      </section>
      <section class="card settings-card"><div class="section-head"><div><div class="eyebrow">Local AI</div><h3>Whisper processing</h3></div></div>
        <div class="settings-two"><label class="field"><span>Whisper model</span><select id="setWhisperModel">${option('tiny','Tiny',s.LOCAL_WHISPER_MODEL)}${option('base','Base',s.LOCAL_WHISPER_MODEL)}${option('small','Small',s.LOCAL_WHISPER_MODEL)}${option('medium','Medium',s.LOCAL_WHISPER_MODEL)}</select></label>
        <label class="field"><span>Workers</span><select id="setWorkers">${[1,2,3,4].map(v=>option(v,String(v),s.LOCAL_WHISPER_WORKERS)).join('')}</select></label></div>
        <div class="settings-two"><label class="field"><span>Chunk size</span><select id="setChunkSeconds">${option(60,'60 seconds',s.LOCAL_WHISPER_CHUNK_SECONDS)}${option(120,'120 seconds',s.LOCAL_WHISPER_CHUNK_SECONDS)}${option(180,'180 seconds',s.LOCAL_WHISPER_CHUNK_SECONDS)}${option(300,'300 seconds',s.LOCAL_WHISPER_CHUNK_SECONDS)}</select></label>
        <label class="field"><span>Compute type</span><select id="setComputeType">${option('int8','int8',s.LOCAL_WHISPER_COMPUTE_TYPE)}${option('float32','float32',s.LOCAL_WHISPER_COMPUTE_TYPE)}</select></label></div>
        <label class="switch-row"><span><strong>Skip long silences</strong><small>Reduces unnecessary transcription work.</small></span><input id="setSkipSilence" type="checkbox" ${checked(s.LOCAL_WHISPER_SKIP_SILENCE!==false)}></label>
      </section>
      <section class="card settings-card"><div class="section-head"><div><div class="eyebrow">Analysis</div><h3>Ollama</h3></div></div>
        <label class="field"><span>Ollama URL</span><input id="setOllamaUrl" value="${escapeHtml(s.OLLAMA_URL||'http://127.0.0.1:11434')}"></label>
        <label class="field"><span>Model</span><input id="setOllamaModel" value="${escapeHtml(s.OLLAMA_MODEL||'qwen2.5:3b')}"></label>
        <label class="field"><span>Python command</span><input id="setPythonBin" value="${escapeHtml(s.PYTHON_BIN||'python')}"></label>
      </section>
      <section class="card settings-card"><div class="section-head"><div><div class="eyebrow">Files</div><h3>Exports</h3></div></div>
        <label class="field"><span>Export folder</span><input id="setExportDir" value="${escapeHtml(s.CLIPBOOST_EXPORT_DIR||'')}"></label>
        <div class="settings-inline"><button class="btn secondary" id="openExportsBtn">Open exports folder</button><button class="btn secondary" id="openDataBtn">Open data folder</button></div>
        <small class="settings-note">Changing the export folder takes effect after restarting ClipBoost.</small>
      </section>
      <section class="card settings-card"><div class="section-head"><div><div class="eyebrow">Desktop</div><h3>Windows behavior</h3></div></div>
        <label class="switch-row"><span><strong>Start ClipBoost with Windows</strong><small>Launch automatically after sign-in.</small></span><input id="setStartWindows" type="checkbox" ${checked(d.startWithWindows)} ${window.clipboostDesktop?'':'disabled'}></label>
        <label class="switch-row"><span><strong>Close to system tray</strong><small>Keep background processing alive when closing the window.</small></span><input id="setCloseTray" type="checkbox" ${checked(d.closeToTray!==false)} ${window.clipboostDesktop?'':'disabled'}></label>
      </section>
      <section class="card settings-card"><div class="section-head"><div><div class="eyebrow">Updates</div><h3>ClipBoost updates</h3></div><span class="muted">v${escapeHtml(d.version||'web')}</span></div>
        <label class="switch-row"><span><strong>Check on startup</strong><small>Look for new releases when ClipBoost opens.</small></span><input id="setCheckUpdates" type="checkbox" ${checked(d.checkUpdatesOnStartup!==false)} ${window.clipboostDesktop?'':'disabled'}></label>
        <label class="switch-row"><span><strong>Download automatically</strong><small>Download updates in the background.</small></span><input id="setAutoDownload" type="checkbox" ${checked(d.autoDownloadUpdates!==false)} ${window.clipboostDesktop?'':'disabled'}></label>
        <div class="settings-inline"><button class="btn secondary" id="checkUpdatesBtn" ${window.clipboostDesktop?'':'disabled'}>Check for updates</button><button class="btn secondary" id="restartAppBtn" ${window.clipboostDesktop?'':'disabled'}>Restart ClipBoost</button></div>
        <div class="settings-two"><label class="field"><span>GitHub owner</span><input id="setUpdateOwner" value="${escapeHtml(s.CLIPBOOST_UPDATE_OWNER||'')}"></label><label class="field"><span>Repository</span><input id="setUpdateRepo" value="${escapeHtml(s.CLIPBOOST_UPDATE_REPO||'')}"></label></div>
      </section>
      <section class="card settings-card settings-health"><div class="section-head"><div><div class="eyebrow">Diagnostics</div><h3>System health</h3></div><button class="btn secondary compact-btn" id="runHealthCheckBtn" ${state.systemHealthLoading?'disabled':''}>${state.systemHealthLoading?'Checking…':'Run check'}</button></div>
        ${state.systemHealth?`<div class="health-grid">${healthItem('FFmpeg',state.systemHealth.ffmpeg)}${healthItem('FFprobe',state.systemHealth.ffprobe)}${healthItem('Python',state.systemHealth.python)}${healthItem('Face tracking',state.systemHealth.tracking)}${healthItem('Ollama',state.systemHealth.ollama)}${healthItem('YouTube API',state.systemHealth.youtube)}${healthItem('Twitch API',state.systemHealth.twitch)}</div>${state.systemHealth.paths?`<div class="health-paths"><span>Data</span><code>${escapeHtml(state.systemHealth.paths.data||'')}</code><span>Exports</span><code>${escapeHtml(state.systemHealth.paths.exports||'')}</code></div>`:''}`:`<div class="health-empty">Run a quick diagnostic to verify the tools ClipBoost needs for local processing.</div>`}
      </section>
    </div></div>`;
  }
  async function saveSettings(){
    if(state.settingsSaving)return;
    const payload={
      YOUTUBE_API_KEY:document.getElementById('setYoutubeKey')?.value||state.settings?.YOUTUBE_API_KEY||'',
      TWITCH_CLIENT_ID:document.getElementById('setTwitchId')?.value||state.settings?.TWITCH_CLIENT_ID||'',
      TWITCH_CLIENT_SECRET:document.getElementById('setTwitchSecret')?.value||state.settings?.TWITCH_CLIENT_SECRET||'',
      PYTHON_BIN:document.getElementById('setPythonBin')?.value||'python',LOCAL_WHISPER_MODEL:document.getElementById('setWhisperModel')?.value||'small',
      LOCAL_WHISPER_DEVICE:'cpu',LOCAL_WHISPER_COMPUTE_TYPE:document.getElementById('setComputeType')?.value||'int8',LOCAL_WHISPER_CHUNK_SECONDS:document.getElementById('setChunkSeconds')?.value||'120',LOCAL_WHISPER_WORKERS:document.getElementById('setWorkers')?.value||'2',
      LOCAL_WHISPER_SKIP_SILENCE:Boolean(document.getElementById('setSkipSilence')?.checked),OLLAMA_URL:document.getElementById('setOllamaUrl')?.value||'http://127.0.0.1:11434',OLLAMA_MODEL:document.getElementById('setOllamaModel')?.value||'qwen2.5:3b',CLIPBOOST_EXPORT_DIR:document.getElementById('setExportDir')?.value||'',CLIPBOOST_UPDATE_OWNER:document.getElementById('setUpdateOwner')?.value||'',CLIPBOOST_UPDATE_REPO:document.getElementById('setUpdateRepo')?.value||''
    };
    const desktopPayload={startWithWindows:Boolean(document.getElementById('setStartWindows')?.checked),closeToTray:Boolean(document.getElementById('setCloseTray')?.checked),checkUpdatesOnStartup:Boolean(document.getElementById('setCheckUpdates')?.checked),autoDownloadUpdates:Boolean(document.getElementById('setAutoDownload')?.checked)};
    state.settingsSaving=true;state.settingsMessage='Saving settings…';render();
    try{
      const r=await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await readJsonResponse(r,'Could not save settings');
      if(window.clipboostDesktop?.saveSettings){state.desktopSettings=(await window.clipboostDesktop.saveSettings(desktopPayload)).settings}
      state.settingsMessage=data.restartRecommended?'Saved. Restart ClipBoost to apply all changes.':'Settings saved.';state.settings=null;await loadSettings();
    }catch(e){state.settingsMessage=e.message||'Could not save settings'}finally{state.settingsSaving=false;render()}
  }

  async function prepareCandidatePreview(index,{autoplay=false,force=false}={}){
    const v=state.video,cand=v?.candidates?.[index];if(!v?.id||!cand||!v?.sourceUrl)return;
    if(state.candidatePreviewLoading&&state.candidatePreviewLoadingIndex===index&&!force)return;
    if(cand.previewUrl&&!force){state.candidatePreviewAutoplay=autoplay;render();return;}
    const requestId=++state.candidatePreviewRequestId;
    state.candidatePreviewLoading=true;state.candidatePreviewLoadingIndex=index;state.candidatePreviewError='';state.candidatePreviewAutoplay=false;render();
    try{
      const r=await fetch(`/api/videos/${encodeURIComponent(v.id)}/preview`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({index,start:cand.start,end:cand.end,options:currentRenderOptions()})});
      const data=await readJsonResponse(r,'Could not prepare clip preview');
      if(requestId!==state.candidatePreviewRequestId)return;
      cand.previewUrl=data.url;cand.previewEdited=Boolean(data.edited);cand.previewMeta=data.render||null;state.candidatePreviewLoading=false;state.candidatePreviewError='';state.candidatePreviewAutoplay=autoplay;render();
    }catch(e){
      if(requestId!==state.candidatePreviewRequestId)return;
      state.candidatePreviewLoading=false;state.candidatePreviewError=e.message||'Could not prepare preview';render();
    }
  }
  function selectCandidatePreview(index,{autoplay=true}={}){
    const candidates=state.video?.candidates||[];if(!candidates[index])return;
    state.selectedCandidate=index;state.timelineSeek=Number(candidates[index].start||0);state.candidatePreviewError='';
    if(candidates[index].previewUrl){state.candidatePreviewAutoplay=autoplay;render();}
    else prepareCandidatePreview(index,{autoplay});
  }

  function render(){const pages={home,studio,analytics,library,trends,projects,settings};document.getElementById('app').innerHTML=`<div class="app">${side()}<main class="main">${top()}${pages[state.page]()}</main></div>${modalMarkup()}`;bind()}
  function bind(){
    const modalConfirm=document.getElementById('cbModalConfirm');if(modalConfirm)modalConfirm.onclick=()=>finishModal(true);
    const modalCancel=document.getElementById('cbModalCancel');if(modalCancel)modalCancel.onclick=()=>finishModal(false);
    const modalBackdrop=document.getElementById('cbModalBackdrop');if(modalBackdrop)modalBackdrop.onclick=e=>{if(e.target===modalBackdrop&&state.uiModal?.mode==='confirm')finishModal(false)};

    document.querySelectorAll('[data-page]').forEach(el=>el.addEventListener('click',()=>navigate(el.dataset.page)));
    const m=document.getElementById('menu');if(m)m.onclick=()=>document.getElementById('sidebar').classList.toggle('open');
    const updateCenter=document.getElementById('updateCenterBtn');if(updateCenter)updateCenter.onclick=async()=>{const u=state.desktopUpdate||{};if(u.status==='ready'){await promptReadyUpdate(u.version,{force:true});}else if(u.status==='error'){showNotice({kind:'danger',eyebrow:'Updates',title:'Update issue',message:u.message||'ClipBoost could not finish the update.'});}else{showNotice({kind:'update',eyebrow:'Updates',title:u.status==='checking'?'Checking for updates':`Downloading ClipBoost ${u.version||''}`,message:u.status==='downloading'?`${Math.round(u.percent||0)}% downloaded`:'ClipBoost is checking the release channel.'});}};
    const file=document.getElementById('videoFile'),drop=document.getElementById('dropZone');
    if(file)file.onchange=()=>{const chosen=file.files&&file.files[0];if(chosen)uploadVideo(chosen)};
    if(drop){drop.ondragover=e=>{e.preventDefault();drop.classList.add('dragging')};drop.ondragleave=()=>drop.classList.remove('dragging');drop.ondrop=e=>{e.preventDefault();drop.classList.remove('dragging');uploadVideo(e.dataTransfer.files[0])}}
    document.querySelectorAll('[data-candidate]').forEach(el=>el.onclick=e=>{e.stopPropagation();const idx=Number(el.dataset.candidate)||0;selectCandidatePreview(idx,{autoplay:true})});
    const sourceVideo=document.getElementById('sourceVideo'),smartTimeline=document.getElementById('smartTimeline'),playhead=document.getElementById('timelinePlayhead');
    const updateTimelinePlayhead=(time)=>{if(!playhead||!state.video?.details?.duration)return;const p=Math.max(0,Math.min(100,(Number(time||0)/Number(state.video.details.duration))*100));playhead.style.left=p+'%'};
    if(sourceVideo){
      const seek=Number(state.timelineSeek);
      const applySeek=()=>{if(Number.isFinite(seek)&&seek>=0){sourceVideo.currentTime=Math.min(seek,Math.max(0,(sourceVideo.duration||seek)-.05));updateTimelinePlayhead(sourceVideo.currentTime);state.timelineSeek=null}};
      sourceVideo.addEventListener('loadedmetadata',applySeek,{once:true});
      if(sourceVideo.readyState>=1)applySeek();
      sourceVideo.addEventListener('timeupdate',()=>updateTimelinePlayhead(sourceVideo.currentTime));
    }
    if(smartTimeline){smartTimeline.onclick=e=>{if(e.target.closest('[data-candidate]'))return;const rect=smartTimeline.getBoundingClientRect();if(!rect.width)return;const ratio=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));const t=ratio*Number(smartTimeline.dataset.duration||0);state.timelineSeek=t;updateTimelinePlayhead(t);if(sourceVideo){sourceVideo.currentTime=t;sourceVideo.play().catch(()=>{})}}}

    const shortVideo=document.getElementById('shortVideo'),liveCaption=document.getElementById('liveCaption');
    if(shortVideo&&liveCaption){
      const cand=state.video?.candidates?.[state.selectedCandidate||0];
      const captions=cand?.captions||[];
      const duration=Math.max(.25,Number(cand?.end||0)-Number(cand?.start||0));
      const syncCaption=()=>{
        const rel=Math.max(0,Math.min(duration,Number(shortVideo.currentTime||0)));
        const line=captions.find(x=>rel>=Number(x.start||0)&&rel<=Number(x.end||0));
        liveCaption.textContent=(line?.text||cand?.hook||'').toUpperCase();
      };
      shortVideo.addEventListener('timeupdate',syncCaption);
      shortVideo.addEventListener('seeked',syncCaption);
      shortVideo.addEventListener('loadedmetadata',syncCaption,{once:true});
      shortVideo.addEventListener('ended',()=>{shortVideo.currentTime=0;syncCaption()});
      if(state.candidatePreviewAutoplay){
        const autoplay=()=>{state.candidatePreviewAutoplay=false;shortVideo.play().catch(()=>{});};
        if(shortVideo.readyState>=2)setTimeout(autoplay,0);else shortVideo.addEventListener('canplay',autoplay,{once:true});
      }
      syncCaption();
    }
    const retryPreview=document.getElementById('retryClipPreview');if(retryPreview)retryPreview.onclick=()=>prepareCandidatePreview(state.selectedCandidate||0,{autoplay:false,force:true});
    if(state.page==='studio'&&state.video?.candidates?.length){
      const idx=Math.min(state.selectedCandidate||0,state.video.candidates.length-1);
      const cand=state.video.candidates[idx];
      if(cand&&!cand.previewUrl&&!state.candidatePreviewLoading&&!state.candidatePreviewError)setTimeout(()=>prepareCandidatePreview(idx,{autoplay:false}),0);
    }
    const clipStartInput=document.getElementById('clipStart'),clipEndInput=document.getElementById('clipEnd');
    const updateClipBounds=()=>{
      const idx=state.selectedCandidate||0,cand=state.video?.candidates?.[idx];if(!cand)return;
      const maxDuration=Math.max(.5,Number(state.video?.details?.duration||Infinity));
      let start=Math.max(0,Number(clipStartInput?.value||cand.start||0));
      let end=Math.min(maxDuration,Number(clipEndInput?.value||cand.end||start+30));
      if(!Number.isFinite(end)||end<=start+.25)end=Math.min(maxDuration,start+.25);
      cand.start=start;cand.end=end;cand.duration=Math.max(.25,end-start);cand.previewUrl=null;state.timelineSeek=start;state.candidatePreviewError='';render();
    };
    if(clipStartInput)clipStartInput.onchange=updateClipBounds;
    if(clipEndInput)clipEndInput.onchange=updateClipBounds;
    const ex=document.getElementById('exportBtn');if(ex)ex.onclick=exportCurrent;const exAll=document.getElementById('exportAllBtn');if(exAll)exAll.onclick=exportAll;
    const captionPreferenceSelect=document.getElementById('captionPreferenceSelect');if(captionPreferenceSelect)captionPreferenceSelect.onchange=e=>{state.captionPreference=e.target.value;persistEditorPrefs();invalidateRenderedPreviews();render();};document.querySelectorAll('[data-caption-color]').forEach(btn=>btn.onclick=()=>{state.captionColor=btn.dataset.captionColor||'auto';persistEditorPrefs();invalidateRenderedPreviews();render()});
    const generateVariationsBtn=document.getElementById('generateVariationsBtn');if(generateVariationsBtn)generateVariationsBtn.onclick=async()=>{
      if(!state.video?.id||state.regenerating)return;
      state.regenerating=true;state.video={...state.video,status:'analyzing',analysis:{...(state.video.analysis||{}),stage:'semantic-clips',progress:72}};render();
      try{
        const r=await fetch(`/api/videos/${encodeURIComponent(state.video.id)}/analyze`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clipCount:'auto'})});
        const data=await readJsonResponse(r,'Could not generate clip variations');
        state.video=data;state.selectedCandidate=0;
      }catch(e){showNotice({kind:'danger',title:'Generation failed',message:e.message||'Could not generate clip variations'})}
      finally{state.regenerating=false;render()}
    };
    const autoIngest=document.getElementById('autoIngestBtn');if(autoIngest)autoIngest.onclick=()=>state.video?.id&&startProjectIngestion(state.video.id);
    document.querySelectorAll('[data-open-project]').forEach(el=>el.onclick=()=>openProject(el.dataset.openProject));
    document.querySelectorAll('[data-delete-project]').forEach(el=>el.onclick=e=>{e.stopPropagation();removeProject(el.dataset.deleteProject,el.dataset.deleteProjectName)});
    if(state.page==='settings'&&!state.settings&&!state.settingsLoading)setTimeout(loadSettings,0);
    if(state.page==='settings'&&!state.systemHealth&&!state.systemHealthLoading)setTimeout(loadSystemHealth,120);
    if(state.page==='settings'){
      const save=document.getElementById('saveSettingsBtn');if(save)save.onclick=saveSettings;
      const openConfig=document.getElementById('openConfigBtn');if(openConfig)openConfig.onclick=()=>window.clipboostDesktop?.openConfig?.();
      const openExports=document.getElementById('openExportsBtn');if(openExports)openExports.onclick=()=>window.clipboostDesktop?.openExportsFolder?.();
      const openData=document.getElementById('openDataBtn');if(openData)openData.onclick=()=>window.clipboostDesktop?.openDataFolder?.();
      const check=document.getElementById('checkUpdatesBtn');if(check)check.onclick=async()=>{check.disabled=true;try{await window.clipboostDesktop?.checkForUpdates?.()}finally{check.disabled=false}};
      const restart=document.getElementById('restartAppBtn');if(restart)restart.onclick=()=>window.clipboostDesktop?.restartApp?.();
      const health=document.getElementById('runHealthCheckBtn');if(health)health.onclick=loadSystemHealth;
    }
    if(state.page==='library'&&!state.libraryLoaded&&!state.libraryLoading)setTimeout(loadLibrary,0);
    if(state.page==='projects'&&!state.projects&&!state.projectsLoading)setTimeout(loadProjects,0);
    const open=()=>{state.addCreatorOpen=true;state.libraryError='';state.creatorPlatform=state.libraryPlatform||'youtube';state.creatorQuery='';state.creatorSearchResults=[];state.creatorSearchLoading=false;render();setTimeout(()=>document.getElementById('creatorInput')?.focus(),0)};
    const add=document.getElementById('addCreator'),emptyAdd=document.getElementById('emptyAddCreator');if(add)add.onclick=open;if(emptyAdd)emptyAdd.onclick=open;
    const close=()=>{state.addCreatorOpen=false;state.libraryError='';state.creatorSearchResults=[];state.creatorSearchLoading=false;render()};
    ['closeCreatorModal','cancelCreator'].forEach(id=>{const el=document.getElementById(id);if(el)el.onclick=close});
    const backdrop=document.getElementById('creatorModalBackdrop');if(backdrop)backdrop.onclick=e=>{if(e.target===backdrop)close()};
    const input=document.getElementById('creatorInput');if(input){input.oninput=e=>{state.creatorQuery=e.target.value;clearTimeout(window.__clipboostCreatorSearchTimer);window.__clipboostCreatorSearchTimer=setTimeout(()=>searchCreators(state.creatorQuery),700)}}
    const form=document.getElementById('creatorForm');if(form)form.onsubmit=e=>{e.preventDefault();const value=document.getElementById('creatorInput')?.value?.trim();if(value)searchCreators(value)};
    document.querySelectorAll('[data-add-channel]').forEach(el=>el.onclick=()=>addCreatorByPlatform(el.dataset.addInput||el.dataset.addChannel));
    const exact=document.getElementById('addExactCreator');if(exact)exact.onclick=()=>{const value=document.getElementById('creatorInput')?.value?.trim()||state.creatorQuery;if(value)addCreatorByPlatform(value)};
    document.querySelectorAll('[data-remove-id]').forEach(el=>el.onclick=e=>{e.stopPropagation();removeCreator(el.dataset.removePlatform,el.dataset.removeId,el.dataset.removeName)});
    document.querySelectorAll('[data-filter-creator]').forEach(el=>{const apply=()=>{const id=el.dataset.filterCreator;state.libraryCreatorFilter=state.libraryCreatorFilter===id?'all':id;render()};el.onclick=apply;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();apply()}}});
    const clearCreatorFilter=document.getElementById('clearCreatorFilter');if(clearCreatorFilter)clearCreatorFilter.onclick=()=>{state.libraryCreatorFilter='all';render()};
    document.querySelectorAll('[data-send-studio-id]').forEach(el=>el.onclick=()=>sendLibraryItemToStudio(el.dataset.sendStudioPlatform,el.dataset.sendStudioCreator,el.dataset.sendStudioType,el.dataset.sendStudioId));
    document.querySelectorAll('[data-preview-id]').forEach(el=>el.onclick=e=>{e.preventDefault();state.previewVideo={kind:el.dataset.previewKind||'youtube',id:el.dataset.previewId,title:el.dataset.previewTitle||'Video preview',url:el.dataset.previewUrl||''};render()});
    const closePreview=()=>{state.previewVideo=null;render()};const cp=document.getElementById('closeVideoPreview');if(cp)cp.onclick=closePreview;const pb=document.getElementById('videoPreviewBackdrop');if(pb)pb.onclick=e=>{if(e.target===pb)closePreview()};
    const openLivePlayer=el=>{const channel=String(el?.dataset?.liveChannel||'').trim();if(!channel)return;state.livePlayer={channel,name:el.dataset.liveName||channel,title:el.dataset.liveTitle||'Live stream',url:el.dataset.liveUrl||`https://www.twitch.tv/${channel}`,viewers:Number(el.dataset.liveViewers||0),game:el.dataset.liveGame||'Twitch'};render()};
    document.querySelectorAll('[data-live-channel]').forEach(el=>{el.onclick=e=>{if(e.target.closest('[data-refresh-live]'))return;e.preventDefault();openLivePlayer(el)};if(el.classList.contains('live-copy'))el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openLivePlayer(el)}}});
    const closeLive=()=>{state.livePlayer=null;render()};const cl=document.getElementById('closeTwitchLive');if(cl)cl.onclick=closeLive;const tlb=document.getElementById('twitchLiveBackdrop');if(tlb)tlb.onclick=e=>{if(e.target===tlb)closeLive()};
    const liveView=document.getElementById('twitchLiveWebview'),liveLoading=document.getElementById('twitchLiveLoading'),reloadLive=document.getElementById('reloadTwitchLive');
    if(liveView){
      const setLiveLoaded=()=>{if(liveLoading)liveLoading.classList.add('hidden')};
      liveView.addEventListener('dom-ready',setLiveLoaded,{once:true});
      liveView.addEventListener('did-stop-loading',setLiveLoaded,{once:true});
      liveView.addEventListener('did-fail-load',()=>{if(liveLoading){liveLoading.classList.remove('hidden');liveLoading.innerHTML='<strong>Could not load Twitch inside ClipBoost.</strong><small>Use “Open on Twitch” above, or try Reload player.</small>'}});
      liveView.addEventListener('will-navigate',e=>{try{const u=new URL(e.url);if(!/(^|\.)twitch\.tv$/i.test(u.hostname))e.preventDefault()}catch{e.preventDefault()}});
    }
    if(reloadLive)reloadLive.onclick=()=>{if(liveLoading)liveLoading.classList.remove('hidden');if(liveView)liveView.reload()};
    const refresh=document.getElementById('refreshLibrary');if(refresh)refresh.onclick=refreshCurrentLibrary;const emptyRefresh=document.getElementById('emptyRefreshTwitch');if(emptyRefresh)emptyRefresh.onclick=refreshCurrentLibrary;document.querySelectorAll('[data-refresh-live]').forEach(el=>el.onclick=()=>refreshTwitchLive({silent:false}));const loadMore=document.getElementById('loadMoreYoutube');if(loadMore)loadMore.onclick=loadMoreYoutubeHistory;
    document.querySelectorAll('[data-library-platform]').forEach(el=>el.onclick=()=>{state.libraryPlatform=el.dataset.libraryPlatform;state.librarySection=state.libraryPlatform==='youtube'?'videos':'vods';state.libraryCreatorFilter='all';state.youtubeHistoryExpanded=false;state.libraryError='';state.libraryRefreshMessage='';clearTimeout(window.__clipboostTwitchLiveRefresh);render()});
    document.querySelectorAll('[data-library-section]').forEach(el=>el.onclick=()=>{state.librarySection=el.dataset.librarySection;render();if(state.libraryPlatform==='twitch'&&state.librarySection==='live')scheduleTwitchLiveRefresh()});
    const sort=document.getElementById('librarySort');if(sort)sort.onchange=e=>{state.librarySort=e.target.value;render()};
    const cf=document.getElementById('libraryCreatorFilter');if(cf)cf.onchange=e=>{state.libraryCreatorFilter=e.target.value;state.youtubeHistoryExpanded=false;render()};
    if(state.page==='library'&&state.libraryPlatform==='twitch'&&state.librarySection==='live')scheduleTwitchLiveRefresh();
    document.querySelectorAll('[data-creator-platform]').forEach(el=>el.onclick=()=>{state.creatorPlatform=el.dataset.creatorPlatform;state.creatorQuery='';state.creatorSearchResults=[];state.libraryError='';render();setTimeout(()=>document.getElementById('creatorInput')?.focus(),0)});
  }
  async function handleDesktopUpdateEvent(evt={}){
    const rawStatus=evt.status||evt.updateState?.status||'info';
    const status=rawStatus==='progress'||rawStatus==='available'?'downloading':rawStatus;
    state.desktopUpdate={status,version:evt.version||evt.updateState?.version||state.desktopUpdate?.version||null,percent:Number(evt.percent??evt.updateState?.percent??state.desktopUpdate?.percent??0),message:evt.message||''};

    // Do not rebuild the full DOM during updater progress while a modal is open.
    // The old behavior recreated the dialog repeatedly and caused visible flicker.
    if(!state.uiModal || !['checking','downloading'].includes(status)) render();

    if(rawStatus==='current') return showNotice({kind:'success',eyebrow:'Updates',title:'ClipBoost is up to date',message:`You are running the latest published version.`,detail:`Version ${evt.version||evt.currentVersion||''}`});
    if(rawStatus==='unconfigured') return showNotice({kind:'warning',eyebrow:'Updates',title:'Update channel not configured',message:'Connect ClipBoost to a GitHub Releases repository in Settings.',detail:'Set CLIPBOOST_UPDATE_OWNER and CLIPBOOST_UPDATE_REPO.'});
    if(rawStatus==='dev') return showNotice({kind:'info',eyebrow:'Updates',title:'Development build',message:'Automatic updates are only available in the installed ClipBoost build.'});
    if(rawStatus==='error'){updateInstallStarting=false;return showNotice({kind:'danger',eyebrow:'Updates',title:'Update failed',message:evt.message||'ClipBoost could not complete the update.'});}
    if(rawStatus==='ready'){
      await promptReadyUpdate(evt.version||evt.updateState?.version,{force:Boolean(evt.manual)});
      return;
    }
    if(rawStatus==='available'&&evt.manual) return showNotice({kind:'update',eyebrow:'Updates',title:`ClipBoost ${evt.version||''} found`,message:evt.downloading===false?'A new version is available.':'The update is downloading in the background.'});
  }
  if(window.clipboostDesktop?.onUpdateEvent&&!window.__clipboostUpdateEventsBound){window.__clipboostUpdateEventsBound=true;window.clipboostDesktop.onUpdateEvent(handleDesktopUpdateEvent)}
  if(!window.__clipboostKeyboardShortcutsBound){window.__clipboostKeyboardShortcutsBound=true;window.addEventListener('keydown',e=>{const tag=String(e.target?.tagName||'').toLowerCase();if(['input','textarea','select'].includes(tag)||e.target?.isContentEditable)return;if(state.page!=='studio')return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='e'){e.preventDefault();if(e.shiftKey)exportAll();else exportCurrent();return}if(e.key==='ArrowRight'||e.key==='ArrowLeft'){const list=state.video?.candidates||[];if(!list.length)return;e.preventDefault();const dir=e.key==='ArrowRight'?1:-1;const next=(Math.min(state.selectedCandidate||0,list.length-1)+dir+list.length)%list.length;selectCandidatePreview(next,{autoplay:false})}})}
  if(!location.hash) history.replaceState(null,'','#/home');
  const syncRouteFromLocation=()=>{const page=pageFromHash();if(page!==state.page){state.page=page;render();window.scrollTo(0,0);if(page==='studio'&&!state.video)setTimeout(restoreLastStudioProject,0)}};
  window.addEventListener('hashchange',syncRouteFromLocation);
  window.addEventListener('popstate',syncRouteFromLocation);
  render();
  if(state.page==='studio'&&!state.video)setTimeout(restoreLastStudioProject,0);
})();
