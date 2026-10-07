import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import crypto from 'crypto';
import os from 'os';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { AsyncLocalStorage } from 'async_hooks';
import { createAppStorage, writeJsonAtomic } from './storage/index.js';
import { registerCampaignRoutes } from './campaigns/routes.js';
import { registerLibraryRoutes } from './library/routes.js';
import { registerProjectRoutes } from './projects/routes.js';
import { registerVideoIngestRoutes } from './video/ingest-routes.js';
import { registerVideoRoutes } from './video/routes.js';
import { campaignTotals, campaignFitForCandidate } from './campaigns/core.js';



import { localAiConfig, unloadOllamaModelIfLoaded, ollamaGenerateJson } from './ai/ollama.js';
import { parseSilences, parseScenes } from './video/analysis.js';
import { renderDimensions } from './video/format.js';
import { compactCaptionRows } from './video/captions.js';
import { SETTINGS_KEYS, createSettingsEnv, maskSecret } from './settings/env.js';
import { createRuntimeTools } from './runtime/tools.js';
import { createExternalIngestion } from './integrations/ytdlp.js';
import { createTranscriptionEngine } from './ai/transcription.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const storageRoot = process.env.CLIPBOOST_DATA_DIR ? path.resolve(process.env.CLIPBOOST_DATA_DIR) : path.join(root, 'storage');
const uploadsDir = path.join(storageRoot, 'uploads');
const metaDir = path.join(storageRoot, 'meta');
const exportsDir = process.env.CLIPBOOST_EXPORT_DIR ? path.resolve(process.env.CLIPBOOST_EXPORT_DIR) : path.join(storageRoot, 'exports');
const previewsDir = path.join(storageRoot, 'previews');
const trackingDir = path.join(storageRoot, 'tracking');
const watermarksDir = path.join(storageRoot, 'watermarks');
for (const dir of [uploadsDir, metaDir, exportsDir, previewsDir, trackingDir, watermarksDir]) fsSync.mkdirSync(dir, { recursive: true });

// Project task lifecycle.
// Keep processing tied to the project that started it so a stuck/obsolete job can
// be stopped safely from Projects without leaving yt-dlp/FFmpeg/Python behind.
const projectTaskContext = new AsyncLocalStorage();
const activeProjectTasks = new Set();
const activeProjectProcesses = new Map();
const activeRuntimeProcesses = new Set();
const deletedProjectIds = new Set();

function processingStatus(value='') {
  return ['ingesting','analyzing'].includes(String(value || ''));
}
function registerProjectProcess(child) {
  if (!child) return;
  activeRuntimeProcesses.add(child);
  const projectId = projectTaskContext.getStore()?.projectId;
  if (projectId) {
    let set = activeProjectProcesses.get(projectId);
    if (!set) { set = new Set(); activeProjectProcesses.set(projectId, set); }
    set.add(child);
  }
  const cleanup = () => {
    activeRuntimeProcesses.delete(child);
    if (!projectId) return;
    const current = activeProjectProcesses.get(projectId);
    current?.delete(child);
    if (current && !current.size) activeProjectProcesses.delete(projectId);
  };
  child.once('close', cleanup);
  child.once('error', cleanup);
}
function stopChildProcess(child) {
  if (!child || child.exitCode !== null || child.killed) return;
  try {
    if (process.platform === 'win32' && child.pid) {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide:true });
      killer.on('error', () => { try { child.kill('SIGKILL'); } catch {} });
    } else {
      child.kill('SIGKILL');
    }
  } catch { try { child.kill('SIGKILL'); } catch {} }
}
function stopProjectProcesses(projectId) {
  const set = activeProjectProcesses.get(projectId);
  if (!set) return 0;
  const children = [...set];
  for (const child of children) stopChildProcess(child);
  return children.length;
}
function stopAllRuntimeProcesses() {
  const children = [...activeRuntimeProcesses];
  for (const child of children) stopChildProcess(child);
  return children.length;
}
function runtimeBusy() {
  return activeProjectTasks.size > 0 || activeRuntimeProcesses.size > 0;
}
async function withProjectTask(projectId, fn) {
  const id = String(projectId || '');
  if (!id) return await fn();
  deletedProjectIds.delete(id);
  activeProjectTasks.add(id);
  try { return await projectTaskContext.run({ projectId:id }, fn); }
  finally { activeProjectTasks.delete(id); }
}
function projectTaskIsActive(projectId) {
  return activeProjectTasks.has(String(projectId || ''));
}
function interruptedProcessing(meta, graceMs = 20_000) {
  if (!meta || !processingStatus(meta.status) || projectTaskIsActive(meta.id)) return false;
  const stamp = new Date(meta.updatedAt || meta.createdAt || 0).getTime();
  return Number.isFinite(stamp) && stamp > 0 && (Date.now() - stamp) > graceMs;
}
async function recoverInterruptedProject(meta) {
  if (!interruptedProcessing(meta)) return { meta, recovered:false };
  const recovered = { ...meta };
  recovered.status = recovered.sourcePath && fsSync.existsSync(recovered.sourcePath) ? 'uploaded' : 'linked';
  recovered.updatedAt = new Date().toISOString();
  recovered.processingInterruptedAt = recovered.updatedAt;
  recovered.analysis = {
    ...(recovered.analysis || {}),
    stage:'interrupted',
    progress:Number(recovered.analysis?.progress || 0),
    interrupted:true,
    error:'The previous processing job stopped unexpectedly. Retry analysis or delete the project.'
  };
  recovered.ingestion = {
    ...(recovered.ingestion || {}),
    stage: recovered.sourcePath ? (recovered.ingestion?.stage || 'downloaded') : 'interrupted',
    error: recovered.sourcePath ? (recovered.ingestion?.error || null) : 'The previous source download stopped unexpectedly. Retry automatic ingest.'
  };
  await writeMeta(recovered);
  return { meta:recovered, recovered:true };
}

const dataDir = storageRoot;
const {
  readLibrary,
  writeLibrary,
  readCampaigns,
  updateCampaigns,
  readPlatformProfiles,
  updatePlatformProfiles
} = createAppStorage(storageRoot);

const { settingsEnvPath, readSettingsEnv, writeSettingsEnv } = createSettingsEnv(root);

const { windowsTools, runtimeCommand } = createRuntimeTools(root);

const app = express();

app.use(express.json({ limit: '2mb' }));
app.use('/media', express.static(storageRoot, { acceptRanges: true }));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, uploadsDir),
    filename: (_, file, cb) => {
      const id = crypto.randomUUID();
      const ext = path.extname(file.originalname || '.mp4').toLowerCase() || '.mp4';
      cb(null, `${id}${ext}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if ((file.mimetype || '').startsWith('video/')) cb(null, true);
    else cb(new Error('Only video files are supported.'));
  }
});

const watermarkUpload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, watermarksDir),
    filename: (_, file, cb) => {
      const ext = ({'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp'})[String(file.mimetype||'').toLowerCase()] || '.png';
      cb(null, `${crypto.randomUUID()}${ext}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (['image/png','image/jpeg','image/webp'].includes(String(file.mimetype||'').toLowerCase())) cb(null, true);
    else cb(new Error('Watermark must be a PNG, JPG, or WebP image.'));
  }
});

app.post('/api/watermarks', watermarkUpload.single('watermark'), (req,res) => {
  if (!req.file) return res.status(400).json({error:'Watermark image is required.'});
  res.json({
    url: `/media/watermarks/${req.file.filename}`,
    filename: req.file.filename,
    originalName: req.file.originalname || 'watermark'
  });
});

