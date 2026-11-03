// Snapshot local editor preferences independently of DOM and storage access.
export function buildEditorPreferences(state) {
  const isCampaign = Boolean(state.video?.campaign?.id || state.video?.campaignId);
  return {captionPreference:state.captionPreference,
    captionColor:state.captionColor||'auto',
    captionStyle:state.captionStyle||'bold',
    captionFont:state.captionFont||'social',
    captionEffect:state.captionEffect||'active-word',
    hookTitleEnabled:Boolean(state.hookTitleEnabled),
    hookTitleText:String(state.hookTitleText||''),
    hookTitleDuration:String(state.hookTitleDuration||'5'),
    hookTitleScale:Number(state.hookTitleScale||1),
    hookTitleX:Number(state.hookTitleX||.5),
    hookTitleY:Number(state.hookTitleY||.12),
    keepFullSource:!isCampaign&&Boolean(state.video?.candidates?.[state.selectedCandidate||0]?.keepFullSource),
    captionSize:state.captionSize||'medium',
    captionScale:Number(state.captionScale||1),
    captionPosition:state.captionPosition||'bottom',
    captionY:(state.captionY!=null&&String(state.captionY).trim()!==''&&Number.isFinite(Number(state.captionY)))?Number(state.captionY):null,
    sourceSubtitleMode:state.sourceSubtitleMode||'keep',
    sourceSubtitleBottom:Number(state.sourceSubtitleBottom||.15),
    watermarkUrl:state.watermarkUrl||'',
    watermarkName:state.watermarkName||'',
    watermarkX:Number(state.watermarkX||.86),
    watermarkY:Number(state.watermarkY||.12),
    watermarkScale:Number(state.watermarkScale||.18),
    watermarkOpacity:Number(state.watermarkOpacity||.9),
    studioMode:state.studioMode||'shorts'};
}
