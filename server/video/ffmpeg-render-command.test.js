import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {stabilizeFullSourceRender} from './full-short-render.js';

test('video rendering uses modern Windows FFmpeg filter graph file option',()=>{
 const here=path.dirname(fileURLToPath(import.meta.url));
 const server=fs.readFileSync(path.resolve(here,'../index.js'),'utf8');
 assert.ok(server.includes("args.push('-/filter_complex',filterScriptPath"),
   'Render command must use the modern FFmpeg file-valued option');
 assert.equal(server.includes("args.push('-filter_complex_script',filterScriptPath"),false,
   'Deprecated FFmpeg option is unsupported by current Windows build');
});

test('Twitch cropout fills preview and export backgrounds from the cropped source',()=>{
 const here=path.dirname(fileURLToPath(import.meta.url));
 const server=fs.readFileSync(path.resolve(here,'../index.js'),'utf8');
 // Execute the production composition block, rather than a copied FFmpeg graph.
 // This avoids starting the HTTP server or invoking tracking/transcription.
 const start=server.indexOf('  const cropSourceSubtitles =',server.indexOf('async function renderEditedClip('));
 const end=server.indexOf("  let videoLabel = 'vcat';",start);
 assert.ok(start>=0 && end>start,'Render composition block must be found');
 for(const [width,height] of [[540,960],[1080,1920]]){
  for(const sourceSubtitleBottom of [.06,.15,.28]){
   const options=stabilizeFullSourceRender({
    editorContext:'general',sourceSubtitleMode:'crop',sourceSubtitleBottom,
    autoReframe:true,keepFullSource:false
   });
   const graph=vm.runInNewContext(`${server.slice(start,end)}\nfilter.join(';')`,{
    options,width,height,srcW:1920,srcH:1080,safeStart:10,
    meta:{details:{audioCodec:'aac'}},
    timeline:{pieces:[{start:0,end:1,zoom:1},{start:2,end:3,zoom:1}]}
   });
   const croppedHeight=1080-Math.round(1080*sourceSubtitleBottom/2)*2;
   for(let i=0;i<2;i++){
    const time=(10+i*2).toFixed(3);
    assert.ok(graph.includes(`[0:v]trim=start=${time}:end=${(11+i*2).toFixed(3)},setpts=PTS-STARTPTS,crop=1920:${croppedHeight}:0:0,split=2[stablebg${i}][stablefg${i}]`),
     'Remove baked-in subtitles before splitting both source layers');
    assert.ok(graph.includes(`[stablebg${i}]scale=${width}:${height}:flags=lanczos:force_original_aspect_ratio=increase,crop=${width}:${height},gblur=sigma=20[blurredbg${i}]`),
     'Blurred source must cover the entire output canvas');
    assert.ok(graph.includes(`[stablefg${i}]scale=${width}:${height}:flags=lanczos:force_original_aspect_ratio=decrease[stablefront${i}]`),
     'Foreground must fit without additional cropping');
    assert.ok(graph.includes(`[blurredbg${i}][stablefront${i}]overlay=(W-w)/2:(H-h)/2,setsar=1[v${i}]`),
     'Compose the foreground over the blurred source background');
    assert.ok(graph.includes(`[0:a]atrim=start=${time}:end=${(11+i*2).toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`),
     'Audio must retain the matching piece timing');
   }
   assert.doesNotMatch(graph,/\b(?:pad|color|drawbox)=/,'Cropout must not substitute a solid background');
  }
 }
});
