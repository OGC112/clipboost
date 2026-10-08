// Conservative precision pass: never sacrifice a spoken word to a rounded boundary.
export function refineClipEdges(candidate, transcript, duration) {
  const words=(transcript?.rawWords?.length ? transcript.rawWords : transcript?.words || [])
    .filter(w=>Number.isFinite(Number(w.start))&&Number.isFinite(Number(w.end))&&Number(w.end)>Number(w.start))
    .sort((a,b)=>Number(a.start)-Number(b.start));
  const max=Number.isFinite(Number(duration))&&Number(duration)>0 ? Number(duration) : Infinity;
  let start=Math.max(0,Number(candidate.start)||0);
  let end=Math.min(max,Number(candidate.end)||start);
  if(!(end>start)||!words.length)return candidate;
  const before={start,end};
  // Only correct actual mid-word boundaries; never shift into an earlier sentence.
  const cutFirst=words.find(w=>Number(w.start)<start-.025 && Number(w.end)>start+.025);
  if(cutFirst && start-Number(cutFirst.start)<=.8)start=Math.max(0,Number(cutFirst.start)-.09);
  const cutLast=words.find(w=>Number(w.start)<end-.025 && Number(w.end)>end+.025);
  if(cutLast && Number(cutLast.end)-end<=.8)end=Math.min(max,Number(cutLast.end)+.18);
  if(end-start>60 && before.end-before.start<=60) return candidate;
  if(start===before.start&&end===before.end)return candidate;
  return {...candidate,start:Number(start.toFixed(3)),end:Number(end.toFixed(3)),duration:Number((end-start).toFixed(3)),precisionEdges:{originalStart:before.start,originalEnd:before.end,reason:'avoid-mid-word-cuts'}};
}

// A pause can be the setup, suspense or reaction. Protect pauses near clip edges
// and around the interesting moment instead of indiscriminately jump-cutting them.
export function preserveNarrativePause(candidate, pauseStart, pauseEnd) {
  const start=Number(candidate?.start),end=Number(candidate?.end);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return false;
  const a=Math.max(start,Number(pauseStart)), b=Math.min(end,Number(pauseEnd));
  if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)return false;
  if(a-start<1.4 || end-b<1.8)return true;
  const coreStart=Number(candidate?.narrative?.coreStart ?? candidate?.momentStart);
  const coreEnd=Number(candidate?.narrative?.coreEnd ?? candidate?.momentEnd);
  return Number.isFinite(coreStart)&&Number.isFinite(coreEnd) &&
    a<coreEnd+1.25 && b>coreStart-1.25;
}
