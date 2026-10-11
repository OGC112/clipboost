import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('Windows FFmpeg renders the same blurred short filter graph used in previews',t=>{
 const ffmpeg=process.env.FFMPEG_PATH||'ffmpeg';
 const dir=mkdtempSync(path.join(os.tmpdir(),'clipboost-preview-smoke-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const source=path.join(dir,'source.mp4'),output=path.join(dir,'preview.mp4'),graph=path.join(dir,'filters.txt');
 const run=args=>{
  const result=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-nostdin',...args],{encoding:'utf8',timeout:90000});
  if(result.error)throw result.error;
  assert.equal(result.status,0,'FFmpeg exit code '+result.status+' '+(result.stderr||'').slice(-1400));
 };
 run(['-y','-f','lavfi','-i','testsrc2=size=320x180:rate=24:duration=1','-c:v','mpeg4','-q:v','5',source]);
 const filter='[0:v]trim=start=0:end=1,setpts=PTS-STARTPTS,crop=320:152:0:0,split=2[stablebg0][stablefg0];'+
  '[stablebg0]scale=270:480:flags=lanczos:force_original_aspect_ratio=increase,crop=270:480,gblur=sigma=20[blurredbg0];'+
  '[stablefg0]scale=270:480:flags=lanczos:force_original_aspect_ratio=decrease[stablefront0];'+
  '[blurredbg0][stablefront0]overlay=(W-w)/2:(H-h)/2,setsar=1[v0];[v0]null[vcat]';
 writeFileSync(graph,filter,'utf8');
 run(['-y','-i',source,'-filter_complex_script',graph,'-map','[vcat]','-an','-c:v','mpeg4','-q:v','6','-movflags','+faststart',output]);
 assert.ok(readFileSync(output).length>1024,'Rendered preview empty');
},{timeout:120000});
