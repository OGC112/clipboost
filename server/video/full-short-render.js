export function stabilizeFullSourceRender(options, {meta, start, end} = {}) {
  if (!options) return options;
  // The trim route persists this choice on the candidate, rather than in the
  // editor's appearance options. Resolve it here for preview and both exports.
  const duration = Number(meta?.details?.duration);
  const savedFullSource = !meta?.campaign?.id && !meta?.campaignId &&
    options.editorContext !== 'campaign' && duration > 0 && duration <= 60 &&
    Number(start) === 0 && Math.abs(Number(end) - duration) <= .01 &&
    meta?.candidates?.some(candidate => candidate.keepFullSource === true &&
      Number(candidate.start) === 0 && Math.abs(Number(candidate.end) - Number(end)) <= .01);
  if (savedFullSource) options = {...options, keepFullSource:true};
  if (options.keepFullSource) {
    return {
      ...options,
      silenceRemoval:false,
      cleanupMode:'off',
      dynamicZoom:false,
      sceneAwareCuts:false,
      reactionDetection:false,
      speakerTracking:false,
      autoReframe:false
    };
  }
  // Cropping baked-in Twitch subtitles changes the source's usable height.
  // Avoid cascading speaker tracking / framing crops on top of that new
  // geometry: use one stable crop-and-fit composition in the preview AND export.
  // Keep the user's normal time trims and speech cleanup decisions intact.
  if (options.editorContext === 'general' && options.sourceSubtitleMode === 'crop') {
    return {
      ...options,
      dynamicZoom:false,
      sceneAwareCuts:false,
      reactionDetection:false,
      speakerTracking:false,
      autoReframe:false
    };
  }
  return options;
}
