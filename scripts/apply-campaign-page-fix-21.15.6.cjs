const fs=require('fs'),path=require('path');
const root=process.cwd(),index=path.join(root,'index.html'),pkgPath=path.join(root,'package.json');
try{
  let html=fs.readFileSync(index,'utf8');
  if(!html.includes('campaign-page-fix-21.15.6.css')){
    html=html.replace('</head>','  <link rel="stylesheet" href="./src/campaign-page-fix-21.15.6.css" />\n</head>');
    fs.writeFileSync(index,html,'utf8');
  }
  const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
  pkg.version='21.15.6';
  if(pkg.scripts?.postinstall==='node scripts/apply-campaign-page-fix-21.15.6.cjs') delete pkg.scripts.postinstall;
  fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n','utf8');
  const lock=path.join(root,'package-lock.json');
  if(fs.existsSync(lock)){
    try{
      const x=JSON.parse(fs.readFileSync(lock,'utf8'));
      x.version='21.15.6';
      if(x.packages?.['']) x.packages[''].version='21.15.6';
      fs.writeFileSync(lock,JSON.stringify(x,null,2)+'\n','utf8');
    }catch{}
  }
}catch(e){
  console.error('[Mint 21.15.6]',e?.message||e);
  process.exitCode=0;
}
