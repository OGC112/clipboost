const fs=require('fs');
const path=require('path');
const ROOT=process.cwd();
const APP=path.join(ROOT,'src','app.js');
const INDEX=path.join(ROOT,'index.html');
const PKG=path.join(ROOT,'package.json');
let src=fs.readFileSync(APP,'utf8');
function functionRange(source,name){
  const needle=`function ${name}(`; const start=source.indexOf(needle); if(start<0) throw new Error(`Function ${name} not found`);
  let open=source.indexOf('{',start),depth=0,mode='code',quote='',esc=false;
  for(let i=open;i<source.length;i++){const c=source[i],n=source[i+1];
    if(mode==='string'){if(esc){esc=false;continue}if(c==='\\'){esc=true;continue}if(c===quote){mode='code';quote=''}continue}
    if(mode==='template'){if(esc){esc=false;continue}if(c==='\\'){esc=true;continue}if(c==='`')mode='code';continue}
    if(mode==='line'){if(c==='\n')mode='code';continue} if(mode==='block'){if(c==='*'&&n==='/'){mode='code';i++}continue}
    if(c==="'"||c==='"'){mode='string';quote=c;continue} if(c==='`'){mode='template';continue} if(c==='/'&&n==='/'){mode='line';i++;continue} if(c==='/'&&n==='*'){mode='block';i++;continue}
    if(c==='{')depth++; else if(c==='}'){depth--;if(depth===0)return {start,end:i+1};}
  } throw new Error(`Could not parse ${name}`);
}
function addRootClass(name,cls){const r=functionRange(src,name);let fn=src.slice(r.start,r.end);fn=fn.replace('return `<div class="content">','return `<div class="content '+cls+'">');src=src.slice(0,r.start)+fn+src.slice(r.end);}
addRootClass('library','mint-library-nb-v1418');
addRootClass('projects','mint-projects-nb-v1418');
const analyticsFn=`function analytics(){
    const campaignsList=state.campaigns?.campaigns||[];
    const totals=campaignsList.reduce((a,c)=>{const t=c.totals||{};a.views+=Number(t.totalViews||0);a.estimated+=Number(t.estimatedRevenue||0);a.confirmed+=Number(t.confirmedRevenue||c.confirmedPayout||0);a.posts+=Number(t.postCount||c.posts?.length||0);return a;},{views:0,estimated:0,confirmed:0,posts:0});
    const currency=campaignsList[0]?.currency||'USD';
    const rows=campaignsList.length?campaignsList.map(c=>{const t=c.totals||{};const q=Number(campaignQualification(c)||0);const views=Number(t.totalViews||0);const progress=q?Math.min(100,Math.round((views/q)*100)):null;return \`<button class="mint-results-row-v1418" data-home-campaign="\${escapeHtml(c.id)}" type="button"><div><strong>\${escapeHtml(c.name||'Campaign')}</strong><small>\${escapeHtml(c.provider||'Campaign')}</small></div><div><b>\${formatCount(views)}</b><small>views</small></div><div><b>\${Number(t.postCount||c.posts?.length||0)}</b><small>published</small></div><div><b>\${formatMoney(Number(t.estimatedRevenue||0),c.currency||currency)}</b><small>estimated</small></div><div><b>\${formatMoney(Number(t.confirmedRevenue||c.confirmedPayout||0),c.currency||currency)}</b><small>confirmed</small></div><div><b>\${progress===null?'—':progress+'%'}</b><small>target</small></div><span>→</span></button>\`;}).join(''):\`<div class="mint-results-empty-v1418">No tracked campaigns yet.</div>\`;
    return \`<div class="content mint-results-nb-v1418"><section class="mint-page-heading-v1418"><div><div class="eyebrow">REAL PERFORMANCE</div><h1>Results</h1><p>Verified campaign tracking only. Metrics stay empty when Mint does not have the data.</p></div></section><section class="mint-results-summary-v1418"><div><b>\${formatCount(totals.views)}</b><small>Tracked views</small></div><div><b>\${formatMoney(totals.estimated,currency)}</b><small>Estimated payout</small></div><div><b>\${formatMoney(totals.confirmed,currency)}</b><small>Confirmed payout</small></div><div><b>\${totals.posts}</b><small>Published clips</small></div></section><section class="mint-results-list-v1418"><header><b>Campaign performance</b><small>\${campaignsList.length} campaign\${campaignsList.length===1?'':'s'}</small></header>\${rows}</section></div>\`;
  }`;
{const r=functionRange(src,'analytics');src=src.slice(0,r.start)+analyticsFn+src.slice(r.end);}
fs.writeFileSync(APP,src,'utf8');
let html=fs.readFileSync(INDEX,'utf8');
if(!html.includes('unified-no-blocks-21.14.18.css')) html=html.replace('</head>','  <link rel="stylesheet" href="./src/unified-no-blocks-21.14.18.css" />\\n</head>');
fs.writeFileSync(INDEX,html,'utf8');
const pkg=JSON.parse(fs.readFileSync(PKG,'utf8')); pkg.version='21.14.18'; if(pkg.scripts?.postinstall==='node scripts/apply-unified-no-blocks-21.14.18.cjs') delete pkg.scripts.postinstall; fs.writeFileSync(PKG,JSON.stringify(pkg,null,2)+'\\n','utf8');
const lockPath=path.join(ROOT,'package-lock.json'); if(fs.existsSync(lockPath)){try{const lock=JSON.parse(fs.readFileSync(lockPath,'utf8'));lock.version='21.14.18';if(lock.packages?.[''])lock.packages[''].version='21.14.18';fs.writeFileSync(lockPath,JSON.stringify(lock,null,2)+'\\n','utf8')}catch{}}
console.log('Mint unified no-block theme 21.14.18 applied.');
