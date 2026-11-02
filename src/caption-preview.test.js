import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Exercise the actual caption renderer without starting the application or media playback.
const source=readFileSync(new URL('./app.js',import.meta.url),'utf8');
const captionCode=source.slice(source.indexOf('      const accentMap='),source.indexOf('      const stopCaptionClock='));

function preview(effect){
  let writes=0,markup='';
  const liveCaption={style:{},set innerHTML(value){writes++;markup=value}};
  const state={captionEffect:effect,captionColor:'auto',captionPreference:'auto'};
  const shortVideo={currentTime:.1};
  const hookTitle={style:{}};
  const context=vm.createContext({liveCaption,state,shortVideo,duration:3,
    document:{getElementById:()=>hookTitle},captionWordImportant:word=>word==='Hello',
    captions:[{start:0,end:2,text:'Hello <world>'}],
    captionWords:[{start:0,end:.8,word:'Hello'},{start:1,end:2,word:'<world>'}]});
  const sync=vm.runInContext(`${captionCode}\nsyncCaption`,context);
  return {sync,state,shortVideo,liveCaption,hookTitle,get writes(){return writes},get markup(){return markup}};
}

for(const effect of ['word-pop','active-word','karaoke','keyword-color','clean-bold']){
  test(`${effect}: identical frames preserve markup; seeks and live changes still update`,()=>{
    const p=preview(effect);
    for(let frame=0;frame<120;frame++)p.sync();
    assert.equal(p.writes,1,'120 unchanged frames should perform one HTML write');
    const first=p.markup;
    p.shortVideo.currentTime=1.2;p.sync();
    assert.ok(p.markup.includes('&lt;world&gt;'));
    if(['word-pop','active-word','karaoke'].includes(effect))assert.notEqual(p.markup,first);
    p.state.captionColor='pink';p.sync();
    assert.ok(p.markup.includes('#ff4fd8'));
    p.state.captionPreference='off';p.sync();
    assert.equal(p.liveCaption.style.visibility,'hidden');
    p.state.captionPreference='auto';p.sync();
    assert.equal(p.liveCaption.style.visibility,'visible');
    p.shortVideo.currentTime=2.5;p.sync();
    assert.equal(p.markup,'');
    const writes=p.writes;p.sync();assert.equal(p.writes,writes);
    p.shortVideo.currentTime=.1;p.sync();
    assert.ok(p.markup.includes('Hello'));
  });
}

test('hook visibility updates even while caption markup stays unchanged',()=>{
  const p=preview('clean-bold');
  Object.assign(p.state,{hookTitleEnabled:true,hookTitleText:'Hook',hookTitleDuration:.5});
  p.sync();assert.equal(p.hookTitle.style.visibility,'visible');
  p.shortVideo.currentTime=.6;p.sync();
  assert.equal(p.hookTitle.style.visibility,'hidden');
  assert.equal(p.writes,1);
});
