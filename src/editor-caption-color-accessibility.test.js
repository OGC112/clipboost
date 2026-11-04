import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const start = source.indexOf('    const applyLiveCaptionStyle=()=>{');
const applyStyle = source.slice(start, source.indexOf('    const refreshLiveCaptionPreview=', start));

test('initial palette exposes exactly one selected color, including the Auto fallback', () => {
  const palette = source.match(/\$\{(\[\['auto','Auto'\][^\n]+?)\}<\/div><\/div><div class="mint-live-caption-controls/)[1];
  for (const captionColor of [undefined, 'auto', 'white', 'yellow', 'lime', 'cyan', 'pink', 'red']) {
    const markup = vm.runInNewContext(palette, { state: { captionColor } });
    const buttons = [...markup.matchAll(/<button[^>]+>/g)].map(match => match[0]);
    assert.equal(buttons.length, 7);
    const selected = buttons.filter(button => button.includes('aria-pressed="true"'));
    assert.equal(selected.length, 1);
    assert.ok(selected[0].includes(`data-caption-color="${captionColor || 'auto'}"`));
  }
});

test('palette selection updates without a live preview and clears the previous selection', () => {
  const buttons = ['auto', 'yellow', 'white'].map(captionColor => ({
    dataset: { captionColor },
    classList: { toggle(name, selected) { this[name] = selected; } },
    setAttribute(name, value) { this[name] = value; },
  }));
  const state = {};
  const context = vm.createContext({ state, document: {
    querySelectorAll: () => buttons,
    getElementById: () => null,
  } });
  vm.runInContext(applyStyle, context);
  for (const color of [undefined, 'yellow', 'white', 'auto']) {
    state.captionColor = color;
    vm.runInContext('applyLiveCaptionStyle()', context);
    for (const button of buttons) {
      const selected = button.dataset.captionColor === (color || 'auto');
      assert.equal(button.classList.active, selected);
      assert.equal(button['aria-pressed'], String(selected));
    }
  }
});
