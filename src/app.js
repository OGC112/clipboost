/* MINT-RED-NOIR-21.14.6 */
/* MINT-HEADER-21.14.5 */
/* MINT-NAVIGATION-21.14.3 */
/* MINT-AI-STUDIO-21.14.2 */
/* MINT-HOME-21.14.1 */
(function(){
  const validPages=new Set(['home','campaign-discover','campaigns','campaign-editor','analytics','studio','library','projects','publish','settings']);
  function pageFromHash(){
    const raw=String(location.hash||'').replace(/^#\/?/,'').split(/[?&]/)[0].trim();
    return validPages.has(raw)?raw:'home';
  }
  function loadEditorPrefs(){try{return JSON.parse(localStorage.getItem('clipboost:editorPrefs')||'{}')}catch{return {}}}
  function loadCampaignImportRecovery(){try{const value=JSON.parse(localStorage.getItem('clipboost:campaignImportReview')||'null');return value&&typeof value==='object'&&value.draft?value:null}catch{return null}}
  const editorPrefs=loadEditorPrefs();
  const campaignImportRecovery=loadCampaignImportRecovery();
  function loadCampaignSites(){try{const saved=JSON.parse(localStorage.getItem('clipboost:campaignSites')||'[]');return Array.isArray(saved)&&saved.length?saved:[{id:'clipping',name:'Clipping',url:'https://clipping.net/dashboard/campaigns'}]}catch{return [{id:'clipping',name:'Clipping',url:'https://clipping.net/dashboard/campaigns'}]}}
  function persistCampaignSites(){try{localStorage.setItem('clipboost:campaignSites',JSON.stringify(state.campaignSites||[]))}catch{}}
  const state={page:pageFromHash(), video:null, studioMode:editorPrefs.studioMode||'shorts', shortsCount:[5,10,20].includes(Number(editorPrefs.shortsCount))?Number(editorPrefs.shortsCount):10, restoringProject:false, uploadProgress:0, uploadStatus:'idle', selectedCandidate:0, library:null, libraryLoaded:false, libraryLoading:false, libraryError:'', youtubeConfigured:null, twitchConfigured:null, libraryPlatform:'youtube', librarySection:'videos', librarySort:'newest', libraryCreatorFilter:'all', addCreatorOpen:false, addCreatorBusy:false, creatorPlatform:'youtube', creatorQuery:'', creatorSearchResults:[], creatorSearchLoading:false, previewVideo:null, livePlayer:null, libraryLoadMoreBusy:false, libraryRefreshBusy:false, libraryRefreshMessage:'', youtubeHistoryExpanded:false, projectBusy:false, projects:null, projectsLoading:false, captionPreference:editorPrefs.captionPreference||'auto', captionColor:editorPrefs.captionColor||'auto', regenerating:false, timelineSeek:null, candidatePreviewLoading:false, candidatePreviewLoadingIndex:-1, candidatePreviewError:'', candidatePreviewRequestId:0, candidatePreviewAutoplay:false, editPreset:editorPrefs.editPreset||'dynamic', editIntensity:editorPrefs.editIntensity||'balanced', trackingMode:editorPrefs.trackingMode||'speaker', cameraMovement:editorPrefs.cameraMovement||'balanced', captionStyle:editorPrefs.captionStyle||'bold', captionFont:({trebuchet:'social',verdana:'social'}[editorPrefs.captionFont]||editorPrefs.captionFont||'social'), captionEffect:({'word-by-word':'word-pop','punch-words':'keyword-color','static':'clean-bold'}[editorPrefs.captionEffect]||editorPrefs.captionEffect||'active-word'), hookTitleEnabled:Boolean(editorPrefs.hookTitleEnabled), hookTitleText:String(editorPrefs.hookTitleText||''), hookTitleDuration:String(editorPrefs.hookTitleDuration||'5'), hookTitleX:Number.isFinite(Number(editorPrefs.hookTitleX))?Math.max(.08,Math.min(.92,Number(editorPrefs.hookTitleX))):.5, hookTitleY:Number.isFinite(Number(editorPrefs.hookTitleY))?Math.max(.08,Math.min(.92,Number(editorPrefs.hookTitleY))):.12, captionPosition:editorPrefs.captionPosition||'bottom', captionY:Number.isFinite(Number(editorPrefs.captionY))?Number(editorPrefs.captionY):null, captionSize:editorPrefs.captionSize||'medium', captionScale:Number.isFinite(Number(editorPrefs.captionScale))?Math.max(.4,Math.min(2,Number(editorPrefs.captionScale))):1, captionColor:editorPrefs.captionColor||'white',
    sourceSubtitleMode:['keep','crop','hide'].includes(editorPrefs.sourceSubtitleMode)?editorPrefs.sourceSubtitleMode:'keep',
    sourceSubtitleBottom:Number.isFinite(Number(editorPrefs.sourceSubtitleBottom))?Math.max(.06,Math.min(.28,Number(editorPrefs.sourceSubtitleBottom))):.15,
    watermarkUrl:editorPrefs.watermarkUrl||'', watermarkName:editorPrefs.watermarkName||'', watermarkX:Number.isFinite(Number(editorPrefs.watermarkX))?Number(editorPrefs.watermarkX):.86, watermarkY:Number.isFinite(Number(editorPrefs.watermarkY))?Number(editorPrefs.watermarkY):.12, watermarkScale:Number.isFinite(Number(editorPrefs.watermarkScale))?Number(editorPrefs.watermarkScale):.18, watermarkOpacity:Number.isFinite(Number(editorPrefs.watermarkOpacity))?Number(editorPrefs.watermarkOpacity):.9,
    cleanupMode:editorPrefs.cleanupMode||'captions', zoomStyle:editorPrefs.zoomStyle||'natural', editOptions:{autoReframe:true,speakerTracking:true,reactionDetection:true,sceneAwareCuts:true,silenceRemoval:true,dynamicZoom:true,captions:true,...(editorPrefs.editOptions||{})}, exportBusy:false, exportAllBusy:false, campaigns:null, campaignsLoading:false, campaignSelected:null, campaignDetailsOpen:false, campaignFormOpen:false, campaignBusy:false, campaignMessage:campaignImportRecovery?'Unsaved Smart Import review available. You can reopen it anytime.':'', campaignVariants:null, campaignCompliance:null, campaignTab:'overview', campaignDraftUrl:campaignImportRecovery?.url||'', campaignSites:loadCampaignSites(), campaignImportDraft:campaignImportRecovery?.draft||null, campaignAssetBrowser:null, campaignAssetBusy:false, settings:null, settingsLoading:false, settingsSaving:false, settingsMessage:'', desktopSettings:null, systemHealth:null, systemHealthLoading:false, desktopUpdate:{status:'idle',version:null,percent:0}, publishDrafts:{},publishActivePlatform:'tiktok',publishNetworks:{tiktok:true,instagram:true,youtube:true,facebook:false,x:false},platformConnections:null,platformConnectionsLoading:false,platformConnectBusy:'',analyticsScope:'all',analyticsPlatform:'all',analyticsPeriod:'30',analyticsPeriodOpen:false,analyticsSearch:'',analyticsOrganicPosts:[],youtubeAnalytics:null,youtubeAnalyticsLoading:false,youtubeAnalyticsError:'',lastExport:null,uiModal:null};
  const autoIngestAttempted=new Set();
  function persistEditorPrefs(){try{localStorage.setItem('clipboost:editorPrefs',JSON.stringify({captionPreference:state.captionPreference,captionColor:state.captionColor||'auto',captionStyle:state.captionStyle||'bold',captionFont:state.captionFont||'social',captionEffect:state.captionEffect||'active-word',hookTitleEnabled:Boolean(state.hookTitleEnabled),hookTitleText:String(state.hookTitleText||''),hookTitleDuration:String(state.hookTitleDuration||'5'),hookTitleX:Number(state.hookTitleX||.5),hookTitleY:Number(state.hookTitleY||.12),captionSize:state.captionSize||'medium',captionScale:Number(state.captionScale||1),captionPosition:state.captionPosition||'bottom',captionY:Number.isFinite(Number(state.captionY))?Number(state.captionY):null,sourceSubtitleMode:state.sourceSubtitleMode||'keep',sourceSubtitleBottom:Number(state.sourceSubtitleBottom||.15),watermarkUrl:state.watermarkUrl||'',watermarkName:state.watermarkName||'',watermarkX:Number(state.watermarkX||.86),watermarkY:Number(state.watermarkY||.12),watermarkScale:Number(state.watermarkScale||.18),watermarkOpacity:Number(state.watermarkOpacity||.9),studioMode:state.studioMode||'shorts'}))}catch{}}
  function persistCampaignImportReview(){try{if(state.campaignImportDraft)localStorage.setItem('clipboost:campaignImportReview',JSON.stringify({url:state.campaignDraftUrl||state.campaignImportDraft.campaignUrl||'',draft:state.campaignImportDraft,savedAt:Date.now()}));else localStorage.removeItem('clipboost:campaignImportReview')}catch{}}
  function clearCampaignImportReview(){state.campaignImportDraft=null;state.campaignDraftUrl='';try{localStorage.removeItem('clipboost:campaignImportReview')}catch{}}
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
    const actions=mode==='progress'?`<div class="cb-modal-installing"><div class="cb-analysis-progress"><div class="cb-analysis-progress-head"><span>${escapeHtml(m.progressLabel||'Working…')}</span><strong>${Math.round(Math.max(0,Math.min(100,Number(m.progress||0))))}%</strong></div><div class="cb-analysis-progress-track"><i style="width:${Math.max(4,Math.min(100,Number(m.progress||4)))}%"></i></div></div></div>`:`<div class="cb-modal-actions">${mode==='confirm'?`<button class="btn secondary" id="cbModalCancel" type="button">${escapeHtml(m.cancelLabel||'Cancel')}</button>`:''}<button class="btn ${kind==='danger'?'danger':'primary'}" id="cbModalConfirm" type="button">${escapeHtml(m.confirmLabel||'OK')}</button></div>`;
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
    if(page!=='analytics')clearTimeout(window.__clipboostYouTubeAnalyticsRefresh);
    const next=`#/${page}`;
    if(location.hash!==next){
      if(replace) history.replaceState(null,'',next); else history.pushState(null,'',next);
    }
    render();
    window.scrollTo(0,0);
    if(page==='studio'&&!state.video) setTimeout(restoreLastStudioProject,0);
    if(page==='analytics'&&!state.campaigns&&!state.campaignsLoading) setTimeout(loadCampaigns,0);
    if(page==='analytics'&&!state.platformConnections&&!state.platformConnectionsLoading) setTimeout(()=>loadPlatformConnections({quiet:true}),0);
  }
  const nav=[['home','⌂','Home'],['studio','✦','AI Studio'],['campaigns','◎','Campaign Studio'],['library','▣','Library'],['projects','▤','Projects']];
  const vods=[
    ['Kameto','Just Chatting','2h 14m','12 clips detected'],
    ['Squeezie','React','1h 02m','8 clips detected'],
    ['Inoxtag','Minecraft','1h 48m','15 clips detected'],
    ['Amine','Discussion','2h 31m','10 clips detected']
  ];
  const colors=['purple','rose','blue','green','violet'];
  function spark(c='blue'){return `<svg class="spark ${c}" viewBox="0 0 120 30"><polyline points="0,25 12,22 24,24 36,17 48,20 60,14 72,16 84,10 96,12 108,6 120,4"/></svg>`}
  function avatar(seed='purple',size='md'){return `<div class="avatar-art ${seed} ${size}"><span class="hair"></span><span class="head"></span><span class="body"></span></div>`}
  function mediaThumb(i=0,large=false){return `<div class="media-thumb t${i%5} ${large?'large':''}"><div class="ambient"></div>${avatar(colors[i%colors.length], large?'lg':'md')}<span class="cam-dot"></span></div>`}
  function clip(score,label,i=0){return `<div class="clip"><div class="clip-thumb">${mediaThumb(i)}<div class="score">${score}</div><span class="clip-tag">AI pick</span></div><div class="clip-info"><strong>${label}</strong><small>00:42 – 01:08</small></div></div>`}
  function phone(tall=''){return `<div class="phone ${tall}"><div class="phone-stage">${avatar('purple','xl')}<span class="phone-chip">9:16</span></div><div class="caption">THAT WAS<br><b>INSANE!</b></div><div class="phone-progress"><i></i></div></div>`}
  function side(){
    return `<aside class="sidebar mint-home-hidden-sidebar" id="sidebar">
      <button data-page="home">Home</button>
      <button data-page="studio">AI Studio</button>
      <button data-page="campaigns">Campaign Studio</button>
      <button data-page="library">Library</button>
      <button data-page="projects">Projects</button>
      <button data-page="analytics">Results</button>
      <button data-page="settings">Settings</button>
    </aside>`
  }
  function top(){
    const u=state.desktopUpdate||{};
    const updatePill=['checking','downloading','ready','error'].includes(u.status)
      ? `<button class="update-pill ${u.status}" id="updateCenterBtn" type="button"><span>${u.status==='ready'?'✓':u.status==='error'?'!':'↻'}</span>${u.status==='downloading'?`Update ${Math.round(u.percent||0)}%`:u.status==='checking'?'Checking update…':u.status==='ready'?`Update ${escapeHtml(u.version||'')} ready`:'Update issue'}</button>`
      : '';
    return `<header class="topbar mint-home-topbar mint-split-topbar mint-clean-topbar mint-red-topbar">
      <button class="mint-home-brand mint-wordmark-only" data-page="home" type="button"><strong>Mint</strong></button>

      <nav class="mint-split-nav mint-centered-nav">
        <div class="mint-nav-group campaign-group">
          <span class="mint-nav-label">Campaigns</span>
          <div>
            <button data-page="campaign-discover" class="${state.page==='campaign-discover'?'active':''}" type="button">Discover</button>
            <button data-page="campaigns" class="${state.page==='campaigns'?'active':''}" type="button">Campaign Studio</button>
            <button data-page="analytics" class="${state.page==='analytics'?'active':''}" type="button">Results</button>
          </div>
        </div>

        <i class="mint-nav-separator"></i>

        <div class="mint-nav-group create-group">
          <span class="mint-nav-label">Create</span>
          <div>
            <button data-page="studio" class="${state.page==='studio'?'active':''}" type="button">AI Studio</button>
            <button data-page="library" class="${state.page==='library'?'active':''}" type="button">Library</button>
            <button data-page="projects" class="${state.page==='projects'?'active':''}" type="button">Projects</button><button data-page="publish" class="${state.page==='publish'?'active':''}" type="button">Publish</button>
          </div>
        </div>
      </nav>

      <div class="mint-home-top-actions mint-split-actions mint-clean-actions">
        ${updatePill}
        <button class="mint-home-icon-btn mint-settings-gear" data-page="settings" type="button" aria-label="Settings" title="Settings">⚙</button>
        <div class="mint-window-controls" aria-label="Window controls">
          <button type="button" id="mintWindowMin" title="Minimize" aria-label="Minimize">—</button>
          <button type="button" id="mintWindowMax" title="Maximize" aria-label="Maximize">□</button>
          <button type="button" id="mintWindowClose" class="close" title="Close" aria-label="Close">×</button>
        </div>
      </div>
    </header>`
  }
  function kpi(a,b,c,idx=0){return `<div class="card kpi"><div class="kpi-top"><small>${a}</small><span class="kpi-icon">${['◉','↗','✦','▤'][idx%4]}</span></div><strong>${b}</strong><div class="delta">${c}</div>${spark(['blue','purple','green','blue'][idx%4])}</div>`}
  function home(){
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
      return `<button class="mint-nb-project" data-home-project="${escapeHtml(p.id)}" type="button">
        <div class="mint-nb-project-thumb">${p.externalSource?.thumbnail?`<img src="${escapeHtml(p.externalSource.thumbnail)}" alt="">`:mediaThumb(i+1)}</div>
        <div class="mint-nb-project-copy"><strong>${escapeHtml(p.originalName||'Project')}</strong><small>${escapeHtml(p.campaignName?'Campaign Studio':'AI Studio')} · ${escapeHtml(ps.badge||'Project')}</small></div>
        <div class="mint-nb-project-data"><b>${views!==undefined&&views!==null?formatCount(views):'—'}</b><small>views</small></div>
        <div class="mint-nb-project-data"><b>${Number(p.candidateCount||0)}</b><small>clips</small></div>
        <span>→</span>
      </button>`
    }).join(''):`<div class="mint-nb-empty">No recent projects yet.</div>`;

    const importRows=imports.length?imports.map((p,i)=>`<button class="mint-nb-import" data-home-project="${escapeHtml(p.id)}" type="button">
      <div class="mint-nb-import-thumb">${p.externalSource?.thumbnail?`<img src="${escapeHtml(p.externalSource.thumbnail)}" alt="">`:mediaThumb(i)}</div>
      <div><strong>${escapeHtml(p.originalName||'Imported media')}</strong><small>${escapeHtml(p.externalSource?.creatorName||p.externalSource?.platform||'Library source')}</small></div>
      <span>•••</span>
    </button>`).join(''):`<div class="mint-nb-empty">No recent imports.</div>`;

    const t=activeCampaign?.totals||{};
    const campaignViews=Number(t.totalViews||0);
    const qualification=activeCampaign?Number(campaignQualification(activeCampaign)||0):0;
    const performance=qualification?Math.min(100,Math.round((campaignViews/qualification)*100)):null;
    const estimatedRevenue=Number(t.estimatedRevenue||0);
    const confirmedRevenue=Number(t.confirmedRevenue||activeCampaign?.confirmedPayout||0);
    const publishedCount=Number(t.postCount||activeCampaign?.posts?.length||0);

    return `<div class="content mint-home-page mint-home-nb-v1417">
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
          <div class="mint-nb-section-head"><div><span>ϟ</span><b>Continue working</b></div>${current?`<em>${escapeHtml(currentState?.badge||'Project')}</em>`:''}</div>
          ${current?`
          <div class="mint-nb-current-layout">
            <button class="mint-nb-current-media" data-home-project="${escapeHtml(current.id)}" type="button">
              ${current.externalSource?.thumbnail?`<img src="${escapeHtml(current.externalSource.thumbnail)}" alt="">`:mediaThumb(0)}
              <i>▶</i>
            </button>
            <div class="mint-nb-current-copy">
              <h2>${escapeHtml(current.originalName||'Project')}</h2>
              <p>${escapeHtml(current.campaignName?`Campaign · ${current.campaignName}`:'General AI Studio project')}</p>
              <div class="mint-nb-inline-stats">
                <div><b>${currentViews!==undefined&&currentViews!==null?formatCount(currentViews):'—'}</b><small>Source views</small></div>
                <div><b>${currentClips}</b><small>Clips created</small></div>
                <div><b>${currentLikes!==undefined&&currentLikes!==null?formatCount(currentLikes):'—'}</b><small>Source likes</small></div>
              </div>
              <div class="mint-home-progress"><i style="width:${Math.max(4,Math.min(100,Number(currentState?.progress||0)))}%"></i></div>
              <div class="mint-nb-progress"><span>${escapeHtml(currentState?.progressLabel||currentState?.badge||'Project')}</span><b>${Math.round(Number(currentState?.progress||0))}%</b></div>
              <button class="btn primary" data-home-project="${escapeHtml(current.id)}">Continue project →</button>
            </div>
          </div>`
          :`<div class="mint-nb-empty">Nothing in progress.</div>`}
        </div>

        <aside class="mint-nb-campaign">
          <div class="mint-nb-section-head"><div><span>◎</span><b>Active campaign</b></div>${activeCampaign?'<em>Active</em>':''}</div>
          ${activeCampaign?`
          <div class="mint-nb-campaign-name"><span>◎</span><div><h2>${escapeHtml(activeCampaign.name)}</h2><p>${escapeHtml(activeCampaign.provider||'Campaign')} · Creator campaign</p></div></div>
          <div class="mint-nb-metric-list">
            <div><span>Confirmed payout</span><b>${formatMoney(confirmedRevenue,activeCampaign.currency||'USD')}</b></div>
            <div><span>Estimated payout</span><b>${formatMoney(estimatedRevenue,activeCampaign.currency||'USD')}</b></div>
            <div><span>Target views</span><b>${qualification?formatCount(qualification):'—'}</b></div>
            <div><span>Tracked views</span><b>${formatCount(campaignViews)}</b></div>
            <div><span>Performance</span><b>${performance===null?'—':performance+'%'}</b></div>
            <div><span>Published clips</span><b>${publishedCount}</b></div>
          </div>
          <button class="btn primary full" data-home-campaign="${escapeHtml(activeCampaign.id)}">Open Campaign Studio →</button>`
          :`<div class="mint-nb-empty">No active campaign.</div>`}
        </aside>
      </section>

      <section class="mint-nb-work">
        <div class="mint-nb-work-left">
          <div class="mint-nb-section-title"><div><span>▣</span><div><b>Recent projects</b><small>Your latest creative work</small></div></div><button class="mint-nb-link" data-page="projects" type="button">View all →</button></div>
          <div class="mint-nb-project-list">${recentRows}</div>
        </div>
        <div class="mint-nb-work-right">
          <div class="mint-nb-section-title"><div><span>⇧</span><div><b>Recent imports</b><small>Latest media added to Mint</small></div></div><button class="mint-nb-link" data-page="library" type="button">View all →</button></div>
          <div class="mint-nb-import-list">${importRows}</div>
        </div>
      </section>
    </div>`
  }
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
    const ingesting=Boolean(v&&((v.status==='ingesting'&&v.externalSource&&!hasLocal)||(state.campaignAssetImporting&&!hasLocal)));
    const analyzing=Boolean(v&&v.status==='analyzing');
    const working=ingesting||analyzing;
    const ingestError=String(v?.ingestion?.error||'');
    const ingestProgress=Math.max(0,Math.min(100,Number(analyzing?(v?.analysis?.progress??0):(v?.ingestion?.progress??0))));
    const videoTitle=v?`${v.originalName}${v.details?.duration?` · ${Math.round(v.details.duration)} sec`:''}`:'No video uploaded yet';
    const uploadLabel=state.uploadStatus==='uploading'?'Uploading…':state.uploadStatus==='analyzing'?'Analyzing video…':'Upload video';
    const analysisStage=String(v?.analysis?.stage||'').replace(/-/g,' ');
    const transcriptionPhase=String(v?.analysis?.transcriptionPhase||'');
    const transcriptionDetail=(v?.analysis?.stage==='transcription'||v?.analysis?.stage==='transcription-retry')?`${v?.analysis?.transcriptionChunks?` · ${v.analysis.transcriptionChunk||0}/${v.analysis.transcriptionChunks} chunks`:transcriptionPhase==='audio-prep'?' · preparing audio once':transcriptionPhase==='speech-map'?' · mapping speech':transcriptionPhase==='model-load'?' · loading Whisper':''}${v.analysis.transcriptionWorkers?` · ${v.analysis.transcriptionWorkers} workers${v.analysis.transcriptionWorkerMode==='auto'?' auto':''}`:''}${Number.isFinite(Number(v.analysis.transcriptionProgress))?` · ${Math.round(Number(v.analysis.transcriptionProgress||0))}% transcript`:''}${v.analysis.transcriptionCacheHits?` · ${v.analysis.transcriptionCacheHits} cached`:''}${v.analysis.transcriptionSkippedSeconds?` · ${Math.round(v.analysis.transcriptionSkippedSeconds/60)}m silence skipped`:''}`:'';
    const ingestTitle=analyzing?`Analyzing with Local AI…`:state.campaignAssetImporting?'Downloading campaign asset from Canto…':ingesting?'Downloading source automatically…':ingestError?'Automatic ingestion needs attention':linked?'Source linked — ready for automatic ingestion':v?'Upload another video':'Upload your first video';
    const ingestCopy=analyzing?`Local AI is processing the downloaded video. ${analysisStage?`Current step: ${escapeHtml(analysisStage)}.`:''} Transcription now runs in resumable chunks and automatically retries a stalled chunk.`:state.campaignAssetImporting?'ClipBoost is resolving and downloading the selected Canto asset with your authenticated campaign session. Analysis will start automatically when the file is ready.':ingesting?'ClipBoost is fetching the source, then it will run FFmpeg + local transcription automatically.':ingestError?`Automatic ingestion failed: ${escapeHtml(ingestError)}`:linked?'ClipBoost can fetch this public source automatically. Use this only for content you own or have permission to reuse.':'Drag & drop a video here, or choose a file from your computer.';
    const uploader=`<section class="card upload-card ${working?'mint-upload-compact-v134':''} ${linked?'needs-source':''} ${working?'is-ingesting':''}" id="dropZone">
      <input id="videoFile" class="native-file-input" type="file" accept=".mp4,video/mp4,video/*">
      <div class="upload-icon">${working?'↻':'⇧'}</div>
      <div class="upload-copy"><strong>${ingestTitle}</strong><span>${ingestCopy}</span>${working?`<div class="upload-progress"><i style="width:${Math.max(5,ingestProgress)}%"></i></div><small>${escapeHtml(v?.analysis?.stage||v?.ingestion?.stage||'working')}${transcriptionDetail} · ${Math.round(ingestProgress)}% overall</small>`:state.uploadStatus!=='idle'?`<div class="upload-progress"><i style="width:${state.uploadProgress}%"></i></div><small>${uploadLabel}</small>`:'<small class="upload-ready-hint">Automatic ingestion uses yt-dlp locally. Manual file upload remains available as a fallback.</small>'}</div>
      <div class="upload-actions">${linked&&!working?`<button class="btn primary" id="autoIngestBtn" type="button">${ingestError?'Retry automatic ingest':'Ingest automatically'}</button>`:''}<label class="btn ${linked?'secondary':'primary'} upload-file-label" for="videoFile">${linked?'Choose local file':v&&state.uploadStatus==='idle'?'Choose another video':uploadLabel}</label></div>
    </section>`;
    const embed=linked?externalEmbed(v.externalSource):'';
    const sourcePlaybackUrl=hasLocal?`${v.sourceUrl}${String(v.sourceUrl).includes('?')?'&':'?'}v=${encodeURIComponent(v.updatedAt||v.id||Date.now())}`:'';
    const realVideo=hasLocal?`<video id="sourceVideo" class="real-video" controls playsinline preload="metadata" src="${sourcePlaybackUrl}"></video>`:linked&&embed?`<iframe class="studio-source-embed" src="${embed}" title="${escapeHtml(v.originalName||'Linked source')}" frameborder="0" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe>`:`${mediaThumb(0,true)}<div class="caption">UPLOAD A <b>VIDEO</b></div><div class="play">▶</div>`;
    const previewCaptionRows=previewCaptionRowsForCandidate(c);
    const firstCaption=previewCaptionRows[0]?.text||c.hook||'';
    const clipStartValue=Number(c.start||0),clipEndValue=Math.max(clipStartValue+.25,Number(c.end||clipStartValue+30)),clipDuration=Math.max(.25,clipEndValue-clipStartValue);
    const clipPreviewLoading=state.candidatePreviewLoading&&state.candidatePreviewLoadingIndex===selected;
    const previewError=state.candidatePreviewError&&state.candidatePreviewLoadingIndex===selected?state.candidatePreviewError:'';
    const trackingInfo=c.previewMeta?.tracking||null;
    const trackingWarning=c.previewMeta?.trackingWarning||'';
    const trackingBadge=trackingInfo?`<div class="tracking-badge ${trackingWarning?'warning':''}"><span>◉</span><b>${trackingWarning?'Tracking fallback':`${trackingInfo.faceCountMax||0} face${Number(trackingInfo.faceCountMax||0)===1?'':'s'}`}</b><small>${trackingWarning?'Full source preserved':`${trackingInfo.speakerSwitches||0} switches · ${trackingInfo.reactionPeaks||0} reactions`}</small></div>`:'';
    const realPhone=hasLocal&&candidates.length?(c.previewUrl?`<div class="mint-short-video-frame-v222"><video id="shortVideo" class="real-short-video" controls preload="metadata" playsinline src="${c.previewUrl}" data-segmented="1"></video>${state.watermarkUrl?`<img id="liveWatermark" class="mint-live-watermark-v224" src="${escapeHtml(state.watermarkUrl)}" alt="Watermark" draggable="false" style="left:${Math.round(Number(state.watermarkX||.86)*100)}%;top:${Math.round(Number(state.watermarkY||.12)*100)}%;width:${Math.round(Number(state.watermarkScale||.18)*100)}%;opacity:${Number(state.watermarkOpacity||.9)}">`:''}<div id="liveHookTitle" style="position:absolute;z-index:7;left:${Math.round(Number(state.hookTitleX||.5)*100)}%;top:${Math.round(Number(state.hookTitleY||.12)*100)}%;width:84%;padding:.38em .58em;border-radius:.48em;background:transparent;color:#fff;font-family:'Arial Black','Segoe UI Black',sans-serif;font-weight:900;font-size:clamp(15px,2.7vw,30px);line-height:1.06;text-align:center;text-transform:uppercase;text-shadow:0 2px 4px rgba(0,0,0,.65);transform:translate(-50%,-50%);pointer-events:none;visibility:${state.hookTitleEnabled&&state.hookTitleText?'visible':'hidden'}">${escapeHtml(state.hookTitleText||'')}</div><div id="liveCaption" class="${liveCaptionClass()}" style="--caption-font-size:${liveCaptionFontSize(300)};top:${Math.round(currentCaptionY()*100)}%;${state.captionPreference==='off'?'display:none;':''}" role="button" tabindex="0" aria-label="Drag subtitles vertically">${escapeHtml(firstCaption||'Captions')}</div><div class="ai-score-chip">AI ${Math.round(c.score||0)}</div><div class="rendered-badge">EDITED PREVIEW</div>${trackingBadge}</div>`:`<div class="clip-preview-loading">${c.thumbnailUrl?`<img src="${c.thumbnailUrl}" alt="Selected clip">`:''}<div class="clip-preview-loading-overlay"><span class="preview-spinner">↻</span><strong>${clipPreviewLoading?'Rendering edited preview…':previewError?'Preview unavailable':'Preparing edited preview…'}</strong><small>${previewError?escapeHtml(previewError):'Applying silence cuts, reframing, zooms and captions to this preview.'}</small>${previewError?'<button class="btn secondary" id="retryClipPreview" type="button">Retry preview</button>':''}</div></div>`):`<div class="linked-phone-placeholder"><span>${linked?'SOURCE LINKED':'NO CLIP YET'}</span><b>${linked?'Upload the file to generate shorts':'Upload and analyze a video'}</b></div>`;
    const moments=candidates.length?`<div class="moments-head"><strong>${candidates.length} clip${candidates.length===1?'':'s'} generated</strong><span>Click any clip to preview it</span></div>${candidates.slice(0,40).map((m,i)=>`<button class="clip candidate-btn ${i===selected?'candidate-active':''}" data-candidate="${i}"><div class="clip-thumb">${m.thumbnailUrl?`<img src="${m.thumbnailUrl}" alt="clip thumbnail">`:mediaThumb(i)}<div class="score">${Math.round(m.score||0)}</div><span class="clip-tag">#${i+1} · ${m.editPlan?'AI edit plan':m.signals?.semantic?'Local AI':'AI pick'}</span></div><div class="clip-info"><strong>${escapeHtml(m.title||m.reason||'Candidate clip')}</strong><small>${formatTime(m.start||0)} – ${formatTime(m.end||0)} · ${Math.round(m.duration||0)}s</small>${m.quality?`<div class="quality-mini"><span>Hook ${Math.round(m.quality.hook||0)}</span><span>Story ${Math.round(m.quality.story||0)}</span><span>Complete ${Math.round(m.quality.completeness||0)}</span><span>Retention ${Math.round(m.quality.retention||0)}</span><span>View ${Math.round(m.viewPotential||m.quality.retention||0)}</span>${m.campaignFit?`<span class="campaign-fit-mini">Campaign ${Math.round(m.campaignFit.score||0)}</span>`:''}</div>`:''}${m.hook?`<em>${escapeHtml(m.hook)}</em>`:''}<p>${escapeHtml(m.reason||'')}</p></div></button>`).join('')}`:`<div class="studio-empty-moments">${analyzing?'Local AI is still analyzing this video. Only clips that pass the quality bar will appear.':linked?'Upload the linked source file to detect moments.':'Upload a video and ClipBoost will keep only moments that pass the quality bar.'}</div>`;
    const ai=v?.analysis||{};
    const transcriptPreview=(v?.transcript?.captions||[]).slice(0,10).map(x=>`<div class="transcript-line"><span>${formatTime(x.start)}</span><p>${escapeHtml(x.text)}</p></div>`).join('');
    const analysisStatus=hasLocal?`<section class="card ai-analysis-bar ${ai.aiError?'warning':''}"><div><span class="eyebrow">ANALYSIS ENGINE</span><strong>${escapeHtml(ai.engine||'Ready to analyze')}</strong><small>${ai.wordCount?`${formatCount(ai.wordCount)} cleaned words · ${formatCount(ai.captionCount||0)} caption groups${ai.transcriptCleanup?.removedWords?` · ${formatCount(ai.transcriptCleanup.removedWords)} fillers/repeats cleaned`:''}`:analyzing?`${ai.transcriptionPhase==='audio-prep'?'Preparing audio once':ai.transcriptionPhase==='speech-map'?'Mapping speech':ai.transcriptionPhase==='model-load'?'Loading Whisper':`Transcription · ${Math.round(Number(ai.transcriptionProgress||0))}% complete`}`:'Local faster-whisper + Quality Engine analysis'}</small></div><div class="analysis-pills"><span>${ai.scenesDetected||0} scenes</span><span>${ai.silencesDetected||0} pauses</span><span class="${ai.transcription&&ai.transcription!=='not-configured'?'ok':''}">${ai.transcription&&ai.transcription!=='not-configured'?'✓ transcript':analyzing?'Transcribing…':'No transcript'}</span>${ai.retryAttempt?`<span class="warning-pill">Retry ${ai.retryAttempt}</span>`:''}</div>${ai.warning?`<p>${escapeHtml(ai.warning)}</p>`:''}${ai.aiError?`<p>${escapeHtml(ai.aiError)}</p>`:''}</section>`:'';
    const campaign=v?.campaign||null;
    const campaignStudio=campaign?.id&&candidates.length?`<details class="card campaign-studio mint-collapsible-v131"><summary><span><span class="eyebrow">CAMPAIGN DETAILS</span><b>${escapeHtml(campaign.name||'Campaign')}</b></span><span>Fit ${Math.round(c.campaignFit?.score||0)} · View details ▾</span></summary><div class="mint-collapsible-body-v131"><section class="campaign-studio"><div class="section-head"><div><div class="eyebrow">CAMPAIGN MODE</div><h3>${escapeHtml(campaign.name||'Campaign')}</h3></div><span class="campaign-fit-badge">Fit ${Math.round(c.campaignFit?.score||0)}</span></div><div class="campaign-score-grid"><div><small>View potential</small><strong>${Math.round(c.viewPotential||c.quality?.retention||0)}</strong></div><div><small>Brief relevance</small><strong>${Math.round(c.campaignFit?.relevance||0)}</strong></div><div><small>Duration fit</small><strong>${Math.round(c.campaignFit?.durationFit||0)}</strong></div><div><small>Learned duration</small><strong>${c.campaignFit?.learnedBestDuration?`${Math.round(c.campaignFit.learnedBestDuration)}s`:'—'}</strong></div><div><small>Used before</small><strong>${c.campaignFit?.used?'Yes':'No'}</strong></div></div><p>${escapeHtml(String(campaign.brief||'').slice(0,280))}</p><div class="campaign-requirements">${(campaign.requiredHashtags||[]).slice(0,6).map(x=>`<span>${escapeHtml(x)}</span>`).join('')}${campaign.requiredCTA?`<span>CTA: ${escapeHtml(campaign.requiredCTA.slice(0,80))}</span>`:''}</div>${state.campaignCompliance?`<div class="campaign-check ${state.campaignCompliance.passed?'pass':'fail'}"><b>${state.campaignCompliance.passed?'✓ Ready for campaign export':'! Review campaign requirements'}</b>${(state.campaignCompliance.checks||[]).map(x=>`<span class="${x.ok?'ok':'bad'}">${x.ok?'✓':'×'} ${escapeHtml(x.label)} · ${escapeHtml(x.detail||'')}</span>`).join('')}</div>`:''}<div class="campaign-studio-actions"><button class="btn secondary" id="openStudioCampaignBtn">◎ Open campaign</button><button class="btn secondary" id="campaignCheckBtn">Check campaign</button><button class="btn primary" id="campaignVariantsBtn">Generate hook variants</button></div>${Array.isArray(state.campaignVariants)&&state.campaignVariants.length?`<div class="campaign-variants">${state.campaignVariants.map((x,i)=>`<button type="button" class="campaign-variant" data-campaign-variant="${i}"><b>${escapeHtml(x.title||`Variant ${i+1}`)}</b><span>${formatTime(x.start)}–${formatTime(x.end)} · View ${Math.round(x.viewPotential||0)} · Fit ${Math.round(x.campaignFit?.score||0)}</span></button>`).join('')}</div>`:''}</section></div></details>`:'';
    const transcriptPanel=v?.transcript?.captions?.length?`<details class="card transcript-panel mint-collapsible-v131"><summary><span><span class="eyebrow">TRANSCRIPT</span><b>Word-synced captions</b></span><span>${formatCount(v.transcript.words?.length||0)} words · View ▾</span></summary><div class="mint-collapsible-body-v131"><div class="transcript-list">${transcriptPreview}</div></div></details>`:'';
    const activeSummary={cuts:Number(editApplied?.silenceCuts??planSummary.cuts??0),disfluencies:Number(editApplied?.speechCleanupCuts??0),zooms:Number(editApplied?.zooms??planSummary.zooms??0),reframes:editApplied?.reframed===false?0:Number(planSummary.reframes??0)};
    const generalStudio=!campaign?.id;
    const studioMode=state.studioMode||'shorts';
    const autoShorts=generalStudio&&studioMode==='shorts';
    const longVideo=generalStudio&&studioMode==='long';
    const shortReview=Boolean(candidates.length&&!longVideo);
    const sourcePending=Boolean(v&&!candidates.length&&((linked&&!hasLocal)||working));
    const showEditorWorkspace=Boolean(v&&!sourcePending);
    const shortsCountControl='';
    const workflowSwitcher=generalStudio?`<section class="mint-editor-workflow-switcher"><div><span class="eyebrow">CREATION MODE</span><b>What do you want to make?</b><small>Library and uploads stay in AI Studio. Campaign media never enters this workspace.</small></div><div class="mint-editor-workflow-actions"><button type="button" data-studio-mode="shorts" class="${studioMode==='shorts'?'active':''}"><span>✦</span><b>Auto Shorts</b><small>Find, edit and export the strongest short-form moments.</small></button><button type="button" data-studio-mode="long" class="${studioMode==='long'?'active':''}"><span>▰</span><b>Long Video</b><small>Work from the full source with transcript, cleanup and AI editing.</small></button></div></section>`:'';
    return `<div class="content mint-studio-page-v142 ${generalStudio?'mint-general-editor-v216':'mint-campaign-source-editor-v216'} ${!v?'mint-studio-empty-v221':''}">${workflowSwitcher}
      <section class="mint-studio-header-v142">
        <div>
          <div class="eyebrow">AI VIDEO EDITOR</div>
          <h1>AI Studio</h1>
          <p>${studioMode==='long'?'Edit long-form video with transcript-aware AI tools, cleanup and smart framing.':'Turn Library videos or uploads into polished Shorts automatically.'}</p>
        </div>
        <div class="mint-studio-header-actions-v142">
          <span class="mint-editor-source-badge">${generalStudio?'AI Studio · General':'Campaign asset'}</span>
          <button class="btn primary mint-header-export-v131" id="publishBtn" ${hasLocal&&!state.exportBusy?'':'disabled'}>${state.exportBusy?'Preparing…':'Publish clip'}</button>
        </div>
      </section>

      ${shortsCountControl}
      ${longVideo?`<section class="mint-long-video-banner"><div><span class="eyebrow">LONG VIDEO WORKSPACE</span><b>Full-source editing</b><small>Keep the entire source in context. Use transcript, silence detection and AI Director while the dedicated long-form timeline evolves.</small></div><span>Full source · ${formatDuration(timelineDuration)}</span></section>`:''}
      <section class="mint-studio-toolstrip-v142">
        <article><span>▣</span><div><b>Auto Clips</b><small>Find the strongest moments</small></div></article>
        <article><span>CC</span><div><b>Auto Captions</b><small>Social-ready captions</small></div></article>
        <article><span>✦</span><div><b>Smart Edits</b><small>Cut, clean and reframe</small></div></article>
        <article><span>◎</span><div><b>AI Highlights</b><small>Score key moments</small></div></article>
      </section>

      ${shortReview?'':analysisStatus}
      ${shortReview?'':(!hasLocal||working||ingestError?uploader:`<div class="mint-source-change-v131"><span>Source ready · ${escapeHtml(videoTitle)}</span><label class="btn secondary upload-file-label" for="videoFile">Change video</label><input id="videoFile" class="native-file-input" type="file" accept=".mp4,video/mp4,video/*"></div>`)}

      ${showEditorWorkspace?`<div class="mint-studio-workspace-v142">
        <main class="mint-studio-main-v142">
          ${shortReview?`<section class="card mint-shorts-review-v220">
            <header class="mint-shorts-review-head-v220">
              <div><div class="eyebrow">SELECTED SHORT</div><h2>${escapeHtml(c.title||c.reason||`Clip #${selected+1}`)}</h2><p>${formatTime(c.start||0)} – ${formatTime(c.end||0)} · ${Math.round(c.duration||clipDuration)}s</p></div>
              <div class="mint-shorts-format-v220"><b>9:16</b><span>TikTok · Instagram Reels · YouTube Shorts</span></div>
            </header>
            <div class="mint-shorts-preview-shell-v220">
              <div class="mint-shorts-preview-stage-v220">${realPhone}</div>
              <div class="mint-shorts-preview-side-v220">
                <span class="eyebrow">AUTO SHORTS</span>
                <strong>Social format applied automatically</strong>
                <p>Mint reframes the source vertically, follows faces and speakers, and renders captions inside a 9:16 safe area.</p>
                <div class="mint-manual-trim">
                  <div class="mint-manual-trim-head"><div><span>MANUAL CUT</span><b>Retouch start / end</b></div><em>${c.manualTrim?'Adjusted':'AI cut'}</em></div>
                  <div class="mint-trim-row">
                    <div class="mint-trim-label"><span>Start</span><b id="manualTrimStartValue">${formatTime(clipStartValue)}</b></div>
                    <div class="mint-trim-control"><button type="button" data-trim-boundary="start" data-trim-delta="-0.25">−0.25s</button><input id="manualTrimStart" type="range" min="0" max="${Math.max(0,clipEndValue-.25)}" step="0.05" value="${clipStartValue.toFixed(2)}"><button type="button" data-trim-boundary="start" data-trim-delta="0.25">+0.25s</button></div>
                  </div>
                  <div class="mint-trim-row">
                    <div class="mint-trim-label"><span>End</span><b id="manualTrimEndValue">${formatTime(clipEndValue)}</b></div>
                    <div class="mint-trim-control"><button type="button" data-trim-boundary="end" data-trim-delta="-0.25">−0.25s</button><input id="manualTrimEnd" type="range" min="${Math.min(timelineDuration,clipStartValue+.25)}" max="${timelineDuration}" step="0.05" value="${clipEndValue.toFixed(2)}"><button type="button" data-trim-boundary="end" data-trim-delta="0.25">+0.25s</button></div>
                  </div>
                  <div class="mint-manual-trim-foot"><span id="manualTrimDuration">${clipDuration.toFixed(1)}s selected</span><button type="button" id="resetManualTrim" ${c.manualTrim?'':'disabled'}>Reset AI cut</button></div>
                </div>
                <div class="mint-shorts-preview-actions-v220">
                  <button class="btn secondary" type="button" id="previousCandidateBtn" ${selected<=0?'disabled':''}>← Previous</button>
                  <span>Clip ${selected+1} / ${candidates.length}</span>
                  <button class="btn secondary" type="button" id="nextCandidateBtn" ${selected>=candidates.length-1?'disabled':''}>Next →</button>
                </div>
                <div class="mint-export-choice-v225"><button class="btn secondary" type="button" id="previewDownloadBtn">Download files</button><button class="btn primary" type="button" id="previewPublishBtn">Publish</button></div>
              </div>
            </div>
            <div class="mint-shorts-candidate-rail-v220">${moments}</div>
          </section>`:''}
          <section class="card mint-media-workspace-v127 ${shortReview?'mint-source-secondary-v220':''}">
            <header class="mint-studio-source-head-v142">
              <div><div class="eyebrow">${shortReview?'SOURCE & TIMELINE':'MEDIA WORKSPACE'}</div><h3>${escapeHtml(videoTitle)}</h3></div>
              <span class="mint-source-status-v142">${shortReview?'Shorts ready':hasLocal?'Ready for AI':linked?'Linked':'No media'}</span>
            </header>
            ${shortReview?'':`<div class="video mint-studio-video-v142 mint-studio-video-compact-v127">${realVideo}</div>`}
            <div class="mint-workspace-timeline-v127">
            <div class="section-head"><div><div class="eyebrow">${longVideo?'FULL SOURCE TIMELINE':'SMART TIMELINE'}</div><h3>${longVideo?'Long video timeline':'Timeline & detected moments'}</h3></div><span class="muted">${analyzing?`Local AI: ${escapeHtml(analysisStage||'analyzing')}${transcriptionDetail} · ${Math.round(ingestProgress)}%`:hasLocal?(v.candidates?.length||0)+' strong clip'+((v.candidates?.length||0)===1?'':'s')+' found':ingesting?'Automatic ingestion in progress':linked?'Source linked — ingest to analyze':'Upload a video to analyze it'}</span></div>
            <div class="timeline mint-studio-timeline-v142">${timelineMarkup}</div>
            ${shortReview?'':`<div class="moments mint-studio-moments-v142">${autoShorts?moments:`<div class="mint-long-video-guide"><b>AI detected ${candidates.length} highlight${candidates.length===1?'':'s'}</b><span>Highlights stay available as navigation markers, but Long Video keeps the full source as the primary edit.</span></div>${moments}`}</div>`}
            </div>
          </section>
          ${!shortReview&&candidates.length?`<section class="card mint-selected-preview-v128 mint-selected-preview-compact-v131">
            <div class="section-head"><div><div class="eyebrow">SELECTED CLIP</div><h3>${escapeHtml(c.title||c.reason||`Clip #${selected+1}`)}</h3></div><span class="muted">Clip ${selected+1} / ${candidates.length}</span></div>
            <div class="mint-selected-preview-stage-v128">${realPhone}</div>
            <div class="mint-selected-preview-actions-v128">
              <button class="btn secondary" type="button" id="previousCandidateBtn" ${selected<=0?'disabled':''}>← Previous</button>
              <span>${formatTime(c.start||0)} – ${formatTime(c.end||0)} · ${Math.round(c.duration||clipDuration)}s</span>
              <button class="btn secondary" type="button" id="nextCandidateBtn" ${selected>=candidates.length-1?'disabled':''}>Next →</button>
              <button class="btn secondary" type="button" id="previewDownloadBtn">Download files</button>\n              <button class="btn primary" type="button" id="previewPublishBtn">Publish</button>
            </div>
          </section>`:''}
        </main>

        <aside class="mint-studio-side-v142">
          <section class="card controls mint-ai-tools-v142">
            <div class="section-head"><div><div class="eyebrow">AI TOOLS</div><h3>Automatic editing</h3></div><span>✦</span></div>
            <div class="auto-director-card">
              <div class="auto-director-status"><span class="auto-director-dot"></span><div><strong>Auto Director</strong><small>Adapts every clip to speech, scenes and framing.</small></div></div>
              <div class="auto-director-tags">${autoTags.map(x=>`<span>${escapeHtml(x)}</span>`).join('')}</div>
              ${autoDirector?.reason?`<p>${escapeHtml(autoDirector.reason)}</p>`:''}
            </div>
            <div class="selectrow"><span>Captions</span><select id="captionPreferenceSelect"><option value="auto" ${state.captionPreference==='auto'?'selected':''}>Auto (recommended)</option><option value="on" ${state.captionPreference==='on'?'selected':''}>Always on</option><option value="off" ${state.captionPreference==='off'?'selected':''}>Off</option></select></div>
            <div class="caption-color-control"><div class="caption-color-head"><span>Caption color</span><small>Social presets</small></div><div class="caption-color-palette">${[['auto','Auto'],['white','White'],['yellow','Yellow'],['lime','Lime'],['cyan','Cyan'],['pink','Pink'],['red','Red']].map(([value,label])=>`<button type="button" class="caption-color-chip ${state.captionColor===value?'active':''}" data-caption-color="${value}"><i class="caption-swatch swatch-${value}">${value==='auto'?'A':''}</i><span>${label}</span></button>`).join('')}</div></div><div class="mint-live-caption-controls-v134"><div class="caption-color-head"><span>Live caption design</span><small>Selected clip</small></div><div class="mint-caption-control-grid-v134"><label>Style<select id="captionStyleSelect"><option value="bold" ${state.captionStyle==='bold'?'selected':''}>Bold</option><option value="impact" ${state.captionStyle==='impact'?'selected':''}>Impact</option><option value="pop" ${state.captionStyle==='pop'?'selected':''}>Pop</option><option value="box" ${state.captionStyle==='box'?'selected':''}>Box</option><option value="karaoke" ${state.captionStyle==='karaoke'?'selected':''}>Karaoke</option><option value="clean" ${state.captionStyle==='clean'?'selected':''}>Clean</option><option value="neon" ${state.captionStyle==='neon'?'selected':''}>Neon</option><option value="minimal" ${state.captionStyle==='minimal'?'selected':''}>Minimal</option></select></label><label>Font<select id="captionFontSelect"><option value="social" ${state.captionFont==='social'?'selected':''}>Social Heavy</option><option value="impact" ${state.captionFont==='impact'?'selected':''}>Impact Heavy</option><option value="arial-black" ${state.captionFont==='arial-black'?'selected':''}>Arial Black</option><option value="segoe-black" ${state.captionFont==='segoe-black'?'selected':''}>Segoe UI Black</option></select></label><label>Effect<select id="captionEffectSelect"><option value="active-word" ${state.captionEffect==='active-word'?'selected':''}>Active Word</option><option value="word-pop" ${state.captionEffect==='word-pop'?'selected':''}>Word Pop</option><option value="karaoke" ${state.captionEffect==='karaoke'?'selected':''}>Karaoke</option><option value="keyword-color" ${state.captionEffect==='keyword-color'?'selected':''}>Highlight Keywords</option><option value="clean-bold" ${state.captionEffect==='clean-bold'?'selected':''}>Clean Bold</option></select></label><label>Size<select id="captionSizeSelect"><option value="small" ${state.captionSize==='small'?'selected':''}>Small</option><option value="medium" ${state.captionSize==='medium'?'selected':''}>Medium</option><option value="large" ${state.captionSize==='large'?'selected':''}>Large</option></select></label><label>Position<select id="captionPositionSelect"><option value="top" ${state.captionPosition==='top'&&!Number.isFinite(Number(state.captionY))?'selected':''}>Top</option><option value="center" ${state.captionPosition==='center'&&!Number.isFinite(Number(state.captionY))?'selected':''}>Center</option><option value="bottom" ${state.captionPosition==='bottom'&&!Number.isFinite(Number(state.captionY))?'selected':''}>Bottom</option>${Number.isFinite(Number(state.captionY))?'<option value="custom" selected>Custom</option>':''}</select></label></div><div class="mint-caption-size-slider-v227"><div><span>Exact size</span><b id="captionScaleValue">${Math.round(Number(state.captionScale||1)*100)}%</b></div><input id="captionScaleRange" type="range" min="40" max="200" step="1" value="${Math.round(Number(state.captionScale||1)*100)}"></div><small>Drag the subtitle text directly on the preview. Changes are instant.</small></div><div class="mint-hook-title-controls"><div class="caption-color-head"><span>Hook title</span><small>Preview instantanée</small></div><div class="selectrow"><span>Afficher</span><select id="hookTitleEnabledSelect"><option value="off" ${!state.hookTitleEnabled?'selected':''}>Off</option><option value="on" ${state.hookTitleEnabled?'selected':''}>On</option></select></div><label class="mint-hook-title-field"><span>Texte</span><input id="hookTitleTextInput" type="text" maxlength="120" value="${escapeHtml(state.hookTitleText||'')}" placeholder="${escapeHtml(c?.title||c?.hook||'Ajoute un titre hook')}"></label><div class="selectrow"><span>Durée</span><select id="hookTitleDurationSelect"><option value="3" ${state.hookTitleDuration==='3'?'selected':''}>3 sec</option><option value="5" ${state.hookTitleDuration==='5'?'selected':''}>5 sec</option><option value="8" ${state.hookTitleDuration==='8'?'selected':''}>8 sec</option><option value="full" ${state.hookTitleDuration==='full'?'selected':''}>Tout le clip</option></select></div><div class="mint-center-actions"><button class="btn secondary" id="hookTitleFromAiBtn" type="button">Utiliser le titre IA</button><button class="btn secondary" id="centerHookXBtn" type="button">Centrer X</button><button class="btn secondary" id="centerHookBtn" type="button">Centre vidéo</button></div></div>
            ${!(state.video?.campaign?.id||state.video?.campaignId)?`<div class="mint-source-subtitles-v228">
              <div class="caption-color-head"><span>Source subtitles</span><small>Baked-in text</small></div>
              <div class="selectrow mint-source-subtitles-row-v228"><span>Remove Twitch / source captions</span><select id="sourceSubtitleModeSelect"><option value="keep" ${state.sourceSubtitleMode==='keep'?'selected':''}>Keep</option><option value="crop" ${state.sourceSubtitleMode==='crop'?'selected':''}>Crop out</option><option value="hide" ${state.sourceSubtitleMode==='hide'?'selected':''}>Hide</option></select></div>
              ${state.sourceSubtitleMode!=='keep'?`<div class="mint-source-subtitles-range-v228"><div><span>Bottom area</span><b id="sourceSubtitleBottomValue">${Math.round(Number(state.sourceSubtitleBottom||.15)*100)}%</b></div><input id="sourceSubtitleBottomRange" type="range" min="6" max="28" step="1" value="${Math.round(Number(state.sourceSubtitleBottom||.15)*100)}"><small>${state.sourceSubtitleMode==='crop'?'Crop this much from the bottom of the original video.':'Cover this much of the lower video area.'}</small></div>`:''}
            </div>`:''}
                        <div class="mint-watermark-controls-v224">
              <div class="caption-color-head"><span>Image watermark</span><small>Optional</small></div>
              ${state.watermarkUrl?`<div class="mint-watermark-file-v224"><img src="${escapeHtml(state.watermarkUrl)}" alt=""><span>${escapeHtml(state.watermarkName||'Watermark')}</span><button class="btn secondary" type="button" id="removeWatermarkBtn">Remove</button></div>
              <div class="mint-watermark-sliders-v224"><label>Size <input id="watermarkScaleRange" type="range" min="5" max="42" value="${Math.round(Number(state.watermarkScale||.18)*100)}"></label><label>Opacity <input id="watermarkOpacityRange" type="range" min="10" max="100" value="${Math.round(Number(state.watermarkOpacity||.9)*100)}"></label></div><div class="mint-center-actions"><button class="btn secondary" id="centerWatermarkXBtn" type="button">Centrer X</button><button class="btn secondary" id="centerWatermarkBtn" type="button">Centre vidéo</button></div><small>Drag the image directly anywhere on the preview.</small>`:`<label class="btn secondary full mint-watermark-upload-v224" for="watermarkFile">＋ Add image watermark</label><input id="watermarkFile" class="native-file-input" type="file" accept="image/png,image/jpeg,image/webp"><small>PNG, JPG or WebP · max 10 MB</small>`}
            </div>
            <div class="quality-explainer"><b>Automatic per clip</b><span>Framing, face safety, silence cuts, speech cleanup, captions and zooms adapt to the source.</span></div>
            ${editPlan?`<div class="edit-plan-card"><span class="eyebrow">AUTO EDIT PLAN</span><strong>${activeSummary.cuts} silence cuts · ${activeSummary.disfluencies} cleanups · ${activeSummary.zooms} zooms</strong><small>${activeSummary.reframes} reframe pass${trackingInfo?` · ${trackingInfo.faceCountMax||0} faces max`:''}${editApplied?.preset?` · ${escapeHtml(editApplied.preset)} profile`:''}</small></div>`:''}
            <button class="btn primary full generate" id="generateVariationsBtn" ${hasLocal&&!analyzing&&!state.regenerating?'':'disabled title="Wait for analysis to finish"'}>${state.regenerating?'↻ Generating clips…':analyzing?'↻ Local AI analyzing…':hasLocal?(longVideo?'✦ Refresh AI highlights':'✦ Generate variations'):ingesting?'↻ Processing source…':'⇧ Ingest source first'}</button>
          </section>
        </aside>
      </div>`:`<section class="mint-studio-empty-flow-v221"><span><b>1</b> Upload source</span><i>→</i><span><b>2</b> Local AI analysis</span><i>→</i><span><b>3</b> Review Shorts</span><i>→</i><span><b>4</b> Publish</span></section>`}
      ${shortReview?analysisStatus:''}
      ${shortReview?(hasLocal?`<div class="mint-source-change-v131 mint-source-change-after-review-v221"><span>Source · ${escapeHtml(videoTitle)}</span><label class="btn secondary upload-file-label" for="videoFile">Change video</label><input id="videoFile" class="native-file-input" type="file" accept=".mp4,video/mp4,video/*"></div>`:uploader):''}

      ${campaignStudio}
      ${transcriptPanel}
    </div>`
  }

  function formatTime(sec){const s=Math.max(0,Number(sec)||0);const m=Math.floor(s/60);return `${String(m).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`}

  async function ensureStudioPreflight({needsDownload=false}={}){
    try{
      const r=await fetch('/api/system/health');
      const h=await readJsonResponse(r,'AI Studio preflight failed');
      state.aiPreflight=h;
      const critical=[['FFmpeg',h.ffmpeg],['FFprobe',h.ffprobe],['Python',h.python],['faster-whisper',h.whisper]];
      if(needsDownload)critical.push(['yt-dlp',h.ytDlp]);
      const missing=critical.filter(([,x])=>!x?.ok).map(([name])=>name);
      if(missing.length){
        showNotice({kind:'danger',eyebrow:'AI Studio preflight',title:'Local AI is not ready',message:`Missing: ${missing.join(', ')}. Open Settings → System health before processing.`});
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

  async function uploadVideo(file){
    if(!file) return;
    if(!(await ensureStudioPreflight({needsDownload:false})))return;
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
      const r=await fetch(`/api/videos/${uploaded.id}/analyze`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clipCount:'auto'})}); const data=await readJsonResponse(r,'Analysis failed');
      state.video=data; state.selectedCandidate=0; state.uploadStatus='idle'; state.uploadProgress=100; render();
      pollProjectUntilSettled(uploaded.id);
    }catch(e){state.uploadStatus='idle'; state.uploadProgress=0; showNotice({kind:'danger',title:'Upload failed',message:e.message||'Upload failed'}); render();}
  }

  function captionPresetY(position=state.captionPosition){
    return position==='top'?.18:position==='center'?.50:.82;
  }
  function currentCaptionY(){
    const y=Number(state.captionY);
    return Number.isFinite(y)?Math.max(.12,Math.min(.88,y)):captionPresetY();
  }
  function liveCaptionClass(){
    return ['mint-social-caption-v223',`style-${state.captionStyle||'bold'}`,`size-${state.captionSize||'medium'}`].join(' ');
  }
  function captionRenderScale(){
    return state.captionSize==='large'?.086:state.captionSize==='small'?.044:.072;
  }
  function liveCaptionFontSize(frameWidth=0){
    const scale=Math.max(.4,Math.min(2,Number(state.captionScale||1)));
    const width=Math.max(120,Number(frameWidth)||300);
    return `${Math.max(10,width*captionRenderScale()*scale).toFixed(2)}px`;
  }
  function liveCaptionOutlineSize(frameWidth=0){
    const width=Math.max(120,Number(frameWidth)||300);
    const style=state.captionStyle||'bold';
    const ratio=style==='minimal'?.0032:style==='clean'?.0052:style==='neon'?.0060:style==='box'?.0025:style==='impact'?.0074:style==='pop'?.0068:style==='karaoke'?.0064:.0065;
    return Math.max(1,width*ratio);
  }
  function compactPreviewCaptions(rows=[],maxWords=4,maxChars=22){
    const phrases=[
      ['thank','you'],['thanks','so','much'],['so','much'],['do','you'],['did','you'],['are','you'],['can','you'],['could','you'],['would','you'],
      ['you','want','to'],['want','to'],['going','to'],['have','to'],['need','to'],['got','to'],['let','me'],['i','want'],['i','need'],['i','think'],['i','know'],
      ['what','do','you'],['how','do','you'],['why','do','you'],['merci','beaucoup'],['est-ce','que'],['tu','veux'],['vous','voulez'],['je','veux'],['je','pense'],
      ['je','sais'],['on','va'],['il','faut'],['parce','que'],['pour','que']
    ];
    const clean=w=>String(w||'').toLowerCase().replace(/^[("'‘’“”\[]+|[)"'‘’“”\],.!?…:;]+$/g,'').replace(/[’]/g,"'");
    const phraseLen=(tokens,index)=>{
      const rem=tokens.slice(index,index+maxWords).map(t=>clean(t.word));
      for(const p of phrases)if(p.length<=maxWords&&p.length<=rem.length&&p.every((w,i)=>rem[i]===w))return p.length;
      return 0;
    };
    const timed=[];
    for(const row of rows||[]){
      const words=String(row?.text||'').trim().split(/\s+/).filter(Boolean);if(!words.length)continue;
      const start=Number(row.start||0),end=Math.max(start+.05,Number(row.end||start+.05)),span=end-start;
      words.forEach((word,i)=>timed.push({word,start:start+span*(i/words.length),end:start+span*((i+1)/words.length)}));
    }
    const out=[];let i=0;
    while(i<timed.length){
      let take=phraseLen(timed,i);
      if(!take){
        take=1;
        for(let n=2;n<=maxWords&&i+n<=timed.length;n++){
          const text=timed.slice(i,i+n).map(t=>t.word).join(' ');
          if(text.length>maxChars)break;
          take=n;
          if(phraseLen(timed,i+n)&&n>=2)break;
          if(/[.!?…]$/.test(timed[i+n-1].word))break;
        }
      }
      const chunk=timed.slice(i,i+take);
      out.push({start:Number(chunk[0].start.toFixed(3)),end:Number(Math.max(chunk[0].start+.05,chunk.at(-1).end).toFixed(3)),text:chunk.map(t=>t.word).join(' ')});
      i+=take;
    }
    return out;
  }
  function previewCaptionRowsForCandidate(cand){
    if(!cand)return[];
    // AI Studio and Campaign Studio must consume the exact same transcript
    // timeline. Campaign candidates may carry legacy caption rows, but those
    // are now fallback-only when the project has no transcript captions.
    const absolute=(state.video?.transcript?.captions||[]).filter(row=>Number(row.end||0)>=Number(cand.start||0)&&Number(row.start||0)<=Number(cand.end||0)).map(row=>({
      ...row,
      start:Math.max(0,Number(row.start||0)-Number(cand.start||0)),
      end:Math.max(.05,Math.min(Number(cand.end||0),Number(row.end||0))-Number(cand.start||0))
    }));
    return compactPreviewCaptions(absolute.length?absolute:(cand.captions||[]),4,22);
  }

  function previewCaptionWordsForCandidate(cand){
    if(!cand)return[];
    const start=Number(cand.start||0),end=Number(cand.end||start);
    const raw=(state.video?.transcript?.words||state.video?.transcript?.rawWords||[])
      .filter(w=>w?.word&&Number(w.end||0)>start+.01&&Number(w.start||0)<end-.01)
      .map(w=>({
        word:String(w.word||'').trim(),
        start:Math.max(0,Number(w.start||0)-start),
        end:Math.max(.03,Math.min(end,Number(w.end||0))-start)
      }))
      .filter(w=>w.word&&w.end>w.start)
      .sort((a,b)=>a.start-b.start);
    const cleanWord=w=>String(w||'').toLowerCase().replace(/^\W+|\W+$/g,'');
    const words=[];
    for(const w of raw){
      const prev=words[words.length-1];
      const same=prev&&cleanWord(prev.word)&&cleanWord(prev.word)===cleanWord(w.word);
      const gap=same?Math.max(0,Number(w.start||0)-Number(prev.end||0)):Infinity;
      if(same&&gap<=.18){prev.end=Math.max(prev.end,w.end);continue}
      words.push({...w});
    }
    return words;
  }
  function captionWordImportant(word=''){
    const raw=String(word||'').trim();
    const lex=raw.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}%]+$/gu,'');
    return /\d/.test(raw)||raw.length>=8||/^(secret|erreur|problème|vérité|jamais|toujours|résultat|argent|million|mille|pourcent|important|incroyable|impossible|meilleur|pire|mistake|problem|truth|never|always|result|money|percent|crazy|best|worst)$/.test(lex);
  }

    function currentRenderOptions(){const isCampaign=Boolean(state.video?.campaign?.id||state.video?.campaignId);const isLong=state.studioMode==='long'&&!isCampaign;return {autoDirector:true,editorContext:isCampaign?'campaign':'general',outputFormat:isLong?'source':'shorts-9x16',captionPreference:state.captionPreference||'auto',captionColor:state.captionColor||'auto',captionStyle:state.captionStyle||'bold',captionFont:state.captionFont||'social',captionEffect:state.captionEffect||'active-word',hookTitleEnabled:Boolean(state.hookTitleEnabled),hookTitleText:String(state.hookTitleText||''),hookTitleDuration:String(state.hookTitleDuration||'5'),hookTitleX:Number(state.hookTitleX||.5),hookTitleY:Number(state.hookTitleY||.12),captionSize:state.captionSize||'medium',captionScale:Number(state.captionScale||1),captionPosition:state.captionPosition||'bottom',captionY:currentCaptionY(),sourceSubtitleMode:isCampaign?'keep':(state.sourceSubtitleMode||'keep'),sourceSubtitleBottom:Number(state.sourceSubtitleBottom||.15),watermarkUrl:state.watermarkUrl||'',watermarkX:Number(state.watermarkX||.86),watermarkY:Number(state.watermarkY||.12),watermarkScale:Number(state.watermarkScale||.18),watermarkOpacity:Number(state.watermarkOpacity||.9)}}
  async function uploadWatermark(file){
    if(!file)return;
    try{
      const fd=new FormData();fd.append('watermark',file);
      const r=await fetch('/api/watermarks',{method:'POST',body:fd});
      const data=await readJsonResponse(r,'Could not upload watermark');
      state.watermarkUrl=data.url;state.watermarkName=data.originalName||file.name||'Watermark';
      state.watermarkX=.86;state.watermarkY=.12;state.watermarkScale=.18;state.watermarkOpacity=.9;
      persistEditorPrefs();render();
    }catch(e){showNotice({kind:'danger',title:'Watermark upload failed',message:e.message||'Could not upload watermark image.'})}
  }
    function invalidateRenderedPreviews(){for(const cand of (state.video?.candidates||[])){cand.previewUrl=null;cand.previewEdited=false;cand.previewMeta=null}state.candidatePreviewError='';state.candidatePreviewLoading=false;}
  async function loadPlatformConnections({quiet=false}={}){
    if(state.platformConnectionsLoading)return;
    state.platformConnectionsLoading=true;
    try{
      state.platformConnections=await window.clipboostDesktop?.getPlatformConnections?.()||{};
    }catch(e){
      if(!quiet)showNotice({kind:'danger',eyebrow:'Platform connections',title:'Could not load connections',message:e.message||'Could not read platform connection status.'});
    }finally{state.platformConnectionsLoading=false;render();if(state.page==='analytics'&&state.platformConnections?.youtube?.connected&&!state.youtubeAnalytics&&!state.youtubeAnalyticsLoading)setTimeout(()=>loadYouTubeAnalytics({quiet:true}),0)}
  }
  function youtubeVideoId(value=''){
    const raw=String(value||'').trim();if(!raw)return '';
    if(/^[A-Za-z0-9_-]{11}$/.test(raw))return raw;
    try{
      const u=new URL(raw);
      if(/youtu\.be$/i.test(u.hostname))return String(u.pathname.split('/').filter(Boolean)[0]||'').slice(0,11);
      if(/youtube\.com$/i.test(u.hostname)||/\.youtube\.com$/i.test(u.hostname)){
        if(u.searchParams.get('v'))return String(u.searchParams.get('v')).slice(0,11);
        const parts=u.pathname.split('/').filter(Boolean),idx=parts.findIndex(x=>['shorts','live','embed'].includes(x));
        if(idx>=0&&parts[idx+1])return String(parts[idx+1]).slice(0,11);
      }
    }catch{}
    return '';
  }
  async function loadYouTubeAnalytics({force=false,quiet=true}={}){
    if(state.youtubeAnalyticsLoading||!state.platformConnections?.youtube?.connected||!window.clipboostDesktop?.getYouTubeAnalytics)return;
    state.youtubeAnalyticsLoading=true;
    state.youtubeAnalyticsError='';
    if(!quiet)render();
    try{
      const data=await window.clipboostDesktop.getYouTubeAnalytics({force});
      if(data?.ok===false)throw new Error(data.error||'Could not load YouTube analytics');
      state.youtubeAnalytics=data||null;
      state.analyticsOrganicPosts=(data?.posts||[]).map(p=>({
        ...p,
        _id:String(p.id||p.postId||p.url||''),
        _kind:'organic',
        _campaignId:'',
        _campaignName:'',
        _currency:'USD',
        _platform:'youtube',
        _title:String(p.title||'YouTube video'),
        _date:p.publishedAt||null,
        _views:Math.max(0,Number(p.views||0)),
        _likes:Number.isFinite(Number(p.likes))?Math.max(0,Number(p.likes)):null,
        _comments:Number.isFinite(Number(p.comments))?Math.max(0,Number(p.comments)):null,
        _shares:null,
        _revenue:0,
        _thumb:p.thumbnail||'',
        _youtubeId:String(p.id||p.postId||youtubeVideoId(p.url)||'')
      }));
    }catch(e){
      state.youtubeAnalyticsError=e.message||'Could not load YouTube analytics';
      if(!quiet)showNotice({kind:'danger',eyebrow:'YouTube analytics',title:'Sync failed',message:state.youtubeAnalyticsError});
    }finally{
      state.youtubeAnalyticsLoading=false;
      render();
      scheduleYouTubeAnalyticsRefresh();
    }
  }
  function scheduleYouTubeAnalyticsRefresh(){
    clearTimeout(window.__clipboostYouTubeAnalyticsRefresh);
    if(state.page!=='analytics'||!state.platformConnections?.youtube?.connected)return;
    window.__clipboostYouTubeAnalyticsRefresh=setTimeout(()=>loadYouTubeAnalytics({force:true,quiet:true}),300000);
  }
  async function connectPlatformAccount(provider){
    if(state.platformConnectBusy)return;
    const current=state.platformConnections?.[provider];
    if(current&&!current.configured){
      return showNotice({kind:'warning',eyebrow:'Platform connections',title:`${current.label||provider} setup required`,message:`Add the OAuth client credentials for ${current.label||provider} in ClipBoost .env, then try Connect again.`,detail:'The OAuth callback URL and exact environment variable names are documented in .env.example.'});
    }
    state.platformConnectBusy=provider;render();
    try{
      const result=await window.clipboostDesktop?.connectPlatform?.(provider);
      if(result?.ok===false)throw new Error(result.error||'Connection failed.');
      state.platformConnections=await window.clipboostDesktop?.getPlatformConnections?.()||state.platformConnections;
      if(provider==='youtube')await loadYouTubeAnalytics({force:true,quiet:true});
      showNotice({kind:'success',eyebrow:'Platform connections',title:`${state.platformConnections?.[provider]?.label||provider} connected`,message:'The account authorization was completed and stored securely on this computer.'});
    }catch(e){
      showNotice({kind:'danger',eyebrow:'Platform connections',title:'Connection failed',message:e.message||'The platform could not be connected.'});
    }finally{state.platformConnectBusy='';render()}
  }
  async function disconnectPlatformAccount(provider){
    if(state.platformConnectBusy)return;
    state.platformConnectBusy=provider;render();
    try{
      const result=await window.clipboostDesktop?.disconnectPlatform?.(provider);
      if(result?.ok===false)throw new Error(result.error||'Disconnect failed.');
      state.platformConnections=await window.clipboostDesktop?.getPlatformConnections?.()||state.platformConnections;
    }catch(e){showNotice({kind:'danger',eyebrow:'Platform connections',title:'Disconnect failed',message:e.message||'Could not disconnect this account.'})}
    finally{state.platformConnectBusy='';render()}
  }
  async function exportCurrent(mode='publish'){
    const v=state.video; if(!v?.sourceUrl) return showNotice({kind:'warning',title:'Source file required',message:'Upload or ingest the source file before exporting this clip.'});
    const index=state.selectedCandidate||0;const start=Number(document.getElementById('clipStart')?.value||v.candidates?.[index]?.start||0); const end=Number(document.getElementById('clipEnd')?.value||v.candidates?.[index]?.end||start+30);
    state.exportBusy=true;render();
    try{
      if(v.campaign?.id){const checkRes=await fetch(`/api/videos/${encodeURIComponent(v.id)}/campaign-check`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({index,start,end,options:currentRenderOptions()})});const check=await readJsonResponse(checkRes,'Campaign check failed');state.campaignCompliance=check;if(!check.passed){const failed=(check.checks||[]).filter(x=>!x.ok);state.exportBusy=false;render();return showNotice({kind:'warning',eyebrow:'Campaign check',title:`${failed.length||1} campaign check${failed.length===1?'':'s'} failed`,message:failed.length?failed.map(x=>x.label).join(' · '):'Review the failed campaign requirements below before publishing.',detail:failed.length?failed.map(x=>`${x.label}: ${x.detail||'Requirement not met'}`).join('  •  '):'Open Campaign Studio rules for details.'})}}
      const r=await fetch(`/api/videos/${v.id}/export`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({index,start,end,options:currentRenderOptions()})});const data=await readJsonResponse(r,'Could not prepare clip');state.lastExport={...data,projectId:v.id,index,title:v.candidates?.[index]?.title||v.originalName||'Clip'};
      if(mode==='download'){
        if(window.clipboostDesktop?.openExportsFolder)await window.clipboostDesktop.openExportsFolder();
        else if(data.url){const a=document.createElement('a');a.href=data.url;a.download=data.filename||'clip.mp4';document.body.appendChild(a);a.click();a.remove();}
        showNotice({kind:'success',eyebrow:'Export',title:'Files ready',message:`${data.filename||'Your clip'} is ready in the ClipBoost exports folder.`});
      }else{
        state.publishActivePlatform=state.publishActivePlatform||'tiktok';
        navigate('publish');
      }}
    catch(e){showNotice({kind:'danger',title:mode==='download'?'Download preparation failed':'Publish preparation failed',message:e.message||'Could not prepare the selected clip'})} finally {state.exportBusy=false;render()}
  }
  async function exportAll(){
    const v=state.video;if(!v?.sourceUrl||!(v.candidates||[]).length)return;
    if(state.exportAllBusy)return;state.exportAllBusy=true;render();
    try{const r=await fetch(`/api/videos/${v.id}/export-all`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({options:currentRenderOptions()})});const data=await readJsonResponse(r,'Export all failed');showNotice({kind:data.blockedCount?'warning':'success',title:'Export complete',message:`${data.count||0} edited clips exported${data.blockedCount?` · ${data.blockedCount} blocked by campaign checks`:''}.`});if(data.count&&window.clipboostDesktop?.openExportsFolder)window.clipboostDesktop.openExportsFolder();}
    catch(e){showNotice({kind:'danger',title:'Export failed',message:e.message||'Export all failed'})}finally{state.exportAllBusy=false;render()}
  }
  function chart(){return `<svg viewBox="0 0 900 260" preserveAspectRatio="none">${[40,90,140,190,240].map(y=>`<line class="gridline" x1="0" x2="900" y1="${y}" y2="${y}"/>`).join('')}<polyline class="line1" points="0,215 70,198 140,202 210,168 280,175 350,141 420,150 490,112 560,130 630,92 700,104 780,55 900,31"/><polyline class="line2" points="0,224 70,215 140,204 210,190 280,193 350,166 420,172 490,152 560,160 630,137 700,145 780,105 900,88"/><polyline class="line3" points="0,230 70,225 140,218 210,209 280,214 350,198 420,202 490,183 560,188 630,172 700,178 780,150 900,134"/></svg>`}
  function publish(){
    const clip=state.lastExport;
    const platforms=[['tiktok','TikTok','♪'],['instagram','Instagram','◎'],['youtube','YouTube','▶'],['facebook','Facebook','f'],['x','X','𝕏']];
    const active=state.publishActivePlatform&&platforms.some(x=>x[0]===state.publishActivePlatform)?state.publishActivePlatform:(platforms.find(x=>state.publishNetworks[x[0]])?.[0]||'tiktok');
    const current=platforms.find(x=>x[0]===active)||platforms[0];
    const baseTitle=clip?.title||state.video?.candidates?.[state.selectedCandidate||0]?.title||'New short';
    const draft=state.publishDrafts[active]||{};
    const selectedCount=platforms.filter(([id])=>state.publishNetworks[id]).length;
    const chips=platforms.map(([id,label,icon])=>`<button type="button" class="mint-pub-chip-v135 ${active===id?'active':''} ${state.publishNetworks[id]?'selected':''}" data-publish-tab="${id}"><span>${icon}</span><b>${label}</b><i>${state.publishNetworks[id]?'✓':'+'}</i></button>`).join('');
    const destinations=platforms.map(([id,label,icon])=>{
      const conn=state.platformConnections?.[id];
      const connected=Boolean(conn?.connected);
      const configured=Boolean(conn?.configured);
      const status=state.platformConnectionsLoading&&!conn?'Checking…':connected?'Connected':configured?'Not connected':'Setup required';
      const action=connected
        ? `<div class="mint-pub-connection-actions-v226"><button class="btn secondary" type="button" data-platform-connect="${id}">Reconnect</button><button class="mint-pub-disconnect-v226" type="button" data-platform-disconnect="${id}">Disconnect</button></div>`
        : `<button class="btn ${configured?'primary':'secondary'} mint-pub-connect-btn-v226" type="button" data-platform-connect="${id}" ${state.platformConnectBusy===id?'disabled':''}>${state.platformConnectBusy===id?'Connecting…':configured?'Connect':'Setup required'}</button>`;
      return `<div class="mint-pub-destination-v135 mint-pub-destination-connected-v226 ${state.publishNetworks[id]?'on':''} ${connected?'connected':''}"><span>${icon}</span><div class="mint-pub-destination-copy-v226"><b>${label}</b><small>${status}</small></div><div class="mint-pub-destination-controls-v226">${action}<label><input type="checkbox" data-publish-network="${id}" ${state.publishNetworks[id]?'checked':''}></label></div></div>`;
    }).join('');
    return `<div class="content mint-publish-page-v135">
      <header class="mint-pub-header-v135"><div><span class="eyebrow">DISTRIBUTION</span><h1>Publish</h1><p>One clip. Every channel. Customize the message for each audience.</p></div><div class="mint-pub-header-actions-v135"><button class="btn secondary" id="savePublishDraftsBtn">Save draft</button><button class="btn primary" id="publishSelectedBtn" ${clip&&selectedCount?'':'disabled'}>Publish to ${selectedCount||0} network${selectedCount===1?'':'s'}</button></div></header>
      <section class="mint-pub-source-v135">
        <div class="mint-pub-source-thumb-v135"><span>9:16</span><b>▶</b></div>
        <div class="mint-pub-source-copy-v135"><span class="eyebrow">SELECTED CLIP</span><h3>${escapeHtml(clip?.title||clip?.filename||'No clip selected')}</h3><p>${clip?'Clip ready · Customize the post before publishing.':'Choose a clip in AI Studio, then press Publish.'}</p></div>
        <button class="btn secondary" data-page="studio">${clip?'Change clip':'Open AI Studio'}</button>
      </section>
      <nav class="mint-pub-platforms-v135">${chips}</nav>
      <div class="mint-pub-layout-v135">
        <main class="card mint-pub-composer-v135">
          <div class="mint-pub-composer-head-v135"><div><span class="mint-pub-platform-icon-v135">${current[2]}</span><div><span class="eyebrow">CUSTOMIZE FOR</span><h2>${current[1]}</h2></div></div><span class="mint-pub-status-v135 ${state.platformConnections?.[active]?.connected?'connected':''}">${state.platformConnections?.[active]?.connected?'Connected':state.publishNetworks[active]?'Selected · account not connected':'Not selected'}</span></div>
          <label class="mint-pub-field-v135"><span>Title <small>${String(draft.title||baseTitle).length}/150</small></span><input data-publish-title="${active}" value="${escapeHtml(draft.title||baseTitle)}" maxlength="150" placeholder="Give this post a strong title"></label>
          <label class="mint-pub-field-v135"><span>Description <small>${String(draft.description||'').length} characters</small></span><textarea data-publish-description="${active}" rows="7" placeholder="Write a caption tailored to ${current[1]}…">${escapeHtml(draft.description||'')}</textarea></label>
          <div class="mint-pub-airow-v135"><button type="button" class="mint-pub-ai-v135" disabled>✦ Generate caption <small>Coming next</small></button><button type="button" class="mint-pub-ai-v135" disabled># Suggest hashtags <small>Coming next</small></button></div>
          <div class="mint-pub-composer-foot-v135"><span>Changes are kept per network.</span><button type="button" class="btn ${state.publishNetworks[active]?'secondary':'primary'}" id="toggleActivePublishNetwork">${state.publishNetworks[active]?'Remove destination':'Add '+current[1]}</button></div>
        </main>
        <aside class="mint-pub-side-v135">
          <section class="card mint-pub-destinations-v135"><div class="section-head"><div><span class="eyebrow">DESTINATIONS</span><h3>${selectedCount} selected</h3></div></div>${destinations}</section>
          <section class="card mint-pub-preview-v135"><div class="section-head"><div><span class="eyebrow">POST PREVIEW</span><h3>${current[1]}</h3></div></div><div class="mint-pub-phone-v135"><div class="mint-pub-phone-video-v135"><span>9:16</span><b>▶</b></div><div class="mint-pub-phone-copy-v135"><b>${escapeHtml(draft.title||baseTitle)}</b><p>${escapeHtml(draft.description||'Your platform-specific description will appear here.')}</p></div></div></section>
        </aside>
      </div>
      <footer class="mint-pub-connect-v135"><span>●</span><div><b>Platform connections</b><small>Connect accounts above. OAuth tokens are stored encrypted on this computer.</small></div><button class="btn secondary" type="button" id="refreshPlatformConnections">Refresh</button></footer>
    </div>`;
  }

  function analytics(){
    const campaignsList=state.campaigns?.campaigns||[];
    const platformMeta={
      tiktok:{label:'TikTok',icon:'♪'},
      youtube:{label:'YouTube',icon:'▶'},
      instagram:{label:'Instagram',icon:'◎'},
      twitch:{label:'Twitch',icon:'▣'},
      x:{label:'X',icon:'𝕏'},
      facebook:{label:'Facebook',icon:'f'},
      unknown:{label:'Other',icon:'•'}
    };
    const youtubePosts=Array.isArray(state.analyticsOrganicPosts)?state.analyticsOrganicPosts:[];
    const youtubeById=new Map(youtubePosts.map(p=>[String(p._youtubeId||p.id||p.postId||''),p]).filter(([id])=>id));
    const campaignYoutubeIds=new Set();
    const campaignPosts=campaignsList.flatMap(c=>(Array.isArray(c.posts)?c.posts:[]).map((p,i)=>{
      const platform=String(p.platform||'unknown').toLowerCase();
      const ytId=platform==='youtube'?String(p.postId||youtubeVideoId(p.url)||''):'';
      if(ytId)campaignYoutubeIds.add(ytId);
      const live=ytId?youtubeById.get(ytId):null;
      return {
        ...p,
        _id:String(p.id||p.postId||p.url||`${c.id}-${i}`),
        _kind:'campaign',
        _campaignId:c.id,
        _campaignName:c.name||'Campaign',
        _currency:c.currency||'USD',
        _platform:platform,
        _title:String(live?._title||p.title||p.caption||p.description||p.url||`Campaign post ${i+1}`),
        _date:live?._date||p.publishedAt||p.submittedAt||p.createdAt||c.updatedAt||c.createdAt||null,
        _views:live ? Number(live._views||0) : Math.max(0,Number(p.views||0)),
        _likes:live ? live._likes : (Number.isFinite(Number(p.likes??p.likeCount))?Math.max(0,Number(p.likes??p.likeCount)):null),
        _comments:live ? live._comments : (Number.isFinite(Number(p.comments??p.commentCount))?Math.max(0,Number(p.comments??p.commentCount)):null),
        _shares:Number.isFinite(Number(p.shares??p.shareCount))?Math.max(0,Number(p.shares??p.shareCount)):null,
        _revenue:Math.max(0,Number(p.payoutConfirmed||p.revenue||0)),
        _thumb:live?._thumb||p.thumbnail||p.thumbnailUrl||p.previewUrl||'',
        _youtubeId:ytId
      };
    }));
    const organicPosts=youtubePosts.filter(p=>!campaignYoutubeIds.has(String(p._youtubeId||'')));
    const allPosts=[...campaignPosts,...organicPosts];

    const scope=state.analyticsScope||'all';
    const platform=state.analyticsPlatform||'all';
    const query=String(state.analyticsSearch||'').trim().toLowerCase();
    const periodDays=Math.max(1,Number(state.analyticsPeriod||30));
    const cutoff=Date.now()-periodDays*86400000;
    const inPeriod=p=>!p._date||new Date(p._date).getTime()>=cutoff;
    const filtered=allPosts.filter(p=>
      (scope==='all'||p._kind===scope)&&
      (platform==='all'||p._platform===platform)&&
      inPeriod(p)&&
      (!query||[`${p._title}`,`${p._campaignName||""}`,`${p._platform}`].join(' ').toLowerCase().includes(query))
    );

    const totals=filtered.reduce((a,p)=>{a.views+=Number(p._views||0);if(Number.isFinite(p._likes)){a.likes+=p._likes;a.likesKnown++}if(Number.isFinite(p._comments)){a.comments+=p._comments;a.commentsKnown++}if(Number.isFinite(p._shares)){a.shares+=p._shares;a.sharesKnown++}a.revenue+=Number(p._revenue||0);a.posts++;return a;},{views:0,likes:0,comments:0,shares:0,revenue:0,posts:0,likesKnown:0,commentsKnown:0,sharesKnown:0});
    const campaignSummary=campaignsList.reduce((a,c)=>{const t=c.totals||{};a.estimated+=Number(t.estimatedRevenue||0);a.confirmed+=Number(t.confirmedRevenue||c.confirmedPayout||0);return a;},{estimated:0,confirmed:0});
    const engagement=totals.views?((totals.likes+totals.comments+(totals.sharesKnown?totals.shares:0))/totals.views*100):0;
    const avgViews=totals.posts?Math.round(totals.views/totals.posts):0;

    const platformTotals=new Map();
    for(const p of filtered){
      const key=p._platform||'unknown';
      const cur=platformTotals.get(key)||{views:0,posts:0};
      cur.views+=p._views;cur.posts++;platformTotals.set(key,cur);
    }
    const platformRows=[...platformTotals.entries()].sort((a,b)=>b[1].views-a[1].views);
    const bestPlatform=platformRows[0]||null;
    const bestPost=[...filtered].sort((a,b)=>b._views-a._views)[0]||null;
    const bestCampaign=campaignsList.map(c=>({c,views:Number(c.totals?.totalViews||0),revenue:Number(c.totals?.estimatedRevenue||0)})).sort((a,b)=>b.views-a.views)[0]||null;
    const bestOrganic=[...organicPosts].sort((a,b)=>Number(b._views||0)-Number(a._views||0))[0]||null;

    const statIcon=name=>{
      const icons={
        views:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.7"/></svg>',
        likes:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.2 4.7 13C1 9.3 3.5 4 7.8 4c2 0 3.3 1 4.2 2.3C12.9 5 14.2 4 16.2 4 20.5 4 23 9.3 19.3 13L12 20.2Z"/></svg>',
        comments:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 9 9 0 0 1-3.6-.8L4 20l1.4-4A7 7 0 0 1 4 11.5 7.5 7.5 0 0 1 12 4a7.5 7.5 0 0 1 8 7.5Z"/></svg>',
        shares:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5"/></svg>',
        engagement:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V10M10 19V5M15 19v-7M20 19V8"/></svg>',
        posts:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h8l4 4v14H7Z"/><path d="M15 3v5h4M10 12h6M10 16h6"/></svg>',
        youtube:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 8.3a3 3 0 0 0-2.1-2.1C17 5.7 12 5.7 12 5.7s-5 0-6.9.5A3 3 0 0 0 3 8.3 31 31 0 0 0 2.5 12 31 31 0 0 0 3 15.7a3 3 0 0 0 2.1 2.1c1.9.5 6.9.5 6.9.5s5 0 6.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-3.7 31 31 0 0 0-.5-3.7Z"/><path class="fill-bg" d="m10 9 5 3-5 3Z"/></svg>'
      };
      return icons[name]||icons.views;
    };
    const miniSeries=metric=>{
      const n=7,arr=Array(n).fill(0),span=Math.max(1,periodDays*86400000);
      for(const p of filtered){const ts=p._date?new Date(p._date).getTime():Date.now();const idx=Math.max(0,Math.min(n-1,Math.floor((ts-cutoff)/span*n)));arr[idx]+=Number(p[metric]||0)}
      return arr;
    };
    const sparkSvg=(metric,accent)=>{
      const values=miniSeries(metric),max=Math.max(...values,0);
      if(!max)return '<svg class="mint-kpi-spark empty" viewBox="0 0 100 34" preserveAspectRatio="none"><path d="M2 28 L98 28"/></svg>';
      const pts=values.map((v,i)=>[2+i*(96/(values.length-1)),30-(v/max)*24]);
      const d=pts.map((p,i)=>`${i?'L':'M'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
      const area=`${d} L 98 32 L 2 32 Z`;
      return `<svg class="mint-kpi-spark ${accent}" viewBox="0 0 100 34" preserveAspectRatio="none"><path class="area" d="${area}"/><path class="line" d="${d}"/></svg>`;
    };
    const metricCard=(iconName,label,value,accent='red',sub='Tracked data',metric='_views')=>`<div class="mint-stat-card"><div class="mint-stat-label"><span class="mint-stat-icon ${accent}">${statIcon(iconName)}</span><small>${label}</small></div><strong>${value}</strong><span class="mint-stat-sub">${sub}</span>${sparkSvg(metric,accent)}</div>`;
    const scopeTab=(id,label,count='')=>`<button type="button" data-analytics-scope="${id}" class="${scope===id?'active':''}">${label}${count!==''?` <em>(${count})</em>`:''}</button>`;
    const platformBtn=(id,label,icon)=>`<button type="button" data-analytics-platform="${id}" class="${platform===id?'active':''}"><span>${icon}</span>${label}</button>`;

    const totalPlatformViews=Math.max(1,platformRows.reduce((s,[,v])=>s+v.views,0));
    const donutStops=[];let cursor=0;
    const donutColors=['#ff263b','#20d9e8','#ff34d2','#7a4dff','#f59e0b','#9ca3af'];
    platformRows.forEach(([key,v],i)=>{const pct=v.views/totalPlatformViews*100;donutStops.push(`${donutColors[i%donutColors.length]} ${cursor}% ${cursor+pct}%`);cursor+=pct});
    const donutStyle=donutStops.length?`background:conic-gradient(${donutStops.join(',')})`:'background:#171717';
    const platformLegend=platformRows.length?platformRows.slice(0,6).map(([key,v],i)=>{const meta=platformMeta[key]||platformMeta.unknown;const pct=totals.views?Math.round(v.views/totals.views*100):0;return `<div><span><i style="background:${donutColors[i%donutColors.length]}"></i>${escapeHtml(meta.label)}</span><b>${formatCount(v.views)} <small>(${pct}%)</small></b></div>`}).join(''):'<div class="mint-stats-empty-inline">No tracked platform data yet.</div>';

    const revenueBars=campaignsList.slice(0,12).map(c=>Number(c.totals?.estimatedRevenue||0));
    const maxRevenue=Math.max(1,...revenueBars);
    const revenueChart=revenueBars.length?revenueBars.map((v,i)=>`<i style="height:${Math.max(6,Math.round(v/maxRevenue*100))}%" title="${escapeHtml(campaignsList[i]?.name||'Campaign')}: ${formatMoney(v,campaignsList[i]?.currency||'USD')}"></i>`).join(''):'<span class="mint-stats-empty-inline">No campaign revenue yet.</span>';

    const bucketCount=10,buckets=Array.from({length:bucketCount},()=>({campaign:0,organic:0}));
    for(const p of allPosts){
      const ts=p._date?new Date(p._date).getTime():Date.now();
      if(ts<cutoff)continue;
      const idx=Math.min(bucketCount-1,Math.max(0,Math.floor((ts-cutoff)/(periodDays*86400000)*bucketCount)));
      buckets[idx][p._kind==='campaign'?'campaign':'organic']++;
    }
    const trendMax=Math.max(1,...buckets.flatMap(x=>[x.campaign,x.organic]));
    const linePath=(key)=>buckets.map((b,i)=>`${i?'L':'M'} ${Math.round(i/(bucketCount-1)*100)} ${Math.round(42-(b[key]/trendMax)*34)}`).join(' ');
    const trendSvg=`<svg viewBox="0 0 100 46" preserveAspectRatio="none"><path class="organic" d="${linePath('organic')}"/><path class="campaign" d="${linePath('campaign')}"/></svg>`;

    const postThumb=p=>p?(`${p._thumb?`<img src="${escapeHtml(p._thumb)}" alt="">`:'<span class="mint-stat-thumb-fallback">▶</span>'}`):'<span class="mint-stat-thumb-fallback">—</span>';
    const featureCard=(title,p,extra='')=>p?`<article class="mint-stat-feature"><h4>${title}</h4><div class="mint-stat-feature-body"><div class="mint-stat-feature-thumb">${postThumb(p)}</div><div><strong>${escapeHtml(p._title)}</strong><small>${escapeHtml((platformMeta[p._platform]||platformMeta.unknown).label)}${p._date?' · '+new Date(p._date).toLocaleDateString():''}</small><div class="mint-stat-feature-metrics"><span>◉ ${formatCount(p._views)}</span><span>♥ ${formatCount(p._likes)}</span><span>◌ ${formatCount(p._comments)}</span></div>${extra}</div></div></article>`:`<article class="mint-stat-feature"><h4>${title}</h4><div class="mint-stat-feature-empty">No tracked post yet.</div></article>`;

    const rows=filtered.sort((a,b)=>new Date(b._date||0)-new Date(a._date||0)).map(p=>{
      const meta=platformMeta[p._platform]||platformMeta.unknown;
      const er=p._views?((p._likes+p._comments+p._shares)/p._views*100):0;
      return `<tr>
        <td><span class="mint-post-thumb">${postThumb(p)}</span></td>
        <td><strong>${escapeHtml(p._title)}</strong></td>
        <td><span class="mint-platform-cell">${meta.icon} ${escapeHtml(meta.label)}</span></td>
        <td><span class="mint-type-pill ${p._kind}">${p._kind==='campaign'?'Campaign':'Organic'}</span></td>
        <td>${p._kind==='campaign'?escapeHtml(p._campaignName||'Campaign'):'—'}</td>
        <td>${p._date?new Date(p._date).toLocaleDateString():'—'}</td>
        <td>${formatCount(p._views)}</td><td>${Number.isFinite(p._likes)?formatCount(p._likes):'—'}</td><td>${Number.isFinite(p._comments)?formatCount(p._comments):'—'}</td><td>${Number.isFinite(p._shares)?formatCount(p._shares):'—'}</td>
        <td>${er?er.toFixed(1)+'%':'—'}</td><td class="mint-revenue-cell">${p._revenue?formatMoney(p._revenue,p._currency||'USD'):'—'}</td>
      </tr>`;
    }).join('');

    return `<div class="content mint-stats-page">
      <section class="mint-stats-heading">
        <div><div class="eyebrow">ANALYTICS</div><h1>Stats & <span>Performance</span></h1><p>Track all your posts, campaign results and growth across platforms.</p></div>
        <div class="mint-stats-heading-actions">
          <div class="mint-youtube-connect ${state.platformConnections?.youtube?.connected?'connected':''}">
            <span class="mint-youtube-mark">${statIcon('youtube')}</span>
            <div><b>${escapeHtml(state.youtubeAnalytics?.channel?.title||'YouTube')}</b><small>${state.youtubeAnalyticsLoading?'Syncing metrics…':state.youtubeAnalyticsError?'Sync error':state.platformConnections?.youtube?.connected?(state.youtubeAnalytics?.syncedAt?'Synced '+new Date(state.youtubeAnalytics.syncedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'Connected'):'Connect your channel'}</small></div>
            <button type="button" id="analyticsYoutubeConnect">${state.platformConnectBusy==='youtube'?'Connecting…':state.youtubeAnalyticsLoading?'Syncing…':state.platformConnections?.youtube?.connected?'Refresh':'Connect'}</button>
          </div>
          <div class="mint-period-dropdown ${state.analyticsPeriodOpen?'open':''}">
            <button type="button" id="analyticsPeriodToggle"><span class="mint-calendar-icon">▣</span><b>${periodDays===7?'Last 7 days':periodDays===30?'Last 30 days':periodDays===90?'Last 90 days':'Last year'}</b><span>⌄</span></button>
            <div class="mint-period-menu">
              <button type="button" data-analytics-period="7" class="${periodDays===7?'active':''}">Last 7 days</button>
              <button type="button" data-analytics-period="30" class="${periodDays===30?'active':''}">Last 30 days</button>
              <button type="button" data-analytics-period="90" class="${periodDays===90?'active':''}">Last 90 days</button>
              <button type="button" data-analytics-period="365" class="${periodDays===365?'active':''}">Last year</button>
            </div>
          </div>
        </div>
      </section>
      <section class="mint-stats-toolbar">
        <div class="mint-scope-tabs">${scopeTab('all','All Posts',allPosts.length)}${scopeTab('campaign','Campaign Posts',campaignPosts.length)}${scopeTab('organic','Organic Posts',organicPosts.length)}</div>
        <div class="mint-platform-tabs">${platformBtn('all','All Platforms','')}${platformBtn('tiktok','TikTok','♪')}${platformBtn('youtube','YouTube','▶')}${platformBtn('instagram','Instagram','◎')}${platformBtn('twitch','Twitch','▣')}${platformBtn('x','X','𝕏')}</div>
      </section>
      <section class="mint-stat-grid">
        ${metricCard('views','Total Views',formatCount(totals.views),'red',totals.posts?`${formatCount(avgViews)} avg / post`:'No tracked posts','_views')}
        ${metricCard('likes','Total Likes',totals.likesKnown?formatCount(totals.likes):'—','pink',totals.likesKnown?'Live platform metrics':'Not available','_likes')}
        ${metricCard('comments','Total Comments',totals.commentsKnown?formatCount(totals.comments):'—','cyan',totals.commentsKnown?'Live platform metrics':'Not available','_comments')}
        ${metricCard('shares','Total Shares',totals.sharesKnown?formatCount(totals.shares):'—','orange',totals.sharesKnown?'Live platform metrics':'YouTube does not expose shares','_shares')}
        ${metricCard('engagement','Engagement Rate',engagement?engagement.toFixed(1)+'%':'—','green','Likes + comments + shares / views','_views')}
        ${metricCard('posts','Posts Published',String(totals.posts),'purple',scope==='organic'?'Organic tracking ready':'Tracked publications','_views')}
      </section>
      <section class="mint-stats-charts">
        <article class="mint-stat-panel revenue"><header><div><span>●</span><b>Estimated Revenue (Campaigns)</b></div><strong>${formatMoney(campaignSummary.estimated,campaignsList[0]?.currency||'USD')}</strong></header><div class="mint-revenue-bars">${revenueChart}</div></article>
        <article class="mint-stat-panel platform"><header><b>Views by Platform</b></header><div class="mint-platform-chart"><div class="mint-donut" style="${donutStyle}"><span><b>${formatCount(totals.views)}</b><small>Total Views</small></span></div><div class="mint-platform-legend">${platformLegend}</div></div></article>
        <article class="mint-stat-panel trend"><header><b>Posts Trend</b><div><span class="campaign-dot">●</span> Campaign <span class="organic-dot">●</span> Organic</div></header><div class="mint-trend-chart">${trendSvg}</div></article>
      </section>
      <section class="mint-stat-features">
        ${featureCard('Best Performing Post',bestPost)}
        ${bestPlatform?`<article class="mint-stat-feature compact"><h4>Top Platform</h4><div class="mint-stat-platform-top"><span>${(platformMeta[bestPlatform[0]]||platformMeta.unknown).icon}</span><div><strong>${escapeHtml((platformMeta[bestPlatform[0]]||platformMeta.unknown).label)}</strong><small>${formatCount(bestPlatform[1].views)} views</small></div></div></article>`:'<article class="mint-stat-feature compact"><h4>Top Platform</h4><div class="mint-stat-feature-empty">No tracked data yet.</div></article>'}
        ${bestCampaign?`<article class="mint-stat-feature compact"><h4>Top Campaign</h4><div><strong>${escapeHtml(bestCampaign.c.name||'Campaign')}</strong><small>${formatMoney(bestCampaign.revenue,bestCampaign.c.currency||'USD')} estimated</small><b class="mint-feature-big">${formatCount(bestCampaign.views)} views</b></div></article>`:'<article class="mint-stat-feature compact"><h4>Top Campaign</h4><div class="mint-stat-feature-empty">No campaign data yet.</div></article>'}
        ${featureCard('Top Organic Post',bestOrganic)}
      </section>
      <section class="mint-posts-panel">
        <header><div><h3>All Posts</h3><div class="mint-posts-tabs">${scopeTab('all','All',allPosts.length)}${scopeTab('campaign','Campaign',campaignPosts.length)}${scopeTab('organic','Organic',organicPosts.length)}</div></div><div class="mint-post-actions"><input id="analyticsSearch" value="${escapeHtml(state.analyticsSearch||'')}" placeholder="Search posts…"><button id="analyticsExport" type="button">⇩ Export</button></div></header>
        <div class="mint-posts-scroll"><table><thead><tr><th>Thumbnail</th><th>Title</th><th>Platform</th><th>Type</th><th>Campaign</th><th>Date ↓</th><th>Views</th><th>Likes</th><th>Comments</th><th>Shares</th><th>Eng. Rate</th><th>Revenue</th></tr></thead><tbody>${rows||`<tr><td colspan="12"><div class="mint-table-empty">No tracked posts for this filter yet.</div></td></tr>`}</tbody></table></div>
      </section>
    </div>`;
  }
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
    return `<div class="yt-vod-item library-media-row"><button class="yt-thumb yt-preview-trigger" type="button" data-preview-kind="${previewKind}" data-preview-id="${escapeHtml(item.id)}" data-preview-title="${escapeHtml(item.title)}" data-preview-url="${escapeHtml(item.url||'')}"><img src="${escapeHtml(thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer"><span>${formatDuration(item.duration)}</span><i class="preview-play">▶</i></button><div class="yt-vod-copy"><div class="platform-line"><span class="${isYT?'youtube-dot':'twitch-dot'}">${icon}</span><small>${escapeHtml(creator.name)} · ${relativeDate(item.publishedAt||item.createdAt)}</small></div><strong>${escapeHtml(item.title)}</strong><div class="yt-stats">${stats.map(x=>`<span>${x}</span>`).join('')}</div></div><div class="vod-actions"><button class="btn primary send-studio-btn" type="button" data-send-studio-mode="shorts" data-send-studio-platform="${escapeHtml(platform)}" data-send-studio-creator="${escapeHtml(creator.id)}" data-send-studio-type="${escapeHtml(type)}" data-send-studio-id="${escapeHtml(item.id)}">✦ Generate Shorts</button><button class="btn secondary send-studio-btn" type="button" data-send-studio-mode="long" data-send-studio-platform="${escapeHtml(platform)}" data-send-studio-creator="${escapeHtml(creator.id)}" data-send-studio-type="${escapeHtml(type)}" data-send-studio-id="${escapeHtml(item.id)}">▰ Edit video</button><button class="btn secondary preview-btn" type="button" data-preview-kind="${previewKind}" data-preview-id="${escapeHtml(item.id)}" data-preview-title="${escapeHtml(item.title)}" data-preview-url="${escapeHtml(item.url||'')}">▶ Preview</button><a class="btn secondary" href="${escapeHtml(item.url||'#')}" target="_blank" rel="noreferrer">Open ↗</a></div></div>`;
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
    return `<div class="content mint-library-nb-v1418"><div class="page-title"><div><div class="eyebrow">Auto-ingestion</div><h1>Library</h1><p>Keep YouTube uploads and Twitch VODs, clips and live streams separated and easy to browse.</p></div><div class="library-head-actions">${status}<button class="btn secondary" id="refreshLibrary" ${!creators.length||state.libraryRefreshBusy?'disabled':''}>${state.libraryRefreshBusy?'↻ Refreshing…':`↻ Refresh ${platform==='youtube'?'YouTube':'Twitch'}`}</button><button class="btn primary" id="addCreator">+ Add creator</button></div></div>${state.libraryError&&!state.addCreatorOpen?`<div class="library-banner error">${escapeHtml(state.libraryError)}</div>`:state.libraryRefreshMessage?`<div class="library-banner success">${escapeHtml(state.libraryRefreshMessage)}</div>`:''}<div class="library-platform-tabs"><button data-library-platform="youtube" class="${platform==='youtube'?'active':''}">▶ YouTube <span>${allCreators.filter(c=>c.platform==='youtube').length}</span></button><button data-library-platform="twitch" class="${platform==='twitch'?'active':''}">▣ Twitch <span>${allCreators.filter(c=>c.platform==='twitch').length}</span></button></div><section class="card library-card"><div class="section-head"><h3>Following on ${platform==='youtube'?'YouTube':'Twitch'}</h3><span class="muted">${creators.length} ${platform==='youtube'?'creator':'streamer'}${creators.length===1?'':'s'}</span></div><div class="creator-row">${state.libraryLoading&&!state.libraryLoaded?'<div class="library-loading">Loading library…</div>':creatorsHtml}</div></section><div class="library-toolbar"><div class="tabs library-tabs">${subTabs}</div><div class="library-filters">${creatorFilter}${sortSelect}</div></div><section class="card library-card yt-vod-list">${state.libraryLoading&&!state.libraryLoaded?'<div class="library-loading big">Fetching your library…</div>':mediaHtml}${historyFooter}</section>${modal}${preview}${livePlayer}</div>`;
  }
  function escapeHtml(value=''){return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function creatorAvatarMarkup(c,size='normal'){const name=(c&&c.name)||'Creator';const initial=escapeHtml(String(name).trim().charAt(0).toUpperCase()||'?');const src=escapeHtml((c&&c.avatar)||'');const img=src?'<img src="'+src+'" alt="'+escapeHtml(name)+'" referrerpolicy="no-referrer" loading="lazy" onerror="this.style.display=\'none\'">':'';return '<div class="creator-avatar-fallback '+escapeHtml(size)+'"><span>'+initial+'</span>'+img+'</div>';}
  async function pollProjectUntilSettled(id){
    clearTimeout(window.__clipboostProjectPoll);
    const pollKey=String(id||'');
    window.__clipboostActiveProjectPoll=pollKey;
    try{
      const r=await fetch(`/api/videos/${encodeURIComponent(id)}`);
      const data=await readJsonResponse(r,'Could not refresh project');
      if(window.__clipboostActiveProjectPoll!==pollKey)return;
      const previousStatus=state.video?.id===data.id?state.video?.status:null;
      state.video=data;
      if(['ingesting','analyzing'].includes(data.status)){
        const progressEl=document.querySelector('.mint-workspace-timeline-v127 .muted'),generateBtn=document.getElementById('generateVariationsBtn');
        if(progressEl)progressEl.textContent=`Local AI: ${String(data.analysis?.stage||'analyzing').replace(/-/g,' ')} · ${Math.round(Number(data.analysis?.progress||0))}%`;
        if(generateBtn){generateBtn.disabled=true;generateBtn.textContent='↻ Generating clips…'}
        window.__clipboostProjectPoll=setTimeout(()=>pollProjectUntilSettled(id),1500);return;
      }
      window.__clipboostActiveProjectPoll='';
      window.__clipboostProjectPoll=null;
      if(['ready','degraded'].includes(data.status))state.selectedCandidate=0;
      state.projects=null;
      render();
      const noticeKey=`${data.id}:${data.status}:${data.updatedAt||''}`;
      if(window.__clipboostLastSettledNotice!==noticeKey){
        window.__clipboostLastSettledNotice=noticeKey;
        if(data.status==='degraded')showNotice({kind:'warning',eyebrow:data.campaign?.id?'Campaign Studio':'AI Studio',title:'Analysis completed with fallback',message:data.analysis?.aiError||'ClipBoost completed the analysis with its deterministic fallback engine.'});
        if(data.status==='failed')showNotice({kind:'danger',eyebrow:data.campaign?.id?'Campaign Studio':'AI Studio',title:'Analysis failed',message:data.analysis?.error||'The project could not be analyzed.'});
        if(data.processingInterrupted)showNotice({kind:'warning',eyebrow:data.campaign?.id?'Campaign Studio':'AI Studio',title:'Processing was interrupted',message:'ClipBoost recovered this project. You can retry the analysis or delete the project safely.'});
      }
    }catch(e){
      console.warn(e);
      if(window.__clipboostActiveProjectPoll===pollKey)window.__clipboostProjectPoll=setTimeout(()=>pollProjectUntilSettled(id),2500);
    }
  }
  async function startProjectIngestion(id){
    try{
      if(!(await ensureStudioPreflight({needsDownload:true})))return false;
      const r=await fetch(`/api/projects/${encodeURIComponent(id)}/ingest`,{method:'POST'});
      const data=await readJsonResponse(r,'Automatic ingestion could not start');
      state.video=data;render();pollProjectUntilSettled(id);return true;
    }catch(e){
      if(state.video){state.video={...state.video,ingestion:{...(state.video.ingestion||{}),error:e.message||'Automatic ingestion failed'}}}
      render();return false;
    }
  }
  function maybeAutoIngestCurrentProject(){
    const v=state.video;
    if(!v?.id||v.sourceUrl||v.status!=='linked'||!v.externalSource||autoIngestAttempted.has(v.id))return;
    autoIngestAttempted.add(v.id);
    setTimeout(async()=>{const ok=await startProjectIngestion(v.id);if(!ok)autoIngestAttempted.delete(v.id)},0);
  }

  async function sendLibraryItemToStudio(platform,creatorId,mediaType,mediaId,mode='shorts'){
    state.studioMode=mode==='long'?'long':'shorts';persistEditorPrefs();
    if(state.projectBusy)return;state.projectBusy=true;state.libraryError='';render();
    try{
      const r=await fetch('/api/projects/from-library',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({platform,creatorId,mediaType,mediaId})});
      const data=await readJsonResponse(r,'Could not create AI Studio project');
      state.video=data;state.selectedCandidate=0;state.campaignVariants=null;state.campaignCompliance=null;state.uploadStatus='idle';state.uploadProgress=0;state.projects=null;try{localStorage.setItem('clipboost:lastProjectId',data.id)}catch{} navigate('studio');
      startProjectIngestion(data.id);
    }catch(e){state.libraryError=e.message||'Could not send source to AI Studio';render()}finally{state.projectBusy=false}
  }
  async function loadProjects(){
    if(state.projectsLoading)return;state.projectsLoading=true;
    try{const r=await fetch('/api/projects');state.projects=await readJsonResponse(r,'Could not load projects')}catch(e){state.projects=[]}finally{state.projectsLoading=false;render()}
  }
  async function openProject(id){
    try{const r=await fetch(`/api/videos/${encodeURIComponent(id)}`);state.video=await readJsonResponse(r,'Could not open project');state.selectedCandidate=0;state.campaignVariants=null;state.campaignCompliance=null;try{localStorage.setItem('clipboost:lastProjectId',id)}catch{}if(state.video?.campaign?.id||state.video?.campaignId){state.campaignSelected=state.video.campaign?.id||state.video.campaignId;state.campaignEditorOpen=true;navigate('campaigns')}else{state.campaignEditorOpen=false;navigate('studio')}if(['ingesting','analyzing'].includes(state.video?.status))pollProjectUntilSettled(id)}catch(e){showNotice({kind:'danger',title:'Could not open project',message:e.message||'Could not open project'})}
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
  async function refreshTwitchClips({silent=true}={}){
    if(state.page!=='library'||state.libraryPlatform!=='twitch'||state.librarySection!=='clips')return;
    if(state.twitchClipsRefreshing)return;
    state.twitchClipsRefreshing=true;
    if(!silent){state.libraryError='';render()}
    try{
      const userId=state.libraryCreatorFilter&&state.libraryCreatorFilter!=='all'?state.libraryCreatorFilter:'';
      const r=await fetch('/api/library/twitch/clips/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId})});
      const data=await readJsonResponse(r,'Could not refresh Twitch clips');
      if(data?.library)state.library=data.library;
      state.twitchClipsLastRefresh=Date.now();
      if(!silent){
        const failed=Array.isArray(data.errors)?data.errors.length:0;
        state.libraryRefreshMessage=failed?'Clips refreshed · '+failed+' failed':'Twitch clips refreshed just now';
      }
    }catch(e){
      if(!silent)state.libraryError=e.message||'Could not refresh Twitch clips';
    }finally{
      state.twitchClipsRefreshing=false;
      render();
    }
  }
  function scheduleTwitchClipsRefresh(){
    clearTimeout(window.__clipboostTwitchClipsRefresh);
    if(state.page!=='library'||state.libraryPlatform!=='twitch'||state.librarySection!=='clips')return;
    const age=Date.now()-Number(state.twitchClipsLastRefresh||0);
    if(age>15000)setTimeout(()=>refreshTwitchClips({silent:true}),100);
    window.__clipboostTwitchClipsRefresh=setTimeout(async()=>{
      await refreshTwitchClips({silent:true});
      scheduleTwitchClipsRefresh();
    },45000);
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
  function formatMoney(value,currency='EUR'){
    try{return new Intl.NumberFormat(undefined,{style:'currency',currency:currency||'EUR',maximumFractionDigits:2}).format(Number(value||0))}catch{return `${Number(value||0).toFixed(2)} ${currency||'EUR'}`}
  }
  function daysUntil(value){if(!value)return null;const d=new Date(value);if(Number.isNaN(d.getTime()))return null;return Math.ceil((d.getTime()-Date.now())/86400000)}
  function selectedCampaign(){return (state.campaigns?.campaigns||[]).find(c=>c.id===state.campaignSelected)||null}
  async function loadCampaigns(){
    if(state.campaignsLoading)return;state.campaignsLoading=true;
    try{const r=await fetch('/api/campaigns');state.campaigns=await readJsonResponse(r,'Could not load campaigns');if(!state.campaignSelected&&state.campaigns.campaigns?.[0])state.campaignSelected=state.campaigns.campaigns[0].id}
    catch(e){state.campaigns={campaigns:[]};state.campaignMessage=e.message||'Could not load campaigns'}finally{state.campaignsLoading=false;render()}
  }
  function campaignPaymentModel(c={}){
    const explicit=String(c.paymentModel||'');if(['per-views','bounty-pool','fixed-reward','custom'].includes(explicit))return explicit;
    return c.payoutMode==='per-1000-views'?'per-views':c.payoutMode==='threshold'?'fixed-reward':'custom';
  }
  function campaignQualification(c={}){return Math.max(0,Number(c.qualificationViews??c.viewThreshold??0)||0)}
  function campaignRateEntries(c={}){
    const rates=c.platformPayouts&&typeof c.platformPayouts==='object'?c.platformPayouts:{};const names={tiktok:'TikTok',instagram:'Instagram',youtube:'YouTube',x:'X',default:'Default'};
    return Object.entries(rates).filter(([,v])=>Number(v)>0).map(([k,v])=>({key:k,label:names[k]||k,value:Number(v)}));
  }
  function campaignPaymentSummary(c={}){
    const model=campaignPaymentModel(c),currency=c.currency||'USD',q=campaignQualification(c),basis=Math.max(1,Number(c.rateBasisViews||100000));
    if(model==='bounty-pool')return `${formatMoney(c.bountyPool||0,currency)} bounty pool`;
    if(model==='fixed-reward')return `${formatMoney(c.fixedReward??c.payout??0,currency)}${q?` after ${formatCount(q)} views`:''}`;
    if(model==='per-views'){
      const rates=campaignRateEntries(c);const fallback=Number(c.fixedReward??c.payout??0);const rate=rates[0]?.value||fallback;
      return rate?`${formatMoney(rate,currency)} / ${formatCount(basis)} views`:`Per ${formatCount(basis)} views`;
    }
    return 'Custom payout';
  }
  function campaignAccessLabel(c={}){return c.accessMode==='private'?'Private':c.accessMode==='application'?'Application required':'Open access'}
  function campaignReadiness(c={}){
    const sources=c.sourceUrls||[];
    const hasRules=Boolean((c.requiredHashtags||[]).length||(c.requiredMentions||[]).length||c.requiredCTA||(c.platforms||[]).length||(c.requirements||[]).length||(c.violations||[]).length);
    const model=campaignPaymentModel(c),hasPayment=model==='bounty-pool'?Number(c.bountyPool||0)>0:model==='per-views'?(campaignRateEntries(c).length>0||Number(c.fixedReward??c.payout??0)>0):model==='fixed-reward'?Number(c.fixedReward??c.payout??0)>0:true;
    const checks=[
      {label:'Brief',ok:Boolean(String(c.brief||'').trim()),detail:'Campaign objective saved'},
      {label:'Source',ok:sources.length>0,detail:sources.length?`${sources.length} authorized source${sources.length===1?'':'s'}`:'Add at least one source'},
      {label:'Clip range',ok:Number(c.maxDuration||0)>0&&Number(c.maxDuration||0)>=Number(c.minDuration||0),detail:`${Number(c.minDuration||0)}–${Number(c.maxDuration||60)} seconds`},
      {label:'Publishing rules',ok:hasRules,detail:hasRules?'Platform / CTA / tags saved':'Add the rules from the campaign'},
      {label:'Payment terms',ok:hasPayment||campaignQualification(c)>0,detail:hasPayment?campaignPaymentSummary(c):'Add qualification or payout terms'}
    ];
    const passed=checks.filter(x=>x.ok).length;
    return {checks,score:Math.round(passed/checks.length*100),ready:checks[0].ok&&checks[1].ok&&checks[2].ok};
  }
  function campaignSourcePlatform(url=''){
    const x=String(url).toLowerCase();if(x.includes('youtube.com')||x.includes('youtu.be'))return 'YouTube';if(x.includes('twitch.tv'))return 'Twitch';return 'Source';
  }
  function campaignAssetMediaLabel(r={}){
    const kind=r.kind==='video-pack'?'Video pack':r.kind==='image-pack'?'Image pack':r.kind==='mixed-pack'?'Mixed media pack':'Asset pack';
    const videos=Math.max(0,Number(r.videoCount||0)), observed=Math.max(0,Number(r.observedItemCount||r.mediaCount||0));
    if(r.kind==='video-pack'){
      if(r.videoCountExact&&videos>0)return `${kind} · ${videos} video${videos===1?'':'s'}`;
      if(r.multipleVideoEvidence||(observed>videos&&videos>0))return `${kind} · multiple videos`;
      if(videos>0)return `${kind} · video media confirmed`;
    }
    if(r.kind==='mixed-pack')return observed>0?`${kind} · ${observed} items detected`:kind;
    if(r.kind==='image-pack'&&observed>0)return `${kind} · ${observed} item${observed===1?'':'s'} detected`;
    return kind;
  }
  function campaignForm(c=null,mode='new'){
    const isEdit=mode==='edit',isImport=mode==='import';
    const x=c||{campaignUrl:state.campaignDraftUrl||''},model=campaignPaymentModel(x),q=campaignQualification(x),rates=x.platformPayouts||{};
    const importSummary=isImport?`<div class="campaign-import-review"><div><div class="eyebrow">SMART IMPORT</div><b>Authenticated campaign pages cross-checked</b><small>ClipBoost reads the campaign detail, requirements and campaign listing. Canto packs are inspected in the background; reference artwork stays separate from editable media.</small></div><div class="campaign-import-review-stats"><span><b>${(x.sourceUrls||[]).length}</b> direct sources</span><span><b>${(x.resourceUrls||[]).length}</b> asset packs</span><span><b>${(x.referenceAssets||[]).length}</b> reference images</span><span><b>${(x.requirements||[]).length}</b> requirements</span><span><b>${(x.violations||[]).length}</b> violations</span></div><div class="campaign-import-facts">${x.startDate?`<div><span>Start date</span><b>${escapeHtml(x.startDate)}</b></div>`:''}<div><span>Minimum to qualify</span><b>${q?formatCount(q):'Unknown'}</b></div>${x.audience?`<div><span>Audience</span><b>${escapeHtml(x.audience)}</b></div>`:''}${x.paymentMethod?`<div><span>Payment</span><b>${escapeHtml(x.paymentMethod)}</b></div>`:''}${x.accountLimit?`<div><span>Account limit</span><b>${escapeHtml(x.accountLimit)}</b></div>`:''}${x.platformProfileKey?`<div><span>Platform rules</span><b>${escapeHtml(x.platformProfileKey)} · shared</b></div>`:''}</div>${(x.resourceUrls||[]).length?`<details open><summary>Detected asset packs</summary><ul>${x.resourceUrls.map(r=>`<li><a href="${escapeHtml(r.url)}" target="_blank" rel="noreferrer">${escapeHtml(r.label||'Asset')}</a> · ${escapeHtml(campaignAssetMediaLabel(r))}</li>`).join('')}</ul></details>`:''}${(x.referenceAssets||[]).length?`<details><summary>Reference artwork (${(x.referenceAssets||[]).length})</summary><ul>${x.referenceAssets.map((r,i)=>`<li><a href="${escapeHtml(r.url)}" target="_blank" rel="noreferrer">${escapeHtml(r.label||`Reference image ${i+1}`)}</a> · ${r.kind==='watermark'?'required watermark':'reference only'}</li>`).join('')}</ul></details>`:''}${(x.requirements||[]).length?`<details><summary>Extracted requirements</summary><ul>${x.requirements.map(r=>`<li>${escapeHtml(r)}</li>`).join('')}</ul></details>`:''}${(x.violations||[]).length?`<details><summary>Violations / disqualifiers</summary><ul>${x.violations.map(r=>`<li>${escapeHtml(r)}</li>`).join('')}</ul></details>`:''}</div>`:'';
    return `<section class="card campaign-form-card campaign-form-progressive"><div class="section-head campaign-form-head"><div><div class="eyebrow">${isEdit?'EDIT CAMPAIGN':isImport?'REVIEW IMPORT':'ADD CAMPAIGN'}</div><h3>${isEdit?'Campaign setup':isImport?'Review imported campaign':'Add a paid campaign'}</h3><p class="campaign-form-intro">${isImport?'ClipBoost read the authenticated campaign page and its requirements. Confirm the terms below before saving.':'Save only the terms you actually need. Extra payout options and publishing rules stay tucked away until you need them.'}</p></div><button class="icon-btn" id="closeCampaignForm" title="Close">×</button></div>${importSummary}
    <div class="campaign-form-block"><div class="campaign-form-section-title"><b>Campaign</b><small>Name it, link it and paste the useful brief.</small></div><div class="campaign-form-grid campaign-essential-grid compact"><label class="field"><span>Name</span><input id="campaignName" value="${escapeHtml(x.name||'')}" placeholder="Campaign name"></label><label class="field"><span>Provider / site</span><input id="campaignProvider" value="${escapeHtml(x.provider||'')}" placeholder="Whop, Clipping.net, Discord…"></label><label class="field span2"><span>Campaign URL</span><input id="campaignUrl" value="${escapeHtml(x.campaignUrl||'')}" placeholder="https://..."></label><label class="field span2"><span>Brief</span><textarea id="campaignBrief" rows="3" placeholder="Objective, source rules and what the campaign wants viewers to see">${escapeHtml(x.brief||'')}</textarea></label></div></div>
    <div class="campaign-form-block campaign-payment-quick"><div class="campaign-form-section-title"><b>Payment</b><small>Start with the terms visible on the campaign page.</small></div><div class="campaign-form-grid campaign-quick-payment-grid">
      <label class="field"><span>Payment model</span><select id="campaignPaymentModel"><option value="per-views" ${model==='per-views'?'selected':''}>Per views</option><option value="bounty-pool" ${model==='bounty-pool'?'selected':''}>Bounty pool</option><option value="fixed-reward" ${model==='fixed-reward'?'selected':''}>Fixed reward</option><option value="custom" ${model==='custom'?'selected':''}>Custom / manual</option></select></label>
      <label class="field"><span>Minimum views</span><input id="campaignQualificationViews" type="number" min="0" value="${q||''}" placeholder="Unknown until the campaign states it"></label>
      <label class="field"><span>Currency</span><input id="campaignCurrency" maxlength="8" value="${escapeHtml(String(x.currency||'USD').toUpperCase())}" placeholder="USD"></label>
      <label class="field" data-payment-only="per-views"><span>Rate basis <em>views</em></span><input id="campaignRateBasis" type="number" min="1" value="${Math.max(1,Number(x.rateBasisViews||100000))}" placeholder="100000"></label>
      <label class="field" data-payment-only="per-views,fixed-reward"><span id="campaignFixedRewardLabel">${model==='fixed-reward'?'Reward amount':'Default rate'}</span><input id="campaignFixedReward" type="number" min="0" step="0.01" value="${Number(x.fixedReward??x.payout??0)}" placeholder="250"></label>
      <label class="field" data-payment-only="bounty-pool"><span>Bounty pool</span><input id="campaignBountyPool" type="number" min="0" step="0.01" value="${Number(x.bountyPool||0)}" placeholder="35000"></label>
    </div></div>
    <div class="campaign-form-grid campaign-meta-grid"><label class="field"><span>Deadline</span><input id="campaignDeadline" type="date" value="${escapeHtml(String(x.deadline||'').slice(0,10))}"></label><label class="field"><span>Access</span><select id="campaignAccessMode"><option value="open" ${x.accessMode!=='private'&&x.accessMode!=='application'?'selected':''}>Open</option><option value="application" ${x.accessMode==='application'?'selected':''}>Application required</option><option value="private" ${x.accessMode==='private'?'selected':''}>Private</option></select></label><label class="field"><span>Status</span><select id="campaignStatus"><option value="active" ${x.status!=='paused'&&x.status!=='completed'&&x.status!=='closed'?'selected':''}>Active</option><option value="paused" ${x.status==='paused'?'selected':''}>Paused</option><option value="completed" ${x.status==='completed'?'selected':''}>Completed</option><option value="closed" ${x.status==='closed'?'selected':''}>Closed</option></select></label></div>
    <details class="campaign-advanced campaign-payment-advanced"><summary><span><b>Advanced payout options</b><small>Qualification scope, payout caps, confirmed earnings and platform-specific rates</small></span><span>⌄</span></summary><div class="campaign-advanced-body"><div class="campaign-form-grid campaign-advanced-money-grid"><label class="field"><span>Qualification applies to</span><select id="campaignQualificationScope"><option value="per-post" ${String(x.qualificationScope|| (model==='per-views'?'per-post':'campaign-total'))==='per-post'?'selected':''}>Each published post</option><option value="campaign-total" ${String(x.qualificationScope|| (model==='per-views'?'per-post':'campaign-total'))==='campaign-total'?'selected':''}>Campaign total</option></select></label><label class="field"><span>Maximum payout</span><input id="campaignMaxPayout" type="number" min="0" step="0.01" value="${Number(x.maxPayout||0)}" placeholder="Optional cap"></label><label class="field"><span>Confirmed payout to date</span><input id="campaignConfirmedPayout" type="number" min="0" step="0.01" value="${Number(x.confirmedPayout||0)}" placeholder="0"></label></div><div class="campaign-platform-rates" data-payment-only="per-views"><div class="campaign-form-section-title"><b>Platform payout rates</b><small>Optional overrides per rate basis.</small></div><div class="campaign-form-grid campaign-rate-grid"><label class="field"><span>TikTok</span><input id="campaignRateTikTok" type="number" min="0" step="0.01" value="${Number(rates.tiktok||0)}"></label><label class="field"><span>Instagram</span><input id="campaignRateInstagram" type="number" min="0" step="0.01" value="${Number(rates.instagram||0)}"></label><label class="field"><span>YouTube</span><input id="campaignRateYouTube" type="number" min="0" step="0.01" value="${Number(rates.youtube||0)}"></label><label class="field"><span>X</span><input id="campaignRateX" type="number" min="0" step="0.01" value="${Number(rates.x||0)}"></label></div></div></div></details>
    <details class="campaign-advanced"><summary><span><b>Advanced rules</b><small>Duration, platforms, hashtags, mentions, CTA and forbidden topics</small></span><span>⌄</span></summary><div class="campaign-form-grid campaign-advanced-rules-grid"><label class="field"><span>Min clip duration <em>seconds</em></span><input id="campaignMinDuration" type="number" min="0" value="${Number(x.minDuration||0)}"></label><label class="field"><span>Max clip duration <em>seconds</em></span><input id="campaignMaxDuration" type="number" min="1" value="${Number(x.maxDuration||60)}"></label><label class="field span2"><span>Platforms</span><input id="campaignPlatforms" value="${escapeHtml((x.platforms||['tiktok','instagram','youtube-shorts']).join(', '))}" placeholder="tiktok, instagram, youtube-shorts, x"></label><label class="field span2"><span>Required hashtags</span><input id="campaignHashtags" value="${escapeHtml((x.requiredHashtags||[]).join(', '))}" placeholder="#brand, #campaign"></label><label class="field span2"><span>Required mentions</span><input id="campaignMentions" value="${escapeHtml((x.requiredMentions||[]).join(', '))}" placeholder="@brand"></label><label class="field span2"><span>Required CTA</span><input id="campaignCTA" value="${escapeHtml(x.requiredCTA||'')}" placeholder="Required call to action"></label><label class="field span2"><span>Forbidden terms / topics</span><input id="campaignForbidden" value="${escapeHtml((x.forbiddenTerms||[]).join(', '))}" placeholder="One item per comma"></label></div></details>
    <div class="campaign-form-actions"><button class="btn secondary" id="cancelCampaignBtn" type="button">Cancel</button><button class="btn primary" id="saveCampaignBtn" data-campaign-edit-id="${escapeHtml(isEdit?c?.id||'':'')}">${state.campaignBusy?'Saving…':isEdit?'Save changes':'Add campaign'}</button></div></section>`
  }
  function campaignAssetBrowserMarkup(){
    const b=state.campaignAssetBrowser;if(!b)return '';
    const items=Array.isArray(b.items)?b.items:[];
    const body=b.loading?`<div class="campaign-asset-browser-loading"><div class="campaign-asset-loading-ring" aria-label="Loading campaign assets"><span></span></div><strong>Loading campaign assets…</strong><small>ClipBoost is opening the Canto pack and identifying the approved media files.</small><div class="campaign-asset-loading-bar" aria-hidden="true"><i></i></div></div>`:items.length?`<div class="campaign-asset-grid">${items.map((item,i)=>{const direct=Boolean(item.mediaUrl);const preview=item.previewUrl||item.poster||'';const duration=Number(item.duration||0);return `<article class="campaign-asset-card"><div class="campaign-asset-preview">${direct?`<video src="${escapeHtml(item.mediaUrl)}" ${preview?`poster="${escapeHtml(preview)}"`:''} controls preload="metadata"></video>`:preview?`<img src="${escapeHtml(preview)}" alt="${escapeHtml(item.label||`Media ${i+1}`)}">`:`<div class="campaign-asset-placeholder">VIDEO</div>`}</div><div class="campaign-asset-card-copy"><div><span class="campaign-resource-kind">${escapeHtml(item.kind==='video'?'Video':'Media')}</span><b>${escapeHtml(item.label||`Media ${i+1}`)}</b><small>${duration>0?`${Math.round(duration)}s · `:''}${direct?'Ready for Campaign Studio':'Open in Canto to choose this media'}</small></div><div class="campaign-asset-card-actions">${(direct||item.pageUrl)?`<button class="btn primary" data-campaign-asset-edit="${i}">✦ Open in Campaign Editor</button>`:''}${item.pageUrl?`<a class="btn secondary compact-btn" href="${escapeHtml(item.pageUrl)}" target="_blank" rel="noreferrer">Open media ↗</a>`:''}</div></div></article>`}).join('')}</div>`:`<div class="campaign-asset-browser-empty"><b>Open this campaign pack in Canto to choose the media.</b><p>Canto is not exposing a directly selectable video to ClipBoost right now. Your campaign is still available; use Open original pack above.</p></div>`;
    return `<div class="modal-backdrop campaign-asset-browser-backdrop" id="campaignAssetBrowserBackdrop"><section class="card campaign-asset-browser" role="dialog" aria-modal="true" aria-labelledby="campaignAssetBrowserTitle"><div class="campaign-asset-browser-head"><div><div class="eyebrow">CAMPAIGN ASSET PACK</div><h2 id="campaignAssetBrowserTitle">${escapeHtml(b.label||'Campaign media')}</h2><p>${escapeHtml(b.summary||'Preview the approved campaign media, then open the exact video you want in Campaign Studio.')}</p></div><div class="campaign-asset-browser-actions">${b.packUrl?`<a class="btn secondary campaign-asset-open-pack" href="${escapeHtml(b.packUrl)}" target="_blank" rel="noreferrer">Open original pack ↗</a>`:''}<button class="modal-close campaign-asset-close" id="closeCampaignAssetBrowser" type="button" aria-label="Close asset browser">×</button></div></div>${b.error?`<div class="library-banner error">${escapeHtml(b.error)}</div>`:''}${body}</section></div>`;
  }

  function campaignDiscover(){
    const list=state.campaigns?.campaigns||[];
    const active=list.filter(c=>String(c.status||'active')==='active');
    const cards=list.length?list.map(c=>{
      const t=c.totals||{};
      const readiness=campaignReadiness(c);
      const q=campaignQualification(c);
      return `<article class="campaign-discover-card-v143">
        <button class="campaign-discover-delete-v239" data-campaign-discover-delete="${escapeHtml(c.id)}" type="button" title="Delete campaign" aria-label="Delete ${escapeHtml(c.name||'campaign')}">×</button>
        <div class="campaign-discover-card-top-v143">
          <div><span class="campaign-state ${escapeHtml(c.status||'active')}">${escapeHtml(c.status||'active')}</span><small>${escapeHtml(c.provider||'Campaign')}</small></div>
          <span class="campaign-discover-score-v143">${readiness.score}% setup</span>
        </div>
        <h3>${escapeHtml(c.name||'Campaign')}</h3>
        <p>${escapeHtml(String(c.brief||c.objective||'No campaign brief saved yet.').slice(0,150))}</p>
        <div class="campaign-discover-progress-v232" aria-label="${readiness.score}% campaign setup"><span style="--campaign-progress:${Math.max(0,Math.min(100,Number(readiness.score)||0))}%"></span></div>
        <div class="campaign-discover-facts-v143">
          <div><small>Payment</small><b>${escapeHtml(campaignPaymentSummary(c))}</b></div>
          <div><small>Minimum</small><b>${q?formatCount(q):'—'}</b></div>
          <div><small>Tracked</small><b>${formatCount(t.totalViews||0)}</b></div>
        </div>
        <div class="campaign-discover-actions-v143">
          <button class="btn campaign-details-btn-v223" data-campaign-discover-select="${escapeHtml(c.id)}">View details</button>
          <button class="btn primary" data-campaign-open-studio="${escapeHtml(c.id)}">Edit in Campaign →</button>
        </div>
      </article>`;
    }).join(''):`<div class="campaign-discover-empty-v143"><b>No campaigns yet</b><span>Paste a campaign page or create one manually.</span></div>`;

    return `<div class="content campaign-discover-v143">
      <section class="campaign-discover-header-v143">
        <div>
          <div class="eyebrow">CAMPAIGN DISCOVERY</div>
          <h1>Find and manage campaigns</h1>
          <p>Bring campaign opportunities into Mint, review every requirement, then open the selected campaign in Campaign Studio.</p>
        </div>
        <span class="mint-editor-source-badge">Discover → Details → Edit in Campaign</span>
      </section>

      <section class="campaign-discover-import-v143">
        <div>
          <div class="eyebrow">SMART IMPORT</div>
          <h3>Import a campaign from its real page</h3>
          <p>Open a saved campaign platform directly, choose the campaign, then confirm it. You can add more campaign sites anytime.</p>
        </div>
        <div class="campaign-discover-import-controls-v143 mint-smart-import-v238">
          <div class="mint-campaign-site-row-v238">
            <select id="campaignSiteSelect">${(state.campaignSites||[]).map((site,i)=>`<option value="${i}">${escapeHtml(site.name||site.url)}</option>`).join('')}</select>
            <button class="btn primary" id="openCampaignSiteBtn" ${state.campaignBusy?'disabled':''}>${state.campaignBusy?'Waiting…':'Open campaigns ↗'}</button>
            <button class="btn secondary" id="addCampaignSiteBtn" type="button">＋ Add site</button>
          </div>
          <details class="mint-campaign-url-fallback-v238">
            <summary>Import a specific URL</summary>
            <div><input id="campaignImportUrl" value="${escapeHtml(state.campaignDraftUrl||'')}" placeholder="Paste campaign URL"><button class="btn secondary" id="importCampaignBtn" ${state.campaignBusy?'disabled':''}>Smart Import</button></div>
          </details>
          <button class="btn secondary" id="newCampaignBtn">＋ Manual campaign</button>
        </div>
      </section>

      <section class="campaign-discover-summary-v143">
        <article><small>Total campaigns</small><b>${list.length}</b></article>
        <article><small>Active</small><b>${active.length}</b></article>
      </section>

      <section class="campaign-discover-grid-v143">
        ${state.campaignsLoading?'<div class="campaign-discover-empty-v143">Loading campaigns…</div>':cards}
      </section>
      ${state.campaignDetailsOpen&&selectedCampaign()?`<div class="modal-backdrop campaign-details-backdrop-v223" id="campaignDetailsBackdrop"><section class="campaign-details-modal-v223" role="dialog" aria-modal="true" aria-labelledby="campaignDetailsModalTitle"><div class="campaign-details-modal-head-v223"><div><div class="eyebrow">CAMPAIGN DETAILS</div><h2 id="campaignDetailsModalTitle">${escapeHtml(selectedCampaign().name||'Campaign')}</h2><p>Review the brief, supplied assets, rules and campaign performance before editing.</p></div><button class="modal-close campaign-details-close-v223" id="closeCampaignDetails" type="button" aria-label="Close campaign details">×</button></div><div class="campaign-details-modal-body-v223">${campaignDetail(selectedCampaign())}</div></section></div>`:''}
      ${state.campaignFormOpen?`<div class="campaign-form-backdrop" id="campaignFormBackdrop"><div class="campaign-form-drawer">${campaignForm(state.campaignFormOpen==='edit'?selectedCampaign():state.campaignFormOpen==='import'?state.campaignImportDraft:null,state.campaignFormOpen==='edit'?'edit':state.campaignFormOpen==='import'?'import':'new')}</div></div>`:''}
    </div>`
  }

  function campaignEditorView(c){
    let editor=studio();
    const context=`<section class="mint-campaign-editor-context">
      <div class="mint-campaign-editor-context-main">
        <span class="campaign-state ${escapeHtml(c.status||'active')}">${escapeHtml(c.status||'active')}</span>
        <div><b>${escapeHtml(c.name||'Campaign')}</b><small>${escapeHtml(c.provider||'Campaign')} · ${escapeHtml(campaignPaymentSummary(c))}</small></div>
      </div>
      <div class="mint-campaign-editor-context-stats">
        <span><small>Minimum</small><b>${campaignQualification(c)?formatCount(campaignQualification(c)):'—'}</b></span>
        <span><small>Tracked</small><b>${formatCount(c.totals?.totalViews||0)}</b></span>
        <span><small>Rules</small><b>${(c.requirements||[]).length+(c.requiredHashtags||[]).length+(c.requiredMentions||[]).length}</b></span>
      </div>
      <div class="mint-campaign-editor-context-actions">
        <button class="btn secondary" id="campaignEditorRulesBtn">Rules</button>
        <button class="btn secondary" id="campaignEditorResultsBtn">Results</button>
        <button class="btn secondary" id="exitCampaignEditorBtn">Campaign manager</button>
      </div>
    </section>`;
    editor=editor.replace('mint-studio-page-v142','mint-studio-page-v142 mint-campaign-editor-page-v150');
    editor=editor.replace('<div class="eyebrow">AI VIDEO EDITOR</div>','<div class="eyebrow">CAMPAIGN VIDEO EDITOR</div>');
    editor=editor.replace('<h1>AI Studio</h1>',`<h1>Campaign Studio <span class="mint-editor-campaign-name">· ${escapeHtml(c.name)}</span></h1>`);
    editor=editor.replace('Turn any source into polished short-form clips with AI-assisted editing.','Edit approved campaign media with campaign-aware clipping, rules and compliance.');
    editor=editor.replace('<section class="mint-studio-toolstrip-v142">',context+'<section class="mint-studio-toolstrip-v142">');
    return editor;
  }

  function campaignAssetChooser(c){
    const sources=c?.sourceUrls||[],packs=c?.resourceUrls||[];
    const sourceRows=sources.map((src,i)=>`<button class="campaign-editor-asset-v220" data-campaign-source="${escapeHtml(src.id||'')}" type="button"><span>▶</span><div><b>${escapeHtml(src.label||`Campaign asset ${i+1}`)}</b><small>Approved campaign media · open in editor</small></div><strong>Edit →</strong></button>`).join('');
    const packRows=packs.map((pack,i)=>`<button class="campaign-editor-asset-v220" data-campaign-pack="${i}" type="button"><span>▣</span><div><b>${escapeHtml(pack.label||`Asset pack ${i+1}`)}</b><small>${escapeHtml(campaignAssetMediaLabel(pack))}</small></div><strong>Browse →</strong></button>`).join('');
    return `<div class="content campaign-editor-empty-v218 campaign-studio-launch-v220"><section class="campaign-studio-launch-head-v220"><div><div class="eyebrow">CAMPAIGN STUDIO</div><h1>${escapeHtml(c?.name||'Campaign')}</h1><p>Choose media supplied by this campaign. Campaign Studio is the dedicated editing workspace; Library media stays in AI Studio.</p></div><button class="btn secondary" data-page="campaign-discover">← Campaign details</button></section><section class="card campaign-studio-assets-v220"><div class="section-head"><div><div class="eyebrow">CAMPAIGN ASSETS</div><h3>Choose what to edit</h3></div><span class="mint-editor-source-badge">${sources.length+packs.length} sources</span></div><div class="campaign-editor-assets-v220">${sourceRows}${packRows||''}${!sourceRows&&!packRows?'<div class="campaign-mini-empty">No editable campaign media detected yet. Return to Discover and review the campaign assets.</div>':''}</div></section></div>`;
  }

  function campaignEditor(){
    const campaignId=state.video?.campaign?.id||state.video?.campaignId||state.campaignSelected;
    const c=(state.campaigns?.campaigns||[]).find(item=>item.id===campaignId)||selectedCampaign();
    if(!c)return `<div class="content campaign-editor-empty-v218"><section class="card"><div class="eyebrow">CAMPAIGN STUDIO</div><h1>Choose a campaign first</h1><p>Find or add a campaign in Discover, open its details, then choose Edit in Campaign.</p><button class="btn primary" data-page="campaign-discover">Open Discover</button></section></div>`;
    const videoCampaignId=state.video?.campaign?.id||state.video?.campaignId;
    if(!state.video||videoCampaignId!==c.id)return campaignAssetChooser(c);
    return campaignEditorView(c);
  }

  function campaigns(){
    return campaignEditor();
  }
  function campaignResultsPanel(c){
    const t=c.totals||{},posts=Array.isArray(c.posts)?c.posts:[],q=campaignQualification(c),scope=String(c.qualificationScope||'per-post');
    const ordered=[...posts].sort((a,b)=>Number(b.views||0)-Number(a.views||0));
    const qualified=q<=0?posts:scope==='campaign-total'?(Number(t.totalViews||0)>=q?posts:[]):posts.filter(p=>Number(p.views||0)>=q);
    const qualifiedViews=qualified.reduce((sum,p)=>sum+Math.max(0,Number(p.views||0)),0);
    const byPlatform={};for(const post of posts){const key=String(post.platform||'Other').trim()||'Other';byPlatform[key]=byPlatform[key]||{views:0,posts:0,payout:0};byPlatform[key].views+=Math.max(0,Number(post.views||0));byPlatform[key].posts++;byPlatform[key].payout+=Math.max(0,Number(post.payoutConfirmed||0));}
    const platformRows=Object.entries(byPlatform).sort((a,b)=>b[1].views-a[1].views),maxPlatform=Math.max(1,...platformRows.map(x=>x[1].views));
    const best=ordered[0]||null,remaining=q?Math.max(0,Number(t.remainingViews??(q-(scope==='campaign-total'?Number(t.totalViews||0):Number(best?.views||0))))):0;
    const insights=[];
    if(best)insights.push(`<div><span>1</span><p><b>Best tracked clip</b>${formatCount(best.views||0)} views on ${escapeHtml(best.platform||'tracked platform')}.</p></div>`);
    if(platformRows[0])insights.push(`<div><span>2</span><p><b>Top platform</b>${escapeHtml(platformRows[0][0])} currently represents ${formatCount(platformRows[0][1].views)} tracked views.</p></div>`);
    if(q)insights.push(`<div><span>3</span><p><b>Qualification</b>${remaining?`${formatCount(remaining)} views remain to reach the current target.`:'The current tracked data reaches the saved qualification target.'}</p></div>`);
    return `<div class="campaign-tab-panel campaign-results-v2"><div class="campaign-tab-head"><div><div class="eyebrow">PERFORMANCE</div><h3>Campaign results</h3><p>Real metrics from published posts tracked in ClipBoost. Retention, CTR and watch time stay hidden when the platform has not supplied them.</p></div><button class="btn secondary" data-campaign-tab="published">Track a published clip</button></div><div class="campaign-results-kpis"><div><span>Total views</span><b>${formatCount(t.totalViews||0)}</b><small>${posts.length} tracked post${posts.length===1?'':'s'}</small></div><div><span>Qualified views</span><b>${formatCount(qualifiedViews)}</b><small>${q?`${qualified.length} qualified post${qualified.length===1?'':'s'}`:'No minimum saved'}</small></div><div><span>Estimated payout</span><b>${formatMoney(t.estimatedRevenue||0,c.currency)}</b><small>From saved campaign terms</small></div><div><span>Confirmed payout</span><b>${formatMoney(t.confirmedRevenue||0,c.currency)}</b><small>Campaign-approved earnings</small></div><div><span>Best clip</span><b>${formatCount(t.bestViews||0)}</b><small>Highest tracked views</small></div><div><span>Average</span><b>${formatCount(t.avgViews||0)}</b><small>Views per tracked post</small></div></div><div class="campaign-results-layout"><section class="campaign-results-card"><div class="eyebrow">PLATFORMS</div><h3>Performance by platform</h3><div class="campaign-platform-bars">${platformRows.length?platformRows.map(([name,v])=>`<div><span>${escapeHtml(name)}</span><div><i style="width:${Math.max(5,Math.round(v.views/maxPlatform*100))}%"></i></div><b>${formatCount(v.views)}</b></div>`).join(''):'<div class="campaign-mini-empty">Track published posts to compare platforms.</div>'}</div></section><aside class="campaign-results-card campaign-results-insights"><div class="eyebrow">CLIPBOOST INSIGHTS</div><h3>What the tracked data says</h3>${insights.length?insights.join(''):'<div class="campaign-mini-empty">No tracked performance yet. Add published post URLs and views to unlock campaign insights.</div>'}</aside></div><section class="campaign-results-card campaign-results-table"><div class="section-head"><div><div class="eyebrow">VIDEOS</div><h3>Tracked clip results</h3></div><span class="muted">Sorted by views</span></div>${ordered.length?`<div class="campaign-results-rows">${ordered.slice(0,30).map((post,i)=>{const isQualified=q<=0||(scope==='campaign-total'?Number(t.totalViews||0)>=q:Number(post.views||0)>=q);return `<div class="campaign-result-row"><span class="campaign-rank">${i+1}</span><span class="campaign-result-main"><b>${escapeHtml(post.platform||'Published clip')}</b><small>${post.url?escapeHtml(post.url):relativeDate(post.publishedAt||post.createdAt)}</small></span><span><small>Views</small><b>${formatCount(post.views||0)}</b></span><span><small>Status</small><b class="${isQualified?'result-qualified':'result-pending'}">${isQualified?'Qualified':q?'Below minimum':'Tracked'}</b></span><span><small>Confirmed</small><b>${formatMoney(post.payoutConfirmed||0,c.currency)}</b></span>${post.url?`<a class="btn secondary compact-btn" href="${escapeHtml(post.url)}" target="_blank" rel="noreferrer">Open ↗</a>`:'<span></span>'}</div>`}).join('')}</div>`:'<div class="campaign-mini-empty">No published clips tracked yet. Use the Published tab after you post your first campaign clip.</div>'}</section></div>`
  }
  function campaignDetail(c){
    const t=c.totals||{},days=daysUntil(c.deadline),sources=c.sourceUrls||[],resources=c.resourceUrls||[],references=c.referenceAssets||[],posts=c.posts||[],ready=campaignReadiness(c),q=campaignQualification(c),model=campaignPaymentModel(c),rates=campaignRateEntries(c);
    const tab=['overview','sources','results','published','rules'].includes(state.campaignTab)?state.campaignTab:'overview';
    const requirements=[`Duration ${Number(c.minDuration||0)}–${Number(c.maxDuration||60)}s`,...(c.platforms||[]),...(c.requiredHashtags||[]),...(c.requiredMentions||[])];
    const scopeLabel=String(c.qualificationScope|| (model==='per-views'?'per-post':'campaign-total'))==='per-post'?'on one post':'across the campaign';
    const progressText=q?(t.remainingViews?`${formatCount(t.remainingViews)} views remaining ${scopeLabel}`:'Qualification target reached'):'No minimum-view qualification saved';
    const missing=ready.checks.filter(x=>!x.ok);
    const paymentValue=campaignPaymentSummary(c);
    const deadlineValue=days===null?'No deadline':days<0?'Passed':days===0?'Today':`${days} day${days===1?'':'s'} left`;
    const tabs=`<div class="campaign-tabs campaign-tabs-v2"><button class="${tab==='overview'?'active':''}" data-campaign-tab="overview">Studio</button><button class="${tab==='sources'?'active':''}" data-campaign-tab="sources">Sources <span>${sources.length+resources.length}</span></button><button class="${tab==='results'?'active':''}" data-campaign-tab="results">Results <span>${posts.length}</span></button><button class="${tab==='published'?'active':''}" data-campaign-tab="published">Published <span>${posts.length}</span></button><button class="${tab==='rules'?'active':''}" data-campaign-tab="rules">Rules</button></div>`;
    const overview=`<div class="campaign-tab-panel campaign-overview-panel"><div class="campaign-primary-kpis"><div><span>Payment</span><b>${escapeHtml(paymentValue)}</b><small>${model==='per-views'?`per ${formatCount(Number(c.rateBasisViews||100000))} views`:model==='bounty-pool'?'shared campaign pool':model==='fixed-reward'?'fixed campaign reward':'campaign terms'}</small></div><div><span>Minimum</span><b>${q?formatCount(q):'—'}</b><small>${q?`${String(c.qualificationScope||'per-post')==='per-post'?'per post':'campaign total'}`:'No threshold saved'}</small></div><div><span>Tracked views</span><b>${formatCount(t.totalViews||0)}</b><small>${q?`${Math.round(t.progress||0)}% qualified`:`${t.postCount||0} published clips`}</small></div><div><span>Deadline</span><b>${escapeHtml(deadlineValue)}</b><small>${c.status||'active'} · ${campaignAccessLabel(c)}</small></div></div>${q?`<div class="campaign-progress-compact"><div><b>${Math.round(t.progress||0)}% toward qualification</b><span>${escapeHtml(progressText)}</span></div><div class="campaign-progress big"><i style="width:${Math.min(100,Number(t.progress||0))}%"></i></div></div>`:''}<div class="campaign-overview-lower"><div class="campaign-earnings-card"><div><span>Estimated payout</span><b>${formatMoney(t.estimatedRevenue||0,c.currency)}</b></div><div><span>Confirmed payout</span><b>${formatMoney(t.confirmedRevenue||0,c.currency)}</b></div><div><span>Best clip</span><b>${formatCount(t.bestViews||0)}</b></div><div><span>Average</span><b>${formatCount(t.avgViews||0)}</b></div></div><div class="campaign-readiness-compact ${ready.ready?'ready':''}"><div><span>${ready.ready?'✓':'!'}</span><div><b>${ready.ready?'Ready to create':'Setup needs attention'}</b><small>${ready.ready?'Campaign has the essentials to start creating clips.':missing.map(x=>x.label).join(' · ')}</small></div></div><strong>${ready.score}%</strong></div></div>${rates.length?`<div class="campaign-platform-rate-panel compact"><div><b>Platform rates</b><span>Saved payout terms</span></div><div class="campaign-rate-badges large">${rates.map(r=>`<span><small>${escapeHtml(r.label)}</small><b>${formatMoney(r.value,c.currency)}</b></span>`).join('')}</div></div>`:''}<div class="campaign-studio-v2-grid"><section class="campaign-studio-v2-panel"><div class="eyebrow">CAMPAIGN BRIEF</div><h3>${c.brief?'Objective':'Objective needed'}</h3><p>${escapeHtml(c.brief||'No objective was provided by the campaign. Add a short working objective so the AI knows what to prioritize.')}</p><div class="campaign-studio-mini-facts">${c.audience?`<span><small>Audience</small><b>${escapeHtml(c.audience)}</b></span>`:''}<span><small>Requirements</small><b>${(c.requirements||[]).length}</b></span><span><small>Violations</small><b>${(c.violations||[]).length}</b></span></div><button class="btn secondary compact-btn" id="editCampaignRulesBtn">${c.brief?'Edit campaign context':'Add objective'}</button></section><section class="campaign-studio-v2-panel"><div class="section-head"><div><div class="eyebrow">SOURCE MEDIA</div><h3>${sources.length+resources.length} source${sources.length+resources.length===1?'':'s'} available</h3></div><button class="btn secondary compact-btn" data-campaign-tab="sources">Manage sources</button></div><div class="campaign-studio-source-stack">${sources.slice(0,2).map((src,i)=>`<button data-campaign-source="${escapeHtml(src.id)}"><span class="campaign-source-type">${campaignSourcePlatform(src.url)}</span><b>${escapeHtml(src.label||`Source ${i+1}`)}</b><small>Open in Campaign Editor</small></button>`).join('')}${resources.slice(0,2).map((r,i)=>`<button data-campaign-pack="${i}"><span class="campaign-source-type">Pack</span><b>${escapeHtml(r.label||`Asset pack ${i+1}`)}</b><small>${escapeHtml(campaignAssetMediaLabel(r))}</small></button>`).join('')}${!sources.length&&!resources.length?'<div class="campaign-mini-empty">Add a campaign source before generating clips.</div>':''}</div></section><section class="campaign-studio-v2-panel campaign-generate-panel"><div class="eyebrow">CREATE</div><h3>Generate campaign clips</h3><p>Choose campaign-supplied media, then edit it in the dedicated Campaign Editor with the campaign brief, rules and compliance always attached.</p><div class="campaign-generate-counts"><span><b>${sources.length}</b> direct</span><span><b>${resources.length}</b> packs</span><span><b>${references.length}</b> references</span></div><button class="btn primary full" id="batchCampaignBtn" ${sources.length?'':'disabled'}>Queue direct sources</button>${resources.length?`<button class="btn secondary full" data-campaign-tab="sources">Browse asset packs</button>`:''}<small class="campaign-generate-note">The existing AI engine, campaign fit and compliance checks are reused unchanged.</small></section></div></div>`;
    const sourcesPanel=`<div class="campaign-tab-panel"><div class="campaign-tab-head"><div><div class="eyebrow">AUTHORIZED SOURCES</div><h3>Sources</h3><p>Editable campaign media opens only in Campaign Editor. Asset packs and reference artwork stay separate so preview images are never mistaken for editable video.</p></div><button class="btn secondary compact-btn" id="batchCampaignBtn" ${sources.length?'':'disabled'}>Queue all</button></div><div class="campaign-source-add"><input id="campaignSourceUrl" placeholder="YouTube / Twitch / source URL"><input id="campaignSourceLabel" placeholder="Label (optional)"><button class="btn secondary" id="addCampaignSourceBtn">Add source</button></div><div class="campaign-source-list">${sources.length?sources.map((src,i)=>`<div class="campaign-source-row"><div class="campaign-source-copy"><span class="campaign-source-type">${campaignSourcePlatform(src.url)}</span><b>${escapeHtml(src.label||`Source ${i+1}`)}</b><small>${escapeHtml(src.url)}</small></div><div class="campaign-source-actions"><button class="btn primary" data-campaign-source="${escapeHtml(src.id)}">✦ Open in Campaign Editor</button><button class="icon-btn danger-lite" data-campaign-source-remove="${escapeHtml(src.id)}" title="Remove source">×</button></div></div>`).join(''):'<div class="campaign-mini-empty">No direct media source yet. Smart Import keeps unknown sources empty instead of guessing.</div>'}</div>${resources.length?`<div class="campaign-resource-section"><div class="eyebrow">CAMPAIGN ASSET PACKS</div><div class="campaign-resource-list">${resources.map((r,i)=>{const kind=r.kind==='video-pack'?'Video pack':r.kind==='image-pack'?'Image pack':r.kind==='mixed-pack'?'Mixed media':'Asset pack';const detail=r.inspectStatus==='unavailable'?'Media type could not be inspected automatically':campaignAssetMediaLabel(r).replace(/^.*? · /,'')||'Open the pack to use its approved campaign media';return `<div class="campaign-resource-row"><span><em class="campaign-resource-kind">${escapeHtml(kind)}</em><b>${escapeHtml(r.label||`Asset pack ${i+1}`)}</b><small>${escapeHtml(detail)}</small></span><div class="campaign-resource-actions"><button class="btn primary compact-btn" data-campaign-pack="${i}">Browse media</button><a class="btn secondary compact-btn" href="${escapeHtml(r.url)}" target="_blank" rel="noreferrer">Open pack ↗</a></div></div>`}).join('')}</div></div>`:''}${references.length?`<div class="campaign-resource-section campaign-reference-section"><div class="eyebrow">REFERENCE ARTWORK</div><p class="campaign-resource-note">These images come from campaign requirements and are kept as visual references only.</p><div class="campaign-resource-list">${references.map((r,i)=>`<div class="campaign-resource-row"><span><em class="campaign-resource-kind">Reference</em><b>${escapeHtml(r.label||`Reference image ${i+1}`)}</b><small>Reference only · not editable media</small></span><a class="btn secondary compact-btn" href="${escapeHtml(r.url)}" target="_blank" rel="noreferrer">Open ↗</a></div>`).join('')}</div></div>`:''}</div>`;
    const publishedPanel=`<div class="campaign-tab-panel"><div class="campaign-tab-head"><div><div class="eyebrow">SUBMISSION & PERFORMANCE</div><h3>Published clips</h3><p>Track views, validation status and confirmed payout after publishing.</p></div><button class="btn secondary" id="downloadSubmissionPackBtn">Submission pack</button></div><div class="campaign-post-add campaign-post-add-real"><input class="campaign-post-url" id="campaignPostUrl" placeholder="Post URL"><select id="campaignPostPlatform"><option>TikTok</option><option>Instagram</option><option>YouTube Shorts</option><option>X</option></select><input id="campaignPostViews" type="number" min="0" placeholder="Views"><input id="campaignPostDuration" type="number" min="0" placeholder="Clip sec"><input id="campaignPostMinutes" type="number" min="0" placeholder="Edit min"><input id="campaignPostPayout" type="number" min="0" step="0.01" placeholder="Confirmed $"><select id="campaignPostStatus"><option value="pending">Pending</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option></select><button class="btn secondary" id="addCampaignPostBtn">Track</button></div><div class="campaign-post-list">${posts.length?posts.slice(0,30).map(p=>`<div class="campaign-post-row campaign-post-row-real"><div class="campaign-post-main"><span>${escapeHtml(p.platform||'Post')} · <b class="submission-${escapeHtml(p.submissionStatus||'pending')}">${escapeHtml(p.submissionStatus||'pending')}</b></span>${p.url?`<small title="${escapeHtml(p.url)}">${escapeHtml(p.url)}</small>`:`<small>${relativeDate(p.publishedAt||p.createdAt)}</small>`}</div><label><small>Views</small><input class="campaign-view-input" data-post-view-input="${escapeHtml(p.id)}" type="number" min="0" value="${Number(p.views||0)}"></label><label><small>Confirmed</small><input class="campaign-view-input" data-post-payout-input="${escapeHtml(p.id)}" type="number" min="0" step="0.01" value="${Number(p.payoutConfirmed||0)}"></label><label><small>Status</small><select class="campaign-view-input" data-post-status-input="${escapeHtml(p.id)}"><option value="pending" ${String(p.submissionStatus||'pending')==='pending'?'selected':''}>Pending</option><option value="accepted" ${p.submissionStatus==='accepted'?'selected':''}>Accepted</option><option value="rejected" ${p.submissionStatus==='rejected'?'selected':''}>Rejected</option></select></label><div class="campaign-post-actions"><button class="btn secondary compact-btn" data-campaign-post-update="${escapeHtml(p.id)}">Update</button><button class="icon-btn danger-lite" data-campaign-post-delete="${escapeHtml(p.id)}" title="Remove tracked post">×</button></div></div>`).join(''):'<div class="campaign-mini-empty">No published clips tracked yet.</div>'}</div></div>`;
    const importedRequirements=c.requirements||[],violations=c.violations||[];
    const rulesPanel=`<div class="campaign-tab-panel campaign-rules-panel"><div class="campaign-rules-grid"><div><div class="eyebrow">CAMPAIGN BRIEF</div><h3>Objective</h3><p class="campaign-full-brief">${escapeHtml(c.brief||'No campaign objective was visible on the imported page.')}</p>${c.audience?`<div class="campaign-import-fact"><span>Audience</span><b>${escapeHtml(c.audience)}</b></div>`:''}${c.paymentMethod||c.accountLimit?`<div class="campaign-import-facts">${c.paymentMethod?`<div><span>Payment method</span><b>${escapeHtml(c.paymentMethod)}</b></div>`:''}${c.accountLimit?`<div><span>Account limit</span><b>${escapeHtml(c.accountLimit)}</b></div>`:''}</div>`:''}</div><div><div class="eyebrow">PUBLISHING RULES</div><h3>Requirements</h3><div class="campaign-rule-chips">${requirements.map(x=>`<span>${escapeHtml(x)}</span>`).join('')}${c.requiredCTA?`<span>CTA: ${escapeHtml(c.requiredCTA)}</span>`:''}${(c.forbiddenTerms||[]).length?`<span class="campaign-rule-warning">Avoid: ${escapeHtml(c.forbiddenTerms.join(', '))}</span>`:''}</div>${importedRequirements.length?`<div class="campaign-imported-rules"><h4>Imported requirements</h4>${importedRequirements.map(x=>`<div><span>✓</span><p>${escapeHtml(x)}</p></div>`).join('')}</div>`:''}${violations.length?`<div class="campaign-imported-rules violations"><h4>Violations / disqualifiers</h4>${violations.map(x=>`<div><span>!</span><p>${escapeHtml(x)}</p></div>`).join('')}</div>`:''}${c.requirementsUrl?`<a class="campaign-requirements-link" href="${escapeHtml(c.requirementsUrl)}" target="_blank" rel="noreferrer">Open original requirements ↗</a>`:''}</div></div>${c.platformProfile?`<details class="campaign-platform-rules"><summary><span><b>Platform rules — ${escapeHtml(c.platformProfile.provider||c.provider||'Platform')}</b><small>Shared rules imported once for campaigns from this provider.</small></span><span>⌄</span></summary><div class="campaign-platform-rules-body">${Number(c.platformProfile.postMinimumViews||0)>0?`<div class="campaign-platform-rule-fact"><span>Per-post counting floor</span><b>${formatCount(c.platformProfile.postMinimumViews)} views</b></div>`:''}${Number(c.platformProfile.typicalCampaignMinimumViews||0)>0?`<div class="campaign-platform-rule-fact"><span>Typical campaign minimum</span><b>${formatCount(c.platformProfile.typicalCampaignMinimumViews)} views <em>general guidance</em></b></div>`:''}${(c.platformProfile.sections||[]).slice(0,12).map(section=>`<div class="campaign-platform-rule-section"><h4>${escapeHtml(section.title)}</h4><ul>${(section.items||[]).slice(0,20).map(item=>`<li>${escapeHtml(item)}</li>`).join('')}</ul></div>`).join('')}</div></details>`:''}<div class="campaign-rules-actions"><button class="btn secondary" id="copyCampaignChecklistBtn">Copy publishing checklist</button><button class="btn secondary" id="editCampaignRulesBtn">Edit terms</button></div></div>`;
    const resultsPanel=campaignResultsPanel(c);const panel=tab==='sources'?sourcesPanel:tab==='results'?resultsPanel:tab==='published'?publishedPanel:tab==='rules'?rulesPanel:overview;
    return `<section class="card campaign-detail campaign-detail-compact"><div class="campaign-detail-head campaign-hero compact"><div class="campaign-hero-copy"><div class="campaign-hero-meta"><span class="campaign-state ${c.status}">${escapeHtml(c.status||'active')}</span><span class="campaign-access-pill ${c.accessMode||'open'}">${escapeHtml(campaignAccessLabel(c))}</span><span>${escapeHtml(c.provider||'Manual campaign')}</span></div><h2>${escapeHtml(c.name)}</h2><p class="campaign-brief-preview">${escapeHtml(c.brief||'No brief saved yet. Add the campaign objective before generating clips.')}</p></div><div class="campaign-detail-actions compact"><button class="btn primary campaign-start-btn" id="startCampaignBtn">✦ Edit in Campaign</button>${c.campaignUrl?`<button class="btn secondary" id="openCampaignUrlBtn">Open page ↗</button>`:''}<button class="btn secondary" id="editCampaignBtn">Edit</button><button class="icon-btn danger-lite" id="deleteCampaignBtn" title="Delete campaign">×</button></div></div>${tabs}${panel}</section>`
  }

  function campaignFormPayload(){
    const base=state.campaignImportDraft&&typeof state.campaignImportDraft==='object'?state.campaignImportDraft:{};
    const split=id=>String(document.getElementById(id)?.value||'').split(/[\n,]/).map(x=>x.trim()).filter(Boolean);
    const rates={tiktok:Number(document.getElementById('campaignRateTikTok')?.value||0),instagram:Number(document.getElementById('campaignRateInstagram')?.value||0),youtube:Number(document.getElementById('campaignRateYouTube')?.value||0),x:Number(document.getElementById('campaignRateX')?.value||0)};
    Object.keys(rates).forEach(k=>{if(!(rates[k]>0))delete rates[k]});
    return {...base,name:document.getElementById('campaignName')?.value||'',provider:document.getElementById('campaignProvider')?.value||'',campaignUrl:document.getElementById('campaignUrl')?.value||'',brief:document.getElementById('campaignBrief')?.value||'',status:document.getElementById('campaignStatus')?.value||'active',accessMode:document.getElementById('campaignAccessMode')?.value||'open',minDuration:Number(document.getElementById('campaignMinDuration')?.value||0),maxDuration:Number(document.getElementById('campaignMaxDuration')?.value||60),qualificationViews:Number(document.getElementById('campaignQualificationViews')?.value||0),qualificationScope:document.getElementById('campaignQualificationScope')?.value||'per-post',paymentModel:document.getElementById('campaignPaymentModel')?.value||'custom',rateBasisViews:Number(document.getElementById('campaignRateBasis')?.value||100000),fixedReward:Number(document.getElementById('campaignFixedReward')?.value||0),bountyPool:Number(document.getElementById('campaignBountyPool')?.value||0),maxPayout:Number(document.getElementById('campaignMaxPayout')?.value||0),confirmedPayout:Number(document.getElementById('campaignConfirmedPayout')?.value||0),platformPayouts:rates,currency:document.getElementById('campaignCurrency')?.value||'USD',deadline:document.getElementById('campaignDeadline')?.value||'',platforms:split('campaignPlatforms'),requiredHashtags:split('campaignHashtags'),requiredMentions:split('campaignMentions'),requiredCTA:document.getElementById('campaignCTA')?.value||'',forbiddenTerms:split('campaignForbidden')}
  }
  async function saveCampaign(id=''){
    if(state.campaignBusy)return;const payload=campaignFormPayload();state.campaignBusy=true;state.campaignMessage='Saving campaign…';render();
    try{const method=id?'PUT':'POST',url=id?`/api/campaigns/${encodeURIComponent(id)}`:'/api/campaigns';const r=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await readJsonResponse(r,'Could not save campaign');state.campaignSelected=data.id;state.campaignFormOpen=false;clearCampaignImportReview();state.campaignTab='overview';state.campaignMessage='Campaign saved.';state.campaigns=null;await loadCampaigns()}
    catch(e){state.campaignMessage=e.message||'Could not save campaign'}finally{state.campaignBusy=false;render()}
  }
  async function importCampaign(explicitUrl=''){
    const url=String(explicitUrl||document.getElementById('campaignImportUrl')?.value||'').trim();if(!url||state.campaignBusy)return;
    state.campaignBusy=true;state.campaignDraftUrl=url;state.campaignImportDraft=null;state.campaignMessage='Opening secure campaign browser… Sign in if Clipping asks you to.';render();
    try{
      if(window.clipboostDesktop?.importCampaignAuthenticated){
        const data=await window.clipboostDesktop.importCampaignAuthenticated(url);
        if(!data?.ok||!data?.draft)throw new Error(data?.error||'ClipBoost could not read this campaign page.');
        state.campaignImportDraft=data.draft;state.campaignDraftUrl=url;persistCampaignImportReview();state.campaignFormOpen='import';
        const summary=data.summary||{};
        state.campaignMessage=`Smart Import ready: ${summary.name||data.draft.name||'campaign'} · ${Number(summary.sources||0)} source${Number(summary.sources||0)===1?'':'s'} · ${Number(summary.requirements||0)} requirement${Number(summary.requirements||0)===1?'':'s'}. Review before saving.`;
        return;
      }
      state.campaignMessage='Desktop Smart Import is unavailable here. Trying the public page…';render();
      const r=await fetch('/api/campaigns/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});
      const raw=await r.text();let data={};try{data=raw?JSON.parse(raw):{}}catch{}
      if(!r.ok){
        if(r.status===409&&data?.manual){state.campaignMessage=data.error||'Campaign details unavailable — login required.';state.campaignFormOpen=true;return}
        throw new Error(data?.error||`Could not import campaign (HTTP ${r.status})`);
      }
      const c=data;state.campaignSelected=c.id;state.campaignDraftUrl='';state.campaignTab='overview';state.campaignMessage=`Imported ${c.name}. Review the brief and rules before editing.`;state.campaigns=null;await loadCampaigns();
    }catch(e){state.campaignMessage=`${e.message||'Import failed'} You can retry Smart Import or add the campaign manually.`}
    finally{state.campaignBusy=false;render()}
  }
  async function updateCampaign(active,patch){const r=await fetch(`/api/campaigns/${encodeURIComponent(active.id)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)});return readJsonResponse(r,'Could not update campaign')}
  async function addCampaignSource(){const c=selectedCampaign(),url=document.getElementById('campaignSourceUrl')?.value?.trim();if(!c||!url)return;const label=document.getElementById('campaignSourceLabel')?.value?.trim()||`Source ${(c.sourceUrls||[]).length+1}`;await updateCampaign(c,{sourceUrls:[...(c.sourceUrls||[]),{url,label}]});state.campaigns=null;await loadCampaigns()}
  async function addCampaignPost(){const c=selectedCampaign();if(!c)return;const body={url:document.getElementById('campaignPostUrl')?.value||'',views:Number(document.getElementById('campaignPostViews')?.value||0),clipDuration:Number(document.getElementById('campaignPostDuration')?.value||0),editingMinutes:Number(document.getElementById('campaignPostMinutes')?.value||0),platform:document.getElementById('campaignPostPlatform')?.value||'',payoutConfirmed:Number(document.getElementById('campaignPostPayout')?.value||0),submissionStatus:document.getElementById('campaignPostStatus')?.value||'pending',publishedAt:new Date().toISOString()};const r=await fetch(`/api/campaigns/${encodeURIComponent(c.id)}/posts`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});await readJsonResponse(r,'Could not track post');state.campaigns=null;await loadCampaigns()}
  async function removeCampaignSource(sourceId){
    const c=selectedCampaign();if(!c)return;const src=(c.sourceUrls||[]).find(x=>x.id===sourceId);if(!src)return;
    const ok=await confirmAction({kind:'warning',eyebrow:'Campaign source',title:'Remove this source?',message:src.label||src.url,detail:'Existing AI Studio projects created from this source are kept.',confirmLabel:'Remove source'});if(!ok)return;
    await updateCampaign(c,{sourceUrls:(c.sourceUrls||[]).filter(x=>x.id!==sourceId)});state.campaigns=null;await loadCampaigns();
  }
  async function updateCampaignPost(postId){
    const c=selectedCampaign();if(!c)return;const input=document.querySelector(`[data-post-view-input="${CSS.escape(postId)}"]`),payoutInput=document.querySelector(`[data-post-payout-input="${CSS.escape(postId)}"]`),statusInput=document.querySelector(`[data-post-status-input="${CSS.escape(postId)}"]`);const views=Math.max(0,Number(input?.value||0)),payoutConfirmed=Math.max(0,Number(payoutInput?.value||0)),submissionStatus=statusInput?.value||'pending';
    const r=await fetch(`/api/campaigns/${encodeURIComponent(c.id)}/posts/${encodeURIComponent(postId)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({views,payoutConfirmed,submissionStatus})});await readJsonResponse(r,'Could not update post');state.campaigns=null;await loadCampaigns();
  }
  async function deleteCampaignPost(postId){
    const c=selectedCampaign();if(!c)return;const ok=await confirmAction({kind:'warning',eyebrow:'Performance tracking',title:'Remove this tracked post?',message:'The published post itself is not changed. Only its ClipBoost performance record is removed.',confirmLabel:'Remove'});if(!ok)return;
    const r=await fetch(`/api/campaigns/${encodeURIComponent(c.id)}/posts/${encodeURIComponent(postId)}`,{method:'DELETE'});await readJsonResponse(r,'Could not remove post');state.campaigns=null;await loadCampaigns();
  }
  async function browseCampaignAssetPack(index){
    const c=selectedCampaign();if(!c)return;const pack=(c.resourceUrls||[])[Number(index)];if(!pack?.url)return;
    state.campaignAssetBrowser={loading:true,label:pack.label||`Asset pack ${Number(index)+1}`,packUrl:pack.url,items:[],summary:'Checking the approved media exposed by this campaign pack…'};state.campaignAssetBusy=true;render();
    try{
      if(!window.clipboostDesktop?.inspectCampaignAssetPack)throw new Error('Asset Pack Browser is available in the desktop app only.');
      const result=await window.clipboostDesktop.inspectCampaignAssetPack(pack.url);
      if(!result?.ok)throw new Error(result?.error||'Could not inspect this asset pack.');
      state.campaignAssetBrowser={loading:false,label:pack.label||`Asset pack ${Number(index)+1}`,packUrl:pack.url,items:Array.isArray(result.items)?result.items:[],summary:result.summary||'Select an approved campaign video to open it in Campaign Studio.'};
    }catch(e){const raw=String(e?.message||'');const cantoBlocked=/ERR_ABORTED|\(-3\)|aborted/i.test(raw);state.campaignAssetBrowser={loading:false,label:pack.label||`Asset pack ${Number(index)+1}`,packUrl:pack.url,items:[],summary:cantoBlocked?'Canto did not allow ClipBoost to inspect this pack inside the app. Open the original pack to choose the approved media.':'This pack could not be inspected inside ClipBoost. You can still open the original campaign pack.',error:''}}
    finally{state.campaignAssetBusy=false;render()}
  }
  async function openCampaignAssetMedia(itemIndex){
    const c=selectedCampaign(),b=state.campaignAssetBrowser;if(!c||!b||state.projectBusy)return;const item=(b.items||[])[Number(itemIndex)];if(!item||(!item.mediaUrl&&!item.pageUrl))return;
    const packUrl=b.packUrl||'',pageUrl=item.pageUrl||packUrl,label=item.label||b.label||'Campaign asset',mediaUrl=item.mediaUrl||'';
    state.projectBusy=true;state.campaignAssetImporting=true;
    state.uiModal={mode:'progress',kind:'update',eyebrow:'Campaign Studio',title:'Preparing campaign video…',message:label,detail:'ClipBoost will open Campaign Studio when the video and analysis are ready.',progressLabel:'Creating campaign project…'};
    render();
    try{
      const sourceUrl=mediaUrl||pageUrl||packUrl;
      const r=await fetch(`/api/campaigns/${encodeURIComponent(c.id)}/source-project`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:sourceUrl,label})});
      let data=await readJsonResponse(r,'Could not create campaign asset project');
      state.video=data;state.selectedCandidate=0;state.campaignVariants=null;state.campaignCompliance=null;try{localStorage.setItem('clipboost:lastProjectId',data.id)}catch{}
      state.uiModal={...state.uiModal,progressLabel:'Preparing campaign video…'};render();
      if(!window.clipboostDesktop?.importCampaignAsset)throw new Error('This campaign asset requires the desktop authenticated importer.');
      let imported=await window.clipboostDesktop.importCampaignAsset({projectId:data.id,mediaUrl,pageUrl,label});
      if(!imported?.ok&&!mediaUrl&&packUrl&&packUrl!==pageUrl&&/canto\.global/i.test(packUrl)&&/BLOCKED_BY_CLIENT|did not expose|navigation/i.test(String(imported?.error||''))){
        state.uiModal={...state.uiModal,progressLabel:'Retrying from the original Canto pack…'};render();
        imported=await window.clipboostDesktop.importCampaignAsset({projectId:data.id,mediaUrl:'',pageUrl:packUrl,label});
      }
      if(!imported?.ok)throw new Error(imported?.error||'Could not prepare the campaign video.');
      if(imported.project)state.video=imported.project;
      // The desktop importer starts analysis too, but explicitly start it here as an
      // idempotent hand-off so an uploaded Canto asset can never remain stuck at 0%.
      const analyzeStart=await fetch(`/api/videos/${encodeURIComponent(data.id)}/analyze`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clipCount:'auto'})});
      if(!analyzeStart.ok){const problem=await analyzeStart.json().catch(()=>({}));throw new Error(problem?.error||`Could not start campaign analysis (HTTP ${analyzeStart.status}).`)}
      state.video={...(state.video||{}),status:'analyzing',analysis:{...(state.video?.analysis||{}),stage:'queued',progress:5}};
      state.campaignAssetImporting=false;
      state.uiModal={...state.uiModal,title:'Analyzing campaign video…',progressLabel:'Starting Local AI…',progress:5};render();
      const settled=await waitForCampaignProjectResult(data.id);
      state.video=settled;state.selectedCandidate=0;state.projects=null;state.campaignAssetBrowser=null;state.campaignEditorOpen=true;state.uiModal=null;
      navigate('campaigns');
      if(settled.status==='degraded')showNotice({kind:'warning',eyebrow:'Campaign Studio',title:'Analysis completed with fallback',message:settled.analysis?.aiError||'ClipBoost completed the analysis with its deterministic fallback engine.'});
    }catch(e){
      state.uiModal=null;
      showNotice({kind:'danger',eyebrow:'Campaign Studio',title:'Could not prepare campaign video',message:e.message||'Could not prepare this campaign asset.'});
    }finally{state.campaignAssetImporting=false;state.projectBusy=false}
  }

  async function waitForCampaignProjectResult(id){
    const started=Date.now(),timeoutMs=30*60*1000;
    while(Date.now()-started<timeoutMs){
      const r=await fetch(`/api/videos/${encodeURIComponent(id)}`);
      const data=await readJsonResponse(r,'Could not refresh campaign project');
      state.video=data;
      const status=String(data?.status||'');
      if(['ready','degraded'].includes(status)){if(state.uiModal){state.uiModal={...state.uiModal,title:'Campaign analysis complete',progressLabel:'Results ready',progress:100};const bar=document.querySelector('.cb-analysis-progress-track i'),value=document.querySelector('.cb-analysis-progress-head strong');if(bar)bar.style.width='100%';if(value)value.textContent='100%'}return data}
      const ingestionStage=String(data?.ingestion?.stage||'').toLowerCase();
      const analysisStage=String(data?.analysis?.stage||'').toLowerCase();
      const ingestionError=String(data?.ingestion?.error||'').trim();
      const analysisError=String(data?.analysis?.error||'').trim();
      if(status==='failed'||ingestionStage==='error'||analysisStage==='error'||ingestionError){
        throw new Error(analysisError||ingestionError||'Campaign video processing failed.');
      }
      const stage=String(data?.analysis?.stage||data?.ingestion?.stage||status||'Working').replace(/-/g,' ');
      const reported=Math.max(0,Math.min(100,Number(data?.analysis?.progress??data?.ingestion?.progress??0)));
      const previous=Math.max(0,Number(state.uiModal?.progress||0));
      // Never fake large jumps and never let progress move backwards. Backend stages
      // are authoritative; a tiny time-based creep only reassures during long AI calls.
      const creep=Math.min(status==='analyzing'?94:89,previous+(status==='analyzing' ? 0.35 : 0.2));
      const pct=Math.max(previous,reported,creep);
      const nextTitle=status==='analyzing'?'Analyzing campaign video…':'Preparing campaign video…';
      const nextLabel=stage||'Working';
      if(state.uiModal?.title!==nextTitle||state.uiModal?.progressLabel!==nextLabel||Math.round(Number(state.uiModal?.progress||0))!==Math.round(pct)){
        state.uiModal={...state.uiModal,title:nextTitle,progressLabel:nextLabel,progress:pct};
        const modal=document.querySelector('.cb-modal');
        if(modal){
          const title=modal.querySelector('#cbModalTitle'),label=modal.querySelector('.cb-analysis-progress-head span'),value=modal.querySelector('.cb-analysis-progress-head strong'),bar=modal.querySelector('.cb-analysis-progress-track i');
          if(title)title.textContent=nextTitle;if(label)label.textContent=nextLabel;if(value)value.textContent=`${Math.round(pct)}%`;if(bar)bar.style.width=`${Math.max(4,pct)}%`;
        }else render();
      }
      await new Promise(resolve=>setTimeout(resolve,1500));
    }
    throw new Error('Campaign video processing timed out.');
  }

  async function startCampaignCreating(){
    const c=selectedCampaign();if(!c)return;
    state.campaignEditorOpen=true;
    const v=state.video,vid=v?.campaign?.id||v?.campaignId;
    if(vid===c.id)return navigate('campaigns');
    navigate('campaigns');
  }
  async function openCampaignSource(sourceId){
    const c=selectedCampaign();if(!c||state.projectBusy)return;
    state.projectBusy=true;
    state.uiModal={mode:'progress',kind:'info',eyebrow:'Campaign Studio',title:'Preparing campaign asset…',progressLabel:'Creating project…',progress:2};
    render();
    try{
      const r=await fetch(`/api/campaigns/${encodeURIComponent(c.id)}/source-project`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceId})});
      let data=await readJsonResponse(r,'Could not create campaign project');
      state.video=data;state.selectedCandidate=0;state.campaignVariants=null;state.campaignCompliance=null;
      try{localStorage.setItem('clipboost:lastProjectId',data.id)}catch{}
      state.uiModal={...state.uiModal,title:'Downloading campaign asset…',progressLabel:'Starting automatic ingestion…',progress:5};
      render();

      if(!data.sourceUrl&&!['ready','degraded','analyzing'].includes(String(data.status||''))){
        if(!(await ensureStudioPreflight({needsDownload:true})))throw new Error('Local ingestion tools are not ready.');
        const ingestRes=await fetch(`/api/projects/${encodeURIComponent(data.id)}/ingest`,{method:'POST'});
        data=await readJsonResponse(ingestRes,'Automatic ingestion could not start');
        state.video=data;
      }

      if(data.status==='uploaded'){
        state.uiModal={...state.uiModal,title:'Analyzing campaign asset…',progressLabel:'Starting Local AI…',progress:5};render();
        const analyzeRes=await fetch(`/api/videos/${encodeURIComponent(data.id)}/analyze`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clipCount:'auto'})});
        data=await readJsonResponse(analyzeRes,'Campaign analysis could not start');
        state.video=data;
      }

      const settled=['ready','degraded'].includes(String(data.status||''))?data:await waitForCampaignProjectResult(data.id);
      state.video=settled;state.selectedCandidate=0;state.projects=null;state.campaignAssetBrowser=null;state.campaignEditorOpen=true;
      state.uiModal=null;
      navigate('campaigns');
      if(settled.status==='degraded')showNotice({kind:'warning',eyebrow:'Campaign Studio',title:'Analysis completed with fallback',message:settled.analysis?.aiError||'ClipBoost completed the analysis with its deterministic fallback engine.'});
    }catch(e){
      state.uiModal=null;
      const message=String(e?.message||'Could not prepare this campaign asset.');
      showNotice({
        kind:'danger',
        eyebrow:'Campaign Studio',
        title:/download|yt-dlp|youtube|source|ingest/i.test(message)?'Campaign asset download failed':'Could not prepare campaign asset',
        message,
        detail:'The loading process has stopped. Retry the asset to attempt automatic download again, or use a local file if the source cannot be fetched automatically.'
      });
      render();
    }finally{state.projectBusy=false}
  }
  async function deleteCampaign(){const c=selectedCampaign();if(!c)return;const ok=await confirmAction({kind:'danger',eyebrow:'Campaigns',title:`Delete ${c.name}?`,message:'This removes the campaign workspace and its view tracking. Existing AI Studio projects and exported videos are kept.',confirmLabel:'Delete campaign'});if(!ok)return;const r=await fetch(`/api/campaigns/${encodeURIComponent(c.id)}`,{method:'DELETE'});await readJsonResponse(r,'Could not delete campaign');state.campaignSelected=null;state.campaigns=null;await loadCampaigns()}
  async function runCampaignCheck(){const v=state.video;if(!v?.campaign?.id)return;const ci=state.selectedCandidate||0,base=v.candidates?.[ci]||{};const start=Number(document.getElementById('clipStart')?.value??base.start??0),end=Number(document.getElementById('clipEnd')?.value??base.end??start+30);const r=await fetch(`/api/videos/${encodeURIComponent(v.id)}/campaign-check`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({index:ci,start,end,options:currentRenderOptions()})});state.campaignCompliance=await readJsonResponse(r,'Campaign check failed');render()}
  async function generateCampaignVariants(){const v=state.video;if(!v?.campaign?.id)return;const r=await fetch(`/api/videos/${encodeURIComponent(v.id)}/variants`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({index:state.selectedCandidate||0})});const data=await readJsonResponse(r,'Could not generate variants');state.campaignVariants=data.variants||[];render()}
  function projectDisplayState(p){
    if(p?.processingInterrupted)return {progress:36,progressLabel:'Interrupted',badge:'Needs attention',done:false};
    if(p?.status==='ready')return {progress:100,progressLabel:'Ready',badge:'Ready',done:true};
    if(p?.status==='degraded')return {progress:100,progressLabel:'Ready with fallback',badge:'Degraded',done:true};
    if(p?.status==='failed')return {progress:100,progressLabel:'Failed',badge:'Failed',done:false};
    if(p?.status==='uploaded')return {progress:100,progressLabel:'Source ready',badge:'Ready to analyze',done:false};
    if(p?.status==='preparing')return {progress:Number(p?.ingestion?.progress||92),progressLabel:'Preparing source',badge:'In progress',done:false};
    if(p?.status==='linked')return {progress:15,progressLabel:'Linked',badge:p?.ingestionError?'Retry source':'Needs source file',done:false};
    if(['ingesting','analyzing'].includes(p?.status))return {progress:p?.status==='ingesting'?45:65,progressLabel:p?.status==='ingesting'?'Downloading':'Processing',badge:'In progress',done:false};
    return {progress:35,progressLabel:'Needs attention',badge:'Needs attention',done:false};
  }
  function projects(){
    const list=Array.isArray(state.projects)?state.projects:[];
    const rows=list.length?list.map((p,i)=>{const ui=projectDisplayState(p),campaignName=String(p.campaignName||p.campaign?.name||'').trim(),isCampaign=Boolean(p.campaignId||campaignName);return `<div class="project-row"><div class="project-source-thumb">${p.externalSource?.thumbnail?`<img src="${escapeHtml(p.externalSource.thumbnail)}" alt="">`:mediaThumb(i)}</div><div class="project-identity-v129"><div class="project-title-line-v129"><strong>${escapeHtml(p.originalName||'Untitled project')}</strong>${isCampaign?`<span class="project-campaign-badge-v129">◎ ${escapeHtml(campaignName||'Campaign')}</span>`:`<span class="project-personal-badge-v129">AI Studio</span>`}</div><div class="muted">${isCampaign?`Campaign · ${escapeHtml(campaignName||'Campaign')} · `:''}${escapeHtml(p.externalSource?.creatorName||'Local upload')} · ${relativeDate(p.createdAt)}${p.processingInterrupted?' · processing was interrupted':''}</div></div><div class="project-progress"><div class="progress"><i style="width:${ui.progress}%"></i></div><span>${ui.progressLabel}</span></div><div class="project-row-actions"><span class="status ${ui.done?'done':''}">${ui.badge}</span><button class="btn secondary" data-open-project="${escapeHtml(p.id)}">Open</button><button class="icon-btn project-delete-btn" type="button" data-delete-project="${escapeHtml(p.id)}" data-delete-project-name="${escapeHtml(p.originalName||'Untitled project')}" title="${['ingesting','analyzing'].includes(p.status)?'Stop processing and delete project':'Delete project'}">×</button></div></div>`}).join(''):`<div class="projects-empty"><b>No real projects yet</b><span>Send a YouTube video or Twitch VOD from Library to AI Studio.</span><button class="btn primary" data-page="library">Open Library</button></div>`;
    return `<div class="content mint-projects-nb-v1418"><div class="page-title"><div><div class="eyebrow">Workflow</div><h1>My projects</h1><p>Sources sent from your Library appear here automatically.</p></div><button class="btn primary" data-page="library">+ From Library</button></div><section class="card projects">${state.projectsLoading?'<div class="projects-empty">Loading projects…</div>':rows}</section></div>`
  }

  async function removeProject(id,name){
    const label=name||'this project';
    const current=(Array.isArray(state.projects)?state.projects:[]).find(p=>p.id===id);
    const processing=['ingesting','analyzing'].includes(current?.status);
    const ok=await confirmAction({
      kind:'danger',
      eyebrow:'Projects',
      title:processing?`Stop and delete ${label}?`:`Delete ${label}?`,
      message:processing?'ClipBoost will stop the active local processing job first, then remove the project and its temporary files.':'This removes the project, its local source file, cached transcript and generated previews from ClipBoost.',
      detail:'Previously exported MP4 files are kept in your exports folder.',
      confirmLabel:processing?'Stop & delete':'Delete project'
    });
    if(!ok)return;
    try{
      const r=await fetch(`/api/projects/${encodeURIComponent(id)}`,{method:'DELETE'});
      const result=await readJsonResponse(r,'Could not delete project');
      if(state.video?.id===id)state.video=null;
      clearTimeout(window.__clipboostProjectPoll);
      try{if(localStorage.getItem('clipboost:lastProjectId')===id)localStorage.removeItem('clipboost:lastProjectId')}catch{}
      state.projects=null;await loadProjects();
      showNotice({kind:'success',eyebrow:'Projects',title:'Project deleted',message:result?.processingStopped?`${label} processing was stopped and the project was removed.`:`${label} was removed from ClipBoost.`});
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
        <label class="field"><span>YouTube download authentication</span><select id="setYoutubeAuthBrowser">${option('firefox','Firefox (recommended)',s.YOUTUBE_AUTH_BROWSER||'firefox')}${option('auto','Auto detect',s.YOUTUBE_AUTH_BROWSER)}${option('edge','Edge',s.YOUTUBE_AUTH_BROWSER)}${option('chrome','Chrome',s.YOUTUBE_AUTH_BROWSER)}${option('brave','Brave',s.YOUTUBE_AUTH_BROWSER)}${option('none','No browser cookies',s.YOUTUBE_AUTH_BROWSER)}</select></label>
        <small class="settings-note">Used only when YouTube blocks automatic ingest. Cookies stay on this PC. Firefox is recommended and can remain open.</small>
        <label class="field"><span>Twitch Client ID</span><input id="setTwitchId" value="${escapeHtml(s.TWITCH_CLIENT_ID||'')}" placeholder="Client ID"></label>
        <label class="field"><span>Twitch Client Secret</span><input id="setTwitchSecret" type="password" value="${escapeHtml(s.TWITCH_CLIENT_SECRET||'')}" placeholder="Client Secret"></label>
        <small class="settings-note">Secret values are masked. Leave a masked value unchanged to keep the existing secret.</small>
      </section>
      <section class="card settings-card"><div class="section-head"><div><div class="eyebrow">Local AI</div><h3>Whisper processing</h3></div></div>
        <div class="settings-two"><label class="field"><span>Whisper model</span><select id="setWhisperModel">${option('tiny','Tiny',s.LOCAL_WHISPER_MODEL)}${option('base','Base',s.LOCAL_WHISPER_MODEL)}${option('small','Small',s.LOCAL_WHISPER_MODEL)}${option('medium','Medium',s.LOCAL_WHISPER_MODEL)}</select></label>
        <label class="field"><span>Workers</span><select id="setWorkers">${option('auto','Auto (recommended)',s.LOCAL_WHISPER_WORKERS)}${[1,2,3,4].map(v=>option(v,String(v),s.LOCAL_WHISPER_WORKERS)).join('')}</select></label></div>
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
        <label class="switch-row"><span><strong>Close to system tray</strong><small>Keep ClipBoost available in the tray. Eco AI mode can still release unused local AI while hidden.</small></span><input id="setCloseTray" type="checkbox" ${checked(d.closeToTray!==false)} ${window.clipboostDesktop?'':'disabled'}></label>
        <label class="switch-row"><span><strong>Eco AI mode</strong><small>When ClipBoost is inactive, unload unused local AI from memory and keep workers asleep until needed again.</small></span><input id="setEcoMode" type="checkbox" ${checked(d.ecoMode!==false)} ${window.clipboostDesktop?'':'disabled'}></label>
        <label class="field"><span>Eco mode idle timeout</span><select id="setIdleTimeout" ${window.clipboostDesktop?'':'disabled'}>${option(2,'2 minutes',d.idleTimeoutMinutes||5)}${option(5,'5 minutes',d.idleTimeoutMinutes||5)}${option(10,'10 minutes',d.idleTimeoutMinutes||5)}${option(20,'20 minutes',d.idleTimeoutMinutes||5)}</select></label>
        <small class="settings-note">Active analysis/export jobs are allowed to finish. A full Quit stops ClipBoost-owned FFmpeg, Python and download workers and unloads the Ollama model immediately.</small>
      </section>
      <section class="card settings-card"><div class="section-head"><div><div class="eyebrow">Updates</div><h3>ClipBoost updates</h3></div><span class="muted">v${escapeHtml(d.version||'web')}</span></div>
        <label class="switch-row"><span><strong>Check on startup</strong><small>Look for new releases when ClipBoost opens.</small></span><input id="setCheckUpdates" type="checkbox" ${checked(d.checkUpdatesOnStartup!==false)} ${window.clipboostDesktop?'':'disabled'}></label>
        <label class="switch-row"><span><strong>Download automatically</strong><small>Download updates in the background.</small></span><input id="setAutoDownload" type="checkbox" ${checked(d.autoDownloadUpdates!==false)} ${window.clipboostDesktop?'':'disabled'}></label>
        <div class="settings-inline"><button class="btn secondary" id="checkUpdatesBtn" ${window.clipboostDesktop?'':'disabled'}>Check for updates</button><button class="btn secondary" id="restartAppBtn" ${window.clipboostDesktop?'':'disabled'}>Restart ClipBoost</button></div>
        <div class="settings-two"><label class="field"><span>GitHub owner</span><input id="setUpdateOwner" value="${escapeHtml(s.CLIPBOOST_UPDATE_OWNER||'')}"></label><label class="field"><span>Repository</span><input id="setUpdateRepo" value="${escapeHtml(s.CLIPBOOST_UPDATE_REPO||'')}"></label></div>
      </section>
      <section class="card settings-card settings-health"><div class="section-head"><div><div class="eyebrow">Diagnostics</div><h3>System health</h3></div><button class="btn secondary compact-btn" id="runHealthCheckBtn" ${state.systemHealthLoading?'disabled':''}>${state.systemHealthLoading?'Checking…':'Run check'}</button></div>
        ${state.systemHealth?`<div class="health-grid">${healthItem('FFmpeg',state.systemHealth.ffmpeg)}${healthItem('FFprobe',state.systemHealth.ffprobe)}${healthItem('Node / EJS',state.systemHealth.node)}${healthItem('yt-dlp',state.systemHealth.ytDlp)}${healthItem('Python',state.systemHealth.python)}${healthItem('Face tracking',state.systemHealth.tracking)}${healthItem('Ollama',state.systemHealth.ollama)}${healthItem('YouTube API',state.systemHealth.youtube)}${healthItem('Twitch API',state.systemHealth.twitch)}</div>${state.systemHealth.paths?`<div class="health-paths"><span>Data</span><code>${escapeHtml(state.systemHealth.paths.data||'')}</code><span>Exports</span><code>${escapeHtml(state.systemHealth.paths.exports||'')}</code></div>`:''}`:`<div class="health-empty">Run a quick diagnostic to verify the tools ClipBoost needs for local processing.</div>`}
      </section>
    </div></div>`;
  }
  async function saveSettings(){
    if(state.settingsSaving)return;
    const payload={
      YOUTUBE_API_KEY:document.getElementById('setYoutubeKey')?.value||state.settings?.YOUTUBE_API_KEY||'',
      YOUTUBE_AUTH_BROWSER:document.getElementById('setYoutubeAuthBrowser')?.value||'firefox',
      TWITCH_CLIENT_ID:document.getElementById('setTwitchId')?.value||state.settings?.TWITCH_CLIENT_ID||'',
      TWITCH_CLIENT_SECRET:document.getElementById('setTwitchSecret')?.value||state.settings?.TWITCH_CLIENT_SECRET||'',
      PYTHON_BIN:document.getElementById('setPythonBin')?.value||'python',LOCAL_WHISPER_MODEL:document.getElementById('setWhisperModel')?.value||'small',
      LOCAL_WHISPER_DEVICE:'cpu',LOCAL_WHISPER_COMPUTE_TYPE:document.getElementById('setComputeType')?.value||'int8',LOCAL_WHISPER_CHUNK_SECONDS:document.getElementById('setChunkSeconds')?.value||'120',LOCAL_WHISPER_WORKERS:document.getElementById('setWorkers')?.value||'auto',
      LOCAL_WHISPER_SKIP_SILENCE:Boolean(document.getElementById('setSkipSilence')?.checked),OLLAMA_URL:document.getElementById('setOllamaUrl')?.value||'http://127.0.0.1:11434',OLLAMA_MODEL:document.getElementById('setOllamaModel')?.value||'qwen2.5:3b',CLIPBOOST_EXPORT_DIR:document.getElementById('setExportDir')?.value||'',CLIPBOOST_UPDATE_OWNER:document.getElementById('setUpdateOwner')?.value||'',CLIPBOOST_UPDATE_REPO:document.getElementById('setUpdateRepo')?.value||''
    };
    const desktopPayload={startWithWindows:Boolean(document.getElementById('setStartWindows')?.checked),closeToTray:Boolean(document.getElementById('setCloseTray')?.checked),ecoMode:Boolean(document.getElementById('setEcoMode')?.checked),idleTimeoutMinutes:Number(document.getElementById('setIdleTimeout')?.value||5),checkUpdatesOnStartup:Boolean(document.getElementById('setCheckUpdates')?.checked),autoDownloadUpdates:Boolean(document.getElementById('setAutoDownload')?.checked)};
    state.settingsSaving=true;state.settingsMessage='Saving settings…';render();
    try{
      const r=await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await readJsonResponse(r,'Could not save settings');
      if(window.clipboostDesktop?.saveSettings){state.desktopSettings=(await window.clipboostDesktop.saveSettings(desktopPayload)).settings}
      state.settingsMessage=data.restartRecommended?'Saved. Restart ClipBoost to apply all changes.':'Settings saved.';state.settings=null;await loadSettings();
    }catch(e){state.settingsMessage=e.message||'Could not save settings'}finally{state.settingsSaving=false;render()}
  }

  async function saveManualCandidateTrim(index,start,end,{reset=false}={}){
    const v=state.video,cand=v?.candidates?.[index];if(!v?.id||!cand)return;
    const duration=Math.max(.25,Number(v?.details?.duration||cand.end||0));
    let safeStart=Math.max(0,Math.min(duration-.25,Number(start)));
    let safeEnd=Math.min(duration,Math.max(safeStart+.25,Number(end)));
    if(!Number.isFinite(safeStart)||!Number.isFinite(safeEnd))return;
    if(safeEnd-safeStart>60)safeEnd=safeStart+60;
    state.candidatePreviewRequestId++;
    state.candidatePreviewLoading=false;
    state.candidatePreviewError='';
    try{
      const r=await fetch(`/api/videos/${encodeURIComponent(v.id)}/candidates/${index}/trim`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({start:safeStart,end:safeEnd,reset})});
      const data=await readJsonResponse(r,'Could not save manual cut');
      if(!data?.candidate)throw new Error('Manual cut was not saved.');
      v.candidates[index]={...cand,...data.candidate,previewUrl:null,previewMeta:null,previewEdited:false};
      state.timelineSeek=Number(v.candidates[index].start||0);
      state.campaignCompliance=null;state.campaignVariants=null;
      render();
      setTimeout(()=>prepareCandidatePreview(index,{autoplay:false,force:true}),0);
    }catch(e){
      showNotice({kind:'danger',eyebrow:'Manual cut',title:'Could not apply cut',message:e.message||'The manual start/end adjustment could not be saved.'});
      render();
    }
  }

  async function prepareCandidatePreview(index,{autoplay=false,force=false}={}){
    const v=state.video,cand=v?.candidates?.[index];if(!v?.id||!cand||!v?.sourceUrl)return;
    if(state.candidatePreviewLoading&&state.candidatePreviewLoadingIndex===index&&!force)return;
    if(cand.previewUrl&&!force){state.candidatePreviewAutoplay=autoplay;render();return;}
    const requestId=++state.candidatePreviewRequestId;
    state.candidatePreviewLoading=true;state.candidatePreviewLoadingIndex=index;state.candidatePreviewError='';state.candidatePreviewAutoplay=false;render();
    try{
      const r=await fetch(`/api/videos/${encodeURIComponent(v.id)}/preview`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({index,start:cand.start,end:cand.end,options:{...currentRenderOptions(),captionPreference:'off',captions:false,watermarkUrl:''}})});
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
    state.selectedCandidate=index;state.timelineSeek=Number(candidates[index].start||0);state.candidatePreviewError='';state.campaignCompliance=null;state.campaignVariants=null;
    if(candidates[index].previewUrl){state.candidatePreviewAutoplay=autoplay;render();}
    else prepareCandidatePreview(index,{autoplay});
  }

  function render(){const pages={home,'campaign-discover':campaignDiscover,studio,campaigns,'campaign-editor':campaignEditor,analytics,library,projects,publish,settings};document.getElementById('app').innerHTML=`<div class="app">${side()}<main class="main">${top()}${pages[state.page]()}</main></div>${campaignAssetBrowserMarkup()}${modalMarkup()}`;bind()}
  function bind(){
    const modalConfirm=document.getElementById('cbModalConfirm');if(modalConfirm)modalConfirm.onclick=()=>finishModal(true);
    const modalCancel=document.getElementById('cbModalCancel');if(modalCancel)modalCancel.onclick=()=>finishModal(false);
    const modalBackdrop=document.getElementById('cbModalBackdrop');if(modalBackdrop)modalBackdrop.onclick=e=>{if(e.target===modalBackdrop&&state.uiModal?.mode==='confirm')finishModal(false)};
    const closeCampaignAssetBrowserNow=()=>{if(!state.campaignAssetBrowser)return;state.campaignAssetBrowser=null;state.campaignAssetBusy=false;render()};
    const assetClose=document.getElementById('closeCampaignAssetBrowser');if(assetClose)assetClose.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();closeCampaignAssetBrowserNow()});
    const assetOverlay=document.getElementById('campaignAssetBrowserBackdrop');if(assetOverlay)assetOverlay.addEventListener('click',e=>{if(e.target===assetOverlay){e.preventDefault();e.stopPropagation()}});

    document.querySelectorAll('[data-shorts-count]').forEach(el=>el.onclick=()=>{state.shortsCount=[5,10,20].includes(Number(el.dataset.shortsCount))?Number(el.dataset.shortsCount):10;persistEditorPrefs();render()});
    document.querySelectorAll('[data-studio-mode]').forEach(el=>el.onclick=()=>{const next=el.dataset.studioMode==='long'?'long':'shorts';if(next===state.studioMode)return;state.studioMode=next;invalidateRenderedPreviews();persistEditorPrefs();render();if(state.video?.candidates?.length&&state.video?.sourceUrl)setTimeout(()=>prepareCandidatePreview(state.selectedCandidate||0,{autoplay:false,force:true}),0)});
    document.querySelectorAll('[data-page]').forEach(el=>el.addEventListener('click',()=>navigate(el.dataset.page)));
    document.querySelectorAll('[data-analytics-scope]').forEach(el=>el.onclick=()=>{state.analyticsScope=el.dataset.analyticsScope||'all';render()});
    document.querySelectorAll('[data-analytics-platform]').forEach(el=>el.onclick=()=>{state.analyticsPlatform=el.dataset.analyticsPlatform||'all';render()});
    const analyticsPeriodToggle=document.getElementById('analyticsPeriodToggle');if(analyticsPeriodToggle)analyticsPeriodToggle.onclick=e=>{e.stopPropagation();state.analyticsPeriodOpen=!state.analyticsPeriodOpen;render()};
    document.querySelectorAll('[data-analytics-period]').forEach(el=>el.onclick=()=>{state.analyticsPeriod=String(el.dataset.analyticsPeriod||'30');state.analyticsPeriodOpen=false;render()});
    const analyticsYoutubeConnect=document.getElementById('analyticsYoutubeConnect');if(analyticsYoutubeConnect)analyticsYoutubeConnect.onclick=()=>state.platformConnections?.youtube?.connected?loadYouTubeAnalytics({force:true,quiet:false}):connectPlatformAccount('youtube');
    const analyticsSearch=document.getElementById('analyticsSearch');if(analyticsSearch)analyticsSearch.oninput=e=>{state.analyticsSearch=String(e.target.value||'');render();setTimeout(()=>{const x=document.getElementById('analyticsSearch');if(x){x.focus();x.setSelectionRange(x.value.length,x.value.length)}},0)};
    const analyticsExport=document.getElementById('analyticsExport');if(analyticsExport)analyticsExport.onclick=()=>{const table=document.querySelector('.mint-posts-panel table');if(!table)return;const rows=[...table.querySelectorAll('tr')].map(tr=>[...tr.children].map(td=>`"${String(td.innerText||'').replaceAll('"','""')}"`).join(',')).join('\n');const blob=new Blob([rows],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='mint-stats.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
    document.querySelectorAll('[data-home-project]').forEach(el=>el.onclick=()=>openProject(el.dataset.homeProject));
    document.querySelectorAll('[data-home-campaign]').forEach(el=>el.onclick=()=>{state.campaignSelected=el.dataset.homeCampaign;state.campaignTab='overview';navigate('campaign-discover')});
    document.querySelectorAll('[data-campaign-open-studio]').forEach(el=>el.onclick=()=>{state.campaignSelected=el.dataset.campaignOpenStudio;state.campaignDetailsOpen=false;state.campaignEditorOpen=true;navigate('campaigns')});
    document.querySelectorAll('[data-campaign-discover-select]').forEach(el=>el.onclick=()=>{state.campaignSelected=el.dataset.campaignDiscoverSelect;state.campaignTab='overview';state.campaignDetailsOpen=true;state.campaignFormOpen=false;render()});
    document.querySelectorAll('[data-campaign-discover-delete]').forEach(el=>el.onclick=async e=>{
      e.preventDefault();e.stopPropagation();
      const id=el.dataset.campaignDiscoverDelete,c=(state.campaigns?.campaigns||[]).find(x=>String(x.id)===String(id));if(!id||!c||state.campaignBusy)return;
      const ok=await confirmAction({kind:'danger',eyebrow:'Discover',title:`Delete ${c.name||'this campaign'}?`,message:'This removes the campaign from Mint. External campaign pages and provider files are not deleted.',confirmLabel:'Delete campaign'});if(!ok)return;
      state.campaignBusy=true;
      try{const r=await fetch(`/api/campaigns/${encodeURIComponent(id)}`,{method:'DELETE'});await readJsonResponse(r,'Could not delete campaign');if(String(state.campaignSelected||'')===String(id)){state.campaignSelected=null;state.campaignDetailsOpen=false}state.campaigns=null;await loadCampaigns()}
      catch(err){showNotice({kind:'danger',eyebrow:'Discover',title:'Could not delete campaign',message:err.message||'The campaign could not be deleted.'})}
      finally{state.campaignBusy=false;render()}
    });
    const closeCampaignDetails=()=>{state.campaignDetailsOpen=false;render()};
    const closeCampaignDetailsBtn=document.getElementById('closeCampaignDetails');if(closeCampaignDetailsBtn)closeCampaignDetailsBtn.onclick=closeCampaignDetails;
    const campaignDetailsBackdrop=document.getElementById('campaignDetailsBackdrop');if(campaignDetailsBackdrop)campaignDetailsBackdrop.onclick=e=>{if(e.target===campaignDetailsBackdrop)closeCampaignDetails()};
    const m=document.getElementById('menu');if(m)m.onclick=()=>document.getElementById('sidebar').classList.toggle('open');
    const winMin=document.getElementById('mintWindowMin');if(winMin)winMin.onclick=()=>window.clipboostDesktop?.minimizeWindow?.();
    const winMax=document.getElementById('mintWindowMax');if(winMax)winMax.onclick=()=>window.clipboostDesktop?.maximizeWindow?.();
    const winClose=document.getElementById('mintWindowClose');if(winClose)winClose.onclick=()=>window.clipboostDesktop?.closeWindow?.();
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
      sourceVideo.addEventListener('error',()=>{const err=sourceVideo.error;showNotice({kind:'danger',eyebrow:'Downloaded media',title:'Video playback failed',message:err?.message||`Electron could not decode this media (code ${err?.code||'unknown'}).`})});
      // Native controls should own playback. Explicitly retry from the current
      // position on a trusted click if Chromium loaded metadata but did not start.
      sourceVideo.addEventListener('click',e=>{if(e.target!==sourceVideo||!sourceVideo.paused)return;sourceVideo.play().catch(err=>showNotice({kind:'danger',eyebrow:'Downloaded media',title:'Could not start playback',message:err?.message||'The video could not be played.'}))});
    }
    if(smartTimeline){smartTimeline.onclick=e=>{if(e.target.closest('[data-candidate]'))return;const rect=smartTimeline.getBoundingClientRect();if(!rect.width)return;const ratio=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));const t=ratio*Number(smartTimeline.dataset.duration||0);state.timelineSeek=t;updateTimelinePlayhead(t);if(sourceVideo){sourceVideo.currentTime=t;sourceVideo.play().catch(()=>{})}}}

    const shortVideo=document.getElementById('shortVideo'),liveCaption=document.getElementById('liveCaption');
    if(shortVideo&&liveCaption){
      const cand=state.video?.candidates?.[state.selectedCandidate||0];
      const captions=previewCaptionRowsForCandidate(cand);
      const captionWords=previewCaptionWordsForCandidate(cand);
      const duration=Math.max(.25,Number(cand?.end||0)-Number(cand?.start||0));
      let captionRaf=0;
      const accentMap={auto:'#ffd84a',white:'#ffffff',yellow:'#ffd84a',lime:'#75ff5c',cyan:'#35e7ff',pink:'#ff4fd8',red:'#ff4b55',green:'#43d17d',blue:'#4da3ff',purple:'#9b6cff',orange:'#ff9f43',black:'#111111'};
      const esc=s=>String(s||'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
      const syncCaption=()=>{
        const rel=Math.max(0,Math.min(duration,Number(shortVideo.currentTime||0)));
        const hookTitle=document.getElementById('liveHookTitle');
        if(hookTitle){
          const hookEnd=state.hookTitleDuration==='full'?duration:Math.min(duration,Number(state.hookTitleDuration||5));
          hookTitle.style.visibility=state.hookTitleEnabled&&String(state.hookTitleText||'').trim()&&rel<=hookEnd?'visible':'hidden';
        }

        const activeSpeechIndex=captionWords.findIndex(w=>rel>=Number(w.start||0)-.01&&rel<=Number(w.end||0)+.035);
        const activeSpeechWord=activeSpeechIndex>=0?captionWords[activeSpeechIndex]:null;
        const line=activeSpeechWord
          ? captions.find(x=>Number(activeSpeechWord.start||0)<Number(x.end||0)+.02&&Number(activeSpeechWord.end||0)>Number(x.start||0)-.02)
          : null;
        const hasSpeechCaption=Boolean(activeSpeechWord&&line?.text&&String(line.text).trim());
        liveCaption.style.visibility=hasSpeechCaption&&state.captionPreference!=='off'?'visible':'hidden';
        if(!hasSpeechCaption){
          liveCaption.innerHTML='';
          return;
        }

        const lineWords=captionWords.filter(w=>Number(w.end||0)>Number(line.start||0)+.005&&Number(w.start||0)<Number(line.end||0)-.005);
        const words=lineWords.length?lineWords:[activeSpeechWord];
        const active=Math.max(0,words.findIndex(w=>activeSpeechWord&&Math.abs(Number(w.start||0)-Number(activeSpeechWord.start||0))<.02));
        const effect=state.captionEffect||'active-word';
        const accent=accentMap[state.captionColor||'auto']||accentMap.auto;
        if(effect==='word-pop'){
          const w=words[active]||activeSpeechWord;
          liveCaption.innerHTML=`<span style="display:inline-block;color:${accent};transform:scale(1.12);font-weight:900">${esc(w?.word||'')}</span>`;
          return;
        }
        if(effect==='active-word'){
          liveCaption.innerHTML=words.map((w,i)=>`<span style="color:${i===active?accent:'#fff'};display:inline-block;${i===active?'transform:scale(1.08);':''}">${esc(w.word)}</span>`).join(' ');
          return;
        }
        if(effect==='karaoke'){
          liveCaption.innerHTML=words.map((w,i)=>`<span style="color:${i<=active?accent:'#fff'};display:inline-block">${esc(w.word)}</span>`).join(' ');
          return;
        }
        if(effect==='keyword-color'){
          liveCaption.innerHTML=words.map(w=>`<span style="color:${captionWordImportant(w.word)?accent:'#fff'};display:inline-block;${captionWordImportant(w.word)?'transform:scale(1.08);':''}">${esc(w.word)}</span>`).join(' ');
          return;
        }
        liveCaption.innerHTML=`<span style="color:${accent}">${esc(String(line.text||activeSpeechWord.word||''))}</span>`;
      };
      const stopCaptionClock=()=>{if(captionRaf){cancelAnimationFrame(captionRaf);captionRaf=0}};
      const tickCaptionClock=()=>{
        syncCaption();
        if(!shortVideo.paused&&!shortVideo.ended)captionRaf=requestAnimationFrame(tickCaptionClock);
        else captionRaf=0;
      };
      const startCaptionClock=()=>{stopCaptionClock();tickCaptionClock()};
      shortVideo.addEventListener('play',startCaptionClock);
      shortVideo.addEventListener('pause',()=>{stopCaptionClock();syncCaption()});
      shortVideo.addEventListener('timeupdate',syncCaption);
      shortVideo.addEventListener('seeked',syncCaption);
      shortVideo.addEventListener('loadedmetadata',syncCaption,{once:true});
      shortVideo.addEventListener('ended',()=>{stopCaptionClock();shortVideo.currentTime=0;syncCaption()});
      if(state.candidatePreviewAutoplay){
        const autoplay=()=>{state.candidatePreviewAutoplay=false;shortVideo.play().catch(()=>{});};
        if(shortVideo.readyState>=2)setTimeout(autoplay,0);else shortVideo.addEventListener('canplay',autoplay,{once:true});
      }
      syncCaption();
    }
    const manualTrimStart=document.getElementById('manualTrimStart');
    const manualTrimEnd=document.getElementById('manualTrimEnd');
    const updateManualTrimLabels=()=>{
      if(!manualTrimStart||!manualTrimEnd)return;
      let start=Number(manualTrimStart.value||0),end=Number(manualTrimEnd.value||start+.25);
      if(end<start+.25){
        if(document.activeElement===manualTrimStart)start=Math.max(0,end-.25);
        else end=start+.25;
      }
      const total=Math.max(.25,Number(state.video?.details?.duration||end));
      start=Math.max(0,Math.min(total-.25,start));
      end=Math.min(total,Math.max(start+.25,end));
      if(end-start>60){
        if(document.activeElement===manualTrimStart)start=Math.max(0,end-60);
        else end=Math.min(total,start+60);
      }
      manualTrimStart.value=start.toFixed(2);manualTrimEnd.value=end.toFixed(2);
      manualTrimStart.max=Math.max(0,end-.25).toFixed(2);
      manualTrimEnd.min=Math.min(total,start+.25).toFixed(2);
      const sv=document.getElementById('manualTrimStartValue'),ev=document.getElementById('manualTrimEndValue'),dv=document.getElementById('manualTrimDuration');
      if(sv)sv.textContent=formatTime(start);if(ev)ev.textContent=formatTime(end);if(dv)dv.textContent=(end-start).toFixed(1)+'s selected';
      const range=document.querySelector('.timeline-selected-range');
      if(range&&total>0){range.style.left=(start/total*100)+'%';range.style.width=((end-start)/total*100)+'%'}
      return {start,end};
    };
    if(manualTrimStart&&manualTrimEnd){
      manualTrimStart.oninput=updateManualTrimLabels;manualTrimEnd.oninput=updateManualTrimLabels;
      manualTrimStart.onchange=()=>{const x=updateManualTrimLabels();if(x)saveManualCandidateTrim(state.selectedCandidate||0,x.start,x.end)};
      manualTrimEnd.onchange=()=>{const x=updateManualTrimLabels();if(x)saveManualCandidateTrim(state.selectedCandidate||0,x.start,x.end)};
      document.querySelectorAll('[data-trim-boundary][data-trim-delta]').forEach(btn=>btn.onclick=()=>{
        const target=btn.dataset.trimBoundary==='start'?manualTrimStart:manualTrimEnd;
        const delta=Number(btn.dataset.trimDelta||0);target.value=(Number(target.value||0)+delta).toFixed(2);
        const x=updateManualTrimLabels();if(x)saveManualCandidateTrim(state.selectedCandidate||0,x.start,x.end);
      });
      const resetManualTrim=document.getElementById('resetManualTrim');if(resetManualTrim)resetManualTrim.onclick=()=>saveManualCandidateTrim(state.selectedCandidate||0,Number(manualTrimStart.value||0),Number(manualTrimEnd.value||0),{reset:true});
    }
    const retryPreview=document.getElementById('retryClipPreview');if(retryPreview)retryPreview.onclick=()=>prepareCandidatePreview(state.selectedCandidate||0,{autoplay:false,force:true});
    const previousCandidateBtn=document.getElementById('previousCandidateBtn');if(previousCandidateBtn)previousCandidateBtn.onclick=()=>selectCandidatePreview(Math.max(0,(state.selectedCandidate||0)-1),{autoplay:true});
    const nextCandidateBtn=document.getElementById('nextCandidateBtn');if(nextCandidateBtn)nextCandidateBtn.onclick=()=>selectCandidatePreview(Math.min((state.video?.candidates?.length||1)-1,(state.selectedCandidate||0)+1),{autoplay:true});
    const previewPublishBtn=document.getElementById('previewPublishBtn');if(previewPublishBtn)previewPublishBtn.onclick=()=>exportCurrent('publish');
    const previewDownloadBtn=document.getElementById('previewDownloadBtn');if(previewDownloadBtn)previewDownloadBtn.onclick=()=>exportCurrent('download');
    if((state.page==='studio'||state.page==='campaigns'||state.page==='campaign-editor')&&state.video?.candidates?.length){
      const idx=Math.min(state.selectedCandidate||0,state.video.candidates.length-1);
      const cand=state.video.candidates[idx];
      if(cand&&(!cand.previewUrl||cand.previewMeta?.editApplied?.captions!==false)&&!state.candidatePreviewLoading&&!state.candidatePreviewError)setTimeout(()=>prepareCandidatePreview(idx,{autoplay:false,force:Boolean(cand.previewUrl)}),0);
    }
    const publishBtn=document.getElementById('publishBtn');if(publishBtn)publishBtn.onclick=()=>exportCurrent('publish');
    const applyLiveCaptionStyle=()=>{
      const live=document.getElementById('liveCaption');
      if(!live)return;
      live.className=liveCaptionClass();
      live.style.top=(currentCaptionY()*100)+'%';
      const frame=live.closest('.mint-short-video-frame-v222');
      const frameWidth=Number(frame?.getBoundingClientRect?.().width||frame?.clientWidth||300);
      live.style.setProperty('--caption-font-size',liveCaptionFontSize(frameWidth));
      const outlinePx=liveCaptionOutlineSize(frameWidth);
      const previewFont={
        social:'"Arial Black","Segoe UI Black",Arial,sans-serif',
        impact:'Impact,"Arial Black",sans-serif',
        'arial-black':'"Arial Black",Arial,sans-serif',
        'segoe-black':'"Segoe UI Black","Arial Black",sans-serif'
      }[state.captionFont||'social'];
      live.style.setProperty('font-family',previewFont||'"Arial Black","Segoe UI Black",sans-serif','important');
      live.style.setProperty('font-weight','900','important');
      const baseColor={auto:'#fff',white:'#fff',yellow:'#ffd84a',lime:'#75ff5c',cyan:'#35e7ff',pink:'#ff4fd8',red:'#ff4b55',green:'#43d17d',blue:'#4da3ff',purple:'#9b6cff',orange:'#ff9f43',black:'#111'}[state.captionColor||'auto']||'#fff';
      live.style.setProperty('color',baseColor,'important');
      if((state.captionStyle||'bold')==='box') live.style.setProperty('-webkit-text-stroke','0 transparent','important');
      else live.style.setProperty('-webkit-text-stroke',`${outlinePx.toFixed(2)}px #000`,'important');
      live.style.display=state.captionPreference==='off'?'none':'';
      document.querySelectorAll('[data-caption-color]').forEach(btn=>btn.classList.toggle('active',(btn.dataset.captionColor||'auto')===(state.captionColor||'auto')));
    };
    const refreshLiveCaptionPreview=()=>{applyLiveCaptionStyle();shortVideo?.dispatchEvent(new Event('timeupdate'))};
    const saveLiveCaptionSettings=()=>{persistEditorPrefs();refreshLiveCaptionPreview()};
    const captionPreferenceSelect=document.getElementById('captionPreferenceSelect');if(captionPreferenceSelect)captionPreferenceSelect.onchange=e=>{state.captionPreference=e.target.value;saveLiveCaptionSettings()};
    const rerenderSourceSubtitlePreview=()=>{persistEditorPrefs();invalidateRenderedPreviews();render()};
    const sourceSubtitleModeSelect=document.getElementById('sourceSubtitleModeSelect');if(sourceSubtitleModeSelect)sourceSubtitleModeSelect.onchange=e=>{state.sourceSubtitleMode=e.target.value;rerenderSourceSubtitlePreview()};
    const sourceSubtitleBottomRange=document.getElementById('sourceSubtitleBottomRange');if(sourceSubtitleBottomRange){
      sourceSubtitleBottomRange.oninput=e=>{state.sourceSubtitleBottom=Math.max(.06,Math.min(.28,Number(e.target.value)/100));const label=document.getElementById('sourceSubtitleBottomValue');if(label)label.textContent=Math.round(state.sourceSubtitleBottom*100)+'%';persistEditorPrefs()};
      sourceSubtitleBottomRange.onchange=()=>{invalidateRenderedPreviews();render()};
    }
    document.querySelectorAll('[data-caption-color]').forEach(btn=>btn.onclick=()=>{state.captionColor=btn.dataset.captionColor||'auto';saveLiveCaptionSettings()});
    const captionStyleSelect=document.getElementById('captionStyleSelect');if(captionStyleSelect)captionStyleSelect.onchange=e=>{state.captionStyle=e.target.value;saveLiveCaptionSettings()};
    const captionFontSelect=document.getElementById('captionFontSelect');if(captionFontSelect)captionFontSelect.onchange=e=>{state.captionFont=e.target.value;saveLiveCaptionSettings()};
    const captionEffectSelect=document.getElementById('captionEffectSelect');if(captionEffectSelect)captionEffectSelect.onchange=e=>{state.captionEffect=e.target.value;persistEditorPrefs();refreshLiveCaptionPreview()};
    const updateHookTitlePreview=()=>{const hook=document.getElementById('liveHookTitle');if(!hook)return;hook.textContent=String(state.hookTitleText||'').toUpperCase();hook.style.left=(Number(state.hookTitleX||.5)*100)+'%';hook.style.top=(Number(state.hookTitleY||.12)*100)+'%';const video=document.getElementById('shortVideo');const cand=state.video?.candidates?.[state.selectedCandidate||0];const duration=Math.max(.25,Number(cand?.end||0)-Number(cand?.start||0));const rel=Number(video?.currentTime||0);const hookEnd=state.hookTitleDuration==='full'?duration:Math.min(duration,Number(state.hookTitleDuration||5));hook.style.visibility=state.hookTitleEnabled&&String(state.hookTitleText||'').trim()&&rel<=hookEnd?'visible':'hidden'};
    const hookTitleEnabledSelect=document.getElementById('hookTitleEnabledSelect');if(hookTitleEnabledSelect)hookTitleEnabledSelect.onchange=e=>{state.hookTitleEnabled=e.target.value==='on';persistEditorPrefs();updateHookTitlePreview()};
    const hookTitleTextInput=document.getElementById('hookTitleTextInput');if(hookTitleTextInput)hookTitleTextInput.oninput=e=>{state.hookTitleText=String(e.target.value||'').slice(0,120);persistEditorPrefs();updateHookTitlePreview()};
    const hookTitleDurationSelect=document.getElementById('hookTitleDurationSelect');if(hookTitleDurationSelect)hookTitleDurationSelect.onchange=e=>{state.hookTitleDuration=e.target.value;persistEditorPrefs();updateHookTitlePreview()};
    const hookTitleFromAiBtn=document.getElementById('hookTitleFromAiBtn');if(hookTitleFromAiBtn)hookTitleFromAiBtn.onclick=()=>{const cand=state.video?.candidates?.[state.selectedCandidate||0];state.hookTitleText=String(cand?.title||cand?.hook||'').slice(0,120);state.hookTitleEnabled=Boolean(state.hookTitleText);persistEditorPrefs();if(hookTitleTextInput)hookTitleTextInput.value=state.hookTitleText;if(hookTitleEnabledSelect)hookTitleEnabledSelect.value=state.hookTitleEnabled?'on':'off';updateHookTitlePreview()};
    const centerHookXBtn=document.getElementById('centerHookXBtn');if(centerHookXBtn)centerHookXBtn.onclick=()=>{state.hookTitleX=.5;persistEditorPrefs();updateHookTitlePreview()};
    const centerHookBtn=document.getElementById('centerHookBtn');if(centerHookBtn)centerHookBtn.onclick=()=>{state.hookTitleX=.5;state.hookTitleY=.5;persistEditorPrefs();updateHookTitlePreview()};
    const captionSizeSelect=document.getElementById('captionSizeSelect');if(captionSizeSelect)captionSizeSelect.onchange=e=>{state.captionSize=e.target.value;state.captionScale=1;const range=document.getElementById('captionScaleRange');const value=document.getElementById('captionScaleValue');if(range)range.value='100';if(value)value.textContent='100%';saveLiveCaptionSettings()};
    const captionScaleRange=document.getElementById('captionScaleRange');if(captionScaleRange)captionScaleRange.oninput=e=>{state.captionScale=Math.max(.4,Math.min(2,Number(e.target.value)/100));const value=document.getElementById('captionScaleValue');if(value)value.textContent=Math.round(state.captionScale*100)+'%';persistEditorPrefs();applyLiveCaptionStyle()};
    const captionPositionSelect=document.getElementById('captionPositionSelect');if(captionPositionSelect)captionPositionSelect.onchange=e=>{if(e.target.value==='custom')return;state.captionPosition=e.target.value;state.captionY=null;saveLiveCaptionSettings()};
    if(liveCaption){
      const frame=liveCaption.closest('.mint-short-video-frame-v222');
      let dragging=false,lastY=currentCaptionY();
      const updateCaptionDrag=e=>{
        if(!dragging||!frame)return;
        const rect=frame.getBoundingClientRect();if(!rect.height)return;
        lastY=Math.max(.12,Math.min(.88,(e.clientY-rect.top)/rect.height));
        liveCaption.style.top=(lastY*100)+'%';
      };
      liveCaption.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();dragging=true;lastY=currentCaptionY();liveCaption.setPointerCapture?.(e.pointerId);liveCaption.classList.add('dragging')});
      liveCaption.addEventListener('pointermove',updateCaptionDrag);
      liveCaption.addEventListener('pointerup',e=>{if(!dragging)return;updateCaptionDrag(e);dragging=false;liveCaption.classList.remove('dragging');state.captionY=Number(lastY.toFixed(4));state.captionPosition='custom';persistEditorPrefs();const select=document.getElementById('captionPositionSelect');if(select&&!Array.from(select.options).some(o=>o.value==='custom'))select.add(new Option('Custom','custom'));if(select)select.value='custom'});
      liveCaption.addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const delta=e.key==='ArrowUp'?-.025:.025;state.captionY=Math.max(.12,Math.min(.88,currentCaptionY()+delta));state.captionPosition='custom';persistEditorPrefs();applyLiveCaptionStyle()});
    }
    const watermarkFile=document.getElementById('watermarkFile');if(watermarkFile)watermarkFile.onchange=e=>uploadWatermark(e.target.files?.[0]);
    const removeWatermarkBtn=document.getElementById('removeWatermarkBtn');if(removeWatermarkBtn)removeWatermarkBtn.onclick=()=>{state.watermarkUrl='';state.watermarkName='';persistEditorPrefs();render()};
    const liveWatermark=document.getElementById('liveWatermark');
    const applyWatermarkLive=()=>{
      const wm=document.getElementById('liveWatermark');if(!wm)return;
      wm.style.left=(Number(state.watermarkX||.86)*100)+'%';wm.style.top=(Number(state.watermarkY||.12)*100)+'%';wm.style.width=(Number(state.watermarkScale||.18)*100)+'%';wm.style.opacity=String(Number(state.watermarkOpacity||.9));
    };
    const watermarkScaleRange=document.getElementById('watermarkScaleRange');if(watermarkScaleRange)watermarkScaleRange.oninput=e=>{state.watermarkScale=Math.max(.05,Math.min(.42,Number(e.target.value)/100));persistEditorPrefs();applyWatermarkLive()};
    const watermarkOpacityRange=document.getElementById('watermarkOpacityRange');if(watermarkOpacityRange)watermarkOpacityRange.oninput=e=>{state.watermarkOpacity=Math.max(.1,Math.min(1,Number(e.target.value)/100));persistEditorPrefs();applyWatermarkLive()};
    const centerWatermarkXBtn=document.getElementById('centerWatermarkXBtn');if(centerWatermarkXBtn)centerWatermarkXBtn.onclick=()=>{state.watermarkX=.5;persistEditorPrefs();applyWatermarkLive()};
    const centerWatermarkBtn=document.getElementById('centerWatermarkBtn');if(centerWatermarkBtn)centerWatermarkBtn.onclick=()=>{state.watermarkX=.5;state.watermarkY=.5;persistEditorPrefs();applyWatermarkLive()};
    if(liveWatermark){
      const frame=liveWatermark.closest('.mint-short-video-frame-v222');let dragging=false;
      const move=e=>{if(!dragging||!frame)return;const rect=frame.getBoundingClientRect();if(!rect.width||!rect.height)return;state.watermarkX=Math.max(.04,Math.min(.96,(e.clientX-rect.left)/rect.width));state.watermarkY=Math.max(.04,Math.min(.96,(e.clientY-rect.top)/rect.height));applyWatermarkLive()};
      liveWatermark.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();dragging=true;liveWatermark.setPointerCapture?.(e.pointerId);liveWatermark.classList.add('dragging')});
      liveWatermark.addEventListener('pointermove',move);
      liveWatermark.addEventListener('pointerup',e=>{if(!dragging)return;move(e);dragging=false;liveWatermark.classList.remove('dragging');persistEditorPrefs()});
    }
        document.querySelectorAll('[data-publish-network]').forEach(el=>el.onchange=()=>{state.publishNetworks[el.dataset.publishNetwork]=el.checked});
    document.querySelectorAll('[data-publish-tab]').forEach(el=>el.onclick=()=>{state.publishActivePlatform=el.dataset.publishTab;render()});
    const toggleActivePublishNetwork=document.getElementById('toggleActivePublishNetwork');if(toggleActivePublishNetwork)toggleActivePublishNetwork.onclick=()=>{const id=state.publishActivePlatform||'tiktok';state.publishNetworks[id]=!state.publishNetworks[id];render()};
    document.querySelectorAll('[data-platform-connect]').forEach(el=>el.onclick=()=>connectPlatformAccount(el.dataset.platformConnect));
    document.querySelectorAll('[data-platform-disconnect]').forEach(el=>el.onclick=()=>disconnectPlatformAccount(el.dataset.platformDisconnect));
    const refreshPlatformConnections=document.getElementById('refreshPlatformConnections');if(refreshPlatformConnections)refreshPlatformConnections.onclick=()=>loadPlatformConnections();
    const publishSelectedBtn=document.getElementById('publishSelectedBtn');if(publishSelectedBtn)publishSelectedBtn.onclick=()=>{
      const selected=Object.entries(state.publishNetworks).filter(([,on])=>on).map(([id])=>id);
      const missing=selected.filter(id=>!state.platformConnections?.[id]?.connected);
      if(missing.length)return showNotice({kind:'warning',eyebrow:'Auto Publish',title:'Connect selected platforms first',message:`Connect ${missing.map(id=>state.platformConnections?.[id]?.label||id).join(', ')} before automatic publishing.`});
      showNotice({kind:'success',eyebrow:'Auto Publish',title:'Accounts connected',message:'All selected destinations are authorized. The account connection layer is ready for the automatic upload/publish API step.'});
    };
    document.querySelectorAll('[data-publish-title]').forEach(el=>el.oninput=()=>{const id=el.dataset.publishTitle;state.publishDrafts[id]={...(state.publishDrafts[id]||{}),title:el.value}});
    document.querySelectorAll('[data-publish-description]').forEach(el=>el.oninput=()=>{const id=el.dataset.publishDescription;state.publishDrafts[id]={...(state.publishDrafts[id]||{}),description:el.value}});
    const savePublishDraftsBtn=document.getElementById('savePublishDraftsBtn');if(savePublishDraftsBtn)savePublishDraftsBtn.onclick=()=>{try{localStorage.setItem('clipboost:publishDrafts',JSON.stringify({drafts:state.publishDrafts,networks:state.publishNetworks}))}catch{}showNotice({kind:'success',title:'Post drafts saved',message:'Titles, descriptions and selected networks are saved locally.'})};
    const generateVariationsBtn=document.getElementById('generateVariationsBtn');if(generateVariationsBtn)generateVariationsBtn.onclick=async()=>{
      if(!state.video?.id||state.regenerating)return;
      state.regenerating=true;state.video={...state.video,status:'analyzing',analysis:{...(state.video.analysis||{}),stage:'semantic-clips',progress:72}};generateVariationsBtn.disabled=true;generateVariationsBtn.textContent='↻ Generating clips…';
      try{
        const r=await fetch(`/api/videos/${encodeURIComponent(state.video.id)}/analyze`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clipCount:'auto'})});
        const data=await readJsonResponse(r,'Could not generate clip variations');
        state.video=data;state.selectedCandidate=0;pollProjectUntilSettled(state.video.id);
      }catch(e){showNotice({kind:'danger',title:'Generation failed',message:e.message||'Could not generate clip variations'})}
      finally{state.regenerating=false;if(!['ingesting','analyzing'].includes(state.video?.status))render()}
    };
    const autoIngest=document.getElementById('autoIngestBtn');if(autoIngest)autoIngest.onclick=()=>state.video?.id&&startProjectIngestion(state.video.id);
    if((state.page==='studio'||state.page==='campaigns'||state.page==='campaign-editor')&&state.video?.status==='linked'&&!state.video?.sourceUrl&&state.video?.externalSource)maybeAutoIngestCurrentProject();
    document.querySelectorAll('[data-open-project]').forEach(el=>el.onclick=()=>openProject(el.dataset.openProject));
    document.querySelectorAll('[data-delete-project]').forEach(el=>el.onclick=e=>{e.stopPropagation();removeProject(el.dataset.deleteProject,el.dataset.deleteProjectName)});
    if((state.page==='publish'||state.page==='analytics')&&!state.platformConnections&&!state.platformConnectionsLoading)setTimeout(()=>loadPlatformConnections({quiet:true}),0);
    if(state.page==='analytics'&&state.platformConnections?.youtube?.connected&&!state.youtubeAnalytics&&!state.youtubeAnalyticsLoading)setTimeout(()=>loadYouTubeAnalytics({quiet:true}),0);
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
    if((state.page==='projects'||state.page==='home')&&!state.projects&&!state.projectsLoading)setTimeout(loadProjects,0);
    if((state.page==='campaigns'||state.page==='campaign-editor'||state.page==='campaign-discover'||state.page==='analytics'||state.page==='home')&&!state.campaigns&&!state.campaignsLoading)setTimeout(loadCampaigns,0);
    if(state.page==='campaign-discover'||state.page==='campaigns'||state.page==='campaign-editor'){
      const openNew=()=>{state.campaignDraftUrl='';state.campaignImportDraft=null;state.campaignFormOpen=true;render();setTimeout(()=>document.getElementById('campaignName')?.focus(),0)};
      const newBtn=document.getElementById('newCampaignBtn');if(newBtn)newBtn.onclick=openNew;
      const emptyNew=document.getElementById('emptyNewCampaignBtn');if(emptyNew)emptyNew.onclick=openNew;
      const importBtn=document.getElementById('importCampaignBtn');if(importBtn)importBtn.onclick=importCampaign;
      const openSite=document.getElementById('openCampaignSiteBtn');if(openSite)openSite.onclick=()=>{const idx=Number(document.getElementById('campaignSiteSelect')?.value||0),site=(state.campaignSites||[])[idx];if(site?.url)importCampaign(site.url)};
      const addSite=document.getElementById('addCampaignSiteBtn');if(addSite)addSite.onclick=async()=>{
        const raw=prompt('Campaign site URL (example: https://platform.com/campaigns)');if(!raw)return;
        let url='';try{const u=new URL(raw);if(!/^https?:$/.test(u.protocol))throw 0;url=u.href}catch{return showNotice({kind:'warning',eyebrow:'Smart Import',title:'Invalid site URL',message:'Enter a complete http or https URL.'})}
        const name=prompt('Site name',new URL(url).hostname.replace(/^www\./,''))||new URL(url).hostname;
        if((state.campaignSites||[]).some(x=>x.url===url))return;
        state.campaignSites=[...(state.campaignSites||[]),{id:'site-'+Date.now(),name:String(name).trim().slice(0,60)||'Campaign site',url}];persistCampaignSites();render();
      };
      const closeForm=document.getElementById('closeCampaignForm');if(closeForm)closeForm.onclick=()=>{const keep=state.campaignFormOpen==='import'&&!!state.campaignImportDraft;state.campaignFormOpen=false;if(keep){persistCampaignImportReview();state.campaignMessage='Import review saved. Use “Review import” to reopen it.'}else{state.campaignDraftUrl='';}render()};
      const cancelForm=document.getElementById('cancelCampaignBtn');if(cancelForm)cancelForm.onclick=()=>{const keep=state.campaignFormOpen==='import'&&!!state.campaignImportDraft;state.campaignFormOpen=false;if(keep){persistCampaignImportReview();state.campaignMessage='Import review saved. Use “Review import” to reopen it.'}else{state.campaignDraftUrl='';}render()};
      const saveBtn=document.getElementById('saveCampaignBtn');if(saveBtn)saveBtn.onclick=()=>saveCampaign(saveBtn.dataset.campaignEditId||'');
      const paymentModel=document.getElementById('campaignPaymentModel');const syncCampaignPaymentFields=()=>{const current=paymentModel?.value||'custom';document.querySelectorAll('[data-payment-only]').forEach(el=>{const allowed=String(el.dataset.paymentOnly||'').split(',').map(x=>x.trim()).filter(Boolean);el.style.display=allowed.includes(current)?'':'none'});const label=document.getElementById('campaignFixedRewardLabel');if(label)label.textContent=current==='fixed-reward'?'Reward amount':'Default rate'};if(paymentModel){paymentModel.onchange=syncCampaignPaymentFields;syncCampaignPaymentFields();}
      document.querySelectorAll('[data-campaign-select]').forEach(el=>el.onclick=()=>{state.campaignSelected=el.dataset.campaignSelect;state.campaignTab='overview';state.campaignFormOpen=false;state.campaignImportDraft=null;render()});
      document.querySelectorAll('[data-campaign-select]').forEach(el=>el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click()}});
      document.querySelectorAll('[data-open-campaign-editor]').forEach(el=>el.onclick=e=>{e.stopPropagation();state.campaignSelected=el.dataset.openCampaignEditor;state.campaignEditorOpen=true;navigate('campaigns')});
      document.querySelectorAll('[data-campaign-results]').forEach(el=>el.onclick=e=>{e.stopPropagation();state.campaignSelected=el.dataset.campaignResults;state.campaignTab='results';render()});
      const editBtn=document.getElementById('editCampaignBtn');if(editBtn)editBtn.onclick=()=>{state.campaignImportDraft=null;state.campaignFormOpen='edit';render()};
      const editRulesBtn=document.getElementById('editCampaignRulesBtn');if(editRulesBtn)editRulesBtn.onclick=()=>{state.campaignImportDraft=null;state.campaignFormOpen='edit';render()};
      document.querySelectorAll('[data-campaign-tab]').forEach(el=>el.onclick=()=>{state.campaignTab=el.dataset.campaignTab||'overview';render()});
      const formBackdrop=document.getElementById('campaignFormBackdrop');if(formBackdrop)formBackdrop.onclick=e=>{if(e.target===formBackdrop){const keep=state.campaignFormOpen==='import'&&!!state.campaignImportDraft;state.campaignFormOpen=false;if(keep){persistCampaignImportReview();state.campaignMessage='Import review saved. Use “Review import” to reopen it.'}else{state.campaignDraftUrl='';}render()}};
      const reopenImport=document.getElementById('reopenCampaignImportBtn');if(reopenImport)reopenImport.onclick=()=>{if(state.campaignImportDraft){state.campaignFormOpen='import';state.campaignMessage='Unsaved Smart Import review reopened.';render()}};
      const discardImport=document.getElementById('discardCampaignImportBtn');if(discardImport)discardImport.onclick=async()=>{const ok=await confirmAction({kind:'warning',title:'Discard saved import?',message:'This removes the unsaved Smart Import review. The campaign will not be created.',confirmLabel:'Discard'});if(ok){clearCampaignImportReview();state.campaignFormOpen=false;state.campaignMessage='Saved import discarded.';render()}};
      const deleteBtn=document.getElementById('deleteCampaignBtn');if(deleteBtn)deleteBtn.onclick=deleteCampaign;
      const addSource=document.getElementById('addCampaignSourceBtn');if(addSource)addSource.onclick=()=>addCampaignSource().catch(e=>showNotice({kind:'danger',title:'Could not add source',message:e.message}));
      const batchBtn=document.getElementById('batchCampaignBtn');if(batchBtn)batchBtn.onclick=batchCampaignProjects;
      const startBtn=document.getElementById('startCampaignBtn');if(startBtn)startBtn.onclick=startCampaignCreating;
      const openCampaignUrl=document.getElementById('openCampaignUrlBtn');if(openCampaignUrl)openCampaignUrl.onclick=()=>{const c=selectedCampaign();if(c?.campaignUrl)window.open(c.campaignUrl,'_blank')};
      const copyChecklist=document.getElementById('copyCampaignChecklistBtn');if(copyChecklist)copyChecklist.onclick=copyCampaignChecklist;
      document.querySelectorAll('[data-campaign-source]').forEach(el=>el.onclick=()=>openCampaignSource(el.dataset.campaignSource));
      document.querySelectorAll('[data-campaign-pack]').forEach(el=>el.onclick=()=>browseCampaignAssetPack(el.dataset.campaignPack));
      document.querySelectorAll('[data-campaign-asset-edit]').forEach(el=>el.onclick=()=>openCampaignAssetMedia(el.dataset.campaignAssetEdit));
      document.querySelectorAll('[data-campaign-source-remove]').forEach(el=>el.onclick=()=>removeCampaignSource(el.dataset.campaignSourceRemove).catch(e=>showNotice({kind:'danger',title:'Could not remove source',message:e.message})));
      const addPost=document.getElementById('addCampaignPostBtn');if(addPost)addPost.onclick=()=>addCampaignPost().catch(e=>showNotice({kind:'danger',title:'Could not track post',message:e.message}));
      document.querySelectorAll('[data-campaign-post-update]').forEach(el=>el.onclick=()=>updateCampaignPost(el.dataset.campaignPostUpdate).catch(e=>showNotice({kind:'danger',title:'Could not update post',message:e.message})));
      document.querySelectorAll('[data-campaign-post-delete]').forEach(el=>el.onclick=()=>deleteCampaignPost(el.dataset.campaignPostDelete).catch(e=>showNotice({kind:'danger',title:'Could not remove post',message:e.message})));
      const pack=document.getElementById('downloadSubmissionPackBtn');if(pack)pack.onclick=()=>{const c=selectedCampaign();if(c)window.open(`/api/campaigns/${encodeURIComponent(c.id)}/submission-pack`,'_blank')};
    }
    const campaignEditorBack=document.getElementById('campaignEditorBackBtn');if(campaignEditorBack)campaignEditorBack.onclick=()=>{state.campaignEditorOpen=false;navigate('campaigns')};
    const exitCampaignEditor=document.getElementById('exitCampaignEditorBtn');if(exitCampaignEditor)exitCampaignEditor.onclick=()=>{state.campaignEditorOpen=false;state.campaignTab='overview';navigate('campaign-discover')};
    const campaignEditorRules=document.getElementById('campaignEditorRulesBtn');if(campaignEditorRules)campaignEditorRules.onclick=()=>{state.campaignEditorOpen=false;state.campaignTab='rules';navigate('campaign-discover')};
    const campaignEditorResults=document.getElementById('campaignEditorResultsBtn');if(campaignEditorResults)campaignEditorResults.onclick=()=>{state.campaignEditorOpen=false;state.campaignTab='results';navigate('campaign-discover')};

    const openStudioCampaign=document.getElementById('openStudioCampaignBtn');if(openStudioCampaign)openStudioCampaign.onclick=()=>{const id=state.video?.campaign?.id;if(id)state.campaignSelected=id;state.campaignTab='overview';navigate('campaign-discover')};
    const campaignCheck=document.getElementById('campaignCheckBtn');if(campaignCheck)campaignCheck.onclick=()=>runCampaignCheck().catch(e=>showNotice({kind:'danger',title:'Campaign check failed',message:e.message}));
    const campaignVariants=document.getElementById('campaignVariantsBtn');if(campaignVariants)campaignVariants.onclick=()=>generateCampaignVariants().catch(e=>showNotice({kind:'danger',title:'Could not generate variants',message:e.message}));
    document.querySelectorAll('[data-campaign-variant]').forEach(el=>el.onclick=()=>{const idx=Number(el.dataset.campaignVariant||0),variant=state.campaignVariants?.[idx],ci=state.selectedCandidate||0;if(!variant||!state.video?.candidates?.[ci])return;state.video.candidates[ci]={...variant,previewUrl:null,previewMeta:null};state.campaignCompliance=null;state.campaignVariants=null;prepareCandidatePreview(ci,{autoplay:true,force:true})});
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
    document.querySelectorAll('[data-send-studio-id]').forEach(el=>el.onclick=()=>sendLibraryItemToStudio(el.dataset.sendStudioPlatform,el.dataset.sendStudioCreator,el.dataset.sendStudioType,el.dataset.sendStudioId,el.dataset.sendStudioMode||'shorts'));
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
    document.querySelectorAll('[data-library-platform]').forEach(el=>el.onclick=()=>{state.libraryPlatform=el.dataset.libraryPlatform;state.librarySection=state.libraryPlatform==='youtube'?'videos':'vods';state.libraryCreatorFilter='all';state.youtubeHistoryExpanded=false;state.libraryError='';state.libraryRefreshMessage='';clearTimeout(window.__clipboostTwitchLiveRefresh);clearTimeout(window.__clipboostTwitchClipsRefresh);render()});
    document.querySelectorAll('[data-library-section]').forEach(el=>el.onclick=()=>{state.librarySection=el.dataset.librarySection;clearTimeout(window.__clipboostTwitchLiveRefresh);clearTimeout(window.__clipboostTwitchClipsRefresh);render();if(state.libraryPlatform==='twitch'&&state.librarySection==='live')scheduleTwitchLiveRefresh();if(state.libraryPlatform==='twitch'&&state.librarySection==='clips')scheduleTwitchClipsRefresh()});
    const sort=document.getElementById('librarySort');if(sort)sort.onchange=e=>{state.librarySort=e.target.value;render()};
    const cf=document.getElementById('libraryCreatorFilter');if(cf)cf.onchange=e=>{state.libraryCreatorFilter=e.target.value;state.youtubeHistoryExpanded=false;state.twitchClipsLastRefresh=0;render();if(state.libraryPlatform==='twitch'&&state.librarySection==='clips')scheduleTwitchClipsRefresh()};
    if(state.page==='library'&&state.libraryPlatform==='twitch'&&state.librarySection==='live')scheduleTwitchLiveRefresh();
    if(state.page==='library'&&state.libraryPlatform==='twitch'&&state.librarySection==='clips')scheduleTwitchClipsRefresh();
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
  if(!window.__clipboostKeyboardShortcutsBound){window.__clipboostKeyboardShortcutsBound=true;window.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.campaignAssetBrowser){e.preventDefault();state.campaignAssetBrowser=null;state.campaignAssetBusy=false;render();return}if(e.key==='Escape'&&state.campaignDetailsOpen){e.preventDefault();state.campaignDetailsOpen=false;render();return}const tag=String(e.target?.tagName||'').toLowerCase();if(['input','textarea','select'].includes(tag)||e.target?.isContentEditable)return;if(state.page!=='studio')return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='e'){e.preventDefault();if(e.shiftKey)exportAll();else exportCurrent();return}if(e.key==='ArrowRight'||e.key==='ArrowLeft'){const list=state.video?.candidates||[];if(!list.length)return;e.preventDefault();const dir=e.key==='ArrowRight'?1:-1;const next=(Math.min(state.selectedCandidate||0,list.length-1)+dir+list.length)%list.length;selectCandidatePreview(next,{autoplay:false})}})}
  if(window.clipboostDesktop?.reportActivity&&!window.__clipboostActivityBound){
    window.__clipboostActivityBound=true;
    let lastActivityReport=0;
    const reportActivity=()=>{const now=Date.now();if(now-lastActivityReport<10000)return;lastActivityReport=now;try{window.clipboostDesktop.reportActivity()}catch{}};
    ['pointerdown','pointermove','keydown','wheel','touchstart'].forEach(name=>window.addEventListener(name,reportActivity,{passive:true}));
    window.addEventListener('focus',reportActivity);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)reportActivity()});
    reportActivity();
  }
  if(!location.hash) history.replaceState(null,'','#/home');
  const syncRouteFromLocation=()=>{const page=pageFromHash();if(page!==state.page){state.page=page;render();window.scrollTo(0,0);if(page==='studio'&&!state.video)setTimeout(restoreLastStudioProject,0);if(page==='analytics'&&!state.campaigns&&!state.campaignsLoading)setTimeout(loadCampaigns,0);if(page==='analytics'&&!state.platformConnections&&!state.platformConnectionsLoading)setTimeout(()=>loadPlatformConnections({quiet:true}),0)}};
  window.addEventListener('hashchange',syncRouteFromLocation);
  window.addEventListener('popstate',syncRouteFromLocation);
  render();
  if(state.page==='studio'&&!state.video)setTimeout(restoreLastStudioProject,0);
})();
