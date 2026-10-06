import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { createAppStorage } from './index.js';

test('campaign updates are serialized and retained', async (t) => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'clipboost-storage-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const storage=createAppStorage(dir);
  await Promise.all(Array.from({length:20},(_,i)=>storage.updateCampaigns(data=>{
    data.campaigns.push({id:String(i),name:`Campaign ${i}`});
  })));
  const result=await storage.readCampaigns();
  assert.equal(result.campaigns.length,20);
  assert.equal(new Set(result.campaigns.map(x=>x.id)).size,20);
  JSON.parse(await fs.readFile(path.join(dir,'campaigns.json'),'utf8'));
});
