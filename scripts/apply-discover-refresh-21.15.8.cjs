const fs=require('fs'), path=require('path');
const root=process.cwd();
const index=path.join(root,'index.html');
const pkgPath=path.join(root,'package.json');

try{
  let html=fs.readFileSync(index,'utf8');
  if(!html.includes('discover-refresh-21.15.8.css')){
    html=html.replace('</head>','  <link rel="stylesheet" href="./src/discover-refresh-21.15.8.css" />\n</head>');
    fs.writeFileSync(index,html,'utf8');
  }

  const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
  pkg.version='21.15.8';
  pkg.description='Mint Discover page visual refresh';
  if(pkg.scripts?.postinstall==='node scripts/apply-discover-refresh-21.15.8.cjs'){
    delete pkg.scripts.postinstall;
  }
  fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n','utf8');

  const lock=path.join(root,'package-lock.json');
  if(fs.existsSync(lock)){
    try{
      const data=JSON.parse(fs.readFileSync(lock,'utf8'));
      data.version='21.15.8';
      if(data.packages?.['']) data.packages[''].version='21.15.8';
      fs.writeFileSync(lock,JSON.stringify(data,null,2)+'\n','utf8');
    }catch{}
  }

  console.log('[Mint 21.15.8] Discover refresh applied.');
}catch(err){
  console.error('[Mint 21.15.8]',err?.message||err);
  process.exitCode=0;
}
