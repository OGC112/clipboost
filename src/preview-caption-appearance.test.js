import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { previewCaptionFontSize, previewCaptionOutlineSize } from './preview-caption-appearance.js';

test('font presets preserve default sizing and scale limits', () => {
  assert.equal(previewCaptionFontSize(), '21.60px');
  for (const [captionSize, expected] of [['small', '13.20px'], ['medium', '21.60px'], ['large', '25.80px'], ['unknown', '21.60px']]) {
    assert.equal(previewCaptionFontSize({ captionSize }, 300), expected);
  }
  assert.equal(previewCaptionFontSize({ captionScale: '1.5' }, 300), '32.40px');
  assert.equal(previewCaptionFontSize({ captionScale: 10 }, 300), '43.20px');
  assert.equal(previewCaptionFontSize({ captionScale: .1 }, 300), '10.00px');
  assert.equal(previewCaptionFontSize({ captionScale: 0 }, 300), '21.60px');
});

test('preview widths preserve fallback, minimum and responsive sizing', () => {
  for (const width of [0, undefined, 'invalid']) {
    assert.equal(previewCaptionFontSize({}, width), '21.60px');
    assert.equal(previewCaptionOutlineSize({}, width), 300 * .0065);
  }
  assert.equal(previewCaptionFontSize({}, -20), '10.00px');
  assert.equal(previewCaptionOutlineSize({}, 80), 1);
  assert.equal(previewCaptionFontSize({}, '600'), '43.20px');
});

test('each outline style retains its ratio and one pixel minimum', () => {
  const ratios = { minimal: .0032, clean: .0052, neon: .0060, box: .0025, impact: .0074, pop: .0068, karaoke: .0064, bold: .0065, unknown: .0065 };
  for (const [captionStyle, ratio] of Object.entries(ratios)) {
    assert.equal(previewCaptionOutlineSize({ captionStyle }, 600), 600 * ratio);
    assert.equal(previewCaptionOutlineSize({ captionStyle }, 120), 1);
  }
});

test('editor adapters read current preferences without mutating them', () => {
  const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
  const adapters = source.slice(source.indexOf('  function liveCaptionFontSize('), source.indexOf('  function previewCaptionRowsForCandidate('));
  const state = { captionSize: 'small', captionScale: 1, captionStyle: 'minimal' };
  const context = vm.createContext({ state, previewCaptionFontSize, previewCaptionOutlineSize });
  vm.runInContext(adapters, context);
  assert.equal(context.liveCaptionFontSize(600), '26.40px');
  state.captionSize = 'large'; state.captionStyle = 'impact';
  const before = { ...state };
  assert.equal(context.liveCaptionFontSize(600), '51.60px');
  assert.equal(context.liveCaptionOutlineSize(600), 600 * .0074);
  assert.deepEqual(state, before);
});
