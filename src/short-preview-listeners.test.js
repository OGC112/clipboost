import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('./app.js',import.meta.url),'utf8');
// Exercise the actual preview binding without booting the application or a browser.
const binding=source.slice(source.indexOf("    const shortVideo=document.getElementById('shortVideo')"),source.indexOf("    const manualTrimStart=document.getElementById('manualTrimStart')"));

function harness(readyState=2){
  const frames=new Map(),timers=new Map();let nextId=0,plays=0,syncs=0;
  const video=new EventTarget();
  Object.assign(video,{readyState,currentTime:0,paused:false,ended:false,play(){plays++;return Promise.resolve()}});
  const caption={style:{},set innerHTML(value){syncs++}};
  const context=vm.createContext({AbortController,state:{candidatePreviewAutoplay:true},
    document:{getElementById:id=>id==='shortVideo'?video:id==='liveCaption'?caption:null},
    previewCaptionRowsForCandidate:()=>[],previewCaptionWordsForCandidate:()=>[],
    requestAnimationFrame:fn=>{frames.set(++nextId,fn);return nextId},cancelAnimationFrame:id=>frames.delete(id),
    setTimeout:fn=>{timers.set(++nextId,fn);return nextId},clearTimeout:id=>timers.delete(id)});
  vm.runInContext('let disposeShortPreview=null;',context);
  return {video,frames,timers,context,get plays(){return plays},get syncs(){return syncs},
    bind(){vm.runInContext("{\n"+binding+"\n}",context)},dispose(){vm.runInContext('disposeShortPreview?.();disposeShortPreview=null;',context)}};
}

test('repeated preview replacement retires old listeners, caption frames and queued autoplay',()=>{
  const h=harness();
  for(let i=0;i<3;i++){
    h.bind();h.video.dispatchEvent(new Event('play'));
    assert.equal(h.frames.size,1);assert.equal(h.timers.size,1);
    h.dispose();
    assert.equal(h.frames.size,0);assert.equal(h.timers.size,0);
    const syncs=h.syncs;
    for(const name of ['play','pause','timeupdate','seeked','loadedmetadata','ended'])h.video.dispatchEvent(new Event(name));
    assert.equal(h.syncs,syncs);assert.equal(h.frames.size,0);
  }
  h.bind();const before=h.syncs;
  h.video.dispatchEvent(new Event('timeupdate'));
  assert.equal(h.syncs,before+1);
  h.video.dispatchEvent(new Event('play'));assert.equal(h.frames.size,1);
  h.video.dispatchEvent(new Event('pause'));assert.equal(h.frames.size,0);
  h.dispose();
});

test('retired preview cannot autoplay on a late canplay event',()=>{
  const h=harness(0);h.bind();h.dispose();
  h.video.dispatchEvent(new Event('canplay'));assert.equal(h.plays,0);
  h.bind();h.video.dispatchEvent(new Event('canplay'));assert.equal(h.plays,1);
  h.dispose();
});

test('render disposes the preview before replacing editor DOM',()=>{
  const start=source.indexOf('  function render(){');
  const render=source.slice(start,source.indexOf('\n  function bind(){',start));
  const events=[];
  const page=()=>'';
  const context=vm.createContext({disposeShortPreview:()=>events.push('dispose'),state:{page:'studio'},
    home:page,studio:page,campaignDiscover:page,campaigns:page,campaignEditor:page,analytics:page,library:page,projects:page,publish:page,settings:page,
    side:page,top:page,campaignAssetBrowserMarkup:page,modalMarkup:page,bind:()=>events.push('bind'),
    document:{getElementById:()=>({set innerHTML(value){events.push('replace')}})}});
  vm.runInContext(render+';render();render();',context);
  assert.deepEqual(events,['dispose','replace','bind','replace','bind']);
});

