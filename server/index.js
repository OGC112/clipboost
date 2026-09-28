import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

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

const libraryFile = path.join(storageRoot, 'library.json');

const settingsEnvPath = process.env.DOTENV_CONFIG_PATH ? path.resolve(process.env.DOTENV_CONFIG_PATH) : path.join(root, '.env');
const SETTINGS_KEYS = [
  'YOUTUBE_API_KEY','TWITCH_CLIENT_ID','TWITCH_CLIENT_SECRET',
  'PYTHON_BIN','LOCAL_WHISPER_MODEL','LOCAL_WHISPER_DEVICE','LOCAL_WHISPER_COMPUTE_TYPE',
  'LOCAL_WHISPER_CHUNK_SECONDS','LOCAL_WHISPER_WORKERS','LOCAL_WHISPER_CPU_THREADS','LOCAL_WHISPER_SKIP_SILENCE',
  'OLLAMA_URL','OLLAMA_MODEL','CLIPBOOST_EXPORT_DIR','CLIPBOOST_UPDATE_OWNER','CLIPBOOST_UPDATE_REPO'
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


async function readLibrary() {
  try { return JSON.parse(await fs.readFile(libraryFile, 'utf8')); }
  catch { return { creators: [] }; }
}
async function writeLibrary(data) {
  await fs.writeFile(libraryFile, JSON.stringify(data, null, 2));
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
    const proc = spawn(command, args, { windowsHide: true });
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
  return {
    python: String(process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3')).trim(),
    maxHeight: Math.max(360, Math.min(2160, Number(process.env.INGEST_MAX_HEIGHT || 720)))
  };
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
    '-o', outputTemplate,
    source.url
  ];

  await new Promise((resolve, reject) => {
    const proc = spawn(cfg.python, args, { cwd: root, windowsHide: true });
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
          current.ingestion = { ...(current.ingestion || {}), stage: 'downloading', progress: lastProgress, engine: 'yt-dlp', error: null };
          current.updatedAt = new Date().toISOString();
          return writeMeta(current);
        }).catch(() => {});
      }
    };
    proc.stdout?.on('data', consume);
    proc.stderr?.on('data', d => { stderr += d.toString(); consume(d); });
    proc.on('error', reject);
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(stderr.trim() || stdout.trim() || `yt-dlp exited with code ${code}`)));
  });

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
  try {
    await downloadExternalSource(projectId);
    const current = await readMeta(projectId);
    current.status = 'analyzing';
    current.ingestion = { ...(current.ingestion || {}), stage: 'downloaded', progress: 100, error: null };
    await writeMeta(current);
    await analyzeProject(projectId);
  } catch (err) {
    try {
      const current = await readMeta(projectId);
      current.status = current.sourcePath ? 'uploaded' : 'linked';
      current.ingestion = {
        ...(current.ingestion || {}),
        stage: 'error',
        progress: Number(current.ingestion?.progress || 0),
        error: err?.message || 'Automatic source ingestion failed.'
      };
      current.updatedAt = new Date().toISOString();
      await writeMeta(current);
    } catch {}
    console.error('External ingestion failed:', err);
  }
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
  await fs.writeFile(path.join(metaDir, `${meta.id}.json`), JSON.stringify(meta, null, 2));
}




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
        LOCAL_WHISPER_WORKERS: env.LOCAL_WHISPER_WORKERS || '2',
        LOCAL_WHISPER_CPU_THREADS: env.LOCAL_WHISPER_CPU_THREADS || '0',
        LOCAL_WHISPER_SKIP_SILENCE: (env.LOCAL_WHISPER_SKIP_SILENCE || 'true') !== 'false',
        OLLAMA_URL: env.OLLAMA_URL || 'http://127.0.0.1:11434',
        OLLAMA_MODEL: env.OLLAMA_MODEL || 'qwen2.5:3b',
        CLIPBOOST_EXPORT_DIR: env.CLIPBOOST_EXPORT_DIR || exportsDir,
        CLIPBOOST_UPDATE_OWNER: env.CLIPBOOST_UPDATE_OWNER || '',
        CLIPBOOST_UPDATE_REPO: env.CLIPBOOST_UPDATE_REPO || ''
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
    python: { ok:false, detail:python },
    tracking: { ok:false, detail:'OpenCV face tracking' },
    ollama: { ok:false, detail:String(process.env.OLLAMA_MODEL || 'qwen2.5:3b') },
    youtube: { ok:Boolean(String(process.env.YOUTUBE_API_KEY || '').trim()), detail:'API key' },
    twitch: { ok:Boolean(String(process.env.TWITCH_CLIENT_ID || '').trim() && String(process.env.TWITCH_CLIENT_SECRET || '').trim()), detail:'Client credentials' },
    paths: { data: dataDir, exports: exportsDir }
  };
  await Promise.all([
    run('ffmpeg',['-version'],{timeout:8000}).then(x=>{result.ffmpeg={ok:true,detail:(x.stdout||x.stderr).split(/\r?\n/)[0]||'Available'}}).catch(()=>{}),
    run('ffprobe',['-version'],{timeout:8000}).then(x=>{result.ffprobe={ok:true,detail:(x.stdout||x.stderr).split(/\r?\n/)[0]||'Available'}}).catch(()=>{}),
    run(python,['--version'],{timeout:8000}).then(x=>{result.python={ok:true,detail:(x.stdout||x.stderr).trim()||python}}).catch(()=>{}),
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
        const meta = JSON.parse(await fs.readFile(path.join(metaDir, name), 'utf8'));
        projects.push({
          id: meta.id,
          originalName: meta.originalName,
          createdAt: meta.createdAt,
          updatedAt: meta.updatedAt || meta.createdAt,
          status: meta.status,
          details: meta.details || {},
          externalSource: meta.externalSource || null,
          candidateCount: Array.isArray(meta.candidates) ? meta.candidates.length : 0,
          sourceUrl: meta.sourceUrl || null
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
    if (['ingesting','analyzing'].includes(meta.status)) return res.status(409).json({ error: 'Wait for the current analysis to finish before deleting this project.' });
    const insideStorage = value => {
      if (!value) return false;
      const resolved = path.resolve(value);
      const rel = path.relative(storageRoot, resolved);
      return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
    };
    if (insideStorage(meta.sourcePath)) await fs.rm(path.resolve(meta.sourcePath), { force:true }).catch(() => {});
    await fs.rm(path.join(storageRoot, 'transcript-cache', meta.id), { recursive:true, force:true }).catch(() => {});
    const previews = await fs.readdir(previewsDir).catch(() => []);
    await Promise.all(previews.filter(name => name.startsWith(`${meta.id}-`)).map(name => fs.rm(path.join(previewsDir,name), { force:true }).catch(() => {})));
    const tracks = await fs.readdir(trackingDir).catch(() => []);
    await Promise.all(tracks.filter(name => name.startsWith(`${meta.id}-`)).map(name => fs.rm(path.join(trackingDir,name), { force:true }).catch(() => {})));
    await fs.rm(path.join(metaDir, `${meta.id}.json`), { force:true });
    res.json({ ok:true, id:meta.id });
  } catch (e) {
    if (e?.code === 'ENOENT') return res.status(404).json({ error:'Project not found.' });
    next(e);
  }
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

function formatCaptionGroup(group=[], nextWord=null, reason='length'){
  if(!group.length) return '';
  const lastRaw=String(group[group.length-1]?.word||'').trim();
  let text=group.map(w=>String(w.word||''))
    .join(' ')
    // Short-form captions read better without editorial punctuation injected every few words.
    .replace(/[;,]+/g,'')
    .replace(/[.!?…](?=\s+\S)/g,'')
    .replace(/\s+([.!?…])/g,'$1')
    .replace(/\s+/g,' ')
    .trim();
  text=capitalizeCaption(text).replace(/[.!?…]+$/,'').trim();
  if(!text) return '';
  const gap=nextWord?Math.max(0,Number(nextWord.start||0)-Number(group[group.length-1].end||0)):9;
  const sourceQuestion=/\?$/.test(lastRaw);
  const sourceExclaim=/!$/.test(lastRaw);
  const sourcePeriod=/[.…]$/.test(lastRaw);
  // Keep punctuation only when it carries meaning. Never append commas just because a caption wrapped.
  if(sourceQuestion || (looksLikeQuestion(group) && (reason==='terminal'||gap>=.72))) text+='?';
  else if(sourceExclaim) text+='!';
  else if(sourcePeriod && reason==='terminal') text+='.';
  else if(reason==='pause' && gap>=1.05) text+='.';
  return text;
}

function wordsToCaptions(words = []) {
  const captions = [];
  let current = [];
  let start = null;
  const flush = (reason='length', nextWord=null) => {
    if (!current.length) return;
    const end = current[current.length - 1].end;
    const text = formatCaptionGroup(current,nextWord,reason);
    if (text) captions.push({
      id: crypto.randomUUID(),
      start: Number(start.toFixed(3)),
      end: Number(end.toFixed(3)),
      text
    });
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
  const whisperWorkers = Math.max(1, Math.min(4, Number(process.env.LOCAL_WHISPER_WORKERS || 2)));
  const whisperCpuThreads = Math.max(0, Number(process.env.LOCAL_WHISPER_CPU_THREADS || 0));
  const skipSilence = String(process.env.LOCAL_WHISPER_SKIP_SILENCE || 'true');
  const attempts = [...new Set([preferredChunk, Math.max(60, Math.floor(preferredChunk / 2))])];
  const cacheBase = path.join(storageRoot, 'transcript-cache', meta.id);
  fsSync.mkdirSync(cacheBase, { recursive: true });
  let lastError = null;

  for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex++) {
    const chunkSeconds = attempts[attemptIndex];
    try {
      if (attemptIndex > 0) {
        const current = await readMeta(meta.id);
        current.analysis = { ...(current.analysis || {}), stage: 'transcription-retry', progress: 43, retryChunkSeconds: chunkSeconds, warning: `Retrying transcription with ${chunkSeconds}s chunks.` };
        await writeMeta(current);
      }
      const result = await runJsonProcess(cfg.python, [
        script,
        '--input', meta.sourcePath,
        '--model', cfg.whisperModel,
        '--device', cfg.whisperDevice,
        '--compute-type', cfg.whisperComputeType,
        '--chunk-seconds', String(chunkSeconds),
        '--cache-dir', path.join(cacheBase, String(chunkSeconds)),
        '--workers', String(whisperWorkers),
        '--cpu-threads', String(whisperCpuThreads),
        '--skip-silence', skipSilence
      ], {
        timeout: 90 * 60_000,
        idleTimeout: Math.max(4 * 60_000, Number(process.env.LOCAL_WHISPER_CHUNK_TIMEOUT_MS || 10 * 60_000)),
        onStderrLine: line => {
          if (!line.startsWith('@@PROGRESS ')) return;
          try {
            const p = JSON.parse(line.slice('@@PROGRESS '.length));
            const pct = Math.max(0, Math.min(100, Number(p.percent || 0)));
            const mapped = Math.round(42 + pct * 0.28);
            readMeta(meta.id).then(current => {
              current.analysis = {
                ...(current.analysis || {}),
                stage: 'transcription',
                progress: mapped,
                transcriptionProgress: pct,
                transcriptionChunk: Number(p.done || 0),
                transcriptionChunks: Number(p.total || 0),
                transcriptionChunkSeconds: chunkSeconds,
                transcriptionWorkers: Number(p.workers || whisperWorkers),
                transcriptionSpeechSeconds: Number(p.speech_seconds || 0),
                transcriptionSkippedSeconds: Number(p.skipped_seconds || 0),
                retryAttempt: attemptIndex
              };
              return writeMeta(current);
            }).catch(() => {});
          } catch {}
        }
      });
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
  const local=Math.round(hook*.22+story*.23+emotion*.10+retention*.18+cleanSpeech*.09+visual*.04+completeness*.10+payoff*.04);
  let overall=clampScore(local*.90+clampScore(baseScore,70)*.10);
  // Hard guardrails: a clip that begins or ends awkwardly cannot rank as an elite pick.
  if(boundary.start<45)overall=Math.min(overall,72);
  if(boundary.end<45)overall=Math.min(overall,70);
  if(boundary.completeness<48)overall=Math.min(overall,68);
  return {hook,story,emotion,retention,cleanSpeech,visual,completeness,payoff,overall,boundary};
}

function snapCandidateToSpeech(transcript,start,end,duration){
  let a=Math.max(0,Number(start||0)), b=Math.min(duration,Math.max(a+3,Number(end||a+30)));
  const units=speechPhraseUnits(transcript);
  if(!units.length)return {start:a,end:b};

  const startChoices=units.filter(u=>u.start>=Math.max(0,a-4.2)&&u.start<=a+2.4);
  if(startChoices.length){
    const ranked=startChoices.map(u=>{
      const q=speechBoundaryQuality(transcript,u.start,Math.min(duration,Math.max(u.end,u.start+18)));
      const distance=Math.abs(u.start-a);
      return {u,rank:q.start-distance*5+(u.reason==='terminal'||u.reason==='pause'?4:0)};
    }).sort((x,y)=>y.rank-x.rank);
    a=Math.max(0,Number(ranked[0].u.start||a));
  }

  const minEnd=Math.min(duration,a+18);
  if(b<minEnd)b=minEnd;
  const maxEnd=Math.min(duration,a+60);
  const endChoices=units.filter(u=>u.end>=Math.max(minEnd,b-3.2)&&u.end<=Math.min(maxEnd,b+6.2));
  if(endChoices.length){
    const ranked=endChoices.map(u=>{
      const q=speechBoundaryQuality(transcript,a,u.end);
      const distance=Math.abs(u.end-b);
      return {u,rank:q.end*.55+q.payoff*.35-distance*2.6+(u.terminal?5:0)};
    }).sort((x,y)=>y.rank-x.rank);
    b=Math.min(duration,Number(ranked[0].u.end||b));
  }

  if(b-a>60){
    const before=units.filter(u=>u.end>a+18&&u.end<=a+60);
    if(before.length){
      before.sort((x,y)=>speechBoundaryQuality(transcript,a,y.end).end-speechBoundaryQuality(transcript,a,x.end).end);
      b=Number(before[0].end);
    }else b=a+60;
  }
  if(b-a<18)b=Math.min(duration,a+18);
  return {start:Number(a.toFixed(2)),end:Number(b.toFixed(2))};
}

function finalizeCandidate(meta,transcript,candidate={}){
  const duration=Number(meta?.details?.duration||candidate.end||0);
  const snapped=snapCandidateToSpeech(transcript,Number(candidate.start||0),Number(candidate.end||0),duration);
  const quality=candidateQuality(meta,transcript,snapped.start,snapped.end,candidate.score||70);
  const caps=clipCaptionsAbsolute(transcript,snapped.start,snapped.end);
  const actualOpening=caps.slice(0,2).map(x=>x.text).join(' ').trim();
  const hook=actualOpening||String(candidate.hook||'').trim();
  const selectionText=clipTextAbsolute(transcript,snapped.start,snapped.end).slice(0,1800);
  return {
    ...candidate,
    start:snapped.start,
    end:snapped.end,
    duration:Number((snapped.end-snapped.start).toFixed(2)),
    score:quality.overall,
    quality,
    hook:hook.slice(0,180),
    selectionText,
    qualityEngine:'v2'
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
  if(Number(q.completeness||0)<60) return false;
  if(Number(boundary.start??q.completeness??0)<54) return false;
  if(Number(boundary.end??q.completeness??0)<54) return false;
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
      if(clipDuration<18)continue;
      if(clipDuration>60)break;
      const endingText=String(units[j].text||'');
      let endRank=58;
      if(units[j].terminal)endRank+=15;
      if(units[j].reason==='pause')endRank+=9;
      if(payoffPattern.test(endingText))endRank+=16;
      if(/[!…]$/.test(endingText.trim()))endRank+=5;
      if(clipDuration>=22&&clipDuration<=48)endRank+=8;
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
        reason:'Quality Engine v2: complete opening, strong payoff and retention signals',
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

async function semanticClipCandidatesLocal(meta, transcript, fallbackCandidates = [], preference = 'auto') {
  const blocks = transcriptBlocks(transcript.words || []);
  const duration = Number(meta.details?.duration || 0);
  const target = resolveClipTarget(duration, preference);
  if (!blocks.length) return selectDiverseCandidates(fallbackCandidates.map(c=>finalizeCandidate(meta,transcript,c)), target, duration, preference);

  const sectionCount = duration > 20*60 ? Math.min(7, Math.max(2, Math.ceil(target/4))) : 1;
  const clips=[];
  for(let section=0; section<sectionCount; section++){
    const sectionStart=(duration*section)/sectionCount;
    const sectionEnd=(duration*(section+1))/sectionCount;
    const sectionBlocks=blocks.filter(b=>b.end>=sectionStart&&b.start<sectionEnd);
    if(!sectionBlocks.length) continue;
    const timedText=sectionBlocks.map(b=>`[${b.start.toFixed(1)}-${b.end.toFixed(1)}] ${b.text}`).join('\n');
    const inputText=timedText.length>38000?timedText.slice(0,38000):timedText;
    const ask=Math.min(7, Math.max(3, Math.ceil(target/sectionCount)+2));
    const prompt=`You are ClipBoost Quality Engine v2, an expert short-form editor. Analyze ONLY this timeline section and choose up to ${ask} genuinely strong, self-contained clips.

Selection rules, in priority order:
1. CONTEXT: the first line must make sense to a viewer who has seen nothing before it. Do not start on a dangling pronoun, connector, answer fragment or mid-sentence clause unless it is an exceptional hook.
2. PAYOFF: the ending must contain the answer, reveal, punchline, reaction, conclusion or useful takeaway. Never cut before the payoff and never end mid-sentence.
3. HOOK: the opening 1-3 seconds should create curiosity, tension, surprise, usefulness or emotion without requiring missing setup.
4. RETENTION: prefer dense, clear speech and a coherent progression; penalize rambling, filler, stutters, long setup and repeated wording.
5. DIVERSITY: do not return multiple variants of the same story or near-duplicate time ranges.
6. LENGTH: usually 20-55 seconds, hard maximum 60 seconds.
7. TIMESTAMPS: choose start/end values that correspond to natural phrase boundaries visible in the transcript. Do not invent content outside this section.

A score above 85 is allowed only when BOTH the opening is self-contained and the ending has a satisfying payoff.

Return ONLY JSON:
{"clips":[{"start":0,"end":30,"score":85,"title":"Short title","hook":"Exact opening idea","reason":"Why the opening and payoff make this self-contained"}]}

Full video duration: ${duration.toFixed(1)} seconds.
Current section: ${sectionStart.toFixed(1)}-${sectionEnd.toFixed(1)} seconds.
Cleaned transcript:
${inputText}`;
    try{
      const parsed=await ollamaGenerateJson(prompt);
      for(const c of (parsed.clips||[])){
        const start=Math.max(sectionStart,Math.min(sectionEnd,Number(c.start||sectionStart)));
        const end=Math.max(start+3,Math.min(duration,sectionEnd+6,Number(c.end||start+30)));
        clips.push(finalizeCandidate(meta,transcript,{ id:crypto.randomUUID(), start, end, score:clampScore(c.score,70), title:String(c.title||`Local AI moment ${clips.length+1}`), hook:String(c.hook||''), reason:String(c.reason||'Selected by ClipBoost Quality Engine v2'), signals:{semantic:true,local:true,quality:true,boundaryAware:true,section:section+1} }));
      }
    }catch(err){
      // A failed model section should not discard deterministic Quality Engine candidates.
    }
  }
  const fallback=fallbackCandidates.map(c=>finalizeCandidate(meta,transcript,c));
  const heuristic=heuristicTranscriptCandidates(meta,transcript,[...clips,...fallback],preference);
  return selectDiverseCandidates([...clips,...heuristic,...fallback],target,duration,preference);
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
  const body = captions.map(c => `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${assEscape(c.text.toUpperCase())}`).join('\n');
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
  const captionColor = ['white','yellow','red','green','blue','purple','orange','black'].includes(String(raw.captionColor || '').toLowerCase()) ? String(raw.captionColor).toLowerCase() : 'white';
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
  const captionColor = contentType === 'gaming' || contentType === 'reaction' ? 'yellow' : 'white';
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
      engine:'Auto Director v2',
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
  return crypto.createHash('sha1').update(`${meta.id}:${sourceStamp}:${Number(start).toFixed(3)}:${Number(end).toFixed(3)}:${options.trackingMode}:${options.cameraMovement}:face-safe-v2`).digest('hex').slice(0,24);
}

async function ensureFaceTracking(meta, start, end, options) {
  if (!options.autoReframe || !options.speakerTracking || !meta?.sourcePath) return null;
  const key = trackingCacheKey(meta, start, end, options);
  const cacheFile = path.join(trackingDir, `${meta.id}-${key}.json`);
  try {
    const cached = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
    if (cached?.keyframes?.length) return cached;
  } catch {}
  const python = String(process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3')).trim();
  const script = path.join(root, 'scripts', 'track_faces.py');
  try {
    const result = await runJsonProcess(python, [script,'--input',meta.sourcePath,'--start',String(start),'--end',String(end),'--mode',options.trackingMode,'--movement',options.cameraMovement,'--step',options.cameraMovement==='high'?'0.25':options.cameraMovement==='low'?'0.55':'0.36'], { timeout: 8*60_000, idleTimeout: 0 });
    if (result?.keyframes?.length) await fs.writeFile(cacheFile, JSON.stringify(result), 'utf8').catch(()=>{});
    return result;
  } catch (error) {
    return { ok:false, error:error?.message || 'Face tracking unavailable.', keyframes:[], summary:{ samples:0, facesDetected:0, faceCountMax:0, speakerSwitches:0, reactionPeaks:0, mode:options.trackingMode, movement:options.cameraMovement } };
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
  if(tracking?.keyframes?.length){
    const minGap=options.cameraMovement==='high'?0.72:options.cameraMovement==='low'?2.0:1.20;
    let lastTime=-99,lastX=.5,lastY=.45,lastId=null,lastSafe=null;
    for(const f of tracking.keyframes){
      const t=Number(f.time||0), x=Number(f.x||.5), y=Number(f.y||.45), id=f.activeFaceId??null, safe=Boolean(f.safeFrame);
      const moved=Math.hypot(x-lastX,y-lastY)>0.045;
      const speakerChanged=id&&lastId&&id!==lastId;
      const safeChanged=lastSafe!==null&&safe!==lastSafe;
      if(t-lastTime>=minGap || moved || speakerChanged || safeChanged){boundaries.push(t);lastTime=t;lastX=x;lastY=y;lastId=id||lastId;lastSafe=safe;}
    }
  }
  const pieces=splitPiecesAtBoundaries(timeline.pieces,boundaries).map(part=>{
    const mid=(Number(part.start)+Number(part.end))/2;
    const frame=nearestTrackingFrame(tracking,mid);
    return {...part,
      focusX:frame?Number(frame.x||.5):.5,
      focusY:frame?Number(frame.y||.44):.44,
      trackingConfidence:frame?Number(frame.confidence||0):0,
      activeFaceId:frame?.activeFaceId??null,
      faceCount:frame?.faceCount||0,
      safeFrame:Boolean(frame?.safeFrame || (frame && Number(frame.confidence||0)<.34))
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
    red:'&H00674DFF',
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
  const body = captions.map(c => `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${assEscape(transform(c.text))}`).join('\n');
  await fs.writeFile(file, header + body + '\n', 'utf8');
  return file;
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
  const fillScale=Math.max(width/srcW,height/srcH);
  const scaledW=Math.max(width,Math.ceil(srcW*fillScale/2)*2);
  const scaledH=Math.max(height,Math.ceil(srcH*fillScale/2)*2);
  const filter = [];
  const hasAudio = Boolean(meta.details?.audioCodec);
  for (let i=0; i<timeline.pieces.length; i++) {
    const part = timeline.pieces[i];
    const srcA = safeStart + part.start;
    const srcB = safeStart + part.end;
    const zoom=Number(part.zoom||1);
    if(options.autoReframe && part.safeFrame){
      // When face detection is uncertain or multiple faces are spread out, never gamble on a tight crop.
      // Keep the entire source visible over a blurred 9:16 background.
      filter.push(`[0:v]trim=start=${srcA.toFixed(3)}:end=${srcB.toFixed(3)},setpts=PTS-STARTPTS,split=2[sbg${i}][sfg${i}]`);
      filter.push(`[sbg${i}]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},gblur=sigma=18[bg${i}]`);
      filter.push(`[sfg${i}]scale=${width}:${height}:force_original_aspect_ratio=decrease[fg${i}]`);
      const safeLabel=`safe${i}`;
      filter.push(`[bg${i}][fg${i}]overlay=(W-w)/2:(H-h)/2,setsar=1[${safeLabel}]`);
      if(zoom>1.001){
        const zw=Math.max(width,Math.round(width*zoom)), zh=Math.max(height,Math.round(height*zoom));
        filter.push(`[${safeLabel}]scale=${zw}:${zh},crop=${width}:${height},setsar=1[v${i}]`);
      }else filter.push(`[${safeLabel}]null[v${i}]`);
    }else{
      let vf;
      if(options.autoReframe){
        const focusX=Math.max(0.02,Math.min(.98,Number(part.focusX??.5)));
        const focusY=Math.max(0.08,Math.min(.92,Number(part.focusY??.44)));
        const cropX=Math.max(0,Math.min(Math.max(0,scaledW-width),Math.round(focusX*scaledW-width/2)));
        const cropY=Math.max(0,Math.min(Math.max(0,scaledH-height),Math.round(focusY*scaledH-height/2)));
        vf=`scale=${scaledW}:${scaledH},crop=${width}:${height}:${cropX}:${cropY}`;
      }else{
        vf=`scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`;
      }
      if (zoom > 1.001) {
        const zw = Math.max(width, Math.round(width * zoom));
        const zh = Math.max(height, Math.round(height * zoom));
        vf += `,scale=${zw}:${zh},crop=${width}:${height}`;
      }
      vf += ',setsar=1';
      filter.push(`[0:v]trim=start=${srcA.toFixed(3)}:end=${srcB.toFixed(3)},setpts=PTS-STARTPTS,${vf}[v${i}]`);
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
    meta.status = 'analyzing';
    meta.analysis = { ...(meta.analysis || {}), stage: 'signals', progress: 12 };
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
          engine: 'FFmpeg + local Quality Engine v2',
          stage: 'transcription',
          progress: 42,
          timeline: {
            scenes: scenes.slice(0, 1000),
            silences: silences.filter(s => Number(s.end||0) > Number(s.start||0)).slice(0, 2000)
          }
        };
        await writeMeta(meta);
        transcript = await transcribeLocally(meta);
        meta.transcript = transcript;
        meta.analysis = { ...meta.analysis, stage: 'semantic-clips', progress: 72, transcription: transcript.model, wordCount: transcript.words.length };
        await writeMeta(meta);
        candidates = await semanticClipCandidatesLocal(meta, transcript, signalCandidates, clipCountPreference);
      } catch (err) {
        aiError = err?.message || 'Local AI analysis failed';
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
    meta.status = 'ready';
    meta.updatedAt = new Date().toISOString();
    meta.analysis = {
      scenesDetected: scenes.length,
      silencesDetected: silences.length,
      engine: transcript ? 'FFmpeg + faster-whisper + Quality Engine v2' : 'FFmpeg signal analysis',
      transcription: transcript?.model || 'not-configured',
      wordCount: transcript?.words?.length || 0,
      captionCount: transcript?.captions?.length || 0,
      transcriptCleanup: transcript?.cleanup ? {
        removedWords: transcript.cleanup.removedWords || 0,
        repetitions: transcript.cleanup.repetitions || 0,
        fillers: transcript.cleanup.fillers || 0
      } : null,
      qualityEngine: transcript ? 'v2' : null,
      stage: 'done',
      progress: 100,
      aiConfigured: true,
      aiError,
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
    autoDirectorVersion: 'v1',
    captionPreference
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

app.post('/api/videos/:id/analyze', async (req, res, next) => {
  try { res.json(await analyzeProject(req.params.id, { clipCount: req.body?.clipCount ?? 'auto' })); } catch (e) { next(e); }
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
    const result = await renderEditedClip(meta, start, end, outPath, req.body?.options || {}, { preview:false, width:1080, height:1920 });
    res.json({ url: `/media/exports/${outName}`, filename: outName, ...result });
  } catch (e) { next(e); }
});

app.post('/api/videos/:id/export-all', async (req, res, next) => {
  try {
    const meta = await readMeta(req.params.id);
    if (!Array.isArray(meta.candidates) || !meta.candidates.length) return res.status(400).json({ error:'No clip candidates to export.' });
    const options = req.body?.options || {};
    const limit = Math.min(40, Math.max(1, Number(req.body?.limit || meta.candidates.length)));
    const results = [];
    for (let i=0; i<Math.min(limit, meta.candidates.length); i++) {
      const c = meta.candidates[i];
      const outName = `${meta.id}-clip-${String(i+1).padStart(2,'0')}-${Date.now()}.mp4`;
      const outPath = path.join(exportsDir, outName);
      const rendered = await renderEditedClip(meta, Number(c.start||0), Number(c.end||0), outPath, options, { preview:false, width:1080, height:1920 });
      results.push({ index:i, url:`/media/exports/${outName}`, filename:outName, ...rendered });
    }
    res.json({ exports: results, count: results.length, exportDir: exportsDir });
  } catch (e) { next(e); }
});

app.get('/api/videos/:id', async (req,res,next) => {
  try { res.json(await readMeta(req.params.id)); } catch (e) { next(e); }
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
