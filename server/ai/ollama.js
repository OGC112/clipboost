export function localAiConfig() {
  return {
    python: String(process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3')).trim(),
    whisperModel: String(process.env.LOCAL_WHISPER_MODEL || 'small').trim(),
    whisperDevice: String(process.env.LOCAL_WHISPER_DEVICE || 'cpu').trim(),
    whisperComputeType: String(process.env.LOCAL_WHISPER_COMPUTE_TYPE || 'int8').trim(),
    ollamaUrl: String(process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, ''),
    ollamaModel: String(process.env.OLLAMA_MODEL || 'qwen2.5:3b').trim()
  };
}

export async function unloadOllamaModelIfLoaded() {
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

export async function ollamaGenerateJson(prompt) {
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