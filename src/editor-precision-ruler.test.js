import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const start = source.indexOf('    const precisionCenters=');
const rulerSource = source.slice(start, source.indexOf('    if(precisionWindow)', start));

function setup() {
  const nodes = {}, writes = { Start: 0, End: 0 };
  for (const name of ['Start', 'End']) {
    nodes[`precision${name}Ruler`] = {
      get innerHTML() { return this.markup; },
      set innerHTML(value) { writes[name]++; this.markup = value; },
    };
    for (const suffix of ['Label', 'Min', 'Max']) nodes[`precision${name}${suffix}`] = {};
  }
  const input = () => ({ setAttribute(name, value) { this[name] = value; } });
  const precisionStart = input(), precisionEnd = input(), precisionWindow = { value: 5 };
  const context = vm.createContext({
    state: { video: { details: { duration: 60 } } },
    manualTrimStart: { value: 10 }, manualTrimEnd: { value: 30 },
    precisionStart, precisionEnd, precisionWindow,
    precisionScenes: [8, 12, 28, 32],
    precisionSilences: [{ start: 7, end: 9 }, { start: 31, end: 33 }],
    document: { getElementById: id => nodes[id] }, formatTime: value => String(value),
  });
  vm.runInContext(rulerSource + '\nthis.sync = syncPrecisionZoom;', context);
  return { nodes, writes, precisionStart, precisionEnd, precisionWindow, sync: context.sync };
}

test('trim movement rebuilds only the changed boundary and keeps labels current', () => {
  const c = setup();
  c.sync(10, 30);
  const endMarkup = c.nodes.precisionEndRuler.innerHTML;
  for (let i = 0; i < 100; i++) c.sync(11, 30);
  assert.deepEqual(c.writes, { Start: 2, End: 1 });
  assert.equal(c.nodes.precisionEndRuler.innerHTML, endMarkup);
  assert.equal(c.precisionStart.value, '11.00');
  assert.equal(c.nodes.precisionStartLabel.textContent, '11');
  assert.equal(c.precisionStart['aria-valuetext'], '11.00 seconds');
  assert.match(c.nodes.precisionStartRuler.innerHTML, /mint-cut-marker.*left:60%/);
  c.sync(11, 31);
  assert.deepEqual(c.writes, { Start: 2, End: 2 });
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
