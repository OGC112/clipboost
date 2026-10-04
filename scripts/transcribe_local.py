import argparse, json, sys, subprocess, tempfile, os, time, re, wave, shutil
import numpy as np
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED

_MODEL = None


def probe_duration(path):
    p = subprocess.run([
        'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', path
    ], capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(p.stderr.strip() or 'ffprobe failed')
    return float((p.stdout or '0').strip() or 0)


def detect_silences(path, min_silence=1.3, noise='-38dB'):
    p = subprocess.run([
        'ffmpeg', '-hide_banner', '-nostats', '-i', path,
        '-af', f'silencedetect=noise={noise}:d={min_silence}',
        '-f', 'null', '-'
    ], capture_output=True, text=True)
    text = p.stderr or ''
    starts = [float(x) for x in re.findall(r'silence_start:\s*([0-9.]+)', text)]
    ends = [float(x) for x in re.findall(r'silence_end:\s*([0-9.]+)', text)]
    pairs = []
    for i, s in enumerate(starts):
        e = ends[i] if i < len(ends) else None
        if e is not None and e > s:
            pairs.append((s, e))
    return pairs


def speech_intervals(duration, silences, pad=0.20):
    if not silences:
        return [(0.0, duration)] if duration > 0 else []
    out = []
    cursor = 0.0
    for s, e in silences:
        speech_end = max(cursor, min(duration, s + pad))
        if speech_end - cursor >= 0.35:
            out.append((max(0.0, cursor), speech_end))
        cursor = max(cursor, min(duration, e - pad))
    if duration - cursor >= 0.35:
        out.append((cursor, duration))
    merged = []
    for s, e in out:
        if merged and s - merged[-1][1] < 0.45:
            merged[-1] = (merged[-1][0], e)
        else:
            merged.append((s, e))
    return merged


def make_chunks(intervals, chunk_seconds):
    chunks = []
    for s, e in intervals:
        cur = s
        while cur < e - 0.05:
            dur = min(chunk_seconds, e - cur)
            if dur >= 0.35:
                chunks.append((cur, dur))
            cur += dur
    return chunks


def emit_status(stage, **payload):
    data = {'stage': stage, **payload}
    print(f'@@STATUS {json.dumps(data)}', file=sys.stderr, flush=True)


def prepare_audio(src, dst):
    os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
    # Keep the exact audio preprocessing ClipBoost used per chunk before v21.3.8,
    # but do it once for the whole source instead of decoding the video for every chunk.
    tmp = f'{dst}.tmp.wav'
    try:
        if os.path.exists(tmp):
            os.remove(tmp)
    except Exception:
        pass
    p = subprocess.run([
        'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
        '-i', src, '-vn', '-sn', '-dn', '-ac', '1', '-ar', '16000',
        '-c:a', 'pcm_s16le', tmp
    ], capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(p.stderr.strip() or 'ffmpeg audio preparation failed')
    os.replace(tmp, dst)
    return dst


def valid_pcm_wav(path):
    try:
        if not path or not os.path.exists(path) or os.path.getsize(path) <= 44:
            return False
        with wave.open(path, 'rb') as wf:
            return wf.getnchannels() == 1 and wf.getsampwidth() == 2 and wf.getframerate() == 16000 and wf.getnframes() > 0
    except Exception:
        return False


def extract_pcm_chunk(src, dst, start, duration):
    # Fast sample-accurate slicing of the already-normalized PCM master.
    # This avoids launching/decoding FFmpeg once per Whisper chunk.
    with wave.open(src, 'rb') as rf:
        rate = rf.getframerate()
        channels = rf.getnchannels()
        sample_width = rf.getsampwidth()
        start_frame = max(0, min(rf.getnframes(), int(round(max(0.0, start) * rate))))
        frame_count = max(1, int(round(max(0.35, duration) * rate)))
        rf.setpos(start_frame)
        frames = rf.readframes(frame_count)
        with wave.open(dst, 'wb') as wf:
            wf.setnchannels(channels)
            wf.setsampwidth(sample_width)
            wf.setframerate(rate)
            wf.setcomptype('NONE', 'not compressed')
            wf.writeframes(frames)


def emit_progress(done, total, workers=1, speech_seconds=0, skipped_seconds=0, stage='transcription', cache_hits=0):
    pct = 0 if total <= 0 else max(0, min(100, round(done / total * 100)))
    print(f'@@PROGRESS {json.dumps({"stage": stage, "done": done, "total": total, "percent": pct, "workers": workers, "speech_seconds": round(speech_seconds, 1), "skipped_seconds": round(skipped_seconds, 1), "cache_hits": cache_hits})}', file=sys.stderr, flush=True)


def load_model(model_name, device, compute_type, cpu_threads, workers):
    global _MODEL
    from faster_whisper import WhisperModel
    kwargs = {'num_workers': max(1, int(workers or 1))}
    if device == 'cpu' and cpu_threads and cpu_threads > 0:
        kwargs['cpu_threads'] = int(cpu_threads)
    _MODEL = WhisperModel(model_name, device=device, compute_type=compute_type, **kwargs)


def read_pcm_audio(path):
    # ClipBoost creates 16 kHz mono PCM WAV chunks itself. Passing a float32
    # waveform to faster-whisper bypasses PyAV decoding entirely. This keeps
    # transcription compatible with PyAV 19+, whose av.open() removed the
    # metadata_errors argument still used by some faster-whisper releases.
    with wave.open(path, 'rb') as wf:
        if wf.getnchannels() != 1 or wf.getsampwidth() != 2 or wf.getframerate() != 16000:
            raise RuntimeError('Unexpected Whisper audio format; expected 16 kHz mono PCM.')
        frames = wf.readframes(wf.getnframes())
    return np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0


def transcribe_audio(audio_path, offset):
    global _MODEL
    audio = read_pcm_audio(audio_path)
    segments, info = _MODEL.transcribe(
        audio,
        beam_size=5,
        word_timestamps=True,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=350),
    )
    words = []
    texts = []
    for segment in segments:
        if segment.text:
            texts.append(segment.text.strip())
        for w in (segment.words or []):
            token = (w.word or '').strip()
            if token:
                words.append({'word': token, 'start': float(w.start or 0) + offset, 'end': float(w.end or w.start or 0) + offset})
    return texts, words, getattr(info, 'language', None), getattr(info, 'language_probability', None)


def worker_chunk(job):
    audio_src, start, dur, retry_depth = job
    td = tempfile.mkdtemp(prefix='clipboost-whisper-worker-')
    try:
        wav = os.path.join(td, 'chunk.wav')
        extract_pcm_chunk(audio_src, wav, start, dur)
        try:
            texts, words, lang, prob = transcribe_audio(wav, start)
            return {'start': start, 'duration': dur, 'texts': texts, 'words': words, 'language': lang, 'language_probability': prob}
        except Exception:
            if retry_depth <= 0 or dur < 40:
                raise
            # One difficult chunk should not sink the whole video: retry as two smaller pieces.
            half = dur / 2
            pieces = []
            for ss, dd in ((start, half), (start + half, dur - half)):
                sub = os.path.join(td, f'sub-{int(ss * 1000)}.wav')
                extract_pcm_chunk(audio_src, sub, ss, dd)
                t, w, l, p = transcribe_audio(sub, ss)
                pieces.append((t, w, l, p))
            texts = []
            words = []
            lang = None
            prob = None
            for t, w, l, p in pieces:
                texts.extend(t)
                words.extend(w)
                lang = lang or l
                if prob is None and p is not None:
                    prob = p
            return {'start': start, 'duration': dur, 'texts': texts, 'words': words, 'language': lang, 'language_probability': prob, 'retried': True}
    finally:
        shutil.rmtree(td, ignore_errors=True)


def cache_name(cache_dir, start, dur):
    return os.path.join(cache_dir, f'{int(start * 1000)}-{int(dur * 1000)}.json')


def load_cache(cache_dir, start, dur):
    if not cache_dir:
        return None
    f = cache_name(cache_dir, start, dur)
    if not os.path.exists(f):
        return None
    try:
        with open(f, 'r', encoding='utf-8') as h:
            return json.load(h)
    except Exception:
        return None


def save_cache(cache_dir, result):
    if not cache_dir:
        return
    os.makedirs(cache_dir, exist_ok=True)
    try:
        with open(cache_name(cache_dir, result['start'], result['duration']), 'w', encoding='utf-8') as h:
            json.dump(result, h, ensure_ascii=False)
    except Exception:
        pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--model', default='small')
    parser.add_argument('--device', default='cpu')
    parser.add_argument('--compute-type', default='int8')
    parser.add_argument('--chunk-seconds', type=int, default=120)
    parser.add_argument('--workers', type=int, default=2)
    parser.add_argument('--cpu-threads', type=int, default=0)
    parser.add_argument('--skip-silence', default='true')
    parser.add_argument('--cache-dir', default='')
    parser.add_argument('--audio-cache', default='')
    args = parser.parse_args()

    try:
        import faster_whisper  # noqa: F401
    except Exception:
        print('Missing Python package faster-whisper. Run: python -m pip install -r requirements-local-ai.txt', file=sys.stderr)
        return 2

    temp_audio_dir = None
    try:
        chunk_seconds = max(45, min(600, int(args.chunk_seconds or 120)))
        workers = max(1, min(4, int(args.workers or 1)))
        if args.device != 'cpu':
            workers = 1
        cpu_count = max(1, os.cpu_count() or 1)
        cpu_threads = int(args.cpu_threads or 0) or max(1, cpu_count // workers)

        audio_path = str(args.audio_cache or '').strip()
        if not audio_path:
            temp_audio_dir = tempfile.mkdtemp(prefix='clipboost-whisper-master-')
            audio_path = os.path.join(temp_audio_dir, 'source-16k-mono.wav')
        if not valid_pcm_wav(audio_path):
            emit_status('audio-prep', cached=False)
            prepare_audio(args.input, audio_path)
        else:
            emit_status('audio-prep', cached=True)

        total_duration = probe_duration(audio_path)
        use_silence = str(args.skip_silence).lower() not in ('0', 'false', 'no', 'off')
        emit_status('speech-map')
        silences = detect_silences(audio_path) if use_silence else []
        intervals = speech_intervals(total_duration, silences) if use_silence else [(0.0, total_duration)]
        speech_seconds = sum(max(0, e - s) for s, e in intervals)
        skipped = max(0, total_duration - speech_seconds)
        chunks = make_chunks(intervals, chunk_seconds)
        if not chunks and total_duration > 0:
            chunks = [(0.0, total_duration)]

        results = []
        pending_jobs = []
        for s, d in chunks:
            cached = load_cache(args.cache_dir, s, d)
            if cached:
                results.append(cached)
            else:
                pending_jobs.append((audio_path, s, d, 1))
        total = len(chunks)
        done = len(results)
        cache_hits = done
        emit_progress(done, total, workers, speech_seconds, skipped, cache_hits=cache_hits)

        if pending_jobs:
            # faster-whisper/CTranslate2 supports concurrent transcribe() calls from
            # Python threads when num_workers is configured on one shared model.
            # Loading one model once is faster and lighter than loading one full model
            # in every process, while keeping the exact same Whisper/beam settings.
            emit_status('model-load', workers=workers, cpu_threads=cpu_threads)
            load_model(args.model, args.device, args.compute_type, cpu_threads, workers)
            with ThreadPoolExecutor(max_workers=min(workers, len(pending_jobs))) as pool:
                future_map = {pool.submit(worker_chunk, j): j for j in pending_jobs}
                remaining = set(future_map)
                last_heartbeat = time.time()
                while remaining:
                    finished, _ = wait(remaining, timeout=5, return_when=FIRST_COMPLETED)
                    if not finished:
                        if time.time() - last_heartbeat >= 10:
                            print(f'@@HEARTBEAT {json.dumps({"done": done, "total": total, "workers": workers})}', file=sys.stderr, flush=True)
                            last_heartbeat = time.time()
                        continue
                    for fut in finished:
                        remaining.remove(fut)
                        result = fut.result()
                        save_cache(args.cache_dir, result)
                        results.append(result)
                        done += 1
                        emit_progress(done, total, workers, speech_seconds, skipped, cache_hits=cache_hits)

        results.sort(key=lambda r: r.get('start', 0))
        all_words = []
        all_texts = []
        language = None
        language_probability = None
        for r in results:
            all_texts.extend(r.get('texts', []))
            all_words.extend(r.get('words', []))
            language = language or r.get('language')
            if language_probability is None and r.get('language_probability') is not None:
                language_probability = r.get('language_probability')
        all_words.sort(key=lambda w: (w['start'], w['end']))
        print(json.dumps({
            'text': ' '.join(all_texts).strip(), 'words': all_words, 'language': language,
            'language_probability': language_probability, 'duration': total_duration, 'model': args.model,
            'chunks': total, 'chunk_seconds': chunk_seconds, 'workers': workers, 'cpu_threads': cpu_threads,
            'speech_seconds': speech_seconds, 'skipped_silence_seconds': skipped,
            'cache_hits': cache_hits, 'pipeline': 'fast-audio-v1'
        }, ensure_ascii=False))
        return 0
    except Exception as exc:
        print(f'Local transcription failed: {exc}', file=sys.stderr, flush=True)
        return 1
    finally:
        if temp_audio_dir:
            shutil.rmtree(temp_audio_dir, ignore_errors=True)


if __name__ == '__main__':
    raise SystemExit(main())
