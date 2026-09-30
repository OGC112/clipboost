import React, { useMemo, useRef, useState } from 'react';
import {
  Home, WandSparkles, BarChart3, Library, TrendingUp, FolderKanban,
  Settings, Users, Search, Bell, Play, Upload, Sparkles, Scissors,
  Captions, Download, CheckCircle2, Clock3, Plus, ChevronRight,
  Youtube, Instagram, Twitch, SlidersHorizontal, LoaderCircle
} from 'lucide-react';

const navItems = [
  ['home','Home',Home],['studio','AI Studio',WandSparkles],['analytics','Analytics',BarChart3],
  ['library','Library',Library],['projects','Projects',FolderKanban]
];
const fmt = s => { if (!Number.isFinite(Number(s))) return '0:00'; const n=Math.max(0,Math.floor(Number(s))); return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`; };

function App(){
  const [page,setPage]=useState('home');
  const [video,setVideo]=useState(null);
  const [selected,setSelected]=useState(null);
  return <div className="app-shell">
    <Sidebar page={page} setPage={setPage}/>
    <main className="main-shell">
      <Topbar page={page}/>
      {page==='home' && <HomePage setPage={setPage} setVideo={setVideo} setSelected={setSelected}/>} 
      {page==='studio' && <StudioPage video={video} setVideo={setVideo} selected={selected} setSelected={setSelected}/>} 
      {page==='analytics' && <AnalyticsPage/>}
      {page==='library' && <LibraryPage/>}
      {page==='projects' && <ProjectsPage video={video} setPage={setPage}/>} 
    </main>
  </div>
}

function Sidebar({page,setPage}){
  return <aside className="sidebar">
    <div>
      <div className="brand"><span className="brand-mark"><Play size={14} fill="currentColor"/></span><b>ClipBoost</b></div>
      <nav>{navItems.map(([id,label,Icon])=><button key={id} onClick={()=>setPage(id)} className={page===id?'active':''}><Icon size={16}/><span>{label}</span></button>)}</nav>
    </div>
    <div className="side-bottom"><button><Users size={16}/>Team</button><button><Settings size={16}/>Settings</button><div className="profile"><span>A</span><div><b>Alex</b><small>Creator</small></div></div></div>
  </aside>
}
function Topbar({page}){ const title=navItems.find(x=>x[0]===page)?.[1]||'ClipBoost'; return <header className="topbar"><div><small>WORKSPACE / CLIPBOOST</small><b>{title}</b></div><div className="top-actions"><div className="search"><Search size={14}/><input placeholder="Search..."/></div><Bell size={16}/></div></header> }

function HomePage({setPage,setVideo,setSelected}){
  return <div className="page home-page">
    <section className="hero card">
      <div className="hero-copy"><span className="eyebrow">AI CREATOR OS</span><h1>Turn long videos into<br/>high-performing shorts.</h1><p>Upload a real video. ClipBoost analyzes scene changes and audio pauses, then proposes ready-to-edit moments automatically.</p><VideoUploader onReady={(v)=>{setVideo(v);setSelected(v.candidates?.[0]||null);setPage('studio')}}/></div>
      <div className="hero-phone"><div className="phone-glow"/><div className="phone"><div className="fake-face"/><div className="caption">THIS PART<br/><em>IS PERFECT.</em></div></div></div>
    </section>
    <section><SectionTitle kicker="WORKFLOW" title="From upload to short in one flow"/><div className="step-grid"><Step n="01" title="Upload" text="MP4, MOV, WebM and other browser-friendly video files."/><Step n="02" title="Analyze" text="FFmpeg detects pauses, scene changes and structural transitions."/><Step n="03" title="Edit" text="Open candidates directly in the AI Studio and fine-tune the cut."/><Step n="04" title="Export" text="Render the selected range as a 9:16 vertical MP4."/></div></section>
  </div>
}
function VideoUploader({onReady}){
  const input=useRef(); const [state,setState]=useState('idle'); const [progress,setProgress]=useState(0); const [message,setMessage]=useState('');
  const uploadFile=file=>{
    if(!file)return; setState('uploading');setMessage('Uploading video...');setProgress(0);
    const fd=new FormData();fd.append('video',file); const xhr=new XMLHttpRequest(); xhr.open('POST','/api/videos');
    xhr.upload.onprogress=e=>{if(e.lengthComputable)setProgress(Math.round(e.loaded/e.total*100))};
    xhr.onerror=()=>{setState('error');setMessage('Upload failed.')};
    xhr.onload=async()=>{ try{ if(xhr.status>=400)throw new Error(JSON.parse(xhr.responseText).error||'Upload failed'); const video=JSON.parse(xhr.responseText); setState('analyzing');setMessage('Analyzing cuts, pauses and scene changes...'); const r=await fetch(`/api/videos/${video.id}/analyze`,{method:'POST'}); const analyzed=await r.json(); if(!r.ok)throw new Error(analyzed.error||'Analysis failed'); setState('done');setMessage('Analysis complete.');onReady(analyzed);}catch(e){setState('error');setMessage(e.message)} };
    xhr.send(fd);
  };
  return <div className="uploader" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();uploadFile(e.dataTransfer.files?.[0])}}>
    <input ref={input} type="file" accept="video/*" hidden onChange={e=>uploadFile(e.target.files?.[0])}/>
    <button className="primary" onClick={()=>input.current?.click()} disabled={state==='uploading'||state==='analyzing'}>{state==='analyzing'?<LoaderCircle className="spin" size={16}/>:<Upload size={16}/>} Upload a video</button>
    <span>or drop it here</span>
    {state!=='idle'&&<div className="upload-status"><div><b>{message}</b><small>{state==='uploading'?`${progress}%`:state==='analyzing'?'This can take a few minutes for long VODs.':state==='done'?'Ready to edit.':''}</small></div><div className="progress"><i style={{width:`${state==='analyzing'?100:progress}%`}} className={state==='analyzing'?'indeterminate':''}/></div></div>}
  </div>
}
function Step({n,title,text}){return <div className="card step"><span>{n}</span><h3>{title}</h3><p>{text}</p></div>}
function SectionTitle({kicker,title}){return <div className="section-title"><span className="eyebrow">{kicker}</span><h2>{title}</h2></div>}

function StudioPage({video,setVideo,selected,setSelected}){
  const player=useRef();
  const uploadInput=useRef();
  const [uploading,setUploading]=useState(false);
  const [uploadProgress,setUploadProgress]=useState(0);
  const [uploadMessage,setUploadMessage]=useState('');
  const uploadFromStudio=(file)=>{
    if(!file)return;
    setUploading(true); setUploadProgress(0); setUploadMessage('Uploading video...');
    const fd=new FormData(); fd.append('video',file);
    const xhr=new XMLHttpRequest(); xhr.open('POST','/api/videos');
    xhr.upload.onprogress=e=>{if(e.lengthComputable)setUploadProgress(Math.round(e.loaded/e.total*100))};
    xhr.onerror=()=>{setUploading(false);setUploadMessage('Upload failed.');};
    xhr.onload=async()=>{
      try{
        if(xhr.status>=400) throw new Error(JSON.parse(xhr.responseText).error||'Upload failed');
        const uploaded=JSON.parse(xhr.responseText);
        setUploadMessage('Analyzing cuts, pauses and scene changes...');
        setUploadProgress(100);
        const r=await fetch(`/api/videos/${uploaded.id}/analyze`,{method:'POST'});
        const analyzed=await r.json();
        if(!r.ok) throw new Error(analyzed.error||'Analysis failed');
        setVideo(analyzed);
        setSelected(analyzed.candidates?.[0]||null);
        setUploadMessage('Video ready.');
      }catch(e){
        setUploadMessage(e.message||'Upload failed.');
      }finally{
        setUploading(false);
        if(uploadInput.current) uploadInput.current.value='';
      }
    };
    xhr.send(fd);
  }; const [start,setStart]=useState(selected?.start||0); const [end,setEnd]=useState(selected?.end||30); const [exporting,setExporting]=useState(false); const [exportUrl,setExportUrl]=useState(null);
  React.useEffect(()=>{if(selected){setStart(selected.start);setEnd(selected.end); if(player.current){player.current.currentTime=selected.start;player.current.play().catch(()=>{})}}},[selected]);
  if(!video) return <div className="page studio-empty-page">
    <div className="studio-upload-card card" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();uploadFromStudio(e.dataTransfer.files?.[0])}}>
      <div className="upload-icon"><Upload size={28}/></div>
      <span className="eyebrow">AI VIDEO PROJECT</span>
      <h1>Upload your first video</h1>
      <p>Drop an MP4, MOV or WebM here. ClipBoost will analyze scene changes, pauses and pacing, then create clip candidates automatically.</p>
      <input ref={uploadInput} type="file" accept="video/*" hidden onChange={e=>uploadFromStudio(e.target.files?.[0])}/>
      <button className="primary studio-upload-button" disabled={uploading} onClick={()=>uploadInput.current?.click()}>
        {uploading?<LoaderCircle className="spin" size={17}/>:<Upload size={17}/>} {uploading?'Processing video...':'Upload video'}
      </button>
      <small>or drag and drop your video anywhere inside this box</small>
      {uploadMessage&&<div className="studio-upload-progress"><div><b>{uploadMessage}</b><span>{uploading?`${uploadProgress}%`:''}</span></div><div className="progress"><i className={uploading&&uploadProgress===100?'indeterminate':''} style={{width:`${uploadProgress}%`}}/></div></div>}
    </div>
  </div>;
  const doExport=async()=>{setExporting(true);setExportUrl(null);try{const r=await fetch(`/api/videos/${video.id}/export`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({start,end})});const d=await r.json();if(!r.ok)throw new Error(d.error);setExportUrl(d.url)}catch(e){alert(e.message)}finally{setExporting(false)}};
  return <div className="page studio-page">
    <div className="studio-head"><div><span className="eyebrow">REAL VIDEO PROJECT</span><h1>{video.originalName}</h1><p>{fmt(video.details.duration)} · {video.details.width}×{video.details.height} · {video.details.fps} fps</p></div><div className="studio-head-actions">
      <input ref={uploadInput} type="file" accept="video/*" hidden onChange={e=>uploadFromStudio(e.target.files?.[0])}/>
      <button className="secondary" onClick={()=>uploadInput.current?.click()} disabled={uploading}>{uploading?<LoaderCircle className="spin" size={16}/>:<Upload size={16}/>} {uploading?'Analyzing...':'Upload video'}</button>
      <button className="primary" onClick={doExport} disabled={exporting}>{exporting?<LoaderCircle className="spin" size={16}/>:<Download size={16}/>} {exporting?'Rendering...':'Export 9:16'}</button>
    </div></div>
    {uploading&&<div className="studio-inline-upload card"><div><b>{uploadMessage}</b><span>{uploadProgress}%</span></div><div className="progress"><i className={uploadProgress===100?'indeterminate':''} style={{width:`${uploadProgress}%`}}/></div></div>}
    <div className="studio-grid">
      <div className="card editor-panel"><video ref={player} src={video.sourceUrl} controls playsInline/><div className="range-box"><label>Start <b>{fmt(start)}</b><input type="range" min="0" max={Math.max(1,video.details.duration)} step="0.1" value={start} onChange={e=>{const v=Number(e.target.value);setStart(Math.min(v,end-.5)); if(player.current)player.current.currentTime=v}}/></label><label>End <b>{fmt(end)}</b><input type="range" min="0" max={Math.max(1,video.details.duration)} step="0.1" value={end} onChange={e=>setEnd(Math.max(Number(e.target.value),start+.5))}/></label></div>
        <div className="timeline"><div className="wave">{Array.from({length:96}).map((_,i)=><i key={i} style={{height:`${8+(i*17)%34}px`}}/>)}</div><div className="timeline-selection" style={{left:`${(start/video.details.duration)*100}%`,width:`${((end-start)/video.details.duration)*100}%`}}/></div>
      </div>
      <div className="card candidates"><div className="panel-title"><div><span className="eyebrow">AUTO DETECTION</span><h3>5 clip candidates</h3></div><Sparkles size={18}/></div>{video.candidates.map((c,i)=><button key={c.id} onClick={()=>setSelected(c)} className={`candidate ${selected?.id===c.id?'active':''}`}><div className="candidate-thumb">{c.thumbnailUrl?<img src={c.thumbnailUrl}/>:<div/>}<span>{c.score}</span></div><div><b>Candidate {i+1}</b><small>{fmt(c.start)} – {fmt(c.end)} · {Math.round(c.duration)}s</small><p>{c.reason}</p></div><ChevronRight size={16}/></button>)}</div>
      <div className="card short-panel"><div className="panel-title"><div><span className="eyebrow">VERTICAL OUTPUT</span><h3>Short preview</h3></div><Captions size={18}/></div><div className="vertical-preview">{selected?.thumbnailUrl?<img src={selected.thumbnailUrl}/>:<div className="fake-face"/>}<div className="caption">YOUR BEST<br/><em>MOMENT HERE</em></div></div><div className="control-list"><div><span>Auto reframe</span><b>Center crop</b></div><div><span>Clip length</span><b>{Math.round(end-start)}s</b></div><div><span>Detection score</span><b>{selected?.score||'—'}/100</b></div></div>{exportUrl&&<a className="primary full" href={exportUrl} download>Download rendered clip</a>}</div>
    </div>
    <div className="card analysis-note"><Scissors size={18}/><div><b>Current detection engine</b><p>This MVP uses real FFmpeg scene-change and silence signals. Semantic transcription / hook scoring is the next engine upgrade.</p></div></div>
  </div>
}

function Kpi({label,value,delta}){return <div className="card kpi"><small>{label}</small><b>{value}</b><span>{delta}</span><svg viewBox="0 0 120 30"><polyline points="0,25 15,21 27,23 40,16 53,18 67,12 82,14 96,7 108,9 120,3" fill="none"/></svg></div>}
function AnalyticsPage(){return <div className="page"><SectionTitle kicker="MULTI-PLATFORM INTELLIGENCE" title="Account analytics"/><div className="kpi-grid"><Kpi label="Total views" value="18.7M" delta="+24.8%"/><Kpi label="Followers" value="1.42M" delta="+12.4%"/><Kpi label="Engagement rate" value="7.8%" delta="+12.1%"/><Kpi label="Average views" value="482K" delta="+18.3%"/></div><div className="analytics-grid"><div className="card chart"><h3>Views over time</h3><svg viewBox="0 0 700 230" preserveAspectRatio="none"><polyline points="0,200 70,188 140,174 210,180 280,145 350,155 420,118 490,129 560,88 630,102 700,55" fill="none" className="l1"/><polyline points="0,214 70,206 140,195 210,182 280,188 350,164 420,170 490,146 560,152 630,120 700,103" fill="none" className="l2"/></svg></div><div className="card donut-card"><h3>Platform split</h3><div className="donut"><span>18.7M<small>views</small></span></div></div></div></div>}
function LibraryPage(){const rows=['Kameto — Just Chatting','Squeezie — React','Inoxtag — Minecraft','Amine — Discussion','ZeratoR — Event'];return <div className="page"><SectionTitle kicker="AUTO-INGESTION" title="Library"/><div className="card wide-card"><div className="panel-title"><h3>Followed creators</h3><button className="primary"><Plus size={14}/> Add creator</button></div><div className="creator-row">{['K','S','I','A','Z','G','P'].map((x,i)=><span key={i}>{x}</span>)}</div></div><div className="card list-card">{rows.map((r,i)=><div className="list-row" key={r}><div className="thumb gradient"/><div><b>{r}</b><small>{2+i}h {14-i*2}m · {8+i*2} clips detected</small></div><button className="secondary">Analyze</button></div>)}</div></div>}
function TrendsPage(){const topics=['GTA VI','New Twitch drama','Valorant update','MrBeast','Olympic Games'];return <div className="page"><SectionTitle kicker="TREND INTELLIGENCE" title="Trends"/><div className="trend-grid"><div className="card"><h3>Trending topics</h3>{topics.map((t,i)=><div className="trend-row" key={t}><span>{i+1}</span><b>{t}</b><small>+{284-i*37}% mentions</small><i/></div>)}</div><div className="card"><h3>Clips gaining velocity</h3>{['1.2M views','960K views','740K views','680K views'].map((t,i)=><div className="trend-row" key={t}><span>{i+1}</span><div className="mini-thumb gradient"/><b>{t}</b><small>+{14-i*2}K/h</small></div>)}</div></div></div>}
function ProjectsPage({video,setPage}){return <div className="page"><SectionTitle kicker="WORKFLOW" title="Projects"/><div className="card list-card">{video&&<div className="list-row clickable" onClick={()=>setPage('studio')}><div className="thumb">{video.candidates?.[0]?.thumbnailUrl&&<img src={video.candidates[0].thumbnailUrl}/>}</div><div><b>{video.originalName}</b><small>{video.candidates.length} detected clips · Ready to edit</small></div><span className="status ready"><CheckCircle2 size={13}/> Ready</span></div>}{['Best of Kameto #12','Gaming reactions','Creator highlights'].map((r,i)=><div className="list-row" key={r}><div className="thumb gradient"/><div><b>{r}</b><small>{8+i*3} shorts · Updated recently</small></div><span className="status"><Clock3 size={13}/> In progress</span></div>)}</div></div>}

export default App;
