const fs=require('fs');
const path=require('path');
const ROOT=process.cwd();
const INDEX=path.join(ROOT,'index.html');
const PKG=path.join(ROOT,'package.json');

try{
  let html=fs.readFileSync(INDEX,'utf8');

  if(!html.includes('window-chrome-align-21.15.4.css')){
    html=html.replace('</head>','  <link rel="stylesheet" href="./src/window-chrome-align-21.15.4.css" />\n</head>');
  }
  if(!html.includes('window-chrome-align-21.15.4.js')){
    html=html.replace('</body>','  <script src="./src/window-chrome-align-21.15.4.js"></script>\n</body>');
  }
  fs.writeFileSync(INDEX,html,'utf8');

  const pkg=JSON.parse(fs.readFileSync(PKG,'utf8'));
  pkg.version='21.15.4';
  pkg.description='Mint release config repair and window chrome alignment';

  pkg.scripts = {
    dev:'node server/index.js',
    start:'node server/index.js',
    build:'vite build',
    desktop:'npm run build && electron .',
    'desktop:build':'npm run build && electron-builder --win nsis',
    'desktop:dir':'npm run build && electron-builder --win dir'
  };

  pkg.dependencies = {
    '@vitejs/plugin-react':'latest',
    dotenv:'latest',
    express:'latest',
    'lucide-react':'latest',
    multer:'latest',
    react:'latest',
    'react-dom':'latest',
    vite:'latest',
    'electron-updater':'^6.8.9'
  };

  pkg.devDependencies = {
    electron:'latest',
    'electron-builder':'latest'
  };

  pkg.build = {
    appId:'com.clipboost.desktop',
    productName:'ClipBoost',
    asar:false,
    directories:{output:'release'},
    files:[
      'dist/**/*','server/**/*','scripts/**/*','desktop/**/*',
      'requirements-local-ai.txt','.env.example','package.json',
      'index.html','src/**/*','public/**/*'
    ],
    win:{
      target:['nsis'],
      artifactName:'ClipBoost-Setup-${version}.${ext}',
      icon:'desktop/assets/clipboost.ico'
    },
    nsis:{
      oneClick:true,
      allowToChangeInstallationDirectory:false,
      createDesktopShortcut:'always',
      createStartMenuShortcut:true,
      shortcutName:'ClipBoost',
      perMachine:false,
      allowElevation:false,
      runAfterFinish:true,
      deleteAppDataOnUninstall:false,
      installerIcon:'desktop/assets/clipboost.ico',
      uninstallerIcon:'desktop/assets/clipboost.ico',
      installerHeaderIcon:'desktop/assets/clipboost.ico'
    }
  };

  fs.writeFileSync(PKG,JSON.stringify(pkg,null,2)+'\n','utf8');

  const lockPath=path.join(ROOT,'package-lock.json');
  if(fs.existsSync(lockPath)){
    try{
      const lock=JSON.parse(fs.readFileSync(lockPath,'utf8'));
      lock.version='21.15.4';
      if(lock.packages?.['']) lock.packages[''].version='21.15.4';
      fs.writeFileSync(lockPath,JSON.stringify(lock,null,2)+'\n','utf8');
    }catch{}
  }

  console.log('[Mint 21.15.4] release configuration restored.');
}catch(err){
  console.error('[Mint 21.15.4] patch error:',err?.stack||err);
  process.exitCode=0;
}
