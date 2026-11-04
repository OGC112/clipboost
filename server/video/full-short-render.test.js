import test from 'node:test';
import assert from 'node:assert/strict';
import {stabilizeFullSourceRender} from './full-short-render.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
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

test('saved keep-entire-video choice stabilizes rendering without a client option',()=>{
 const meta={details:{duration:42},candidates:[{start:0,end:42,keepFullSource:true}]};
 const options={editorContext:'general',silenceRemoval:true,cleanupMode:'speech',
  dynamicZoom:true,autoReframe:true,captionPreference:'off',hookTitleText:'Hook',watermarkUrl:'/logo.png'};
 const result=stabilizeFullSourceRender(options,{meta,start:0,end:42});
 assert.equal(result.keepFullSource,true);
 for(const flag of ['silenceRemoval','dynamicZoom','autoReframe'])assert.equal(result[flag],false);
 assert.equal(result.cleanupMode,'off');
 for(const key of ['captionPreference','hookTitleText','watermarkUrl'])assert.equal(result[key],options[key]);
 assert.equal(options.silenceRemoval,true);
 assert.equal(options.keepFullSource,undefined);
});

test('saved full-source choice does not leak to other ranges, campaigns or ordinary clips',()=>{
 const base={details:{duration:42},candidates:[{start:0,end:42,keepFullSource:true}]};
 const options={editorContext:'general',silenceRemoval:true};
 const cases=[
  {meta:base,start:1,end:42},
  {meta:base,start:0,end:41},
  {meta:{...base,candidates:[{start:0,end:42}]},start:0,end:42},
  {meta:{...base,candidates:[{start:2,end:42,keepFullSource:true}]},start:0,end:42},
  {meta:{...base,campaignId:'campaign'},start:0,end:42},
  {meta:{...base,campaign:{id:'campaign'}},start:0,end:42},
  {meta:{details:{duration:61},candidates:[{start:0,end:61,keepFullSource:true}]},start:0,end:61},
 ];
 for(const context of cases)assert.equal(stabilizeFullSourceRender(options,context),options);
 const campaignOptions={...options,editorContext:'campaign'};
 assert.equal(stabilizeFullSourceRender(campaignOptions,{meta:base,start:0,end:42}),campaignOptions);
});

test('preview cache distinguishes saved full-source rendering from automatic edits',()=>{
 const source=readFileSync(new URL('../index.js',import.meta.url),'utf8');
 const cacheSource=source.slice(source.indexOf('function previewCacheKey('),source.indexOf('async function ensureCandidatePreview('));
 const context=vm.createContext({crypto,stabilizeFullSourceRender,normalizeRenderOptions:options=>options});
 vm.runInContext(cacheSource,context);
 const meta={id:'video',updatedAt:'same-version',details:{duration:42},candidates:[{start:0,end:42}]};
 const before=context.previewCacheKey(meta,0,42,{});
 const otherRange=context.previewCacheKey(meta,2,42,{});
 meta.candidates[0].keepFullSource=true;
 assert.notEqual(context.previewCacheKey(meta,0,42,{}),before);
 assert.equal(context.previewCacheKey(meta,2,42,{}),otherRange);
});
