const fs=require('fs');
const path=require('path');
const ROOT=process.cwd();
const INDEX=path.join(ROOT,'index.html');
const PKG=path.join(ROOT,'package.json');

function log(m){console.log(`[Mint 21.15.2] ${m}`)}
function ensureInsert(src, marker, block, label){
  if(src.includes(block.trim().slice(0,80))){log(`${label}: already applied`);return src;}
  const i=src.indexOf(marker);
  if(i<0) throw new Error(`${label}: marker not found`);
  log(`${label}: applied`);
  return src.slice(0,i)+block+src.slice(i);
}

try{
  let html=fs.readFileSync(INDEX,'utf8');
  html=ensureInsert(html,'</head>','  <link rel="stylesheet" href="./src/structured-workspaces-21.15.2.css" />\n','CSS entry');
  html=ensureInsert(html,'</body>','  <script src="./src/structured-workspaces-21.15.2.js"></script>\n','JS entry');
  fs.writeFileSync(INDEX,html,'utf8');

  const pkg=JSON.parse(fs.readFileSync(PKG,'utf8'));
  pkg.version='21.15.2';
  pkg.description='Mint structured workspace overhaul';
  if(pkg.scripts?.postinstall==='node scripts/apply-structured-workspaces-21.15.2.cjs') delete pkg.scripts.postinstall;
  fs.writeFileSync(PKG,JSON.stringify(pkg,null,2)+'\n','utf8');

  const lock=path.join(ROOT,'package-lock.json');
  if(fs.existsSync(lock)){
    try{
      const x=JSON.parse(fs.readFileSync(lock,'utf8'));
      x.version='21.15.2';
      if(x.packages?.['']) x.packages[''].version='21.15.2';
      fs.writeFileSync(lock,JSON.stringify(x,null,2)+'\n','utf8');
    }catch(e){log('package-lock update skipped');}
  }
  log('structured workspaces installed');
}catch(error){
  console.error('[Mint 21.15.2] patch skipped:',error?.stack||error);
  try{
    const pkg=JSON.parse(fs.readFileSync(PKG,'utf8'));
    if(pkg.scripts?.postinstall==='node scripts/apply-structured-workspaces-21.15.2.cjs') delete pkg.scripts.postinstall;
    fs.writeFileSync(PKG,JSON.stringify(pkg,null,2)+'\n','utf8');
  }catch{}
  process.exitCode=0;
}
