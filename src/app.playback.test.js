import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Execute the actual playback binding with a minimal media/DOM fixture.
const source=readFileSync(new URL('./app.js',import.meta.url),'utf8');
const playback=source.slice(source.indexOf("    const shortVideo=document.getElementById('shortVideo'),"),source.indexOf("    const manualTrimStart=document.getElementById('manualTrimStart');"));

for(const effect of ['word-pop','active-word','karaoke','keyword-color','clean-bold']){
  test(`${effect}: unchanged frames preserve caption spans and transitions still render`,()=>{
    const handlers={};
    const video={currentTime:.2,paused:true,addEventListener(name,fn){handlers[name]=fn}};
    let markup='',writes=0;
    const caption={style:{},get innerHTML(){return markup},set innerHTML(value){markup=value;writes++}};
    const hook={style:{}};
    const state={video:{candidates:[{start:0,end:3}]},captionEffect:effect,captionColor:'yellow',hookTitleEnabled:true,hookTitleText:'Hook',hookTitleDuration:1};
    const words=[{word:'Hello &',start:0,end:.5},{word:'world',start:.6,end:1}];
    runInNewContext(playback,{
      state,document:{getElementById:id=>({shortVideo:video,liveCaption:caption,liveHookTitle:hook}[id])},
      previewCaptionRowsForCandidate:()=>[{start:0,end:1,text:'Hello & world'}],
      previewCaptionWordsForCandidate:()=>words,captionWordImportant:word=>word==='world',
      requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{}
    });
    assert.equal(writes,1);
    assert.match(markup,/&amp;/);
    for(let i=0;i<10;i++)handlers.timeupdate();
    assert.equal(writes,1,'same caption must not replace its spans');
    video.currentTime=.7;handlers.seeked();
    assert.equal(writes,['keyword-color','clean-bold'].includes(effect)?1:2);
    state.captionColor='cyan';handlers.timeupdate();
    assert.match(markup,/#35e7ff/,'color edits apply at the same timestamp');
    state.captionPreference='off';handlers.timeupdate();
    assert.equal(caption.style.visibility,'hidden');
    state.captionPreference='auto';handlers.timeupdate();
    assert.equal(caption.style.visibility,'visible');
    video.currentTime=2;handlers.timeupdate();
    assert.equal(markup,'');
    assert.equal(hook.style.visibility,'hidden');
    const silenceWrites=writes;handlers.timeupdate();assert.equal(writes,silenceWrites);
    video.currentTime=.2;handlers.seeked();assert.match(markup,/Hello/);
    state.captionEffect='word-pop';handlers.timeupdate();assert.ok(!markup.includes('world'));
  });
}
