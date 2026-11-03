import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

test('lime captions export the same RGB color shown in the live preview',()=>{
 const here=path.dirname(fileURLToPath(import.meta.url));
 const server=fs.readFileSync(path.resolve(here,'../index.js'),'utf8');
 const preview=fs.readFileSync(path.resolve(here,'../../src/app.js'),'utf8');
 const previewPalette=preview.match(/const accentMap=\{([^}]+)\}/)?.[1];
 const exportPalette=server.match(/const colorMap=\{([^}]+)\}/)?.[1];
 const rgb=previewPalette?.match(/lime:'#([0-9a-f]{6})'/i)?.[1];
 const ass=exportPalette?.match(/lime:'&H00([0-9a-f]{6})'/i)?.[1];
 assert.ok(rgb,'Live preview must define the lime caption color');
 assert.ok(ass,'ASS export must define the lime caption color');
 // ASS stores BGR, whereas CSS stores RGB.
 const exportedRgb=ass.slice(4,6)+ass.slice(2,4)+ass.slice(0,2);
 assert.equal(exportedRgb.toLowerCase(),rgb.toLowerCase());
});

test('video rendering uses modern Windows FFmpeg filter graph file option',()=>{
 const here=path.dirname(fileURLToPath(import.meta.url));
 const server=fs.readFileSync(path.resolve(here,'../index.js'),'utf8');
 assert.ok(server.includes("args.push('-/filter_complex',filterScriptPath"),
   'Render command must use the modern FFmpeg file-valued option');
 assert.equal(server.includes("args.push('-filter_complex_script',filterScriptPath"),false,
   'Deprecated FFmpeg option is unsupported by current Windows build');
});
