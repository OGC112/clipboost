import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { compactCaptionRows, compactCaptionWords } from './captions.js';
import { shouldRenderTitleOverlay, shouldRenderAssOverlay, shouldIncludeEditedCaptions } from './hook-render.js';

test('requested Hook renders in export even with no captions or transcript', () => {
  const options={hookTitleEnabled:true,hookTitleText:'WAIT FOR IT',captions:false};
  assert.equal(shouldRenderTitleOverlay(options),true);
  assert.equal(shouldRenderAssOverlay(options,null),true);
  assert.equal(shouldRenderAssOverlay(options,{captions:[]}),true);
});
test('captions alone still render without Hook',()=>{
  const options={hookTitleEnabled:false,hookTitleText:'',captions:true};
  assert.equal(shouldRenderAssOverlay(options,{captions:[{text:'Hello'}]}),true);
  assert.equal(shouldRenderAssOverlay(options,{captions:[]}),false);
});
test('disabled or empty Hook does not create an overlay',()=>{
  assert.equal(shouldRenderAssOverlay({hookTitleEnabled:false,hookTitleText:'Not shown',captions:false},null),false);
  assert.equal(shouldRenderAssOverlay({hookTitleEnabled:true,hookTitleText:'  ',captions:false},null),false);
});

test('Captions Off never writes transcription captions even with Hook enabled',()=>{
  assert.equal(shouldIncludeEditedCaptions({captions:false,captionPreference:'off'}),false);
  assert.equal(shouldIncludeEditedCaptions({captions:true,captionPreference:'off'}),false);
  assert.equal(shouldRenderAssOverlay({captions:false,hookTitleEnabled:true,hookTitleText:'LACY'}, {captions:[{text:'Speech'}]}),true);
});
test('captions remain available for Auto and On when enabled',()=>{
  assert.equal(shouldIncludeEditedCaptions({captions:true,captionPreference:'auto'}),true);
  assert.equal(shouldIncludeEditedCaptions({captions:true,captionPreference:'on'}),true);
  assert.equal(shouldIncludeEditedCaptions({captions:false,captionPreference:'on'}),false);
});

test('editor Captions Off survives Auto Director and ASS generation at preview and export sizes', async()=>{
  // Evaluate the production functions without starting the Express server or FFmpeg.
  const server=fs.readFileSync(new URL('../index.js',import.meta.url),'utf8');
  const app=fs.readFileSync(new URL('../../src/app.js',import.meta.url),'utf8');
  const serverFunction=name=>{
    const start=server.indexOf(`function ${name}(`);
    assert.ok(start>=0,`${name} must exist`);
    const end=server.indexOf('\n}',start);
    return server.slice(start,end+2);
  };
  const renderOptions=app.match(/function currentRenderOptions\(\)\{[^\r\n]+/);
  assert.ok(renderOptions,'editor render options must exist');
  const speech=[{start:0,end:1,text:'Speech must stay hidden'}];
  const words=[{start:0,end:1,word:'Speech'}];
  const writes=[];
  const context=vm.createContext({
    state:{captionPreference:'off',studioMode:'shorts'},currentCaptionY:()=>.8,
    shouldIncludeEditedCaptions,compactCaptionRows,compactCaptionWords,path,
    exportsDir:'exports',fs:{writeFile:async(file,body)=>writes.push(body)},
    // Supply nonempty, already remapped speech so a missing Off guard is observable.
    remapCaptionsForEditedTimeline:()=>speech,remapWordsForEditedTimeline:()=>words,
    assTime:time=>String(time),assEscape:text=>text
  });
  vm.runInContext([
    renderOptions[0],
    ...['normalizeRenderOptions','intervalOverlapSeconds','autoDirectorRenderOptions'].map(serverFunction),
    `async ${serverFunction('writeEditedAss')}`,
    'globalThis.api={currentRenderOptions,autoDirectorRenderOptions,writeEditedAss};'
  ].join('\n'),context);
  const meta={id:'captions-off',details:{duration:10,width:1920,height:1080},transcript:{captions:speech,words}};
  const raw=context.api.currentRenderOptions();
  assert.equal(raw.captionPreference,'off');
  for(const [width,height] of [[540,960],[1080,1920]]){
    for(const hookTitleEnabled of [false,true]){
      const {options}=context.api.autoDirectorRenderOptions(meta,0,10,{
        ...raw,hookTitleEnabled,hookTitleText:'KEEP THIS HOOK'
      });
      assert.equal(options.captions,false);
      assert.equal(shouldRenderAssOverlay(options,meta.transcript),hookTitleEnabled);
      writes.length=0;
      const file=await context.api.writeEditedAss(meta,0,[{start:0,end:10}],width,height,options);
      if(!hookTitleEnabled){
        assert.equal(file,null);
        assert.equal(writes.length,0);
      }else{
        assert.equal(writes.length,1);
        const dialogue=writes[0].split('\n').filter(line=>line.startsWith('Dialogue:'));
        assert.equal(dialogue.length,1);
        assert.match(dialogue[0],/,HookTitle,.*KEEP THIS HOOK/);
        assert.doesNotMatch(writes[0],/Speech/);
      }
    }
  }
});
