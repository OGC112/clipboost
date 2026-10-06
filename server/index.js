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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const storageRoot = process.env.CLIPBOOST_DATA_DIR ? path.resolve(process.env.CLIPBOOST_DATA_DIR) : path.join(root, 'storage');
const uploadsDir = path.join(storageRoot, 'uploads');
const metaDir = path.join(storageRoot, 'meta');
const exportsDir = process.env.CLIPBOOST_EXPORT_DIR ? path.resolve(process.env.CLIPBOOST_EXPORT_DIR) : path.join(storageRoot, 'exports');
const previewsDir = path.join(storageRoot, 'previews');
const trackingDir = path.join(storageRoot, 'tracking');
for (const dir of [uploadsDir, metaDir, exportsDir, previewsDir, trackingDir]) fsSync.mkdirSync(dir, { recursive: true });

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

const libraryFile = path.join(storageRoot, 'library.json');
const campaignsFile = path.join(storageRoot, 'campaigns.json');
const platformProfilesFile = path.join(storageRoot, 'campaign-platform-profiles.json');
const dataDir = storageRoot;

const settingsEnvPath = process.env.DOTENV_CONFIG_PATH ? path.resolve(process.env.DOTENV_CONFIG_PATH) : path.join(root, '.env');
const SETTINGS_KEYS = [
  'YOUTUBE_API_KEY','TWITCH_CLIENT_ID','TWITCH_CLIENT_SECRET',
  'PYTHON_BIN','LOCAL_WHISPER_MODEL','LOCAL_WHISPER_DEVICE','LOCAL_WHISPER_COMPUTE_TYPE',
  'LOCAL_WHISPER_CHUNK_SECONDS','LOCAL_WHISPER_WORKERS','LOCAL_WHISPER_CPU_THREADS','LOCAL_WHISPER_SKIP_SILENCE',
  'OLLAMA_URL','OLLAMA_MODEL','CLIPBOOST_EXPORT_DIR','CLIPBOOST_UPDATE_OWNER','CLIPBOOST_UPDATE_REPO',
  'YOUTUBE_AUTH_BROWSER','NODE_BIN','FFMPEG_BIN'
];
function parseEnvText(text='') {
  const out = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    const key = line.slice(0,idx).trim();
    let value = line.slice(idx+1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1,-1);
    out[key] = value;
  }
  return out;
}
function serializeEnv(map) {
  return Object.entries(map).map(([k,v]) => `${k}=${String(v ?? '').replace(/\r?\n/g,'')}`).join('\n') + '\n';
}
async function readSettingsEnv() {
  try { return parseEnvText(await fs.readFile(settingsEnvPath, 'utf8')); }
  catch { return {}; }
}
async function writeSettingsEnv(nextValues) {
  const current = await readSettingsEnv();
  for (const key of SETTINGS_KEYS) {
    if (Object.prototype.hasOwnProperty.call(nextValues, key)) current[key] = String(nextValues[key] ?? '').trim();
  }
  await fs.writeFile(settingsEnvPath, serializeEnv(current), 'utf8');
  for (const key of SETTINGS_KEYS) if (Object.prototype.hasOwnProperty.call(current, key)) process.env[key] = current[key];
  return current;
}
function maskSecret(value='') {
  const v = String(value || '');
  if (!v) return '';
  if (v.length <= 8) return '••••••••';
  return `${v.slice(0,4)}••••••••${v.slice(-4)}`;
}

function resolveWindowsTool(name, envKey, common = []) {
  const raw = String(process.env[envKey] || '').trim();
  const candidates = [];
  if (raw) {
    try {
      if (fsSync.existsSync(raw) && fsSync.statSync(raw).isDirectory()) candidates.push(path.join(raw, `${name}.exe`));
      else if (fsSync.existsSync(raw)) {
        if (path.basename(raw).toLowerCase() === `${name}.exe`) candidates.push(raw);
        else candidates.push(path.join(path.dirname(raw), `${name}.exe`));
      }
    } catch {}
  }
  candidates.push(...common);
  for (const candidate of candidates) {
    if (!candidate) continue;
    try { if (fsSync.existsSync(candidate) && fsSync.statSync(candidate).isFile()) return candidate; } catch {}
  }
  return null;
}

const windowsTools = process.platform === 'win32' ? {
  node: resolveWindowsTool('node','NODE_BIN',[
    'D:\\Apps\\NodeJS\\node.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs', 'node.exe')
  ]),
  ffmpeg: resolveWindowsTool('ffmpeg','FFMPEG_BIN',[
    'D:\\Apps\\FFmpeg\\bin\\ffmpeg.exe'
  ]),
  ffprobe: resolveWindowsTool('ffprobe','FFMPEG_BIN',[
    'D:\\Apps\\FFmpeg\\bin\\ffprobe.exe'
  ])
} : { node:null, ffmpeg:null, ffprobe:null };

if (process.platform === 'win32') {
  const extraDirs = [windowsTools.node, windowsTools.ffmpeg, windowsTools.ffprobe, path.join(root,'.venv','Scripts')]
    .filter(Boolean).map(x => fsSync.existsSync(x) && fsSync.statSync(x).isDirectory() ? x : path.dirname(x));
  const key = Object.prototype.hasOwnProperty.call(process.env,'Path') ? 'Path' : 'PATH';
  const current = String(process.env[key] || '');
  const unique = [...new Set(extraDirs.filter(Boolean))];
  if (unique.length) {
    process.env[key] = `${unique.join(path.delimiter)}${current ? path.delimiter + current : ''}`;
    process.env.PATH = process.env[key];
    process.env.Path = process.env[key];
  }
}

function runtimeCommand(command) {
  if (process.platform !== 'win32') return command;
  const base = String(path.basename(command || '')).toLowerCase().replace(/\.exe$/,'');
  if (base === 'ffmpeg' && windowsTools.ffmpeg) return windowsTools.ffmpeg;
  if (base === 'ffprobe' && windowsTools.ffprobe) return windowsTools.ffprobe;
  if (base === 'node' && windowsTools.node) return windowsTools.node;
  return command;
}


async function readLibrary() {
  try { return JSON.parse(await fs.readFile(libraryFile, 'utf8')); }
  catch { return { creators: [] }; }
}
async function writeLibrary(data) {
  await fs.writeFile(libraryFile, JSON.stringify(data, null, 2));
}

