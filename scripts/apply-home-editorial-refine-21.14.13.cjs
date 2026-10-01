const fs=require('fs');
const path=require('path');
const ROOT=process.cwd();
const APP=path.join(ROOT,'src','app.js');
const INDEX=path.join(ROOT,'index.html');
const PKG=path.join(ROOT,'package.json');

let src=fs.readFileSync(APP,'utf8');
src=src.replace('const recent=projects.slice(0,4);','const recent=projects.slice(0,3);');
fs.writeFileSync(APP,src,'utf8');

let html=fs.readFileSync(INDEX,'utf8');
if(!html.includes('home-editorial-refine-21.14.13.css')){
  html=html.replace('</head>','  <link rel="stylesheet" href="./src/home-editorial-refine-21.14.13.css" />\n</head>');
}
fs.writeFileSync(INDEX,html,'utf8');

const pkg=JSON.parse(fs.readFileSync(PKG,'utf8'));
pkg.version='21.14.13';
if(pkg.scripts?.postinstall==='node scripts/apply-home-editorial-refine-21.14.13.cjs') delete pkg.scripts.postinstall;
fs.writeFileSync(PKG,JSON.stringify(pkg,null,2)+'\n','utf8');

const lockPath=path.join(ROOT,'package-lock.json');
if(fs.existsSync(lockPath)){
  try{
    const lock=JSON.parse(fs.readFileSync(lockPath,'utf8'));
    lock.version='21.14.13';
    if(lock.packages?.['']) lock.packages[''].version='21.14.13';
    fs.writeFileSync(lockPath,JSON.stringify(lock,null,2)+'\n','utf8');
  }catch{}
}
console.log('Mint Home editorial refinement 21.14.13 applied.');
