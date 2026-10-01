const fs=require('fs');
const path=require('path');
const cp=require('child_process');
const root=process.cwd();
const pkgPath=path.join(root,'package.json');
try{
  const patch=path.join(root,'scripts','apply-discover-compact-21.15.12.cjs');
  cp.execFileSync(process.execPath,[patch],{cwd:root,stdio:'inherit'});
}catch(e){
  console.error('21.15.12 patch warning:',e.message);
}finally{
  try{
    const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
    if(pkg.scripts&&pkg.scripts.postinstall==='node scripts/postinstall-discover-compact-21.15.12.cjs'){
      delete pkg.scripts.postinstall;
      fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
    }
  }catch{}
}
process.exit(0);
