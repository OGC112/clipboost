// Presentation policy for an in-progress campaign import or analysis.
// Completion, errors and polling remain with the caller.
export function campaignProgress(data, previousProgress=0){
  const status=String(data?.status||'');
  const stage=String(data?.analysis?.stage||data?.ingestion?.stage||status||'Working').replace(/-/g,' ');
  const reported=Math.max(0,Math.min(100,Number(data?.analysis?.progress??data?.ingestion?.progress??0)));
  const previous=Math.max(0,Number(previousProgress||0));
  // Never fake large jumps and never let progress move backwards. Backend stages
  // are authoritative; a tiny time-based creep only reassures during long AI calls.
  const creep=Math.min(status==='analyzing'?94:89,previous+(status==='analyzing' ? 0.35 : 0.2));
  const pct=Math.max(previous,reported,creep);
  const nextTitle=status==='analyzing'?'Analyzing campaign video…':'Preparing campaign video…';
  const nextLabel=stage||'Working';
  return {title:nextTitle,progressLabel:nextLabel,progress:pct};
}
