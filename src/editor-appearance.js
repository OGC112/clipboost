// Shared appearance snapshot for saved preferences and preview/export requests.
// Keep context-specific caption positioning and source-subtitle policy in callers.
export function buildEditorAppearance(state) {
  return {
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
    sourceSubtitleBottom:Number(state.sourceSubtitleBottom||.15),
    watermarkUrl:state.watermarkUrl||'',
    watermarkX:Number(state.watermarkX||.86),
    watermarkY:Number(state.watermarkY||.12),
    watermarkScale:Number(state.watermarkScale||.18),
    watermarkOpacity:Number(state.watermarkOpacity||.9),
  };
}
