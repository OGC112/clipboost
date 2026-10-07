export function compactCaptionRows(captions=[], {maxWords=5,maxChars=34}={}) {
  const out=[];
  for(const row of captions||[]){
    const text=String(row?.text||'').trim();
    if(!text) continue;
    const words=text.split(/\s+/).filter(Boolean);
    if(words.length<=maxWords && text.length<=maxChars){
      out.push({...row,text});
      continue;
    }
    const chunks=[]; let current=[];
    for(const word of words){
      const next=[...current,word];
      if(current.length && (next.length>maxWords || next.join(' ').length>maxChars)){
        chunks.push(current.join(' ')); current=[word];
      } else current=next;
    }
    if(current.length) chunks.push(current.join(' '));
    const start=Number(row.start||0), end=Math.max(start+.05,Number(row.end||start+.05));
    const totalWords=Math.max(1,words.length);
    let cursor=start, consumed=0;
    for(let i=0;i<chunks.length;i++){
      const count=chunks[i].split(/\s+/).filter(Boolean).length;
      consumed+=count;
      const chunkEnd=i===chunks.length-1?end:start+(end-start)*(consumed/totalWords);
      out.push({...row,start:cursor,end:Math.max(cursor+.05,chunkEnd),text:chunks[i]});
      cursor=chunkEnd;
    }
  }
  return out;
}
