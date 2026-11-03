import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { bindModalKeyboard } from './modal-keyboard.js';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const binding = source.slice(source.indexOf('    const closePreview=()=>{'), source.indexOf('    const openLivePlayer='));
function setup(uiModal = null, hasTrigger = true) {
  const state = { previewVideo: { id: 'video-1', kind: 'youtube' }, uiModal };
  const doc = { activeElement: null };
  const control = (dataset = {}) => ({ dataset, focus() { doc.activeElement = this; } });
  const close = control(), frame = control(), link = control();
  const wrongPlatform = control({ previewId: 'video-1', previewKind: 'twitch' });
  const trigger = control({ previewId: 'video-1', previewKind: 'youtube' });
  let selector, renders = 0;
  const dialog = { ownerDocument: doc, querySelectorAll(value) { selector = value; return [close, frame, link]; } };
  const backdrop = {};
  doc.querySelector = () => dialog;
  doc.querySelectorAll = () => hasTrigger ? [wrongPlatform, trigger] : [];
  doc.getElementById = id => id === 'closeVideoPreview' ? close : backdrop;
  vm.runInNewContext(binding, { state, document: doc, bindModalKeyboard, render() { renders++; } });
  const press = (key, shiftKey = false) => {
    const event = { key, shiftKey, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
    dialog.onkeydown(event);
    return event;
  };
  return { state, doc, dialog, close, frame, link, trigger, backdrop, press, selector: () => selector, renders: () => renders };
}

test('preview focuses Close and wraps Tab around links and the embedded player', () => {
  const ui = setup();
  assert.equal(ui.doc.activeElement, ui.close);
  ui.press('Tab', true);
  assert.equal(ui.selector(), 'button:not([disabled]), a[href], iframe');
  assert.equal(ui.doc.activeElement, ui.link);
  ui.press('Tab');
  assert.equal(ui.doc.activeElement, ui.close);
  ui.doc.activeElement = ui.frame;
  assert.equal(ui.press('Tab').prevented, undefined);
});

test('Escape closes preview and restores focus to a matching platform trigger', () => {
  const ui = setup();
  const event = ui.press('Escape');
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  assert.equal(ui.state.previewVideo, null);
  assert.equal(ui.renders(), 1);
  assert.equal(ui.doc.activeElement, ui.trigger);
});

test('Close and backdrop reuse dismissal; missing triggers are tolerated', () => {
  const ui = setup(null, false);
  ui.backdrop.onclick({ target: {} });
  assert.equal(ui.renders(), 0);
  ui.backdrop.onclick({ target: ui.backdrop });
  assert.equal(ui.state.previewVideo, null);
  assert.equal(ui.renders(), 1);
  const other = setup();
  other.close.onclick();
  assert.equal(other.doc.activeElement, other.trigger);
});

test('foreground notice retains keyboard focus above preview', () => {
  const ui = setup({ mode: 'notice' });
  assert.equal(ui.doc.activeElement, null);
  assert.equal(ui.dialog.onkeydown, undefined);
});

test('preview dialog and its Close control have accessible names', () => {
  assert.match(source, /class="card video-preview-modal" role="dialog" aria-modal="true" aria-labelledby="videoPreviewTitle"/);
  assert.match(source, /id="closeVideoPreview" type="button" aria-label="Close video preview"/);
  assert.match(source, /<h2 id="videoPreviewTitle">/);
});
