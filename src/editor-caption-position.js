// Shared by preference restoration and the position used for preview/export.
export function hasCustomCaptionY(value) {
  return value != null && String(value).trim() !== '' && Number.isFinite(Number(value));
}

export function resolveCaptionY({ captionPosition, captionY } = {}) {
  if (hasCustomCaptionY(captionY)) {
    return Math.max(.12, Math.min(.88, Number(captionY)));
  }
  return captionPosition === 'top' ? .18 : captionPosition === 'center' ? .50 : .82;
}