async function readCampaigns() {
  try {
    const parsed = JSON.parse(await fs.readFile(campaignsFile, 'utf8'));
    return Array.isArray(parsed?.campaigns) ? parsed : { campaigns: [] };
  } catch { return { campaigns: [] }; }
}
async function writeCampaigns(data) {
  await fs.writeFile(campaignsFile, JSON.stringify({ campaigns: Array.isArray(data?.campaigns) ? data.campaigns : [] }, null, 2));
}
async function readPlatformProfiles() {
  try { const parsed=JSON.parse(await fs.readFile(platformProfilesFile,'utf8')); return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{}; }
  catch { return {}; }
}
async function writePlatformProfiles(data) {
  await fs.writeFile(platformProfilesFile, JSON.stringify(data&&typeof data==='object'?data:{}, null, 2));
}
function platformProfileKey(provider='') { return String(provider||'').trim().toLowerCase().replace(/^www\./,'').slice(0,120); }
function campaignArray(value) {
  if (Array.isArray(value)) return value.map(x=>String(x||'').trim()).filter(Boolean);
  return String(value||'').split(/[\n,]/).map(x=>x.trim()).filter(Boolean);
}
function campaignPaymentModel(campaign={}) {
  const explicit=String(campaign.paymentModel||'').trim();
  if(['per-views','bounty-pool','fixed-reward','custom'].includes(explicit))return explicit;
  const legacy=String(campaign.payoutMode||'');
  if(legacy==='per-1000-views')return 'per-views';
  if(legacy==='threshold')return 'fixed-reward';
  return 'custom';
}
function campaignPlatformKey(value='') {
  const x=String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  if(x.includes('tiktok'))return 'tiktok';
  if(x.includes('instagram')||x.includes('reel'))return 'instagram';
  if(x.includes('youtube')||x.includes('short'))return 'youtube';
  if(x==='x'||x.includes('twitter'))return 'x';
  return x||'default';
}
function normalizePlatformPayouts(value={}) {
  let source=value;
  if(typeof source==='string'){try{source=JSON.parse(source)}catch{source={}}}
  if(!source||typeof source!=='object'||Array.isArray(source))return {};
  const out={};
  for(const [key,val] of Object.entries(source)){
    const n=Math.max(0,Number(val||0)||0);const k=campaignPlatformKey(key);if(k&&n>0)out[k]=n;
  }
  return out;
}
function campaignPlatformRate(campaign={}, platform='') {
  const rates=normalizePlatformPayouts(campaign.platformPayouts||{});const key=campaignPlatformKey(platform);
  if(Number(rates[key]||0)>0)return Number(rates[key]);
  if(Number(rates.default||0)>0)return Number(rates.default);
  return Math.max(0,Number(campaign.payout||campaign.fixedReward||0)||0);
}
function normalizeCampaign(input={}, existing={}) {
  const now = new Date().toISOString();
  const minDuration = Math.max(0, Number(input.minDuration ?? existing.minDuration ?? 0) || 0);
  const maxDurationRaw = Number(input.maxDuration ?? existing.maxDuration ?? 60) || 60;
  const maxDuration = Math.max(minDuration || 1, maxDurationRaw);
  const sourceUrlsRaw = input.sourceUrls ?? existing.sourceUrls ?? [];
  const sourceUrls = (Array.isArray(sourceUrlsRaw) ? sourceUrlsRaw : campaignArray(sourceUrlsRaw)).map((item, index) => {
    if (typeof item === 'string') return { id: crypto.createHash('sha1').update(item).digest('hex').slice(0,12), url:item.trim(), label:`Source ${index+1}`, addedAt:now };
    const url=String(item?.url||'').trim();
    return { id:String(item?.id||crypto.createHash('sha1').update(url||String(index)).digest('hex').slice(0,12)), url, label:String(item?.label||`Source ${index+1}`), addedAt:item?.addedAt||now };
  }).filter(x=>/^https?:\/\//i.test(x.url));
  const legacyMode=String(input.payoutMode ?? existing.payoutMode ?? '');
  const paymentModelRaw=String(input.paymentModel ?? existing.paymentModel ?? (legacyMode==='per-1000-views'?'per-views':legacyMode==='threshold'?'fixed-reward':'custom'));
  const paymentModel=['per-views','bounty-pool','fixed-reward','custom'].includes(paymentModelRaw)?paymentModelRaw:'custom';
  const qualificationViews=Math.max(0,Number(input.qualificationViews ?? input.viewThreshold ?? existing.qualificationViews ?? existing.viewThreshold ?? 0)||0);
  const scopeRaw=String(input.qualificationScope ?? existing.qualificationScope ?? (paymentModel==='per-views'?'per-post':'campaign-total'));
  const qualificationScope=['per-post','campaign-total'].includes(scopeRaw)?scopeRaw:(paymentModel==='per-views'?'per-post':'campaign-total');
  const legacyBasis=legacyMode==='per-1000-views'?1000:100000;
  const rateBasisViews=Math.max(1,Number(input.rateBasisViews ?? existing.rateBasisViews ?? legacyBasis)||legacyBasis);
  const fixedReward=Math.max(0,Number(input.fixedReward ?? input.payout ?? existing.fixedReward ?? existing.payout ?? 0)||0);
  const platformPayouts=normalizePlatformPayouts(input.platformPayouts ?? existing.platformPayouts ?? {});
  const accessRaw=String(input.accessMode ?? existing.accessMode ?? 'open');
  const accessMode=['open','private','application'].includes(accessRaw)?accessRaw:'open';
  const statusRaw=String(input.status ?? existing.status ?? 'active');
  const status=['active','paused','completed','closed'].includes(statusRaw)?statusRaw:'active';
  return {
    id: String(existing.id || input.id || crypto.randomUUID()),
    name: String(input.name ?? existing.name ?? 'Untitled campaign').trim().slice(0,160) || 'Untitled campaign',
    provider: String(input.provider ?? existing.provider ?? '').trim().slice(0,120),
    campaignUrl: String(input.campaignUrl ?? existing.campaignUrl ?? '').trim().slice(0,2000),
    brief: String(input.brief ?? existing.brief ?? '').trim().slice(0,30000),
    audience: String(input.audience ?? existing.audience ?? '').trim().slice(0,500),
    startDate: String(input.startDate ?? existing.startDate ?? '').trim().slice(0,80),
    paymentMethod: String(input.paymentMethod ?? existing.paymentMethod ?? '').trim().slice(0,120),
    accountLimit: String(input.accountLimit ?? existing.accountLimit ?? '').trim().slice(0,120),
    requirementsUrl: String(input.requirementsUrl ?? existing.requirementsUrl ?? '').trim().slice(0,2000),
    requirementsTitle: String(input.requirementsTitle ?? existing.requirementsTitle ?? '').trim().slice(0,300),
    requirements: campaignArray(input.requirements ?? existing.requirements ?? []).slice(0,120),
    violations: campaignArray(input.violations ?? existing.violations ?? []).slice(0,120),
    resourceUrls: (Array.isArray(input.resourceUrls ?? existing.resourceUrls) ? (input.resourceUrls ?? existing.resourceUrls) : []).map((item,index)=>({
      url:String(item?.url||item||'').trim().slice(0,2000),label:String(item?.label||`Resource ${index+1}`).trim().slice(0,160),
      kind:String(item?.kind||'external').trim().slice(0,40),videoCount:Math.max(0,Number(item?.videoCount||0)||0),imageCount:Math.max(0,Number(item?.imageCount||0)||0),mediaCount:Math.max(0,Number(item?.mediaCount||0)||0),inspectStatus:String(item?.inspectStatus||'').trim().slice(0,40),
      items:(Array.isArray(item?.items)?item.items:[]).map((child,childIndex)=>({url:String(child?.url||'').trim().slice(0,2000),label:String(child?.label||`Asset ${childIndex+1}`).trim().slice(0,160),kind:String(child?.kind||'media').trim().slice(0,30),videoCount:Math.max(0,Number(child?.videoCount||0)||0),imageCount:Math.max(0,Number(child?.imageCount||0)||0)})).filter(child=>/^https?:\/\//i.test(child.url)).slice(0,24)
    })).filter(x=>/^https?:\/\//i.test(x.url)).slice(0,80),
    referenceAssets: (Array.isArray(input.referenceAssets ?? existing.referenceAssets) ? (input.referenceAssets ?? existing.referenceAssets) : []).map((item,index)=>({
      url:String(item?.url||item||'').trim().slice(0,2000),label:String(item?.label||`Reference ${index+1}`).trim().slice(0,160),kind:String(item?.kind||'reference-image').trim().slice(0,40)
    })).filter(x=>/^https?:\/\//i.test(x.url)).slice(0,40),
    platformProfileKey: String(input.platformProfileKey ?? existing.platformProfileKey ?? '').trim().toLowerCase().slice(0,120),
    campaignStats: (input.campaignStats && typeof input.campaignStats==='object' ? input.campaignStats : existing.campaignStats && typeof existing.campaignStats==='object' ? existing.campaignStats : {}),
    importSource: String(input.importSource ?? existing.importSource ?? '').trim().slice(0,80),
    importedAt: String(input.importedAt ?? existing.importedAt ?? '').trim().slice(0,80),
    status,
    accessMode,
    platforms: campaignArray(input.platforms ?? existing.platforms ?? ['tiktok','instagram','youtube-shorts']).slice(0,10),
    minDuration,
    maxDuration,
    requiredHashtags: campaignArray(input.requiredHashtags ?? existing.requiredHashtags ?? []).slice(0,40),
    requiredMentions: campaignArray(input.requiredMentions ?? existing.requiredMentions ?? []).slice(0,40),
    requiredCTA: String(input.requiredCTA ?? existing.requiredCTA ?? '').trim().slice(0,1000),
    forbiddenTerms: campaignArray(input.forbiddenTerms ?? existing.forbiddenTerms ?? []).slice(0,80),
    deadline: String(input.deadline ?? existing.deadline ?? '').trim().slice(0,80),
    paymentModel,
    qualificationViews,
    qualificationScope,
    viewThreshold: qualificationViews,
    rateBasisViews,
    platformPayouts,
    fixedReward,
    payout: fixedReward,
    bountyPool: Math.max(0,Number(input.bountyPool ?? existing.bountyPool ?? 0)||0),
    maxPayout: Math.max(0,Number(input.maxPayout ?? existing.maxPayout ?? 0)||0),
    confirmedPayout: Math.max(0,Number(input.confirmedPayout ?? existing.confirmedPayout ?? 0)||0),
    currency: String(input.currency ?? existing.currency ?? 'USD').trim().toUpperCase().slice(0,8) || 'USD',
    payoutMode: paymentModel==='per-views'?'per-1000-views':paymentModel==='fixed-reward'?'threshold':'manual',
    sourceUrls,
    posts: Array.isArray(input.posts ?? existing.posts) ? (input.posts ?? existing.posts).slice(0,500) : [],
    usedMoments: Array.isArray(input.usedMoments ?? existing.usedMoments) ? (input.usedMoments ?? existing.usedMoments).slice(-1000) : [],
    createdAt: existing.createdAt || input.createdAt || now,
    updatedAt: now
  };
}
function campaignTotals(campaign={}) {
  const posts = Array.isArray(campaign.posts) ? campaign.posts : [];
  const totalViews = posts.reduce((sum,p)=>sum+Math.max(0,Number(p?.views||0)),0);
  const qualificationViews=Math.max(0,Number(campaign.qualificationViews ?? campaign.viewThreshold ?? 0)||0);
  const paymentModel=campaignPaymentModel(campaign);
  const rateBasisViews=Math.max(1,Number(campaign.rateBasisViews||100000)||100000);
  const confirmedPostPayout=posts.reduce((sum,p)=>sum+Math.max(0,Number(p?.payoutConfirmed||0)),0);
  const confirmedRevenue=Math.max(Math.max(0,Number(campaign.confirmedPayout||0)),confirmedPostPayout);
  const qualificationScope=String(campaign.qualificationScope|| (paymentModel==='per-views'?'per-post':'campaign-total'));
  const campaignQualified=qualificationViews<=0||totalViews>=qualificationViews;
  const eligiblePosts=qualificationScope==='campaign-total'?(campaignQualified?posts:[]):posts.filter(p=>qualificationViews<=0||Number(p?.views||0)>=qualificationViews);
  let estimatedRevenue=0;
  if(paymentModel==='per-views'){
    estimatedRevenue=eligiblePosts.reduce((sum,p)=>sum+(Math.max(0,Number(p?.views||0))/rateBasisViews)*campaignPlatformRate(campaign,p?.platform),0);
    const cap=Math.max(0,Number(campaign.maxPayout||0));if(cap>0)estimatedRevenue=Math.min(estimatedRevenue,cap);
  }else if(paymentModel==='fixed-reward'){
    const reward=Math.max(0,Number(campaign.fixedReward ?? campaign.payout ?? 0)||0);
    estimatedRevenue=qualificationViews>0&&totalViews>=qualificationViews?reward:0;
  }else{
    estimatedRevenue=confirmedRevenue;
  }
  const qualificationProgressViews=qualificationScope==='per-post'?posts.reduce((best,p)=>Math.max(best,Math.max(0,Number(p?.views||0))),0):totalViews;
  const remainingViews = qualificationViews>0 ? Math.max(0,qualificationViews-qualificationProgressViews) : 0;
  const progress = qualificationViews>0 ? Math.min(100,Math.round(qualificationProgressViews/qualificationViews*100)) : 0;
  const editingMinutes=posts.reduce((sum,p)=>sum+Math.max(0,Number(p?.editingMinutes||0)),0);
  const bestViews=posts.reduce((best,p)=>Math.max(best,Math.max(0,Number(p?.views||0))),0);
  const avgViews=posts.length?Math.round(totalViews/posts.length):0;
  const bestPost=posts.filter(p=>Number(p?.clipDuration||0)>0).sort((a,b)=>Number(b?.views||0)-Number(a?.views||0))[0]||null;
  const bestDuration=bestPost?Math.round(Number(bestPost.clipDuration||0)):0;
  const revenueForEfficiency=Math.max(estimatedRevenue,confirmedRevenue);
  const revenuePerHour=editingMinutes>0?(revenueForEfficiency/(editingMinutes/60)):0;
  const payoutPotential=paymentModel==='bounty-pool'?Math.max(0,Number(campaign.bountyPool||0)):paymentModel==='fixed-reward'?Math.max(0,Number(campaign.fixedReward??campaign.payout??0)):Math.max(0,Number(campaign.maxPayout||0));
  return { totalViews, estimatedRevenue:Number(estimatedRevenue.toFixed(2)), confirmedRevenue:Number(confirmedRevenue.toFixed(2)), remainingViews, progress, postCount:posts.length, usedMomentCount:(campaign.usedMoments||[]).length, editingMinutes, bestViews, avgViews, bestDuration, revenuePerHour:Number(revenuePerHour.toFixed(2)), qualificationViews, qualificationScope, qualificationProgressViews, paymentModel, rateBasisViews, payoutPotential, qualifiedPostCount:eligiblePosts.length, pendingPostCount:posts.filter(p=>String(p?.submissionStatus||'pending')==='pending').length, acceptedPostCount:posts.filter(p=>String(p?.submissionStatus||'')==='accepted').length };
}
function campaignSearchTerms(campaign={}) {
  const text=[campaign.name,campaign.brief,campaign.audience,campaign.requiredCTA,...(campaign.requiredHashtags||[]),...(campaign.requiredMentions||[]),...(campaign.requirements||[])].join(' ').toLowerCase();
  const stop=new Set(['this','that','with','from','your','have','will','pour','avec','dans','vous','nous','une','des','les','the','and','for','are','est','sur','mais','plus','moins','campagne','campaign']);
  return [...new Set((text.match(/[a-zà-ÿ0-9#@_-]{4,}/gi)||[]).map(x=>x.toLowerCase()).filter(x=>!stop.has(x)))].slice(0,32);
}
function campaignFitForCandidate(meta, candidate, quality={}) {
  const campaign = meta?.campaign;
  if (!campaign?.id) return null;
  const text=String(candidate?.selectionText||candidate?.hook||candidate?.reason||'').toLowerCase();
  const terms=campaignSearchTerms(campaign);
  const hits=terms.filter(t=>text.includes(t.replace(/^[@#]/,''))||text.includes(t)).length;
  const relevance=terms.length ? Math.min(100,Math.round(48+(hits/Math.min(10,terms.length))*52)) : 70;
  const duration=Math.max(0,Number(candidate?.end||0)-Number(candidate?.start||0));
  const minD=Math.max(0,Number(campaign.minDuration||0));
  const maxD=Math.max(minD||1,Number(campaign.maxDuration||60));
  const durationFit=duration>=minD&&duration<=maxD ? 100 : Math.max(20,100-Math.round(Math.min(Math.abs(duration-minD),Math.abs(duration-maxD))*6));
  const forbidden=(campaign.forbiddenTerms||[]).filter(x=>x&&text.includes(String(x).toLowerCase()));
  const used=(campaign.usedMoments||[]).some(m=>m.projectId===meta.id && Math.max(Number(m.start||0),Number(candidate.start||0)) < Math.min(Number(m.end||0),Number(candidate.end||0)));
  const history=campaignTotals(campaign);
  const historyDuration=history.bestDuration?Math.max(35,100-Math.round(Math.abs(duration-history.bestDuration)*5)):70;
  let fit=Math.round(relevance*.40+durationFit*.20+Number(quality?.retention||70)*.18+Number(quality?.completeness||70)*.14+historyDuration*.08);
  if(forbidden.length)fit=Math.min(fit,45);
  if(used)fit=Math.min(fit,55);
  return { score:clampScore(fit), relevance, durationFit, historyDuration, learnedBestDuration:history.bestDuration||0, forbidden, used, termsMatched:hits, termsTotal:terms.length };
}
function campaignCompliance(meta, candidate, options={}) {
  const campaign=meta?.campaign;
  if(!campaign?.id)return { enabled:false, passed:true, checks:[] };
  const duration=Math.max(0,Number(candidate?.end||0)-Number(candidate?.start||0));
  const text=String(candidate?.selectionText||candidate?.hook||'').toLowerCase();
  const checks=[];
  const add=(label,ok,detail)=>checks.push({label,ok:Boolean(ok),detail});
  add('Duration', duration>=Number(campaign.minDuration||0)&&duration<=Number(campaign.maxDuration||60), `${Math.round(duration)}s · required ${Number(campaign.minDuration||0)}–${Number(campaign.maxDuration||60)}s`);
  const forbidden=(campaign.forbiddenTerms||[]).filter(x=>text.includes(String(x).toLowerCase()));
  add('Forbidden terms', forbidden.length===0, forbidden.length?`Found: ${forbidden.join(', ')}`:'No blocked terms detected');
  add('Campaign brief relevance', Number(candidate?.campaignFit?.relevance||0)>=55, `${Math.round(candidate?.campaignFit?.relevance||0)} relevance score`);
  add('Vertical export', true, '1080×1920 final render');
  add('Captions', options?.captions!==false, options?.captions===false?'Captions disabled':'Captions enabled');
  if((campaign.requiredHashtags||[]).length)add('Required hashtags', true, `${campaign.requiredHashtags.join(' ')} saved for publishing`);
  if(campaign.requiredCTA)add('CTA', true, 'CTA saved in campaign publishing checklist');
  return { enabled:true, passed:checks.every(x=>x.ok), checks };
}
function parseCampaignSourceUrl(raw='') {
  const url=String(raw||'').trim();
  if(!/^https?:\/\//i.test(url))return null;
  try{
    const u=new URL(url); const host=u.hostname.replace(/^www\./,'').toLowerCase();
    if(host==='youtu.be')return {platform:'youtube',mediaType:'video',id:u.pathname.split('/').filter(Boolean)[0]||url,url};
    if(host.endsWith('youtube.com'))return {platform:'youtube',mediaType:'video',id:u.searchParams.get('v')||u.pathname.split('/').filter(Boolean).pop()||url,url};
    if(host==='clips.twitch.tv')return {platform:'twitch',mediaType:'clip',id:u.pathname.split('/').filter(Boolean)[0]||url,url};
    if(host.endsWith('twitch.tv')){
      const parts=u.pathname.split('/').filter(Boolean); const vi=parts.indexOf('videos');
      if(vi>=0&&parts[vi+1])return {platform:'twitch',mediaType:'vod',id:parts[vi+1],url};
      return {platform:'twitch',mediaType:'vod',id:parts.pop()||url,url};
    }
    return {platform:'external',mediaType:'video',id:crypto.createHash('sha1').update(url).digest('hex').slice(0,16),url};
  }catch{return null}
}
function htmlEntityDecode(text='') {
  return String(text).replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
}
function detectCampaignAccessWall(html='', url='') {
  const raw=String(html||'');
  const title=htmlEntityDecode((raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'').replace(/\s+/g,' ').trim();
  const text=htmlEntityDecode(raw.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()).slice(0,50000);
  const loginSignals=[/\bsign in\b/i,/\blog in\b/i,/continue with (?:google|discord|apple|facebook)/i,/welcome back/i,/sign in to your .*account/i,/forgot (?:your )?password/i];
  const botSignals=[/verify (?:that )?you are human/i,/checking your browser/i,/just a moment/i,/captcha/i,/access denied/i,/unusual traffic/i,/confirm you(?:'re| are) not a bot/i,/cf-chl-/i];
  const hasPassword=/<input[^>]+type=["']password["']/i.test(raw);
  const loginHits=loginSignals.filter(re=>re.test(`${title} ${text}`)).length;
  const botHit=botSignals.some(re=>re.test(`${raw.slice(0,150000)} ${text}`));
  const titleLooksAuth=/^(?:sign in|log in|login|welcome back)(?:\s*[|—-].*)?$/i.test(title);
  const campaignEvidence=/(?:campaign|bounty|payout|views? to qualify|clip(?:ping)? brief|required hashtags?)/i.test(text);
  if(botHit)return {blocked:true,reason:'verification'};
  if((hasPassword&&loginHits>=1)||(titleLooksAuth&&loginHits>=1)||(loginHits>=3&&!campaignEvidence))return {blocked:true,reason:'login'};
  return {blocked:false,reason:''};
}
function extractCampaignPage(html='', url='') {
  const getMeta=(key)=>{
    const esc=key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const re1=new RegExp(`<meta[^>]+(?:property|name)=["']${esc}["'][^>]+content=["']([^"']+)["']`,'i');
    const re2=new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${esc}["']`,'i');
    return htmlEntityDecode((html.match(re1)||html.match(re2)||[])[1]||'').trim();
  };
  const title=getMeta('og:title')||htmlEntityDecode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'').replace(/\s+/g,' ').trim();
  const description=getMeta('og:description')||getMeta('description');
  const cleaned=htmlEntityDecode(html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());
  const sourceMatches=[...String(html).matchAll(/https?:\\?\/\\?\/(?:www\.)?(?:youtube\.com\/watch\?v=[A-Za-z0-9_-]+|youtu\.be\/[A-Za-z0-9_-]+|twitch\.tv\/videos\/[0-9]+|clips\.twitch\.tv\/[A-Za-z0-9_-]+)/gi)].map(m=>m[0].replace(/\\\//g,'/'));
  const sourceUrls=[...new Set(sourceMatches)].slice(0,30);
  const lower=cleaned.toLowerCase();
  const platforms=[];if(/\btiktok\b/i.test(cleaned))platforms.push('tiktok');if(/\binstagram\b|\breels?\b/i.test(cleaned))platforms.push('instagram');if(/\byoutube\b|\bshorts?\b/i.test(cleaned))platforms.push('youtube-shorts');if(/\btwitter\b|(?:^|\s)x(?:\s|$)/i.test(cleaned))platforms.push('x');
  const compactNumber=(raw='')=>{const m=String(raw).trim().match(/([0-9]+(?:[.,][0-9]+)?)\s*([kKmM])?/);if(!m)return 0;let n=Number(m[1].replace(',','.'))||0;if(String(m[2]||'').toLowerCase()==='k')n*=1000;if(String(m[2]||'').toLowerCase()==='m')n*=1000000;return Math.round(n)};
  const minViewsMatch=cleaned.match(/(?:min(?:imum)?|at least|qualif(?:y|ication)[^0-9]{0,20})([0-9]+(?:[.,][0-9]+)?\s*[kKmM]?)[^a-z]{0,8}(?:views?)/i)||cleaned.match(/([0-9]+(?:[.,][0-9]+)?\s*[kKmM]?)\s+views?\s+to\s+qualify/i);
  const qualificationViews=minViewsMatch?compactNumber(minViewsMatch[1]):0;
  const bountyMatch=cleaned.match(/(?:bounty\s*(?:pot|pool)?)[^$€£0-9]{0,20}([$€£])?\s*([0-9]+(?:[.,][0-9]+)?\s*[kKmM]?)/i);
  const perMatch=cleaned.match(/([$€£])?\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:per|\/)[^0-9]{0,12}([0-9]+(?:[.,][0-9]+)?\s*[kKmM]?)\s*(?:views?)?/i);
  const symbol=(bountyMatch?.[1]||perMatch?.[1]||'');const currency=symbol==='€'?'EUR':symbol==='£'?'GBP':'USD';
  const accessMode=/apply\s+for\s+access|application\s+required/i.test(cleaned)?'application':/\bprivate\b/i.test(cleaned)?'private':'open';
  const draft={ name:title||'Imported campaign', provider:(()=>{try{return new URL(url).hostname.replace(/^www\./,'')}catch{return ''}})(), campaignUrl:url, brief:[description,cleaned.slice(0,10000)].filter(Boolean).join('\n\n').slice(0,12000), sourceUrls, accessMode };
  if(platforms.length)draft.platforms=platforms;
  if(qualificationViews)draft.qualificationViews=qualificationViews;
  if(bountyMatch){draft.paymentModel='bounty-pool';draft.bountyPool=compactNumber(bountyMatch[2]);draft.currency=currency}
  else if(perMatch){draft.paymentModel='per-views';draft.fixedReward=Math.max(0,Number(perMatch[2].replace(',','.'))||0);draft.payout=draft.fixedReward;draft.rateBasisViews=compactNumber(perMatch[3])||100000;draft.currency=currency}
  return draft;
}

function snapshotTextLines(snapshot={}) {
  return String(snapshot?.text || '').split(/\r?\n/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean).slice(0,12000);
}
function snapshotCompactNumber(raw='') {
  const m=String(raw||'').replace(/,/g,'').match(/([0-9]+(?:\.[0-9]+)?)\s*([kKmM])?/);
  if(!m)return 0;
  let n=Number(m[1])||0;const suffix=String(m[2]||'').toLowerCase();
  if(suffix==='k')n*=1000;else if(suffix==='m')n*=1000000;
  return Math.round(n);
}
function snapshotMoney(raw='') {
  const m=String(raw||'').match(/([$€£])\s*([0-9]+(?:[.,][0-9]+)?)/);
  if(!m)return null;
  return { symbol:m[1], amount:Math.max(0,Number(m[2].replace(',','.'))||0), currency:m[1]==='€'?'EUR':m[1]==='£'?'GBP':'USD' };
}
function snapshotLastLineAfter(lines=[], matcher) {
  let idx=-1;
  for(let i=0;i<lines.length;i++)if(matcher.test(lines[i]))idx=i;
  if(idx<0)return '';
  for(let i=idx+1;i<Math.min(lines.length,idx+6);i++){
    const value=String(lines[i]||'').trim();
    if(value&&!/^(audience|content|clip requirements|violations|campaign info|campaign details|program structure|bounties)$/i.test(value))return value;
  }
  return '';
}
function snapshotSection(lines=[], startMatcher, endMatcher) {
  let start=-1;
  for(let i=0;i<lines.length;i++)if(startMatcher.test(lines[i]))start=i;
  if(start<0)return [];
  let end=lines.length;
  for(let i=start+1;i<lines.length;i++){if(endMatcher.test(lines[i])){end=i;break}}
  return lines.slice(start+1,end).map(x=>String(x||'').trim()).filter(Boolean);
}
function snapshotCleanRuleLines(values=[]) {
  const skip=/^(contents|audience|content|clip requirements|violations|product|blog|contact|dashboard|sign out|clipper terms and conditions)$/i;
  const noise=/^(banned on all campaigns|anything below gets your clip disqualified|the full rules every campaign runs under)$/i;
  return [...new Set(values.map(x=>String(x||'').replace(/^[-•·]\s*/,'').trim()).filter(x=>x&&x.length<=1200&&!skip.test(x)&&!noise.test(x)&&!/^https?:\/\//i.test(x)))].slice(0,120);
}
function snapshotCampaignListingBlock(snapshot={},campaignName='') {
  const name=String(campaignName||snapshot?.focusName||'').trim().toLowerCase();
  const blocks=Array.isArray(snapshot?.blocks)?snapshot.blocks:[];
  const candidates=blocks.filter(x=>!name||String(x).toLowerCase().includes(name)).sort((a,b)=>String(a).length-String(b).length);
  return String(candidates.find(x=>/views?\s+to\s+qualify|up\s+to\s+per|bounty\s+pot|platforms?/i.test(String(x)))||candidates[0]||'');
}
function extractPlatformTermsProfile(snapshot={},provider='') {
  const key=platformProfileKey(provider);if(!key||!snapshot||!String(snapshot.text||'').trim())return null;
  const grouped=new Map();for(const item of (Array.isArray(snapshot.listItems)?snapshot.listItems:[])){
    const title=String(item?.section||'General').trim().slice(0,160)||'General', text=String(item?.text||'').replace(/^[-•·]\s*/,'').trim().slice(0,1200);if(!text)continue;
    if(!grouped.has(title))grouped.set(title,[]);const arr=grouped.get(title);if(!arr.includes(text)&&arr.length<40)arr.push(text);
  }
  const sections=[...grouped.entries()].filter(([,items])=>items.length).slice(0,30).map(([title,items])=>({title,items}));
  const text=String(snapshot.text||'');
  const postMin=text.match(/each post must reach at least\s+([0-9][0-9,._]*\s*[kKmM]?)\s+views?/i);
  const typical=text.match(/campaign minimum\s*\(typically\s+([0-9][0-9,._]*\s*[kKmM]?)\s+views?/i);
  const interval=text.match(/currently every\s+([0-9]+)\s+hours?/i);
  return {key,provider:key,sourceUrl:String(snapshot.url||'').slice(0,2000),updatedAt:new Date().toISOString(),sections,postMinimumViews:postMin?snapshotCompactNumber(postMin[1]):0,typicalCampaignMinimumViews:typical?snapshotCompactNumber(typical[1]):0,trackingIntervalHours:interval?Number(interval[1])||0:0,payoutCycleBased:/all payments are cycle-based/i.test(text)};
}
function extractAuthenticatedCampaignSnapshots(campaignSnapshot={}, requirementsSnapshot={}, requestedUrl='', listingSnapshot={}, resourceInspections=[]) {
  const campaignLines=snapshotTextLines(campaignSnapshot), reqLines=snapshotTextLines(requirementsSnapshot||{});
  const campaignText=campaignLines.join(' '), reqText=reqLines.join(' '), combined=`${campaignText} ${reqText}`;
  const headings=Array.isArray(campaignSnapshot?.headings)?campaignSnapshot.headings:[];
  const reqHeadings=Array.isArray(requirementsSnapshot?.headings)?requirementsSnapshot.headings:[];
  const generic=/^(campaigns?|dashboard|campaign info|campaign details|program structure|bounties|payouts?|your clips)$/i;
  const name=(headings.find(h=>h.level==='h1'&&h.text&&!generic.test(h.text))?.text || headings.find(h=>h.text&&!generic.test(h.text))?.text || '').trim().slice(0,160);
  const requirementsTitle=(reqHeadings.find(h=>h.level==='h1'&&h.text&&!generic.test(h.text))?.text || '').trim().slice(0,300);
  let provider='';try{provider=new URL(requestedUrl||campaignSnapshot?.url||'').hostname.replace(/^www\./,'')}catch{}
  const snapshotUrl=String(campaignSnapshot?.url||'').trim(),requested=String(requestedUrl||'').trim();
  const isListing=url=>{try{return /^\/dashboard\/campaigns\/?$/i.test(new URL(url).pathname)}catch{return false}};
  const canonicalCampaignUrl=(snapshotUrl&&!isListing(snapshotUrl)?snapshotUrl:requested)||snapshotUrl;
  const draft={
    name:name||requirementsTitle.split(/\s+[–—-]\s+/)[0]||'Imported campaign', provider, campaignUrl:String(canonicalCampaignUrl).slice(0,2000),
    brief:'', platforms:[], sourceUrls:[], resourceUrls:[], referenceAssets:[], requirements:[], violations:[], status:/\bactive\b/i.test(campaignText)?'active':'active', accessMode:'open',
    importSource:'authenticated-browser', importedAt:new Date().toISOString(), requirementsTitle
  };
  const listingBlock=snapshotCampaignListingBlock(listingSnapshot,name||requirementsTitle.split(/\s+[–—-]\s+/)[0]);
  const qualificationMatch=listingBlock.match(/\bmin(?:imum)?\s+([0-9]+(?:[.,][0-9]+)?\s*[kKmM]?)\s+views?\s+to\s+qualify/i);
  if(qualificationMatch){draft.qualificationViews=snapshotCompactNumber(qualificationMatch[1]);draft.viewThreshold=draft.qualificationViews;draft.qualificationScope='campaign-total';}
  const daysLeft=listingBlock.match(/\b([0-9]+)\s+days?\s+left\b/i);if(daysLeft&&Number(daysLeft[1])>0){const d=new Date();d.setDate(d.getDate()+Number(daysLeft[1]));draft.deadline=d.toISOString().slice(0,10);}
  const rate1=campaignText.match(/(?:bounty\s+rate|rate)\s+per\s+([0-9]+(?:[.,][0-9]+)?\s*[kKmM]?)\s*([$€£])\s*([0-9]+(?:[.,][0-9]+)?)/i);
  const rate2=campaignText.match(/([$€£])\s*([0-9]+(?:[.,][0-9]+)?)\s*\/\s*([0-9]+(?:[.,][0-9]+)?\s*[kKmM]?)/i);
  if(rate1){draft.paymentModel='per-views';draft.rateBasisViews=snapshotCompactNumber(rate1[1])||100000;draft.fixedReward=Math.max(0,Number(rate1[3].replace(',','.'))||0);draft.payout=draft.fixedReward;draft.currency=rate1[2]==='€'?'EUR':rate1[2]==='£'?'GBP':'USD'}
  else if(rate2){draft.paymentModel='per-views';draft.fixedReward=Math.max(0,Number(rate2[2].replace(',','.'))||0);draft.payout=draft.fixedReward;draft.rateBasisViews=snapshotCompactNumber(rate2[3])||100000;draft.currency=rate2[1]==='€'?'EUR':rate2[1]==='£'?'GBP':'USD'}
  else { const money=snapshotMoney(campaignText); if(money){draft.paymentModel='custom';draft.currency=money.currency} }
  const startDate=snapshotLastLineAfter(campaignLines,/^start date$/i);if(/^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/.test(startDate))draft.startDate=startDate;
  const paymentMethod=snapshotLastLineAfter(campaignLines,/^payment method$/i);if(paymentMethod)draft.paymentMethod=paymentMethod.slice(0,120);
  const accountLimit=snapshotLastLineAfter(campaignLines,/^account limit$/i);if(accountLimit)draft.accountLimit=accountLimit.slice(0,120);
  const audience=snapshotLastLineAfter(reqLines,/^audience$/i);if(audience&&!/^(content|clip requirements|violations)$/i.test(audience))draft.audience=audience.slice(0,500);
  const allLinks=[...(Array.isArray(campaignSnapshot?.links)?campaignSnapshot.links:[]),...(Array.isArray(requirementsSnapshot?.links)?requirementsSnapshot.links:[])];
  const reqLink=allLinks.find(x=>/\/campaigns\/doc\//i.test(String(x?.href||'')));if(reqLink)draft.requirementsUrl=String(reqLink.href).slice(0,2000);
  const seenSource=new Set(),seenResource=new Set(),seenReference=new Set();const inspectionByUrl=new Map((Array.isArray(resourceInspections)?resourceInspections:[]).map(x=>[String(x?.url||''),x]));
  for(const item of (Array.isArray(requirementsSnapshot?.links)?requirementsSnapshot.links:[])){
    const href=String(item?.href||'').trim(),label=String(item?.text||'').trim()||'Campaign resource',section=String(item?.section||'').trim();if(!/^https?:\/\//i.test(href))continue;
    let host='';try{host=new URL(href).hostname.replace(/^www\./,'').toLowerCase()}catch{}
    const directSource=/^(trailer|source(?:\s*#?\d+)?)$/i.test(label)||/^(content|sources?)$/i.test(section);
    const assetPack=/^(assets?(?:\s*#?\d+)?|media(?:\s*#?\d+)?)$/i.test(label)||(/^(content|assets?|media)$/i.test(section)&&!/^downloads?$/i.test(label));
    const referenceDownload=/^downloads?$/i.test(label)&&/clip requirements|requirements|branding|content/i.test(section);
    if(/(?:youtube\.com|youtu\.be|twitch\.tv)$/.test(host)||host.endsWith('.youtube.com')||host.endsWith('.twitch.tv')){if((directSource||assetPack)&&!seenSource.has(href)){seenSource.add(href);draft.sourceUrls.push({url:href,label:label.slice(0,160)})};continue}
    if(referenceDownload&&host){if(!seenReference.has(href)){seenReference.add(href);draft.referenceAssets.push({url:href,label:`Reference image ${draft.referenceAssets.length+1}`,kind:'reference-image'})};continue}
    if(assetPack&&host&&host!==provider&&!/clipping\.net$/i.test(host)){if(!seenResource.has(href)){seenResource.add(href);const info=inspectionByUrl.get(href)||{};draft.resourceUrls.push({url:href,label:label.slice(0,160),kind:String(info.kind||'asset-pack'),videoCount:Number(info.videoCount||0),imageCount:Number(info.imageCount||0),mediaCount:Number(info.mediaCount||0),declaredItemCount:Number(info.declaredItemCount||0),visibleAssetCount:Number(info.visibleAssetCount||0),observedItemCount:Number(info.observedItemCount||0),videoCountExact:Boolean(info.videoCountExact),multipleVideoEvidence:Boolean(info.multipleVideoEvidence),inspectStatus:String(info.inspectStatus||''),items:Array.isArray(info.items)?info.items:[]})}}
  }
  // Asset viewers visited by the user are authoritative campaign resources too. This is
  // required for providers such as Frame.io where the campaign page may expose a generic
  // reference download separately from the actual video viewer.
  for(const info of resourceInspections){
    const href=String(info?.url||'').trim();if(!/^https?:\/\//i.test(href)||seenResource.has(href))continue;
    let host='';try{host=new URL(href).hostname.replace(/^www\./,'').toLowerCase()}catch{}
    if(!host||host===provider||/clipping\.net$/i.test(host))continue;
    const kind=String(info?.kind||'asset-pack');
    const videoCount=Number(info?.videoCount||0),mediaCount=Number(info?.mediaCount||0);
    if(videoCount<=0&&mediaCount<=0&&!/(?:^|\.)frame\.io$/i.test(host))continue;
    seenResource.add(href);
    draft.resourceUrls.push({url:href,label:String(info?.label||'Campaign asset').slice(0,160),kind,videoCount,imageCount:Number(info?.imageCount||0),mediaCount:Math.max(mediaCount,videoCount),declaredItemCount:Number(info?.declaredItemCount||0),visibleAssetCount:Number(info?.visibleAssetCount||0),observedItemCount:Number(info?.observedItemCount||0),videoCountExact:Boolean(info?.videoCountExact),multipleVideoEvidence:Boolean(info?.multipleVideoEvidence),inspectStatus:String(info?.inspectStatus||'visited'),items:Array.isArray(info?.items)?info.items:[]});
  }
  const reqList=(Array.isArray(requirementsSnapshot?.listItems)?requirementsSnapshot.listItems:[]).filter(x=>/clip requirements/i.test(String(x?.section||''))).map(x=>x.text);
  const vioList=(Array.isArray(requirementsSnapshot?.listItems)?requirementsSnapshot.listItems:[]).filter(x=>/violations/i.test(String(x?.section||''))).map(x=>x.text);
  draft.requirements=snapshotCleanRuleLines(reqList.length?reqList:snapshotSection(reqLines,/^clip requirements$/i,/^violations$/i));
  draft.violations=snapshotCleanRuleLines(vioList.length?vioList:snapshotSection(reqLines,/^violations$/i,/^(?:clipper terms|terms and conditions)$/i));
  const platformSection=snapshotSection(campaignLines,/^platforms?$/i,/^(?:min(?:imum)?|campaign|bount|payout|payment|start date|your clips|your views)$/i).join(' ');
  const platforms=[];if(/\btiktok\b/i.test(platformSection))platforms.push('tiktok');if(/\binstagram\b|\breels?\b/i.test(platformSection))platforms.push('instagram');if(/\byoutube\b|\bshorts?\b/i.test(platformSection))platforms.push('youtube-shorts');if(/\btwitter\b|(?:^|\s)x(?:\s|$)/i.test(platformSection))platforms.push('x');draft.platforms=[...new Set(platforms)];
  const clipValue=snapshotLastLineAfter(campaignLines,/^your clips$/i),viewValue=snapshotLastLineAfter(campaignLines,/^your views$/i);
  draft.campaignStats={ yourClips:snapshotCompactNumber(clipValue), yourViews:snapshotCompactNumber(viewValue) };
  const publicStats=campaignText.match(/([0-9]+(?:[.,][0-9]+)?\s*[kKmM]?)\s+clips?\s+([0-9]+(?:[.,][0-9]+)?\s*[kKmM]?)\s+views?/i);if(publicStats){draft.campaignStats.publicClips=snapshotCompactNumber(publicStats[1]);draft.campaignStats.publicViews=snapshotCompactNumber(publicStats[2])}
  const budget=campaignText.match(/([0-9]+(?:[.,][0-9]+)?)%\s+filled/i);if(budget)draft.campaignStats.budgetFilledPercent=Math.max(0,Math.min(100,Number(budget[1].replace(',','.'))||0));
  return draft;
}

function youtubeKey() {
  const key = String(process.env.YOUTUBE_API_KEY || '').trim();
  if (!key) throw Object.assign(new Error('YOUTUBE_API_KEY is missing. Add it to .env and restart ClipBoost.'), { status: 503 });
  return key;
}
async function youtubeGet(endpoint, params = {}) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  Object.entries({ ...params, key: youtubeKey() }).forEach(([k,v]) => v !== undefined && v !== null && url.searchParams.set(k, String(v)));
  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || `YouTube API request failed (${response.status}).`;
    throw Object.assign(new Error(message), { status: response.status });
  }
  return body;
}
function parseYoutubeInput(raw = '') {
  const input = String(raw).trim();
  if (!input) throw Object.assign(new Error('Enter a YouTube @handle, channel URL, or channel ID.'), { status: 400 });
  if (/^UC[\w-]{20,}$/i.test(input)) return { id: input };
  if (input.startsWith('@')) return { forHandle: input };
  try {
    const u = new URL(input.includes('://') ? input : `https://${input}`);
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] === 'channel' && parts[1]) return { id: parts[1] };
    if (parts[0]?.startsWith('@')) return { forHandle: parts[0] };
    if (parts[0] === 'user' && parts[1]) return { forUsername: parts[1] };
  } catch {}
  return { forHandle: input.startsWith('@') ? input : `@${input.replace(/^@/, '')}` };
}
function isoDurationToSeconds(value='PT0S') {
  const m = String(value).match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!m) return 0;
  return (Number(m[1]||0)*86400)+(Number(m[2]||0)*3600)+(Number(m[3]||0)*60)+Number(m[4]||0);
}
function formatYoutubeVideo(item, details = {}) {
  const snippet = item.snippet || details.snippet || {};
  const videoId = item.contentDetails?.videoId || snippet.resourceId?.videoId || details.id;
  const thumbs = snippet.thumbnails || details.snippet?.thumbnails || {};
  return {
    id: videoId,
    title: snippet.title || details.snippet?.title || 'Untitled video',
    publishedAt: item.contentDetails?.videoPublishedAt || snippet.publishedAt || details.snippet?.publishedAt || null,
    thumbnail: thumbs.maxres?.url || thumbs.standard?.url || thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url || null,
    duration: isoDurationToSeconds(details.contentDetails?.duration),
    isShort: isoDurationToSeconds(details.contentDetails?.duration) > 0 && isoDurationToSeconds(details.contentDetails?.duration) <= 180,
    viewCount: Number(details.statistics?.viewCount || 0),
    likeCount: Number(details.statistics?.likeCount || 0),
    url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : null
  };
}

const youtubeSearchCache = new Map();
function youtubeChannelSummary(channel) {
  const thumbnails = channel.snippet?.thumbnails || {};
  return {
    platform: 'youtube',
    id: channel.id,
    handle: channel.snippet?.customUrl || null,
    name: channel.snippet?.title || 'YouTube creator',
    description: channel.snippet?.description || '',
    avatar: thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url || null,
    subscribers: Number(channel.statistics?.subscriberCount || 0),
    totalViews: Number(channel.statistics?.viewCount || 0),
    videoCount: Number(channel.statistics?.videoCount || 0),
    channelUrl: channel.snippet?.customUrl ? `https://www.youtube.com/${channel.snippet.customUrl}` : `https://www.youtube.com/channel/${channel.id}`
  };
}
async function searchYoutubeCreators(rawQuery) {
  const query = String(rawQuery || '').trim();
  if (query.length < 2) return [];
  const cacheKey = query.toLowerCase();
  const cached = youtubeSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.results;

  const parsed = parseYoutubeInput(query);
  const looksExact = query.startsWith('@') || /^UC[\w-]{20,}$/i.test(query) || /youtube\.com/i.test(query);
  let channels = [];
  if (looksExact) {
    const exact = await youtubeGet('channels', { part: 'snippet,statistics', ...parsed });
    channels = exact.items || [];
  } else {
    const search = await youtubeGet('search', { part: 'snippet', type: 'channel', q: query, maxResults: 6 });
    const ids = (search.items || []).map(item => item.snippet?.channelId || item.id?.channelId).filter(Boolean);
    if (ids.length) {
      const details = await youtubeGet('channels', { part: 'snippet,statistics', id: ids.join(',') });
      const map = new Map((details.items || []).map(c => [c.id, c]));
      channels = ids.map(id => map.get(id)).filter(Boolean);
    }
  }
  const results = channels.map(youtubeChannelSummary);
  youtubeSearchCache.set(cacheKey, { at: Date.now(), results });
  return results;
}
async function fetchYoutubeUploadsPage(playlistId, pageToken = null) {
  if (!playlistId) return { videos: [], nextPageToken: null };
  const playlist = await youtubeGet('playlistItems', {
    part: 'snippet,contentDetails',
    playlistId,
    maxResults: 50,
    pageToken: pageToken || undefined
  });
  const ids = (playlist.items || []).map(x => x.contentDetails?.videoId || x.snippet?.resourceId?.videoId).filter(Boolean);
  let detailMap = new Map();
  if (ids.length) {
    const details = await youtubeGet('videos', { part: 'snippet,contentDetails,statistics', id: ids.join(',') });
    detailMap = new Map((details.items || []).map(v => [v.id, v]));
  }
  const videos = (playlist.items || []).map(item => {
    const id = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
    const details = detailMap.get(id);
    return details ? formatYoutubeVideo(item, details) : null;
  }).filter(Boolean);
  return { videos, nextPageToken: playlist.nextPageToken || null };
}

function youtubeRecentCutoffDate() {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - 3);
  return d;
}

async function fetchYoutubeRecentWindow(playlistId) {
  const cutoff = youtubeRecentCutoffDate();
  let pageToken = null;
  let nextPageToken = null;
  let videos = [];
  let pages = 0;
  // Upload playlists are newest-first. Fetch only until we cross the 3-month
  // boundary, then keep the returned nextPageToken for explicit older-history loading.
  do {
    const page = await fetchYoutubeUploadsPage(playlistId, pageToken);
    videos = mergeYoutubeVideos(videos, page.videos || []);
    nextPageToken = page.nextPageToken || null;
    pages += 1;
    const oldest = (page.videos || []).reduce((min, v) => {
      const t = new Date(v.publishedAt || 0).getTime();
      return t && t < min ? t : min;
    }, Infinity);
    if (!nextPageToken || oldest <= cutoff.getTime()) break;
    pageToken = nextPageToken;
  } while (pages < 20);
  return { videos, nextPageToken, cutoff: cutoff.toISOString(), pages };
}

function mergeYoutubeVideos(fresh = [], existing = []) {
  const map = new Map();
  for (const video of [...fresh, ...existing]) if (video?.id && !map.has(video.id)) map.set(video.id, video);
  return [...map.values()].sort((a,b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
}

async function fetchYoutubeCreator(input, existingCreator = null) {
  const filter = parseYoutubeInput(input);
  const channels = await youtubeGet('channels', { part: 'snippet,contentDetails,statistics', ...filter });
  const channel = channels.items?.[0];
  if (!channel) throw Object.assign(new Error('YouTube channel not found. Try its @handle or /channel/ URL.'), { status: 404 });
  const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
  const recentWindow = await fetchYoutubeRecentWindow(uploads);
  const thumbnails = channel.snippet?.thumbnails || {};
  const previousVideos = existingCreator?.id === channel.id ? (existingCreator.videos || []) : [];
  return {
    platform: 'youtube',
    id: channel.id,
    handle: channel.snippet?.customUrl || null,
    name: channel.snippet?.title || 'YouTube creator',
    description: channel.snippet?.description || '',
    avatar: thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url || null,
    subscribers: Number(channel.statistics?.subscriberCount || 0),
    totalViews: Number(channel.statistics?.viewCount || 0),
    videoCount: Number(channel.statistics?.videoCount || 0),
    channelUrl: channel.snippet?.customUrl ? `https://www.youtube.com/${channel.snippet.customUrl}` : `https://www.youtube.com/channel/${channel.id}`,
    uploadsPlaylistId: uploads || null,
    videos: mergeYoutubeVideos(recentWindow.videos, previousVideos),
    youtubeNextPageToken: recentWindow.nextPageToken,
    youtubeHistoryInitialized: true,
    youtubeRecentCutoff: recentWindow.cutoff,
    refreshedAt: new Date().toISOString()
  };
}


function twitchConfig() {
  const clientId = String(process.env.TWITCH_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.TWITCH_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) {
    throw Object.assign(new Error('Twitch API is not configured. Add TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET to .env, then restart ClipBoost.'), { status: 503 });
  }
  return { clientId, clientSecret };
}

let twitchTokenCache = { token: '', expiresAt: 0 };
async function twitchAccessToken() {
  if (twitchTokenCache.token && twitchTokenCache.expiresAt > Date.now() + 60_000) return twitchTokenCache.token;
  const { clientId, clientSecret } = twitchConfig();
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' });
  const response = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw Object.assign(new Error(data.message || 'Could not authenticate with Twitch.'), { status: response.status || 502 });
  twitchTokenCache = { token: data.access_token, expiresAt: Date.now() + Math.max(60, Number(data.expires_in || 3600)) * 1000 };
  return data.access_token;
}

async function twitchGet(endpoint, params = {}) {
  const { clientId } = twitchConfig();
  const token = await twitchAccessToken();
  const url = new URL(`https://api.twitch.tv/helix/${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) value.forEach(v => url.searchParams.append(key, String(v)));
    else url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, { headers: { 'Client-Id': clientId, 'Authorization': `Bearer ${token}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body?.message || `Twitch API request failed (${response.status}).`), { status: response.status });
  return body;
}

function parseTwitchInput(raw = '') {
  const input = String(raw).trim();
  if (!input) throw Object.assign(new Error('Enter a Twitch username or channel URL.'), { status: 400 });
  try {
    const u = new URL(input.includes('://') ? input : `https://${input}`);
    if (/twitch\.tv$/i.test(u.hostname) || /www\.twitch\.tv$/i.test(u.hostname)) {
      const login = u.pathname.split('/').filter(Boolean)[0];
      if (login) return login.toLowerCase();
    }
  } catch {}
  return input.replace(/^@/, '').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
}

function twitchDurationToSeconds(value = '') {
  const m = String(value).match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/i);
  return (Number(m?.[1] || 0) * 3600) + (Number(m?.[2] || 0) * 60) + Number(m?.[3] || 0);
}
function twitchThumb(url = '', width = 640, height = 360) {
  return String(url || '').replace(/%\{width\}/g, String(width)).replace(/%\{height\}/g, String(height));
}
function twitchUserSummary(user, extra = {}) {
  return {
    platform: 'twitch', id: user.id, login: user.login, handle: user.login,
    name: user.display_name || user.login || 'Twitch creator', description: user.description || '',
    avatar: user.profile_image_url || extra.thumbnail_url || null,
    channelUrl: `https://www.twitch.tv/${user.login}`,
    isLive: Boolean(extra.is_live), gameName: extra.game_name || null, title: extra.title || null
  };
}

const twitchSearchCache = new Map();
async function searchTwitchCreators(rawQuery) {
  const query = String(rawQuery || '').trim();
  if (query.length < 2) return [];
  const cacheKey = query.toLowerCase();
  const cached = twitchSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.results;
  const search = await twitchGet('search/channels', { query, first: 8, live_only: false });
  const rows = search.data || [];
  const logins = rows.map(x => x.broadcaster_login).filter(Boolean);
  let users = [];
  if (logins.length) users = (await twitchGet('users', { login: logins })).data || [];
  const rowMap = new Map(rows.map(x => [String(x.broadcaster_login || '').toLowerCase(), x]));
  const results = users.map(u => twitchUserSummary(u, rowMap.get(String(u.login || '').toLowerCase()) || {}));
  twitchSearchCache.set(cacheKey, { at: Date.now(), results });
  return results;
}

async function fetchTwitchCreator(input) {
  const login = parseTwitchInput(input);
  const users = await twitchGet('users', { login });
  const user = users.data?.[0];
  if (!user) throw Object.assign(new Error('Twitch channel not found. Try the streamer username or Twitch channel URL.'), { status: 404 });
  // Fetch every public video type (archives, highlights and uploads). Some Twitch
  // channels do not keep archive VODs, so filtering to type=archive can incorrectly make
  // a channel look empty even though public videos exist.
  const [videosRes, clipsRes, streamsRes, channelsRes] = await Promise.all([
    twitchGet('videos', { user_id: user.id, first: 100 }),
    // Omitting a date window lets Twitch return the broadcaster's available clips instead
    // of restricting results to an arbitrary recent period.
    twitchGet('clips', { broadcaster_id: user.id, first: 100 }),
    twitchGet('streams', { user_id: user.id, first: 1 }),
    twitchGet('channels', { broadcaster_id: user.id })
  ]);
  const channel = channelsRes.data?.[0] || {};
  const stream = streamsRes.data?.[0] || null;
  const vods = (videosRes.data || []).map(v => ({
    id: v.id, type: 'vod', videoType: v.type || 'archive', title: v.title || 'Untitled VOD', description: v.description || '',
    createdAt: v.created_at || v.published_at || null, publishedAt: v.published_at || v.created_at || null,
    thumbnail: twitchThumb(v.thumbnail_url), duration: twitchDurationToSeconds(v.duration), viewCount: Number(v.view_count || 0),
    url: v.url || `https://www.twitch.tv/videos/${v.id}`, language: v.language || null,
    viewable: v.viewable || 'public'
  }));
  const clips = (clipsRes.data || []).map(c => ({
    id: c.id, type: 'clip', title: c.title || 'Untitled clip', creatorName: c.creator_name || '',
    createdAt: c.created_at || null, publishedAt: c.created_at || null, thumbnail: c.thumbnail_url || null,
    duration: Number(c.duration || 0), viewCount: Number(c.view_count || 0), url: c.url || null,
    embedUrl: c.embed_url || null, videoId: c.video_id || null, vodOffset: c.vod_offset ?? null,
    isFeatured: Boolean(c.is_featured)
  }));
  return {
    ...twitchUserSummary(user, { is_live: Boolean(stream), game_name: stream?.game_name || channel.game_name, title: stream?.title || channel.title }),
    broadcasterType: user.broadcaster_type || '', totalViews: Number(user.view_count || 0),
    live: stream ? { id: stream.id, title: stream.title, viewerCount: Number(stream.viewer_count || 0), startedAt: stream.started_at, gameName: stream.game_name, thumbnail: twitchThumb(stream.thumbnail_url) } : null,
    vods, clips, refreshedAt: new Date().toISOString()
  };
}

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
    const consume = chunk => {
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
    proc.on('error', reject);
    proc.on('close', code => code === 0 ? resolve({stdout,stderr}) : reject(new Error(stderr.trim() || stdout.trim() || `yt-dlp exited with code ${code}`)));
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
  await fs.writeFile(path.join(metaDir, `${meta.id}.json`), JSON.stringify(meta, null, 2));
}




app.get('/api/campaigns', async (req,res,next) => {
  try {
    const data=await readCampaigns();const profiles=await readPlatformProfiles();
    res.json({ campaigns:data.campaigns.map(c=>({ ...c, platformProfile:c.platformProfileKey?profiles[c.platformProfileKey]||null:null, totals:campaignTotals(c) })) });
  } catch(e){ next(e); }
});
app.post('/api/campaigns', async (req,res,next) => {
  try {
    const data=await readCampaigns();
    const campaign=normalizeCampaign(req.body||{});
    data.campaigns.unshift(campaign); await writeCampaigns(data);
    res.json({ ...campaign, totals:campaignTotals(campaign) });
  } catch(e){ next(e); }
});
app.post('/api/campaigns/import-snapshot', async (req,res,next) => {
  try {
    const url=String(req.body?.url||req.body?.campaign?.url||'').trim();
    if(!/^https?:\/\//i.test(url))return res.status(400).json({error:'Enter a valid campaign URL.'});
    const campaign=req.body?.campaign&&typeof req.body.campaign==='object'?req.body.campaign:{};
    const requirements=req.body?.requirements&&typeof req.body.requirements==='object'?req.body.requirements:{};
    const listing=req.body?.listing&&typeof req.body.listing==='object'?req.body.listing:{};
    const terms=req.body?.terms&&typeof req.body.terms==='object'?req.body.terms:{};
    const resourceInspections=Array.isArray(req.body?.resourceInspections)?req.body.resourceInspections:[];
    const draft=extractAuthenticatedCampaignSnapshots(campaign,requirements,url,listing,resourceInspections);
    if(!draft.name||draft.name==='Imported campaign')return res.status(422).json({error:'ClipBoost could not identify a campaign on this page. Keep the campaign page open after signing in and try again.'});
    const profile=extractPlatformTermsProfile(terms,draft.provider);if(profile&&profile.sections.length){const profiles=await readPlatformProfiles();profiles[profile.key]=profile;await writePlatformProfiles(profiles);draft.platformProfileKey=profile.key;}
    res.json({draft,summary:{name:draft.name,sources:draft.sourceUrls.length,resources:draft.resourceUrls.length,references:draft.referenceAssets.length,requirements:draft.requirements.length,violations:draft.violations.length,audience:draft.audience||'',paymentModel:draft.paymentModel||'custom',qualificationViews:Number(draft.qualificationViews||0),platformRules:Boolean(profile&&profile.sections.length)}});
  } catch(e){next(e)}
});
app.post('/api/campaigns/import', async (req,res,next) => {
  try {
    const url=String(req.body?.url||'').trim();
    if(!/^https?:\/\//i.test(url))return res.status(400).json({error:'Enter a valid public campaign URL.'});
    const response=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 ClipBoost/21.5 Campaign Importer','Accept':'text/html,application/xhtml+xml'},redirect:'follow',signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Object.assign(new Error(`Campaign page returned HTTP ${response.status}. You can still add it manually.`),{status:400});
    const type=String(response.headers.get('content-type')||'');
    if(!type.includes('text/html'))throw Object.assign(new Error('This campaign URL is not a public HTML page. Add the campaign manually.'),{status:400});
    const html=(await response.text()).slice(0,2_000_000);
    const wall=detectCampaignAccessWall(html,url);
    if(wall.blocked){
      return res.status(409).json({error:wall.reason==='login'?'Campaign details unavailable — login required. The URL was kept so you can enter the terms manually.':'Campaign details unavailable — this page is protected by anti-bot verification. The URL was kept so you can enter the terms manually.',manual:true,url,reason:wall.reason});
    }
    const draft=extractCampaignPage(html,url);
    const data=await readCampaigns();
    const campaign=normalizeCampaign(draft); data.campaigns.unshift(campaign); await writeCampaigns(data);
    res.json({ ...campaign, totals:campaignTotals(campaign), imported:true });
  } catch(e){ next(e); }
});
app.put('/api/campaigns/:id', async (req,res,next) => {
  try {
    const data=await readCampaigns(); const i=data.campaigns.findIndex(c=>c.id===req.params.id);
    if(i<0)return res.status(404).json({error:'Campaign not found.'});
    const campaign=normalizeCampaign(req.body||{},data.campaigns[i]); data.campaigns[i]=campaign; await writeCampaigns(data);
    res.json({ ...campaign, totals:campaignTotals(campaign) });
  } catch(e){ next(e); }
});
app.delete('/api/campaigns/:id', async (req,res,next) => {
  try {
    const data=await readCampaigns(); const before=data.campaigns.length;
    data.campaigns=data.campaigns.filter(c=>c.id!==req.params.id); if(data.campaigns.length===before)return res.status(404).json({error:'Campaign not found.'});
    await writeCampaigns(data); res.json({ok:true});
  } catch(e){ next(e); }
});
app.post('/api/campaigns/:id/posts', async (req,res,next) => {
  try {
    const data=await readCampaigns(); const i=data.campaigns.findIndex(c=>c.id===req.params.id); if(i<0)return res.status(404).json({error:'Campaign not found.'});
    const c=data.campaigns[i]; const body=req.body||{};
    c.posts=Array.isArray(c.posts)?c.posts:[];
    c.posts.unshift({id:crypto.randomUUID(),url:String(body.url||'').trim(),platform:String(body.platform||'').trim(),views:Math.max(0,Number(body.views||0)||0),publishedAt:String(body.publishedAt||new Date().toISOString()),notes:String(body.notes||'').slice(0,2000),editingMinutes:Math.max(0,Number(body.editingMinutes||0)||0),clipDuration:Math.max(0,Number(body.clipDuration||0)||0),payoutConfirmed:Math.max(0,Number(body.payoutConfirmed||0)||0),submissionStatus:['pending','accepted','rejected'].includes(String(body.submissionStatus||''))?String(body.submissionStatus):'pending',paid:Boolean(body.paid),createdAt:new Date().toISOString()});
    c.updatedAt=new Date().toISOString(); await writeCampaigns(data); res.json({...c,totals:campaignTotals(c)});
  } catch(e){next(e)}
});
app.put('/api/campaigns/:id/posts/:postId', async (req,res,next) => {
  try {
    const data=await readCampaigns();const ci=data.campaigns.findIndex(c=>c.id===req.params.id);if(ci<0)return res.status(404).json({error:'Campaign not found.'});
    const c=data.campaigns[ci];c.posts=Array.isArray(c.posts)?c.posts:[];const pi=c.posts.findIndex(p=>p.id===req.params.postId);if(pi<0)return res.status(404).json({error:'Tracked post not found.'});
    const current=c.posts[pi],body=req.body||{};
    c.posts[pi]={...current,url:body.url!==undefined?String(body.url||'').trim():current.url,platform:body.platform!==undefined?String(body.platform||'').trim():current.platform,views:body.views!==undefined?Math.max(0,Number(body.views||0)||0):current.views,clipDuration:body.clipDuration!==undefined?Math.max(0,Number(body.clipDuration||0)||0):current.clipDuration,editingMinutes:body.editingMinutes!==undefined?Math.max(0,Number(body.editingMinutes||0)||0):current.editingMinutes,payoutConfirmed:body.payoutConfirmed!==undefined?Math.max(0,Number(body.payoutConfirmed||0)||0):Math.max(0,Number(current.payoutConfirmed||0)||0),submissionStatus:body.submissionStatus!==undefined&&['pending','accepted','rejected'].includes(String(body.submissionStatus))?String(body.submissionStatus):String(current.submissionStatus||'pending'),paid:body.paid!==undefined?Boolean(body.paid):current.paid,updatedAt:new Date().toISOString()};
    c.updatedAt=new Date().toISOString();await writeCampaigns(data);res.json({...c,totals:campaignTotals(c)});
  } catch(e){next(e)}
});
app.delete('/api/campaigns/:id/posts/:postId', async (req,res,next) => {
  try {
    const data=await readCampaigns();const ci=data.campaigns.findIndex(c=>c.id===req.params.id);if(ci<0)return res.status(404).json({error:'Campaign not found.'});
    const c=data.campaigns[ci];const before=(c.posts||[]).length;c.posts=(c.posts||[]).filter(p=>p.id!==req.params.postId);if(c.posts.length===before)return res.status(404).json({error:'Tracked post not found.'});
    c.updatedAt=new Date().toISOString();await writeCampaigns(data);res.json({...c,totals:campaignTotals(c)});
  } catch(e){next(e)}
});
app.post('/api/campaigns/:id/source-project', async (req,res,next) => {
  try {
    const data=await readCampaigns(); const campaign=data.campaigns.find(c=>c.id===req.params.id); if(!campaign)return res.status(404).json({error:'Campaign not found.'});
    const sourceId=String(req.body?.sourceId||''); const requested=String(req.body?.url||'').trim(); const requestedLabel=String(req.body?.label||'').trim();
    const source=campaign.sourceUrls.find(s=>s.id===sourceId)||(requested?{url:requested,label:requestedLabel||'Campaign asset'}:null);
    if(!source?.url)return res.status(400).json({error:'Campaign source not found.'});
    const parsed=parseCampaignSourceUrl(source.url); if(!parsed)return res.status(400).json({error:'Unsupported source URL.'});
    const id=crypto.randomUUID();
    const meta={id,originalName:source.label||`${campaign.name} source`,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),status:'linked',details:{duration:0},candidates:[],campaignId:campaign.id,campaign:{...campaign,totals:campaignTotals(campaign)},externalSource:{...parsed,thumbnail:null,title:source.label||null,creatorName:campaign.provider||'Campaign source',creatorId:campaign.id,viewCount:0}};
    await writeMeta(meta); res.json(meta);
  } catch(e){next(e)}
});
app.post('/api/campaigns/:id/batch-projects', async (req,res,next) => {
  try {
    const data=await readCampaigns(); const campaign=data.campaigns.find(c=>c.id===req.params.id); if(!campaign)return res.status(404).json({error:'Campaign not found.'});
    const existingNames=await fs.readdir(metaDir).catch(()=>[]); const existing=[];
    for(const name of existingNames.filter(n=>n.endsWith('.json'))){try{const m=JSON.parse(await fs.readFile(path.join(metaDir,name),'utf8'));if(m.campaignId===campaign.id&&m.externalSource?.url)existing.push(m.externalSource.url)}catch{}}
    const created=[];
    for(const source of (campaign.sourceUrls||[])){
      if(existing.includes(source.url))continue; const parsed=parseCampaignSourceUrl(source.url); if(!parsed)continue;
      const id=crypto.randomUUID(); const meta={id,originalName:source.label||`${campaign.name} source`,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),status:'linked',details:{duration:0},candidates:[],campaignId:campaign.id,campaign:{...campaign,totals:campaignTotals(campaign)},externalSource:{...parsed,thumbnail:null,title:source.label||null,creatorName:campaign.provider||'Campaign source',creatorId:campaign.id,viewCount:0}};
      await writeMeta(meta);created.push({id:meta.id,name:meta.originalName,url:source.url});
    }
    res.json({created,count:created.length,skipped:(campaign.sourceUrls||[]).length-created.length});
  } catch(e){next(e)}
});
app.get('/api/campaigns/:id/submission-pack', async (req,res,next) => {
  try {
    const data=await readCampaigns(); const campaign=data.campaigns.find(c=>c.id===req.params.id); if(!campaign)return res.status(404).json({error:'Campaign not found.'});
    const totals=campaignTotals(campaign); const pack={generatedAt:new Date().toISOString(),campaign:{id:campaign.id,name:campaign.name,provider:campaign.provider,campaignUrl:campaign.campaignUrl,status:campaign.status,accessMode:campaign.accessMode,deadline:campaign.deadline,paymentModel:campaignPaymentModel(campaign),qualificationViews:campaign.qualificationViews??campaign.viewThreshold??0,qualificationScope:campaign.qualificationScope||'per-post',rateBasisViews:campaign.rateBasisViews||100000,platformPayouts:campaign.platformPayouts||{},fixedReward:campaign.fixedReward??campaign.payout??0,bountyPool:campaign.bountyPool||0,maxPayout:campaign.maxPayout||0,confirmedPayout:campaign.confirmedPayout||0,currency:campaign.currency},totals,posts:campaign.posts||[],usedMoments:campaign.usedMoments||[],requirements:{platforms:campaign.platforms,minDuration:campaign.minDuration,maxDuration:campaign.maxDuration,requiredHashtags:campaign.requiredHashtags,requiredMentions:campaign.requiredMentions,requiredCTA:campaign.requiredCTA,forbiddenTerms:campaign.forbiddenTerms||[],audience:campaign.audience||'',requirements:campaign.requirements||[],violations:campaign.violations||[],requirementsUrl:campaign.requirementsUrl||'',resources:campaign.resourceUrls||[],referenceAssets:campaign.referenceAssets||[]},import:{source:campaign.importSource||'',importedAt:campaign.importedAt||'',startDate:campaign.startDate||'',paymentMethod:campaign.paymentMethod||'',accountLimit:campaign.accountLimit||'',campaignStats:campaign.campaignStats||{}}};
    res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename="clipboost-campaign-${campaign.id}.json"`);res.send(JSON.stringify(pack,null,2));
  } catch(e){next(e)}
});


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

app.get('/api/library/creators', async (req, res, next) => {
  try { res.json(await readLibrary()); } catch (e) { next(e); }
});


app.get('/api/library/youtube/search', async (req, res, next) => {
  try {
    const query = String(req.query.q || '').trim();
    if (query.length < 2) return res.json({ results: [] });
    const results = await searchYoutubeCreators(query);
    res.json({ results });
  } catch (e) { next(e); }
});

app.post('/api/library/youtube/creator', async (req, res, next) => {
  try {
    const creator = await fetchYoutubeCreator(req.body?.input);
    const library = await readLibrary();
    const existing = library.creators.findIndex(c => c.platform === 'youtube' && c.id === creator.id);
    if (existing >= 0) library.creators[existing] = creator;
    else library.creators.unshift(creator);
    await writeLibrary(library);
    res.json({ creator, library });
  } catch (e) { next(e); }
});

app.post('/api/library/youtube/refresh/:channelId', async (req, res, next) => {
  try {
    const library = await readLibrary();
    const previous = library.creators.find(c => c.platform === 'youtube' && c.id === req.params.channelId) || null;
    const creator = await fetchYoutubeCreator(req.params.channelId, previous);
    const existing = library.creators.findIndex(c => c.platform === 'youtube' && c.id === creator.id);
    if (existing >= 0) library.creators[existing] = creator;
    else library.creators.unshift(creator);
    await writeLibrary(library);
    res.json({ creator, library });
  } catch (e) { next(e); }
});

app.post('/api/library/youtube/load-more/:channelId', async (req, res, next) => {
  try {
    const library = await readLibrary();
    const index = library.creators.findIndex(c => c.platform === 'youtube' && c.id === req.params.channelId);
    if (index < 0) throw Object.assign(new Error('YouTube creator not found in library.'), { status: 404 });
    let creator = library.creators[index];

    // Robust history loading: do not depend on a previously persisted page token.
    // We rebuild the cursor from the oldest upload already present, then return up
    // to 50 uploads older than that boundary. This survives restarts/migrations.
    if (!creator.uploadsPlaylistId) {
      const channels = await youtubeGet('channels', { part: 'snippet,contentDetails,statistics', id: creator.id });
      const channel = channels.items?.[0];
      if (!channel) throw Object.assign(new Error('YouTube channel could not be refreshed.'), { status: 404 });
      creator.uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads || null;
      creator.videoCount = Number(channel.statistics?.videoCount || creator.videoCount || 0);
      creator.avatar = channel.snippet?.thumbnails?.high?.url || channel.snippet?.thumbnails?.medium?.url || channel.snippet?.thumbnails?.default?.url || creator.avatar || null;
      creator.name = channel.snippet?.title || creator.name;
      if (!creator.uploadsPlaylistId) throw Object.assign(new Error('This channel does not expose an uploads playlist.'), { status: 400 });
    }

    const existing = Array.isArray(creator.videos) ? creator.videos : [];
    const existingIds = new Set(existing.map(v => v?.id).filter(Boolean));
    const oldestLoadedMs = existing.reduce((min, v) => {
      const t = new Date(v?.publishedAt || 0).getTime();
      return t && t < min ? t : min;
    }, Infinity);

    let pageToken = null;
    let collected = [];
    let scannedPages = 0;
    let reachedBoundary = !Number.isFinite(oldestLoadedMs);
    let hasMore = false;

    while (scannedPages < 30 && collected.length < 50) {
      const page = await fetchYoutubeUploadsPage(creator.uploadsPlaylistId, pageToken);
      scannedPages += 1;
      const videos = page.videos || [];

      for (const video of videos) {
        const publishedMs = new Date(video.publishedAt || 0).getTime();
        if (!reachedBoundary) {
          if (publishedMs < oldestLoadedMs) reachedBoundary = true;
          else continue;
        }
        if (!existingIds.has(video.id) && collected.length < 50) collected.push(video);
      }

      pageToken = page.nextPageToken || null;
      if (!pageToken) { hasMore = false; break; }
      hasMore = true;
    }

    creator.videos = mergeYoutubeVideos(collected, existing);
    creator.youtubeHistoryInitialized = true;
    creator.youtubeNextPageToken = hasMore ? 'stateless' : null;
    creator.refreshedAt = new Date().toISOString();
    library.creators[index] = creator;
    await writeLibrary(library);

    res.json({ creator, library, loaded: collected.length, done: !hasMore, mode: 'older-than-oldest' });
  } catch (e) { next(e); }
});

app.get('/api/library/twitch/search', async (req, res, next) => {
  try {
    const query = String(req.query.q || '').trim();
    if (query.length < 2) return res.json({ results: [] });
    res.json({ results: await searchTwitchCreators(query) });
  } catch (e) { next(e); }
});

app.post('/api/library/twitch/creator', async (req, res, next) => {
  try {
    const creator = await fetchTwitchCreator(req.body?.input);
    const library = await readLibrary();
    const existing = library.creators.findIndex(c => c.platform === 'twitch' && c.id === creator.id);
    if (existing >= 0) library.creators[existing] = creator;
    else library.creators.unshift(creator);
    await writeLibrary(library);
    res.json({ creator, library });
  } catch (e) { next(e); }
});

app.post('/api/library/twitch/refresh/:userId', async (req, res, next) => {
  try {
    const library = await readLibrary();
    const existingCreator = library.creators.find(c => c.platform === 'twitch' && c.id === req.params.userId);
    if (!existingCreator) throw Object.assign(new Error('Twitch creator not found in library.'), { status: 404 });
    const creator = await fetchTwitchCreator(existingCreator.login || existingCreator.handle || existingCreator.name);
    const existing = library.creators.findIndex(c => c.platform === 'twitch' && c.id === creator.id);
    if (existing >= 0) library.creators[existing] = creator;
    else library.creators.unshift(creator);
    await writeLibrary(library);
    res.json({ creator, library });
  } catch (e) { next(e); }
});

app.post('/api/library/twitch/live', async (req, res, next) => {
  try {
    const library = await readLibrary();
    const twitchCreators = library.creators.filter(c => c.platform === 'twitch' && c.id);
    if (!twitchCreators.length) return res.json({ library, liveCount: 0, refreshedAt: new Date().toISOString() });

    // Twitch supports multiple user_id parameters on Get Streams. Refreshing all
    // followed streamers in one request keeps Live fast and avoids re-fetching
    // VODs/clips just to know who is online.
    const ids = twitchCreators.map(c => c.id).slice(0, 100);
    const streamsRes = await twitchGet('streams', { user_id: ids, first: 100 });
    const streams = streamsRes.data || [];
    const byUser = new Map(streams.map(s => [String(s.user_id), s]));
    const refreshedAt = new Date().toISOString();

    library.creators = library.creators.map(c => {
      if (c.platform !== 'twitch') return c;
      const stream = byUser.get(String(c.id)) || null;
      if (!stream) {
        return { ...c, isLive: false, live: null, refreshedAt };
      }
      return {
        ...c,
        isLive: true,
        title: stream.title || c.title || null,
        gameName: stream.game_name || c.gameName || null,
        live: {
          id: stream.id,
          title: stream.title || 'Live stream',
          viewerCount: Number(stream.viewer_count || 0),
          startedAt: stream.started_at || null,
          gameName: stream.game_name || null,
          thumbnail: twitchThumb(stream.thumbnail_url)
        },
        refreshedAt
      };
    });

    await writeLibrary(library);
    res.json({ library, liveCount: streams.length, refreshedAt });
  } catch (e) { next(e); }
});

async function refreshLibraryPlatform(platform) {
  const library = await readLibrary();
  const targets = library.creators.filter(c => c.platform === platform && c.id);
  let refreshed = 0;
  const errors = [];

  // Keep this sequential. It avoids bursty API usage and makes YouTube quota
  // consumption predictable while still refreshing every followed creator.
  for (const existingCreator of targets) {
    try {
      const fresh = platform === 'youtube'
        ? await fetchYoutubeCreator(existingCreator.id, existingCreator)
        : await fetchTwitchCreator(existingCreator.login || existingCreator.handle || existingCreator.name);
      const index = library.creators.findIndex(c => c.platform === platform && c.id === fresh.id);
      if (index >= 0) library.creators[index] = fresh;
      else library.creators.unshift(fresh);
      refreshed += 1;
    } catch (error) {
      errors.push({
        id: existingCreator.id,
        name: existingCreator.name || existingCreator.login || existingCreator.handle || existingCreator.id,
        error: error?.message || 'Refresh failed'
      });
    }
  }

  await writeLibrary(library);
  return { library, refreshed, errors, refreshedAt:new Date().toISOString() };
}

app.post('/api/library/youtube/refresh-all', async (req, res, next) => {
  try { res.json(await refreshLibraryPlatform('youtube')); } catch (e) { next(e); }
});

app.post('/api/library/twitch/refresh-all', async (req, res, next) => {
  try { res.json(await refreshLibraryPlatform('twitch')); } catch (e) { next(e); }
});

app.delete('/api/library/creators/:platform/:id', async (req, res, next) => {
  try {
    const library = await readLibrary();
    library.creators = library.creators.filter(c => !(c.platform === req.params.platform && c.id === req.params.id));
    await writeLibrary(library);
    res.json(library);
  } catch (e) { next(e); }
});

app.post('/api/projects/from-library', async (req, res, next) => {
  try {
    const platform = String(req.body?.platform || '').trim();
    const creatorId = String(req.body?.creatorId || '').trim();
    const mediaType = String(req.body?.mediaType || '').trim();
    const mediaId = String(req.body?.mediaId || '').trim();
    if (!['youtube','twitch'].includes(platform) || !creatorId || !mediaId) {
      return res.status(400).json({ error: 'Invalid Library source.' });
    }
    const library = await readLibrary();
    const creator = library.creators.find(c => c.platform === platform && c.id === creatorId);
    if (!creator) return res.status(404).json({ error: 'Creator not found in Library.' });
    let item = null;
    if (platform === 'youtube') item = (creator.videos || []).find(v => String(v.id) === mediaId);
    else if (mediaType === 'clip') item = (creator.clips || []).find(v => String(v.id) === mediaId);
    else item = (creator.vods || []).find(v => String(v.id) === mediaId);
    if (!item) return res.status(404).json({ error: 'Video source not found in Library.' });

    const id = crypto.randomUUID();
    const meta = {
      id,
      originalName: item.title || `${creator.name} source`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'linked',
      details: { duration: Number(item.duration || 0) },
      candidates: [],
      externalSource: {
        platform,
        mediaType: platform === 'youtube' ? 'video' : mediaType,
        id: String(item.id),
        url: item.url || null,
        thumbnail: item.thumbnail || null,
        title: item.title || null,
        creatorName: creator.name || creator.login || creator.handle || 'Creator',
        creatorId: creator.id,
        creatorHandle: creator.handle || creator.login || null,
        publishedAt: item.publishedAt || item.createdAt || null,
        viewCount: Number(item.viewCount || 0)
      }
    };
    await writeMeta(meta);
    res.json(meta);
  } catch (e) { next(e); }
});


app.post('/api/projects/:id/ingest', async (req, res, next) => {
  try {
    const meta = await readMeta(req.params.id);
    if (!meta.externalSource?.url) return res.status(400).json({ error: 'This project is not linked to a Library source.' });
    if (meta.sourcePath && fsSync.existsSync(meta.sourcePath)) return res.json(meta);
    if (['ingesting','analyzing'].includes(meta.status)) return res.status(202).json(meta);
    meta.status = 'ingesting';
    delete meta.processingInterruptedAt;
    meta.analysis = { ...(meta.analysis || {}), interrupted:false, error:null };
    meta.ingestion = { ...(meta.ingestion || {}), stage: 'queued', progress: 1, engine: 'yt-dlp', error: null };
    meta.updatedAt = new Date().toISOString();
    await writeMeta(meta);
    setTimeout(() => startExternalIngestion(meta.id), 10);
    res.status(202).json(meta);
  } catch (e) { next(e); }
});

app.get('/api/projects', async (req, res, next) => {
  try {
    const names = await fs.readdir(metaDir).catch(() => []);
    const projects = [];
    for (const name of names.filter(n => n.endsWith('.json'))) {
      try {
        let meta = JSON.parse(await fs.readFile(path.join(metaDir, name), 'utf8'));
        const recovery = await recoverInterruptedProject(meta).catch(() => ({ meta, recovered:false }));
        meta = recovery.meta;
        projects.push({
          id: meta.id,
          originalName: meta.originalName,
          createdAt: meta.createdAt,
          updatedAt: meta.updatedAt || meta.createdAt,
          status: meta.status,
          processingActive: projectTaskIsActive(meta.id),
          processingInterrupted: Boolean(recovery.recovered || meta.processingInterruptedAt || meta.analysis?.interrupted),
          details: meta.details || {},
          externalSource: meta.externalSource || null,
          campaignId: meta.campaignId || null,
          campaignName: meta.campaign?.name || null,
          candidateCount: Array.isArray(meta.candidates) ? meta.candidates.length : 0,
          sourceUrl: meta.sourceUrl || null,
          ingestionError: meta.ingestion?.error || null,
          analysisStage: meta.analysis?.stage || null
        });
      } catch {}
    }
    projects.sort((a,b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
    res.json(projects);
  } catch (e) { next(e); }
});

app.delete('/api/projects/:id', async (req, res, next) => {
  try {
    const meta = await readMeta(req.params.id);
    const stoppedProcesses = stopProjectProcesses(meta.id);
    deletedProjectIds.add(String(meta.id));
    const insideStorage = value => {
      if (!value) return false;
      const resolved = path.resolve(value);
      const rel = path.relative(storageRoot, resolved);
      return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
    };
    if (insideStorage(meta.sourcePath)) await fs.rm(path.resolve(meta.sourcePath), { force:true }).catch(() => {});
    await fs.rm(path.join(storageRoot, 'transcript-cache', meta.id), { recursive:true, force:true }).catch(() => {});
    await fs.rm(path.join(uploadsDir, '.clipboost-cache', 'transcripts', meta.id), { recursive:true, force:true }).catch(() => {});
    const previews = await fs.readdir(previewsDir).catch(() => []);
    await Promise.all(previews.filter(name => name.startsWith(`${meta.id}-`)).map(name => fs.rm(path.join(previewsDir,name), { force:true }).catch(() => {})));
    const tracks = await fs.readdir(trackingDir).catch(() => []);
    await Promise.all(tracks.filter(name => name.startsWith(`${meta.id}-`)).map(name => fs.rm(path.join(trackingDir,name), { force:true }).catch(() => {})));
    await fs.rm(path.join(metaDir, `${meta.id}.json`), { force:true });
    res.json({ ok:true, id:meta.id, processingStopped:processingStatus(meta.status), stoppedProcesses });
  } catch (e) {
    if (e?.code === 'ENOENT') return res.status(404).json({ error:'Project not found.' });
    next(e);
  }
});

// Stream authenticated campaign media straight to disk. This avoids buffering the
// entire Canto file in Electron and then rebuilding a multipart Blob.
app.post('/api/videos/campaign-stream', async (req,res,next)=>{
  let outPath='';
  try{
    const requestedProjectId=String(req.headers['x-clipboost-project-id']||'').trim();
    const originalName=decodeURIComponent(String(req.headers['x-clipboost-file-name']||'campaign-asset.mp4'));
    let existingProject=null;
    if(/^[0-9a-f-]{36}$/i.test(requestedProjectId))existingProject=await readMeta(requestedProjectId).catch(()=>null);
    if(!existingProject)return res.status(404).json({error:'Campaign project not found.'});
    const contentType=String(req.headers['content-type']||'video/mp4').toLowerCase();
    const ext=contentType.includes('quicktime')?'.mov':contentType.includes('webm')?'.webm':path.extname(originalName)||'.mp4';
    let filename=`${crypto.randomUUID()}${ext}`;
    outPath=path.join(uploadsDir,filename);
    await new Promise((resolve,reject)=>{
      const output=fsSync.createWriteStream(outPath);
      req.on('aborted',()=>output.destroy(new Error('Campaign media transfer aborted.')));
      req.on('error',reject);output.on('error',reject);output.on('finish',resolve);
      req.pipe(output);
    });
    const stat=await fs.stat(outPath);
    if(stat.size<1024)throw new Error('Canto returned an empty media file.');
    existingProject.status='preparing';
    existingProject.updatedAt=new Date().toISOString();
    existingProject.ingestion={...(existingProject.ingestion||{}),stage:'probing',progress:92,bytes:stat.size,error:null};
    await writeMeta(existingProject);
    let details=await probe(outPath);
    // Browser playback is part of the Campaign Studio workflow. Canto can expose
    // MOV/MP4 files with codecs Chromium cannot decode even though FFmpeg can.
    // Normalize those sources once at import time so Play, seek and final AI tools
    // all work from the same browser-safe source.
    const browserSafeVideo=['h264','vp8','vp9','av1'].includes(String(details.videoCodec||'').toLowerCase());
    const browserSafeAudio=!details.audioCodec||['aac','mp3','opus','vorbis'].includes(String(details.audioCodec||'').toLowerCase());
    {
      // Always rewrite Canto media into a Chromium-friendly MP4 container. Even
      // H.264/AAC assets can arrive with a non-streamable atom layout that shows
      // frame 0 and duration but refuses to start in Electron.
      const normalizedName=`${crypto.randomUUID()}.mp4`,normalizedPath=path.join(uploadsDir,normalizedName);
      if(browserSafeVideo&&browserSafeAudio){
        try{
          await run('ffmpeg',['-y','-i',outPath,'-map','0:v:0','-map','0:a:0?','-c','copy','-movflags','+faststart',normalizedPath],{timeout:60*60*1000});
        }catch{
          await run('ffmpeg',['-y','-i',outPath,'-map','0:v:0','-map','0:a:0?','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-movflags','+faststart',normalizedPath],{timeout:60*60*1000});
        }
      }else{
        await run('ffmpeg',['-y','-i',outPath,'-map','0:v:0','-map','0:a:0?','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-movflags','+faststart',normalizedPath],{timeout:60*60*1000});
      }
      await fs.rm(outPath,{force:true}).catch(()=>{});
      outPath=normalizedPath;filename=normalizedName;details=await probe(outPath);
    }
    const meta={...existingProject,id:existingProject.id,originalName:existingProject.originalName||originalName,filename,sourcePath:outPath,sourceUrl:`/media/uploads/${filename}`,updatedAt:new Date().toISOString(),status:'uploaded',details,candidates:[],ingestion:{...(existingProject.ingestion||{}),stage:'ready',progress:100,bytes:(await fs.stat(outPath)).size,error:null}};
    await writeMeta(meta);res.json(meta);
  }catch(e){if(outPath)await fs.rm(outPath,{force:true}).catch(()=>{});next(e)}
});

app.post('/api/videos', upload.single('video'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No video uploaded.' });
    const requestedProjectId = String(req.body?.projectId || '').trim();
    let existingProject = null;
    if (/^[0-9a-f-]{36}$/i.test(requestedProjectId)) {
      existingProject = await readMeta(requestedProjectId).catch(() => null);
    }
    const id = existingProject?.id || path.parse(req.file.filename).name;
    const details = await probe(req.file.path);
    const meta = {
      ...(existingProject || {}),
      id,
      originalName: existingProject?.originalName || req.file.originalname,
      filename: req.file.filename,
      sourcePath: req.file.path,
      sourceUrl: `/media/uploads/${req.file.filename}`,
      createdAt: existingProject?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'uploaded',
      details,
      candidates: []
    };
    await writeMeta(meta);
    res.json(meta);
  } catch (e) { next(e); }
});

function parseSilences(stderr) {
  const starts = [...stderr.matchAll(/silence_start:\s*([0-9.]+)/g)].map(m => Number(m[1]));
  const ends = [...stderr.matchAll(/silence_end:\s*([0-9.]+)/g)].map(m => Number(m[1]));
  return ends.map((end, i) => ({ start: starts[i] ?? Math.max(0, end - 1), end })).filter(x => Number.isFinite(x.end));
}
function parseScenes(stderr) {
  const matches = [...stderr.matchAll(/pts_time:([0-9.]+)/g)].map(m => Number(m[1]));
  return [...new Set(matches.filter(Number.isFinite))];
}

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



function localAiConfig() {
  return {
    python: String(process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3')).trim(),
    whisperModel: String(process.env.LOCAL_WHISPER_MODEL || 'small').trim(),
    whisperDevice: String(process.env.LOCAL_WHISPER_DEVICE || 'cpu').trim(),
    whisperComputeType: String(process.env.LOCAL_WHISPER_COMPUTE_TYPE || 'int8').trim(),
    ollamaUrl: String(process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, ''),
    ollamaModel: String(process.env.OLLAMA_MODEL || 'qwen2.5:3b').trim()
  };
}

async function unloadOllamaModelIfLoaded() {
  const cfg = localAiConfig();
  if (!cfg.ollamaUrl || !cfg.ollamaModel) return { ok:true, status:'not-configured' };
  try {
    const ps = await fetch(`${cfg.ollamaUrl}/api/ps`, { signal:AbortSignal.timeout(900) });
    if (!ps.ok) return { ok:true, status:'offline' };
    const body = await ps.json().catch(() => ({}));
    const loaded = (Array.isArray(body?.models) ? body.models : []).map(x => String(x?.name || x?.model || ''));
    const wanted = String(cfg.ollamaModel || '');
    if (!loaded.some(name => name === wanted || name.startsWith(`${wanted}:`))) return { ok:true, status:'already-unloaded' };
    const response = await fetch(`${cfg.ollamaUrl}/api/generate`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ model:wanted, prompt:'', stream:false, keep_alive:0 }),
      signal:AbortSignal.timeout(1600)
    });
    return { ok:response.ok, status:response.ok?'unloaded':'unload-failed' };
  } catch (err) {
    return { ok:true, status:'offline', detail:err?.message || String(err) };
  }
}


function resolveWhisperWorkers(rawValue) {
  const raw = String(rawValue ?? 'auto').trim().toLowerCase();
  const explicit = Number(raw);
  if (raw !== 'auto' && Number.isFinite(explicit) && explicit > 0) {
    return { workers: Math.max(1, Math.min(4, Math.round(explicit))), automatic: false };
  }
  const logicalCpus = Math.max(1, os.cpus()?.length || 1);
  const memoryGb = Math.max(1, os.totalmem() / (1024 ** 3));
  const byCpu = logicalCpus >= 16 ? 4 : logicalCpus >= 12 ? 3 : logicalCpus >= 6 ? 2 : 1;
  const byMemory = memoryGb >= 20 ? 4 : memoryGb >= 14 ? 3 : memoryGb >= 8 ? 2 : 1;
  return { workers: Math.max(1, Math.min(4, byCpu, byMemory)), automatic: true };
}

async function transcriptionCachePaths(meta, cfg) {
  const stat = await fs.stat(meta.sourcePath);
  const sourceSignature = crypto.createHash('sha1')
    .update(`${path.resolve(meta.sourcePath)}:${stat.size}:${Math.round(stat.mtimeMs)}`)
    .digest('hex').slice(0, 14);
  // Keep the heavy prepared PCM and chunk cache under uploads. In the desktop app
  // this follows the user's uploads location/junction instead of growing AppData on C:.
  const rootDir = path.join(uploadsDir, '.clipboost-cache', 'transcripts', meta.id, sourceSignature);
  await fs.mkdir(rootDir, { recursive: true });
  const audioPath = path.join(rootDir, 'source-16k-mono.wav');
  const profile = crypto.createHash('sha1')
    .update(`${cfg.whisperModel}|${cfg.whisperDevice}|${cfg.whisperComputeType}`)
    .digest('hex').slice(0, 10);
  return { rootDir, audioPath, sourceSignature, profile };
}

function normalizeWord(word, offset = 0) {
  return {
    word: String(word?.word || word?.text || '').trim(),
    start: Number((Number(word?.start || 0) + offset).toFixed(3)),
    end: Number((Number(word?.end || word?.start || 0) + offset).toFixed(3))
  };
}

const TRANSCRIPT_FILLERS = new Set([
  'euh','heu','hum','hmm','mmm','bah','ben','beh','hein',
  'uh','um','umm','erm','er','ahh','huh'
]);

function wordLexeme(value='') {
  return String(value || '')
    .toLocaleLowerCase('fr')
    .replace(/[’']/g, "'")
    .replace(/^[^a-z0-9à-ÿ]+|[^a-z0-9à-ÿ]+$/gi, '')
    .trim();
}

function mergeCleanupRanges(ranges=[]) {
  const sorted=[...ranges].filter(r=>Number.isFinite(r.start)&&Number.isFinite(r.end)&&r.end>r.start)
    .sort((a,b)=>a.start-b.start);
  const out=[];
  for(const r of sorted){
    const last=out[out.length-1];
    if(last && r.start<=last.end+.055 && last.reason===r.reason) last.end=Math.max(last.end,r.end);
    else out.push({...r});
  }
  return out.map(r=>({start:Number(r.start.toFixed(3)),end:Number(r.end.toFixed(3)),reason:r.reason||'disfluency'}));
}

function cleanTranscriptWords(words = [], language = '') {
  const normalized=(words||[]).map(w=>normalizeWord(w)).filter(w=>w.word&&Number.isFinite(w.start)&&Number.isFinite(w.end));
  const lex=normalized.map(w=>wordLexeme(w.word));
  const remove=new Array(normalized.length).fill(false);
  const reasons=new Array(normalized.length).fill('');

  // Remove common hesitation fillers when they are short standalone tokens.
  for(let i=0;i<normalized.length;i++){
    if(TRANSCRIPT_FILLERS.has(lex[i]) && normalized[i].end-normalized[i].start<1.15){
      remove[i]=true; reasons[i]='filler';
    }
  }

  // Collapse immediate word stutters: "je je je pense" -> "je pense".
  for(let i=1;i<normalized.length;i++){
    if(remove[i]||!lex[i]||lex[i].length<1) continue;
    let p=i-1; while(p>=0&&remove[p])p--;
    if(p>=0 && lex[p]===lex[i] && normalized[i].start-normalized[p].end<1.05){
      remove[i]=true; reasons[i]='repetition';
    }
  }

  // Collapse short repeated phrases: "je pense je pense" / "on va on va".
  for(let n=3;n>=2;n--){
    for(let i=0;i+2*n<=normalized.length;i++){
      if(Array.from({length:2*n},(_,k)=>remove[i+k]).some(Boolean)) continue;
      const a=lex.slice(i,i+n), b=lex.slice(i+n,i+2*n);
      if(a.some(x=>!x)||a.join('|')!==b.join('|')) continue;
      const firstDuration=normalized[i+n-1].end-normalized[i].start;
      const gap=normalized[i+n].start-normalized[i+n-1].end;
      if(firstDuration<=3.2 && gap<.7){
        for(let k=i+n;k<i+2*n;k++){remove[k]=true;reasons[k]='repetition';}
      }
    }
  }

  const cleaned=[];
  const removedRanges=[];
  for(let i=0;i<normalized.length;i++){
    if(remove[i]){
      removedRanges.push({start:normalized[i].start,end:normalized[i].end,reason:reasons[i]||'disfluency'});
    }else cleaned.push(normalized[i]);
  }
  const merged=mergeCleanupRanges(removedRanges);
  return {
    words: cleaned,
    removedRanges: merged,
    stats: {
      removedWords: remove.filter(Boolean).length,
      repetitions: reasons.filter(x=>x==='repetition').length,
      fillers: reasons.filter(x=>x==='filler').length,
      language: language || null
    }
  };
}

function capitalizeCaption(text='') {
  const t=String(text||'').trim();
  if(!t) return '';
  const idx=t.search(/[A-Za-zÀ-ÿ]/);
  if(idx<0) return t;
  return t.slice(0,idx)+t[idx].toLocaleUpperCase('fr')+t.slice(idx+1);
}

function looksLikeQuestion(words=[]){
  const first=wordLexeme(words[0]?.word||'');
  const second=wordLexeme(words[1]?.word||'');
  const starters=new Set(['pourquoi','comment','quand','où','qui','quoi','quel','quelle','quels','quelles','combien','est-ce','why','how','when','where','who','what','which','can','could','would','should','do','does','did','is','are','was','were']);
  if(starters.has(first)) return true;
  if(first==='est'&&second==='ce') return true;
  return false;
}

function stripCaptionPunctuation(text='') {
  return String(text||'')
    // User-facing social captions contain zero punctuation. Semantic word data stays untouched.
    .replace(/\p{P}+/gu,'')
    .replace(/\s+/g,' ')
    .trim();
}

function formatCaptionGroup(group=[], nextWord=null, reason='length'){
  if(!group.length) return '';
  // Social caption display is deliberately punctuation-free.
  // Phrase punctuation remains available in the underlying word transcript for semantic scoring.
  return stripCaptionPunctuation(group.map(w=>String(w.word||'')).join(' '));
}

function captionWordImportance(word='', index=0, group=[]) {
  const raw=String(word||'').trim(), lex=wordLexeme(raw);
  if(!lex)return 0;
  let score=0;
  if(/\d/.test(raw))score+=4;
  if(raw.length>=7)score+=1;
  if(/\b(secret|erreur|problème|vérité|jamais|toujours|résultat|argent|million|mille|pourcent|important|incroyable|impossible|meilleur|pire|secret|mistake|problem|truth|never|always|result|money|million|thousand|percent|important|crazy|impossible|best|worst)\b/i.test(lex))score+=4;
  if(/[!?]/.test(raw))score+=1;
  if(index===group.length-1&&group.length>1)score+=.5;
  return score;
}
function wordsToCaptions(words = []) {
  const captions = [];
  let current = [];
  let start = null;
  const flush = (reason='length', nextWord=null) => {
    if (!current.length) return;
    const end = current[current.length - 1].end;
    const text = formatCaptionGroup(current,nextWord,reason);
    if (text) {
      const ranked=current.map((w,i)=>({i,score:captionWordImportance(w.word,i,current)})).sort((a,b)=>b.score-a.score);
      const emphasize=new Set(ranked.filter(x=>x.score>=3).slice(0,2).map(x=>x.i));
      captions.push({
        id: crypto.randomUUID(),
        start: Number(start.toFixed(3)),
        end: Number(end.toFixed(3)),
        text,
        words: current.map((w,i)=>({word:String(w.word||''),start:Number(w.start||0),end:Number(w.end||w.start||0),emphasis:emphasize.has(i)})),
        emphasis: [...emphasize].map(i=>String(current[i]?.word||'')).filter(Boolean),
        beat: reason
      });
    }
    current = []; start = null;
  };
  const list=(words||[]).filter(w=>w?.word);
  for (let i=0;i<list.length;i++) {
    const w=list[i], next=list[i+1]||null;
    if (start === null) start = w.start;
    current.push(w);
    const raw=current.map(x=>String(x.word||'')).join(' ');
    const duration=Number(w.end||0)-Number(start||0);
    const nextGap=next?Math.max(0,Number(next.start||0)-Number(w.end||0)):9;
    const terminal=/[.!?…]$/.test(String(w.word||''));
    let reason='';
    // Deliberately concise: usually 2-4 words / about 1.5 seconds per caption beat.
    if(terminal && current.length>=2) reason='terminal';
    else if(nextGap>.50) reason='pause';
    else if(current.length>=4 || raw.length>=28 || duration>=1.75) reason='length';
    if(reason) flush(reason,next);
  }
  flush('terminal',null);
  return captions;
}

function transcriptBlocks(words = [], blockSeconds = 12) {
  const blocks = [];
  let block = [];
  let blockStart = null;
  for (const w of words) {
    if (!w.word) continue;
    if (blockStart === null) blockStart = w.start;
    block.push(w);
    if (w.end - blockStart >= blockSeconds || (/[.!?…]$/.test(w.word) && w.end - blockStart >= 6)) {
      blocks.push({
        start: blockStart,
        end: w.end,
        text: formatCaptionGroup(block,null,'terminal')
      });
      block = []; blockStart = null;
    }
  }
  if (block.length) blocks.push({ start: blockStart || 0, end: block[block.length-1].end, text: formatCaptionGroup(block,null,'terminal') });
  return blocks;
}

function upgradeTranscriptQuality(transcript=null) {
  if(!transcript) return transcript;
  const rawWords=(transcript.rawWords?.length?transcript.rawWords:transcript.words||[]).map(w=>normalizeWord(w));
  const cleaned=cleanTranscriptWords(rawWords,transcript.language||'');
  return {
    ...transcript,
    rawWords,
    words: cleaned.words,
    captions: wordsToCaptions(cleaned.words),
    cleanup: {
      ...(transcript.cleanup||{}),
      ...cleaned.stats,
      removedRanges: cleaned.removedRanges,
      engine: 'ClipBoost Quality Engine v2'
    }
  };
}

async function runJsonProcess(command, args, options = {}) {
  return await new Promise((resolve, reject) => {
    const { onStderrLine, idleTimeout = 12 * 60_000, ...spawnOptions } = options;
    const child = spawn(command, args, { cwd: root, windowsHide: true, ...spawnOptions });
    registerProjectProcess(child);
    let stdout = '';
    let stderr = '';
    let stderrLineBuffer = '';
    let settled = false;
    let idleTimer = null;
    const touch = () => {
      if (!idleTimeout) return;
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGKILL');
        reject(new Error(`Local transcription stalled for ${Math.round(idleTimeout/60000)} minutes. ClipBoost will retry with smaller chunks.`));
      }, idleTimeout);
    };
    touch();
    child.stdout?.on('data', d => { stdout += d.toString(); touch(); });
    child.stderr?.on('data', d => {
      touch();
      const text = d.toString();
      stderr += text;
      stderrLineBuffer += text;
      const lines = stderrLineBuffer.split(/\r?\n/);
      stderrLineBuffer = lines.pop() || '';
      if (typeof onStderrLine === 'function') {
        for (const line of lines) {
          try { onStderrLine(line); } catch {}
        }
      }
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true; clearTimeout(idleTimer); child.kill('SIGKILL');
      reject(new Error(`Local AI process timed out. ${stderr.slice(-500)}`));
    }, options.timeout || 60 * 60_000);
    child.on('error', err => { if (settled) return; settled = true; clearTimeout(timer); clearTimeout(idleTimer); reject(err); });
    child.on('close', code => {
      if (settled) return; settled = true;
      clearTimeout(timer); clearTimeout(idleTimer);
      if (code !== 0) return reject(new Error(stderr.trim() || `Local AI process exited with code ${code}.`));
      try { resolve(JSON.parse(stdout.trim())); }
      catch { reject(new Error(`Local transcription returned invalid JSON. ${stderr.slice(-500)}`)); }
    });
  });
}

async function transcribeLocally(meta) {
  const cfg = localAiConfig();
  if (meta.transcript?.words?.length) return upgradeTranscriptQuality(meta.transcript);
  const script = path.join(root, 'scripts', 'transcribe_local.py');
  const preferredChunk = Math.max(45, Math.min(600, Number(process.env.LOCAL_WHISPER_CHUNK_SECONDS || 120)));
  const workerPlan = resolveWhisperWorkers(process.env.LOCAL_WHISPER_WORKERS || 'auto');
  const whisperWorkers = workerPlan.workers;
  const whisperCpuThreads = Math.max(0, Number(process.env.LOCAL_WHISPER_CPU_THREADS || 0));
  const skipSilence = String(process.env.LOCAL_WHISPER_SKIP_SILENCE || 'true');
  const attempts = [...new Set([preferredChunk, Math.max(60, Math.floor(preferredChunk / 2))])];
  const cache = await transcriptionCachePaths(meta, cfg);
  let lastError = null;

  for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex++) {
    const chunkSeconds = attempts[attemptIndex];
    const cacheProfile = crypto.createHash('sha1')
      .update(`${cache.profile}|${chunkSeconds}|${skipSilence}`)
      .digest('hex').slice(0, 12);
    const chunkCacheDir = path.join(cache.rootDir, 'chunks', cacheProfile);
    try {
      if (attemptIndex > 0) {
        const current = await readMeta(meta.id);
        current.analysis = { ...(current.analysis || {}), stage: 'transcription-retry', progress: 43, retryChunkSeconds: chunkSeconds, warning: `Retrying transcription with ${chunkSeconds}s chunks.` };
        await writeMeta(current);
      }
      let analysisWriteQueue = Promise.resolve();
      const queueAnalysisUpdate = patch => {
        analysisWriteQueue = analysisWriteQueue.catch(() => {}).then(async () => {
          const current = await readMeta(meta.id);
          current.analysis = { ...(current.analysis || {}), ...patch };
          await writeMeta(current);
        });
      };
      const result = await runJsonProcess(cfg.python, [
        script,
        '--input', meta.sourcePath,
        '--model', cfg.whisperModel,
        '--device', cfg.whisperDevice,
        '--compute-type', cfg.whisperComputeType,
        '--chunk-seconds', String(chunkSeconds),
        '--cache-dir', chunkCacheDir,
        '--audio-cache', cache.audioPath,
        '--workers', String(whisperWorkers),
        '--cpu-threads', String(whisperCpuThreads),
        '--skip-silence', skipSilence
      ], {
        timeout: 90 * 60_000,
        idleTimeout: Math.max(4 * 60_000, Number(process.env.LOCAL_WHISPER_CHUNK_TIMEOUT_MS || 10 * 60_000)),
        onStderrLine: line => {
          if (line.startsWith('@@STATUS ')) {
            try {
              const status = JSON.parse(line.slice('@@STATUS '.length));
              queueAnalysisUpdate({
                stage: 'transcription',
                progress: 42,
                transcriptionPhase: String(status.stage || ''),
                transcriptionWorkers: whisperWorkers,
                transcriptionWorkerMode: workerPlan.automatic ? 'auto' : 'fixed'
              });
            } catch {}
            return;
          }
          if (!line.startsWith('@@PROGRESS ')) return;
          try {
            const p = JSON.parse(line.slice('@@PROGRESS '.length));
            const pct = Math.max(0, Math.min(100, Number(p.percent || 0)));
            const mapped = Math.round(42 + pct * 0.28);
            queueAnalysisUpdate({
              stage: 'transcription',
              progress: mapped,
              transcriptionPhase: 'transcription',
              transcriptionProgress: pct,
              transcriptionChunk: Number(p.done || 0),
              transcriptionChunks: Number(p.total || 0),
              transcriptionChunkSeconds: chunkSeconds,
              transcriptionWorkers: Number(p.workers || whisperWorkers),
              transcriptionWorkerMode: workerPlan.automatic ? 'auto' : 'fixed',
              transcriptionCacheHits: Number(p.cache_hits || 0),
              transcriptionSpeechSeconds: Number(p.speech_seconds || 0),
              transcriptionSkippedSeconds: Number(p.skipped_seconds || 0),
              retryAttempt: attemptIndex
            });
          } catch {}
        }
      });
      await analysisWriteQueue.catch(() => {});
      const rawWords = (result.words || []).map(w => normalizeWord(w));
      const baseTranscript = {
        text: String(result.text || '').trim(),
        rawWords,
        words: rawWords,
        model: `faster-whisper:${result.model || cfg.whisperModel}`,
        language: result.language || null,
        duration: Number(result.duration || 0),
        chunks: Number(result.chunks || 0),
        chunkSeconds,
        workers: Number(result.workers || whisperWorkers),
        workerMode: workerPlan.automatic ? 'auto' : 'fixed',
        cacheHits: Number(result.cache_hits || 0),
        pipeline: String(result.pipeline || 'fast-audio-v1'),
        skippedSilenceSeconds: Number(result.skipped_silence_seconds || 0),
        speechSeconds: Number(result.speech_seconds || 0)
      };
      return upgradeTranscriptQuality(baseTranscript);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Local transcription failed.');
}

async function ollamaGenerateJson(prompt) {
  const cfg = localAiConfig();
  const response = await fetch(`${cfg.ollamaUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: cfg.ollamaModel,
      prompt,
      stream: false,
      format: 'json',
      options: { temperature: 0.2 }
    }),
    signal: AbortSignal.timeout(10 * 60_000)
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch {}
  if (!response.ok) throw new Error(body?.error || `Ollama request failed (${response.status}).`);
  const raw = String(body.response || '').trim();
  try { return JSON.parse(raw); }
  catch { throw new Error('Ollama returned invalid JSON. Try a different local model or run `ollama pull qwen2.5:3b`.'); }
}

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
  const captionStyle = ['bold','clean','neon','minimal'].includes(String(raw.captionStyle || '').toLowerCase()) ? String(raw.captionStyle).toLowerCase() : 'bold';
  const captionPosition = ['top','center','bottom'].includes(String(raw.captionPosition || '').toLowerCase()) ? String(raw.captionPosition).toLowerCase() : 'bottom';
  const captionSize = ['small','medium','large'].includes(String(raw.captionSize || '').toLowerCase()) ? String(raw.captionSize).toLowerCase() : 'medium';
  const captionColor = ['white','yellow','lime','cyan','pink','red','green','blue','purple','orange','black'].includes(String(raw.captionColor || '').toLowerCase()) ? String(raw.captionColor).toLowerCase() : 'white';
  const cleanupMode = ['off','captions','speech'].includes(String(raw.cleanupMode || '').toLowerCase()) ? String(raw.cleanupMode).toLowerCase() : 'captions';
  const zoomStyle = ['minimal','natural','energetic'].includes(String(raw.zoomStyle || '').toLowerCase()) ? String(raw.zoomStyle).toLowerCase() : 'natural';
  const trackingMode = ['auto','speaker','center','split'].includes(String(raw.trackingMode || '').toLowerCase()) ? String(raw.trackingMode).toLowerCase() : 'speaker';
  const cameraMovement = ['low','balanced','high'].includes(String(raw.cameraMovement || '').toLowerCase()) ? String(raw.cameraMovement).toLowerCase() : 'balanced';
  return {
    intensity,preset,captionStyle,captionPosition,captionSize,captionColor,cleanupMode,zoomStyle,trackingMode,cameraMovement,
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

  // Avoid mechanical zooms on footage that is already visually active.
  let zoomStyle = 'natural';
  if (preset === 'podcast' || preset === 'clean' || sceneRate >= 10) zoomStyle = 'minimal';
  else if (contentType === 'gaming' && sceneRate < 5 && reactionHint) zoomStyle = 'energetic';

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
  const captionStyle = contentType === 'podcast' || contentType === 'talking' ? 'clean' : (contentType === 'visual' ? 'minimal' : 'bold');
  const captionColorPreference = ['auto','white','yellow','lime','cyan','pink','red'].includes(String(raw.captionColor||'').toLowerCase())
    ? String(raw.captionColor).toLowerCase()
    : 'auto';
  const automaticCaptionColor = contentType === 'gaming' || contentType === 'reaction' ? 'yellow' : 'white';
  const captionColor = captionColorPreference === 'auto' ? automaticCaptionColor : captionColorPreference;
  const captionSize = wordsPerMinute > 175 ? 'small' : wordsPerMinute < 85 ? 'large' : 'medium';

  const sceneAwareCuts = scenes.length > 0;
  const silenceRemoval = silenceSeconds >= .55 && silenceRatio >= .018;
  const reactionDetection = autoReframe && ['gaming','reaction','dynamic'].includes(contentType);
  const dynamicZoom = zoomStyle !== 'minimal' && sceneRate < 10 && hasSpeech;

  const options = {
    ...base,
    intensity,
    preset,
    captionStyle,
    captionPosition:'bottom',
    captionSize,
    captionColor,
    cleanupMode,
    zoomStyle,
    trackingMode,
    cameraMovement,
    autoReframe,
    speakerTracking:autoReframe,
    reactionDetection,
    sceneAwareCuts,
    silenceRemoval,
    dynamicZoom,
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
  return crypto.createHash('sha1').update(`${meta.id}:${sourceStamp}:${Number(start).toFixed(3)}:${Number(end).toFixed(3)}:${options.trackingMode}:${options.cameraMovement}:speaker-reframe-v5`).digest('hex').slice(0,24);
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
  if(options.sceneAwareCuts) boundaries.push(...sceneTimes);
  const frames=tracking?.keyframes||[];
  const switchTimes=(tracking?.summary?.speakerSwitchTimes||[]).map(Number).filter(Number.isFinite);
  if(frames.length){
    // Reframe from the original source often enough to visibly follow the active speaker.
    // Camera movement now controls smoothing, not whether we sample the speaker often enough.
    const maxGap=options.cameraMovement==='high'?.34:options.cameraMovement==='low'?.54:.42;
    let lastTime=-99,lastX=.5,lastY=.45,lastId=null,lastSafe=null;
    for(const f of frames){
      const t=Number(f.time||0), x=Number(f.x||.5), y=Number(f.y||.45), id=f.activeFaceId??null, safe=Boolean(f.safeFrame);
      const moved=Math.hypot(x-lastX,y-lastY)>0.018;
      const speakerChanged=id&&lastId&&id!==lastId;
      const safeChanged=lastSafe!==null&&safe!==lastSafe;
      if(t-lastTime>=maxGap || moved || speakerChanged || safeChanged){boundaries.push(t);lastTime=t;lastX=x;lastY=y;lastId=id||lastId;lastSafe=safe;}
    }
    // Create a short zoom-out bridge around real speaker changes so the frame never has to teleport.
    for(const t of switchTimes){ boundaries.push(Math.max(0,t-.22),t,Math.min(Number(timeline?.pieces?.at(-1)?.end||t+.22),t+.24)); }
  }
  const pieces=splitPiecesAtBoundaries(timeline.pieces,boundaries).map(part=>{
    const mid=(Number(part.start)+Number(part.end))/2;
    const frame=nearestTrackingFrame(tracking,mid);
    const speakerConfidence=frame?Number(frame.speakerConfidence||frame.confidence||0):0;
    const faceCount=Number(frame?.faceCount||0);
    const trackingUnavailable=tracking?.ok===false || !frames.length || !frame;
    const noFace=faceCount<=0;
    const safeFrame=Boolean(trackingUnavailable || noFace || frame?.safeFrame || (frame && faceCount>1 && speakerConfidence<.24));
    const nearSwitch=switchTimes.some(t=>Math.abs(mid-t)<=.24);
    const mode=String(frame?.mode||'');
    const fullSource=safeFrame || nearSwitch || mode==='group' || frame?.activeFaceId===-1;
    const faceHeight=Math.max(0,Number(frame?.faceHeight||0));
    // A confident speaker uses a source-space 9:16 crop. Any ambiguity, tracking failure or
    // speaker transition returns to the COMPLETE source frame instead of a center crop.
    const speakerZoom=faceHeight>0 ? Math.max(1,Math.min(1.18,1.13-(faceHeight-.10)*.55)) : 1.04;
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
  const captions = remapCaptionsForEditedTimeline(captionMeta, clipStart, keepIntervals).filter(c => c.text);
  if (!captions.length) return null;
  const file = path.join(exportsDir, `${meta.id}-${Date.now()}-edited.ass`);
  const sizeScale = options.captionSize === 'large' ? 0.082 : options.captionSize === 'small' ? 0.054 : 0.068;
  const fontSize = Math.max(34, Math.round(width * sizeScale));
  const outline = options.captionStyle === 'minimal' ? Math.max(2, Math.round(width*.0028)) : Math.max(3, Math.round(width * .0046));
  const alignment = options.captionPosition === 'top' ? 8 : options.captionPosition === 'center' ? 5 : 2;
  const marginV = options.captionPosition === 'top' ? Math.round(height*.12) : options.captionPosition === 'center' ? 0 : Math.round(height*.16);
  const styleMap = {
    bold: { font:'Arial', primary:'&H00FFFFFF', secondary:'&H0000FFFF', outline:'&H00000000', back:'&H70000000', shadow:1, spacing:0, bold:-1 },
    clean: { font:'Arial', primary:'&H00FFFFFF', secondary:'&H00FFFFFF', outline:'&H00151515', back:'&H50000000', shadow:0, spacing:0, bold:-1 },
    neon: { font:'Arial', primary:'&H00FFFFFF', secondary:'&H0000FFFF', outline:'&H00A84BFF', back:'&H60000000', shadow:2, spacing:1, bold:-1 },
    minimal: { font:'Arial', primary:'&H00FFFFFF', secondary:'&H00FFFFFF', outline:'&H80000000', back:'&H00000000', shadow:0, spacing:0, bold:0 }
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
  const header = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: Default,${st.font},${fontSize},${st.primary},${st.secondary},${st.outline},${st.back},${st.bold},0,0,0,100,100,${st.spacing},0,1,${outline},${st.shadow},${alignment},55,55,${marginV},1\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n`;
  const transform = options.captionStyle === 'minimal' ? (t)=>t : (t)=>t.toUpperCase();
  const body = captions.map(c => `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${assEscape(transform(stripCaptionPunctuation(c.text)))}`).join('\n');
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
      filter.push(`[0:v]trim=start=${srcA.toFixed(3)}:end=${srcB.toFixed(3)},setpts=PTS-STARTPTS,split=2[fbg${i}][ffg${i}]`);
      filter.push(`[fbg${i}]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},gblur=sigma=20[bg${i}]`);
      filter.push(`[ffg${i}]scale=${width}:${height}:force_original_aspect_ratio=decrease[fg${i}]`);
      filter.push(`[bg${i}][fg${i}]overlay=(W-w)/2:(H-h)/2,setsar=1[v${i}]`);
    }else if(options.autoReframe && part.frameMode==='wide'){
      // Wider source-space bridge retained for compatibility; safety fallbacks now use the full source above.
      const wide=sourceCropForWide(srcW,srcH,width,height,part);
      filter.push(`[0:v]trim=start=${srcA.toFixed(3)}:end=${srcB.toFixed(3)},setpts=PTS-STARTPTS,split=2[wbg${i}][wfg${i}]`);
      filter.push(`[wbg${i}]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},gblur=sigma=20[bg${i}]`);
      filter.push(`[wfg${i}]crop=${wide.cropW}:${wide.cropH}:${wide.x}:${wide.y},scale=${width}:-2:force_original_aspect_ratio=decrease[fg${i}]`);
      filter.push(`[bg${i}][fg${i}]overlay=(W-w)/2:(H-h)/2,setsar=1[v${i}]`);
    }else if(options.autoReframe){
      // Speaker crop is calculated in source pixels, then scaled once to 9:16.
      // This means panning/reframing is never constrained by a previously resized social frame.
      const crop=sourceCropForSpeaker(srcW,srcH,width,height,part,editZoom);
      filter.push(`[0:v]trim=start=${srcA.toFixed(3)}:end=${srcB.toFixed(3)},setpts=PTS-STARTPTS,crop=${crop.cropW}:${crop.cropH}:${crop.x}:${crop.y},scale=${width}:${height}:flags=lanczos,setsar=1[v${i}]`);
    }else{
      let vf=`scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`;
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

  let assFile = null;
  if (options.captions && meta.transcript?.captions?.length) {
    assFile = await writeEditedAss(meta, safeStart, timeline.keep, width, height, options).catch(() => null);
    if (assFile) {
      filter.push(`[${videoLabel}]subtitles='${ffmpegFilterPath(assFile)}'[vout]`);
      videoLabel = 'vout';
    }
  }

  const args = ['-y','-i',meta.sourcePath,'-filter_complex',filter.join(';'),'-map',`[${videoLabel}]`];
  if (hasAudio) args.push('-map',`[${audioLabel}]`);
  args.push('-c:v','libx264','-preset',preview?'ultrafast':'veryfast','-crf',preview?'28':'21','-pix_fmt','yuv420p');
  if (hasAudio) args.push('-c:a','aac','-b:a',preview?'96k':'160k','-ac','2'); else args.push('-an');
  args.push('-movflags','+faststart',outputPath);
  await run('ffmpeg', args, { timeout: preview ? 12*60_000 : 45*60_000 });
  return {
    outputDuration: Number(timeline.keep.reduce((sum,x)=>sum+(x.end-x.start),0).toFixed(2)),
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
      captionColor: options.captionColor
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
        candidates[i].captions = captionsForRange(transcript, candidates[i].start, candidates[i].end);
      }
      candidates[i].editPlan = buildEditPlan(candidates[i], transcript, silences, 'balanced', 'dynamic', 'natural');
    }
    const semanticUsed=Boolean(candidates.some(x=>x?.signals?.semantic));
    const contextReviewed=Boolean(candidates.some(x=>x?.signals?.contextReviewed));
    if(!aiError && transcript?.words?.length && !semanticUsed){
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
    autoDirectorVersion: 'v3',
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
        const renderInfo = await renderEditedClip(meta, safeStart, safeEnd, tmpPath, options, { preview:true, width:540, height:960 });
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

app.post('/api/videos/:id/analyze', async (req, res, next) => {
  try {
    deletedProjectIds.delete(String(req.params.id));
    const meta=await startBackgroundAnalysis(req.params.id,{clipCount:req.body?.clipCount??'auto'});
    res.status(202).json(meta);
  } catch (e) { next(e); }
});


app.post('/api/videos/:id/campaign-check', async (req,res,next) => {
  try {
    const meta=await readMeta(req.params.id); const index=Number(req.body?.index); const base=Number.isInteger(index)&&index>=0?meta.candidates?.[index]:null;
    if(!base)return res.status(404).json({error:'Clip candidate not found.'});
    const start=Math.max(0,Number(req.body?.start??base.start??0)); const end=Math.min(Number(meta.details?.duration||base.end||0),Number(req.body?.end??base.end??start+30));
    const selectionText=meta.transcript?clipTextAbsolute(meta.transcript,start,end):String(base.selectionText||'');
    const candidate={...base,start,end,duration:Math.max(0,end-start),selectionText}; candidate.campaignFit=campaignFitForCandidate(meta,candidate,base.quality||{});
    res.json(campaignCompliance(meta,candidate,req.body?.options||{}));
  } catch(e){next(e)}
});
app.post('/api/videos/:id/variants', async (req,res,next) => {
  try {
    const meta=await readMeta(req.params.id); const index=Number(req.body?.index); const base=Number.isInteger(index)&&index>=0?meta.candidates?.[index]:null;
    if(!base||!meta.transcript)return res.status(404).json({error:'Clip transcript is not ready.'});
    const duration=Number(meta.details?.duration||base.end||0); const modes=[['Tight hook',1.5,-3],['Balanced',0,0],['More context',-4,4]]; const variants=[];
    for(const [label,startDelta,endDelta] of modes){
      const start=Math.max(0,Number(base.start||0)+startDelta),end=Math.min(duration,Number(base.end||0)+endDelta);
      const c=finalizeCandidate(meta,meta.transcript,{...base,id:crypto.randomUUID(),start,end,title:`${base.title||'Clip'} · ${label}`,reason:`${label} campaign variant`,signals:{...(base.signals||{}),variant:true}});
      variants.push(c);
    }
    res.json({variants});
  } catch(e){next(e)}
});


app.post('/api/videos/:id/preview', async (req, res, next) => {
  try {
    const meta = await readMeta(req.params.id);
    const index = Number(req.body?.index);
    const candidate = Number.isInteger(index) && index >= 0 ? meta.candidates?.[index] : null;
    const start = Number(req.body?.start ?? candidate?.start ?? 0);
    const end = Number(req.body?.end ?? candidate?.end ?? start + 30);
    res.json(await ensureCandidatePreview(meta, start, end, req.body?.options || {}));
  } catch (e) { next(e); }
});

app.post('/api/videos/:id/export', async (req, res, next) => {
  try {
    const meta = await readMeta(req.params.id);
    const index = Number(req.body?.index);
    const candidate = Number.isInteger(index) && index >= 0 ? meta.candidates?.[index] : null;
    const start = Math.max(0, Number(req.body.start ?? candidate?.start ?? 0));
    const end = Math.min(meta.details.duration, Number(req.body.end ?? candidate?.end ?? start + 30));
    if (!(end > start)) return res.status(400).json({error:'Invalid clip range.'});
    const outName = `${meta.id}-clip-${Number.isInteger(index)&&index>=0?String(index+1).padStart(2,'0'):'custom'}-${Date.now()}.mp4`;
    const outPath = path.join(exportsDir, outName);
    const compliance=campaignCompliance(meta,candidate||{start,end,selectionText:clipTextAbsolute(meta.transcript,start,end),campaignFit:campaignFitForCandidate(meta,{start,end,selectionText:clipTextAbsolute(meta.transcript,start,end)},candidate?.quality||{})},req.body?.options||{});
    if(compliance.enabled&&!compliance.passed&&req.body?.force!==true)return res.status(409).json({error:'Campaign compliance check failed. Review the campaign checklist before export.',compliance});
    const result = await renderEditedClip(meta, start, end, outPath, req.body?.options || {}, { preview:false, width:1080, height:1920 });
    if(meta.campaignId){
      const data=await readCampaigns().catch(()=>({campaigns:[]})); const ci=data.campaigns.findIndex(c=>c.id===meta.campaignId);
      if(ci>=0){data.campaigns[ci].usedMoments=Array.isArray(data.campaigns[ci].usedMoments)?data.campaigns[ci].usedMoments:[];data.campaigns[ci].usedMoments.push({projectId:meta.id,start,end,exportedAt:new Date().toISOString(),filename:outName});data.campaigns[ci].updatedAt=new Date().toISOString();await writeCampaigns(data);}
    }
    res.json({ url: `/media/exports/${outName}`, filename: outName, compliance, ...result });
  } catch (e) { next(e); }
});

app.post('/api/videos/:id/export-all', async (req, res, next) => {
  try {
    const meta = await readMeta(req.params.id);
    if (!Array.isArray(meta.candidates) || !meta.candidates.length) return res.status(400).json({ error:'No clip candidates to export.' });
    const options = req.body?.options || {};
    const limit = Math.min(40, Math.max(1, Number(req.body?.limit || meta.candidates.length)));
    const results = [];
    const blocked = [];
    const newlyUsed=[];
    for (let i=0; i<Math.min(limit, meta.candidates.length); i++) {
      const c = meta.candidates[i];
      const compliance=campaignCompliance(meta,c,options);
      if(compliance.enabled&&!compliance.passed){blocked.push({index:i,title:c.title||`Clip ${i+1}`,compliance});continue;}
      const outName = `${meta.id}-clip-${String(i+1).padStart(2,'0')}-${Date.now()}.mp4`;
      const outPath = path.join(exportsDir, outName);
      const rendered = await renderEditedClip(meta, Number(c.start||0), Number(c.end||0), outPath, options, { preview:false, width:1080, height:1920 });
      results.push({ index:i, url:`/media/exports/${outName}`, filename:outName, compliance, ...rendered });
      if(meta.campaignId)newlyUsed.push({projectId:meta.id,start:Number(c.start||0),end:Number(c.end||0),exportedAt:new Date().toISOString(),filename:outName});
    }
    if(meta.campaignId&&newlyUsed.length){const data=await readCampaigns().catch(()=>({campaigns:[]}));const ci=data.campaigns.findIndex(c=>c.id===meta.campaignId);if(ci>=0){data.campaigns[ci].usedMoments=Array.isArray(data.campaigns[ci].usedMoments)?data.campaigns[ci].usedMoments:[];data.campaigns[ci].usedMoments.push(...newlyUsed);data.campaigns[ci].updatedAt=new Date().toISOString();await writeCampaigns(data);}}
    res.json({ exports: results, count: results.length, blocked, blockedCount:blocked.length, exportDir: exportsDir });
  } catch (e) { next(e); }
});

app.get('/api/videos/:id', async (req,res,next) => {
  try {
    let meta = await readMeta(req.params.id);
    const recovery = await recoverInterruptedProject(meta).catch(() => ({ meta, recovered:false }));
    meta = recovery.meta;
    meta.processingInterrupted = Boolean(recovery.recovered || meta.processingInterruptedAt || meta.analysis?.interrupted);
    res.json(meta);
  } catch (e) { next(e); }
});

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
app.listen(port, () => console.log(`ClipBoost running at http://localhost:${port}`));
