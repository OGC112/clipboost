// Preview-only sizing rules. Keep independent of DOM nodes and editor state so
// initial markup and live resizing use the same calculations.
export function previewCaptionFontSize({ captionSize, captionScale } = {}, frameWidth = 0) {
  const ratio = captionSize === 'large' ? .086 : captionSize === 'small' ? .044 : .072;
  const scale = Math.max(.4, Math.min(2, Number(captionScale || 1)));
  const width = Math.max(120, Number(frameWidth) || 300);
  return `${Math.max(10, width * ratio * scale).toFixed(2)}px`;
}

export function previewCaptionOutlineSize({ captionStyle } = {}, frameWidth = 0) {
  const width = Math.max(120, Number(frameWidth) || 300);
  const style = captionStyle || 'bold';
  const ratio = style === 'minimal' ? .0032 : style === 'clean' ? .0052 : style === 'neon' ? .0060 : style === 'box' ? .0025 : style === 'impact' ? .0074 : style === 'pop' ? .0068 : style === 'karaoke' ? .0064 : .0065;
  return Math.max(1, width * ratio);
}
