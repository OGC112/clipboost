const { app, BrowserWindow, shell, dialog, Menu, Tray, nativeImage, ipcMain, session, safeStorage } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');
const http = require('http');
const crypto = require('crypto');
const dotenv = require('dotenv');

// Stabilize Chromium rendering for Mint's frameless window on Windows.
if (process.platform === 'win32') {
  try { app.disableHardwareAcceleration(); } catch {}
}

let mainWindow = null;
let serverProcess = null;
let serverPort = null;
let updater = null;
let tray = null;
let isQuitting = false;
let updateState = { status: 'idle', version: null, percent: 0 };
let manualUpdateCheck = false;
let lastReadyEventVersion = null;
let installUpdateInProgress = false;
let downloadedUpdateFile = null;
let updateCheckInFlight = null;
let lastProgressEventPercent = -1;
let lastRendererActivity = Date.now();
let ecoMonitorTimer = null;
let runtimeEcoPaused = false;
let backendCleanupInFlight = null;
let backendCleanupComplete = false;
let allowImmediateQuit = false;
let campaignImportWindow = null;
let campaignImportWorker = null;
const CAMPAIGN_IMPORT_PARTITION = 'persist:clipboost-campaign-import';

function appRoot() {
  return app.isPackaged ? app.getAppPath() : path.resolve(__dirname, '..');
}
function userRoot() { return app.getPath('userData'); }
function ensureUserFiles() {
  const root = userRoot();
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) {
    const projectEnv = path.join(appRoot(), '.env');
    const exampleEnv = path.join(appRoot(), '.env.example');
    if (!app.isPackaged && fs.existsSync(projectEnv)) fs.copyFileSync(projectEnv, envPath);
    else if (fs.existsSync(exampleEnv)) fs.copyFileSync(exampleEnv, envPath);
    else fs.writeFileSync(envPath, '', 'utf8');
  }
  return { root, dataDir, envPath };
}
function readDesktopEnv() {
  const { envPath } = ensureUserFiles();
  try { return dotenv.parse(fs.readFileSync(envPath, 'utf8')); } catch { return {}; }
}
function desktopSettingsPath() { return path.join(userRoot(), 'desktop-settings.json'); }
function updateInstallMarkerPath() { return path.join(userRoot(), 'update-install.json'); }
function writeUpdateInstallMarker(version) {
  try {
    fs.writeFileSync(updateInstallMarkerPath(), JSON.stringify({version:String(version||''), requestedAt:new Date().toISOString()}, null, 2), 'utf8');
  } catch {}
}
function readUpdateInstallMarker() {
  try { return JSON.parse(fs.readFileSync(updateInstallMarkerPath(),'utf8')); } catch { return null; }
}
function clearUpdateInstallMarker() {
  try { fs.unlinkSync(updateInstallMarkerPath()); } catch {}
}

function platformTokensPath() { return path.join(userRoot(), 'platform-oauth.json'); }
function readPlatformTokens() {
  try {
    const parsed=JSON.parse(fs.readFileSync(platformTokensPath(),'utf8'));
    const out={};
    for(const [provider,encoded] of Object.entries(parsed||{})){
      try {
        const encrypted=Buffer.from(String(encoded||''),'base64');
        if(!safeStorage.isEncryptionAvailable()) continue;
        out[provider]=JSON.parse(safeStorage.decryptString(encrypted));
      } catch {}
    }
    return out;
  } catch { return {}; }
}
function writePlatformTokens(tokens={}) {
  if(!safeStorage.isEncryptionAvailable()) throw new Error('Secure credential storage is unavailable on this Windows session.');
  const encoded={};
  for(const [provider,value] of Object.entries(tokens||{})){
    if(!value) continue;
    encoded[provider]=safeStorage.encryptString(JSON.stringify(value)).toString('base64');
  }
  fs.writeFileSync(platformTokensPath(),JSON.stringify(encoded,null,2),'utf8');
}
function base64Url(buffer) {
  return Buffer.from(buffer).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}
function oauthProviderConfig(provider) {
  const env=readDesktopEnv();
  const id=String(provider||'').toLowerCase();
  const upper=id.toUpperCase();
  const defaults={
    tiktok:{label:'TikTok',authUrl:'https://www.tiktok.com/v2/auth/authorize/',tokenUrl:'https://open.tiktokapis.com/v2/oauth/token/',clientParam:'client_key',scope:'user.info.basic,video.publish',scopeSeparator:',',pkce:true},
    instagram:{label:'Instagram',authUrl:'https://www.facebook.com/v23.0/dialog/oauth',tokenUrl:'https://graph.facebook.com/v23.0/oauth/access_token',clientParam:'client_id',scope:'instagram_basic,instagram_content_publish,pages_show_list',scopeSeparator:',',pkce:false},
    youtube:{label:'YouTube',authUrl:'https://accounts.google.com/o/oauth2/v2/auth',tokenUrl:'https://oauth2.googleapis.com/token',clientParam:'client_id',scope:'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',scopeSeparator:' ',pkce:true,authExtra:{access_type:'offline',prompt:'consent'}},
    facebook:{label:'Facebook',authUrl:'https://www.facebook.com/v23.0/dialog/oauth',tokenUrl:'https://graph.facebook.com/v23.0/oauth/access_token',clientParam:'client_id',scope:'pages_show_list,pages_read_engagement,pages_manage_posts',scopeSeparator:',',pkce:false},
    x:{label:'X',authUrl:'https://twitter.com/i/oauth2/authorize',tokenUrl:'https://api.x.com/2/oauth2/token',clientParam:'client_id',scope:'tweet.read tweet.write users.read offline.access',scopeSeparator:' ',pkce:true}
  };
  const base=defaults[id]; if(!base)return null;
  const redirectPort=Math.max(1024,Math.min(65535,Number(env[`${upper}_OAUTH_REDIRECT_PORT`]||53682)));
  return {
    ...base,
    clientId:String(env[`${upper}_OAUTH_CLIENT_ID`]||'').trim(),
    clientSecret:String(env[`${upper}_OAUTH_CLIENT_SECRET`]||'').trim(),
    authUrl:String(env[`${upper}_OAUTH_AUTH_URL`]||base.authUrl).trim(),
    tokenUrl:String(env[`${upper}_OAUTH_TOKEN_URL`]||base.tokenUrl).trim(),
    scope:String(env[`${upper}_OAUTH_SCOPES`]||base.scope).trim(),
    redirectPort,
    redirectUri:`http://127.0.0.1:${redirectPort}/oauth/callback/${id}`,
    tokenAuth:String(env[`${upper}_OAUTH_TOKEN_AUTH`]||'body').trim().toLowerCase()
  };
}
function platformConnectionSnapshot() {
  const tokens=readPlatformTokens();
  const providers=['tiktok','instagram','youtube','facebook','x'];
  return Object.fromEntries(providers.map(id=>{
    const cfg=oauthProviderConfig(id);
    const token=tokens[id];
    return [id,{
      provider:id,
      label:cfg?.label||id,
      configured:Boolean(cfg?.clientId&&cfg?.authUrl&&cfg?.tokenUrl),
      connected:Boolean(token?.access_token),
      connectedAt:token?.connectedAt||null,
      expiresAt:token?.expiresAt||null
    }];
  }));
}
async function connectPlatformOAuth(provider) {
  const cfg=oauthProviderConfig(provider);
  if(!cfg) throw new Error('Unsupported platform.');
  if(!cfg.clientId) throw new Error(`${cfg.label} OAuth is not configured. Add ${String(provider).toUpperCase()}_OAUTH_CLIENT_ID in ClipBoost .env.`);
  if(!safeStorage.isEncryptionAvailable()) throw new Error('Secure Windows credential storage is unavailable.');

  const state=base64Url(crypto.randomBytes(24));
  const verifier=base64Url(crypto.randomBytes(48)).slice(0,96);
  const challenge=base64Url(crypto.createHash('sha256').update(verifier).digest());
  const callbackPath=`/oauth/callback/${provider}`;
  let callbackResolve,callbackReject;
  const callbackPromise=new Promise((resolve,reject)=>{callbackResolve=resolve;callbackReject=reject});
  const server=http.createServer((req,res)=>{
    try{
      const url=new URL(req.url,`http://127.0.0.1:${cfg.redirectPort}`);
      if(url.pathname!==callbackPath){res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');return}
      const returnedState=url.searchParams.get('state')||'';
      const error=url.searchParams.get('error')||'';
      const errorDescription=url.searchParams.get('error_description')||error;
      const code=url.searchParams.get('code')||'';
      if(returnedState!==state) throw new Error('OAuth state validation failed.');
      if(error) throw new Error(errorDescription||'Authorization was denied.');
      if(!code) throw new Error('Authorization code was not returned.');
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
      res.end('<!doctype html><html><body style="font-family:system-ui;background:#0b0d12;color:#fff;padding:40px"><h2>Connected to ClipBoost</h2><p>You can close this window and return to ClipBoost.</p></body></html>');
      callbackResolve(code);
    }catch(err){
      res.writeHead(400,{'Content-Type':'text/plain; charset=utf-8'});res.end('ClipBoost authorization failed. You can close this window.');
      callbackReject(err);
    }
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(cfg.redirectPort,'127.0.0.1',resolve);
  });

  const auth=new URL(cfg.authUrl);
  auth.searchParams.set(cfg.clientParam,cfg.clientId);
  auth.searchParams.set('response_type','code');
  auth.searchParams.set('redirect_uri',cfg.redirectUri);
  auth.searchParams.set('state',state);
  auth.searchParams.set('scope',cfg.scope);
  if(cfg.pkce){auth.searchParams.set('code_challenge',challenge);auth.searchParams.set('code_challenge_method','S256')}
  for(const [k,v] of Object.entries(cfg.authExtra||{}))auth.searchParams.set(k,v);

  try{
    await shell.openExternal(auth.toString());
    const code=await Promise.race([
      callbackPromise,
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('Authorization timed out.')),180000))
    ]);
    const body=new URLSearchParams();
    body.set('grant_type','authorization_code');
    body.set('code',code);
    body.set('redirect_uri',cfg.redirectUri);
    body.set(cfg.clientParam,cfg.clientId);
    if(cfg.pkce)body.set('code_verifier',verifier);
    if(cfg.clientSecret && cfg.tokenAuth!=='basic')body.set('client_secret',cfg.clientSecret);
    const headers={'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'};
    if(cfg.clientSecret && cfg.tokenAuth==='basic'){
      headers.Authorization='Basic '+Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
    }
    const tokenRes=await fetch(cfg.tokenUrl,{method:'POST',headers,body});
    const raw=await tokenRes.text();
    let token;try{token=JSON.parse(raw)}catch{throw new Error(`${cfg.label} returned an invalid token response.`)}
    if(!tokenRes.ok||!token?.access_token)throw new Error(token?.error_description||token?.message||token?.error||`${cfg.label} token exchange failed.`);
    const expiresIn=Number(token.expires_in||0);
    const stored={...token,connectedAt:new Date().toISOString(),expiresAt:expiresIn?new Date(Date.now()+expiresIn*1000).toISOString():null};
    const tokens=readPlatformTokens();tokens[provider]=stored;writePlatformTokens(tokens);
    if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('desktop:platform-auth-event',{provider,status:'connected'});
    return {ok:true,connection:platformConnectionSnapshot()[provider]};
  }finally{
    try{server.close()}catch{}
  }
}
function disconnectPlatformOAuth(provider) {
  const tokens=readPlatformTokens();
  delete tokens[provider];
  writePlatformTokens(tokens);
  if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('desktop:platform-auth-event',{provider,status:'disconnected'});
  return {ok:true,connection:platformConnectionSnapshot()[provider]};
}
function readDesktopSettings() {
  const defaults = { startWithWindows:false, closeToTray:true, ecoMode:true, idleTimeoutMinutes:5, checkUpdatesOnStartup:true, autoDownloadUpdates:true };
  try { return { ...defaults, ...JSON.parse(fs.readFileSync(desktopSettingsPath(),'utf8')) }; } catch { return defaults; }
}
function writeDesktopSettings(next) {
  const merged = { ...readDesktopSettings(), ...(next || {}) };
  fs.writeFileSync(desktopSettingsPath(), JSON.stringify(merged,null,2), 'utf8');
  app.setLoginItemSettings({ openAtLogin:Boolean(merged.startWithWindows), path:process.execPath });
  return merged;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}
