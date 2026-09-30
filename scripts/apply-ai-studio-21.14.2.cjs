const fs=require('fs');
const path=require('path');

const ROOT=process.cwd();
const APP=path.join(ROOT,'src','app.js');
const INDEX=path.join(ROOT,'index.html');
const PKG=path.join(ROOT,'package.json');
if(!fs.existsSync(APP)) throw new Error('src/app.js not found');

let src=fs.readFileSync(APP,'utf8');
const MARK='/* MINT-AI-STUDIO-21.14.2 */';

function functionRange(source,name){
  const needle=`function ${name}(`;
  const start=source.indexOf(needle);
  if(start<0) throw new Error(`Function ${name} not found`);
  let open=source.indexOf('{',start);
  let depth=0,mode='code',quote='',esc=false;
  for(let i=open;i<source.length;i++){
    const c=source[i],n=source[i+1];
    if(mode==='string'){if(esc){esc=false;continue}if(c==='\\'){esc=true;continue}if(c===quote){mode='code';quote=''}continue}
    if(mode==='template'){if(esc){esc=false;continue}if(c==='\\'){esc=true;continue}if(c==='`'){mode='code'}continue}
    if(mode==='line'){if(c==='\n')mode='code';continue}
    if(mode==='block'){if(c==='*'&&n==='/'){mode='code';i++}continue}
    if(c==="'"||c==='"'){mode='string';quote=c;continue}
    if(c==='`'){mode='template';continue}
    if(c==='/'&&n==='/'){mode='line';i++;continue}
    if(c==='/'&&n==='*'){mode='block';i++;continue}
    if(c==='{')depth++;
    else if(c==='}'){depth--;if(depth===0)return {start,end:i+1,text:source.slice(start,i+1)}}
  }
  throw new Error(`Could not parse ${name}`);
}

function replaceTailReturn(name,newReturn){
  const r=functionRange(src,name);
  const idx=r.text.lastIndexOf('return `');
  if(idx<0) throw new Error(`Final return template not found in ${name}`);
  const rebuilt=r.text.slice(0,idx)+newReturn+'\n  }';
  src=src.slice(0,r.start)+rebuilt+src.slice(r.end);
}

