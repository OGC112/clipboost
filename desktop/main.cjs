const { app, BrowserWindow, shell, dialog, Menu, Tray, nativeImage, ipcMain } = require('electron');
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
  const defaults = { startWithWindows:false, closeToTray:true, checkUpdatesOnStartup:true, autoDownloadUpdates:true };
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
    if (code && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox('ClipBoost backend stopped', `The local backend exited with code ${code}.`);
    }
  });
  const baseUrl = `http://127.0.0.1:${serverPort}`;
  await waitForServer(baseUrl);
  return baseUrl;
}

function emitUpdateEvent(payload = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('desktop:update-event', payload);
}
function setupUpdater(owner, repo) {
  if (updater) return updater;
  updater = require('electron-updater').autoUpdater;
  updater.autoDownload = Boolean(readDesktopSettings().autoDownloadUpdates);
  updater.autoInstallOnAppQuit = true;
  updater.setFeedURL({ provider:'github', owner, repo });
  updater.on('checking-for-update', () => { updateState = { status:'checking', version:null, percent:0 }; });
  updater.on('update-available', info => {
    updateState = { status:'downloading', version:info.version, percent:0 };
    if (manualUpdateCheck) emitUpdateEvent({ status:'available', version:info.version, downloading:Boolean(updater.autoDownload), updateState });
    if (!updater.autoDownload) manualUpdateCheck = false;
  });
  updater.on('download-progress', p => {
    updateState = { ...updateState, status:'downloading', percent:Math.round(p.percent || 0) };
    emitUpdateEvent({ status:'progress', version:updateState.version, percent:updateState.percent, updateState });
  });
  updater.on('update-not-available', info => {
    updateState = { status:'current', version:info.version || app.getVersion(), percent:100 };
    if (manualUpdateCheck) emitUpdateEvent({ status:'current', version:app.getVersion(), updateState });
    manualUpdateCheck = false;
  });
  updater.on('error', err => {
    updateState = { status:'error', version:null, percent:0 };
    console.error('[ClipBoost Updater]', err);
    if (manualUpdateCheck) emitUpdateEvent({ status:'error', message:err?.message || String(err), updateState });
    manualUpdateCheck = false;
  });
  updater.on('update-downloaded', info => {
    updateState = { status:'ready', version:info.version, percent:100 };
    emitUpdateEvent({ status:'ready', version:info.version, updateState });
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
  const owner = String(cfg.CLIPBOOST_UPDATE_OWNER || '').trim();
  const repo = String(cfg.CLIPBOOST_UPDATE_REPO || '').trim();
  if (!owner || !repo) {
    const result = { ok:false, status:'unconfigured', currentVersion:app.getVersion(), updateState };
    if (manual) emitUpdateEvent(result);
    return result;
  }
  try {
    manualUpdateCheck = Boolean(manual);
    const client = setupUpdater(owner, repo);
    client.autoDownload = Boolean(readDesktopSettings().autoDownloadUpdates);
    await client.checkForUpdates();
    return { ok:true, status:updateState.status, updateState };
  } catch (err) {
    console.error('[ClipBoost Updater]', err);
    const result = { ok:false, status:'error', message:err?.message || String(err), updateState:{ status:'error', version:null, percent:0 } };
    updateState = result.updateState;
    if (manual) emitUpdateEvent(result);
    manualUpdateCheck = false;
    return result;
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
    webPreferences:{ contextIsolation:true, nodeIntegration:false, sandbox:true, preload:path.join(__dirname,'preload.cjs') }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action:'deny' };
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
  mainWindow.on('minimize', () => { /* keep normal Windows minimize behavior */ });
  mainWindow.show();

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
function stopBackend() {
  if (serverProcess && !serverProcess.killed) { try { serverProcess.kill(); } catch {} }
  serverProcess = null;
}

ipcMain.handle('desktop:get-settings', () => ({ ...readDesktopSettings(), updateState, version:app.getVersion(), packaged:app.isPackaged }));
ipcMain.handle('desktop:save-settings', (_event, settings) => ({ ok:true, settings:writeDesktopSettings(settings) }));
ipcMain.handle('desktop:check-updates', async () => checkForUpdates(true));
ipcMain.handle('desktop:install-update', () => { if (updater && updateState.status === 'ready') { isQuitting = true; updater.quitAndInstall(false, true); return { ok:true }; } return { ok:false, error:'No downloaded update is ready.' }; });
ipcMain.handle('desktop:open-data-folder', () => shell.openPath(ensureUserFiles().dataDir));
ipcMain.handle('desktop:open-config', () => shell.openPath(ensureUserFiles().envPath));
ipcMain.handle('desktop:open-exports-folder', () => { const env=readDesktopEnv(); const target=env.CLIPBOOST_EXPORT_DIR || path.join(ensureUserFiles().dataDir,'exports'); fs.mkdirSync(target,{recursive:true}); return shell.openPath(target); });
ipcMain.handle('desktop:restart-app', () => { isQuitting=true; app.relaunch(); app.exit(0); return {ok:true}; });

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else {
  app.on('second-instance', () => showMainWindow());
}

app.whenReady().then(createWindow).catch(err => { dialog.showErrorBox('ClipBoost could not start', err?.stack || String(err)); app.quit(); });
app.on('before-quit', () => { isQuitting = true; stopBackend(); });
app.on('window-all-closed', () => { if (isQuitting) stopBackend(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
