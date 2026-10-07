import test from 'node:test';
import assert from 'node:assert/strict';
import { compactCaptionRows } from './captions.js';

test('keeps a short natural caption intact',()=>{
  const rows=compactCaptionRows([{start:0,end:1,text:'Short caption'}]);
  assert.equal(rows.length,1);
  assert.equal(rows[0].text,'Short caption');
});

test('groups common phrases coherently',()=>{
  const rows=compactCaptionRows([{start:0,end:4,text:'Thank you so much you want to switch'}],{maxWords:4,maxChars:22});
  assert.deepEqual(rows.map(x=>x.text),['Thank you','so much','you want to','switch']);
  assert.equal(rows[0].start,0);
  assert.equal(rows.at(-1).end,4);
});

test('never produces oversized social bursts',()=>{
  const rows=compactCaptionRows([{start:0,end:5,text:'this is a deliberately long caption that should become several readable social bursts'}],{maxWords:4,maxChars:22});
  assert.ok(rows.length>1);
  assert.ok(rows.every(x=>x.text.split(/\s+/).length<=4));
  assert.ok(rows.every(x=>x.text.length<=22));
});

test('respects pauses between caption rows',()=>{
  const rows=compactCaptionRows([
    {start:0,end:1,text:'thank you'},
    {start:1.1,end:2,text:'so much'},
    {start:3,end:4,text:'you want to switch'}
  ],{maxWords:4,maxChars:22,maxGap:.42});
  assert.deepEqual(rows.map(x=>x.text),['thank you','so much','you want to','switch']);
  assert.ok(rows[2].start>=3);
});
