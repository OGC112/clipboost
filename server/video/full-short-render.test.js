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
