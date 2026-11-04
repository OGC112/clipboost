import { compactCaptionRows, compactCaptionWords, dedupeAdjacentWords } from '../server/video/captions.js';

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
    // Match export's phrase boundaries and silence threshold for row-only transcripts.
    return compactCaptionRows(rows,{maxWords,maxChars,minWords:2,maxGap:.14});
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
    // Share export's lexical comparison, including accented words and punctuation.
    return dedupeAdjacentWords(raw);
  }
