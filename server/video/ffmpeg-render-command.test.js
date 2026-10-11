import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

test('video rendering uses modern Windows FFmpeg filter graph file option',()=>{
 const here=path.dirname(fileURLToPath(import.meta.url));
 const server=fs.readFileSync(path.resolve(here,'../index.js'),'utf8');
 assert.ok(server.includes("args.push('-/filter_complex',filterScriptPath"),
   'Render command must use the modern FFmpeg file-valued option');
 assert.equal(server.includes("args.push('-filter_complex_script',filterScriptPath"),false,
   'Deprecated FFmpeg option is unsupported by current Windows build');
});
