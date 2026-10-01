const fs=require('fs');
const path=require('path');

const ROOT=process.cwd();
const APP=path.join(ROOT,'src','app.js');
const INDEX=path.join(ROOT,'index.html');
const PKG=path.join(ROOT,'package.json');

if(!fs.existsSync(APP)) throw new Error('src/app.js not found');
let src=fs.readFileSync(APP,'utf8');

const MARK='/* MINT-RED-NOIR-21.14.6 */';

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
    if(c==='{')depth++; else if(c==='}'){depth--;if(depth===0)return {start,end:i+1}}
  }
  throw new Error(`Could not parse ${name}`);
}
function replaceFunction(name,replacement){
  const r=functionRange(src,name);
  src=src.slice(0,r.start)+replacement+src.slice(r.end);
}

replaceFunction('top', `function top(){
    const u=state.desktopUpdate||{};
    const updatePill=['checking','downloading','ready','error'].includes(u.status)
      ? \`<button class="update-pill \${u.status}" id="updateCenterBtn" type="button"><span>\${u.status==='ready'?'✓':u.status==='error'?'!':'↻'}</span>\${u.status==='downloading'?\`Update \${Math.round(u.percent||0)}%\`:u.status==='checking'?'Checking update…':u.status==='ready'?\`Update \${escapeHtml(u.version||'')} ready\`:'Update issue'}</button>\`
      : '';
    return \`<header class="topbar mint-home-topbar mint-split-topbar mint-clean-topbar mint-red-topbar">
      <button class="mint-home-brand mint-wordmark-only" data-page="home" type="button"><strong>Mint</strong></button>

      <nav class="mint-split-nav mint-centered-nav">
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

      <div class="mint-home-top-actions mint-split-actions mint-clean-actions">
        \${updatePill}
        <button class="mint-home-icon-btn mint-settings-gear" data-page="settings" type="button" aria-label="Settings" title="Settings">⚙</button>
      </div>
    </header>\`
  }`);

src=src.replace(
  '<h1>Your Mint workspace</h1>',
  '<h1>Your Mint <span class="mint-red-word">workspace</span></h1>'
);

if(!src.includes(MARK)) src=MARK+'\n'+src;
fs.writeFileSync(APP,src,'utf8');

let html=fs.readFileSync(INDEX,'utf8');
if(!html.includes('red-noir-21.14.6.css')){
  html=html.replace('</head>','  <link rel="stylesheet" href="./src/red-noir-21.14.6.css" />\n</head>');
}
fs.writeFileSync(INDEX,html,'utf8');

const pkg=JSON.parse(fs.readFileSync(PKG,'utf8'));
pkg.version='21.14.6';
if(pkg.scripts?.postinstall==='node scripts/apply-red-noir-21.14.6.cjs') delete pkg.scripts.postinstall;
fs.writeFileSync(PKG,JSON.stringify(pkg,null,2)+'\n','utf8');

const lockPath=path.join(ROOT,'package-lock.json');
if(fs.existsSync(lockPath)){
  try{
    const lock=JSON.parse(fs.readFileSync(lockPath,'utf8'));
    lock.version='21.14.6';
    if(lock.packages?.['']) lock.packages[''].version='21.14.6';
    fs.writeFileSync(lockPath,JSON.stringify(lock,null,2)+'\n','utf8');
  }catch{}
}

console.log('Mint Red Noir Home 21.14.6 applied.');
