// Lightweight audio/visual evidence shared by both studios. This deliberately
// reports observable signals, not inferred emotions or facial expressions.
export function contextSignalsForCandidate(candidate, scenes=[], silences=[]) {
  const start=Number(candidate?.start), end=Number(candidate?.end);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return {available:false};
  const coreStart=Math.max(start,Number(candidate?.narrative?.coreStart??candidate?.momentStart??start));
  const coreEnd=Math.min(end,Number(candidate?.narrative?.coreEnd??candidate?.momentEnd??end));
  const visualTransitions=(scenes||[]).map(x=>Number(typeof x==='number'?x:x?.time??x?.start)).filter(t=>Number.isFinite(t)&&t>=start&&t<=end);
  const acousticPauses=(silences||[]).map(x=>({start:Number(x?.start),end:Number(x?.end)})).filter(x=>Number.isFinite(x.start)&&Number.isFinite(x.end)&&x.end>x.start&&x.end>=start&&x.start<=end).map(x=>({start:Math.max(start,x.start),end:Math.min(end,x.end)}));
  const coreSceneChanges=visualTransitions.filter(t=>t>=coreStart-1&&t<=coreEnd+1).length;
  const corePauseSeconds=acousticPauses.reduce((n,x)=>n+Math.max(0,Math.min(coreEnd+1,x.end)-Math.max(coreStart-1,x.start)),0);
  return {available:true,visual:{sceneChanges:visualTransitions.length,nearCore:coreSceneChanges},audio:{pauseCount:acousticPauses.length,nearCorePauseSeconds:Number(corePauseSeconds.toFixed(2))},note:'Scene transitions and acoustic pauses only; no emotion classification'};
}
