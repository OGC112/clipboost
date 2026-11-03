// Shared request options for preview, campaign checks and both export paths.
// Keep DOM-derived caption positioning in the caller.
export function buildRenderOptions(state, captionY) {
  const isCampaign = Boolean(state.video?.campaign?.id || state.video?.campaignId);
  const isLong = state.studioMode === 'long' && !isCampaign;
  return {
    autoDirector:true,
    editorContext:isCampaign?'campaign':'general',
    outputFormat:isLong?'source':'shorts-9x16',
    captionPreference:state.captionPreference||'auto',
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
    captionSize:state.captionSize||'medium',
    captionScale:Number(state.captionScale||1),
    captionPosition:state.captionPosition||'bottom',
    captionY,
    sourceSubtitleMode:isCampaign?'keep':(state.sourceSubtitleMode||'keep'),
    sourceSubtitleBottom:Number(state.sourceSubtitleBottom||.15),
    watermarkUrl:state.watermarkUrl||'',
    watermarkX:Number(state.watermarkX||.86),
    watermarkY:Number(state.watermarkY||.12),
    watermarkScale:Number(state.watermarkScale||.18),
    watermarkOpacity:Number(state.watermarkOpacity||.9),
  };
}
