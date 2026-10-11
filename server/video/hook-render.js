export function shouldRenderTitleOverlay(options = {}) {
  return Boolean(options.hookTitleEnabled && String(options.hookTitleText || '').trim());
}

export function shouldRenderAssOverlay(options = {}, transcript = null) {
  return shouldRenderTitleOverlay(options) ||
    Boolean(options.captions && transcript?.captions?.length);
}
