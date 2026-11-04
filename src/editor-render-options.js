import { buildEditorAppearance } from './editor-appearance.js';

// Shared request options for preview, campaign checks and both export paths.
// Keep DOM-derived caption positioning in the caller.
export function buildRenderOptions(state, captionY) {
  const isCampaign = Boolean(state.video?.campaign?.id || state.video?.campaignId);
  const isLong = state.studioMode === 'long' && !isCampaign;
  return {
    ...buildEditorAppearance(state),
    autoDirector:true,
    editorContext:isCampaign?'campaign':'general',
    outputFormat:isLong?'source':'shorts-9x16',
    captionPreference:state.captionPreference||'auto',
    captionY,
    sourceSubtitleMode:isCampaign?'keep':(state.sourceSubtitleMode||'keep'),
  };
}