function run(command, args, { timeout = 15 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    const executable = runtimeCommand(command);
    const proc = spawn(executable, args, { windowsHide: true, env: process.env });
    registerProjectProcess(proc);
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`${command} timed out`));
    }, timeout);
    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('error', err => { clearTimeout(timer); reject(err); });
    proc.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited with code ${code}\n${stderr.slice(-3000)}`));
    });
  });
}


const { startExternalIngestion } = createExternalIngestion({ root, uploadsDir, windowsTools, registerProjectProcess, readMeta, writeMeta, probe, withProjectTask, analyzeProject });

async function probe(file) {
  const { stdout } = await run('ffprobe', [
    '-v','quiet','-print_format','json','-show_format','-show_streams', file
  ], { timeout: 60_000 });
  const data = JSON.parse(stdout);
  const video = data.streams.find(s => s.codec_type === 'video') || {};
  const audio = data.streams.find(s => s.codec_type === 'audio') || {};
  const duration = Number(data.format?.duration || video.duration || 0);
  const fpsParts = String(video.avg_frame_rate || '0/1').split('/').map(Number);
  const fps = fpsParts[1] ? fpsParts[0] / fpsParts[1] : 0;
  return {
    duration,
    width: video.width || 0,
    height: video.height || 0,
    fps: Math.round(fps * 100) / 100,
    videoCodec: video.codec_name || null,
    audioCodec: audio.codec_name || null,
    size: Number(data.format?.size || 0),
    bitrate: Number(data.format?.bit_rate || 0)
  };
}

async function readMeta(id) {
  const file = path.join(metaDir, `${id}.json`);
  return JSON.parse(await fs.readFile(file, 'utf8'));
}
async function writeMeta(meta) {
  if (deletedProjectIds.has(String(meta?.id || ''))) {
    const error = Object.assign(new Error('Project was deleted while processing.'), { code:'PROJECT_DELETED', status:410 });
    throw error;
  }
  await writeJsonAtomic(path.join(metaDir, `${meta.id}.json`), meta);
}




registerCampaignRoutes(app, { readCampaigns, readPlatformProfiles, updateCampaigns, updatePlatformProfiles, writeMeta, metaDir });

app.get('/api/runtime/status', (req,res) => {
  res.json({ ok:true, busy:runtimeBusy(), activeTasks:activeProjectTasks.size, activeProcesses:activeRuntimeProcesses.size });
});
app.post('/api/runtime/idle', async (req,res) => {
  if (runtimeBusy()) return res.json({ ok:true, busy:true, activeTasks:activeProjectTasks.size, activeProcesses:activeRuntimeProcesses.size, action:'kept-running' });
  const ollama = await unloadOllamaModelIfLoaded();
  res.json({ ok:true, busy:false, ollama, action:'eco-idle' });
});
app.post('/api/runtime/shutdown', async (req,res) => {
  const stopped = stopAllRuntimeProcesses();
  const ollama = await unloadOllamaModelIfLoaded();
  res.json({ ok:true, stoppedProcesses:stopped, ollama, action:'shutdown' });
});

app.get('/api/settings', async (req,res,next) => {
  try {
    const env = await readSettingsEnv();
    res.json({
      values: {
        YOUTUBE_API_KEY: maskSecret(env.YOUTUBE_API_KEY),
        TWITCH_CLIENT_ID: env.TWITCH_CLIENT_ID || '',
        TWITCH_CLIENT_SECRET: maskSecret(env.TWITCH_CLIENT_SECRET),
        PYTHON_BIN: env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3'),
        LOCAL_WHISPER_MODEL: env.LOCAL_WHISPER_MODEL || 'small',
        LOCAL_WHISPER_DEVICE: env.LOCAL_WHISPER_DEVICE || 'cpu',
        LOCAL_WHISPER_COMPUTE_TYPE: env.LOCAL_WHISPER_COMPUTE_TYPE || 'int8',
        LOCAL_WHISPER_CHUNK_SECONDS: env.LOCAL_WHISPER_CHUNK_SECONDS || '120',
        LOCAL_WHISPER_WORKERS: env.LOCAL_WHISPER_WORKERS || 'auto',
        LOCAL_WHISPER_CPU_THREADS: env.LOCAL_WHISPER_CPU_THREADS || '0',
        LOCAL_WHISPER_SKIP_SILENCE: (env.LOCAL_WHISPER_SKIP_SILENCE || 'true') !== 'false',
        OLLAMA_URL: env.OLLAMA_URL || 'http://127.0.0.1:11434',
        OLLAMA_MODEL: env.OLLAMA_MODEL || 'qwen2.5:3b',
        CLIPBOOST_EXPORT_DIR: env.CLIPBOOST_EXPORT_DIR || exportsDir,
        CLIPBOOST_UPDATE_OWNER: env.CLIPBOOST_UPDATE_OWNER || 'OGC112',
        CLIPBOOST_UPDATE_REPO: env.CLIPBOOST_UPDATE_REPO || 'clipboost',
        YOUTUBE_AUTH_BROWSER: env.YOUTUBE_AUTH_BROWSER || 'firefox'
      },
      configured: {
        youtube: Boolean(env.YOUTUBE_API_KEY), twitch: Boolean(env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET)
      }
    });
  } catch(e) { next(e); }
});
app.post('/api/settings', async (req,res,next) => {
  try {
    const body = req.body || {};
    const current = await readSettingsEnv();
    const next = {};
    for (const key of SETTINGS_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(body,key)) continue;
      let value = body[key];
      if (typeof value === 'boolean') value = value ? 'true' : 'false';
      value = String(value ?? '').trim();
      if ((key === 'YOUTUBE_API_KEY' || key === 'TWITCH_CLIENT_SECRET') && value.includes('••')) continue;
      next[key] = value;
    }
    const saved = await writeSettingsEnv(next);
    res.json({ ok:true, restartRecommended: Object.keys(next).some(k => ['PYTHON_BIN','LOCAL_WHISPER_DEVICE','LOCAL_WHISPER_COMPUTE_TYPE','CLIPBOOST_EXPORT_DIR'].includes(k)), configured:{ youtube:Boolean(saved.YOUTUBE_API_KEY), twitch:Boolean(saved.TWITCH_CLIENT_ID && saved.TWITCH_CLIENT_SECRET) } });
  } catch(e) { next(e); }
});

app.get('/api/integrations/status', (req, res) => {
  res.json({ youtube: { configured: Boolean(String(process.env.YOUTUBE_API_KEY || '').trim()) }, twitch: { configured: Boolean(String(process.env.TWITCH_CLIENT_ID || '').trim() && String(process.env.TWITCH_CLIENT_SECRET || '').trim()) }, localAI: { configured: true, whisperModel: String(process.env.LOCAL_WHISPER_MODEL || 'small'), ollamaModel: String(process.env.OLLAMA_MODEL || 'qwen2.5:3b') } });
});

app.get('/api/system/health', async (req,res) => {
  const python = String(process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3')).trim();
  const ollamaUrl = String(process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/,'');
  const result = {
    checkedAt: new Date().toISOString(),
    ffmpeg: { ok:false, detail:'Not found' },
    ffprobe: { ok:false, detail:'Not found' },
    node: { ok:false, detail:'Not found' },
    ytDlp: { ok:false, detail:'Not found' },
    python: { ok:false, detail:python },
    whisper: { ok:false, detail:'faster-whisper not checked' },
    tracking: { ok:false, detail:'OpenCV face tracking' },
    ollama: { ok:false, detail:String(process.env.OLLAMA_MODEL || 'qwen2.5:3b') },
    youtube: { ok:Boolean(String(process.env.YOUTUBE_API_KEY || '').trim()), detail:'API key' },
    twitch: { ok:Boolean(String(process.env.TWITCH_CLIENT_ID || '').trim() && String(process.env.TWITCH_CLIENT_SECRET || '').trim()), detail:'Client credentials' },
    paths: { data: dataDir, exports: exportsDir }
  };
  await Promise.all([
    run('ffmpeg',['-version'],{timeout:8000}).then(x=>{result.ffmpeg={ok:true,detail:(x.stdout||x.stderr).split(/\r?\n/)[0]||'Available'}}).catch(()=>{}),
    run('ffprobe',['-version'],{timeout:8000}).then(x=>{result.ffprobe={ok:true,detail:(x.stdout||x.stderr).split(/\r?\n/)[0]||'Available'}}).catch(()=>{}),
    run(windowsTools.node || 'node',['--version'],{timeout:8000}).then(x=>{result.node={ok:true,detail:`Node ${(x.stdout||x.stderr).trim()} · EJS runtime`}}).catch(()=>{}),
    run(python,['-m','yt_dlp','--version'],{timeout:8000}).then(x=>{result.ytDlp={ok:true,detail:`yt-dlp ${(x.stdout||x.stderr).trim()} · auth ${String(process.env.YOUTUBE_AUTH_BROWSER||'firefox')}`}}).catch(()=>{}),
    run(python,['--version'],{timeout:8000}).then(x=>{result.python={ok:true,detail:(x.stdout||x.stderr).trim()||python}}).catch(()=>{}),
    run(python,['-c','import faster_whisper; print(getattr(faster_whisper,"__version__","ready"))'],{timeout:8000}).then(x=>{result.whisper={ok:true,detail:`faster-whisper ${String(x.stdout||x.stderr).trim()} ready`}}).catch(()=>{}),
    run(python,['-c','import cv2; print(cv2.__version__)'],{timeout:8000}).then(x=>{result.tracking={ok:true,detail:`OpenCV ${String(x.stdout||x.stderr).trim()} ready`}}).catch(()=>{}),
    fetch(`${ollamaUrl}/api/tags`,{signal:AbortSignal.timeout(3500)}).then(r=>r.ok?r.json():Promise.reject(new Error('offline'))).then(data=>{
      const names=(data.models||[]).map(m=>m.name).filter(Boolean);
      const wanted=String(process.env.OLLAMA_MODEL || 'qwen2.5:3b');
      result.ollama={ok:true,detail:names.includes(wanted)?`${wanted} ready`:`Ollama online · ${names.length} model${names.length===1?'':'s'}`};
    }).catch(()=>{})
  ]);
  res.json(result);
});

registerLibraryRoutes(app, { readLibrary, writeLibrary });

registerProjectRoutes(app, { readLibrary, writeMeta, readMeta, startExternalIngestion, metaDir, recoverInterruptedProject, projectTaskIsActive, stopProjectProcesses, deletedProjectIds, storageRoot, uploadsDir, previewsDir, trackingDir, processingStatus });

registerVideoIngestRoutes(app, { upload, readMeta, writeMeta, probe, run, uploadsDir });

function buildCandidates(duration, scenes, silences) {
  const points = [];
  scenes.forEach(t => points.push({ t, type: 'scene' }));
  silences.forEach(s => points.push({ t: s.end, type: 'silence' }));
  if (!points.length) {
    for (let i = 1; i <= 8; i++) points.push({ t: duration * i / 9, type: 'fallback' });
  }
  const scored = points.map((p, idx) => {
    const sceneDensity = scenes.filter(t => Math.abs(t - p.t) <= 18).length;
    const silenceBefore = silences.some(s => p.t - s.end >= 0 && p.t - s.end < 2.5);
    const centrality = duration ? 1 - Math.abs((p.t / duration) - .5) : 0;
    const score = Math.min(99, Math.round(58 + sceneDensity * 6 + (silenceBefore ? 12 : 0) + centrality * 8));
    return { ...p, idx, score, sceneDensity, silenceBefore };
  }).sort((a,b) => b.score - a.score);

  const selected = [];
  for (const p of scored) {
    const clipDuration = Math.max(18, Math.min(38, 22 + p.sceneDensity * 2));
    const start = Math.max(0, Math.min(duration - clipDuration, p.t - (p.silenceBefore ? 1.2 : 5.5)));
    const end = Math.min(duration, start + clipDuration);
    if (selected.some(s => Math.abs(s.start - start) < 14)) continue;
    const reason = p.silenceBefore
      ? 'Clean speech entry after a pause'
      : p.sceneDensity >= 3
        ? 'High visual activity and fast pacing'
        : 'Strong structural transition';
    selected.push({
      id: crypto.randomUUID(),
      start: Number(start.toFixed(2)), end: Number(end.toFixed(2)),
      duration: Number((end-start).toFixed(2)), score: p.score,
      reason, signals: { sceneDensity: p.sceneDensity, cleanEntry: p.silenceBefore }
    });
    if (selected.length >= 5) break;
  }
  while (selected.length < 5 && duration > 5) {
    const i = selected.length;
    const clipDuration = Math.min(28, duration);
    const start = Math.max(0, Math.min(duration - clipDuration, duration * (i + 1) / 6 - clipDuration / 2));
    selected.push({ id: crypto.randomUUID(), start, end: start + clipDuration, duration: clipDuration, score: 72-i*2, reason: 'Balanced fallback segment', signals: {} });
  }
  return selected;
}

async function makeThumbnail(sourcePath, id, candidate, index) {
  const dir = path.join(uploadsDir, id);
  await fs.mkdir(dir, { recursive: true });
  const out = path.join(dir, `candidate-${index}.jpg`);
  const at = Math.min(candidate.end - .2, candidate.start + Math.min(3, candidate.duration / 2));
  await run('ffmpeg', ['-y','-ss', String(Math.max(0, at)), '-i', sourcePath, '-frames:v','1','-vf','scale=720:-2','-q:v','3',out], { timeout: 90_000 });
  return `/media/uploads/${id}/candidate-${index}.jpg`;
}








const { wordLexeme, stripCaptionPunctuation, formatCaptionGroup, wordsToCaptions, transcriptBlocks, runJsonProcess, transcribeLocally } = createTranscriptionEngine({ root, uploadsDir, registerProjectProcess, readMeta, writeMeta });

function resolveClipTarget(durationSeconds = 0, preference = 'auto') {
  const explicit = Number(preference);
  if ([5, 10, 20].includes(explicit)) return explicit;
  const minutes = Math.max(0, Number(durationSeconds || 0)) / 60;
  if (minutes < 5) return 3;
  if (minutes < 15) return 5;
  if (minutes < 30) return 8;
  if (minutes < 60) return 12;
  if (minutes < 120) return 16;
  return 20;
}

function textTokens(value='') {
  return new Set(String(value).toLowerCase().replace(/[^a-z0-9à-ÿ\s]/gi,' ').split(/\s+/).filter(x=>x.length>3));
}
function textSimilarity(a='', b='') {
  const A=textTokens(a), B=textTokens(b); if(!A.size||!B.size) return 0;
  let both=0; for(const x of A) if(B.has(x)) both++;
  return both/Math.max(1, Math.min(A.size,B.size));
}
function overlapRatio(a,b) {
  const overlap=Math.max(0,Math.min(a.end,b.end)-Math.max(a.start,b.start));
  return overlap/Math.max(1,Math.min(a.end-a.start,b.end-b.start));
}
function clampScore(value, fallback=50) {
  const n=Number(value);
  return Math.max(0,Math.min(100,Math.round(Number.isFinite(n)?n:fallback)));
}

function clipCaptionsAbsolute(transcript,start,end,pad=0){
  return (transcript?.captions||[]).filter(c=>Number(c.end||0)>=start-pad&&Number(c.start||0)<=end+pad);
}

function clipTextAbsolute(transcript,start,end){
  return clipCaptionsAbsolute(transcript,start,end).map(c=>String(c.text||'')).join(' ').replace(/\s+/g,' ').trim();
}

function scoreHookText(text=''){
  const t=String(text||'').trim();
  let score=48;
  if(!t) return score;
  if(/[!?]/.test(t)) score+=10;
  if(/\b(pourquoi|comment|attends|regarde|incroyable|impossible|jamais|secret|problème|erreur|vraiment|imagine|voilà|why|how|wait|look|crazy|insane|impossible|never|secret|problem|mistake|imagine|here's)\b/i.test(t)) score+=16;
  if(/\b(mais|sauf que|le truc|la vérité|personne|tout le monde|but|except|the thing|truth|nobody|everyone)\b/i.test(t)) score+=7;
  const words=t.split(/\s+/).filter(Boolean).length;
  if(words>=4&&words<=18) score+=8;
  if(words>28) score-=8;
  return clampScore(score);
}

const WEAK_CLIP_STARTERS = new Set([
  'et','mais','donc','alors','puis','ensuite','parce','car','si','quand','lorsque',
  'and','but','so','then','because','if','when','while'
]);
const REFERENTIAL_CLIP_STARTERS = new Set([
  'il','elle','ils','elles','ça','cela','ceci','celui','celle','eux','lui','y','en',
  'he','she','they','it','this','that','these','those','him','her','them'
]);
const WEAK_CLIP_ENDERS = new Set([
  'et','mais','donc','alors','parce','car','avec','sans','pour','de','du','des','que','qui','comme',
  'and','but','so','then','because','with','without','for','of','that','which','like'
]);

function transcriptWordsInRange(transcript,start,end,pad=0){
  return (transcript?.words||[]).filter(w=>Number(w.end||0)>=start-pad&&Number(w.start||0)<=end+pad);
}

function speechPhraseUnits(transcript,maxSeconds=15){
  const words=(transcript?.words||[]).filter(w=>w?.word&&Number.isFinite(Number(w.start))&&Number.isFinite(Number(w.end)));
  if(!words.length)return [];
  const out=[];
  let group=[];
  let groupStart=null;
  const flush=(reason='pause')=>{
    if(!group.length)return;
    const last=group[group.length-1];
    out.push({
      start:Number(groupStart.toFixed(3)),
      end:Number(Number(last.end||groupStart).toFixed(3)),
      text:formatCaptionGroup(group,null,reason),
      terminal:/[.!?…]$/.test(String(last.word||'')),
      reason
    });
    group=[]; groupStart=null;
  };
  for(let i=0;i<words.length;i++){
    const w=words[i], next=words[i+1]||null;
    if(groupStart===null)groupStart=Number(w.start||0);
    group.push(w);
    const duration=Number(w.end||0)-groupStart;
    const gap=next?Math.max(0,Number(next.start||0)-Number(w.end||0)):9;
    const terminal=/[.!?…]$/.test(String(w.word||''));
    if(terminal)flush('terminal');
    else if(gap>=.62)flush('pause');
    else if(duration>=maxSeconds && gap>=.18)flush('length');
    else if(duration>=maxSeconds+4)flush('length');
  }
  flush('terminal');
  return out;
}

function speechBoundaryQuality(transcript,start,end){
  const all=(transcript?.words||[]).filter(w=>w?.word);
  const inside=[];
  for(let i=0;i<all.length;i++){
    const w=all[i];
    if(Number(w.end||0)>=start-.06&&Number(w.start||0)<=end+.06)inside.push({w,i});
  }
  if(!inside.length)return {start:45,end:45,payoff:45,completeness:45,startGap:0,endGap:0};
  const firstEntry=inside[0], lastEntry=inside[inside.length-1];
  const first=firstEntry.w, last=lastEntry.w;
  const prev=firstEntry.i>0?all[firstEntry.i-1]:null;
  const next=lastEntry.i<all.length-1?all[lastEntry.i+1]:null;
  const firstLex=wordLexeme(first.word);
  const secondLex=wordLexeme(inside[1]?.w?.word||'');
  const lastLex=wordLexeme(last.word);
  const startGap=prev?Math.max(0,Number(first.start||0)-Number(prev.end||0)):1.2;
  const endGap=next?Math.max(0,Number(next.start||0)-Number(last.end||0)):1.2;
  const opening=(inside.slice(0,8).map(x=>x.w.word).join(' '));
  const closing=(inside.slice(-12).map(x=>x.w.word).join(' '));

  let startScore=66;
  if(startGap>=.75)startScore+=20;
  else if(startGap>=.42)startScore+=12;
  else if(startGap<.12)startScore-=10;
  if(prev&&/[.!?…]$/.test(String(prev.word||'')))startScore+=12;
  if(WEAK_CLIP_STARTERS.has(firstLex))startScore-=14;
  if(REFERENTIAL_CLIP_STARTERS.has(firstLex)&&startGap<.55)startScore-=12;
  if((firstLex==='parce'&&secondLex==='que')||(firstLex==='because'))startScore-=16;
  if(scoreHookText(opening)>=76)startScore+=8;
  startScore=clampScore(startScore);

  let endScore=64;
  const terminal=/[.!?…]$/.test(String(last.word||''));
  if(terminal)endScore+=20;
  if(endGap>=.75)endScore+=18;
  else if(endGap>=.42)endScore+=10;
  else if(endGap<.12)endScore-=12;
  if(WEAK_CLIP_ENDERS.has(lastLex))endScore-=22;
  if(/\b(parce que|because|si|if|quand|when|mais|but|et|and)\s*$/i.test(closing.trim()))endScore-=18;
  endScore=clampScore(endScore);

  let payoff=48;
  if(/\b(donc|finalement|au final|résultat|résultat final|voilà|bref|c'est pourquoi|en fait|la réponse|so|finally|in the end|result|that's why|the answer|turns out)\b/i.test(closing))payoff+=24;
  if(/[!…]$/.test(String(last.word||'')))payoff+=8;
  if(terminal&&endGap>=.42)payoff+=10;
  if(WEAK_CLIP_ENDERS.has(lastLex))payoff-=18;
  payoff=clampScore(payoff);

  const completeness=clampScore(startScore*.42+endScore*.38+payoff*.20);
  return {start:startScore,end:endScore,payoff,completeness,startGap:Number(startGap.toFixed(3)),endGap:Number(endGap.toFixed(3))};
}


const CONTEXT_DEPENDENT_STARTERS = new Set([
  'oui','ouais','non','exactement','voilà','donc','alors','bref','enfin','et','mais','parce','car','puis','ensuite',
  'yes','yeah','no','exactly','right','okay','ok','so','then','and','but','because','well','anyway'
]);

function phraseFirstLexeme(unit){
  return wordLexeme(String(unit?.text||'').split(/\s+/).filter(Boolean)[0]||'');
}
function phraseLastLexeme(unit){
  const parts=String(unit?.text||'').split(/\s+/).filter(Boolean);
  return wordLexeme(parts[parts.length-1]||'');
}
function phraseGapBefore(units,index){
  if(index<=0)return 1.5;
  return Math.max(0,Number(units[index]?.start||0)-Number(units[index-1]?.end||0));
}
function phraseGapAfter(units,index){
  if(index>=units.length-1)return 1.5;
  return Math.max(0,Number(units[index+1]?.start||0)-Number(units[index]?.end||0));
}
function narrativeStartScore(units,index){
  const unit=units[index]; if(!unit)return 0;
  const first=phraseFirstLexeme(unit);
  const gap=phraseGapBefore(units,index);
  const prev=index>0?units[index-1]:null;
  let score=58;
  if(index===0)score+=20;
  if(gap>=.82)score+=22; else if(gap>=.45)score+=13; else if(gap<.14)score-=12;
  if(prev?.terminal)score+=14;
  if(unit.reason==='pause'||unit.reason==='terminal')score+=5;
  if(WEAK_CLIP_STARTERS.has(first))score-=20;
  if(REFERENTIAL_CLIP_STARTERS.has(first))score-=20;
  if(CONTEXT_DEPENDENT_STARTERS.has(first))score-=14;
  if(/^(c['’]?est|ça|cela|ceci|this|that|he|she|they|it)\b/i.test(String(unit.text||'').trim()))score-=10;
  const hook=scoreHookText(unit.text||'');
  score+=(hook-50)*.18;
  return clampScore(score);
}
function narrativeEndScore(units,index){
  const unit=units[index]; if(!unit)return 0;
  const last=phraseLastLexeme(unit);
  const gap=phraseGapAfter(units,index);
  const text=String(unit.text||'').trim();
  let score=55;
  if(unit.terminal)score+=20;
  if(gap>=.82)score+=20; else if(gap>=.45)score+=11; else if(gap<.14)score-=14;
  if(/\b(donc|finalement|au final|résultat|voilà|bref|c['’]?est pourquoi|la réponse|en conclusion|so|finally|in the end|result|that['’]?s why|the answer|turns out|bottom line)\b/i.test(text))score+=20;
  if(WEAK_CLIP_ENDERS.has(last))score-=28;
  if(/\b(parce que|because|si|if|quand|when|mais|but|et|and|donc|so)\s*$/i.test(text))score-=24;
  return clampScore(score);
}

function contextualWindowForMoment(transcript, hintedStart, hintedEnd, duration, coreStart=hintedStart, coreEnd=hintedEnd){
  const units=speechPhraseUnits(transcript);
  let a=Math.max(0,Number(hintedStart||0));
  let b=Math.min(duration,Math.max(a+3,Number(hintedEnd||a+28)));
  const coreA=Math.max(0,Number.isFinite(Number(coreStart))?Number(coreStart):a);
  const coreB=Math.min(duration,Math.max(coreA+.5,Number.isFinite(Number(coreEnd))?Number(coreEnd):b));
  if(!units.length)return {start:a,end:b,contextScore:0,payoffScore:0,expanded:false};

  const coreMid=(coreA+coreB)/2;
  const startMin=Math.max(0,Math.min(a,coreA)-14);
  const startMax=Math.min(coreMid,Math.min(a,coreA)+4.5);
  const endMin=Math.max(coreMid,Math.max(b,coreB)-4.5);
  const endMax=Math.min(duration,Math.max(b,coreB)+16);
  const startIndexes=[];
  const endIndexes=[];
  for(let i=0;i<units.length;i++){
    const u=units[i];
    if(Number(u.start)>=startMin&&Number(u.start)<=startMax)startIndexes.push(i);
    if(Number(u.end)>=endMin&&Number(u.end)<=endMax)endIndexes.push(i);
  }
  if(!startIndexes.length){
    let idx=0; for(let i=0;i<units.length;i++){if(units[i].start<=a)idx=i;else break;} startIndexes.push(idx);
  }
  if(!endIndexes.length){
    let idx=units.length-1; for(let i=0;i<units.length;i++){if(units[i].end>=b){idx=i;break;}} endIndexes.push(idx);
  }

  let best=null;
  for(const si of startIndexes){
    for(const ei of endIndexes){
      if(ei<si)continue;
      const start=Number(units[si].start||0), end=Number(units[ei].end||0);
      const len=end-start;
      if(len<10||len>60)continue;
      if(start>coreA+1.2||end<coreB-1.2)continue;
      const startScore=narrativeStartScore(units,si);
      const endScore=narrativeEndScore(units,ei);
      const boundary=speechBoundaryQuality(transcript,start,end);
      let durationScore=74;
      if(len>=16&&len<=44)durationScore=96;
      else if(len>=12&&len<=52)durationScore=88;
      else if(len>55)durationScore=62;
      const setupDistance=Math.max(0,coreA-start);
      const tailDistance=Math.max(0,end-coreB);
      const excessPenalty=Math.max(0,setupDistance-10)*1.8+Math.max(0,tailDistance-12)*1.5;
      const rank=startScore*.23+endScore*.22+boundary.completeness*.23+boundary.payoff*.17+durationScore*.15-excessPenalty;
      if(!best||rank>best.rank)best={start,end,rank,startScore,endScore,boundary};
    }
  }
  if(!best)return {start:a,end:b,contextScore:0,payoffScore:0,expanded:false};
  return {
    start:Number(best.start.toFixed(2)),end:Number(best.end.toFixed(2)),
    contextScore:clampScore(best.startScore*.45+best.boundary.start*.55),
    payoffScore:clampScore(best.endScore*.42+best.boundary.payoff*.58),
    expanded:Math.abs(best.start-a)>.25||Math.abs(best.end-b)>.25
  };
}

function candidateQuality(meta, transcript, start, end, baseScore=70){
  const duration=Math.max(.1,end-start);
  const caps=clipCaptionsAbsolute(transcript,start,end);
  const first=caps.slice(0,2).map(c=>c.text).join(' ');
  const last=caps.slice(-2).map(c=>c.text).join(' ');
  const text=caps.map(c=>c.text).join(' ');
  const words=transcriptWordsInRange(transcript,start,end);
  const rawWords=(transcript?.rawWords||transcript?.words||[]).filter(w=>Number(w.end||0)>=start&&Number(w.start||0)<=end);
  const removed=(transcript?.cleanup?.removedRanges||[]).filter(r=>Number(r.end||0)>=start&&Number(r.start||0)<=end);
  const scenes=(meta?.analysis?.timeline?.scenes||[]).map(Number).filter(t=>Number.isFinite(t)&&t>start&&t<end);
  const boundary=speechBoundaryQuality(transcript,start,end);

  let hook=scoreHookText(first);
  if(boundary.start<55)hook-=10;
  hook=clampScore(hook);

  let story=48;
  if(caps.length>=3)story+=7;
  if(caps.length>=5)story+=5;
  story+=Math.round((boundary.completeness-50)*.34);
  if(boundary.end>=78)story+=7;
  if(boundary.payoff>=72)story+=10;
  if(duration>=20&&duration<=52)story+=8;
  if(duration<17)story-=12;
  if(duration>58)story-=10;
  story=clampScore(story);

  let emotion=48;
  const emph=(text.match(/[!?]/g)||[]).length;
  emotion+=Math.min(20,emph*5);
  if(/\b(rire|mdr|wow|wouah|incroyable|dingue|fou|choqué|surpris|énorme|crazy|insane|wow|laugh|shocked|amazing|huge|no way)\b/i.test(text))emotion+=15;
  emotion=clampScore(emotion);

  const wps=words.length/duration;
  let retention=54;
  if(wps>=1.7&&wps<=3.5)retention+=16;
  else if(wps<1.15)retention-=12;
  if(duration>=22&&duration<=45)retention+=9;
  if(caps.length>=4)retention+=5;
  if(scenes.length>=1&&scenes.length<=5)retention+=5;
  if(scenes.length>9)retention-=5;
  if(boundary.start>=72)retention+=5;
  if(boundary.end<52)retention-=9;
  retention=clampScore(retention);

  const removalRatio=removed.length/Math.max(1,rawWords.length);
  let cleanSpeech=92-Math.min(38,Math.round(removalRatio*220));
  if(rawWords.length<8)cleanSpeech-=7;
  cleanSpeech=clampScore(cleanSpeech);

  let visual=70;
  if(scenes.length>=1&&scenes.length<=4)visual+=6;
  if(scenes.length>8)visual-=5;
  visual=clampScore(visual);

  const completeness=boundary.completeness;
  const payoff=boundary.payoff;
  // Context Engine v3: completeness now matters as much as raw hook strength.
  const local=Math.round(hook*.17+story*.22+emotion*.07+retention*.16+cleanSpeech*.08+visual*.03+completeness*.19+payoff*.08);
  let overall=clampScore(local*.92+clampScore(baseScore,70)*.08);
  // Hard guardrails: no candidate can rank highly if a new viewer hears half a thought.
  if(boundary.start<58)overall=Math.min(overall,68);
  if(boundary.end<58)overall=Math.min(overall,67);
  if(boundary.completeness<60)overall=Math.min(overall,65);
  if(boundary.start<45||boundary.end<45)overall=Math.min(overall,60);
  return {hook,story,emotion,retention,cleanSpeech,visual,completeness,payoff,overall,boundary};
}

function snapCandidateToSpeech(transcript,start,end,duration,coreStart=start,coreEnd=end){
  let a=Math.max(0,Number(start||0)), b=Math.min(duration,Math.max(a+3,Number(end||a+28)));
  const contextual=contextualWindowForMoment(transcript,a,b,duration,coreStart,coreEnd);
  a=contextual.start; b=contextual.end;
  const units=speechPhraseUnits(transcript);
  if(!units.length)return {start:a,end:b,...contextual};

  // Final precision pass: boundaries must land on phrase edges, not arbitrary word timestamps.
  const startUnit=units.reduce((best,u)=>Math.abs(u.start-a)<Math.abs(best.start-a)?u:best,units[0]);
  const endUnit=units.reduce((best,u)=>Math.abs(u.end-b)<Math.abs(best.end-b)?u:best,units[0]);
  a=Math.max(0,Number(startUnit.start||a));
  b=Math.min(duration,Number(endUnit.end||b));
  if(b-a>60){
    const valid=units.filter(u=>u.end>a+10&&u.end<=a+60).sort((x,y)=>narrativeEndScore(units,units.indexOf(y))-narrativeEndScore(units,units.indexOf(x)));
    b=valid.length?Number(valid[0].end):a+60;
  }
  return {start:Number(a.toFixed(2)),end:Number(b.toFixed(2)),contextScore:contextual.contextScore,payoffScore:contextual.payoffScore,expanded:contextual.expanded};
}

function finalizeCandidate(meta,transcript,candidate={}){
  const duration=Number(meta?.details?.duration||candidate.end||0);
  const coreStart=Number(candidate.momentStart??candidate.coreStart??candidate.start??0);
  const coreEnd=Number(candidate.momentEnd??candidate.coreEnd??candidate.end??(coreStart+4));
  const snapped=snapCandidateToSpeech(transcript,Number(candidate.start||coreStart),Number(candidate.end||coreEnd),duration,coreStart,coreEnd);
  const quality=candidateQuality(meta,transcript,snapped.start,snapped.end,candidate.score||70);
  const caps=clipCaptionsAbsolute(transcript,snapped.start,snapped.end);
  const actualOpening=caps.slice(0,2).map(x=>x.text).join(' ').trim();
  const hook=actualOpening||String(candidate.hook||'').trim();
  const hookWindows=[];
  for(let i=0;i<Math.min(4,caps.length);i++){
    const text=caps.slice(i,Math.min(caps.length,i+2)).map(x=>x.text).join(' ').trim();
    if(!text)continue;
    const hs=scoreHookText(text);
    if(hs>=55)hookWindows.push({start:Number(caps[i].start.toFixed(3)),text:text.slice(0,180),score:hs,type:/\?/.test(text)?'question':/\d/.test(text)?'number':/\b(mais|sauf|vérité|jamais|but|except|truth|never)\b/i.test(text)?'contrast':'statement'});
  }
  hookWindows.sort((a,b)=>b.score-a.score);
  const hookOptions=hookWindows.filter((x,i,a)=>a.findIndex(y=>textSimilarity(y.text,x.text)>.82)===i).slice(0,3);
  const selectionText=clipTextAbsolute(transcript,snapped.start,snapped.end).slice(0,1800);
  const draft={...candidate,start:snapped.start,end:snapped.end,duration:Number((snapped.end-snapped.start).toFixed(2)),selectionText,hook:hook.slice(0,180),hookOptions};
  const campaignFit=campaignFitForCandidate(meta,draft,quality);
  const viewPotential=clampScore(Math.round(quality.hook*.24+quality.retention*.26+quality.emotion*.10+quality.completeness*.20+quality.payoff*.12+quality.cleanSpeech*.08));
  const combinedScore=campaignFit?clampScore(Math.round(quality.overall*.72+campaignFit.score*.28)):quality.overall;
  return {
    ...draft,
    score:combinedScore,
    baseScore:quality.overall,
    viewPotential,
    campaignFit,
    quality,
    narrative:{coreStart,coreEnd,contextScore:Number(snapped.contextScore||0),payoffScore:Number(snapped.payoffScore||0),expanded:Boolean(snapped.expanded)},
    qualityEngine:campaignFit?'v4-quality-campaign':'v4-quality'
  };
}

function adaptiveClipQualityFloor(input=[], duration=0){
  const scores=(input||[]).map(c=>Number(c?.score||0)).filter(Number.isFinite).sort((a,b)=>b-a);
  if(!scores.length) return 100;
  const top=scores[0];
  let absolute=Number(duration||0)>=45*60?76:Number(duration||0)>=15*60?75:74;
  if(top>=90) absolute=Math.max(absolute,80);
  else if(top>=85) absolute=Math.max(absolute,77);
  return Math.max(absolute,top-10);
}

function isStrongClipCandidate(c, floor=74){
  const q=c?.quality||{};
  const boundary=q.boundary||{};
  const score=Number(c?.score||0);
  if(score<floor) return false;
  // Visual/signal fallback when speech transcription is unavailable: require an unusually high score.
  if(!c?.quality) return score>=Math.max(82,floor);
  if(Number(q.completeness||0)<68) return false;
  if(Number(boundary.start??q.completeness??0)<66) return false;
  if(Number(boundary.end??q.completeness??0)<66) return false;
  if(Number(q.retention||0)<56) return false;
  if(Number(q.hook||0)<53 && Number(q.emotion||0)<70) return false;
  if(Number(q.payoff||0)<54 && Number(q.story||0)<65) return false;
  return true;
}

function selectDiverseCandidates(input=[], target=8, duration=0, preference='auto') {
  const cleaned=[...input].filter(c=>Number.isFinite(c.start)&&Number.isFinite(c.end)&&c.end>c.start+2)
    .sort((a,b)=>Number(b.score||0)-Number(a.score||0));
  const unique=[];
  for(const c of cleaned){
    const cText=c.selectionText||c.hook||c.title||'';
    const duplicate=unique.some(x=>{
      const xText=x.selectionText||x.hook||x.title||'';
      const sim=textSimilarity(xText,cText);
      if(overlapRatio(x,c)>.25)return true;
      if(sim>.60)return true;
      if(Math.abs(x.start-c.start)<55&&sim>.40)return true;
      return false;
    });
    if(duplicate)continue;
    unique.push(c);
  }

  // Auto means quality-only, never "fill N slots". Zero clips is valid when nothing is strong enough.
  if(String(preference||'auto').toLowerCase()==='auto'){
    const floor=adaptiveClipQualityFloor(unique,duration);
    const strong=unique.filter(c=>isStrongClipCandidate(c,floor));
    return strong.slice(0,Math.max(1,target)).sort((a,b)=>Number(b.score||0)-Number(a.score||0));
  }

  if(unique.length<=target) return unique;
  const bins=Math.min(target, Math.max(1, Math.ceil(Number(duration||0)/420)));
  const selected=[];
  for(let b=0;b<bins;b++){
    const lo=(duration*b)/bins, hi=(duration*(b+1))/bins;
    const inBin=unique.filter(c=>c.start>=lo&&c.start<hi&&!selected.includes(c));
    if(inBin.length) selected.push(inBin[0]);
  }
  for(const c of unique){ if(selected.length>=target) break; if(!selected.includes(c)) selected.push(c); }
  return selected.slice(0,target).sort((a,b)=>Number(b.score||0)-Number(a.score||0));
}

function heuristicTranscriptCandidates(meta, transcript, fallbackCandidates = [], preference = 'auto') {
  const duration = Number(meta.details?.duration || 0);
  const target = resolveClipTarget(duration, preference);
  const units=speechPhraseUnits(transcript);
  if(!units.length)return selectDiverseCandidates(fallbackCandidates.map(c=>finalizeCandidate(meta,transcript,c)),target,duration,preference);
  const seeds=[];
  const payoffPattern=/\b(donc|finalement|au final|résultat|voilà|bref|c'est pourquoi|la réponse|so|finally|in the end|result|that's why|the answer|turns out)\b/i;

  // Build one strong 18-60s window per plausible opener using cheap phrase-level signals first.
  // Expensive word-level scoring only runs after the candidate pool has been capped.
  for(let i=0;i<units.length;i++){
    const first=units[i];
    const opener=String(first.text||'');
    const firstLex=wordLexeme(opener.split(/\s+/)[0]||'');
    let openerRank=scoreHookText(opener);
    if(first.reason==='terminal'||first.reason==='pause')openerRank+=6;
    if(WEAK_CLIP_STARTERS.has(firstLex))openerRank-=12;
    if(openerRank<50)continue;

    let best=null;
    for(let j=i;j<Math.min(units.length,i+11);j++){
      const end=Number(units[j].end||first.end);
      const clipDuration=end-first.start;
      if(clipDuration<12)continue;
      if(clipDuration>60)break;
      const endingText=String(units[j].text||'');
      let endRank=58;
      if(units[j].terminal)endRank+=15;
      if(units[j].reason==='pause')endRank+=9;
      if(payoffPattern.test(endingText))endRank+=16;
      if(/[!…]$/.test(endingText.trim()))endRank+=5;
      if(clipDuration>=16&&clipDuration<=46)endRank+=8;
      if(clipDuration>55)endRank-=6;
      const lastLex=wordLexeme(endingText.split(/\s+/).filter(Boolean).slice(-1)[0]||'');
      if(WEAK_CLIP_ENDERS.has(lastLex))endRank-=18;
      const rank=openerRank*.54+endRank*.46;
      if(!best||rank>best.rank)best={start:first.start,end,rank};
    }
    if(best){
      seeds.push({
        id:crypto.randomUUID(),start:best.start,end:best.end,score:clampScore(best.rank),
        title:`Quality moment ${seeds.length+1}`,
        hook:opener.slice(0,160),
        reason:'Context Engine v3: complete setup, interesting moment and natural payoff',
        signals:{semantic:true,local:true,quality:true,boundaryAware:true}
      });
    }
  }

  // Keep the best openers plus a smaller timeline-spread sample so long videos stay diverse.
  const seedCap=Math.max(target*10,64);
  const ranked=[...seeds].sort((a,b)=>b.score-a.score);
  const strongest=ranked.slice(0,Math.min(ranked.length,Math.floor(seedCap*.72)));
  const remainder=ranked.filter(x=>!strongest.includes(x)).sort((a,b)=>a.start-b.start);
  const spread=[];
  const need=Math.max(0,seedCap-strongest.length);
  for(let k=0;k<need&&remainder.length;k++){
    const idx=Math.min(remainder.length-1,Math.floor((k+.5)*remainder.length/need));
    const pick=remainder[idx];
    if(pick&&!spread.includes(pick))spread.push(pick);
  }
  const sampled=[...strongest,...spread].slice(0,seedCap);
  const out=sampled.map(c=>finalizeCandidate(meta,transcript,c));
  const fallback=fallbackCandidates.map(c=>finalizeCandidate(meta,transcript,c));
  const diversified=selectDiverseCandidates(out,target,duration,preference);
  return diversified.length>=Math.min(3,target)?diversified:selectDiverseCandidates([...out,...fallback],target,duration,preference);
}


async function contextualFinalReviewLocal(meta, transcript, candidates=[], preference='auto'){
  const duration=Number(meta?.details?.duration||0);
  const units=speechPhraseUnits(transcript);
  if(!units.length||!candidates.length)return candidates;
  const pool=candidates.slice(0,Math.min(12,candidates.length));
  const sections=pool.map((c,index)=>{
    const nearby=units.filter(u=>u.end>=Math.max(0,c.start-10)&&u.start<=Math.min(duration,c.end+12));
    const lines=nearby.slice(0,28).map(u=>{
      const zone=u.end<c.start?'BEFORE':u.start>c.end?'AFTER':'CLIP';
      return `[${Number(u.start).toFixed(1)}-${Number(u.end).toFixed(1)}] ${zone}: ${String(u.text||'')}`;
    }).join('\n');
    return `CANDIDATE ${index} current=${Number(c.start).toFixed(1)}-${Number(c.end).toFixed(1)} score=${Number(c.score||0)}\n${lines}`;
  }).join('\n\n');
  const prompt=`You are the final ClipBoost context reviewer. Review each proposed short clip using the BEFORE and AFTER transcript around it.\n\nKEEP a clip only if:\n- a new viewer understands the subject from the first phrase without needing BEFORE\n- the interesting moment actually occurs inside CLIP\n- the payoff/conclusion happens before the end and is not sitting in AFTER\n- neither boundary cuts through a thought\n\nIf a candidate can be fixed, choose corrected start/end ONLY from the timestamped phrase boundaries shown. Maximum 60 seconds. Returning fewer clips is preferred over keeping incomplete clips.\n\nReturn ONLY JSON:\n{"reviews":[{"index":0,"keep":true,"start":0,"end":30,"score":86,"reason":"self-contained setup and payoff"}]}\n\n${sections}`;
  try{
    const parsed=await ollamaGenerateJson(prompt);
    const byIndex=new Map((parsed.reviews||[]).map(r=>[Number(r.index),r]));
    const out=[];
    for(let i=0;i<pool.length;i++){
      const c=pool[i], review=byIndex.get(i);
      if(!review){out.push(c);continue;}
      if(review.keep===false)continue;
      const start=Number.isFinite(Number(review.start))?Number(review.start):c.start;
      const end=Number.isFinite(Number(review.end))?Number(review.end):c.end;
      if(end<=start||end-start>60){out.push(c);continue;}
      const reviewed=finalizeCandidate(meta,transcript,{...c,start,end,score:clampScore(Number(c.score||0)*.62+Number(review.score||c.score||0)*.38),reason:String(review.reason||c.reason||''),signals:{...(c.signals||{}),contextReviewed:true}});
      out.push(reviewed);
    }
    return out;
  }catch{
    return candidates;
  }
}

function qualityRerankCandidates(meta, transcript, candidates=[]) {
  const words=(transcript?.words||[]).filter(w=>w?.word);
  const duration=Number(meta?.details?.duration||0);
  const questionWords=new Set(['why','how','what','when','where','who','which','pourquoi','comment','quoi','quand','où','qui','quel','quelle']);
  const powerWords=/\b(secret|mistake|problem|truth|never|always|best|worst|important|million|thousand|percent|because|result|finally|secret|erreur|problème|vérité|jamais|toujours|meilleur|pire|important|million|mille|pourcent|parce que|résultat|finalement)\b/i;
  const weakOpen=/^(and|but|so|then|because|it|that|this|he|she|they|et|mais|donc|alors|parce que|ça|cela|il|elle|ils|elles)\b/i;
  const terminal=/[.!?…][\"'’)]?$/;
  const clamp=n=>Math.max(0,Math.min(100,Math.round(n)));
  return candidates.map(c=>{
    const start=Number(c.start||0),end=Number(c.end||start);
    const inside=words.filter(w=>Number(w.end||0)>=start&&Number(w.start||0)<=end);
    if(!inside.length)return c;
    const first=inside.slice(0,Math.min(16,inside.length));
    const last=inside.slice(-Math.min(18,inside.length));
    const opening=first.map(w=>w.word).join(' ').trim();
    const closing=last.map(w=>w.word).join(' ').trim();
    const firstLex=wordLexeme(first[0]?.word||'');
    const clipDuration=Math.max(.1,end-start);
    const speechSpan=Math.max(.1,Number(inside[inside.length-1]?.end||end)-Number(inside[0]?.start||start));
    const wpm=inside.length/(speechSpan/60);
    let hook=52;
    if(questionWords.has(firstLex)||/[?]/.test(opening))hook+=16;
    if(powerWords.test(opening))hook+=14;
    if(/\d/.test(opening))hook+=8;
    if(opening.split(/\s+/).length>=5)hook+=5;
    if(weakOpen.test(opening))hook-=18;
    const entryGap=Math.abs(Number(first[0]?.start||start)-start);
    const exitGap=Math.abs(end-Number(last[last.length-1]?.end||end));
    let boundary=92-Math.min(30,entryGap*12)-Math.min(28,exitGap*10);
    if(Number(first[0]?.start||0)<start-.08)boundary-=18;
    let standalone=70;
    if(weakOpen.test(opening))standalone-=25;
    if(/^(yes|no|yeah|exactly|right|oui|non|ouais|exactement)\b/i.test(opening))standalone-=16;
    if(questionWords.has(firstLex))standalone+=8;
    let payoff=terminal.test(closing)?82:62;
    if(/\b(so|therefore|that's why|the result|in the end|donc|c'est pourquoi|résultat|au final|finalement)\b/i.test(closing))payoff+=10;
    if(exitGap<.12&&!terminal.test(closing))payoff-=12;
    let speech=78;
    if(wpm<90)speech-=12;
    else if(wpm>230)speech-=10;
    else if(wpm>=125&&wpm<=205)speech+=8;
    const prior=Number(c.score||70);
    const quality=clamp(hook*.25+standalone*.20+payoff*.20+boundary*.20+speech*.15);
    const finalScore=clamp(prior*.32+quality*.68);
    return {...c,score:finalScore,qualityScore:quality,qualityBreakdown:{hook:clamp(hook),standalone:clamp(standalone),payoff:clamp(payoff),boundary:clamp(boundary),speech:clamp(speech)},signals:{...(c.signals||{}),qualityEngineV2:true}};
  }).sort((a,b)=>Number(b.score||0)-Number(a.score||0));
}

async function semanticClipCandidatesLocal(meta, transcript, fallbackCandidates = [], preference = 'auto') {
  const blocks = transcriptBlocks(transcript.words || []);
  const duration = Number(meta.details?.duration || 0);
  const target = resolveClipTarget(duration, preference);
  if(duration>0&&duration<=30&&blocks.length){
    const full=finalizeCandidate(meta,transcript,{id:crypto.randomUUID(),start:0,end:duration,score:82,title:'Full short asset',hook:String(blocks[0]?.text||'').slice(0,160),reason:'Short Asset Mode: preserve the complete creative and optimize hook, captions and edit.',signals:{local:true,shortAsset:true,qualityEngineV2:true}});
    return qualityRerankCandidates(meta,transcript,[full]);
  }
  if (!blocks.length) return selectDiverseCandidates(fallbackCandidates.map(c=>finalizeCandidate(meta,transcript,c)), target, duration, preference);

  const sectionCount = duration > 20*60 ? Math.min(7, Math.max(2, Math.ceil(target/4))) : 1;
  const clips=[];
  const ollamaDiagnostics={attempts:0,successes:0,emptyResponses:0,errors:[]};
  for(let section=0; section<sectionCount; section++){
    const sectionStart=(duration*section)/sectionCount;
    const sectionEnd=(duration*(section+1))/sectionCount;
    const sectionBlocks=blocks.filter(b=>b.end>=sectionStart&&b.start<sectionEnd);
    if(!sectionBlocks.length) continue;
    const timedText=sectionBlocks.map(b=>`[${b.start.toFixed(1)}-${b.end.toFixed(1)}] ${b.text}`).join('\n');
    const inputText=timedText.length>38000?timedText.slice(0,38000):timedText;
    const ask=Math.min(7, Math.max(3, Math.ceil(target/sectionCount)+2));
    const campaignContext=meta?.campaign?.id?`\nCAMPAIGN MODE IS ACTIVE. Campaign: ${String(meta.campaign.name||'').slice(0,140)}. Brief: ${String(meta.campaign.brief||'').slice(0,3500)}. Required duration: ${Number(meta.campaign.minDuration||0)}-${Number(meta.campaign.maxDuration||60)} seconds. Favor moments directly relevant to this brief, but NEVER sacrifice context completeness or fabricate relevance. Avoid terms: ${(meta.campaign.forbiddenTerms||[]).join(', ')||'none'}. Previously used ranges in this project: ${(meta.campaign.usedMoments||[]).filter(m=>m.projectId===meta.id).map(m=>`${Number(m.start||0).toFixed(1)}-${Number(m.end||0).toFixed(1)}`).join(', ')||'none'}.\n`:'';
    const prompt=`You are ClipBoost Quality Engine v2, a short-form story editor. Analyze ONLY this timeline section. Your first job is to find genuinely interesting MOMENTS. Your second job is to identify enough setup before each moment and enough continuation after it so a new viewer understands the story and receives the payoff.${campaignContext}

