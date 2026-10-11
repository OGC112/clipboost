export function stabilizeFullSourceRender(options) {
  if (!options) return options;
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
