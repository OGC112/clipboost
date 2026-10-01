const fs=require('fs');
const path=require('path');

const ROOT=process.cwd();
const INDEX=path.join(ROOT,'index.html');
const PKG=path.join(ROOT,'package.json');

let html=fs.readFileSync(INDEX,'utf8');
if(!html.includes('red-light-match-21.14.8.css')){
  html=html.replace('</head>','  <link rel="stylesheet" href="./src/red-light-match-21.14.8.css" />\n</head>');
}
fs.writeFileSync(INDEX,html,'utf8');

const pkg=JSON.parse(fs.readFileSync(PKG,'utf8'));
pkg.version='21.14.8';
if(pkg.scripts?.postinstall==='node scripts/apply-red-light-match-21.14.8.cjs') delete pkg.scripts.postinstall;
fs.writeFileSync(PKG,JSON.stringify(pkg,null,2)+'\n','utf8');

const lockPath=path.join(ROOT,'package-lock.json');
if(fs.existsSync(lockPath)){
  try{
    const lock=JSON.parse(fs.readFileSync(lockPath,'utf8'));
    lock.version='21.14.8';
    if(lock.packages?.['']) lock.packages[''].version='21.14.8';
    fs.writeFileSync(lockPath,JSON.stringify(lock,null,2)+'\n','utf8');
  }catch{}
}

console.log('Mint Red Light Match 21.14.8 applied.');
