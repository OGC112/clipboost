import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildRenderOptions } from './editor-render-options.js';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');

function setup(overrides = {}) {
  const state = { hookTitleEnabled: true, hookTitleX: .5, hookTitleY: .12, ...overrides };
  const handlers = {};
  let saves = 0, previews = 0;
  const start = source.indexOf('    if(liveHookTitle){');
  vm.runInNewContext(source.slice(start, source.indexOf('    const captionSizeSelect=', start)), {
    state,
    liveHookTitle: { closest: () => ({}), addEventListener: (name, handler) => { handlers[name] = handler; } },
    persistEditorPrefs: () => { saves++; },
    updateHookTitlePreview: () => { previews++; },
  });
  return {
    state, saves: () => saves, previews: () => previews,
    press(key, extra = {}) {
      const event = { key, preventDefault() { this.defaultPrevented = true; }, ...extra };
      handlers.keydown(event);
      return event;
    },
  };
}

test('hook title is focusable and explains its keyboard controls', () => {
  const markup = source.match(/<div id="liveHookTitle"[^>]+>/)[0];
  assert.match(markup, /tabindex="0"/);
  assert.match(markup, /aria-label="Hook title position. Use arrow keys to move."/);
});

test('arrow keys move the hook, save preferences and update preview/export coordinates', () => {
  const editor = setup();
  assert.equal(editor.press('ArrowRight').defaultPrevented, true);
  assert.equal(editor.state.hookTitleX, .525);
  editor.press('ArrowDown');
  assert.equal(editor.state.hookTitleY, .145);
  const options = buildRenderOptions(editor.state, .82);
  assert.equal(options.hookTitleX, .525);
  assert.equal(options.hookTitleY, .145);
  editor.press('ArrowLeft');
  editor.press('ArrowUp');
  assert.equal(editor.state.hookTitleX, .5);
  assert.equal(editor.state.hookTitleY, .12);
  assert.equal(editor.saves(), 4);
  assert.equal(editor.previews(), 4);
});

test('hook movement respects the same bounds as pointer dragging', () => {
  const editor = setup({ hookTitleX: .08, hookTitleY: .92 });
  editor.press('ArrowLeft');
  editor.press('ArrowDown');
  assert.equal(editor.state.hookTitleX, .08);
  assert.equal(editor.state.hookTitleY, .92);
  editor.state.hookTitleX = .92;
  editor.state.hookTitleY = .08;
  editor.press('ArrowRight');
  editor.press('ArrowUp');
  assert.equal(editor.state.hookTitleX, .92);
  assert.equal(editor.state.hookTitleY, .08);
});

test('Tab, modified arrows and disabled hooks do not change position', () => {
  const editor = setup();
  assert.equal(editor.press('Tab').defaultPrevented, undefined);
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']) {
    assert.equal(editor.press('ArrowRight', { [modifier]: true }).defaultPrevented, undefined);
  }
  editor.state.hookTitleEnabled = false;
  assert.equal(editor.press('ArrowDown').defaultPrevented, undefined);
  assert.equal(editor.saves(), 0);
  assert.equal(editor.previews(), 0);
});
