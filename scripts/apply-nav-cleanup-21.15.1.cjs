const fs=require('fs');
const path=require('path');
const ROOT=process.cwd();
const APP=path.join(ROOT,'src','app.js');
const INDEX=path.join(ROOT,'index.html');
const PKG=path.join(ROOT,'package.json');

try{
  let src=fs.readFileSync(APP,'utf8');

  const homeButton=`        <button data-page="home" class="mint-nav-home \${state.page==='home'?'active':''}" type="button">Home</button>

`;
  if(src.includes(homeButton)){
    src=src.replace(homeButton,'');
    console.log('[Mint 21.15.1] Removed Home navigation button.');
  }else{
    console.log('[Mint 21.15.1] Home navigation button already removed or source changed.');
  }

  fs.writeFileSync(APP,src,'utf8');

  let html=fs.readFileSync(INDEX,'utf8');
  if(!html.includes('nav-cleanup-21.15.1.css')){
    html=html.replace('</head>','  <link rel="stylesheet" href="./src/nav-cleanup-21.15.1.css" />\n</head>');
    fs.writeFileSync(INDEX,html,'utf8');
  }

  const pkg=JSON.parse(fs.readFileSync(PKG,'utf8'));
  pkg.version='21.15.1';
  pkg.description='Mint navigation cleanup';
  if(pkg.scripts?.postinstall==='node scripts/apply-nav-cleanup-21.15.1.cjs')delete pkg.scripts.postinstall;
  fs.writeFileSync(PKG,JSON.stringify(pkg,null,2)+'\n','utf8');

  const lock=path.join(ROOT,'package-lock.json');
  if(fs.existsSync(lock)){
    try{
      const x=JSON.parse(fs.readFileSync(lock,'utf8'));
      x.version='21.15.1';
      if(x.packages?.[''])x.packages[''].version='21.15.1';
      fs.writeFileSync(lock,JSON.stringify(x,null,2)+'\n','utf8');
    }catch{}
  }
}catch(error){
  console.error('[Mint 21.15.1] patch warning:',error?.message||error);
  try{
    const pkg=JSON.parse(fs.readFileSync(PKG,'utf8'));
    if(pkg.scripts?.postinstall==='node scripts/apply-nav-cleanup-21.15.1.cjs')delete pkg.scripts.postinstall;
    fs.writeFileSync(PKG,JSON.stringify(pkg,null,2)+'\n','utf8');
  }catch{}
  process.exitCode=0;
}