Rules, in priority order:
1. FIND THE MOMENT: identify the exact statement, reveal, argument, joke, reaction, mistake, lesson or surprising action that makes the excerpt worth watching.
2. CONTEXT BEFORE VIRALITY: a viewer who has seen nothing earlier must understand what is happening. Never begin with an answer fragment, dangling pronoun, continuation word, or half of a sentence. If understanding requires 5-12 seconds of setup, include it.
3. COMPLETE PAYOFF: continue until the answer, result, punchline, reaction, conclusion or takeaway has actually landed. Never end because a target duration was reached.
4. NATURAL SPEECH EDGES: start and end on phrase boundaries shown by timestamps. Never cut a sentence in half.
5. NO FILLER CLIPS: reject moments that are mildly interesting but need too much missing context or never reach a payoff. Returning fewer clips is correct.
6. LENGTH: usually 12-50 seconds; maximum 60 seconds. Length is secondary to a complete thought.
7. DIVERSITY: one clip per distinct story/moment.

For each result, momentStart/momentEnd describe the core interesting moment. start/end describe your proposed complete story window. The deterministic Context Engine will refine those boundaries again.

Return ONLY JSON:
{"clips":[{"momentStart":12.0,"momentEnd":18.0,"start":7.0,"end":27.0,"score":88,"title":"Short title","hook":"Self-contained opening idea","reason":"What makes the moment interesting and where its payoff lands"}]}

