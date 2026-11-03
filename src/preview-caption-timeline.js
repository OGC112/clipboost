import { compactCaptionWords } from '../server/video/captions.js';

// Row-only transcripts still need a playback clock for caption effects. Use
// evenly distributed timing only when exact speech timestamps are unavailable.
export function previewPlaybackWords(rows, words) {
  if (words.length) return words;
  return rows.flatMap(row => {
    const tokens = String(row.text || '').trim().split(/\s+/).filter(Boolean);
    const start = Number(row.start), end = Number(row.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
    return tokens.map((word, index) => ({
      word,
      start: start + (end - start) * index / tokens.length,
      end: start + (end - start) * (index + 1) / tokens.length,
    }));
  });
}

// Pure caption timeline preparation for the editor preview.
export function compactPreviewCaptions(rows=[],maxWords=4,maxChars=22){
    const phrases=[
      ['thank','you'],['thanks','so','much'],['so','much'],['do','you'],['did','you'],['are','you'],['can','you'],['could','you'],['would','you'],
      ['you','want','to'],['want','to'],['going','to'],['have','to'],['need','to'],['got','to'],['let','me'],['i','want'],['i','need'],['i','think'],['i','know'],
      ['what','do','you'],['how','do','you'],['why','do','you'],['merci','beaucoup'],['est-ce','que'],['tu','veux'],['vous','voulez'],['je','veux'],['je','pense'],
      ['je','sais'],['on','va'],['il','faut'],['parce','que'],['pour','que']
    ];
    const clean=w=>String(w||'').toLowerCase().replace(/^[("'‘’“”\[]+|[)"'‘’“”\],.!?…:;]+$/g,'').replace(/[’]/g,"'");
    const phraseLen=(tokens,index)=>{
      const rem=tokens.slice(index,index+maxWords).map(t=>clean(t.word));
      for(const p of phrases)if(p.length<=maxWords&&p.length<=rem.length&&p.every((w,i)=>rem[i]===w))return p.length;
      return 0;
    };
    const timed=[];
    for(const row of rows||[]){
      const words=String(row?.text||'').trim().split(/\s+/).filter(Boolean);if(!words.length)continue;
      const start=Number(row.start||0),end=Math.max(start+.05,Number(row.end||start+.05)),span=end-start;
      words.forEach((word,i)=>timed.push({word,start:start+span*(i/words.length),end:start+span*((i+1)/words.length)}));
    }
    const out=[];let i=0;
    while(i<timed.length){
      let take=phraseLen(timed,i);
      if(!take){
        take=1;
        for(let n=2;n<=maxWords&&i+n<=timed.length;n++){
          const text=timed.slice(i,i+n).map(t=>t.word).join(' ');
          if(text.length>maxChars)break;
          take=n;
          if(phraseLen(timed,i+n)&&n>=2)break;
          if(/[.!?…]$/.test(timed[i+n-1].word))break;
        }
      }
      const chunk=timed.slice(i,i+take);
      out.push({start:Number(chunk[0].start.toFixed(3)),end:Number(Math.max(chunk[0].start+.05,chunk.at(-1).end).toFixed(3)),text:chunk.map(t=>t.word).join(' ')});
      i+=take;
    }
    return out;
  }
export function previewCaptionRowsForCandidate(cand, transcript){
    if(!cand)return[];
    // Match export's speech windows and phrase boundaries whenever exact word
    // timestamps exist. Estimated row timing can otherwise join words across
    // audible pauses or assign a word to the wrong preview phrase.
    const words=previewCaptionWordsForCandidate(cand,transcript);
    if(words.length)return compactCaptionWords(words,{maxWords:4,maxChars:22,minWords:1,maxGap:.14});
    // AI Studio and Campaign Studio must consume the exact same transcript
    // timeline. Campaign candidates may carry legacy caption rows, but those
    // are now fallback-only when the project has no transcript captions.
    const absolute=(transcript?.captions||[]).filter(row=>Number(row.end||0)>=Number(cand.start||0)&&Number(row.start||0)<=Number(cand.end||0)).map(row=>({
      ...row,
      start:Math.max(0,Number(row.start||0)-Number(cand.start||0)),
      end:Math.max(.05,Math.min(Number(cand.end||0),Number(row.end||0))-Number(cand.start||0))
    }));
    return compactPreviewCaptions(absolute.length?absolute:(cand.captions||[]),4,22);
  }

export function previewCaptionWordsForCandidate(cand, transcript){
    if(!cand)return[];
    const start=Number(cand.start||0),end=Number(cand.end||start);
    const raw=(transcript?.words||transcript?.rawWords||[])
      .filter(w=>w?.word&&Number(w.end||0)>start+.01&&Number(w.start||0)<end-.01)
      .map(w=>({
        word:String(w.word||'').trim(),
        start:Math.max(0,Number(w.start||0)-start),
        end:Math.max(.03,Math.min(end,Number(w.end||0))-start)
      }))
      .filter(w=>w.word&&w.end>w.start)
      .sort((a,b)=>a.start-b.start);
    const cleanWord=w=>String(w||'').toLowerCase().replace(/^\W+|\W+$/g,'');
    const words=[];
    for(const w of raw){
      const prev=words[words.length-1];
      const same=prev&&cleanWord(prev.word)&&cleanWord(prev.word)===cleanWord(w.word);
      const gap=same?Math.max(0,Number(w.start||0)-Number(prev.end||0)):Infinity;
      if(same&&gap<=.18){prev.end=Math.max(prev.end,w.end);continue}
      words.push({...w});
    }
    return words;
  }