function backendLogTail(buffer, maxLines=28) {
  const lines=String(buffer||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  return lines.slice(-maxLines).join('\n');
}
async function waitForServer(url, proc, timeoutMs = 90000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (!proc || proc.killed || proc.exitCode !== null) throw new Error(`ClipBoost backend exited before it became ready (exit code ${proc?.exitCode ?? 'unknown'}).`);
    try {
      const res = await fetch(url, { redirect:'manual', signal:AbortSignal.timeout(1500) });
      if (res.ok || (res.status >= 300 && res.status < 500)) return;
    } catch {}
    await new Promise(r => setTimeout(r, 350));
  }
  throw new Error(`ClipBoost backend did not start within ${Math.round(timeoutMs/1000)} seconds.`);
}
async function launchBackendOnce(paths, attempt=1) {
  serverPort = await freePort();
  const serverEntry = path.join(appRoot(), 'server', 'index.js');
  const env = { ...process.env, ELECTRON_RUN_AS_NODE:'1', NODE_ENV:'production', PORT:String(serverPort), CLIPBOOST_DATA_DIR:paths.dataDir, DOTENV_CONFIG_PATH:paths.envPath };
  let stdoutBuffer='', stderrBuffer='';
  const proc = spawn(process.execPath,[serverEntry],{cwd:appRoot(),env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  serverProcess=proc;
  proc.stdout.on('data',d=>{const s=String(d||'');stdoutBuffer=(stdoutBuffer+s).slice(-24000);process.stdout.write(`[ClipBoost] ${s}`);});
  proc.stderr.on('data',d=>{const s=String(d||'');stderrBuffer=(stderrBuffer+s).slice(-24000);process.stderr.write(`[ClipBoost] ${s}`);});
  proc.on('exit',code=>{if(serverProcess===proc&&code&&!isQuitting&&mainWindow&&!mainWindow.isDestroyed())dialog.showErrorBox('ClipBoost backend stopped',`The local backend exited with code ${code}.`);});
  const baseUrl=`http://127.0.0.1:${serverPort}`;
  try { await waitForServer(baseUrl,proc,90000); return baseUrl; }
  catch(err){
    const details=[err?.message||String(err),`Attempt: ${attempt}/2`,`Port: ${serverPort}`,stderrBuffer?`\nBackend errors:\n${backendLogTail(stderrBuffer)}`:'',stdoutBuffer?`\nBackend output:\n${backendLogTail(stdoutBuffer)}`:''].filter(Boolean).join('\n');
    try{if(proc&&!proc.killed){if(process.platform==='win32'&&proc.pid)spawn('taskkill',['/PID',String(proc.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else proc.kill('SIGKILL');}}catch{}
    if(serverProcess===proc)serverProcess=null;
    throw new Error(details);
  }
}
async function startBackend() {
  const paths=ensureUserFiles();
  let firstError=null;
  for(let attempt=1;attempt<=2;attempt++){
    try{return await launchBackendOnce(paths,attempt);}
    catch(err){if(!firstError)firstError=err;console.error(`[ClipBoost Desktop] Backend start attempt ${attempt} failed:`,err);if(attempt<2)await new Promise(r=>setTimeout(r,1200));}
  }
  throw new Error(`ClipBoost backend could not start after 2 attempts.\n\n${firstError?.message||'Unknown backend startup error.'}`);
}

function backendRuntimeUrl(pathname='') {
  if (!serverPort) return null;
  return `http://127.0.0.1:${serverPort}${pathname}`;
}
function markRendererActivity() {
  lastRendererActivity = Date.now();
  runtimeEcoPaused = false;
}
function idleTimeoutMs() {
  const raw = Number(readDesktopSettings().idleTimeoutMinutes || 5);
  const minutes = Math.max(1, Math.min(60, Number.isFinite(raw) ? raw : 5));
  return minutes * 60_000;
}
async function requestRuntimeAction(action='idle') {
  const url = backendRuntimeUrl(`/api/runtime/${action}`);
  if (!url || !serverProcess || serverProcess.killed) return { ok:false, unavailable:true };
  try {
    const response = await fetch(url, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ source:'desktop' }),
      signal:AbortSignal.timeout(action === 'shutdown' ? 1800 : 1200)
    });
    return await response.json().catch(() => ({ ok:response.ok }));
  } catch (err) {
    return { ok:false, error:err?.message || String(err) };
  }
}
async function enterEcoModeIfIdle() {
  const settings = readDesktopSettings();
  if (!settings.ecoMode || runtimeEcoPaused || isQuitting) return;
  if (Date.now() - lastRendererActivity < idleTimeoutMs()) return;
  const result = await requestRuntimeAction('idle');
  if (result?.ok && !result?.busy) runtimeEcoPaused = true;
}
function startEcoMonitor() {
  if (ecoMonitorTimer) clearInterval(ecoMonitorTimer);
  ecoMonitorTimer = setInterval(() => { enterEcoModeIfIdle().catch(() => {}); }, 15_000);
  ecoMonitorTimer.unref?.();
}
function stopBackendTree() {
  const proc = serverProcess;
  serverProcess = null;
  if (!proc || proc.killed) return;
  try {
    if (process.platform === 'win32' && proc.pid) {
      const killer = spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { windowsHide:true, stdio:'ignore' });
      killer.on('error', () => { try { proc.kill('SIGKILL'); } catch {} });
    } else proc.kill('SIGTERM');
  } catch { try { proc.kill('SIGKILL'); } catch {} }
}
async function shutdownBackendGracefully() {
  if (backendCleanupComplete) return;
  if (backendCleanupInFlight) return backendCleanupInFlight;
  backendCleanupInFlight = (async () => {
    try { await requestRuntimeAction('shutdown'); } catch {}
    stopBackendTree();
    backendCleanupComplete = true;
  })();
  try { await backendCleanupInFlight; } finally { backendCleanupInFlight = null; }
}

function emitUpdateEvent(payload = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('desktop:update-event', payload);
}
function setupUpdater(owner, repo) {
  if (updater) return updater;
  updater = require('electron-updater').autoUpdater;
  updater.autoDownload = Boolean(readDesktopSettings().autoDownloadUpdates);
  try { updater.autoRunAppAfterInstall = true; } catch {}
  // Keep installation strictly manual. electron-updater v26 uses
  // autoInstallOnAppQuit while newer releases use autoInstallEvent.
  try { updater.autoInstallOnAppQuit = false; } catch {}
  try { if ('autoInstallEvent' in updater) updater.autoInstallEvent = 'manual'; } catch {}
  updater.setFeedURL({ provider:'github', owner, repo });
  updater.on('checking-for-update', () => { updateState = { status:'checking', version:null, percent:0 }; });
  updater.on('update-available', info => {
    lastProgressEventPercent = -1;
    lastReadyEventVersion = null;
    downloadedUpdateFile = null;
    updateState = { status:'downloading', version:info.version, percent:0 };
    if (manualUpdateCheck) emitUpdateEvent({ status:'available', version:info.version, downloading:Boolean(updater.autoDownload), updateState, manual:true });
    if (!updater.autoDownload) manualUpdateCheck = false;
  });
  updater.on('download-progress', p => {
    const percent = Math.max(0, Math.min(100, Math.round(p.percent || 0)));
    updateState = { ...updateState, status:'downloading', percent };
    // Throttle updater events so the renderer is not rebuilt continuously.
    if (percent === 100 || lastProgressEventPercent < 0 || Math.abs(percent - lastProgressEventPercent) >= 2) {
      lastProgressEventPercent = percent;
      emitUpdateEvent({ status:'progress', version:updateState.version, percent, updateState });
    }
  });
  updater.on('update-not-available', info => {
    downloadedUpdateFile = null;
    updateState = { status:'current', version:info.version || app.getVersion(), percent:100 };
    if (manualUpdateCheck) emitUpdateEvent({ status:'current', version:app.getVersion(), updateState });
    manualUpdateCheck = false;
  });
  updater.on('error', err => {
    downloadedUpdateFile = null;
    updateState = { status:'error', version:null, percent:0 };
    console.error('[ClipBoost Updater]', err);
    const duringInstall = installUpdateInProgress;
    if (duringInstall) {
      installUpdateInProgress = false;
      isQuitting = false;
      lastReadyEventVersion = null;
    }
    if (manualUpdateCheck || duringInstall) {
      emitUpdateEvent({ status:'error', message:err?.message || String(err), updateState });
    }
    manualUpdateCheck = false;
  });
  updater.on('update-downloaded', info => {
    const version = String(info?.version || updateState.version || '').trim();
    const wasManual = manualUpdateCheck;
    const candidateFile = String(info?.downloadedFile || '').trim();
    downloadedUpdateFile = candidateFile && fs.existsSync(candidateFile) ? candidateFile : null;
    console.log('[ClipBoost Updater] Update downloaded.', { version, downloadedFile: downloadedUpdateFile });
    updateState = { status:'ready', version, percent:100 };
    if (version && lastReadyEventVersion !== version) {
      lastReadyEventVersion = version;
      emitUpdateEvent({ status:'ready', version, updateState, manual:wasManual });
    }
    manualUpdateCheck = false;
  });
  return updater;
}
async function checkForUpdates(manual = false) {
  if (!app.isPackaged) {
    const result = { ok:true, status:'dev', currentVersion:app.getVersion(), updateState };
    if (manual) emitUpdateEvent(result);
    return result;
  }
  const cfg = readDesktopEnv();
  const owner = String(cfg.CLIPBOOST_UPDATE_OWNER || 'OGC112').trim();
  const repo = String(cfg.CLIPBOOST_UPDATE_REPO || 'clipboost').trim();
  if (!owner || !repo) {
    const result = { ok:false, status:'unconfigured', currentVersion:app.getVersion(), updateState };
    if (manual) emitUpdateEvent(result);
    return result;
  }

  // If an update is already downloaded, never start another updater cycle.
  if (updateState.status === 'ready') {
    const result = { ok:true, status:'ready', currentVersion:app.getVersion(), updateState };
    if (manual) emitUpdateEvent({ status:'ready', version:updateState.version, updateState, manual:true });
    return result;
  }

  // Coalesce overlapping startup/menu/settings checks into one request.
  if (updateCheckInFlight) {
    manualUpdateCheck = manualUpdateCheck || Boolean(manual);
    return updateCheckInFlight;
  }

  manualUpdateCheck = Boolean(manual);
  updateCheckInFlight = (async () => {
    try {
      const client = setupUpdater(owner, repo);
      client.autoDownload = Boolean(readDesktopSettings().autoDownloadUpdates);
      await client.checkForUpdates();
      return { ok:true, status:updateState.status, updateState };
    } catch (err) {
      console.error('[ClipBoost Updater]', err);
      const result = { ok:false, status:'error', message:err?.message || String(err), updateState:{ status:'error', version:null, percent:0 } };
      updateState = result.updateState;
      if (manualUpdateCheck) emitUpdateEvent(result);
      manualUpdateCheck = false;
      return result;
    } finally {
      updateCheckInFlight = null;
    }
  })();

  return updateCheckInFlight;
}


function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function safeHttpUrl(raw='') {
  try {
    const u = new URL(String(raw || '').trim());
    if (!/^https?:$/.test(u.protocol)) return null;
    return u.toString();
  } catch { return null; }
}
function configureCampaignBrowser(win) {
  if (!win || win.isDestroyed()) return;
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!/^https:\/\//i.test(String(url || ''))) return { action:'deny' };
    return {
      action:'allow',
      overrideBrowserWindowOptions:{
        parent:win,
        autoHideMenuBar:true,
        backgroundColor:'#0b1018',
        webPreferences:{ partition:CAMPAIGN_IMPORT_PARTITION, contextIsolation:true, nodeIntegration:false, sandbox:true }
      }
    };
  });
}
async function campaignBrowserSnapshot(win) {
  if (!win || win.isDestroyed()) throw new Error('Campaign import window is no longer available.');
  return win.webContents.executeJavaScript(`(() => {
    const clean = value => String(value || '').replace(/\\u00a0/g,' ').replace(/[ \\t]+/g,' ').trim();
    const headingEls = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')];
    const headingFor = el => {
      let best = '';
      for (const h of headingEls) {
        if (h === el) continue;
        const pos = h.compareDocumentPosition(el);
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) best = clean(h.innerText || h.textContent);
        else if (best) break;
      }
      return best;
    };
    return {
      url: location.href,
      title: document.title || '',
      text: String(document.body?.innerText || '').slice(0, 180000),
      headings: headingEls.map(h => ({ level:h.tagName.toLowerCase(), text:clean(h.innerText || h.textContent) })).filter(x => x.text).slice(0,160),
      links: [...document.querySelectorAll('a[href]')].map(a => ({ text:clean(a.innerText || a.textContent), href:a.href, section:headingFor(a) })).filter(x => /^https?:/i.test(x.href)).slice(0,500),
      listItems: [...document.querySelectorAll('li')].map(li => ({ text:clean(li.innerText || li.textContent), section:headingFor(li) })).filter(x => x.text).slice(0,500),
      images: [...document.querySelectorAll('img[src]')].map(img => ({ alt:clean(img.alt), src:img.currentSrc || img.src, width:Number(img.naturalWidth||img.width||0), height:Number(img.naturalHeight||img.height||0) })).filter(x => /^https?:/i.test(x.src)).slice(0,160),
      videos: [...document.querySelectorAll('video')].map(v => ({
        src:v.currentSrc || v.src || '', poster:v.poster || '',
        duration:Number.isFinite(v.duration) ? Number(v.duration) : null,
        sources:[...v.querySelectorAll('source[src]')].map(x => x.src).filter(Boolean)
      })).slice(0,80),
      mediaHints: [...document.querySelectorAll('[aria-label],[data-type],[data-kind],[class]')].map(el => {
        const hint=clean([el.getAttribute('aria-label'),el.getAttribute('data-type'),el.getAttribute('data-kind'),el.className].filter(Boolean).join(' '));
        return /video|movie|media|asset/i.test(hint) ? hint.slice(0,240) : '';
      }).filter(Boolean).slice(0,160),
      visibleMediaTiles: (() => {
        const visible = el => {
          try {
            const r=el.getBoundingClientRect(), cs=getComputedStyle(el);
            return r.width >= 28 && r.height >= 28 && r.bottom > 0 && r.right > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity || 1) > 0;
          } catch { return false; }
        };
        const raw=[...document.querySelectorAll('a[href],button,[role="button"],[class*="thumb"],[class*="asset"],[class*="tile"],[class*="item"]')].map(el => {
          if(!visible(el))return null;
          const media=el.matches('img,video')?el:el.querySelector('img,video');
          if(!media||!visible(media))return null;
          const mr=media.getBoundingClientRect();if(mr.width<36||mr.height<36)return null;
          const anchor=el.closest('a[href]')||el.querySelector('a[href]');
          const href=anchor?.href||'';
          const src=media.tagName==='IMG'?(media.currentSrc||media.src||''):(media.poster||media.currentSrc||media.src||'');
          const text=clean(el.getAttribute('aria-label')||el.innerText||el.textContent||media.alt||'');
          if(/logo|roadshow films|download|close|next|previous|filter|search/i.test(text))return null;
          return {href,src,text,width:Math.round(mr.width),height:Math.round(mr.height)};
        }).filter(Boolean);
        const out=[],seen=new Set();
        for(const x of raw){const key=x.href||x.src;if(!key||seen.has(key))continue;seen.add(key);out.push(x)}
        return out.slice(0,80);
      })(),
      blocks: [...new Set([...document.querySelectorAll('article,[role="article"],[class*="card"],[class*="campaign"]')].map(el => clean(el.innerText || el.textContent)).filter(t => t.length >= 20 && t.length <= 2500))].slice(0,320)
    };
  })()`);
}
function campaignSnapshotIsLogin(snapshot={}) {
  const text = `${snapshot.title || ''}\n${snapshot.text || ''}`.toLowerCase();
  const hasPassword = /password/.test(text);
  const hits = [/\bsign in\b/,/log in/,/continue with (?:google|discord|apple|facebook)/,/welcome back/,/forgot (?:your )?password/].filter(re => re.test(text)).length;
  return hasPassword || hits >= 2;
}
function campaignSnapshotEvidence(snapshot={}) {
  const text = `${snapshot.title || ''}\n${snapshot.text || ''}`;
  const signals = [
    /campaign info/i,/campaign details/i,/campaign bount/i,/bounty rate/i,/payment method/i,
    /your clips/i,/your views/i,/clip requirements/i,/violations/i,/audience/i
  ];
  return signals.filter(re => re.test(text)).length;
}
function campaignRequirementsUrl(snapshot={}) {
  const links = Array.isArray(snapshot.links) ? snapshot.links : [];
  const direct = links.find(x => /\/campaigns\/doc\//i.test(String(x.href || '')));
  if (direct) return direct.href;
  const labeled = links.find(x => /requirements?/i.test(String(x.text || '')) && /^https?:/i.test(String(x.href || '')));
  return labeled?.href || null;
}
function campaignTermsUrl(snapshot={}) {
  const links = Array.isArray(snapshot.links) ? snapshot.links : [];
  const exact = links.find(x => /clipper terms and conditions/i.test(String(x.text || '')) && /^https?:/i.test(String(x.href || '')));
  if (exact) return exact.href;
  return links.find(x => /terms and conditions/i.test(String(x.text || '')) && !/campaigns\/doc/i.test(String(x.href || '')) && /^https?:/i.test(String(x.href || '')))?.href || null;
}
function campaignNameFromSnapshot(snapshot={}) {
  const generic=/^(campaigns?|dashboard|campaign info|campaign details|program structure|bounties|payouts?|your clips)$/i;
  const headings=Array.isArray(snapshot.headings)?snapshot.headings:[];
  return String(headings.find(h=>h.level==='h1'&&h.text&&!generic.test(h.text))?.text || headings.find(h=>h.text&&!generic.test(h.text))?.text || '').trim();
}
function campaignListingUrl(rawUrl='') {
  try {
    const u=new URL(rawUrl);
    if (/clipping\.net$/i.test(u.hostname)) return `${u.origin}/dashboard/campaigns`;
  } catch {}
  return null;
}
function resourceLinksFromRequirements(snapshot={}, providerHost='') {
  const links=Array.isArray(snapshot.links)?snapshot.links:[];
  const out=[];const seen=new Set();
  for(const item of links){
    const href=String(item?.href||'').trim(), label=String(item?.text||'').trim(), section=String(item?.section||'').trim();
    if(!/^https?:\/\//i.test(href))continue;
    let host='';try{host=new URL(href).hostname.replace(/^www\./,'').toLowerCase()}catch{}
    if(!host||host===providerHost||/clipping\.net$/i.test(host)||/(?:youtube\.com|youtu\.be|twitch\.tv)$/i.test(host)||host.endsWith('.youtube.com')||host.endsWith('.twitch.tv'))continue;
    // Generic "Download" links inside Clip Requirements are reference artwork, not asset packs.
    const assetLabel=/^(assets?(?:\s*#?\d+)?|media(?:\s*#?\d+)?)$/i.test(label)||/\basset(?:s)?\b/i.test(label);
    const assetSection=/^(content|sources?|assets?|media)$/i.test(section);
    const isGenericDownload=/^downloads?$/i.test(label);
    const relevant=assetLabel||(assetSection&&!isGenericDownload);
    if(!relevant||seen.has(href))continue;seen.add(href);out.push({url:href,label:label||'Campaign asset'});
  }
  return out.slice(0,8);
}
function cantoDeclaredItemCount(snapshot={}) {
  const text=String(snapshot?.text||'').replace(/\u00a0/g,' ');
  const matches=[...text.matchAll(/(?:^|\n|\s)(\d{1,3})\s+Items?\b/gi)].map(m=>Number(m[1])).filter(n=>Number.isFinite(n)&&n>0&&n<=200);
  return matches.length?Math.min(...matches):0;
}
function cantoVisibleAssetCount(snapshot={}) {
  const tiles=Array.isArray(snapshot?.visibleMediaTiles)?snapshot.visibleMediaTiles:[];
  const useful=tiles.filter(x=>{
    const text=String(x?.text||'').toLowerCase(), href=String(x?.href||''), src=String(x?.src||'');
    if(/logo|roadshow films|download|close|next|previous|filter|search/.test(text))return false;
    if(/(?:logo|icon|avatar|spinner|loader)/i.test(src))return false;
    if(/[?&]viewIndex=\d+/i.test(href)||/\/s\//i.test(href))return true;
    return Number(x?.width||0)>=52&&Number(x?.height||0)>=52;
  });
  return Math.min(200,useful.length);
}
function resourceSnapshotKind(snapshot={}) {
  const videoEls=Array.isArray(snapshot.videos)?snapshot.videos:[];
  const mediaHints=Array.isArray(snapshot.mediaHints)?snapshot.mediaHints:[];
  const videoLinks=(Array.isArray(snapshot.links)?snapshot.links:[]).filter(x=>/\.(?:mp4|mov|webm|m4v)(?:[?#]|$)/i.test(String(x?.href||'')));
  const videoCount=Math.max(videoEls.length,videoLinks.length,mediaHints.filter(x=>/video|movie/i.test(String(x))).length?1:0);
  const imageCount=(Array.isArray(snapshot.images)?snapshot.images:[]).filter(x=>!/(?:logo|icon|avatar|brand mark)/i.test(String(x?.alt||''))&&Number(x?.width||0)>=220&&Number(x?.height||0)>=120).length;
  let kind='asset-pack';if(videoCount&&imageCount)kind='mixed-pack';else if(videoCount)kind='video-pack';else if(imageCount)kind='image-pack';
  const mediaUrls=[...new Set([...videoEls.flatMap(v=>[v.src,...(v.sources||[])]),...videoLinks.map(x=>x.href)].filter(x=>/^https?:/i.test(String(x))))].slice(0,20);
  return {kind,videoCount,imageCount,mediaCount:Math.max(videoCount+imageCount,videoCount,imageCount),mediaUrls};
}
async function inspectCampaignResource(item={}) {
  const url=safeHttpUrl(item.url);if(!url)return {...item,kind:'external',inspectStatus:'invalid',items:[]};
  try{
    const top=await loadCampaignWorkerSnapshot(url);const topInfo=resourceSnapshotKind(top||{});
    let host='';try{host=new URL(url).hostname}catch{}
    const isCanto=/canto\.global$/i.test(host);
    const isFrame=/(?:^|\.)frame\.io$/i.test(host);
    if(isFrame&&!Number(topInfo.videoCount||0)){
      const frameTitle=String(top?.title||'');
      if(/\.(?:mp4|mov|webm|m4v)\b/i.test(frameTitle)||/télécharger|download/i.test(String(top?.text||''))){
        topInfo.videoCount=1;topInfo.mediaCount=Math.max(1,Number(topInfo.mediaCount||0));topInfo.kind='video-pack';
      }
    }
    const declaredItemCount=isCanto?cantoDeclaredItemCount(top||{}):0;
    const visibleAssetCount=isCanto?cantoVisibleAssetCount(top||{}):0;
    const rawChildren=(Array.isArray(top?.links)?top.links:[]).map(x=>({url:String(x?.href||''),label:String(x?.text||'').trim()})).filter(x=>{try{const u=new URL(x.url);return u.hostname===host&&x.url!==url&&!/\.(?:jpg|jpeg|png|gif|webp|svg)(?:[?#]|$)/i.test(x.url)&&!/^downloads?$/i.test(x.label)}catch{return false}});
    const unique=[];const seen=new Set();
    for(const x of rawChildren){if(seen.has(x.url))continue;seen.add(x.url);unique.push(x)}
    // Canto shared galleries expose individual media on /s/... or viewIndex pages. Prefer those links.
    const preferred=unique.filter(x=>/\/s\//i.test(x.url)||/[?&]viewIndex=\d+/i.test(x.url));
    const rawCandidates=preferred.length?preferred:unique;
    // Canto often renders duplicate/hidden viewer links. Its visible "N Items" label is the reliable upper bound.
    const candidates=rawCandidates.slice(0,declaredItemCount||12);
    const items=[];const mediaUrls=new Set(topInfo.mediaUrls||[]);
    let videoCount=isCanto&&declaredItemCount?0:Number(topInfo.videoCount||0);
    let imageCount=0;
    for(const childRef of candidates){
      try{
        const child=await loadCampaignWorkerSnapshot(childRef.url);const childInfo=resourceSnapshotKind(child||{});
        if(!childInfo.videoCount&&!childInfo.imageCount)continue;
        const childKind=childInfo.videoCount&&childInfo.imageCount?'mixed':childInfo.videoCount?'video':'image';
        // One viewer page represents one gallery item. Never count hidden duplicate <video> tags as separate assets.
        const childVideos=childInfo.videoCount?1:0,childImages=childInfo.imageCount&&!childInfo.videoCount?1:0;
        items.push({url:childRef.url,label:childRef.label||`Asset ${items.length+1}`,kind:childKind,videoCount:childVideos,imageCount:childImages});
        videoCount+=childVideos;imageCount+=childImages;
        for(const mediaUrl of childInfo.mediaUrls||[])mediaUrls.add(mediaUrl);
      }catch{}
    }
    // Gallery thumbnails are previews. If child inspection is incomplete, use the gallery's declared item count only as a cap, never as extra guessed media.
    if(!items.length&&!declaredItemCount)imageCount=Number(topInfo.imageCount||0);
    if(declaredItemCount){
      if(videoCount>declaredItemCount)videoCount=declaredItemCount;
      if(imageCount>declaredItemCount)imageCount=declaredItemCount;
      // Some Canto galleries expose the playable media only in a hidden viewer. If video media is clearly present, the visible item count is the authoritative count.
      if(!videoCount&&Number(topInfo.videoCount||0)>0&&!imageCount)videoCount=declaredItemCount;
    }
    const hasVideo=videoCount>0,hasImage=imageCount>0;
    const kind=hasVideo&&hasImage?'mixed-pack':hasVideo?'video-pack':hasImage?'image-pack':'asset-pack';
    const observedItemCount=Math.max(declaredItemCount,visibleAssetCount,items.length);
    const mediaCount=observedItemCount||Math.max(videoCount+imageCount,Number(topInfo.mediaCount||0));
    // Exact video totals are only claimed when the gallery itself declares N items and every item is confirmed as video.
    // If Canto exposes only one playable child while multiple visible tiles exist, keep the pack as video media but mark the total as non-exact.
    const videoCountExact=Boolean(declaredItemCount>0&&videoCount===declaredItemCount&&imageCount===0);
    const multipleVideoEvidence=Boolean(isCanto&&hasVideo&&!videoCountExact&&observedItemCount>videoCount);
    return {...item,kind,videoCount,imageCount,mediaCount,declaredItemCount,visibleAssetCount,observedItemCount,videoCountExact,multipleVideoEvidence,mediaUrls:[...mediaUrls].slice(0,30),items:items.slice(0,20),inspectStatus:'ok'};
  }catch(err){return {...item,kind:'asset-pack',videoCount:0,imageCount:0,mediaCount:0,items:[],inspectStatus:'unavailable'};}
}
async function loadCampaignWorkerSnapshot(url) {
  const target = safeHttpUrl(url);
  if (!target) return null;
  if (campaignImportWorker && !campaignImportWorker.isDestroyed()) campaignImportWorker.destroy();
  const worker = new BrowserWindow({
    width:1100,height:760,show:false,autoHideMenuBar:true,backgroundColor:'#0b1018',
    webPreferences:{ partition:CAMPAIGN_IMPORT_PARTITION, contextIsolation:true, nodeIntegration:false, sandbox:true }
  });
  campaignImportWorker = worker;
  configureCampaignBrowser(worker);
  try {
    try { await worker.loadURL(target); } catch (err) { if (Number(err?.errno)!==-3 && Number(err?.code)!==-3 && !/ERR_ABORTED|\(-3\)/i.test(String(err?.message||''))) throw err; }
    let host='';try{host=new URL(target).hostname}catch{}
    await sleep(/canto\.global$/i.test(host)?3200:1800);
    // Give lazy-loaded Canto gallery tiles a chance to mount before counting them.
    if(/canto\.global$/i.test(host)){
      try{await worker.webContents.executeJavaScript(`window.scrollTo(0, Math.min(document.body.scrollHeight, 900)); true`);await sleep(650)}catch{}
    }
    const snapshot = await campaignBrowserSnapshot(worker);
    return snapshot;
  } finally {
    if (!worker.isDestroyed()) worker.destroy();
    if (campaignImportWorker === worker) campaignImportWorker = null;
  }
}
async function discoverCampaignAssetPack(rawUrl) {
  const target=safeHttpUrl(rawUrl);if(!target)throw new Error('Invalid asset pack URL.');
  let host='';try{host=new URL(target).hostname}catch{}
  if(!/canto\.global$/i.test(host)){
    const inspected=await inspectCampaignResource({url:target,label:'Campaign asset'});
    const fallback=(inspected.mediaUrls||[]).map((mediaUrl,i)=>({label:`Media ${i+1}`,kind:'video',mediaUrl,pageUrl:target,previewUrl:'',duration:0}));
    return {ok:true,items:fallback,summary:fallback.length?`${fallback.length} directly usable media file${fallback.length===1?'':'s'} detected.`:'No direct media file was exposed by this pack.'};
  }
  const worker=new BrowserWindow({width:1180,height:820,show:false,autoHideMenuBar:true,backgroundColor:'#0b1018',webPreferences:{partition:CAMPAIGN_IMPORT_PARTITION,contextIsolation:true,nodeIntegration:false,sandbox:true}});
  configureCampaignBrowser(worker);
  const items=[],seenMedia=new Set();
  const waitForGallery=async()=>{await sleep(2600);try{await worker.webContents.executeJavaScript(`window.scrollTo(0, Math.min(document.body.scrollHeight, 900)); true`);await sleep(650)}catch{}};
  const clickTile=async index=>worker.webContents.executeJavaScript(`(() => {
    const idx=${Number(index)};
    const visible=el=>{try{const r=el.getBoundingClientRect(),cs=getComputedStyle(el);return r.width>=28&&r.height>=28&&r.bottom>0&&r.right>0&&cs.display!=='none'&&cs.visibility!=='hidden'&&Number(cs.opacity||1)>0}catch{return false}};
    const clean=v=>String(v||'').replace(/\\s+/g,' ').trim();
    const raw=[...document.querySelectorAll('a[href],button,[role="button"],[class*="thumb"],[class*="asset"],[class*="tile"],[class*="item"]')].map(el=>{
      if(!visible(el))return null;const media=el.matches('img,video')?el:el.querySelector('img,video');if(!media||!visible(media))return null;
      const r=media.getBoundingClientRect();if(r.width<36||r.height<36)return null;
      const src=media.tagName==='IMG'?(media.currentSrc||media.src||''):(media.poster||media.currentSrc||media.src||'');
      const text=clean(el.getAttribute('aria-label')||el.innerText||el.textContent||media.alt||'');if(/logo|roadshow films|download|close|next|previous|filter|search/i.test(text))return null;
      const clickable=el.closest('a[href],button,[role="button"]')||el;const href=clickable.href||clickable.closest?.('a[href]')?.href||'';
      return {el:clickable,src,text,href};
    }).filter(Boolean);
    const out=[],seen=new Set();for(const x of raw){const key=x.src||x.href;if(!key||seen.has(key))continue;seen.add(key);out.push(x)}
    const x=out[idx];if(!x)return {clicked:false,count:out.length};x.el.click();return {clicked:true,count:out.length,previewUrl:x.src||'',label:x.text||'',href:x.href||''};
  })()`);
  try{
    try { await worker.loadURL(target); } catch (err) { if (Number(err?.errno)!==-3 && Number(err?.code)!==-3 && !/ERR_ABORTED|\(-3\)/i.test(String(err?.message||''))) throw err; } await waitForGallery();
    let top=await campaignBrowserSnapshot(worker);const declared=cantoDeclaredItemCount(top||{}),visible=cantoVisibleAssetCount(top||{});const targetCount=Math.min(12,Math.max(declared,visible,(top?.visibleMediaTiles||[]).length,1));
    for(let i=0;i<targetCount;i++){
      if(i>0){try{await worker.loadURL(target)}catch(err){if(Number(err?.errno)!==-3&&Number(err?.code)!==-3&&!/ERR_ABORTED|\(-3\)/i.test(String(err?.message||'')))continue}await waitForGallery()}
      let clicked=null;try{clicked=await clickTile(i)}catch{}
      if(!clicked?.clicked)continue;
      await sleep(1150);
      let snap=null;try{snap=await campaignBrowserSnapshot(worker)}catch{}
      let videos=Array.isArray(snap?.videos)?snap.videos:[];
      if(!videos.some(v=>/^https?:/i.test(String(v?.src||''))||(v?.sources||[]).some(x=>/^https?:/i.test(String(x||''))))) {
        try{await worker.webContents.executeJavaScript(`(() => { const b=[...document.querySelectorAll('button,[role="button"]')].find(el=>/play/i.test(String(el.getAttribute('aria-label')||el.title||el.innerText||''))); if(b){b.click();return true} const v=document.querySelector('video'); if(v){try{v.play()}catch{};return true} return false })()`);await sleep(700);snap=await campaignBrowserSnapshot(worker);videos=Array.isArray(snap?.videos)?snap.videos:[]}catch{}
      }
      const candidates=[];for(const v of videos){for(const u of [v?.src,...(v?.sources||[])])if(/^https?:/i.test(String(u||'')))candidates.push(String(u))}
      const mediaUrl=candidates.find(u=>!seenMedia.has(u))||'';
      const v=videos.find(v=>String(v?.src||'')===mediaUrl||(v?.sources||[]).includes(mediaUrl))||videos[0]||{};
      const pageUrl=safeHttpUrl(snap?.url)||clicked.href||target;const previewUrl=String(v?.poster||clicked.previewUrl||'');
      if(mediaUrl){seenMedia.add(mediaUrl);items.push({label:clicked.label||`Video ${i+1}`,kind:'video',mediaUrl,pageUrl,previewUrl,duration:Number(v?.duration||0)||0})}
      else if(clicked.href||clicked.previewUrl){
        const candidatePage=safeHttpUrl(clicked.href)||pageUrl;
        let recovered='';
        try{
          const detail=await inspectCampaignResource({url:candidatePage,label:clicked.label||`Media ${i+1}`});
          recovered=(detail.mediaUrls||[]).find(u=>/^https?:/i.test(String(u||''))&&!seenMedia.has(String(u)))||'';
        }catch{}
        if(recovered){seenMedia.add(recovered);items.push({label:clicked.label||`Video ${i+1}`,kind:'video',mediaUrl:recovered,pageUrl:candidatePage,previewUrl:clicked.previewUrl||'',duration:0})}
        else items.push({label:clicked.label||`Media ${i+1}`,kind:'media',mediaUrl:'',pageUrl:candidatePage,previewUrl:clicked.previewUrl||'',duration:0});
      }
    }
    if(!items.some(x=>x.mediaUrl)){
      const inspected=await inspectCampaignResource({url:target,label:'Campaign asset'});
      for(const mediaUrl of inspected.mediaUrls||[]){if(!/^https?:/i.test(mediaUrl)||seenMedia.has(mediaUrl))continue;seenMedia.add(mediaUrl);items.push({label:`Video ${items.length+1}`,kind:'video',mediaUrl,pageUrl:target,previewUrl:'',duration:0})}
    }
    const direct=items.filter(x=>x.mediaUrl).length;const summary=direct?`${direct} video${direct===1?'':'s'} ready to preview and open in Campaign Studio${items.length>direct?` · ${items.length-direct} additional item${items.length-direct===1?'':'s'} can be opened in Canto`:''}.`:`${items.length||0} pack item${items.length===1?'':'s'} detected, but Canto did not expose a direct video URL for AI Studio.`;
    return {ok:true,items:items.slice(0,12),summary};
  } finally {if(!worker.isDestroyed())worker.destroy()}
}

async function importCampaignAssetToProject(projectId, mediaUrl, pageUrl, label='Campaign asset') {
  const id=String(projectId||'').trim(),referer=safeHttpUrl(pageUrl);
  let target=safeHttpUrl(mediaUrl);
  if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('Invalid campaign project.');
  const ses=session.fromPartition(CAMPAIGN_IMPORT_PARTITION);
  const isBlocked=err=>/ERR_BLOCKED_BY_CLIENT|ERR_ABORTED|\(-3\)/i.test(String(err?.message||''))||Number(err?.errno)===-3||Number(err?.code)===-3;
  const candidates=[];
  const addCandidate=u=>{const x=safeHttpUrl(u);if(x&&!candidates.includes(x))candidates.push(x)};
  addCandidate(target);

  if(referer){
    let cantoHost='';try{cantoHost=new URL(referer).hostname}catch{}
    if(/canto\.global$/i.test(cantoHost)){
      try{
        const packBase=referer.replace(/([?&])viewIndex=\d+(&?)/i,(m,a,b)=>b?a:'').replace(/[?&]$/,'');
        const discovered=await discoverCampaignAssetPack(packBase);
        const wanted=String(label||'').trim().toLowerCase();
        const ordinalMatch=wanted.match(/(?:media|asset|video)\s*(\d+)/i);
        const ordinal=ordinalMatch?Math.max(0,Number(ordinalMatch[1])-1):-1;
        const direct=(discovered?.items||[]).filter(x=>safeHttpUrl(x?.mediaUrl));
        const byLabel=direct.find(x=>String(x?.label||'').trim().toLowerCase()===wanted);
        if(byLabel)addCandidate(byLabel.mediaUrl);
        if(ordinal>=0&&direct[ordinal])addCandidate(direct[ordinal].mediaUrl);
        for(const item of direct)addCandidate(item.mediaUrl);
      }catch{}
    }
  }

  // Only use a hidden viewer as a last resort. A blocked Canto viewer navigation is
  // expected and must never escape as the import error.
  if(!candidates.length&&referer){
    const worker=new BrowserWindow({width:1100,height:760,show:false,autoHideMenuBar:true,backgroundColor:'#0b1018',webPreferences:{partition:CAMPAIGN_IMPORT_PARTITION,contextIsolation:true,nodeIntegration:false,sandbox:true}});
    configureCampaignBrowser(worker);
    const observed=[];
    const observeRequest=(details,callback)=>{
      const u=String(details?.url||'');
      if(/^https?:/i.test(u)&&/\.(?:mp4|mov|webm|m4v)(?:[?#]|$)|stream|playback|rendition|download/i.test(u))observed.push(u);
      callback({cancel:false});
    };
    ses.webRequest.onBeforeRequest(observeRequest);
    try{
      try{await worker.loadURL(referer)}catch(err){if(!isBlocked(err))throw err}
      await sleep(1800);
      for(let attempt=0;attempt<3&&!candidates.length;attempt++){
        try{await worker.webContents.executeJavaScript(`(() => {const v=document.querySelector('video');if(v){try{v.play()}catch{};return true}const b=[...document.querySelectorAll('button,[role="button"]')].find(el=>/play|preview|watch/i.test(String(el.getAttribute('aria-label')||el.title||el.innerText||'')));if(b){b.click();return true}return false})()`)}catch{}
        await sleep(700);
        try{
          const snap=await campaignBrowserSnapshot(worker);
          for(const v of (snap?.videos||[]))for(const u of [v?.src,...(v?.sources||[])])addCandidate(u);
          const info=resourceSnapshotKind(snap||{});for(const u of info.mediaUrls||[])addCandidate(u);
        }catch{}
        for(const u of observed)addCandidate(u);
      }
    }finally{try{ses.webRequest.onBeforeRequest(null)}catch{}if(!worker.isDestroyed())worker.destroy()}
  }

  if(!candidates.length)throw new Error('The asset provider did not expose a downloadable video stream for this asset.');
  const headers={Accept:'video/*,application/octet-stream;q=0.9,*/*;q=0.2'};if(referer)headers.Referer=referer;
  let response=null,lastError=null;
  for(const candidate of candidates){
    try{
      const probeResponse=await ses.fetch(candidate,{method:'GET',headers,redirect:'follow'});
      if(!probeResponse.ok){lastError=new Error(`HTTP ${probeResponse.status}`);continue}
      const contentType=String(probeResponse.headers.get('content-type')||'').toLowerCase();
      const contentRange=String(probeResponse.headers.get('content-range')||'').toLowerCase();
      const contentLength=Number(probeResponse.headers.get('content-length')||0);
      if(contentType&&(contentType.includes('text/html')||contentType.includes('application/json')||contentType.startsWith('image/'))){lastError=new Error(`Canto candidate returned ${contentType}`);continue}
      if(probeResponse.status===206||contentRange){lastError=new Error('Canto candidate returned only a partial media response');continue}
      if(contentLength>0&&contentLength<64*1024){lastError=new Error('Canto candidate is too small to be the source video');continue}
      response=probeResponse;target=candidate;break;
    }catch(err){lastError=err;if(!isBlocked(err))console.warn('[Campaign asset] Candidate failed:',err?.message||err)}
  }
  if(!response&&referer){
    const worker=new BrowserWindow({width:1100,height:760,show:false,autoHideMenuBar:true,backgroundColor:'#0b1018',webPreferences:{partition:CAMPAIGN_IMPORT_PARTITION,contextIsolation:true,nodeIntegration:false,sandbox:true}});
    configureCampaignBrowser(worker);const observed=[];
    const observeRequest=(details,callback)=>{const u=String(details?.url||'');if(/^https?:/i.test(u)&&/\\.(?:mp4|mov|webm|m4v)(?:[?#]|$)|stream|playback|rendition|download|original/i.test(u))observed.push(u);callback({cancel:false})};
    ses.webRequest.onBeforeRequest(observeRequest);
    try{
      try{await worker.loadURL(referer)}catch(err){if(!isBlocked(err))throw err}await sleep(1800);
      for(let attempt=0;attempt<4;attempt++){try{await worker.webContents.executeJavaScript(`(() => {const v=document.querySelector('video');if(v){v.muted=true;try{v.currentTime=.01;v.play()}catch{};return true}const b=[...document.querySelectorAll('button,[role="button"],a')].find(el=>/play|preview|watch|open/i.test(String(el.getAttribute('aria-label')||el.title||el.innerText||'')));if(b){b.click();return true}return false})()`)}catch{}await sleep(750);try{const snap=await campaignBrowserSnapshot(worker);for(const v of (snap?.videos||[]))for(const u of [v?.src,...(v?.sources||[])])addCandidate(u);const info=resourceSnapshotKind(snap||{});for(const u of info.mediaUrls||[])addCandidate(u)}catch{}for(const u of observed)addCandidate(u)}
    }finally{try{ses.webRequest.onBeforeRequest(null)}catch{}if(!worker.isDestroyed())worker.destroy()}
    for(const candidate of candidates){if(candidate===target)continue;try{const retry=await ses.fetch(candidate,{method:'GET',headers,redirect:'follow'});if(!retry.ok||retry.status===206)continue;const ct=String(retry.headers.get('content-type')||'').toLowerCase(),cr=String(retry.headers.get('content-range')||''),cl=Number(retry.headers.get('content-length')||0);if(cr||(ct&&(ct.includes('text/html')||ct.includes('application/json')||ct.startsWith('image/')))||(cl>0&&cl<64*1024))continue;response=retry;target=candidate;break}catch{}}
  }
  if(!response)throw new Error(`The asset provider did not expose a complete playable video stream for this asset.${lastError&&!isBlocked(lastError)?' '+String(lastError.message||lastError):''}`);
  const type=String(response.headers.get('content-type')||'').toLowerCase();
  const ext=type.includes('quicktime')?'.mov':type.includes('webm')?'.webm':'.mp4';
  const fileName=`${String(label||'campaign-asset').replace(/[^a-z0-9._-]+/gi,'-').slice(0,80)||'campaign-asset'}${ext}`;
  const endpoint=backendRuntimeUrl('/api/videos/campaign-stream');if(!endpoint)throw new Error('ClipBoost backend is not available.');
  if(!response.body)throw new Error('The asset provider returned no media stream.');
  const uploaded=await fetch(endpoint,{method:'POST',headers:{'Content-Type':type.startsWith('video/')?type:'video/mp4','X-ClipBoost-Project-Id':id,'X-ClipBoost-File-Name':encodeURIComponent(fileName)},body:response.body,duplex:'half'});
  const body=await uploaded.json().catch(()=>({}));
  if(!uploaded.ok)throw new Error(body?.error||`Could not stream campaign media (HTTP ${uploaded.status}).`);
  return {ok:true,project:body,mediaUrl:target};
}

async function parseCampaignBrowserSnapshots(targetUrl, campaignSnapshot, requirementsSnapshot, listingSnapshot=null, termsSnapshot=null, resourceInspections=[]) {
  const endpoint = backendRuntimeUrl('/api/campaigns/import-snapshot');
  if (!endpoint) throw new Error('ClipBoost backend is not available.');
  const response = await fetch(endpoint, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ url:targetUrl, campaign:campaignSnapshot, requirements:requirementsSnapshot, listing:listingSnapshot, terms:termsSnapshot, resourceInspections })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `Campaign parsing failed (${response.status}).`);
  return body;
}
async function runAuthenticatedCampaignImport(rawUrl) {
  const targetUrl = safeHttpUrl(rawUrl);
  if (!targetUrl) throw new Error('Enter a valid campaign URL.');
  if (campaignImportWindow && !campaignImportWindow.isDestroyed()) {
    campaignImportWindow.focus();
    throw new Error('A campaign import window is already open.');
  }
  markRendererActivity();
  const target = new URL(targetUrl);
  const win = new BrowserWindow({
    width:1280,height:860,minWidth:900,minHeight:650,show:true,autoHideMenuBar:true,
    title:'ClipBoost · Campaign Smart Import',backgroundColor:'#0b1018',parent:mainWindow || undefined,
    webPreferences:{ partition:CAMPAIGN_IMPORT_PARTITION, contextIsolation:true, nodeIntegration:false, sandbox:true }
  });
  campaignImportWindow = win;
  configureCampaignBrowser(win);
  let resolved = false;
  let confirmReady = false;
  let confirmed = false;
  let confirmCampaignName = '';
  let selectedCampaign = null;
  const visitedAssets = new Map();
  let electronConfirmed = false;
  const confirmNavigationHandler=(event,url)=>{
    if(String(url||'').startsWith('clipboost-confirm://campaign')){
      event.preventDefault();
      electronConfirmed=true;
    }
  };
  win.webContents.on('will-navigate',confirmNavigationHandler);
  let stableKey = '';
  let stableSince = 0;
  const started = Date.now();
  try {
    // Add an explicit confirmation action inside the authenticated browser. The button is
    // injected locally by Electron and never depends on the campaign provider's markup.
    const injectConfirmButton=async()=>{
      if(win.isDestroyed()||!selectedCampaign)return;
      const label=JSON.stringify(`Confirmer : ${selectedCampaign.name}`);
      try{await win.webContents.executeJavaScript(`(() => {
        let btn=document.getElementById('clipboost-confirm-campaign');
        if(!btn){btn=document.createElement('button');btn.id='clipboost-confirm-campaign';btn.type='button';Object.assign(btn.style,{position:'fixed',right:'24px',bottom:'24px',zIndex:'2147483647',padding:'14px 20px',border:'0',borderRadius:'12px',background:'#ef3340',color:'#fff',font:'600 14px system-ui,sans-serif',boxShadow:'0 12px 32px rgba(0,0,0,.35)',cursor:'pointer'});btn.addEventListener('click',()=>{btn.textContent='Validation…';btn.disabled=true;btn.dataset.confirmed='1';location.href='clipboost-confirm://campaign';});document.body.appendChild(btn)}
        if(btn.dataset.confirmed!=='1')btn.textContent=${label};
        return btn.dataset.confirmed==='1';
      })()`)}catch{}
    };
    await win.loadURL(targetUrl);
    while (!win.isDestroyed() && Date.now() - started < 5 * 60_000) {
      await sleep(900);
      if (win.isDestroyed()) break;
      let snapshot;
      try { snapshot = await campaignBrowserSnapshot(win); } catch { continue; }
      const currentUrl = safeHttpUrl(snapshot.url) || targetUrl;
      let current;
      try { current = new URL(currentUrl); } catch { current = target; }
      const login = campaignSnapshotIsLogin(snapshot);
      const evidence = campaignSnapshotEvidence(snapshot);
      const sameHost = current.hostname === target.hostname;
      // Remember external asset viewers opened after a campaign was selected. Frame.io
      // commonly exposes the asset through its player/download UI rather than a direct MP4 link.
      if(selectedCampaign&&!sameHost){
        const host=String(current.hostname||'').toLowerCase();
        const info=resourceSnapshotKind(snapshot||{});
        const title=String(snapshot.title||'').replace(/\s*-\s*Frame\.io.*$/i,'').trim();
        const isFrame=/frame\.io$/i.test(host)||/\.frame\.io$/i.test(host);
        const looksMedia=isFrame||info.videoCount>0||/\.(?:mp4|mov|webm|m4v)\b/i.test(String(snapshot.title||''));
        if(looksMedia)visitedAssets.set(currentUrl,{url:currentUrl,label:title||'Campaign asset',kind:info.videoCount?'video-pack':'asset-pack',videoCount:Math.max(isFrame?1:0,Number(info.videoCount||0)),imageCount:Number(info.imageCount||0),mediaCount:Math.max(1,Number(info.mediaCount||0)),mediaUrls:info.mediaUrls||[],inspectStatus:'visited'});
      }
      // The initial URL may be a creator/listing page containing several campaigns.
      // Never force navigation back: the user's current page is the source of truth.
      const key = `${currentUrl}|${String(snapshot.text || '').length}|${evidence}`;
      if (key !== stableKey) { stableKey = key; stableSince = Date.now(); }
      const currentCampaignName=campaignNameFromSnapshot(snapshot);
      let isCampaignListing=false;
      try{isCampaignListing=/^\/dashboard\/campaigns\/?$/i.test(current.pathname)||/\/(?:creator|creators|profile)\/?$/i.test(current.pathname)}catch{}
      // A creator/listing can expose campaign-like text for several campaigns. Only resolve
      // after the user has opened one concrete campaign page with its own identifiable name.
      confirmReady=!login&&sameHost&&!isCampaignListing&&Boolean(currentCampaignName)&&evidence>=2&&Date.now()-stableSince>=3000;
      if(confirmReady){
        confirmCampaignName=currentCampaignName;
        // Freeze the last valid campaign snapshot. Navigating to Assets/Canto must not replace it.
        selectedCampaign={name:currentCampaignName,url:currentUrl,snapshot};
      }
      // Once a campaign has been detected, keep the confirmation action available on every
      // subsequent page, including external asset galleries.
      if(selectedCampaign){
        await injectConfirmButton();
        try{const domConfirmed=Boolean(await win.webContents.executeJavaScript(`document.getElementById('clipboost-confirm-campaign')?.dataset.confirmed==='1'`));confirmed=electronConfirmed||domConfirmed}catch{confirmed=electronConfirmed}
      }
      confirmed=confirmed||electronConfirmed;
      if (selectedCampaign && confirmed) {
        const campaignSnapshot=selectedCampaign.snapshot;
        const campaignUrl=selectedCampaign.url;
        const reqUrl = campaignRequirementsUrl(campaignSnapshot);
        let requirementsSnapshot = null;
        if (reqUrl && reqUrl !== campaignUrl) {
          try { requirementsSnapshot = await loadCampaignWorkerSnapshot(reqUrl); } catch (err) { console.warn('[Campaign import] Requirements page could not be read:', err?.message || err); }
        } else if (/\/campaigns\/doc\//i.test(campaignUrl)) requirementsSnapshot = campaignSnapshot;
        const campaignName=selectedCampaign.name;
        let listingSnapshot=null;const listingUrl=campaignListingUrl(campaignUrl);
        if(listingUrl){try{listingSnapshot=await loadCampaignWorkerSnapshot(listingUrl)}catch(err){console.warn('[Campaign import] Campaign listing could not be read:',err?.message||err)}}
        let termsSnapshot=null;const termsUrl=campaignTermsUrl(requirementsSnapshot||{});
        if(termsUrl){try{termsSnapshot=await loadCampaignWorkerSnapshot(termsUrl)}catch(err){console.warn('[Campaign import] Platform terms could not be read:',err?.message||err)}}
        let providerHost='';try{providerHost=new URL(campaignUrl).hostname.replace(/^www\./,'').toLowerCase()}catch{}
        const resourceLinks=resourceLinksFromRequirements(requirementsSnapshot||{},providerHost);
        const resourceInspections=[];for(const item of resourceLinks){resourceInspections.push(await inspectCampaignResource(item))}
        // Merge asset viewers the user actually opened. This catches Frame.io review/player
        // pages whose playable stream is not present in the original campaign HTML.
        for(const asset of visitedAssets.values()){
          if(resourceInspections.some(x=>String(x?.url||'')===asset.url))continue;
          let inspected=asset;
          try{const deep=await inspectCampaignResource(asset);if(Number(deep?.mediaCount||0)>0||Number(deep?.videoCount||0)>0)inspected={...asset,...deep}}catch{}
          resourceInspections.push(inspected);
        }
        if(listingSnapshot&&campaignName)listingSnapshot.focusName=campaignName;
        const parsed = await parseCampaignBrowserSnapshots(campaignUrl, campaignSnapshot, requirementsSnapshot, listingSnapshot, termsSnapshot, resourceInspections);
        resolved = true;
        if (!win.isDestroyed()) win.close();
        return { ok:true, authenticated:true, confirmed:true, selectedCampaign:selectedCampaign.name, ...parsed };
      }
    }
    if (!resolved) throw new Error(win.isDestroyed() ? 'Campaign selection was closed before confirmation.' : 'Timed out waiting for confirmation. Open the campaign you want, then click “Confirmer cette campagne”.');
  } finally {
    try{if(!win.isDestroyed())win.webContents.removeListener('will-navigate',confirmNavigationHandler)}catch{}
    if (campaignImportWindow === win) campaignImportWindow = null;
    if (resolved && !win.isDestroyed()) win.close();
  }
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function toggleMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isVisible()) mainWindow.hide();
  else showMainWindow();
}

function createTray() {
  if (tray) return tray;
  const trayPath = path.join(appRoot(), 'desktop', 'assets', 'tray.png');
  let icon = nativeImage.createFromPath(trayPath);
  if (icon.isEmpty()) {
    const fallbackPath = path.join(appRoot(), 'desktop', 'assets', 'clipboost.png');
    icon = nativeImage.createFromPath(fallbackPath);
  }
  if (process.platform === 'win32' && !icon.isEmpty()) icon = icon.resize({ width: 20, height: 20 });
  tray = new Tray(icon);
  tray.setToolTip('ClipBoost');
  const menu = Menu.buildFromTemplate([
    { label:'Open ClipBoost', click:showMainWindow },
    { label:'Check for updates', click:() => checkForUpdates(true) },
    { type:'separator' },
    { label:'Open data folder', click:() => shell.openPath(ensureUserFiles().dataDir) },
    { label:'Open config (.env)', click:() => shell.openPath(ensureUserFiles().envPath) },
    { type:'separator' },
    { label:'Quit ClipBoost', click:() => { isQuitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu);
  tray.on('click', toggleMainWindow);
  tray.on('double-click', showMainWindow);
  return tray;
}

function createMenu() {
  const { dataDir, envPath } = ensureUserFiles();
  const template = [
    { label:'ClipBoost', submenu:[
      { label:'Check for updates', click:() => checkForUpdates(true) },
      { type:'separator' },
      { label:'Reload', accelerator:'CmdOrCtrl+R', click:() => mainWindow?.reload() },
      { type:'separator' },
      { label:'Open data folder', click:() => shell.openPath(dataDir) },
      { label:'Open config (.env)', click:() => shell.openPath(envPath) },
      { type:'separator' }, { role:'quit' }
    ]},
    { label:'Edit', submenu:[{ role:'undo' },{ role:'redo' },{ type:'separator' },{ role:'cut' },{ role:'copy' },{ role:'paste' }] },
    { label:'View', submenu:[{ role:'resetZoom' },{ role:'zoomIn' },{ role:'zoomOut' },{ type:'separator' },{ role:'toggleDevTools' }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow() {
  const baseUrl = await startBackend();
  createMenu();
  mainWindow = new BrowserWindow({
    width:1600, height:980, minWidth:1100, minHeight:720,
    backgroundColor:'#050913', show:false, autoHideMenuBar:true,
    frame:false, titleBarStyle:'hidden',
    icon:path.join(appRoot(), 'desktop', 'assets', 'clipboost.ico'),
    webPreferences:{ contextIsolation:true, nodeIntegration:false, sandbox:true, webviewTag:true, preload:path.join(__dirname,'preload.cjs') }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action:'deny' };
  });
  mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    const target = String(params?.src || '');
    // The live guest is intentionally limited to Twitch and gets no preload/Node bridge.
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    if (!/^https:\/\/www\.twitch\.tv\/[A-Za-z0-9_]+(?:[/?#].*)?$/i.test(target)) {
      event.preventDefault();
    }
  });
  mainWindow.webContents.on('did-attach-webview', (_event, guest) => {
    guest.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\/(?:www\.)?twitch\.tv\//i.test(url)) shell.openExternal(url);
      return { action:'deny' };
    });
    guest.on('will-navigate', (event, url) => {
      try {
        const parsed = new URL(url);
        if (!/(^|\.)twitch\.tv$/i.test(parsed.hostname)) event.preventDefault();
      } catch { event.preventDefault(); }
    });
  });
  mainWindow.webContents.on('did-fail-load', (_event, code, description, validatedURL) => {
    console.error('[ClipBoost Desktop] Page failed to load:', code, description, validatedURL);
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => console.error('[ClipBoost Desktop] Renderer exited:', details));
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) console.error(`[ClipBoost UI] ${message} (${sourceId}:${line})`);
  });
  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
  });
  await mainWindow.loadURL(baseUrl);
  createTray();
  mainWindow.on('close', (event) => {
    if (!isQuitting && readDesktopSettings().closeToTray) {
      event.preventDefault();
      mainWindow.hide();
    } else if (!isQuitting) {
      isQuitting = true;
    }
  });
  mainWindow.on('focus', markRendererActivity);
  mainWindow.on('show', markRendererActivity);
  mainWindow.on('restore', markRendererActivity);
  mainWindow.on('minimize', () => { /* Eco mode will release idle AI after the configured timeout. */ });
  // Visibility is handled by ready-to-show to avoid a black frameless shell flash.
  markRendererActivity();
  startEcoMonitor();

  // Detect a renderer that technically loaded but failed before rendering the app.
  setTimeout(async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      const ok = await mainWindow.webContents.executeJavaScript("Boolean(document.getElementById('app')?.children?.length)");
      if (!ok) {
        console.error('[ClipBoost Desktop] Renderer loaded but #app is empty. Opening DevTools.');
        mainWindow.webContents.openDevTools({ mode:'detach' });
        dialog.showErrorBox('ClipBoost UI did not render', 'The desktop shell started, but the interface failed to render. DevTools has been opened with the exact JavaScript error.');
      }
    } catch (err) { console.error('[ClipBoost Desktop] UI health check failed:', err); }
  }, 2500);

  // Startup auto-update check after the app is usable.
  if (readDesktopSettings().checkUpdatesOnStartup) setTimeout(() => checkForUpdates(false), 5000);
}
function stopBackend() { stopBackendTree(); }

ipcMain.handle('desktop:window-minimize', () => { if(mainWindow&&!mainWindow.isDestroyed())mainWindow.minimize(); return {ok:true}; });
ipcMain.handle('desktop:window-maximize', () => {
  if(!mainWindow||mainWindow.isDestroyed())return {ok:false};
  if(mainWindow.isMaximized())mainWindow.unmaximize();else mainWindow.maximize();
  return {ok:true,maximized:mainWindow.isMaximized()};
});
ipcMain.handle('desktop:window-close', () => { if(mainWindow&&!mainWindow.isDestroyed())mainWindow.close(); return {ok:true}; });
ipcMain.handle('desktop:window-state', () => ({ok:true,maximized:Boolean(mainWindow&&!mainWindow.isDestroyed()&&mainWindow.isMaximized())}));

ipcMain.on('desktop:activity', () => markRendererActivity());
ipcMain.handle('desktop:import-campaign-authenticated', async (_event, url) => runAuthenticatedCampaignImport(url));
ipcMain.handle('desktop:inspect-campaign-asset-pack', async (_event, url) => { try { return await discoverCampaignAssetPack(url); } catch (err) { return { ok:false, error:err?.message || 'Could not inspect this asset pack.' }; } });
ipcMain.handle('desktop:import-campaign-asset', async (_event, payload={}) => { try { return await importCampaignAssetToProject(payload.projectId,payload.mediaUrl,payload.pageUrl,payload.label); } catch (err) { return {ok:false,error:err?.message||'Could not import campaign asset.'}; } });
ipcMain.handle('desktop:clear-campaign-import-session', async () => { await session.fromPartition(CAMPAIGN_IMPORT_PARTITION).clearStorageData(); return { ok:true }; });
ipcMain.handle('desktop:get-settings', () => ({ ...readDesktopSettings(), updateState, version:app.getVersion(), packaged:app.isPackaged }));
ipcMain.handle('desktop:get-platform-connections', () => platformConnectionSnapshot());
ipcMain.handle('desktop:connect-platform', async (_event, provider) => connectPlatformOAuth(String(provider||'').toLowerCase()));
ipcMain.handle('desktop:disconnect-platform', async (_event, provider) => disconnectPlatformOAuth(String(provider||'').toLowerCase()));
ipcMain.handle('desktop:save-settings', (_event, settings) => { const saved=writeDesktopSettings(settings); markRendererActivity(); startEcoMonitor(); return { ok:true, settings:saved }; });
ipcMain.handle('desktop:check-updates', async () => checkForUpdates(true));
async function launchDownloadedWindowsInstaller(installerPath) {
  if (process.platform !== 'win32') return { ok:false, error:'Direct installer launch is Windows-only.' };
  const target = String(installerPath || '').trim();
  if (!target || !fs.existsSync(target)) return { ok:false, error:'Downloaded installer file was not found.' };
  if (!/\.exe$/i.test(target)) return { ok:false, error:'Downloaded update is not a Windows executable.' };

  // shell.openPath delegates to Windows Explorer/Shell, matching a normal
  // double-click on the downloaded setup and avoiding child_process spawn
  // failures such as "spawn UNKNOWN".
  const openError = await shell.openPath(target);
  if (openError) return { ok:false, error:openError };
  return { ok:true, path:target };
}

ipcMain.handle('desktop:install-update', async () => {
  if (!updater || updateState.status !== 'ready') return { ok:false, error:'No downloaded update is ready.' };
  if (installUpdateInProgress) return { ok:true, alreadyStarting:true, silent:true };

  installUpdateInProgress = true;
  // Prevent the close-to-tray handler from intercepting electron-updater's shutdown.
  isQuitting = true;

  try {
    await shutdownBackendGracefully();
    allowImmediateQuit = true;
    writeUpdateInstallMarker(updateState.version);

    // Always let electron-updater perform the NSIS install. It knows the
    // downloaded package metadata and passes the updater-specific installer
    // arguments expected by electron-builder. Opening the cached .exe directly
    // can leave the installed app on the old version and cause an update loop.
    updater.quitAndInstall(false, true);
    return { ok:true, silent:false, restart:true, method:'electron-updater' };
  } catch (err) {
    installUpdateInProgress = false;
    isQuitting = false;
    lastReadyEventVersion = null;
    console.error('[ClipBoost Updater] Install launch failed:', err);
    emitUpdateEvent({ status:'error', message:err?.message || String(err), updateState });
    return { ok:false, error:err?.message || String(err) };
  }
});
ipcMain.handle('desktop:open-data-folder', () => shell.openPath(ensureUserFiles().dataDir));
ipcMain.handle('desktop:open-config', () => shell.openPath(ensureUserFiles().envPath));
ipcMain.handle('desktop:open-exports-folder', () => { const env=readDesktopEnv(); const target=env.CLIPBOOST_EXPORT_DIR || path.join(ensureUserFiles().dataDir,'exports'); fs.mkdirSync(target,{recursive:true}); return shell.openPath(target); });
ipcMain.handle('desktop:restart-app', async () => { isQuitting=true; await shutdownBackendGracefully(); allowImmediateQuit=true; app.relaunch(); app.exit(0); return {ok:true}; });

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else {
  app.on('second-instance', () => showMainWindow());
}

app.whenReady().then(async () => {
  const marker=readUpdateInstallMarker();
  if(marker?.version){
    const current=String(app.getVersion()||'');
    if(current===String(marker.version)) clearUpdateInstallMarker();
    else console.warn('[ClipBoost Updater] Previous install request did not update the app.', {requested:marker.version,current});
  }
  return createWindow();
}).catch(err => { dialog.showErrorBox('ClipBoost could not start', err?.stack || String(err)); app.quit(); });
app.on('before-quit', (event) => {
  isQuitting = true;
  if (allowImmediateQuit || backendCleanupComplete) return;
  event.preventDefault();
  if (backendCleanupInFlight) return;
  shutdownBackendGracefully().finally(() => {
    allowImmediateQuit = true;
    app.quit();
  });
});
app.on('window-all-closed', () => { if (isQuitting) app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
