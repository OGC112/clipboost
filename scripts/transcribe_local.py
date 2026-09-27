import argparse, json, sys, subprocess, tempfile, os, math, time, re
from concurrent.futures import ProcessPoolExecutor, wait, FIRST_COMPLETED

_MODEL = None

def probe_duration(path):
    p = subprocess.run([
        'ffprobe','-v','error','-show_entries','format=duration',
        '-of','default=noprint_wrappers=1:nokey=1', path
    ], capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(p.stderr.strip() or 'ffprobe failed')
    return float((p.stdout or '0').strip() or 0)


def detect_silences(path, min_silence=1.3, noise='-38dB'):
    p = subprocess.run([
        'ffmpeg','-hide_banner','-nostats','-i',path,
        '-af',f'silencedetect=noise={noise}:d={min_silence}',
        '-f','null','-'
    ], capture_output=True, text=True)
    text = p.stderr or ''
    starts = [float(x) for x in re.findall(r'silence_start:\s*([0-9.]+)', text)]
    ends = [float(x) for x in re.findall(r'silence_end:\s*([0-9.]+)', text)]
    pairs=[]
    for i, s in enumerate(starts):
        e = ends[i] if i < len(ends) else None
        if e is not None and e > s:
            pairs.append((s,e))
    return pairs


def speech_intervals(duration, silences, pad=0.20):
    if not silences:
        return [(0.0, duration)] if duration > 0 else []
    out=[]; cursor=0.0
    for s,e in silences:
        speech_end=max(cursor, min(duration, s + pad))
        if speech_end - cursor >= 0.35:
            out.append((max(0.0, cursor), speech_end))
        cursor=max(cursor, min(duration, e - pad))
    if duration - cursor >= 0.35:
        out.append((cursor,duration))
    # merge speech intervals separated by tiny gaps
    merged=[]
    for s,e in out:
        if merged and s - merged[-1][1] < 0.45:
            merged[-1]=(merged[-1][0],e)
        else:
            merged.append((s,e))
    return merged


def make_chunks(intervals, chunk_seconds):
    chunks=[]
    for s,e in intervals:
        cur=s
        while cur < e - 0.05:
            dur=min(chunk_seconds, e-cur)
            if dur >= 0.35:
                chunks.append((cur,dur))
            cur += dur
    return chunks


def extract_chunk(src, dst, start, duration):
    p = subprocess.run([
        'ffmpeg','-hide_banner','-loglevel','error','-y',
        '-ss', str(max(0, start)), '-t', str(max(0.35, duration)), '-i', src,
        '-vn','-ac','1','-ar','16000','-c:a','pcm_s16le', dst
    ], capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(p.stderr.strip() or 'ffmpeg chunk extraction failed')


def emit_progress(done, total, workers=1, speech_seconds=0, skipped_seconds=0, stage='transcription'):
    pct = 0 if total <= 0 else max(0, min(100, round(done / total * 100)))
    print(f'@@PROGRESS {json.dumps({"stage":stage,"done":done,"total":total,"percent":pct,"workers":workers,"speech_seconds":round(speech_seconds,1),"skipped_seconds":round(skipped_seconds,1)})}', file=sys.stderr, flush=True)


def init_worker(model_name, device, compute_type, cpu_threads):
    global _MODEL
    from faster_whisper import WhisperModel
    kwargs={}
    if device == 'cpu' and cpu_threads and cpu_threads > 0:
        kwargs['cpu_threads']=int(cpu_threads)
        kwargs['num_workers']=1
    _MODEL = WhisperModel(model_name, device=device, compute_type=compute_type, **kwargs)


def transcribe_audio(audio_path, offset):
    global _MODEL
    segments, info = _MODEL.transcribe(
        audio_path,
        beam_size=5,
        word_timestamps=True,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=350),
    )
    words=[]; texts=[]
    for segment in segments:
        if segment.text:
            texts.append(segment.text.strip())
        for w in (segment.words or []):
            token=(w.word or '').strip()
            if token:
                words.append({'word':token,'start':float(w.start or 0)+offset,'end':float(w.end or w.start or 0)+offset})
    return texts, words, getattr(info,'language',None), getattr(info,'language_probability',None)


def worker_chunk(job):
    src, start, dur, retry_depth = job
    td=tempfile.mkdtemp(prefix='clipboost-whisper-worker-')
    try:
        wav=os.path.join(td,'chunk.wav')
        extract_chunk(src,wav,start,dur)
        try:
            texts,words,lang,prob=transcribe_audio(wav,start)
            return {'start':start,'duration':dur,'texts':texts,'words':words,'language':lang,'language_probability':prob}
        except Exception as exc:
            if retry_depth <= 0 or dur < 40:
                raise
            # One difficult chunk should not sink the whole video: retry as two smaller pieces.
            half=dur/2
            pieces=[]
            for ss,dd in ((start,half),(start+half,dur-half)):
                sub=os.path.join(td,f'sub-{int(ss*1000)}.wav')
                extract_chunk(src,sub,ss,dd)
                t,w,l,p=transcribe_audio(sub,ss)
                pieces.append((t,w,l,p))
            texts=[]; words=[]; lang=None; prob=None
            for t,w,l,p in pieces:
                texts.extend(t); words.extend(w); lang=lang or l
                if prob is None and p is not None: prob=p
            return {'start':start,'duration':dur,'texts':texts,'words':words,'language':lang,'language_probability':prob,'retried':True}
    finally:
        try:
            import shutil; shutil.rmtree(td, ignore_errors=True)
        except Exception:
            pass


def cache_name(cache_dir,start,dur):
    return os.path.join(cache_dir,f'{int(start*1000)}-{int(dur*1000)}.json')


def load_cache(cache_dir,start,dur):
    if not cache_dir: return None
    f=cache_name(cache_dir,start,dur)
    if not os.path.exists(f): return None
    try:
        with open(f,'r',encoding='utf-8') as h: return json.load(h)
    except Exception: return None


def save_cache(cache_dir,result):
    if not cache_dir: return
    os.makedirs(cache_dir,exist_ok=True)
    try:
        with open(cache_name(cache_dir,result['start'],result['duration']),'w',encoding='utf-8') as h:
            json.dump(result,h,ensure_ascii=False)
    except Exception: pass


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--input',required=True)
    parser.add_argument('--model',default='small')
    parser.add_argument('--device',default='cpu')
    parser.add_argument('--compute-type',default='int8')
    parser.add_argument('--chunk-seconds',type=int,default=120)
    parser.add_argument('--workers',type=int,default=2)
    parser.add_argument('--cpu-threads',type=int,default=0)
    parser.add_argument('--skip-silence',default='true')
    parser.add_argument('--cache-dir',default='')
    args=parser.parse_args()
    try:
        import faster_whisper  # noqa: F401
    except Exception:
        print('Missing Python package faster-whisper. Run: python -m pip install -r requirements-local-ai.txt',file=sys.stderr)
        return 2
    try:
        total_duration=probe_duration(args.input)
        chunk_seconds=max(45,min(600,int(args.chunk_seconds or 120)))
        workers=max(1,min(4,int(args.workers or 1)))
        if args.device != 'cpu': workers=1
        cpu_count=max(1,os.cpu_count() or 1)
        cpu_threads=int(args.cpu_threads or 0) or max(1,cpu_count//workers)
        use_silence=str(args.skip_silence).lower() not in ('0','false','no','off')
        silences=detect_silences(args.input) if use_silence else []
        intervals=speech_intervals(total_duration,silences) if use_silence else [(0.0,total_duration)]
        speech_seconds=sum(max(0,e-s) for s,e in intervals)
        skipped=max(0,total_duration-speech_seconds)
        chunks=make_chunks(intervals,chunk_seconds)
        if not chunks and total_duration>0: chunks=[(0.0,total_duration)]

        results=[]; pending_jobs=[]
        for s,d in chunks:
            cached=load_cache(args.cache_dir,s,d)
            if cached: results.append(cached)
            else: pending_jobs.append((args.input,s,d,1))
        total=len(chunks); done=len(results)
        emit_progress(done,total,workers,speech_seconds,skipped)

        if pending_jobs:
            with ProcessPoolExecutor(max_workers=min(workers,len(pending_jobs)), initializer=init_worker,
                                     initargs=(args.model,args.device,args.compute_type,cpu_threads)) as pool:
                future_map={pool.submit(worker_chunk,j):j for j in pending_jobs}
                remaining=set(future_map)
                last_heartbeat=time.time()
                while remaining:
                    finished,_=wait(remaining,timeout=5,return_when=FIRST_COMPLETED)
                    if not finished:
                        # Heartbeat keeps the Node watchdog alive during a slow chunk.
                        if time.time()-last_heartbeat>=10:
                            print(f'@@HEARTBEAT {json.dumps({"done":done,"total":total,"workers":workers})}',file=sys.stderr,flush=True)
                            last_heartbeat=time.time()
                        continue
                    for fut in finished:
                        remaining.remove(fut)
                        result=fut.result()
                        save_cache(args.cache_dir,result)
                        results.append(result); done+=1
                        emit_progress(done,total,workers,speech_seconds,skipped)

        results.sort(key=lambda r:r.get('start',0))
        all_words=[]; all_texts=[]; language=None; language_probability=None
        for r in results:
            all_texts.extend(r.get('texts',[])); all_words.extend(r.get('words',[]))
            language=language or r.get('language')
            if language_probability is None and r.get('language_probability') is not None:
                language_probability=r.get('language_probability')
        all_words.sort(key=lambda w:(w['start'],w['end']))
        print(json.dumps({
            'text':' '.join(all_texts).strip(),'words':all_words,'language':language,
            'language_probability':language_probability,'duration':total_duration,'model':args.model,
            'chunks':total,'chunk_seconds':chunk_seconds,'workers':workers,'cpu_threads':cpu_threads,
            'speech_seconds':speech_seconds,'skipped_silence_seconds':skipped
        },ensure_ascii=False))
        return 0
    except Exception as exc:
        print(f'Local transcription failed: {exc}',file=sys.stderr,flush=True)
        return 1

if __name__=='__main__':
    raise SystemExit(main())
