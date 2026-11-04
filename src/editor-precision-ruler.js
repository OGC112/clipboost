// The caller owns window centering and labels; this module owns ruler DOM reuse.
export function updatePrecisionRuler(ruler, { min, max, value, scenes, silences }, previous) {
  const sameWindow = previous?.ruler === ruler && previous.min === min && previous.max === max;
  if (sameWindow && previous.value === value) return previous;

  const pct = time => Math.max(0, Math.min(100, (time - min) / Math.max(.01, max - min) * 100));
  if (sameWindow && previous.marker) {
    previous.marker.style.left = pct(value) + '%';
    previous.value = value;
    return previous;
  }

  ruler.innerHTML = silences.filter(x => Number(x.end) >= min && Number(x.start) <= max).slice(0, 100)
    .map(x => '<i class="mint-cut-silence" style="left:' + pct(Number(x.start)) + '%;width:' + Math.max(.3, pct(Number(x.end)) - pct(Number(x.start))) + '%"></i>').join('') +
    scenes.filter(time => time >= min && time <= max).slice(0, 100)
      .map(time => '<i class="mint-cut-scene" style="left:' + pct(time) + '%"></i>').join('') +
    '<i class="mint-cut-marker" style="left:' + pct(value) + '%"></i>';
  return { ruler, min, max, value, marker: ruler.querySelector('.mint-cut-marker') };
}