Full video duration: ${duration.toFixed(1)} seconds.
Current section: ${sectionStart.toFixed(1)}-${sectionEnd.toFixed(1)} seconds.
Cleaned transcript:
${inputText}`;
    try{
      ollamaDiagnostics.attempts++;
      const parsed=await ollamaGenerateJson(prompt);
      ollamaDiagnostics.successes++;
      const parsedClips=Array.isArray(parsed?.clips)?parsed.clips:[];
      if(!parsedClips.length)ollamaDiagnostics.emptyResponses++;
      for(const c of parsedClips){
        const momentStart=Math.max(sectionStart,Math.min(sectionEnd,Number(c.momentStart??c.start??sectionStart)));
        const momentEnd=Math.max(momentStart+.5,Math.min(duration,sectionEnd+4,Number(c.momentEnd??c.end??momentStart+6)));
        const start=Math.max(sectionStart,Math.min(momentStart,Number(c.start??momentStart)));
        const end=Math.max(momentEnd,Math.min(duration,sectionEnd+12,Number(c.end??momentEnd+8)));
        clips.push(finalizeCandidate(meta,transcript,{ id:crypto.randomUUID(), momentStart, momentEnd, start, end, score:clampScore(c.score,70), title:String(c.title||`Local AI moment ${clips.length+1}`), hook:String(c.hook||''), reason:String(c.reason||'Selected by ClipBoost Quality Engine v2'), signals:{semantic:true,local:true,quality:true,boundaryAware:true,contextAware:true,section:section+1} }));
      }
    }catch(err){
      const message=String(err?.message||err||'Unknown Ollama error');
      ollamaDiagnostics.errors.push(message);
      // A failed model section should not discard deterministic Quality Engine candidates.
    }
  }
  meta.__ollamaDiagnostics=ollamaDiagnostics;
  const fallback=fallbackCandidates.map(c=>finalizeCandidate(meta,transcript,c));
  const heuristic=heuristicTranscriptCandidates(meta,transcript,[...clips,...fallback],preference);
  const qualityPool=qualityRerankCandidates(meta,transcript,[...clips,...heuristic,...fallback]);
  const preReview=selectDiverseCandidates(qualityPool,Math.max(10,target*2),duration,'review');
  const reviewed=await contextualFinalReviewLocal(meta,transcript,preReview,preference);
  const selected=selectDiverseCandidates(qualityRerankCandidates(meta,transcript,reviewed.length?reviewed:preReview),target,duration,preference);
  const semanticBeforeReview=clips.length;
  const semanticAfterReview=reviewed.filter(x=>x?.signals?.semantic).length;
  const semanticSelected=selected.filter(x=>x?.signals?.semantic).length;
  ollamaDiagnostics.semanticGenerated=semanticBeforeReview;
  ollamaDiagnostics.semanticAfterReview=semanticAfterReview;
  ollamaDiagnostics.semanticSelected=semanticSelected;
  ollamaDiagnostics.reviewRemovedSemantic=Math.max(0,semanticBeforeReview-semanticAfterReview);

  // Never leave an analyzed source with no selectable result. For short assets
  // the source itself is already the creative; for longer videos expose the
  // best deterministic/semantic moments as fallback choices so the user, not
  // the quality threshold, gets the final say.
  if(!selected.length){
    if(duration>0&&duration<=30){
      const full=finalizeCandidate(meta,transcript,{
        id:crypto.randomUUID(),start:0,end:duration,score:70,
        title:'Full short asset',hook:String(blocks[0]?.text||'').slice(0,160),
        reason:'Short Asset Mode: keep the complete source and optimize its edit.',
        signals:{local:true,qualityFallback:true,shortAsset:true}
      });
      ollamaDiagnostics.fallbackSelected=1;
      return [full];
    }
    const fallbackPool=[...clips,...heuristic,...fallback]
      .filter(c=>Number(c?.end||0)>Number(c?.start||0))
      .sort((a,b)=>Number(b.score||0)-Number(a.score||0));
    const fallbackTarget=Math.min(3,Math.max(2,resolveClipTarget(duration,'3')));
    const rescued=selectDiverseCandidates(fallbackPool,fallbackTarget,duration,'3').slice(0,3)
      .map((c,i)=>finalizeCandidate(meta,transcript,{...c,title:c.title||`Best available clip ${i+1}`,reason:c.reason||'Best available moment after the strong-clip quality filter returned no results.',signals:{...(c.signals||{}),qualityFallback:true}}));
    if(rescued.length){ollamaDiagnostics.fallbackSelected=rescued.length;return rescued}
  }
  return selected;
}

function captionsForRange(transcript, start, end) {
  return (transcript?.captions || []).filter(c => c.end >= start && c.start <= end).map(c => ({
    ...c,
    start: Math.max(0, c.start - start),
    end: Math.max(0.05, Math.min(end, c.end) - start)
  }));
}

function captionEnergyScore(text='') {
  const t=String(text||'').trim();
  if(!t)return 0;
  let score=0;
  if(/!/.test(t))score+=2.2;
  if(/\?/.test(t))score+=1.25;
  if(/\b(attends|regarde|incroyable|impossible|jamais|vraiment|wow|wouah|énorme|dingue|fou|choqué|pourquoi|comment|wait|look|crazy|insane|impossible|never|really|wow|huge|shocked|why|how|no way)\b/i.test(t))score+=2.3;
  if(t.split(/\s+/).length<=10)score+=.7;
  if(/[A-ZÀ-Ÿ]{3,}/.test(t))score+=.4;
  return score;
}

function buildEditPlan(candidate, transcript, silences = [], intensity = 'balanced', preset = 'dynamic', zoomStyle = 'natural') {
  const start = Number(candidate.start || 0);
  const end = Number(candidate.end || start + 30);
  const clipDuration = Math.max(0, end - start);
  const events = [];
  const style = ['dynamic','clean','gaming','podcast'].includes(String(preset||'').toLowerCase()) ? String(preset).toLowerCase() : 'dynamic';
  const zoomMode=['minimal','natural','energetic'].includes(String(zoomStyle||'').toLowerCase())?String(zoomStyle).toLowerCase():'natural';
  const silenceThreshold = style === 'gaming' ? 0.48 : style === 'clean' ? 0.95 : style === 'podcast' ? 0.80 : 0.62;
  const baseGap = style === 'gaming' ? 6.2 : style === 'podcast' ? 10.5 : style === 'clean' ? 99 : 8.2;
  const zoomGap = zoomMode === 'minimal' ? Math.max(12,baseGap) : zoomMode === 'energetic' ? Math.max(5,baseGap-1.7) : baseGap;
  const zoomBase = intensity === 'high' ? 1.095 : intensity === 'low' ? 1.045 : 1.065;
  const styleBoost = style === 'gaming' ? .012 : style === 'podcast' ? -.018 : 0;
  const modeBoost = zoomMode === 'energetic' ? .018 : zoomMode === 'minimal' ? -.012 : 0;
  const maxZoom = Math.max(1.025,Math.min(1.13,zoomBase+styleBoost+modeBoost));

  events.push({ type: 'reframe', start: 0, end: clipDuration, mode: style === 'podcast' ? 'speaker-safe' : 'center-subject', confidence: 0.76 });

  for (const s of silences) {
    const overlapStart = Math.max(start, Number(s.start || 0));
    const overlapEnd = Math.min(end, Number(s.end || 0));
    const dur = overlapEnd - overlapStart;
    if (dur >= silenceThreshold) events.push({ type: 'remove-silence', start: Number((overlapStart-start).toFixed(2)), end: Number((overlapEnd-start).toFixed(2)), duration: Number(dur.toFixed(2)) });
  }

  // Transcript cleanup is always planned, but only applied to audio when
  // cleanupMode === "speech". Captions use the cleaned transcript either way.
  for(const r of (transcript?.cleanup?.removedRanges||[])){
    const overlapStart=Math.max(start,Number(r.start||0));
    const overlapEnd=Math.min(end,Number(r.end||0));
    const dur=overlapEnd-overlapStart;
    if(dur>=.11 && dur<=2.8){
      events.push({
        type:'remove-disfluency',
        start:Number(Math.max(0,overlapStart-start-.015).toFixed(3)),
        end:Number(Math.min(clipDuration,overlapEnd-start+.02).toFixed(3)),
        reason:r.reason||'disfluency'
      });
    }
  }

  const caps = captionsForRange(transcript, start, end);
  let lastEmphasis = -99;

  // Only punch the opening when the actual hook is strong. No automatic zoom
  // merely because the clip started.
  const openingText=caps.filter(c=>Number(c.start||0)<4.5).slice(0,2).map(c=>c.text).join(' ');
  const openingHook=scoreHookText(openingText);
  if(style!=='clean' && zoomMode!=='minimal' && openingHook>=76 && clipDuration>3){
    events.push({
      type:'punch-in',
      start:.18,
      end:Number(Math.min(1.15,clipDuration).toFixed(2)),
      zoom:Number(Math.min(maxZoom,1.075+(intensity==='high'?.015:0)).toFixed(3)),
      reason:'Strong opening hook'
    });
    lastEmphasis=.18;
  }

  for (const cap of caps) {
    const energy=captionEnergyScore(cap.text);
    const threshold=zoomMode==='energetic'?3.0:zoomMode==='minimal'?4.9:3.7;
    if(style==='clean'||energy<threshold||cap.start-lastEmphasis<zoomGap)continue;
    const duration=Math.max(.72,Math.min(1.35,Number(cap.end||0)-Number(cap.start||0)+.32));
    const zoom=Math.min(maxZoom,maxZoom-.012+Math.min(.012,Math.max(0,energy-threshold)*.004));
    events.push({
      type:'dynamic-zoom',
      start:Number(Math.max(.12,cap.start-.10).toFixed(2)),
      end:Number(Math.min(clipDuration,cap.start+duration).toFixed(2)),
      zoom:Number(zoom.toFixed(3)),
      reason:'Meaningful speech emphasis',
      energy:Number(energy.toFixed(2))
    });
    lastEmphasis=cap.start;
  }

  // Protect the payoff: effects become quieter in the final seconds so the
  // conclusion lands cleanly instead of being covered by a mechanical zoom.
  const payoffZone=Math.max(0,clipDuration-3.2);
  for(let i=events.length-1;i>=0;i--){
    const e=events[i];
    if((e.type==='dynamic-zoom'||e.type==='punch-in')&&Number(e.start||0)>=payoffZone)events.splice(i,1);
  }
  const candidateQualityData=candidate?.qualityBreakdown||candidate?.quality||{};
  if(Number(candidateQualityData.hook||0)>=78&&clipDuration>5&&!events.some(e=>e.type==='punch-in')){
    events.push({type:'punch-in',start:.16,end:.95,zoom:Number(Math.min(maxZoom,1.065).toFixed(3)),reason:'Quality Engine hook emphasis'});
  }

  return {
    style: style[0].toUpperCase()+style.slice(1), intensity, zoomStyle:zoomMode,
    autoReframe: true, captions: true, silenceRemoval: true,
    events: events.sort((a,b)=>a.start-b.start),
    summary: {
      cuts: events.filter(e=>e.type==='remove-silence').length,
      disfluencies: events.filter(e=>e.type==='remove-disfluency').length,
      zooms: events.filter(e=>/zoom|punch/.test(e.type)).length,
      reframes: events.filter(e=>e.type==='reframe').length
    }
  };
}

function assTime(seconds) {
  const cs = Math.max(0, Math.round(Number(seconds || 0) * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(c).padStart(2,'0')}`;
}
function assEscape(text='') {
  return String(text).replace(/\\/g,'\\\\').replace(/\{/g,'\\{').replace(/\}/g,'\\}').replace(/\n/g,'\\N');
}
async function writeAssCaptions(meta, start, end) {
  const captions = captionsForRange(meta.transcript, start, end);
  if (!captions.length) return null;
  const file = path.join(exportsDir, `${meta.id}-${Date.now()}.ass`);
  const header = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 2\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: Default,Arial,72,&H00FFFFFF,&H0000FFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,5,2,2,70,70,310,1\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n`;
  const body = captions.map(c => `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${assEscape(stripCaptionPunctuation(c.text).toUpperCase())}`).join('\n');
  await fs.writeFile(file, header + body + '\n', 'utf8');
  return file;
}
function ffmpegFilterPath(file) {
  return path.resolve(file).replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}


function normalizeRenderOptions(raw = {}) {
  const intensity = ['low','balanced','high'].includes(String(raw.intensity || '').toLowerCase()) ? String(raw.intensity).toLowerCase() : 'balanced';
  const preset = ['dynamic','clean','gaming','podcast'].includes(String(raw.preset || '').toLowerCase()) ? String(raw.preset).toLowerCase() : 'dynamic';
  const captionStyle = ['bold','clean','neon','minimal','impact','pop','box','karaoke'].includes(String(raw.captionStyle || '').toLowerCase()) ? String(raw.captionStyle).toLowerCase() : 'bold';
  const captionPosition = ['top','center','bottom','custom'].includes(String(raw.captionPosition || '').toLowerCase()) ? String(raw.captionPosition).toLowerCase() : 'bottom';
  const rawCaptionY=Number(raw.captionY);
  const captionY=Number.isFinite(rawCaptionY)?Math.max(.12,Math.min(.88,rawCaptionY)):null;
  const captionSize = ['small','medium','large'].includes(String(raw.captionSize || '').toLowerCase()) ? String(raw.captionSize).toLowerCase() : 'medium';
  const captionScale = Math.max(.4,Math.min(2,Number.isFinite(Number(raw.captionScale))?Number(raw.captionScale):1));
  const captionColor = ['white','yellow','lime','cyan','pink','red','green','blue','purple','orange','black'].includes(String(raw.captionColor || '').toLowerCase()) ? String(raw.captionColor).toLowerCase() : 'white';
  const cleanupMode = ['off','captions','speech'].includes(String(raw.cleanupMode || '').toLowerCase()) ? String(raw.cleanupMode).toLowerCase() : 'captions';
  const zoomStyle = ['minimal','natural','energetic'].includes(String(raw.zoomStyle || '').toLowerCase()) ? String(raw.zoomStyle).toLowerCase() : 'natural';
  const trackingMode = ['auto','speaker','center','split'].includes(String(raw.trackingMode || '').toLowerCase()) ? String(raw.trackingMode).toLowerCase() : 'speaker';
  const cameraMovement = ['low','balanced','high'].includes(String(raw.cameraMovement || '').toLowerCase()) ? String(raw.cameraMovement).toLowerCase() : 'balanced';
  const outputFormat = String(raw.outputFormat||'shorts-9x16').toLowerCase()==='source' ? 'source' : 'shorts-9x16';
  const editorContext = String(raw.editorContext||'general').toLowerCase()==='campaign' ? 'campaign' : 'general';
  const sourceSubtitleMode = ['keep','crop','hide'].includes(String(raw.sourceSubtitleMode||'keep').toLowerCase()) ? String(raw.sourceSubtitleMode||'keep').toLowerCase() : 'keep';
  const sourceSubtitleBottom = Math.max(.06,Math.min(.28,Number.isFinite(Number(raw.sourceSubtitleBottom))?Number(raw.sourceSubtitleBottom):.15));
  const watermarkUrl = /^\/media\/watermarks\/[a-zA-Z0-9._-]+$/.test(String(raw.watermarkUrl||'')) ? String(raw.watermarkUrl) : '';
  const watermarkX = Math.max(0,Math.min(1,Number.isFinite(Number(raw.watermarkX))?Number(raw.watermarkX):.86));
  const watermarkY = Math.max(0,Math.min(1,Number.isFinite(Number(raw.watermarkY))?Number(raw.watermarkY):.12));
  const watermarkScale = Math.max(.05,Math.min(.42,Number.isFinite(Number(raw.watermarkScale))?Number(raw.watermarkScale):.18));
  const watermarkOpacity = Math.max(.1,Math.min(1,Number.isFinite(Number(raw.watermarkOpacity))?Number(raw.watermarkOpacity):.9));
  return {
    intensity,preset,captionStyle,captionPosition,captionY,captionSize,captionScale,captionColor,cleanupMode,zoomStyle,trackingMode,cameraMovement,outputFormat,editorContext,sourceSubtitleMode,sourceSubtitleBottom,
    watermarkUrl,watermarkX,watermarkY,watermarkScale,watermarkOpacity,
    autoReframe: raw.autoReframe !== false,
    speakerTracking: raw.speakerTracking !== false,
    reactionDetection: raw.reactionDetection !== false,
    sceneAwareCuts: raw.sceneAwareCuts !== false,
    silenceRemoval: raw.silenceRemoval !== false,
    dynamicZoom: raw.dynamicZoom !== false,
    captions: raw.captions !== false
  };
}

function intervalOverlapSeconds(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(Number(aEnd||0), Number(bEnd||0)) - Math.max(Number(aStart||0), Number(bStart||0)));
}

function autoDirectorRenderOptions(meta, start, end, raw = {}) {
  const base = normalizeRenderOptions(raw);
  const duration = Math.max(.25, Number(end||0) - Number(start||0));
  const minuteScale = 60 / duration;
  const details = meta?.details || {};
  const width = Number(details.width || 0), height = Number(details.height || 0);
  const sourceIsVertical = width > 0 && height > 0 && (width / height) <= .72;
  const sourceIsSquareish = width > 0 && height > 0 && (width / height) > .72 && (width / height) < 1.18;

  const scenes = (meta?.analysis?.timeline?.scenes || []).map(Number).filter(t => Number.isFinite(t) && t >= start && t <= end);
  const sceneRate = scenes.length * minuteScale;
  const silences = (meta?.analysis?.timeline?.silences || []).filter(s => Number(s?.end||0) > Number(s?.start||0));
  const silenceSeconds = silences.reduce((sum,s) => sum + intervalOverlapSeconds(start,end,s.start,s.end), 0);
  const silenceRatio = Math.min(1, silenceSeconds / duration);

  const transcript = meta?.transcript || {};
  const rawWords = (transcript.rawWords?.length ? transcript.rawWords : transcript.words || []).filter(w => Number(w?.end||0) >= start && Number(w?.start||0) <= end);
  const words = (transcript.words || []).filter(w => Number(w?.end||0) >= start && Number(w?.start||0) <= end);
  const wordsPerMinute = rawWords.length * minuteScale;
  const removed = (transcript.cleanup?.removedRanges || []).filter(r => intervalOverlapSeconds(start,end,r.start,r.end) > .02);
  const removedSeconds = removed.reduce((sum,r) => sum + intervalOverlapSeconds(start,end,r.start,r.end), 0);
  const hasSpeech = rawWords.length >= 4;

  const text = [
    meta?.originalName,
    meta?.externalSource?.title,
    meta?.externalSource?.creatorName,
    words.slice(0,80).map(w=>w.word).join(' ')
  ].filter(Boolean).join(' ').toLowerCase();

  const gamingHint = /\b(gaming|gameplay|valorant|fortnite|minecraft|gta|league of legends|lol|counter[- ]?strike|cs2|warzone|rocket league|apex|overwatch|twitch|ranked|speedrun)\b/i.test(text);
  const podcastHint = /\b(podcast|interview|discussion|talk show|talkshow|débat|debat|entretien|conversation)\b/i.test(text);
  const reactionHint = /\b(react|reaction|réaction|reagit|réagit|drama|incroyable|insane|crazy|wow|no way)\b/i.test(text);

  let contentType = 'dynamic';
  if (gamingHint) contentType = 'gaming';
  else if (podcastHint || (Number(details.duration||0) >= 20*60 && sceneRate < 6 && wordsPerMinute >= 70)) contentType = 'podcast';
  else if (reactionHint || (sceneRate >= 10 && wordsPerMinute >= 65)) contentType = 'reaction';
  else if (hasSpeech && sceneRate < 5) contentType = 'talking';
  else if (!hasSpeech && sceneRate >= 8) contentType = 'visual';

  let preset = 'dynamic';
  if (contentType === 'gaming') preset = 'gaming';
  else if (contentType === 'podcast') preset = 'podcast';
  else if (contentType === 'talking' && sceneRate < 3.5) preset = 'clean';

  let intensity = 'balanced';
  if (contentType === 'podcast' || sceneRate >= 16) intensity = 'low';
  else if (contentType === 'gaming' && sceneRate < 10) intensity = 'high';

  // General AI Studio should feel calmer than Campaign Studio.
  // Campaign Studio keeps its existing adaptive profile.
  if (base.editorContext === 'general') intensity = 'low';

  // Avoid mechanical zooms on footage that is already visually active.
  let zoomStyle = 'natural';
  if (preset === 'podcast' || preset === 'clean' || sceneRate >= 10) zoomStyle = 'minimal';
  else if (contentType === 'gaming' && sceneRate < 5 && reactionHint) zoomStyle = 'energetic';
  if (base.editorContext === 'general') zoomStyle = 'minimal';

  const autoReframe = !sourceIsVertical;
  const cameraMovement = sourceIsVertical || contentType === 'podcast' || sceneRate >= 15 ? 'low' : 'balanced';
  const trackingMode = autoReframe ? 'auto' : 'center';

  // Only cut actual audio disfluencies when the cleanup is confident and limited.
  // Otherwise captions are cleaned while original speech remains untouched.
  const safeSpeechCleanup = hasSpeech && removed.length >= 2 && removedSeconds <= Math.min(2.6, duration * .09) && wordsPerMinute >= 80;
  const cleanupMode = safeSpeechCleanup ? 'speech' : (hasSpeech ? 'captions' : 'off');

  const captionPreference = ['auto','on','off'].includes(String(raw.captionPreference||'').toLowerCase())
    ? String(raw.captionPreference).toLowerCase()
    : 'auto';
  const captions = captionPreference === 'off' ? false : Boolean(transcript?.captions?.length || words.length);
  // Caption presentation is user-controlled. Auto Director may decide whether
  // captions are useful, but it must not overwrite the editor's Style / Size /
  // Position choices on every preview render.
  const captionStyle = base.captionStyle;
  const captionColorPreference = ['auto','white','yellow','lime','cyan','pink','red'].includes(String(raw.captionColor||'').toLowerCase())
    ? String(raw.captionColor).toLowerCase()
    : 'auto';
  const automaticCaptionColor = contentType === 'gaming' || contentType === 'reaction' ? 'yellow' : 'white';
  const captionColor = captionColorPreference === 'auto' ? automaticCaptionColor : captionColorPreference;
  const captionSize = base.captionSize;

  const sceneAwareCuts = scenes.length > 0;
  const silenceRemoval = silenceSeconds >= .55 && silenceRatio >= .018;
  const reactionDetection = autoReframe && ['gaming','reaction','dynamic'].includes(contentType);
  const dynamicZoom = base.editorContext === 'general'
    ? false
    : (zoomStyle !== 'minimal' && sceneRate < 10 && hasSpeech);

  const generalStudio = base.editorContext === 'general';
  const options = {
    ...base,
    intensity,
    preset,
    captionStyle,
    captionPosition:base.captionPosition,
    captionY:base.captionY,
    captionSize,
    captionColor,
    cleanupMode,
    zoomStyle,
    trackingMode:generalStudio?'speaker':trackingMode,
    cameraMovement:generalStudio?'low':cameraMovement,
    autoReframe,
    // General AI Studio still tracks the active speaker so a 9:16 crop does
    // not strand the person talking outside the frame. Movement stays low and
    // zoom/reaction effects remain disabled below.
    speakerTracking:autoReframe,
    reactionDetection:generalStudio?false:reactionDetection,
    sceneAwareCuts,
    silenceRemoval,
    dynamicZoom:generalStudio?false:dynamicZoom,
    captions
  };

  const contentLabel = {
    gaming:'Gaming',
    podcast:'Podcast / conversation',
    reaction:'Reaction',
    talking:'Talking head',
    visual:'Visual-first',
    dynamic:'Dynamic'
  }[contentType] || 'Dynamic';

  const labels = [
    contentLabel,
    autoReframe ? 'Smart 9:16' : 'Keeps native framing',
    cleanupMode === 'speech' ? 'Speech cleanup' : cleanupMode === 'captions' ? 'Clean captions' : 'No speech cleanup',
    dynamicZoom ? `${zoomStyle[0].toUpperCase()+zoomStyle.slice(1)} zoom` : 'No unnecessary zoom'
  ];
  if (captions) labels.push(`${captionStyle[0].toUpperCase()+captionStyle.slice(1)} captions`);
  else labels.push('Captions off');

  const reasonParts = [];
  if (sceneRate >= 10) reasonParts.push('high visual activity');
  else if (sceneRate <= 4) reasonParts.push('calm visual pacing');
  if (wordsPerMinute >= 145) reasonParts.push('dense speech');
  else if (hasSpeech) reasonParts.push('speech-led content');
  if (removed.length >= 2) reasonParts.push('detected stutters/fillers');
  if (sourceIsVertical) reasonParts.push('source already vertical');

  return {
    options,
    profile: {
      engine:'Auto Director v3',
      contentType,
      labels,
      reason: reasonParts.length ? `Detected ${reasonParts.join(', ')}.` : 'Balanced automatically from the clip content.',
      metrics: {
        sceneRate:Number(sceneRate.toFixed(2)),
        wordsPerMinute:Number(wordsPerMinute.toFixed(1)),
        silenceRatio:Number(silenceRatio.toFixed(3)),
        cleanupEvents:removed.length,
        sourceAspect:width&&height?Number((width/height).toFixed(3)):null,
        sourceIsVertical,
        sourceIsSquareish
      }
    }
  };
}

function trackingCacheKey(meta, start, end, options) {
  const sourceStamp = (() => { try { const st=fsSync.statSync(meta.sourcePath); return `${st.size}:${Math.round(st.mtimeMs)}`; } catch { return 'source'; } })();
  return crypto.createHash('sha1').update(`${meta.id}:${sourceStamp}:${Number(start).toFixed(3)}:${Number(end).toFixed(3)}:${options.trackingMode}:${options.cameraMovement}:speaker-reframe-v7`).digest('hex').slice(0,24);
}

async function ensureFaceTracking(meta, start, end, options) {
  if (!options.autoReframe || !options.speakerTracking || !meta?.sourcePath) return null;
  const key = trackingCacheKey(meta, start, end, options);
  const cacheFile = path.join(trackingDir, `${meta.id}-${key}.json`);
  try {
    const cached = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
    if (cached?.keyframes?.length && cached?.ok !== false) return cached;
  } catch {}
  const python = String(process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3')).trim();
  const script = path.join(root, 'scripts', 'track_faces.py');
  const step = options.speakerTracking?'0.24':(options.cameraMovement==='high'?'0.25':options.cameraMovement==='low'?'0.48':'0.34');
  const runTracker = async (input, trackStart, trackEnd) => await runJsonProcess(python, [script,'--input',input,'--start',String(trackStart),'--end',String(trackEnd),'--mode',options.trackingMode,'--movement',options.cameraMovement,'--step',step], { timeout: 8*60_000, idleTimeout: 0 });
  let directError = null;
  try {
    const result = await runTracker(meta.sourcePath,start,end);
    if (result?.ok !== false && result?.keyframes?.length) {
      result.summary={...(result.summary||{}),transport:'direct-source'};
      await fs.writeFile(cacheFile, JSON.stringify(result), 'utf8').catch(()=>{});
      return result;
    }
    directError = result?.error || 'Direct source tracking returned no usable frames.';
  } catch (error) {
    directError = error?.message || 'Direct source tracking failed.';
  }

  // Some downloaded sources use codecs / long-GOP seeking that OpenCV cannot decode reliably.
  // Build a small temporary H.264 proxy ONLY for visual analysis. Coordinates stay normalized and
  // are applied later to the original source, so export quality is never reduced.
  const proxyFile = path.join(trackingDir, `${meta.id}-${key}-tracking-proxy.mp4`);
  try {
    const duration=Math.max(.25,Number(end)-Number(start));
    await run('ffmpeg', ['-y','-ss',String(Math.max(0,Number(start)||0)),'-i',meta.sourcePath,'-t',String(duration),'-an','-vf','scale=760:-2','-c:v','libx264','-preset','ultrafast','-crf','30','-pix_fmt','yuv420p','-movflags','+faststart',proxyFile], { timeout: 6*60_000 });
    const recovered = await runTracker(proxyFile,0,duration);
    if (recovered?.ok !== false && recovered?.keyframes?.length) {
      recovered.summary={...(recovered.summary||{}),transport:'ffmpeg-proxy',recoveredFrom:directError||null};
      await fs.writeFile(cacheFile, JSON.stringify(recovered), 'utf8').catch(()=>{});
      return recovered;
    }
    const proxyError=recovered?.error || 'Tracking proxy returned no usable frames.';
    return { ok:false, error:`${directError || 'Face tracking failed.'} Proxy retry: ${proxyError}`, keyframes:[], summary:{ samples:0, facesDetected:0, faceCountMax:0, speakerSwitches:0, reactionPeaks:0, mode:options.trackingMode, movement:options.cameraMovement, transport:'safe-full-frame' } };
  } catch (error) {
    return { ok:false, error:`${directError || 'Face tracking failed.'} Proxy retry: ${error?.message || 'unavailable.'}`, keyframes:[], summary:{ samples:0, facesDetected:0, faceCountMax:0, speakerSwitches:0, reactionPeaks:0, mode:options.trackingMode, movement:options.cameraMovement, transport:'safe-full-frame' } };
  } finally {
    await fs.rm(proxyFile,{force:true}).catch(()=>{});
  }
}

function splitPiecesAtBoundaries(pieces = [], boundaries = []) {
  const sortedBoundaries=[...new Set(boundaries.map(Number).filter(Number.isFinite))].sort((a,b)=>a-b);
  const out=[];
  for (const part of pieces) {
    const pts=[Number(part.start), ...sortedBoundaries.filter(t=>t>Number(part.start)+0.04 && t<Number(part.end)-0.04), Number(part.end)];
    for(let i=0;i<pts.length-1;i++){
      const a=pts[i], b=pts[i+1]; if(b-a<0.055) continue;
      out.push({...part,start:a,end:b});
    }
  }
  return out;
}

function nearestTrackingFrame(tracking, time) {
  const frames=tracking?.keyframes||[]; if(!frames.length) return null;
  let best=frames[0], bestDist=Math.abs(Number(best.time||0)-time);
  for(const f of frames){const d=Math.abs(Number(f.time||0)-time);if(d<bestDist){best=f;bestDist=d}}
  return best;
}

function applySmartFraming(timeline, tracking, sceneTimes = [], options = {}) {
  let boundaries=[];
  const generalStudio=options.editorContext==='general';
  // General AI Studio uses the same speaker coordinates as Campaign Studio,
  // but with much calmer thresholds and a constant zoom. This keeps the active
  // speaker inside the vertical crop without the "camera breathing" effect.
  if(options.sceneAwareCuts) boundaries.push(...sceneTimes);
  const frames=tracking?.keyframes||[];
  const switchTimes=(tracking?.summary?.speakerSwitchTimes||[]).map(Number).filter(Number.isFinite);
  if(frames.length){
    // General AI Studio should feel stable, like a social editor, not like a camera
    // continuously breathing in and out. Campaign Studio keeps the more reactive tracking.
    const maxGap=generalStudio ? 2.4 : (options.cameraMovement==='high'?.34:options.cameraMovement==='low'?.54:.42);
    const moveThreshold=generalStudio ? .075 : .018;
    let lastTime=-99,lastX=.5,lastY=.45,lastId=null,lastSafe=null;
    for(const f of frames){
      const t=Number(f.time||0), x=Number(f.x||.5), y=Number(f.y||.45), id=f.activeFaceId??null, safe=Boolean(f.safeFrame);
      const moved=Math.hypot(x-lastX,y-lastY)>moveThreshold;
      const speakerChanged=id&&lastId&&id!==lastId;
      const safeChanged=lastSafe!==null&&safe!==lastSafe;
      if(t-lastTime>=maxGap || moved || speakerChanged || safeChanged){
        boundaries.push(t);
        // Speaker changes should retarget immediately, while normal motion still
        // follows the calmer General Studio cadence.
        if(generalStudio && speakerChanged) boundaries.push(Math.max(0,t-.08));
        lastTime=t;lastX=x;lastY=y;lastId=id||lastId;lastSafe=safe;
      }
    }
    // Campaign Studio keeps its short transition bridge. In general AI Studio,
    // speaker switches only move the crop; they never trigger a full-frame zoom-out.
    if(!generalStudio){
      for(const t of switchTimes){ boundaries.push(Math.max(0,t-.22),t,Math.min(Number(timeline?.pieces?.at(-1)?.end||t+.22),t+.24)); }
    }
  }
  let pieces=splitPiecesAtBoundaries(timeline.pieces,boundaries).map(part=>{
    const mid=(Number(part.start)+Number(part.end))/2;
    const frame=nearestTrackingFrame(tracking,mid);
    const speakerConfidence=frame?Number(frame.speakerConfidence||frame.confidence||0):0;
    const faceCount=Number(frame?.faceCount||0);
    const trackingUnavailable=tracking?.ok===false || !frames.length || !frame;
    const noFace=faceCount<=0;
    const safeFrame=Boolean(trackingUnavailable || noFace || frame?.safeFrame || (frame && faceCount>1 && speakerConfidence<.24));
    const nearSwitch=!generalStudio&&switchTimes.some(t=>Math.abs(mid-t)<=.24);
    const mode=String(frame?.mode||'');
    const fullSource=safeFrame || nearSwitch || mode==='group' || frame?.activeFaceId===-1;
    const faceHeight=Math.max(0,Number(frame?.faceHeight||0));
    // General AI Studio uses a constant crop scale. Only the X/Y focus follows the subject.
    // This removes the repeated zoom effect caused by face-size fluctuations.
    const speakerZoom=generalStudio
      ? 1
      : (faceHeight>0 ? Math.max(1,Math.min(1.18,1.13-(faceHeight-.10)*.55)) : 1.04);
    return {...part,
      focusX:frame?Number(frame.x||.5):.5,
      focusY:frame?Number(frame.y||.44):.44,
      trackingConfidence:frame?Number(frame.confidence||0):0,
      speakerConfidence,
      activeFaceId:frame?.activeFaceId??null,
      faceCount,
      faceWidth:frame?Number(frame.faceWidth||0):0,
      faceHeight,
      spreadX:frame?Number(frame.spreadX||0):0,
      safeFrame,
      trackingFallback:trackingUnavailable,
      frameMode:fullSource?'full':'speaker',
      speakerZoom:fullSource?1:speakerZoom,
      switchBridge:nearSwitch
    };
  });

  if(generalStudio && pieces.length){
    // Never switch visual composition abruptly inside a General Studio clip.
    // If any meaningful segment cannot be cropped safely around the speaker,
    // keep the whole clip in the stable full-source-on-vertical-canvas layout.
    const totalDuration=pieces.reduce((sum,p)=>sum+Math.max(0,Number(p.end||0)-Number(p.start||0)),0);
    const unsafeDuration=pieces
      .filter(p=>p.frameMode==='full')
      .reduce((sum,p)=>sum+Math.max(0,Number(p.end||0)-Number(p.start||0)),0);
    const unsafeRatio=totalDuration>0?unsafeDuration/totalDuration:1;
    const hasMeaningfulUnsafe=pieces.some(p=>p.frameMode==='full' && Number(p.end||0)-Number(p.start||0)>=.20);
    const lockFullSource=tracking?.ok===false || !frames.length || hasMeaningfulUnsafe || unsafeRatio>=.08;
    if(lockFullSource){
      pieces=pieces.map(p=>({
        ...p,
        frameMode:'full',
        speakerZoom:1,
        switchBridge:false,
        layoutLocked:true
      }));
    }else{
      pieces=pieces.map(p=>({...p,frameMode:'speaker',speakerZoom:1,switchBridge:false,layoutLocked:true}));
    }
  }
  return {...timeline,pieces};
}

function subtractIntervals(totalDuration, removals = [], minDuration=.11) {
  const duration = Math.max(0.25, Number(totalDuration || 0));
  const normalized = removals
    .map(r => ({ start: Math.max(0, Number(r.start || 0)), end: Math.min(duration, Number(r.end || 0)) }))
    .filter(r => r.end - r.start >= minDuration)
    .sort((a,b) => a.start - b.start);
  const merged = [];
  for (const r of normalized) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end + 0.045) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  const keep = [];
  let cursor = 0;
  for (const r of merged) {
    if (r.start > cursor + 0.055) keep.push({ start: cursor, end: r.start });
    cursor = Math.max(cursor, r.end);
  }
  if (cursor < duration - 0.055) keep.push({ start: cursor, end: duration });
  return keep.filter(x => x.end - x.start >= 0.10);
}

function zoomAtTime(event,t){
  const a=Number(event.start||0), b=Number(event.end||a), target=Math.max(1,Number(event.zoom||1));
  if(t<a||t>b||b<=a)return 1;
  const dur=b-a;
  const ramp=Math.min(.34,Math.max(.16,dur*.28));
  let factor=1;
  if(t<a+ramp) factor=(t-a)/ramp;
  else if(t>b-ramp) factor=(b-t)/ramp;
  factor=Math.max(0,Math.min(1,factor));
  const eased=factor*factor*(3-2*factor);
  return 1+(target-1)*eased;
}

function buildEditedTimeline(plan, clipDuration, options) {
  const planned=plan?.events||[];
  const removalEvents=[];
  if(options.silenceRemoval){
    for(const e of planned.filter(e=>e.type==='remove-silence')){
      const a=Number(e.start||0),b=Number(e.end||0);
      removalEvents.push({start:Math.min(b,a+.10),end:Math.max(a,b-.10)});
    }
  }
  if(options.cleanupMode==='speech'){
    for(const e of planned.filter(e=>e.type==='remove-disfluency')){
      removalEvents.push({start:Number(e.start||0),end:Number(e.end||0)});
    }
  }

  const keep = subtractIntervals(clipDuration, removalEvents, .10);
  const zoomEvents = options.dynamicZoom
    ? planned.filter(e => e.type === 'dynamic-zoom' || e.type === 'punch-in' || e.type === 'reaction-zoom')
    : [];
  const pieces = [];
  for (const k of keep) {
    const boundaries = new Set([k.start, k.end]);
    for (const z of zoomEvents) {
      const a = Math.max(k.start, Number(z.start || 0));
      const b = Math.min(k.end, Number(z.end || 0));
      if (b > a + 0.08) {
        boundaries.add(a); boundaries.add(b);
        for(let t=a+.20;t<b-.08;t+=.20) boundaries.add(Number(t.toFixed(3)));
      }
    }
    const sorted = [...boundaries].sort((a,b)=>a-b);
    for (let i=0; i<sorted.length-1; i++) {
      const a=sorted[i], b=sorted[i+1];
      if (b-a < 0.045) continue;
      const mid=(a+b)/2;
      const zoom=zoomEvents.reduce((m,z)=>Math.max(m,zoomAtTime(z,mid)),1);
      const prev=pieces[pieces.length-1];
      if (prev && Math.abs(prev.end-a)<0.015 && Math.abs(prev.zoom-zoom)<0.0025) prev.end=b;
      else pieces.push({ start:a, end:b, zoom:Number(zoom.toFixed(4)) });
    }
  }
  return { keep, pieces };
}

function remapCaptionsForEditedTimeline(meta, clipStart, keepIntervals = []) {
  const sourceCaptions = meta?.transcript?.captions || [];
  const out = [];
  let offset = 0;
  for (const k of keepIntervals) {
    const absStart = clipStart + k.start;
    const absEnd = clipStart + k.end;
    for (const c of sourceCaptions) {
      const overlapStart = Math.max(absStart, Number(c.start || 0));
      const overlapEnd = Math.min(absEnd, Number(c.end || 0));
      if (overlapEnd <= overlapStart + 0.04) continue;
      out.push({
        start: offset + (overlapStart - absStart),
        end: offset + (overlapEnd - absStart),
        text: String(c.text || '').trim()
      });
    }
    offset += k.end - k.start;
  }
  return out;
}

async function writeEditedAss(meta, clipStart, keepIntervals, width=1080, height=1920, rawOptions={}) {
  const options = normalizeRenderOptions(rawOptions);
  const captionMeta = options.cleanupMode==='off' && meta?.transcript?.rawWords?.length
    ? {...meta,transcript:{...meta.transcript,captions:wordsToCaptions(meta.transcript.rawWords)}}
    : meta;
  const remappedCaptions = remapCaptionsForEditedTimeline(captionMeta, clipStart, keepIntervals).filter(c => c.text);
  const captions = meta?.campaignId
    ? remappedCaptions
    : compactCaptionRows(remappedCaptions,{maxWords:4,maxChars:22,minWords:2});
  if (!captions.length) return null;
  const file = path.join(exportsDir, `${meta.id}-${Date.now()}-edited.ass`);
  // Social-native captions need heavier glyphs and a stronger outline than
  // traditional subtitle styling. Keep every measurement tied to the final
  // render width so 540p previews and 1080p exports preserve the same look.
  const sizeScale = options.captionSize === 'large' ? 0.086 : options.captionSize === 'small' ? 0.044 : 0.072;
  const fontSize = Math.max(28, Math.round(width * sizeScale * options.captionScale));
  const outlineScale = options.captionStyle === 'minimal' ? 0.0032
    : options.captionStyle === 'clean' ? 0.0052
      : options.captionStyle === 'neon' ? 0.0060
        : options.captionStyle === 'box' ? 0.0025
          : options.captionStyle === 'impact' ? 0.0074
            : options.captionStyle === 'pop' ? 0.0068
              : options.captionStyle === 'karaoke' ? 0.0064
                : 0.0065;
  const outline = Math.max(options.captionStyle === 'minimal' ? 2 : 4, Math.round(width * outlineScale));
  const customCaptionY=Number.isFinite(Number(options.captionY))?Math.max(.12,Math.min(.88,Number(options.captionY))):null;
  const alignment = customCaptionY!==null ? 5 : options.captionPosition === 'top' ? 8 : options.captionPosition === 'center' ? 5 : 2;
  const marginV = customCaptionY!==null ? 0 : options.captionPosition === 'top' ? Math.round(height*.12) : options.captionPosition === 'center' ? 0 : Math.round(height*.16);
  const captionOverride = customCaptionY!==null ? `{\\an5\\pos(${Math.round(width/2)},${Math.round(height*customCaptionY)})}` : '';
  const styleMap = {
    // Arial Black gives the default preset the dense, high-contrast weight
    // used by native short-form/social editors without introducing a bundled
    // third-party font dependency. Slight horizontal compression keeps short
    // bursts punchy while preserving generous vertical stroke weight.
    bold: { font:'Arial Black', primary:'&H00FFFFFF', secondary:'&H0000FFFF', outline:'&H00000000', back:'&H70000000', shadow:1, spacing:-1, bold:-1, scaleX:96, borderStyle:1 },
    clean: { font:'Arial', primary:'&H00FFFFFF', secondary:'&H00FFFFFF', outline:'&H00151515', back:'&H50000000', shadow:0, spacing:0, bold:-1, scaleX:100, borderStyle:1 },
    neon: { font:'Arial Black', primary:'&H00FFFFFF', secondary:'&H0000FFFF', outline:'&H00A84BFF', back:'&H60000000', shadow:1, spacing:-1, bold:-1, scaleX:96, borderStyle:1 },
    minimal: { font:'Arial', primary:'&H00FFFFFF', secondary:'&H00FFFFFF', outline:'&H80000000', back:'&H00000000', shadow:0, spacing:0, bold:0, scaleX:100, borderStyle:1 },
    impact: { font:'Arial Black', primary:'&H00FFFFFF', secondary:'&H0000FFFF', outline:'&H00000000', back:'&H65000000', shadow:2, spacing:-1.5, bold:-1, scaleX:93, borderStyle:1 },
    pop: { font:'Arial Black', primary:'&H00FFFFFF', secondary:'&H0000FFFF', outline:'&H00000000', back:'&H65000000', shadow:1, spacing:-1, bold:-1, scaleX:96, borderStyle:1 },
    box: { font:'Arial Black', primary:'&H00FFFFFF', secondary:'&H00FFFFFF', outline:'&H00000000', back:'&HCC111111', shadow:0, spacing:-1, bold:-1, scaleX:96, borderStyle:3 },
    karaoke: { font:'Arial Black', primary:'&H00FFFFFF', secondary:'&H004AD5FF', outline:'&H00000000', back:'&H65000000', shadow:1, spacing:-1, bold:-1, scaleX:96, borderStyle:1 }
  };
  const colorMap={
    white:'&H00FFFFFF',
    yellow:'&H004AD5FF',
    lime:'&H0075FF5C',
    cyan:'&H00FFE735',
    pink:'&H00D84FFF',
    red:'&H00554BFF',
    // Legacy project values remain supported.
    green:'&H007DD143',
    blue:'&H00FFA34D',
    purple:'&H00FF6C9B',
    orange:'&H00439FFF',
    black:'&H00000000'
  };
  const base=styleMap[options.captionStyle]||styleMap.bold;
  const st={...base,primary:colorMap[options.captionColor]||base.primary};
  if(options.captionColor==='black'&&options.captionStyle!=='minimal') st.outline='&H00FFFFFF';
  const header = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: Default,${st.font},${fontSize},${st.primary},${st.secondary},${st.outline},${st.back},${st.bold},0,0,0,${st.scaleX||100},100,${st.spacing},0,${st.borderStyle||1},${outline},${st.shadow},${alignment},55,55,${marginV},1\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n`;
  const transform = options.captionStyle === 'minimal' ? (t)=>t : (t)=>t.toUpperCase();
  const karaokeText = (text,duration) => {
    const words=transform(stripCaptionPunctuation(text)).split(/\s+/).filter(Boolean);
    if(!words.length)return '';
    const totalCs=Math.max(words.length,Math.round(Math.max(.12,Number(duration||0))*100));
    const each=Math.max(1,Math.floor(totalCs/words.length));
    let used=0;
    return words.map((word,i)=>{
      const cs=i===words.length-1?Math.max(1,totalCs-used):each;
      used+=cs;
      return `{\\kf${cs}}${assEscape(word)}`;
    }).join(' ');
  };
  const effectOverride = (c) => {
    if(options.captionStyle==='pop') return `{\\fscx118\\fscy118\\t(0,120,\\fscx100\\fscy100)}`;
    if(options.captionStyle==='impact') return `{\\bord${Math.max(outline+1,Math.round(width*.0078))}\\shad2}`;
    return '';
  };
  const body = captions.map(c => {
    const text=options.captionStyle==='karaoke'
      ? karaokeText(c.text,Number(c.end||0)-Number(c.start||0))
      : assEscape(transform(stripCaptionPunctuation(c.text)));
    return `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${captionOverride}${effectOverride(c)}${text}`;
  }).join('\n');
  await fs.writeFile(file, header + body + '\n', 'utf8');
  return file;
}


