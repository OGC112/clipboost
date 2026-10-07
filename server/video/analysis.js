export function parseSilences(stderr) {
  const starts = [...stderr.matchAll(/silence_start:\s*([0-9.]+)/g)].map(m => Number(m[1]));
  const ends = [...stderr.matchAll(/silence_end:\s*([0-9.]+)/g)].map(m => Number(m[1]));
  return ends.map((end, i) => ({ start: starts[i] ?? Math.max(0, end - 1), end })).filter(x => Number.isFinite(x.end));
}

export function parseScenes(stderr) {
  const matches = [...stderr.matchAll(/pts_time:([0-9.]+)/g)].map(m => Number(m[1]));
  return [...new Set(matches.filter(Number.isFinite))];
}

export function transcriptPauseRanges(transcript, start=0, end=Infinity, minGap=.48, maxGap=3.5) {
  const words = Array.isArray(transcript?.rawWords) && transcript.rawWords.length
    ? transcript.rawWords
    : (Array.isArray(transcript?.words) ? transcript.words : []);
  const rows = words
    .map(w => ({ start:Number(w?.start), end:Number(w?.end) }))
    .filter(w => Number.isFinite(w.start) && Number.isFinite(w.end) && w.end >= start && w.start <= end)
    .sort((a,b) => a.start - b.start);
  const pauses = [];
  for (let i=0; i<rows.length-1; i++) {
    const a = rows[i], b = rows[i+1];
    const gapStart = Math.max(start, a.end);
    const gapEnd = Math.min(end, b.start);
    const gap = gapEnd - gapStart;
    if (gap >= minGap && gap <= maxGap) pauses.push({
      start:Number(gapStart.toFixed(3)),
      end:Number(gapEnd.toFixed(3)),
      duration:Number(gap.toFixed(3)),
      source:'transcript'
    });
  }
  return pauses;
}
