import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

test('video rendering invokes valid FFmpeg complex filter script option',()=>{
 const here=path.dirname(fileURLToPath(import.meta.url));
 const server=fs.readFileSync(path.resolve(here,'../index.js'),'utf8');
 assert.ok(server.includes("args.push('-filter_complex_script',filterScriptPath"),
   'Render command must invoke FFmpeg complex filter script');
 assert.equal(server.includes("'-/filter_complex'"),false,
   'Malformed filter command must never return');
});
