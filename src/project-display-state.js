// Presentation policy for project rows returned by /api/projects.
// Independent of DOM rendering and editor state.
export function projectDisplayState(p){
  if(p?.processingInterrupted)return {progress:36,progressLabel:'Interrupted',badge:'Needs attention',done:false};
  if(p?.status==='ready')return {progress:100,progressLabel:'Ready',badge:'Ready',done:true};
  if(p?.status==='degraded')return {progress:100,progressLabel:'Ready with fallback',badge:'Degraded',done:true};
  if(p?.status==='failed')return {progress:100,progressLabel:'Failed',badge:'Failed',done:false};
  if(p?.status==='uploaded')return {progress:100,progressLabel:'Source ready',badge:'Ready to analyze',done:false};
  if(p?.status==='preparing')return {progress:Number(p?.ingestion?.progress||92),progressLabel:'Preparing source',badge:'In progress',done:false};
  if(p?.status==='linked')return {progress:15,progressLabel:'Linked',badge:p?.ingestionError?'Retry source':'Needs source file',done:false};
  if(['ingesting','analyzing'].includes(p?.status))return {progress:p?.status==='ingesting'?45:65,progressLabel:p?.status==='ingesting'?'Downloading':'Processing',badge:'In progress',done:false};
  return {progress:35,progressLabel:'Needs attention',badge:'Needs attention',done:false};
}
