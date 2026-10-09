import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { validatePublicHttpUrl } from '../security/network.js';

export function createExternalIngestion(deps) {
  const {
    root,
    uploadsDir,
    windowsTools,
    registerProjectProcess,
    readMeta,
    writeMeta,
    probe,
    withProjectTask,
    analyzeProject
  } = deps;

  function externalIngestionConfig() {
    const browser = String(process.env.YOUTUBE_AUTH_BROWSER || 'firefox').trim().toLowerCase();
    const node = windowsTools.node || String(process.env.NODE_BIN || '').trim() || null;
    const ffmpeg = windowsTools.ffmpeg || String(process.env.FFMPEG_BIN || '').trim() || null;
    return {
      python: String(process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3')).trim(),
      maxHeight: Math.max(360, Math.min(2160, Number(process.env.INGEST_MAX_HEIGHT || 720))),
      youtubeAuthBrowser: ['auto','firefox','edge','chrome','brave','none'].includes(browser) ? browser : 'firefox',
      node,
      ffmpeg
    };
  }
  
  function youtubeBrowserAttempts(configured='firefox') {
    if (configured === 'none') return [];
    if (configured === 'auto') return ['firefox','edge','chrome','brave'];
    return [configured];
  }
  
  function isYoutubeRetryableAuthError(message='') {
    const text=String(message||'').toLowerCase();
    return /confirm you.?re not a bot|sign in to confirm|page needs to be reloaded|login required|cookies?/.test(text);
  }
  function isYoutubeUnavailableError(message='') {
    return /this video is unavailable|video unavailable|private video|members-only|not available in your country|geo.?restricted/i.test(String(message||''));
  }
  function friendlyIngestError(err, browser='firefox') {
    const raw=String(err?.message||err||'Automatic source ingestion failed.');
    if (isYoutubeUnavailableError(raw)) return new Error('Video unavailable. The source may be private, deleted, members-only, region-restricted, or no longer accessible.');
    if (/could not copy .*cookie database/i.test(raw)) return new Error(`ClipBoost could not read the ${browser} YouTube session. Keep Firefox as the recommended auth browser, make sure you are signed in to YouTube there, then retry.`);
    if (/confirm you.?re not a bot|sign in to confirm/i.test(raw)) return new Error(`YouTube authentication is required. Sign in to YouTube in ${browser === 'firefox' ? 'Firefox' : browser}, then retry automatic ingest.`);
    if (/signature solving failed|n challenge solving failed|page needs to be reloaded/i.test(raw)) return new Error('YouTube challenge solving failed. ClipBoost could not load the current JavaScript solver. Check your internet connection and retry.');
    return new Error(raw);
  }
  
  function ytDlpBaseArgs(meta, cfg, browser=null) {
    const source=meta.externalSource||{};
    const outputTemplate = path.join(uploadsDir, `${meta.id}.%(ext)s`);
    const format = `bv*[height<=${cfg.maxHeight}]+ba/b[height<=${cfg.maxHeight}]/b`;
    const args = [
      '-m','yt_dlp',
      '--no-playlist',
      '--newline',
      '--progress',
      '--no-warnings',
      '-f', format,
      '--merge-output-format','mp4',
      '-o', outputTemplate
    ];
    if (cfg.ffmpeg) args.push('--ffmpeg-location', path.dirname(cfg.ffmpeg));
    if (source.platform === 'youtube' && cfg.node) {
      args.push('--js-runtimes', `node:${cfg.node}`);
      args.push('--remote-components', 'ejs:github');
    }
    if (source.platform === 'youtube' && browser) args.push('--cookies-from-browser', browser);
    args.push(source.url);
    return args;
  }
  
  async function runYtDlpDownload(projectId, meta, cfg, browser=null) {
    const args=ytDlpBaseArgs(meta,cfg,browser);
    return new Promise((resolve, reject) => {
      const proc = spawn(cfg.python, args, { cwd: root, windowsHide: true, env: process.env });
      registerProjectProcess(proc);
      let stderr = '';
      let stdout = '';
      let lastWrite = 0;
      let lastProgress = 3;
      let lastActivity=Date.now();
      let settled=false;
      const stallMs=3*60*1000;
      const watchdog=setInterval(()=>{
        if(settled)return;
        if(Date.now()-lastActivity<stallMs)return;
        settled=true;
        clearInterval(watchdog);
        try{proc.kill('SIGKILL')}catch{}
        reject(new Error('Download stalled for 3 minutes without output. Check the campaign source link, connection or source permissions, then retry.'));
      },10_000);
      const finish=(error,result)=>{if(settled)return;settled=true;clearInterval(watchdog);if(error)reject(error);else resolve(result)};
      const consume = chunk => {
        lastActivity=Date.now();
        const text = chunk.toString();
        stdout += text;
        const match = text.match(/\[download\]\s+([0-9.]+)%/);
        if (match) {
          const raw = Number(match[1]);
          if (Number.isFinite(raw)) lastProgress = Math.max(4, Math.min(88, Math.round(4 + raw * 0.84)));
        }
        const now = Date.now();
        if (now - lastWrite > 900) {
          lastWrite = now;
          readMeta(projectId).then(current => {
            current.status = 'ingesting';
            current.ingestion = { ...(current.ingestion || {}), stage: browser ? `downloading-auth-${browser}` : 'downloading', progress: lastProgress, engine: 'yt-dlp', error: null };
            current.updatedAt = new Date().toISOString();
            return writeMeta(current);
          }).catch(() => {});
        }
      };
      proc.stdout?.on('data', consume);
      proc.stderr?.on('data', d => { stderr += d.toString(); consume(d); });
      proc.on('error',error=>finish(error));
      proc.on('close',code=>finish(code===0?null:new Error(stderr.trim() || stdout.trim() || `yt-dlp exited with code ${code}`),{stdout,stderr}));
    });
  }
  
  async function findDownloadedProjectFile(projectId) {
    const entries = await fs.readdir(uploadsDir, { withFileTypes: true }).catch(() => []);
    const candidates = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.startsWith(`${projectId}.`)) continue;
      if (/\.(part|ytdl|json|jpg|jpeg|webp|png)$/i.test(entry.name)) continue;
      const full = path.join(uploadsDir, entry.name);
      try {
        const stat = await fs.stat(full);
        candidates.push({ full, name: entry.name, size: stat.size, mtime: stat.mtimeMs });
      } catch {}
    }
    candidates.sort((a,b) => b.size - a.size || b.mtime - a.mtime);
    return candidates[0] || null;
  }
  
  async function patchProject(projectId, patch = {}) {
    const meta = await readMeta(projectId);
    Object.assign(meta, patch, { updatedAt: new Date().toISOString() });
    await writeMeta(meta);
    return meta;
  }
  
  async function downloadExternalSource(projectId) {
    const meta = await readMeta(projectId);
    const source = meta.externalSource;
    if (!source?.url) throw new Error('This project does not have a downloadable source URL.');
    if (meta.sourcePath && fsSync.existsSync(meta.sourcePath)) return meta;
  
    await validatePublicHttpUrl(source.url);
    const cfg = externalIngestionConfig();
    meta.status = 'ingesting';
    meta.ingestion = { stage: 'starting', progress: 3, engine: 'yt-dlp', startedAt: new Date().toISOString(), error: null };
    await writeMeta(meta);
  
    let lastError=null;
    if (source.platform === 'youtube') {
      try {
        await runYtDlpDownload(projectId, meta, cfg, null);
      } catch (err) {
        lastError=err;
        if (!isYoutubeUnavailableError(err?.message) && isYoutubeRetryableAuthError(err?.message)) {
          for (const browser of youtubeBrowserAttempts(cfg.youtubeAuthBrowser)) {
            try {
              const current=await readMeta(projectId);
              current.ingestion={...(current.ingestion||{}),stage:`auth-retry-${browser}`,progress:Math.max(3,Number(current.ingestion?.progress||3)),engine:'yt-dlp',error:null};
              await writeMeta(current);
              await runYtDlpDownload(projectId, meta, cfg, browser);
              lastError=null;
              break;
            } catch (authErr) {
              lastError=authErr;
              if (isYoutubeUnavailableError(authErr?.message)) break;
            }
          }
        }
      }
      if (lastError) throw friendlyIngestError(lastError,cfg.youtubeAuthBrowser);
    } else {
      try { await runYtDlpDownload(projectId, meta, cfg, null); }
      catch(err){ throw friendlyIngestError(err,cfg.youtubeAuthBrowser); }
    }
  
    const downloaded = await findDownloadedProjectFile(projectId);
    if (!downloaded) throw new Error('The source downloader finished but no video file was produced.');
    const details = await probe(downloaded.full);
    const current = await readMeta(projectId);
    current.filename = downloaded.name;
    current.sourcePath = downloaded.full;
    current.sourceUrl = `/media/uploads/${encodeURIComponent(downloaded.name)}`;
    current.details = details;
    current.status = 'uploaded';
    current.ingestion = { ...(current.ingestion || {}), stage: 'downloaded', progress: 92, engine: 'yt-dlp', completedAt: new Date().toISOString(), error: null };
    current.updatedAt = new Date().toISOString();
    await writeMeta(current);
    return current;
  }
  
  async function startExternalIngestion(projectId) {
    return withProjectTask(projectId, async () => {
      try {
        await downloadExternalSource(projectId);
        const current = await readMeta(projectId);
        current.status = 'analyzing';
        current.ingestion = { ...(current.ingestion || {}), stage: 'downloaded', progress: 100, error: null };
        current.updatedAt = new Date().toISOString();
        await writeMeta(current);
        await analyzeProject(projectId);
      } catch (err) {
        try {
          const current = await readMeta(projectId);
          current.status = current.sourcePath ? 'uploaded' : 'linked';
          current.ingestion = {
            ...(current.ingestion || {}),
            stage: err?.code === 'PROJECT_DELETED' ? 'cancelled' : 'error',
            progress: Number(current.ingestion?.progress || 0),
            error: err?.code === 'PROJECT_DELETED' ? null : (err?.message || 'Automatic source ingestion failed.')
          };
          current.updatedAt = new Date().toISOString();
          await writeMeta(current);
        } catch {}
        if (err?.code !== 'PROJECT_DELETED') console.error('External ingestion failed:', err);
      }
    });
  }

  return {
    startExternalIngestion,
    downloadExternalSource,
    externalIngestionConfig
  };
}
