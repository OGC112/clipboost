import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildEditorPreferences } from './editor-preferences.js';
import { buildRenderOptions } from './editor-render-options.js';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('  function hasCustomCaptionY('), source.indexOf('  function liveCaptionClass('));

function setup(captionPosition, captionY) {
  const state = { captionPosition, captionY };
  const context = vm.createContext({ state });
  vm.runInContext(helpers, context);
  return { state, context };
}

for (const [position, expected] of [['top', .18], ['center', .5], ['bottom', .82]]) {
  test(`${position} preset survives saving and restoring without a custom position`, () => {
    const { state, context } = setup(position, null);
    const persist = source.slice(source.indexOf('  function persistEditorPrefs('), source.indexOf('\n', source.indexOf('  function persistEditorPrefs(')));
    let saved;
    context.buildEditorPreferences = buildEditorPreferences;
    context.localStorage = { setItem: (key, value) => { saved = JSON.parse(value); } };
    vm.runInContext(persist, context);
    context.persistEditorPrefs();
    assert.equal(saved.captionY, null);
    // Execute the actual preference initialization expression on the saved value.
    context.editorPrefs = saved;
    state.captionY = vm.runInContext(source.match(/captionY:(hasCustomCaptionY\(editorPrefs.captionY\)\?Number\(editorPrefs.captionY\):null)/)[1], context);
    assert.equal(context.hasCustomCaptionY(state.captionY), false);
    assert.equal(context.currentCaptionY(), expected);
    assert.equal(buildRenderOptions(state, context.currentCaptionY()).captionY, expected);
    const select = source.match(/<select id="captionPositionSelect">([\s\S]*?)<\/select>/)[1];
    const markup = vm.runInContext('`' + select + '`', context);
    assert.match(markup, new RegExp(`value="${position}" selected`));
    assert.doesNotMatch(markup, /value="custom"/);
  });
}

test('dragged caption positions override presets and remain clamped', () => {
  const { state, context } = setup('bottom', .37);
  for (const [value, expected] of [[.37, .37], ['0.63', .63], [0, .12], [1, .88]]) {
    state.captionY = value;
    assert.equal(context.hasCustomCaptionY(state.captionY), true);
    assert.equal(context.currentCaptionY(), expected);
  }
});

test('missing or invalid custom positions fall back to the selected preset', () => {
  const { state, context } = setup('bottom', null);
  for (const value of [null, undefined, '', ' ', 'invalid', NaN, Infinity]) {
    state.captionY = value;
    assert.equal(context.hasCustomCaptionY(state.captionY), false);
    assert.equal(context.currentCaptionY(), .82);
  }
});

function bindCaptionPosition(position = 'bottom', y = null) {
  const { state, context } = setup(position, y);
  const handlers = {};
  const select = { options: [{ value: position }], value: position, add(option) { this.options.push(option); } };
  let saves = 0, styles = 0;
  Object.assign(context, {
    liveCaption: {
      closest: () => ({ getBoundingClientRect: () => ({ top: 0, height: 100 }) }),
      addEventListener: (name, handler) => { handlers[name] = handler; },
      setPointerCapture() {}, classList: { add() {}, remove() {} }, style: {},
    },
    document: { getElementById: () => select },
    Option: function(text, value) { this.text = text; this.value = value; },
    persistEditorPrefs: () => { saves++; },
    applyLiveCaptionStyle: () => { styles++; },
  });
  const start = source.indexOf('    if(liveCaption){');
  vm.runInContext(source.slice(start, source.indexOf('    const watermarkFile=', start)), context);
  const press = key => {
    const event = { key, preventDefault() { this.defaultPrevented = true; } };
    handlers.keydown(event);
    return event;
  };
  return { state, select, handlers, press, liveCaption: context.liveCaption, saves: () => saves, styles: () => styles };
}

