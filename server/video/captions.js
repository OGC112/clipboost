const TERMINAL=/[.!?…]["')\]]?$/;
const CLEAN_TOKEN=/^[("'‘’“”\[]+|[)"'‘’“”\],.!?…:;]+$/g;

const PHRASES=[
  ['thank','you'],['thanks','so','much'],['so','much'],
  ['do','you'],['did','you'],['are','you'],['can','you'],['could','you'],['would','you'],
  ['you','want','to'],['want','to'],['going','to'],['gonna'],['have','to'],['need','to'],['got','to'],
  ['let','me'],['let','us'],['i','want'],['i','need'],['i','think'],['i','know'],['i','don\'t'],['i','can\'t'],
  ['what','do','you'],['how','do','you'],['why','do','you'],
  ['merci','beaucoup'],['est-ce','que'],['tu','veux'],['vous','voulez'],['je','veux'],['je','pense'],
  ['je','sais'],['je','ne'],['on','va'],['il','faut'],['parce','que'],['pour','que'],['avec','toi'],['avec','vous']
];

const DANGLING_END=new Set([
  'a','an','the','to','of','for','with','and','or','but','in','on','at','from','as','if','that','this','these','those',
  'le','la','les','un','une','des','du','de','d','à','au','aux','pour','avec','et','ou','mais','dans','sur','en','que','qui'
]);

function cleanWord(word=''){
  return String(word).toLowerCase().replace(CLEAN_TOKEN,'').replace(/[’]/g,"'");
}

function phraseLengthAt(tokens,index,maxWords){
  const remaining=tokens.slice(index,index+maxWords).map(t=>cleanWord(t.word));
  for(const phrase of PHRASES){
    if(phrase.length>maxWords||phrase.length>remaining.length)continue;
    if(phrase.every((word,i)=>remaining[i]===word))return phrase.length;
  }
  return 0;
}

function segmentTokenRun(tokens,{maxWords=4,maxChars=22,minWords=2}={}){
  const chunks=[];
  let i=0;
  while(i<tokens.length){
    const phraseLen=phraseLengthAt(tokens,i,maxWords);
    if(phraseLen){
      chunks.push(tokens.slice(i,i+phraseLen));
      i+=phraseLen;
      continue;
    }

    let take=1;
    for(let count=2;count<=maxWords&&i+count<=tokens.length;count++){
      const text=tokens.slice(i,i+count).map(t=>t.word).join(' ');
      if(text.length>maxChars)break;
      take=count;
      const nextPhrase=phraseLengthAt(tokens,i+count,maxWords);
      if(nextPhrase && count>=minWords)break;
      if(TERMINAL.test(tokens[i+count-1].word))break;
    }

    // Avoid ending on articles/prepositions/conjunctions when one more word fits.
    const lastClean=cleanWord(tokens[i+take-1]?.word);
    if(DANGLING_END.has(lastClean)&&i+take<tokens.length&&take<maxWords){
      const extended=tokens.slice(i,i+take+1).map(t=>t.word).join(' ');
      if(extended.length<=maxChars)take++;
    }

    // Prefer at least two words unless punctuation/length forces a single word.
    if(take===1 && i+1<tokens.length){
      const two=tokens.slice(i,i+2).map(t=>t.word).join(' ');
      if(two.length<=maxChars && !phraseLengthAt(tokens,i+1,maxWords))take=2;
    }

    chunks.push(tokens.slice(i,i+take));
    i+=take;
  }
  return chunks;
}

function rowsToTimedTokens(captions=[]){
  const tokens=[];
  const rows=(captions||[]).filter(r=>String(r?.text||'').trim()).sort((a,b)=>Number(a.start||0)-Number(b.start||0));
  for(const row of rows){
    const words=String(row.text||'').trim().split(/\s+/).filter(Boolean);
    if(!words.length)continue;
    const start=Number(row.start||0);
    const end=Math.max(start+.05,Number(row.end||start+.05));
    const span=Math.max(.05,end-start);
    for(let i=0;i<words.length;i++){
      tokens.push({
        word:words[i],
        start:start+span*(i/words.length),
        end:start+span*((i+1)/words.length),
        sourceRow:row
      });
    }
  }
  return tokens;
}

export function compactCaptionRows(captions=[], {maxWords=4,maxChars=22,minWords=2,maxGap=.42}={}) {
  const tokens=rowsToTimedTokens(captions);
  if(!tokens.length)return [];

  const runs=[];
  let current=[];
  for(const token of tokens){
    const prev=current[current.length-1];
    const gap=prev?Number(token.start)-Number(prev.end):0;
    if(current.length && (gap>maxGap || TERMINAL.test(prev.word))){
      runs.push(current);current=[];
    }
    current.push(token);
  }
  if(current.length)runs.push(current);

  const out=[];
  for(const run of runs){
    for(const chunk of segmentTokenRun(run,{maxWords,maxChars,minWords})){
      const text=chunk.map(t=>t.word).join(' ').trim();
      if(!text)continue;
      out.push({
        ...(chunk[0].sourceRow||{}),
        start:Number(chunk[0].start.toFixed(3)),
        end:Number(Math.max(chunk[0].start+.05,chunk.at(-1).end).toFixed(3)),
        text
      });
    }
  }
  return out;
}


export function compactCaptionWords(words=[], {maxWords=4,maxChars=22,minWords=2,maxGap=.14}={}) {
  const tokens=(words||[])
    .filter(w=>String(w?.word||'').trim()&&Number.isFinite(Number(w.start))&&Number.isFinite(Number(w.end)))
    .map(w=>({
      ...w,
      word:String(w.word).trim(),
      start:Number(w.start),
      end:Math.max(Number(w.start)+.02,Number(w.end))
    }))
    .sort((a,b)=>a.start-b.start);
  if(!tokens.length)return [];

  const runs=[];
  let current=[];
  for(const token of tokens){
    const prev=current[current.length-1];
    const gap=prev?Math.max(0,token.start-prev.end):0;
    if(current.length&&(gap>maxGap||TERMINAL.test(prev.word))){
      runs.push(current);
      current=[];
    }
    current.push(token);
  }
  if(current.length)runs.push(current);

  const out=[];
  for(const run of runs){
    for(const chunk of segmentTokenRun(run,{maxWords,maxChars,minWords})){
      const text=chunk.map(t=>t.word).join(' ').trim();
      if(!text)continue;
      out.push({
        start:Number(chunk[0].start.toFixed(3)),
        end:Number(Math.max(chunk[0].start+.02,chunk.at(-1).end).toFixed(3)),
        text,
        words:chunk.map(w=>({
          word:w.word,
          start:Number(w.start.toFixed(3)),
          end:Number(w.end.toFixed(3))
        }))
      });
    }
  }
  return out;
}