function evenFloor(value, min=2){ const n=Math.max(min,Math.floor(Number(value)||min)); return n%2===0?n:n-1; }
function sourceCropForSpeaker(srcW,srcH,outW,outH,part,extraZoom=1){
  const targetAspect=outW/outH;
  const sourceAspect=srcW/srcH;
  let cropW,cropH;
  if(sourceAspect>=targetAspect){ cropH=srcH; cropW=srcH*targetAspect; }
  else { cropW=srcW; cropH=srcW/targetAspect; }
  const zoom=Math.max(1,Math.min(1.22,Number(part.speakerZoom||1)*Number(extraZoom||1)));
  cropW/=zoom; cropH/=zoom;
  cropW=evenFloor(Math.min(srcW,cropW)); cropH=evenFloor(Math.min(srcH,cropH));
  const fx=Math.max(.02,Math.min(.98,Number(part.focusX??.5)));
  const fy=Math.max(.04,Math.min(.96,Number(part.focusY??.44)));
  const cx=fx*srcW, cy=fy*srcH;
  const x=evenFloor(Math.max(0,Math.min(srcW-cropW,cx-cropW/2)),0);
  const y=evenFloor(Math.max(0,Math.min(srcH-cropH,cy-cropH*.40)),0);
  return {cropW,cropH,x,y,zoom};
}
function sourceCropForWide(srcW,srcH,outW,outH,part){
  const sourceAspect=srcW/srcH;
  const baseAspect=outW/outH;
  const spread=Math.max(0,Number(part.spreadX||0));
  // Wider than 9:16 during speaker changes / groups. It is then placed over a blurred vertical canvas.
  const desiredAspect=Math.min(sourceAspect,Math.max(.78,Math.min(1.36,baseAspect+spread*1.55+(part.switchBridge?.18:.08))));
  let cropW,cropH;
  if(sourceAspect>=desiredAspect){ cropH=srcH; cropW=srcH*desiredAspect; }
  else { cropW=srcW; cropH=srcW/desiredAspect; }
  cropW=evenFloor(Math.min(srcW,cropW)); cropH=evenFloor(Math.min(srcH,cropH));
  const fx=Math.max(.02,Math.min(.98,Number(part.focusX??.5)));
  const fy=Math.max(.04,Math.min(.96,Number(part.focusY??.46)));
  const x=evenFloor(Math.max(0,Math.min(srcW-cropW,fx*srcW-cropW/2)),0);
  const y=evenFloor(Math.max(0,Math.min(srcH-cropH,fy*srcH-cropH/2)),0);
  return {cropW,cropH,x,y,aspect:desiredAspect};
}

