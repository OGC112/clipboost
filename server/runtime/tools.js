import path from 'path';
import fsSync from 'fs';

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

export function createRuntimeTools(root) {
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

  return { windowsTools, runtimeCommand };
}
