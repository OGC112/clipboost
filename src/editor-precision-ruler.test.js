import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { updatePrecisionRuler } from './editor-precision-ruler.js';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const start = source.indexOf('    const precisionCenters=');
const rulerSource = source.slice(start, source.indexOf('    if(precisionWindow)', start));

function setup() {
  const nodes = {}, writes = { Start: 0, End: 0 };
  for (const name of ['Start', 'End']) {
    nodes[`precision${name}Ruler`] = {
      get innerHTML() { return this.markup; },
      set innerHTML(value) {
        writes[name]++;
        this.markup = value;
        this.marker = { style: { left: value.match(/mint-cut-marker.*left:([^%]+%)/)[1] } };
      },
      querySelector(selector) { assert.equal(selector, '.mint-cut-marker'); return this.marker; },
    };
    for (const suffix of ['Label', 'Min', 'Max']) nodes[`precision${name}${suffix}`] = {};
  }
  const input = () => ({ setAttribute(name, value) { this[name] = value; } });
  const precisionStart = input(), precisionEnd = input(), precisionWindow = { value: 5 };
  const context = vm.createContext({
    state: { video: { details: { duration: 60 } } },
    manualTrimStart: { value: 10 }, manualTrimEnd: { value: 30 },
    precisionStart, precisionEnd, precisionWindow, updatePrecisionRuler,
    precisionScenes: [8, 12, 28, 32],
    precisionSilences: [{ start: 7, end: 9 }, { start: 31, end: 33 }],
    document: { getElementById: id => nodes[id] }, formatTime: value => String(value),
  });
  vm.runInContext(rulerSource + '\nthis.sync = syncPrecisionZoom;', context);
  return { nodes, writes, precisionStart, precisionEnd, precisionWindow, sync: context.sync };
}

test('trim movement preserves decorations and moves only the marker within the window', () => {
  const c = setup();
  c.sync(10, 30);
  const endMarkup = c.nodes.precisionEndRuler.innerHTML;
  const startMarker = c.nodes.precisionStartRuler.marker;
  for (let i = 0; i < 100; i++) c.sync(10 + i / 100, 30);
  c.sync(11, 30);
  assert.deepEqual(c.writes, { Start: 1, End: 1 });
  assert.equal(c.nodes.precisionStartRuler.marker, startMarker);
  assert.equal(c.nodes.precisionEndRuler.innerHTML, endMarkup);
  assert.equal(c.precisionStart.value, '11.00');
  assert.equal(c.nodes.precisionStartLabel.textContent, '11');
  assert.equal(c.precisionStart['aria-valuetext'], '11.00 seconds');
  assert.equal(startMarker.style.left, '60%');
  c.sync(11, 31);
  assert.equal(c.nodes.precisionEndRuler.marker.style.left, '60%');
  c.sync(10, 30);
  assert.equal(startMarker.style.left, '50%');
  assert.deepEqual(c.writes, { Start: 1, End: 1 });
});

test('zoom changes, recentering and returning to an earlier value refresh ruler geometry', () => {
  const c = setup();
  c.sync(10, 30);
  c.precisionWindow.value = 2;
  c.sync(10, 30);
  assert.deepEqual(c.writes, { Start: 2, End: 2 });
  assert.equal(c.precisionStart.min, '8.00');
  assert.equal(c.precisionStart.max, '12.00');
  c.sync(20, 30);
  assert.equal(c.precisionStart.min, '18.00');
  assert.equal(c.precisionStart.max, '22.00');
  assert.doesNotMatch(c.nodes.precisionStartRuler.innerHTML, /mint-cut-scene|mint-cut-silence/);
  c.sync(10, 30);
  assert.match(c.nodes.precisionStartRuler.innerHTML, /mint-cut-scene/);
  assert.match(c.nodes.precisionStartRuler.innerHTML, /mint-cut-silence/);
  assert.deepEqual(c.writes, { Start: 4, End: 2 });
});

test('ruler clips decorations to its window and limits each decoration type', () => {
  const c = setup();
  const ruler = c.nodes.precisionStartRuler;
  const previous = updatePrecisionRuler(ruler, {
    min: 5, max: 15, value: 10,
    scenes: [4, ...Array(120).fill(5), 16],
    silences: [{ start: 0, end: 4 }, { start: 3, end: 7 },
      { start: 14, end: 20 }, { start: 10, end: 10 },
      ...Array(120).fill({ start: 8, end: 9 })],
  });
  assert.equal((ruler.innerHTML.match(/mint-cut-scene/g) || []).length, 100);
  assert.equal((ruler.innerHTML.match(/mint-cut-silence/g) || []).length, 100);
  assert.match(ruler.innerHTML, /left:0%;width:20%/);
  assert.match(ruler.innerHTML, /left:90%;width:10%/);
  assert.match(ruler.innerHTML, /left:50%;width:0.3%/);
  assert.equal(previous.marker.style.left, '50%');
});

test('a replacement ruler receives markup even when its geometry is unchanged', () => {
  const c = setup();
  const options = { min: 0, max: 10, value: 5, scenes: [], silences: [] };
  const previous = updatePrecisionRuler(c.nodes.precisionStartRuler, options);
  const next = updatePrecisionRuler(c.nodes.precisionEndRuler, options, previous);
  assert.notEqual(next, previous);
  assert.deepEqual(c.writes, { Start: 1, End: 1 });
  assert.equal(next.marker.style.left, '50%');
  assert.equal(updatePrecisionRuler(next.ruler, options, next), next);
  assert.deepEqual(c.writes, { Start: 1, End: 1 });
});
