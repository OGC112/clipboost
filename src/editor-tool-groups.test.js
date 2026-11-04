import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const tags = [...source.matchAll(/<details class="mint-tool-group"[^>]*>/g)].map(match => match[0]);
const bindStart = source.indexOf("    document.querySelectorAll('[data-editor-tool-group]')");
const binding = source.slice(bindStart, source.indexOf('\n    bindModalKeyboard', bindStart));

function setup() {
  const editorToolGroupOpen = new Map();
  let groups = [];
  const context = vm.createContext({ editorToolGroupOpen, document: {
    querySelectorAll: selector => {
      assert.equal(selector, '[data-editor-tool-group]');
      return groups;
    },
  } });
  const render = () => {
    groups = tags.map(tag => {
      const markup = vm.runInContext('`' + tag + '`', context);
      return { dataset: { editorToolGroup: markup.match(/data-editor-tool-group="([^"]+)"/)[1] },
        open: /\sopen[\s>]/.test(markup) };
    });
    vm.runInContext(binding, context);
    return groups;
  };
  return { render };
}

test('editor tool sections retain their initial defaults', () => {
  assert.equal(tags.length, 3);
  assert.deepEqual(setup().render().map(group => [group.dataset.editorToolGroup, group.open]),
    [['director', false], ['captions', true], ['branding', false]]);
});

test('preview and settings rebuilds preserve independently opened and closed sections', () => {
  const ui = setup();
  const groups = ui.render();
  for (const group of groups) {
    group.open = !group.open;
    group.ontoggle();
  }
  for (let rebuild = 0; rebuild < 3; rebuild++) {
    const next = ui.render();
    assert.deepEqual(next.map(group => group.open), [true, false, true]);
    // Native details may emit toggle when constructed with the open attribute.
    next.forEach(group => group.ontoggle());
  }
  const branding = ui.render()[2];
  branding.open = false;
  branding.ontoggle();
  assert.deepEqual(ui.render().map(group => group.open), [true, false, false]);
});
