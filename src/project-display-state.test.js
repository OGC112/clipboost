import test from 'node:test';
import assert from 'node:assert/strict';
import { projectDisplayState } from './project-display-state.js';

const statuses = [
  ['ready', 100, 'Ready', 'Ready', true],
  ['degraded', 100, 'Ready with fallback', 'Degraded', true],
  ['failed', 100, 'Failed', 'Failed', false],
  ['uploaded', 100, 'Source ready', 'Ready to analyze', false],
  ['preparing', 92, 'Preparing source', 'In progress', false],
  ['linked', 15, 'Linked', 'Needs source file', false],
  ['ingesting', 45, 'Downloading', 'In progress', false],
  ['analyzing', 65, 'Processing', 'In progress', false],
];

for (const [status, progress, progressLabel, badge, done] of statuses) {
  test(`${status} retains its project row presentation`, () => {
    assert.deepEqual(projectDisplayState({ status }), { progress, progressLabel, badge, done });
  });
}

test('interrupted recovery takes precedence over every project status', () => {
  for (const [status] of statuses) {
    assert.deepEqual(projectDisplayState({ status, processingInterrupted: true }), {
      progress: 36, progressLabel: 'Interrupted', badge: 'Needs attention', done: false,
    });
  }
});

test('linked sources with ingestion errors offer a retry', () => {
  assert.deepEqual(projectDisplayState({ status: 'linked', ingestionError: 'Download interrupted' }), {
    progress: 15, progressLabel: 'Linked', badge: 'Retry source', done: false,
  });
});

test('preparing sources retain numeric conversion and existing fallback rules', () => {
  for (const [value, expected] of [['81', 81], [55, 55], [0, 92], [undefined, 92]]) {
    const project = { status: 'preparing', ingestion: { progress: value } };
    assert.equal(projectDisplayState(project).progress, expected);
    assert.equal(project.ingestion.progress, value);
  }
});

test('missing and unknown statuses need attention', () => {
  for (const project of [undefined, null, {}, { status: 'future-status' }]) {
    assert.deepEqual(projectDisplayState(project), {
      progress: 35, progressLabel: 'Needs attention', badge: 'Needs attention', done: false,
    });
  }
});
