import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { localAiConfig } from './ollama.js';

export function createTranscriptionEngine(deps) {
  const { root, uploadsDir, registerProjectProcess, readMeta, writeMeta } = deps;

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

  return { wordLexeme, stripCaptionPunctuation, formatCaptionGroup, wordsToCaptions, transcriptBlocks, runJsonProcess, transcribeLocally };
}
