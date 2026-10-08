import test from 'node:test';
import assert from 'node:assert/strict';
import { refineClipEdges, preserveNarrativePause } from './precision-cut.js';

test('extends a clip boundary when it cuts through a spoken word', () => {
  const transcript={rawWords:[{word:'hello',start:2.0,end:2.6},{word:'world',start:8.4,end:9.0}]};
  const result=refineClipEdges({start:2.3,end:8.7},transcript,12);
  assert.equal(result.start,1.91);
  assert.equal(result.end,9.18);
  assert.equal(result.precisionEdges.reason,'avoid-mid-word-cuts');
});

test('does not modify already clean word boundaries', () => {
  const candidate={start:1.8,end:9.2};
  assert.equal(refineClipEdges(candidate,{rawWords:[{word:'hello',start:2,end:2.6},{word:'world',start:8.4,end:9}]},12),candidate);
});

test('never expands a valid 60-second candidate past the limit', () => {
  const candidate={start:2.3,end:62.3};
  const result=refineClipEdges(candidate,{rawWords:[{start:2,end:2.6},{start:62,end:62.6}]},80);
  assert.equal(result,candidate);
});

test('protects the opening, ending and core-moment reaction pause', () => {
  const c={start:10,end:35,narrative:{coreStart:20,coreEnd:25}};
  assert.equal(preserveNarrativePause(c,10.8,11.5),true);
  assert.equal(preserveNarrativePause(c,33,34),true);
  assert.equal(preserveNarrativePause(c,24,26),true);
  assert.equal(preserveNarrativePause(c,16,17),false);
});

test('falls back safely when transcript is missing',()=>{
  const c={start:4,end:16};
  assert.equal(refineClipEdges(c,null,20),c);
});
