import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { bindModalKeyboard } from './modal-keyboard.js';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const binding = source.slice(source.indexOf('    const closeCampaignDetails='), source.indexOf("    const m=document.getElementById('menu')"));

function setup(overrides = {}, hasTrigger = true) {
  const state = { campaignSelected: 42, campaignDetailsOpen: true, ...overrides };
  const doc = { activeElement: null };
  const control = (dataset = {}) => ({ dataset, focus() { doc.activeElement = this; } });
  const close = control(), link = control(), input = control();
  const trigger = control({ campaignDiscoverSelect: '42' });
  const other = control({ campaignDiscoverSelect: 'other' });
  let renders = 0, selector;
  const dialog = { ownerDocument: doc, querySelectorAll(value) { selector = value; return [close, link, input]; } };
  const backdrop = {};
  doc.querySelector = () => dialog;
  doc.querySelectorAll = () => hasTrigger ? [other, trigger] : [];
  doc.getElementById = id => id === 'closeCampaignDetails' ? close : backdrop;
  vm.runInNewContext(binding, { state, document: doc, bindModalKeyboard, render() { renders++; } });
  const press = (key, shiftKey = false) => {
    const event = { key, shiftKey, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
    dialog.onkeydown(event);
    return event;
  };
  return { state, doc, close, link, input, trigger, dialog, backdrop, press, renders: () => renders, selector: () => selector };
}

test('campaign details focuses Close and contains Tab across links and editable controls', () => {
  const ui = setup();
  assert.equal(ui.doc.activeElement, ui.close);
  assert.equal(ui.press('Tab', true).prevented, true);
  assert.equal(ui.doc.activeElement, ui.input);
  assert.equal(ui.press('Tab').prevented, true);
  assert.equal(ui.doc.activeElement, ui.close);
  ui.doc.activeElement = ui.link;
  assert.equal(ui.press('Tab').prevented, undefined);
  assert.equal(ui.selector(), 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])');
});

test('Escape dismisses once and restores focus to the selected campaign', () => {
  const ui = setup();
  const event = ui.press('Escape');
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  assert.equal(ui.state.campaignDetailsOpen, false);
  assert.equal(ui.renders(), 1);
  assert.equal(ui.doc.activeElement, ui.trigger);
});

test('Close and backdrop share dismissal; removed campaign triggers are tolerated', () => {
  const ui = setup();
  ui.close.onclick();
  assert.equal(ui.doc.activeElement, ui.trigger);
  const missing = setup({}, false);
  missing.backdrop.onclick({ target: {} });
  assert.equal(missing.renders(), 0);
  missing.backdrop.onclick({ target: missing.backdrop });
  assert.equal(missing.state.campaignDetailsOpen, false);
  assert.equal(missing.renders(), 1);
});

for (const overrides of [{ uiModal: { mode: 'notice' } }, { campaignAssetBrowser: {} }, { campaignFormOpen: 'edit' }]) {
  test(`campaign details yields focus to foreground ${Object.keys(overrides)[0]}`, () => {
    const ui = setup(overrides);
    assert.equal(ui.doc.activeElement, null);
    assert.equal(ui.dialog.onkeydown, undefined);
  });
}
