import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('speaker tracking does not reward unrelated facial motion in speaker score',async()=>{
 const py=await fs.readFile(new URL('../../scripts/track_faces.py',import.meta.url),'utf8');
 const section=py.split('def speaker_score(f):')[1]?.split('meaningful=[]')[0];
 assert.ok(section);
 assert.doesNotMatch(section,/faceEma/);
 assert.match(section,/mouthEma/);
});

test('speaker tracking requires sustained challenger and minimum dwell',async()=>{
 const py=await fs.readFile(new URL('../../scripts/track_faces.py',import.meta.url),'utf8');
 assert.match(py,/last_speaker_switch_t/);
 assert.match(py,/dwell_complete=t_rel-last_speaker_switch_t>=3\.0/);
 assert.match(py,/challenger_streak<max\(3,math\.ceil\(1\.0\/step\)\)/);
});