async function renderEditedClip(meta, start, end, outputPath, rawOptions = {}, render = {}) {
  if (!meta?.sourcePath || !fsSync.existsSync(meta.sourcePath)) throw Object.assign(new Error('Source file is not available for rendering.'), { status: 409 });
  const safeStart = Math.max(0, Number(start || 0));
  const safeEnd = Math.min(Number(meta.details?.duration || end || safeStart + 30), Math.max(safeStart + .25, Number(end || safeStart + 30)));
  const clipDuration = safeEnd - safeStart;
  const autoDirectorEnabled = rawOptions?.autoDirector !== false;
  const resolved = autoDirectorEnabled
    ? autoDirectorRenderOptions(meta, safeStart, safeEnd, rawOptions)
    : { options: normalizeRenderOptions(rawOptions), profile:null };
  const options = resolved.options;
  const silences = meta.analysis?.timeline?.silences || [];
  const absoluteScenes = meta.analysis?.timeline?.scenes || [];
  const sceneTimes = absoluteScenes.map(Number).filter(t=>Number.isFinite(t)&&t>safeStart+.05&&t<safeEnd-.05).map(t=>Number((t-safeStart).toFixed(3)));

  const tracking = await ensureFaceTracking(meta, safeStart, safeEnd, options);
  const plan = buildEditPlan({ start: safeStart, end: safeEnd }, meta.transcript, silences, options.intensity, options.preset, options.zoomStyle);

  if (options.reactionDetection && tracking?.summary?.reactionPeakTimes?.length && options.zoomStyle!=='minimal') {
    const existing=(plan.events||[]).filter(e=>/zoom|punch/.test(e.type));
    for(const peak of tracking.summary.reactionPeakTimes){
      const at=Number(peak.time||0); if(at<1.2||at>clipDuration-0.8) continue;
      if(existing.some(e=>Math.abs(Number(e.start||0)-at)<5.2)) continue;
      if(sceneTimes.some(t=>Math.abs(t-at)<.72)) continue;
      const zoom=options.zoomStyle==='energetic'?(options.intensity==='high'?1.105:1.085):(options.intensity==='high'?1.085:1.065);
      const event={type:'reaction-zoom',start:Number(Math.max(.05,at-.16).toFixed(2)),end:Number(Math.min(clipDuration,at+.92).toFixed(2)),zoom:Number(zoom.toFixed(3)),reason:'Reaction peak'};
      plan.events.push(event); existing.push(event);
    }
  }
  if(options.sceneAwareCuts){
    for(const t of sceneTimes.slice(0,80)) plan.events.push({type:'scene-boundary',start:t,end:t,reason:'Scene-aware framing reset'});
  }
  plan.events.sort((a,b)=>Number(a.start||0)-Number(b.start||0));
  plan.summary.zooms=plan.events.filter(e=>/zoom|punch/.test(e.type)).length;
  plan.summary.sceneCuts=sceneTimes.length;
  plan.summary.speakerSwitches=tracking?.summary?.speakerSwitches||0;
  plan.summary.reactionPeaks=tracking?.summary?.reactionPeaks||0;
  plan.summary.faceCountMax=tracking?.summary?.faceCountMax||0;

  let timeline = buildEditedTimeline(plan, clipDuration, options);
  if (!timeline.pieces.length) timeline.pieces.push({ start:0, end:clipDuration, zoom:1 });
  timeline = applySmartFraming(timeline, tracking, sceneTimes, options);

  const preview = Boolean(render.preview);
  const width = Number(render.width || (preview ? 540 : 1080));
  const height = Number(render.height || (preview ? 960 : 1920));
  const srcW=Math.max(2,Number(meta.details?.width||width));
  const srcH=Math.max(2,Number(meta.details?.height||height));
  const cropSourceSubtitles = options.editorContext==='general' && options.sourceSubtitleMode==='crop';
  const hideSourceSubtitles = options.editorContext==='general' && options.sourceSubtitleMode==='hide';
  const sourceSubtitleBottomPx = cropSourceSubtitles ? Math.max(2,Math.round(srcH*options.sourceSubtitleBottom/2)*2) : 0;
  const effectiveSrcH = Math.max(2,srcH-sourceSubtitleBottomPx);
  const filter = [];
  const hasAudio = Boolean(meta.details?.audioCodec);
  for (let i=0; i<timeline.pieces.length; i++) {
    const part = timeline.pieces[i];
    const srcA = safeStart + part.start;
    const srcB = safeStart + part.end;
    const editZoom=Number(part.zoom||1);
    if(options.autoReframe && part.frameMode==='full'){
      // Safety / speaker-switch view: preserve the COMPLETE original frame. The foreground is never cropped.
      // A blurred copy fills the vertical canvas, while the original source is scaled down to fit inside it.
      filter.push(`[0:v]trim=start=${srcA.toFixed(3)}:end=${srcB.toFixed(3)},setpts=PTS-STARTPTS${cropSourceSubtitles?`,crop=${srcW}:${effectiveSrcH}:0:0`:''},split=2[fbg${i}][ffg${i}]`);
      filter.push(`[fbg${i}]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},gblur=sigma=20[bg${i}]`);
      filter.push(`[ffg${i}]scale=${width}:${height}:force_original_aspect_ratio=decrease[fg${i}]`);
      filter.push(`[bg${i}][fg${i}]overlay=(W-w)/2:(H-h)/2,setsar=1[v${i}]`);
    }else if(options.autoReframe && part.frameMode==='wide'){
      // Wider source-space bridge retained for compatibility; safety fallbacks now use the full source above.
      const wide=sourceCropForWide(srcW,effectiveSrcH,width,height,part);
      filter.push(`[0:v]trim=start=${srcA.toFixed(3)}:end=${srcB.toFixed(3)},setpts=PTS-STARTPTS${cropSourceSubtitles?`,crop=${srcW}:${effectiveSrcH}:0:0`:''},split=2[wbg${i}][wfg${i}]`);
      filter.push(`[wbg${i}]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},gblur=sigma=20[bg${i}]`);
      filter.push(`[wfg${i}]crop=${wide.cropW}:${wide.cropH}:${wide.x}:${wide.y},scale=${width}:-2:force_original_aspect_ratio=decrease[fg${i}]`);
      filter.push(`[bg${i}][fg${i}]overlay=(W-w)/2:(H-h)/2,setsar=1[v${i}]`);
    }else if(options.autoReframe){
      // Speaker crop is calculated in source pixels, then scaled once to 9:16.
      // This means panning/reframing is never constrained by a previously resized social frame.
      const crop=sourceCropForSpeaker(srcW,effectiveSrcH,width,height,part,editZoom);
      filter.push(`[0:v]trim=start=${srcA.toFixed(3)}:end=${srcB.toFixed(3)},setpts=PTS-STARTPTS${cropSourceSubtitles?`,crop=${srcW}:${effectiveSrcH}:0:0`:''},crop=${crop.cropW}:${crop.cropH}:${crop.x}:${crop.y},scale=${width}:${height}:flags=lanczos,setsar=1[v${i}]`);
    }else{
      let vf=`${cropSourceSubtitles?`crop=${srcW}:${effectiveSrcH}:0:0,`:''}scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`;
      if(editZoom>1.001){const zw=Math.max(width,Math.round(width*editZoom)),zh=Math.max(height,Math.round(height*editZoom));vf+=`,scale=${zw}:${zh},crop=${width}:${height}`;}
      filter.push(`[0:v]trim=start=${srcA.toFixed(3)}:end=${srcB.toFixed(3)},setpts=PTS-STARTPTS,${vf},setsar=1[v${i}]`);
    }
    if (hasAudio) filter.push(`[0:a]atrim=start=${srcA.toFixed(3)}:end=${srcB.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`);
  }

  let videoLabel = 'vcat';
  let audioLabel = 'acat';
  if (timeline.pieces.length === 1) {
    filter.push(`[v0]null[${videoLabel}]`);
    if (hasAudio) filter.push(`[a0]anull[${audioLabel}]`);
  } else {
    const concatInputs = timeline.pieces.map((_,i)=>`[v${i}]${hasAudio?`[a${i}]`:''}`).join('');
    if (hasAudio) filter.push(`${concatInputs}concat=n=${timeline.pieces.length}:v=1:a=1[${videoLabel}][${audioLabel}]`);
    else filter.push(`${timeline.pieces.map((_,i)=>`[v${i}]`).join('')}concat=n=${timeline.pieces.length}:v=1:a=0[${videoLabel}]`);
  }

  if (hideSourceSubtitles) {
    const bandH = Math.max(20, Math.round(height * options.sourceSubtitleBottom));
    filter.push(`[${videoLabel}]drawbox=x=0:y=ih-${bandH}:w=iw:h=${bandH}:color=black@0.72:t=fill[sourcecaptionhide]`);
    videoLabel = 'sourcecaptionhide';
  }

    let watermarkPath = null;
  if (options.watermarkUrl) {
    const filename = path.basename(options.watermarkUrl);
    const candidatePath = path.join(watermarksDir, filename);
    if (fsSync.existsSync(candidatePath)) watermarkPath = candidatePath;
  }
  if (watermarkPath) {
    const wmWidth = Math.max(32, Math.round(width * options.watermarkScale));
    const xExpr = `max(0,min(W-w,W*${options.watermarkX.toFixed(4)}-w/2))`;
    const yExpr = `max(0,min(H-h,H*${options.watermarkY.toFixed(4)}-h/2))`;
    filter.push(`[1:v]scale=${wmWidth}:-1:flags=lanczos,format=rgba,colorchannelmixer=aa=${options.watermarkOpacity.toFixed(3)}[wm]`);
    filter.push(`[${videoLabel}][wm]overlay=x='${xExpr}':y='${yExpr}':shortest=1[wmout]`);
    videoLabel = 'wmout';
  }

  let assFile = null;
  if (options.captions && meta.transcript?.captions?.length) {
    assFile = await writeEditedAss(meta, safeStart, timeline.keep, width, height, options).catch(() => null);
    if (assFile) {
      filter.push(`[${videoLabel}]subtitles='${ffmpegFilterPath(assFile)}'[vout]`);
      videoLabel = 'vout';
    }
  }

  const filterScriptPath = path.join(previewsDir, `${meta.id}-filter-${crypto.randomUUID()}.txt`);
  await fs.writeFile(filterScriptPath, filter.join(';'), 'utf8');
  const args = ['-y','-i',meta.sourcePath];
  if (watermarkPath) args.push('-loop','1','-i',watermarkPath);
  args.push('-/filter_complex',filterScriptPath,'-map',`[${videoLabel}]`);
  if (hasAudio) args.push('-map',`[${audioLabel}]`);
  args.push('-c:v','libx264','-preset',preview?'ultrafast':'veryfast','-crf',preview?'28':'21','-pix_fmt','yuv420p');
  if (hasAudio) args.push('-c:a','aac','-b:a',preview?'96k':'160k','-ac','2'); else args.push('-an');
  args.push('-movflags','+faststart',outputPath);
  try {
    await run('ffmpeg', args, { timeout: preview ? 12*60_000 : 45*60_000 });
  } finally {
    await fs.unlink(filterScriptPath).catch(() => {});
  }
  return {
    outputDuration: Number(timeline.keep.reduce((sum,x)=>sum+(x.end-x.start),0).toFixed(2)),
    output: { width, height, format: options.outputFormat, aspect: options.outputFormat==='shorts-9x16'?'9:16':'source' },
    autoDirector: resolved.profile,
    editPlan: plan,
    tracking: tracking?.summary || { samples:0,faceCountMax:0,speakerSwitches:0,reactionPeaks:0,mode:options.trackingMode,movement:options.cameraMovement },
    trackingWarning: tracking?.ok===false ? tracking.error : null,
    editApplied: {
      autoDirector: Boolean(resolved.profile),
      silenceCuts: options.silenceRemoval ? plan.summary.cuts : 0,
      speechCleanupCuts: options.cleanupMode==='speech' ? (plan.summary.disfluencies||0) : 0,
      cleanupMode: options.cleanupMode,
      zooms: options.dynamicZoom ? plan.summary.zooms : 0,
      zoomStyle: options.zoomStyle,
      reframed: options.autoReframe,
      speakerTracking: Boolean(options.speakerTracking && tracking?.keyframes?.length),
      dynamicSourceReframe: Boolean(options.autoReframe && tracking?.keyframes?.length),
      reframeEngine: options.autoReframe ? 'source-space-v4' : 'native',
      reactionDetection: options.reactionDetection,
      sceneAwareCuts: options.sceneAwareCuts,
      captions: Boolean(assFile),
      preset: options.preset,
      trackingMode: options.trackingMode,
      cameraMovement: options.cameraMovement,
      captionStyle: options.captionStyle,
      captionSize: options.captionSize,
      captionScale: options.captionScale,
      captionColor: options.captionColor,
      sourceSubtitleMode: options.sourceSubtitleMode,
      sourceSubtitleBottom: options.sourceSubtitleBottom,
      watermark: watermarkPath ? {
        url: options.watermarkUrl,
        x: options.watermarkX,
        y: options.watermarkY,
        scale: options.watermarkScale,
        opacity: options.watermarkOpacity
      } : null
    }
  };
}

