import { buildEditorAppearance } from './editor-appearance.js';

// Snapshot local editor preferences independently of DOM and storage access.
export function buildEditorPreferences(state) {
  const isCampaign = Boolean(state.video?.campaign?.id || state.video?.campaignId);
  return {
    ...buildEditorAppearance(state),
    captionPreference:state.captionPreference,
    keepFullSource:!isCampaign&&Boolean(state.video?.candidates?.[state.selectedCandidate||0]?.keepFullSource),
    captionY:(state.captionY!=null&&String(state.captionY).trim()!==''&&Number.isFinite(Number(state.captionY)))?Number(state.captionY):null,
    sourceSubtitleMode:state.sourceSubtitleMode||'keep',
    watermarkName:state.watermarkName||'',
    studioMode:state.studioMode||'shorts'};
}
