import test from 'node:test';
import assert from 'node:assert/strict';
import { contextSignalsForCandidate } from './context-signals.js';
test('counts scene transitions and silences near a candidate core',()=>{
 const c={start:10,end:30,narrative:{coreStart:18,coreEnd:22}};
 const x=contextSignalsForCandidate(c,[{time:12},{time:19},{time:21},{time:42}],[{start:16,end:19},{start:25,end:27}]);
 assert.equal(x.visual.sceneChanges,3);assert.equal(x.visual.nearCore,2);
 assert.equal(x.audio.pauseCount,2);assert.equal(x.audio.nearCorePauseSeconds,2);
});
test('handles invalid candidates conservatively',()=>{assert.equal(contextSignalsForCandidate({start:10,end:10}).available,false)});
