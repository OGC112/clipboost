import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createEditorKeyboardHandler } from './editor-keyboard-shortcuts.js';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const binding = source.split('\n').find(line => line.includes('if(!window.__clipboostKeyboardShortcutsBound)'));

function setup(overrides = {}) {
  const calls = [];
  const state = { page: 'studio', selectedCandidate: 0, video: { candidates: [{}, {}] }, ...overrides };
  const handler = createEditorKeyboardHandler({
    state,
    selectCandidatePreview: (index, options) => {
      assert.deepEqual(options, { autoplay: false });
      calls.push(['select', index]);
    },
    exportCurrent: () => calls.push(['export']),
    exportAll: () => calls.push(['exportAll']),
    render: () => calls.push(['render']),
  });
  const press = (key, extra = {}) => {
    const event = { key, target: { tagName: 'DIV' }, preventDefault() { this.defaultPrevented = true; }, ...extra };
    handler(event);
    return event;
  };
  return { calls, state, press };
}

test('unmodified editor arrows and export shortcuts retain their behavior', () => {
  const { calls, press } = setup();
  assert.equal(press('ArrowRight').defaultPrevented, true);
  press('ArrowLeft');
  press('e', { ctrlKey: true });
  press('e', { ctrlKey: true, shiftKey: true });
  assert.deepEqual(calls, [['select', 1], ['select', 1], ['export'], ['exportAll']]);
});

test('arrows preserve native media controls, editing controls and modified navigation', () => {
  const { calls, press } = setup();
  for (const tagName of ['INPUT', 'SELECT', 'TEXTAREA']) press('ArrowRight', { target: { tagName } });
  for (const tagName of ['VIDEO', 'AUDIO']) {
    const event = press('ArrowRight', { target: { tagName, closest: () => ({}) } });
    assert.equal(event.defaultPrevented, undefined);
  }
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']) press('ArrowRight', { [modifier]: true });
  press('ArrowRight', { defaultPrevented: true });
  assert.deepEqual(calls, []);
});

test('open overlays block editor navigation and export shortcuts', () => {
  for (const overlay of ['uiModal', 'campaignAssetBrowser', 'campaignDetailsOpen', 'addCreatorOpen', 'previewVideo', 'livePlayer']) {
    const { calls, press } = setup({ [overlay]: {} });
    press('ArrowRight');
    press('e', { ctrlKey: true });
    assert.deepEqual(calls, [], overlay);
  }
});

test('Escape closes campaign overlays but cannot dismiss an underlying overlay through a notice', () => {
  const { calls, state, press } = setup({ campaignAssetBrowser: {}, campaignAssetBusy: true });
  press('Escape');
  assert.equal(state.campaignAssetBrowser, null);
  assert.equal(state.campaignAssetBusy, false);
  assert.deepEqual(calls, [['render']]);
  const blocked = setup({ uiModal: {}, campaignDetailsOpen: true });
  blocked.press('Escape');
  assert.equal(blocked.state.campaignDetailsOpen, true);
  assert.deepEqual(blocked.calls, []);
});

test('one handler follows live selection, candidate list and page changes', () => {
  const { calls, state, press } = setup();
  state.selectedCandidate = 1;
  press('ArrowRight');
  state.selectedCandidate = 0;
  press('ArrowLeft');
  state.video = { candidates: [{}, {}, {}] };
  press('ArrowLeft');
  state.selectedCandidate = 10;
  press('ArrowRight');
  state.video = null;
  assert.equal(press('ArrowRight').defaultPrevented, undefined);
  state.page = 'library';
  assert.equal(press('E', { metaKey: true }).defaultPrevented, undefined);
  state.page = 'studio';
  press('E', { metaKey: true });
  assert.deepEqual(calls, [['select', 0], ['select', 1], ['select', 2], ['select', 0], ['export']]);
});

test('editable content and sliders retain their keys; Escape dismisses details before the input guard', () => {
  const { calls, state, press } = setup();
  press('e', { ctrlKey: true, target: { isContentEditable: true } });
  press('ArrowRight', { target: { closest: selector => {
    assert.equal(selector, 'video,audio,[role="slider"]');
    return {};
  } } });
  assert.deepEqual(calls, []);
  state.campaignDetailsOpen = true;
  press('Escape', { target: { tagName: 'INPUT' } });
  assert.equal(state.campaignDetailsOpen, false);
  assert.deepEqual(calls, [['render']]);
});

test('app binds the extracted handler once with its editor actions', () => {
  const registrations = [];
  const state = { page: 'studio' };
  const actions = { state, render() {}, selectCandidatePreview() {}, exportCurrent() {}, exportAll() {} };
  const context = vm.createContext({
    ...actions,
    window: { addEventListener: (name, handler) => registrations.push({ name, handler }) },
    createEditorKeyboardHandler: passed => {
      for (const key of Object.keys(actions)) assert.equal(passed[key], actions[key]);
      return createEditorKeyboardHandler(passed);
    },
  });
  vm.runInContext(binding, context);
  vm.runInContext(binding, context);
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].name, 'keydown');
  assert.equal(typeof registrations[0].handler, 'function');
});
