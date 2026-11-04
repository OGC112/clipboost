import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { projectDisplayState } from './project-display-state.js';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const template = source.slice(source.indexOf('  function projects(){'), source.indexOf('  async function removeProject('));
const escapeSource = source.split('\n').find(line => line.includes('function escapeHtml('));

function renderProjects(projects) {
  return vm.runInNewContext(`${escapeSource}\n${template}\nprojects()`, {
    state: { projects }, projectDisplayState,
    mediaThumb: () => '', relativeDate: () => 'today',
  });
}

test('project actions identify their project and retain the existing action targets', () => {
  const html = renderProjects([
    { id: 'first', originalName: 'First clip', status: 'ready' },
    { id: 'second', originalName: 'Second clip', status: 'failed' },
  ]);
  for (const [id, name] of [['first', 'First clip'], ['second', 'Second clip']]) {
    assert.ok(html.includes(`data-open-project="${id}" aria-label="Open ${name}"`));
    assert.ok(html.includes(`data-delete-project="${id}" data-delete-project-name="${name}" aria-label="Delete ${name}"`));
  }
});

test('active project deletion announces that processing will stop', () => {
  for (const status of ['ingesting', 'analyzing']) {
    const html = renderProjects([{ id: 'active', originalName: 'Active clip', status }]);
    assert.ok(html.includes('aria-label="Stop processing and delete Active clip"'));
    assert.ok(html.includes('title="Stop processing and delete project"'));
  }
});

test('action names escape project text and provide an untitled fallback', () => {
  const html = renderProjects([{ id: 'quoted', originalName: 'A "clip" <1> & friends' }, { id: 'untitled' }]);
  for (const action of ['Open', 'Delete']) {
    assert.ok(html.includes(`aria-label="${action} A &quot;clip&quot; &lt;1&gt; &amp; friends"`));
    assert.ok(html.includes(`aria-label="${action} Untitled project"`));
  }
});
