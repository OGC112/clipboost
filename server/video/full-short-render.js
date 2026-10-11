export function stabilizeFullSourceRender(options) {
  if (!options?.keepFullSource) return options;
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
