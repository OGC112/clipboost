import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const binding = source.slice(source.indexOf("    const analyticsSearch=document"), source.indexOf("    const analyticsExport=document"));

for (const [description, value, start, end, direction] of [
  ['insertion in the middle', 'new title', 4, 4, 'none'],
  ['deletion in the middle', 'new ttle', 5, 5, 'none'],
  ['backward selection', 'new title', 0, 3, 'backward'],
  ['clearing the query', '', 0, 0, 'none'],
]) {
  test(`Results search preserves focus and edit position after ${description}`, () => {
    const original = {};
    const state = {};
    let current = original;
    let renders = 0;
    let focused = false;
    let selection;
    const replacement = {
      focus() { focused = true; },
      setSelectionRange(...args) { selection = args; },
    };
    vm.runInNewContext(binding, {
      state,
      document: { getElementById: () => current },
      render() { renders++; current = replacement; },
    });
    original.oninput({ target: { value, selectionStart: start, selectionEnd: end, selectionDirection: direction } });
    assert.equal(state.analyticsSearch, value);
    assert.equal(renders, 1, 'results still update on each edit');
    assert.equal(focused, true, 'replacement input receives focus synchronously');
    assert.deepEqual(selection, [start, end, direction]);
  });
}

test('binding is safe on pages without the Results search', () => {
  vm.runInNewContext(binding, { document: { getElementById: () => null } });
});
