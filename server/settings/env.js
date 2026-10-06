import fs from 'fs/promises';
import path from 'path';

export const SETTINGS_KEYS = [
  'YOUTUBE_API_KEY','TWITCH_CLIENT_ID','TWITCH_CLIENT_SECRET',
  'PYTHON_BIN','LOCAL_WHISPER_MODEL','LOCAL_WHISPER_DEVICE','LOCAL_WHISPER_COMPUTE_TYPE',
  'LOCAL_WHISPER_CHUNK_SECONDS','LOCAL_WHISPER_WORKERS','LOCAL_WHISPER_CPU_THREADS','LOCAL_WHISPER_SKIP_SILENCE',
  'OLLAMA_URL','OLLAMA_MODEL','CLIPBOOST_EXPORT_DIR','CLIPBOOST_UPDATE_OWNER','CLIPBOOST_UPDATE_REPO',
  'YOUTUBE_AUTH_BROWSER','NODE_BIN','FFMPEG_BIN'
];

export function parseEnvText(text='') {
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

export function serializeEnv(map) {
  return Object.entries(map).map(([k,v]) => `${k}=${String(v ?? '').replace(/\r?\n/g,'')}`).join('\n') + '\n';
}

export function maskSecret(value='') {
  const v = String(value || '');
  if (!v) return '';
  if (v.length <= 8) return '••••••••';
  return `${v.slice(0,4)}••••••••${v.slice(-4)}`;
}

export function createSettingsEnv(root) {
  const settingsEnvPath = process.env.DOTENV_CONFIG_PATH ? path.resolve(process.env.DOTENV_CONFIG_PATH) : path.join(root, '.env');

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

  return { settingsEnvPath, readSettingsEnv, writeSettingsEnv };
}
