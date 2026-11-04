import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const extract = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const slider = value => ({ value, attributes: {}, setAttribute(name, text) { this.attributes[name] = text; } });

test('trim controls identify the boundary and direction independently of visual layout', () => {
  for (const boundary of ['start', 'end']) {
    const name = boundary === 'start' ? 'Start' : 'End';
    assert.match(source, new RegExp(`id="manualTrim${name}" type="range" aria-label="Clip ${boundary}" aria-valuetext=`));
    for (const delta of [-0.25, 0.25, -0.05, 0.05]) {
      const markup = source.match(new RegExp(`<button[^>]*data-trim-boundary="${boundary}" data-trim-delta="${delta}"[^>]*>`))?.[0];
      assert.ok(markup?.includes(`aria-label="Move clip ${boundary} ${delta < 0 ? 'earlier' : 'later'} by ${Math.abs(delta)} seconds"`));
    }
  }
});

test('manual trim announces the clamped values with hundredth-second precision', () => {
  const manualTrimStart = slider('12.34'), manualTrimEnd = slider('80');
  const context = {
    manualTrimStart, manualTrimEnd,
    state: { video: { details: { duration: 100 } } },
    document: { activeElement: manualTrimEnd, getElementById: () => null, querySelector: () => null },
    formatTime: String, syncPrecisionZoom: () => {},
  };
  vm.runInNewContext(extract('    const updateManualTrimLabels=()=>{', '    const precisionWindow=') + '\nupdateManualTrimLabels();', context);
  assert.equal(manualTrimStart.attributes['aria-valuetext'], '12.34 seconds');
  assert.equal(manualTrimEnd.attributes['aria-valuetext'], '72.34 seconds');
  assert.equal(manualTrimEnd.value, '72.34');
});

test('zoomed trim announces precise values on initialization and subsequent updates', () => {
  const precisionStart = slider(''), precisionEnd = slider('');
  const context = {
    precisionStart, precisionEnd, precisionWindow: { value: 5 },
    precisionCenters: { Start: 12, End: 24 },
    state: { video: { details: { duration: 100 } } },
    document: { getElementById: () => null }, formatTime: String,
  };
  vm.runInNewContext(extract('    const syncPrecisionZoom=(start,end)=>{', '    if(precisionWindow)') + '\nsyncPrecisionZoom(12.34,24.56);', context);
  assert.equal(precisionStart.attributes['aria-valuetext'], '12.34 seconds');
  assert.equal(precisionEnd.attributes['aria-valuetext'], '24.56 seconds');
  vm.runInNewContext('syncPrecisionZoom(13.45,25.67);', context);
  assert.equal(precisionStart.attributes['aria-valuetext'], '13.45 seconds');
  assert.equal(precisionEnd.attributes['aria-valuetext'], '25.67 seconds');
});