const newStudioReturn = `return \`<div class="content mint-studio-page-v142">
      <section class="mint-studio-header-v142">
        <div>
          <div class="eyebrow">AI VIDEO EDITOR</div>
          <h1>AI Studio</h1>
          <p>Turn any source into polished short-form clips with AI-assisted editing.</p>
        </div>
        <div class="mint-studio-header-actions-v142">
          <button class="btn secondary">Save</button>
          <button class="btn secondary" id="exportAllBtn" \${hasLocal&&candidates.length&&!state.exportAllBusy?'':'disabled'}>\${state.exportAllBusy?'Exporting all…':'Export all clips'}</button>
          <button class="btn primary" id="exportBtn" \${hasLocal&&!state.exportBusy?'':'disabled'}>\${state.exportBusy?'Exporting…':'Export edited clip'}</button>
        </div>
      </section>

      <section class="mint-studio-toolstrip-v142">
        <article><span>▣</span><div><b>Auto Clips</b><small>Find the strongest moments</small></div></article>
        <article><span>CC</span><div><b>Auto Captions</b><small>Social-ready captions</small></div></article>
        <article><span>✦</span><div><b>Smart Edits</b><small>Cut, clean and reframe</small></div></article>
        <article><span>◎</span><div><b>AI Highlights</b><small>Score key moments</small></div></article>
      </section>

      \${analysisStatus}
      \${uploader}

      <div class="mint-studio-workspace-v142">
        <main class="mint-studio-main-v142">
          <section class="card mint-studio-source-v142">
            <header class="mint-studio-source-head-v142">
              <div><div class="eyebrow">SOURCE</div><h3>\${escapeHtml(videoTitle)}</h3></div>
              <span class="mint-source-status-v142">\${hasLocal?'Ready':linked?'Linked':'No source'}</span>
            </header>
            <div class="video mint-studio-video-v142">\${realVideo}</div>
          </section>

          <section class="card mint-studio-timeline-card-v142">
            <div class="section-head"><div><div class="eyebrow">SMART TIMELINE</div><h3>Timeline & detected moments</h3></div><span class="muted">\${analyzing?\`Local AI: \${escapeHtml(analysisStage||'analyzing')}\${transcriptionDetail} · \${Math.round(ingestProgress)}%\`:hasLocal?(v.candidates?.length||0)+' strong clip'+((v.candidates?.length||0)===1?'':'s')+' found':ingesting?'Automatic ingestion in progress':linked?'Source linked — ingest to analyze':'Upload a video to analyze it'}</span></div>
            <div class="timeline mint-studio-timeline-v142">\${timelineMarkup}</div>
            <div class="moments mint-studio-moments-v142">\${moments}</div>
          </section>
        </main>

        <aside class="mint-studio-side-v142">
          <section class="card short-panel mint-preview-card-v142">
            <div class="section-head"><div><div class="eyebrow">PREVIEW · \${candidates.length?selected+1:0}/\${candidates.length}</div><h3>Short preview</h3></div><span>•••</span></div>
            <div class="phone tall">\${realPhone}</div>
            <div class="clip-range"><label>Start <input id="clipStart" type="number" step="0.1" value="\${Number(c.start||0).toFixed(1)}"></label><label>End <input id="clipEnd" type="number" step="0.1" value="\${Number(c.end||30).toFixed(1)}"></label></div>
            <div class="preview-note">Preview uses the same renderer as final export.</div>
          </section>

          <section class="card controls mint-ai-tools-v142">
            <div class="section-head"><div><div class="eyebrow">AI DIRECTOR</div><h3>Automatic editing</h3></div><span>✦</span></div>
            <div class="auto-director-card">
              <div class="auto-director-status"><span class="auto-director-dot"></span><div><strong>Auto Director</strong><small>Adapts every clip to speech, scenes and framing.</small></div></div>
              <div class="auto-director-tags">\${autoTags.map(x=>\`<span>\${escapeHtml(x)}</span>\`).join('')}</div>
              \${autoDirector?.reason?\`<p>\${escapeHtml(autoDirector.reason)}</p>\`:''}
            </div>
            <div class="selectrow"><span>Captions</span><select id="captionPreferenceSelect"><option value="auto" \${state.captionPreference==='auto'?'selected':''}>Auto (recommended)</option><option value="on" \${state.captionPreference==='on'?'selected':''}>Always on</option><option value="off" \${state.captionPreference==='off'?'selected':''}>Off</option></select></div>
            <div class="caption-color-control"><div class="caption-color-head"><span>Caption color</span><small>Social presets</small></div><div class="caption-color-palette">\${[['auto','Auto'],['white','White'],['yellow','Yellow'],['lime','Lime'],['cyan','Cyan'],['pink','Pink'],['red','Red']].map(([value,label])=>\`<button type="button" class="caption-color-chip \${state.captionColor===value?'active':''}" data-caption-color="\${value}"><i class="caption-swatch swatch-\${value}">\${value==='auto'?'A':''}</i><span>\${label}</span></button>\`).join('')}</div></div>
            <div class="quality-explainer"><b>Automatic per clip</b><span>Framing, face safety, silence cuts, speech cleanup, captions and zooms adapt to the source.</span></div>
            \${editPlan?\`<div class="edit-plan-card"><span class="eyebrow">AUTO EDIT PLAN</span><strong>\${activeSummary.cuts} silence cuts · \${activeSummary.disfluencies} cleanups · \${activeSummary.zooms} zooms</strong><small>\${activeSummary.reframes} reframe pass\${trackingInfo?\` · \${trackingInfo.faceCountMax||0} faces max\`:''}\${editApplied?.preset?\` · \${escapeHtml(editApplied.preset)} profile\`:''}</small></div>\`:''}
            <button class="btn primary full generate" id="generateVariationsBtn" \${hasLocal&&!analyzing&&!state.regenerating?'':'disabled title="Wait for analysis to finish"'}>\${state.regenerating?'↻ Generating clips…':analyzing?'↻ Local AI analyzing…':hasLocal?'✦ Generate variations':ingesting?'↻ Processing source…':'⇧ Ingest source first'}</button>
          </section>
        </aside>
      </div>

      \${campaignStudio}
      \${transcriptPanel}
    </div>\``;

replaceTailReturn('studio', newStudioReturn);

if(!src.includes(MARK)) src=MARK+'\n'+src;
fs.writeFileSync(APP,src,'utf8');

let html=fs.readFileSync(INDEX,'utf8');
if(!html.includes('ai-studio-21.14.2.css')){
  html=html.replace('</head>','  <link rel="stylesheet" href="./src/ai-studio-21.14.2.css" />\n</head>');
}
fs.writeFileSync(INDEX,html,'utf8');

const pkg=JSON.parse(fs.readFileSync(PKG,'utf8'));
pkg.version='21.14.2';
if(pkg.scripts?.postinstall==='node scripts/apply-ai-studio-21.14.2.cjs') delete pkg.scripts.postinstall;
fs.writeFileSync(PKG,JSON.stringify(pkg,null,2)+'\n','utf8');

const lockPath=path.join(ROOT,'package-lock.json');
if(fs.existsSync(lockPath)){
  try{
    const lock=JSON.parse(fs.readFileSync(lockPath,'utf8'));
    lock.version='21.14.2';
    if(lock.packages?.['']) lock.packages[''].version='21.14.2';
    fs.writeFileSync(lockPath,JSON.stringify(lock,null,2)+'\n','utf8');
  }catch{}
}

console.log('Mint AI Studio 21.14.2 applied.');
