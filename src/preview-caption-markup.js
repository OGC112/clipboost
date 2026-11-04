// Pure preview presentation; playback timing and DOM updates belong to the editor.
export function captionWordImportant(word=''){
    const raw=String(word||'').trim();
    const lex=raw.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}%]+$/gu,'');
    return /\d/.test(raw)||raw.length>=8||/^(secret|erreur|problème|vérité|jamais|toujours|résultat|argent|million|mille|pourcent|important|incroyable|impossible|meilleur|pire|mistake|problem|truth|never|always|result|money|percent|crazy|best|worst)$/.test(lex);
  }

const esc=s=>String(s||'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

export function buildPreviewCaptionMarkup({ words, activeSpeechWord, text, effect, accent }) {
  const active=Math.max(0,words.findIndex(w=>activeSpeechWord&&Math.abs(Number(w.start||0)-Number(activeSpeechWord.start||0))<.02));
  if(effect==='word-pop'){
    const w=words[active]||activeSpeechWord;
    return `<span style="display:inline-block;color:${accent};transform:scale(1.12);font-weight:900">${esc(w?.word||'')}</span>`;
  }
  if(effect==='active-word'){
    return words.map((w,i)=>`<span style="color:${i===active?accent:'#fff'};display:inline-block;${i===active?'transform:scale(1.08);':''}">${esc(w.word)}</span>`).join(' ');
  }
  if(effect==='karaoke'){
    return words.map((w,i)=>`<span style="color:${i<=active?accent:'#fff'};display:inline-block">${esc(w.word)}</span>`).join(' ');
  }
  if(effect==='keyword-color'){
    return words.map(w=>`<span style="color:${captionWordImportant(w.word)?accent:'#fff'};display:inline-block;${captionWordImportant(w.word)?'transform:scale(1.08);':''}">${esc(w.word)}</span>`).join(' ');
  }
  return `<span style="color:${accent}">${esc(String(text||activeSpeechWord.word||''))}</span>`;
}
