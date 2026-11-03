// Build once per preview. Prefix end times let us find the first matching word
// even when speech windows overlap or their end times are not ordered.
export function createPreviewWordLookup(words) {
  const starts = words.map(word => Number(word.start || 0) - .01);
  const ends = words.map(word => Number(word.end || 0) + .035);
  const ordered = starts.every((start, index) => Number.isFinite(start) &&
    (index === 0 || start >= starts[index - 1]));
  const matches = (index, time) => time >= starts[index] && time <= ends[index];
  if (!ordered) return time => words.findIndex((_, index) => matches(index, time));

  let latestEnd = -Infinity;
  const prefixEnds = ends.map(end => {
    if (!Number.isNaN(end)) latestEnd = Math.max(latestEnd, end);
    return latestEnd;
  });
  return time => {
    if (Number.isNaN(time)) return -1;
    let low = 0, high = words.length;
    while (low < high) {
      const mid = low + Math.floor((high - low) / 2);
      if (prefixEnds[mid] >= time) high = mid;
      else low = mid + 1;
    }
    return low < words.length && matches(low, time) ? low : -1;
  };
}