test('keyboard caption movement keeps Custom selection, saved state and preview in sync', () => {
  const editor = bindCaptionPosition();
  assert.equal(editor.press('ArrowUp').defaultPrevented, true);
  assert.equal(editor.state.captionY, .795);
  assert.equal(editor.state.captionPosition, 'custom');
  assert.equal(editor.select.value, 'custom');
  editor.press('ArrowDown');
  assert.equal(editor.state.captionY, .82);
  assert.equal(editor.select.options.filter(o => o.value === 'custom').length, 1);
  assert.equal(editor.saves(), 2);
  assert.equal(editor.styles(), 2);
  assert.equal(editor.press('Tab').defaultPrevented, undefined);
  assert.equal(editor.saves(), 2);
});

test('keyboard caption movement preserves both position limits', () => {
  for (const [y, key] of [[.12, 'ArrowUp'], [.88, 'ArrowDown']]) {
    const editor = bindCaptionPosition('custom', y);
    editor.press(key);
    assert.equal(editor.state.captionY, y);
    assert.equal(editor.select.value, 'custom');
    assert.equal(editor.select.options.length, 1);
  }
});

test('pointer caption movement still saves and selects the custom position', () => {
  const editor = bindCaptionPosition();
  editor.handlers.pointerdown({ preventDefault() {}, stopPropagation() {}, pointerId: 1 });
  editor.handlers.pointerup({ type: 'pointerup', pointerId: 1, clientY: 37 });
  assert.equal(editor.state.captionY, .37);
  assert.equal(editor.state.captionPosition, 'custom');
  assert.equal(editor.select.value, 'custom');
  assert.equal(editor.saves(), 1);
});

for (const type of ['pointercancel', 'lostpointercapture']) {
  test(`${type} saves the last visible caption position and ends the drag once`, () => {
    const editor = bindCaptionPosition();
    const classes = new Set();
    editor.liveCaption.classList = { add: name => classes.add(name), remove: name => classes.delete(name) };
    editor.handlers.pointerdown({ pointerId: 1, preventDefault() {}, stopPropagation() {} });
    editor.handlers.pointermove({ pointerId: 1, clientY: 37 });
    editor.handlers[type]({ type, pointerId: 1, clientY: 0 });
    assert.equal(editor.state.captionY, .37);
    assert.equal(editor.select.value, 'custom');
    assert.equal(classes.has('dragging'), false);
    editor.handlers.pointermove({ pointerId: 1, clientY: 65 });
    editor.handlers.lostpointercapture({ type: 'lostpointercapture', pointerId: 1 });
    assert.equal(editor.liveCaption.style.top, '37%');
    assert.equal(editor.saves(), 1);
    assert.equal(buildRenderOptions(editor.state, editor.state.captionY).captionY, .37);
    editor.handlers.pointerdown({ pointerId: 2, preventDefault() {}, stopPropagation() {} });
    editor.handlers.pointerup({ type: 'pointerup', pointerId: 2, clientY: 65 });
    assert.equal(editor.state.captionY, .65);
    assert.equal(editor.saves(), 2);
  });
}

test('another pointer cannot move, replace or finish an active caption drag', () => {
  const editor = bindCaptionPosition();
  editor.handlers.pointerdown({ pointerId: 1, preventDefault() {}, stopPropagation() {} });
  editor.handlers.pointerdown({ pointerId: 2 });
  editor.handlers.pointermove({ pointerId: 2, clientY: 12 });
  editor.handlers.pointerup({ type: 'pointerup', pointerId: 2, clientY: 12 });
  editor.handlers.pointercancel({ type: 'pointercancel', pointerId: 2 });
  assert.equal(editor.saves(), 0);
  assert.equal(editor.liveCaption.style.top, undefined);
  editor.handlers.pointerup({ type: 'pointerup', pointerId: 1, clientY: 44 });
  assert.equal(editor.state.captionY, .44);
  assert.equal(editor.saves(), 1);
});
