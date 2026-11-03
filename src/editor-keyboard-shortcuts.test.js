import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const binding = source.split('\n').find(line => line.includes('if(!window.__clipboostKeyboardShortcutsBound)'));

function setup(overrides = {}) {
  const calls = [];
  const state = { page: 'studio', selectedCandidate: 0, video: { candidates: [{}, {}] }, ...overrides };
  let handler;
  vm.runInNewContext(binding, {
    state,
    window: { addEventListener: (_, callback) => { handler = callback; } },
    selectCandidatePreview: index => calls.push(['select', index]),
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
