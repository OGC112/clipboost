export function parseSilences(stderr) {
  const starts = [...stderr.matchAll(/silence_start:\s*([0-9.]+)/g)].map(m => Number(m[1]));
  const ends = [...stderr.matchAll(/silence_end:\s*([0-9.]+)/g)].map(m => Number(m[1]));
  return ends.map((end, i) => ({ start: starts[i] ?? Math.max(0, end - 1), end })).filter(x => Number.isFinite(x.end));
}

export function parseScenes(stderr) {
  const matches = [...stderr.matchAll(/pts_time:([0-9.]+)/g)].map(m => Number(m[1]));
  return [...new Set(matches.filter(Number.isFinite))];
}