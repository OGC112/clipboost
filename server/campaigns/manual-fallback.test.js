import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('asset browser always offers original link and manual computer import',async()=>{
 const app=await fs.readFile(new URL('../../src/app.js',import.meta.url),'utf8');
 const browser=app.split('function campaignAssetBrowserMarkup()')[1].split('function campaignDiscover()')[0];
 assert.match(browser,/Open original pack/);
 assert.match(browser,/campaignAssetFallbackFile/);
 assert.match(browser,/Import video from computer/);
});
test('manual asset upload creates a campaign-linked project, not an unrelated upload',async()=>{
 const app=await fs.readFile(new URL('../../src/app.js',import.meta.url),'utf8');
 const flow=app.split('async function importCampaignAssetFromComputer(file)')[1].split('async function openCampaignAssetMedia')[0];
 assert.match(flow,/source-project/);
 assert.match(flow,/manualUpload:true/);
 assert.match(flow,/await uploadVideo\(file\)/);
 const server=await fs.readFile(new URL('./routes.js',import.meta.url),'utf8');
 assert.match(server,/importMethod:manualUpload\?'manual-asset-upload':'automatic'/);
});
