import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('campaign progress does not creep without backend updates',async()=>{
 const app=await fs.readFile(new URL('../../src/app.js',import.meta.url),'utf8');
 const fn=app.split('async function waitForCampaignProjectResult(id)')[1]?.split('async function startCampaignCreating()')[0];
 assert.ok(fn);
 assert.doesNotMatch(fn,/const creep=/);
 assert.match(fn,/const pct=Math\.max\(previous,reported\)/);
});
test('downloader has an inactivity watchdog with cleanup',async()=>{
 const code=await fs.readFile(new URL('../integrations/ytdlp.js',import.meta.url),'utf8');
 assert.match(code,/stallMs=3\*60\*1000/);
 assert.match(code,/clearInterval\(watchdog\)/);
 assert.match(code,/lastActivity=Date\.now\(\)/);
});