async function analyzeProject(projectId, options = {}) {
  try {
    const meta = await readMeta(projectId);
    if(meta.campaignId){
      const campaignData=await readCampaigns().catch(()=>({campaigns:[]}));
      const latest=campaignData.campaigns.find(c=>c.id===meta.campaignId);
      if(latest)meta.campaign={...latest,totals:campaignTotals(latest)};
    }
    meta.status = 'analyzing';
    delete meta.processingInterruptedAt;
    meta.analysis = { ...(meta.analysis || {}), stage: 'Detecting scenes and audio', progress: 12, interrupted:false, error:null };
    await writeMeta(meta);
    const input = meta.sourcePath;
    const duration = meta.details.duration || 0;
    const clipCountPreference = options.clipCount ?? 'auto';
    meta.clipCountPreference = clipCountPreference;

    const [silenceResult, sceneResult] = await Promise.all([
      run('ffmpeg', ['-hide_banner','-i',input,'-vn','-af','silencedetect=noise=-34dB:d=0.35','-f','null','-'], { timeout: 20*60_000 }).catch(() => ({stderr:''})),
      run('ffmpeg', ['-hide_banner','-i',input,'-an','-vf',"select='gt(scene,0.30)',showinfo",'-vsync','vfr','-f','null','-'], { timeout: 20*60_000 }).catch(() => ({stderr:''}))
    ]);
    const silences = parseSilences(silenceResult.stderr);
    const scenes = parseScenes(sceneResult.stderr);
    const signalCandidates = buildCandidates(duration, scenes, silences);

    let candidates = signalCandidates;
    let transcript = meta.transcript || null;
    let aiError = null;
    const aiConfigured = true;

    if (aiConfigured) {
      try {
        meta.analysis = {
          scenesDetected: scenes.length,
          silencesDetected: silences.length,
          engine: 'FFmpeg + local Context Engine v3',
          stage: 'Transcribing speech',
          progress: 42,
          timeline: {
            scenes: scenes.slice(0, 1000),
            silences: silences.filter(s => Number(s.end||0) > Number(s.start||0)).slice(0, 2000)
          }
        };
        await writeMeta(meta);
        transcript = await transcribeLocally(meta);
        meta.transcript = transcript;
        meta.analysis = { ...meta.analysis, stage: 'Selecting semantic clips', progress: 72, transcription: transcript.model, wordCount: transcript.words.length };
        await writeMeta(meta);
        candidates = await semanticClipCandidatesLocal(meta, transcript, signalCandidates, clipCountPreference);
      } catch (err) {
        const rawAiError=String(err?.message||'Local AI analysis failed');
        console.warn('[analysis] Local transcription/AI fallback:', rawAiError);
        aiError = /metadata_errors|PyAV|av\.open/i.test(rawAiError)
          ? 'Local transcription is temporarily unavailable. ClipBoost continued with visual and audio-signal analysis.'
          : 'Local AI analysis could not complete. ClipBoost continued with deterministic clip selection.';
        candidates = transcript?.words?.length
          ? heuristicTranscriptCandidates(meta, transcript, signalCandidates, clipCountPreference)
          : selectDiverseCandidates(signalCandidates.filter(c=>Number(c.score||0)>=78), resolveClipTarget(duration, clipCountPreference), duration, clipCountPreference);
      }
    }

    for (let i=0; i<candidates.length; i++) {
      candidates[i].thumbnailUrl = await makeThumbnail(input, meta.id, candidates[i], i).catch(() => null);
      if (transcript) {
        const rows=captionsForRange(transcript, candidates[i].start, candidates[i].end);
        candidates[i].captions = meta.campaignId ? rows : compactCaptionRows(rows,{maxWords:4,maxChars:22,minWords:2});
      }
      candidates[i].editPlan = buildEditPlan(candidates[i], transcript, silences, 'balanced', 'dynamic', 'natural');
    }
    const semanticUsed=Boolean(candidates.some(x=>x?.signals?.semantic));
    const shortAssetMode=Boolean(candidates.some(x=>x?.signals?.shortAsset));
    const contextReviewed=Boolean(candidates.some(x=>x?.signals?.contextReviewed));
    if(!aiError && transcript?.words?.length && !semanticUsed && !shortAssetMode){
      const diag=meta.__ollamaDiagnostics||{};
      const errors=Array.isArray(diag.errors)?diag.errors.filter(Boolean):[];
      const first=String(errors[0]||'');
      if(errors.length){
        if(/ECONNREFUSED|fetch failed|connect|socket/i.test(first)) aiError='Ollama is not reachable at the configured URL. Start Ollama or verify Settings > Local AI. Deterministic quality selection was used.';
        else if(/timeout|timed out|AbortError/i.test(first)) aiError='Ollama timed out while selecting clips. The local model may be overloaded or too slow. Deterministic quality selection was used.';
        else if(/model.*not found|pull model|not found.*model/i.test(first)) aiError=`Ollama model "${localAiConfig().ollamaModel}" is not installed. Pull the configured model or change it in Settings. Deterministic quality selection was used.`;
        else if(/invalid JSON/i.test(first)) aiError='Ollama responded, but its clip-selection response was invalid JSON. Try another local model. Deterministic quality selection was used.';
        else aiError=`Ollama clip selection failed: ${first.slice(0,280)}. Deterministic quality selection was used.`;
      }else if(Number(diag.semanticGenerated||0)>0 && Number(diag.semanticSelected||0)===0){
        // Ollama did generate semantic moments, but the final context/diversity pass preferred
        // deterministic candidates. That is a valid quality decision, not an analysis failure.
        aiError=null;
      }else if(Number(diag.successes||0)>0 && Number(diag.emptyResponses||0)>=Number(diag.successes||0)) aiError='Ollama responded successfully but proposed no semantic moments for this source. Deterministic quality selection was used.';
      else if(Number(diag.successes||0)>0) aiError=null;
      else aiError='Ollama semantic selection did not run. Deterministic quality selection was used.';
    }
    const ollamaDiagnostics=meta.__ollamaDiagnostics?{
      successes:Number(meta.__ollamaDiagnostics.successes||0),
      emptyResponses:Number(meta.__ollamaDiagnostics.emptyResponses||0),
      semanticGenerated:Number(meta.__ollamaDiagnostics.semanticGenerated||0),
      semanticAfterReview:Number(meta.__ollamaDiagnostics.semanticAfterReview||0),
      semanticSelected:Number(meta.__ollamaDiagnostics.semanticSelected||0),
      reviewRemovedSemantic:Number(meta.__ollamaDiagnostics.reviewRemovedSemantic||0),
      errors:Array.isArray(meta.__ollamaDiagnostics.errors)?meta.__ollamaDiagnostics.errors.slice(0,5):[]
    }:null;
    delete meta.__ollamaDiagnostics;
    meta.status = aiError ? 'degraded' : 'ready';
    meta.updatedAt = new Date().toISOString();
    meta.analysis = {
      scenesDetected: scenes.length,
      silencesDetected: silences.length,
      engine: transcript ? 'FFmpeg + faster-whisper + Context Engine v3' : 'FFmpeg signal analysis',
      transcription: transcript?.model || 'not-configured',
      transcriptionPipeline: transcript?.pipeline || null,
      transcriptionWorkers: transcript?.workers || null,
      transcriptionWorkerMode: transcript?.workerMode || null,
      transcriptionCacheHits: transcript?.cacheHits || 0,
      wordCount: transcript?.words?.length || 0,
      captionCount: transcript?.captions?.length || 0,
      transcriptCleanup: transcript?.cleanup ? {
        removedWords: transcript.cleanup.removedWords || 0,
        repetitions: transcript.cleanup.repetitions || 0,
        fillers: transcript.cleanup.fillers || 0
      } : null,
      qualityEngine: transcript ? 'v4-quality' : null,
      stage: 'Ready',
      progress: 100,
      ollamaDiagnostics,
      aiConfigured: true,
      aiError,
      whisperStatus: transcript?.words?.length ? 'ok' : 'failed',
      semanticEngine: semanticUsed ? 'ollama' : 'heuristic-fallback',
      contextReview: contextReviewed ? 'ollama' : 'fallback',
      degraded: Boolean(aiError),
      clipCountPreference,
      clipTarget: clipCountPreference==='auto' ? 'quality-only' : resolveClipTarget(duration, clipCountPreference),
      clipSearchBudget: resolveClipTarget(duration, clipCountPreference),
      clipSelectionPolicy: clipCountPreference==='auto' ? 'strong-clips-only' : 'requested-count',
      clipsGenerated: candidates.length,
      timeline: {
        scenes: scenes.slice(0, 1000),
        silences: silences.filter(s => Number(s.end||0) > Number(s.start||0)).slice(0, 2000)
      }
    };
    meta.candidates = candidates;
    await writeMeta(meta);
    return meta;
  } catch (e) { throw e; }
}

