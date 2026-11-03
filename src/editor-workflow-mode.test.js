import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const binding = source.split('\n').find(line => line.includes("document.querySelectorAll('[data-studio-mode]')"));

for (const mode of ['shorts', 'long']) {
  test(`${mode} announces selection and receives focus after switching`, () => {
    const template = source.match(/const workflowSwitcher=generalStudio\?`([\s\S]*?)`:'';/)[1];
    const markup = vm.runInNewContext('`' + template + '`', { studioMode: mode });
    for (const value of ['shorts', 'long']) {
      assert.ok(markup.includes(`data-studio-mode="${value}" aria-pressed="${mode === value}"`));
    }
    const calls = [];
    const state = { studioMode: mode === 'long' ? 'shorts' : 'long', selectedCandidate: 2,
      video: { candidates: [{}], sourceUrl: '/source.mp4' } };
    const button = { dataset: { studioMode: mode } };
    let rendered = false;
    vm.runInNewContext(binding, {
      state,
      document: {
        querySelectorAll: () => [button],
        querySelector: selector => {
          assert.equal(rendered, true);
          assert.equal(selector, `[data-studio-mode="${mode}"]`);
          return { focus: () => calls.push('focus') };
        },
      },
      invalidateRenderedPreviews: () => calls.push('invalidate'),
      persistEditorPrefs: () => calls.push('save'),
      render: () => { rendered = true; calls.push('render'); },
      setTimeout: callback => callback(),
      prepareCandidatePreview: (index, options) => {
        assert.equal(index, 2);
        assert.equal(options.autoplay, false);
        assert.equal(options.force, true);
        calls.push('preview');
      },
    });
    button.onclick();
    assert.equal(state.studioMode, mode);
    assert.deepEqual(calls, ['invalidate', 'save', 'render', 'focus', 'preview']);
    button.onclick();
    assert.equal(calls.length, 5, 'reselecting the current mode does not rerender or reload');
  });
}
