import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { bindModalKeyboard } from './modal-keyboard.js';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const binding = source.slice(source.indexOf('    const closeCampaignAssetBrowserNow='), source.indexOf('    const assetClose='));

function setup(uiModal = null) {
  const state = { campaignAssetBrowser: { items: [] }, campaignAssetBusy: true, uiModal };
  const doc = { activeElement: null };
  const control = () => ({ focus() { doc.activeElement = this; } });
  const packLink = control(), close = control(), video = control(), edit = control(), mediaLink = control();
  const items = [packLink, close, video, edit, mediaLink];
  let selector, renders = 0;
  const dialog = { ownerDocument: doc, querySelectorAll(value) { selector = value; return items; } };
  doc.querySelector = () => dialog;
  doc.getElementById = () => close;
  vm.runInNewContext(binding, { state, document: doc, bindModalKeyboard, render() { renders++; } });
  const press = (key, shiftKey = false) => {
    const event = { key, shiftKey, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
    dialog.onkeydown(event);
    return event;
  };
  return { state, doc, dialog, items, close, press, selector: () => selector, renders: () => renders };
}

test('asset browser focuses Close and includes pack links and video controls in its Tab cycle', () => {
  const ui = setup();
  assert.equal(ui.doc.activeElement, ui.close);
  ui.doc.activeElement = ui.items.at(-1);
  assert.equal(ui.press('Tab').prevented, true);
  assert.equal(ui.selector(), 'button:not([disabled]), a[href], video[controls]');
  assert.equal(ui.doc.activeElement, ui.items[0]);
  assert.equal(ui.press('Tab', true).prevented, true);
  assert.equal(ui.doc.activeElement, ui.items.at(-1));
  ui.doc.activeElement = ui.items[2];
  assert.equal(ui.press('Tab').prevented, undefined);
});

test('Escape dismisses the asset browser through its existing close action', () => {
  const ui = setup();
  const event = ui.press('Escape');
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  assert.equal(ui.state.campaignAssetBrowser, null);
  assert.equal(ui.state.campaignAssetBusy, false);
  assert.equal(ui.renders(), 1);
});

test('a foreground notice or progress dialog retains focus above the asset browser', () => {
  const ui = setup({ mode: 'progress' });
  assert.equal(ui.doc.activeElement, null);
  assert.equal(ui.dialog.onkeydown, undefined);
});
