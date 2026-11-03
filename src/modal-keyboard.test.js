import test from 'node:test';
import assert from 'node:assert/strict';
import { bindModalKeyboard } from './modal-keyboard.js';

function setup(mode = 'confirm') {
  const doc = { activeElement: null };
  const control = () => ({ focus() { doc.activeElement = this; } });
  const items = mode === 'progress' ? [] : mode === 'notice' ? [control()] : [control(), control()];
  const dialog = { ...control(), ownerDocument: doc, querySelectorAll: () => items };
  let dismissed = 0;
  bindModalKeyboard(dialog, { mode, onDismiss: () => dismissed++ });
  const press = (key, shiftKey = false) => {
    const event = { key, shiftKey, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
    dialog.onkeydown(event);
    return event;
  };
  return { doc, items, dialog, press, dismissed: () => dismissed };
}

test('confirmation initially focuses Cancel and wraps Tab in both directions', () => {
  const { doc, items, press } = setup();
  assert.equal(doc.activeElement, items[0]);
  assert.equal(press('Tab').prevented, undefined);
  assert.equal(press('Tab', true).prevented, true);
  assert.equal(doc.activeElement, items[1]);
  assert.equal(press('Tab').prevented, true);
  assert.equal(doc.activeElement, items[0]);
});

test('notice keeps its single action focused and Escape dismisses once', () => {
  const ui = setup('notice');
  assert.equal(ui.press('Tab').prevented, true);
  assert.equal(ui.doc.activeElement, ui.items[0]);
  const event = ui.press('Escape');
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  assert.equal(ui.dismissed(), 1);
});

test('Escape cancels confirmation; progress remains focused and cannot be dismissed', () => {
  const confirm = setup();
  confirm.press('Escape');
  assert.equal(confirm.dismissed(), 1);
  const progress = setup('progress');
  assert.equal(progress.doc.activeElement, progress.dialog);
  assert.equal(progress.press('Tab').prevented, true);
  progress.press('Escape');
  assert.equal(progress.dismissed(), 0);
});

test('binding tolerates absent dialogs and recovers Tab focus from outside', () => {
  bindModalKeyboard(null, {});
  const ui = setup();
  ui.doc.activeElement = {};
  assert.equal(ui.press('Tab').prevented, true);
  assert.equal(ui.doc.activeElement, ui.items[0]);
});
