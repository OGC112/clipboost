import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const renderSource = source.slice(source.indexOf('  function render(){'), source.indexOf('  function bind(){'));

function setup({ timeline = false, focused = true, dialog = false, removed = false } = {}) {
  const queries = [], focusCalls = [];
  const oldButton = { dataset: { candidate: '2' }, classList: { contains: name => timeline && name === 'timeline-clip' } };
  const context = vm.createContext({
    state: { page: 'studio' }, disposePreviewCaptionClock: null,
    document: {
      activeElement: { closest: () => focused ? oldButton : null },
      getElementById: () => ({ innerHTML: '' }),
      querySelector: selector => {
        queries.push(selector);
        if (selector === '[role="dialog"]') return dialog ? {} : null;
        return removed ? null : { focus: options => focusCalls.push(options) };
      },
    },
    ...Object.fromEntries(['home', 'campaignDiscover', 'studio', 'campaigns', 'campaignEditor', 'analytics', 'library', 'projects', 'publish', 'settings', 'side', 'top', 'campaignAssetBrowserMarkup', 'modalMarkup', 'bind'].map(name => [name, () => ''])),
  });
  vm.runInContext(renderSource, context);
  return { render: () => context.render(), queries, focusCalls };
}

for (const timeline of [false, true]) {
  test(`preserves ${timeline ? 'timeline' : 'clip list'} button focus through repeated preview renders`, () => {
    const ui = setup({ timeline });
    ui.render();
    ui.render();
    assert.equal(ui.focusCalls.length, 2);
    assert.equal(ui.focusCalls[0].preventScroll, true);
    assert.equal(ui.queries[1], `.${timeline ? 'timeline-clip' : 'candidate-btn'}[data-candidate="2"]`);
  });
}

test('does not take focus from dialogs or unrelated controls', () => {
  for (const options of [{ dialog: true }, { focused: false }, { removed: true }]) {
    const ui = setup(options);
    ui.render();
    assert.equal(ui.focusCalls.length, 0);
  }
});

test('both clip selection surfaces expose their pressed state', () => {
  const lines = source.split('\n').filter(line => line.includes('data-candidate="${i}"'));
  assert.equal(lines.length, 2);
  for (const line of lines) assert.ok(line.includes('aria-pressed="${i===selected}"'));
});
