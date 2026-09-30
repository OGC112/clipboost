const { app, BrowserWindow, shell, dialog, Menu, Tray, nativeImage, ipcMain, session } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');
const dotenv = require('dotenv');

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
async function waitForServer(url, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      if (res.ok || (res.status >= 300 && res.status < 500)) return;
    } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('ClipBoost backend did not start in time.');
}
async function startBackend() {
  const paths = ensureUserFiles();
  serverPort = await freePort();
  const serverEntry = path.join(appRoot(), 'server', 'index.js');
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: 'production',
    PORT: String(serverPort),
    CLIPBOOST_DATA_DIR: paths.dataDir,
    DOTENV_CONFIG_PATH: paths.envPath
  };
  serverProcess = spawn(process.execPath, [serverEntry], {
    cwd: appRoot(), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
  });
  serverProcess.stdout.on('data', d => process.stdout.write(`[ClipBoost] ${d}`));
  serverProcess.stderr.on('data', d => process.stderr.write(`[ClipBoost] ${d}`));
  serverProcess.on('exit', code => {
    if (code && !isQuitting && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox('ClipBoost backend stopped', `The local backend exited with code ${code}.`);
    }
  });
  const baseUrl = `http://127.0.0.1:${serverPort}`;
  await waitForServer(baseUrl);
  return baseUrl;
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
  // Keep installation strictly manual. electron-updater v26 uses
  // autoInstallOnAppQuit while newer releases use autoInstallEvent.
  try { updater.autoInstallOnAppQuit = false; } catch {}
  try { if ('autoInstallEvent' in updater) updater.autoInstallEvent = 'manual'; } catch {}
  updater.setFeedURL({ provider:'github', owner, repo });
  updater.on('checking-for-update', () => { updateState = { status:'checking', version:null, percent:0 }; });
  updater.on('update-available', info => {
    lastProgressEventPercent = -1;
    lastReadyEventVersion = null;
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
    updateState = { status:'current', version:info.version || app.getVersion(), percent:100 };
    if (manualUpdateCheck) emitUpdateEvent({ status:'current', version:app.getVersion(), updateState });
    manualUpdateCheck = false;
  });
  updater.on('error', err => {
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
      images: [...document.querySelectorAll('img[src]')].map(img => ({ alt:clean(img.alt), src:img.currentSrc || img.src })).filter(x => /^https?:/i.test(x.src)).slice(0,160),
      videos: [...document.querySelectorAll('video')].map(v => ({
        src:v.currentSrc || v.src || '', poster:v.poster || '',
        duration:Number.isFinite(v.duration) ? Number(v.duration) : null,
        sources:[...v.querySelectorAll('source[src]')].map(x => x.src).filter(Boolean)
      })).slice(0,80),
      mediaHints: [...document.querySelectorAll('[aria-label],[data-type],[data-kind],[class]')].map(el => {
        const hint=clean([el.getAttribute('aria-label'),el.getAttribute('data-type'),el.getAttribute('data-kind'),el.className].filter(Boolean).join(' '));
        return /video|movie|media|asset/i.test(hint) ? hint.slice(0,240) : '';
      }).filter(Boolean).slice(0,160),
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
    const relevant=/^(content|sources?|assets?|media)$/i.test(section)||/^(assets?(?:\s*#?\d+)?|media|downloads?)$/i.test(label)||/asset|media/i.test(label);
    if(!relevant||seen.has(href))continue;seen.add(href);out.push({url:href,label:label||'Campaign asset'});
  }
  return out.slice(0,8);
}
function resourceSnapshotKind(snapshot={}) {
  const videoEls=Array.isArray(snapshot.videos)?snapshot.videos:[];
  const mediaHints=Array.isArray(snapshot.mediaHints)?snapshot.mediaHints:[];
  const videoLinks=(Array.isArray(snapshot.links)?snapshot.links:[]).filter(x=>/\.(?:mp4|mov|webm|m4v)(?:[?#]|$)/i.test(String(x?.href||'')));
  const videoCount=Math.max(videoEls.length,videoLinks.length,mediaHints.filter(x=>/video|movie/i.test(String(x))).length?1:0);
  const imageCount=(Array.isArray(snapshot.images)?snapshot.images:[]).filter(x=>!/(?:logo|icon|avatar)/i.test(String(x?.alt||''))).length;
  let kind='asset-pack';if(videoCount&&imageCount)kind='mixed-pack';else if(videoCount)kind='video-pack';else if(imageCount)kind='image-pack';
  const mediaUrls=[...new Set([...videoEls.flatMap(v=>[v.src,...(v.sources||[])]),...videoLinks.map(x=>x.href)].filter(x=>/^https?:/i.test(String(x))))].slice(0,20);
  return {kind,videoCount,imageCount,mediaCount:Math.max(videoCount+imageCount,videoCount,imageCount),mediaUrls};
}
async function inspectCampaignResource(item={}) {
  const url=safeHttpUrl(item.url);if(!url)return {...item,kind:'external',inspectStatus:'invalid'};
  try{
    const top=await loadCampaignWorkerSnapshot(url);let info=resourceSnapshotKind(top||{});
    if(info.videoCount===0){
      let host='';try{host=new URL(url).hostname}catch{}
      const childLinks=(Array.isArray(top?.links)?top.links:[]).map(x=>String(x?.href||'')).filter(h=>{try{const u=new URL(h);return u.hostname===host&&h!==url&&!/\.(?:jpg|jpeg|png|gif|webp|svg)(?:[?#]|$)/i.test(h)}catch{return false}});
      for(const childUrl of [...new Set(childLinks)].slice(0,4)){
        try{const child=await loadCampaignWorkerSnapshot(childUrl);const childInfo=resourceSnapshotKind(child||{});if(childInfo.videoCount){info={kind:childInfo.imageCount?'mixed-pack':'video-pack',videoCount:info.videoCount+childInfo.videoCount,imageCount:Math.max(info.imageCount,childInfo.imageCount),mediaCount:Math.max(1,info.mediaCount)+Math.max(1,childInfo.mediaCount),mediaUrls:[...new Set([...(info.mediaUrls||[]),...(childInfo.mediaUrls||[])])].slice(0,20)};break}}catch{}
      }
    }
    return {...item,...info,inspectStatus:'ok'};
  }catch(err){return {...item,kind:'asset-pack',videoCount:0,imageCount:0,mediaCount:0,inspectStatus:'unavailable'};}
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
    await worker.loadURL(target);
    await sleep(1800);
    const snapshot = await campaignBrowserSnapshot(worker);
    return snapshot;
  } finally {
    if (!worker.isDestroyed()) worker.destroy();
    if (campaignImportWorker === worker) campaignImportWorker = null;
  }
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
  let returnedToTarget = false;
  let stableKey = '';
  let stableSince = 0;
  const started = Date.now();
  try {
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
      if (!login && sameHost && evidence === 0 && current.pathname !== target.pathname && !returnedToTarget) {
        returnedToTarget = true;
        try { await win.loadURL(targetUrl); } catch {}
        continue;
      }
      const key = `${currentUrl}|${String(snapshot.text || '').length}|${evidence}`;
      if (key !== stableKey) { stableKey = key; stableSince = Date.now(); }
      if (!login && sameHost && evidence >= 2 && Date.now() - stableSince >= 1200) {
        const reqUrl = campaignRequirementsUrl(snapshot);
        let requirementsSnapshot = null;
        if (reqUrl && reqUrl !== currentUrl) {
          try { requirementsSnapshot = await loadCampaignWorkerSnapshot(reqUrl); } catch (err) { console.warn('[Campaign import] Requirements page could not be read:', err?.message || err); }
        } else if (/\/campaigns\/doc\//i.test(currentUrl)) requirementsSnapshot = snapshot;
        const campaignName=campaignNameFromSnapshot(snapshot);
        let listingSnapshot=null;const listingUrl=campaignListingUrl(targetUrl);
        if(listingUrl){try{listingSnapshot=await loadCampaignWorkerSnapshot(listingUrl)}catch(err){console.warn('[Campaign import] Campaign listing could not be read:',err?.message||err)}}
        let termsSnapshot=null;const termsUrl=campaignTermsUrl(requirementsSnapshot||{});
        if(termsUrl){try{termsSnapshot=await loadCampaignWorkerSnapshot(termsUrl)}catch(err){console.warn('[Campaign import] Platform terms could not be read:',err?.message||err)}}
        let providerHost='';try{providerHost=new URL(targetUrl).hostname.replace(/^www\./,'').toLowerCase()}catch{}
        const resourceLinks=resourceLinksFromRequirements(requirementsSnapshot||{},providerHost);
        const resourceInspections=[];for(const item of resourceLinks){resourceInspections.push(await inspectCampaignResource(item))}
        if(listingSnapshot&&campaignName)listingSnapshot.focusName=campaignName;
        const parsed = await parseCampaignBrowserSnapshots(targetUrl, snapshot, requirementsSnapshot, listingSnapshot, termsSnapshot, resourceInspections);
        resolved = true;
        if (!win.isDestroyed()) win.close();
        return { ok:true, authenticated:true, ...parsed };
      }
    }
    if (!resolved) throw new Error(win.isDestroyed() ? 'Campaign import window was closed before the campaign could be read.' : 'Timed out waiting for the campaign page. Sign in, then keep the campaign page open while ClipBoost imports it.');
  } finally {
    if (campaignImportWindow === win) campaignImportWindow = null;
    if (!resolved && !win.isDestroyed()) win.close();
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
  mainWindow.show();
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

ipcMain.on('desktop:activity', () => markRendererActivity());
ipcMain.handle('desktop:import-campaign-authenticated', async (_event, url) => runAuthenticatedCampaignImport(url));
ipcMain.handle('desktop:clear-campaign-import-session', async () => { await session.fromPartition(CAMPAIGN_IMPORT_PARTITION).clearStorageData(); return { ok:true }; });
ipcMain.handle('desktop:get-settings', () => ({ ...readDesktopSettings(), updateState, version:app.getVersion(), packaged:app.isPackaged }));
ipcMain.handle('desktop:save-settings', (_event, settings) => { const saved=writeDesktopSettings(settings); markRendererActivity(); startEcoMonitor(); return { ok:true, settings:saved }; });
ipcMain.handle('desktop:check-updates', async () => checkForUpdates(true));
ipcMain.handle('desktop:install-update', async () => {
  if (!updater || updateState.status !== 'ready') return { ok:false, error:'No downloaded update is ready.' };
  if (installUpdateInProgress) return { ok:true, alreadyStarting:true, silent:true };

  installUpdateInProgress = true;
  // Prevent the close-to-tray handler from intercepting electron-updater's shutdown.
  isQuitting = true;

  try {
    await shutdownBackendGracefully();
    allowImmediateQuit = true;
    // electron-updater 6.x:
    //   isSilent=true        -> NSIS /S (no installer window)
    //   isForceRunAfter=true -> NSIS --force-run (relaunch ClipBoost)
    updater.quitAndInstall(true, true);
    return { ok:true, silent:true, restart:true, method:'electron-updater' };
  } catch (err) {
    installUpdateInProgress = false;
    isQuitting = false;
    lastReadyEventVersion = null;
    console.error('[ClipBoost Updater] Silent install failed:', err);
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

app.whenReady().then(createWindow).catch(err => { dialog.showErrorBox('ClipBoost could not start', err?.stack || String(err)); app.quit(); });
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
