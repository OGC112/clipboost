import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Exercise the actual request handler without booting the editor DOM or server.
const app=readFileSync(new URL('./app.js',import.meta.url),'utf8');
const handler=app.slice(app.indexOf('  async function prepareCandidatePreview('),app.indexOf('  function selectCandidatePreview('));

for(const previewFinalMode of [false,true]){
  test(`${previewFinalMode?'final':'editable'} preview preserves hook coordinates and renders it in the correct layer`,async()=>{
    const options={hookTitleEnabled:true,hookTitleText:'MOVE ME',hookTitleX:.72,hookTitleY:.63,hookTitleScale:1.25};
    const state={previewFinalMode,candidatePreviewRequestId:0,video:{id:'video-1',sourceUrl:'/source.mp4',candidates:[{start:2,end:12}]}};
    let request;
    const context=vm.createContext({
      state,currentRenderOptions:()=>({...options}),render:()=>{},
      fetch:async(url,init)=>{request={url,...JSON.parse(init.body)};return {};},
      readJsonResponse:async()=>({url:'/preview.mp4',edited:true})
    });
    await vm.runInContext(`${handler}\nprepareCandidatePreview(0);`,context);
    assert.equal(request.url,'/api/videos/video-1/preview');
    assert.equal(request.options.hookTitleEnabled,previewFinalMode,
      'Editable previews use the draggable DOM hook; final previews burn it into the video');
    for(const key of ['hookTitleText','hookTitleX','hookTitleY','hookTitleScale']){
      assert.equal(request.options[key],options[key],key);
    }
    assert.equal(options.hookTitleEnabled,true,'Preview overrides must not disable the export hook');
    assert.equal(state.video.candidates[0].previewUrl,'/preview.mp4');
  });
}
