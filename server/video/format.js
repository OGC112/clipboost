function even(value) {
  const n=Math.max(2,Math.round(Number(value)||2));
  return n % 2 === 0 ? n : n - 1;
}

export function normalizeOutputFormat(value='shorts-9x16') {
  return String(value||'').toLowerCase()==='source' ? 'source' : 'shorts-9x16';
}

export function renderDimensions(meta={}, options={}, {preview=false}={}) {
  const format=normalizeOutputFormat(options?.outputFormat);
  if(format==='shorts-9x16') {
    return preview
      ? {width:540,height:960,format,aspect:'9:16'}
      : {width:1080,height:1920,format,aspect:'9:16'};
  }

  const srcW=Math.max(2,Number(meta?.details?.width||1920));
  const srcH=Math.max(2,Number(meta?.details?.height||1080));
  const maxEdge=preview?960:1920;
  const scale=Math.min(1,maxEdge/Math.max(srcW,srcH));
  return {
    width:even(srcW*scale),
    height:even(srcH*scale),
    format,
    aspect:'source'
  };
}
