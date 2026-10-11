import test from 'node:test';
import assert from 'node:assert/strict';
import {stabilizeFullSourceRender} from './full-short-render.js';
test('keep-full uses one uncut, untracked, nonzooming source sequence',()=>{
 const orig={keepFullSource:true,silenceRemoval:true,cleanupMode:'speech',dynamicZoom:true,sceneAwareCuts:true,reactionDetection:true,speakerTracking:true,autoReframe:true,hookTitleText:'HELLO',hookTitleEnabled:true};
 const rendered=stabilizeFullSourceRender(orig);
 for(const flag of ['silenceRemoval','dynamicZoom','sceneAwareCuts','reactionDetection','speakerTracking','autoReframe'])assert.equal(rendered[flag],false);
 assert.equal(rendered.cleanupMode,'off');
 assert.equal(rendered.hookTitleText,'HELLO');
 assert.equal(rendered.hookTitleEnabled,true);
 assert.equal(orig.silenceRemoval,true);
});
test('regular shorts and campaigns keep their original rendering options',()=>{
 const opts={keepFullSource:false,autoReframe:true,dynamicZoom:true};
 assert.equal(stabilizeFullSourceRender(opts),opts);
});

test('Twitch subtitle crop disables conflicting automatic crops but preserves clip timing and hook',()=>{
 const original={
  editorContext:'general',sourceSubtitleMode:'crop',sourceSubtitleBottom:.15,
  silenceRemoval:true,cleanupMode:'speech',dynamicZoom:true,sceneAwareCuts:true,
  reactionDetection:true,speakerTracking:true,autoReframe:true,
  hookTitleEnabled:true,hookTitleText:'EXAMPLE',hookTitleScale:1.25
 };
 const next=stabilizeFullSourceRender(original);
 for(const flag of ['dynamicZoom','sceneAwareCuts','reactionDetection','speakerTracking','autoReframe'])
  assert.equal(next[flag],false,flag);
 assert.equal(next.sourceSubtitleMode,'crop');
 assert.equal(next.sourceSubtitleBottom,.15);
 assert.equal(next.silenceRemoval,true);
 assert.equal(next.cleanupMode,'speech');
 assert.equal(next.hookTitleText,'EXAMPLE');
 assert.equal(next.hookTitleScale,1.25);
 assert.equal(original.autoReframe,true);
});
test('Twitch crop restrictions do not alter campaign rendering',()=>{
 const campaign={editorContext:'campaign',sourceSubtitleMode:'crop',autoReframe:true};
 assert.equal(stabilizeFullSourceRender(campaign),campaign);
});
test('normal subtitle keep and hide modes do not change tracking',()=>{
 for(const sourceSubtitleMode of ['keep','hide']){
  const input={editorContext:'general',sourceSubtitleMode,autoReframe:true};
  assert.equal(stabilizeFullSourceRender(input),input);
 }
});