const previewJobs = new Map();
function previewCacheKey(meta, start, end, options = {}) {
  const captionPreference = ['auto','on','off'].includes(String(options?.captionPreference||'').toLowerCase()) ? String(options.captionPreference).toLowerCase() : 'auto';
  const variant = JSON.stringify({
    ...normalizeRenderOptions(options),
    autoDirector: options?.autoDirector !== false,
    autoDirectorVersion: 'v4-layout-lock',
    // Bump independently from Auto Director so existing preview files are
    // regenerated whenever the ASS visual renderer changes.
    captionRendererVersion: 'social-effects-v3',
    captionPreference,
    captionColorPreference:String(options?.captionColor||'auto').toLowerCase()
  });
  const sourceVersion = String(meta?.updatedAt || meta?.createdAt || 'project');
  return crypto.createHash('sha1').update(`${meta?.id||'project'}:${sourceVersion}:${Number(start).toFixed(3)}:${Number(end).toFixed(3)}:${variant}`).digest('hex').slice(0,20);
}
async function ensureCandidatePreview(meta, start, end, options = {}) {
  const safeStart = Math.max(0, Number(start || 0));
  const maxDuration = Math.max(0.25, Number(meta?.details?.duration || 0));
  const safeEnd = Math.min(maxDuration, Math.max(safeStart + 0.25, Number(end || safeStart + 30)));
  if (!(safeEnd > safeStart)) throw Object.assign(new Error('Invalid preview range.'), { status: 400 });
  if (!meta?.sourcePath) throw Object.assign(new Error('Source file is not available for preview.'), { status: 409 });

  const key = previewCacheKey(meta, safeStart, safeEnd, options);
  const fileName = `${meta.id}-${key}.mp4`;
  const filePath = path.join(previewsDir, fileName);
  const renderMetaFile = `${filePath}.json`;
  if (fsSync.existsSync(filePath) && fsSync.statSync(filePath).size > 1024) {
    let renderInfo=null; try{renderInfo=JSON.parse(await fs.readFile(renderMetaFile,'utf8'))}catch{}
    return { url: `/media/previews/${fileName}`, start: safeStart, end: safeEnd, cached: true, edited: true, render:renderInfo };
  }

  if (!previewJobs.has(key)) {
    const job = (async () => {
      const tmpPath = `${filePath}.tmp.mp4`;
      await fs.rm(tmpPath, { force: true }).catch(() => {});
      try {
        const dimensions = renderDimensions(meta, options, { preview:true });
        const renderInfo = await renderEditedClip(meta, safeStart, safeEnd, tmpPath, options, { preview:true, width:dimensions.width, height:dimensions.height, outputFormat:dimensions.format });
        await fs.rename(tmpPath, filePath);
        await fs.writeFile(renderMetaFile,JSON.stringify(renderInfo),'utf8').catch(()=>{});
        return renderInfo;
      } finally {
        await fs.rm(tmpPath, { force: true }).catch(() => {});
      }
    })().finally(() => previewJobs.delete(key));
    previewJobs.set(key, job);
  }
  const renderInfo=await previewJobs.get(key);
  return { url: `/media/previews/${fileName}`, start: safeStart, end: safeEnd, cached: false, edited: true, render:renderInfo };
}

async function startBackgroundAnalysis(projectId, options = {}) {
  const id=String(projectId||'');
  if(projectTaskIsActive(id)) return await readMeta(id);
  const meta=await readMeta(id);
  meta.status='analyzing';
  meta.updatedAt=new Date().toISOString();
  meta.analysis={...(meta.analysis||{}),stage:'queued',progress:5,error:null,interrupted:false};
  await writeMeta(meta);
  void withProjectTask(id,()=>analyzeProject(id,options)).catch(async err=>{
    try{
      const current=await readMeta(id);
      current.status='failed';
      current.updatedAt=new Date().toISOString();
      current.analysis={...(current.analysis||{}),stage:'failed',progress:Number(current.analysis?.progress||0),error:err?.message||'Analysis failed',aiError:err?.message||'Analysis failed'};
      await writeMeta(current);
    }catch{}
    console.error('Background analysis failed:',err);
  });
  return meta;
}

registerVideoRoutes(app, { deletedProjectIds, startBackgroundAnalysis, readMeta, clipTextAbsolute, finalizeCandidate, ensureCandidatePreview, renderEditedClip, updateCampaigns, exportsDir, recoverInterruptedProject });

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Unexpected server error.' });
});

const port = Number(process.env.PORT || 8000);
if (process.env.NODE_ENV === 'production') {
  // Desktop runtime: serve the source UI directly. This avoids depending on a
  // Vite bundle inside Electron and keeps the local app deterministic.
  app.use('/src', express.static(path.join(root, 'src')));
  app.use('/assets', express.static(path.join(root, 'public', 'assets')));
  app.get(['/', '/index.html'], (req,res) => res.sendFile(path.join(root, 'index.html')));
  app.use((req,res,next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/media/')) return next();
    res.sendFile(path.join(root, 'index.html'));
  });
} else {
  const vite = await createViteServer({ root, server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
app.listen(port, '127.0.0.1', () => console.log(`ClipBoost running at http://127.0.0.1:${port}`));
