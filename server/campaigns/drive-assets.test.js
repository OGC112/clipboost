import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDriveFolderUrl, extractPublicDriveVideos, inspectPublicDriveFolder } from './drive-assets.js';

const folder='https://drive.google.com/drive/folders/15Olz3M0WJadrjCdNUWOD7kmc-jjQFmJs?usp=sharing';

test('only https Google Drive folders are accepted',()=>{
  assert.equal(parseDriveFolderUrl(folder).id,'15Olz3M0WJadrjCdNUWOD7kmc-jjQFmJs');
  assert.equal(parseDriveFolderUrl('https://evil.com/drive/folders/15Olz3M0WJadrjCdNUWOD7kmc-jjQFmJs'),null);
  assert.equal(parseDriveFolderUrl('http://drive.google.com/drive/folders/15Olz3M0WJadrjCdNUWOD7kmc-jjQFmJs'),null);
});
test('extracts only videos with usable public Drive file IDs, with deduplication',()=>{
  const html='["aaaaaaaaaaaa","clip.mp4","video/mp4"] ["bbbbbbbbbbbb","graphic.png","image/png"] ["aaaaaaaaaaaa","clip.mp4","video/mp4"]';
  const items=extractPublicDriveVideos(html);
  assert.equal(items.length,1);
  assert.equal(items[0].label,'clip.mp4');
  assert.equal(items[0].pageUrl,'https://drive.google.com/file/d/aaaaaaaaaaaa/view');
  assert.equal(items[0].requiresAccessCheck,true);
});
test('missing exposed public file links returns actionable summary, not invented assets',async()=>{
  const result=await inspectPublicDriveFolder(folder,{fetchImpl:async()=>({ok:true,headers:new Headers({'content-type':'text/html'}),text:async()=>'<html>Google Drive folder</html>'})});
  assert.deepEqual(result.items,[]);
  assert.match(result.summary,/Google Drive API/);
});
