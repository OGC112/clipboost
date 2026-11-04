// Shared by playback ticks and immediate hook-control updates. The caller
// supplies clip-relative time so each path retains its own playback handling.
export function isPreviewHookVisible(state, relativeTime, duration) {
  const hookEnd = state.hookTitleDuration === 'full'
    ? duration
    : Math.min(duration, Number(state.hookTitleDuration || 5));
  return Boolean(state.hookTitleEnabled &&
    String(state.hookTitleText || '').trim() && relativeTime <= hookEnd);
}
