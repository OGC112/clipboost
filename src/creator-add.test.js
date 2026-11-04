import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const addSource = source.slice(source.indexOf('  async function addCreatorByPlatform('), source.indexOf('  let creatorSearchRevision='));

for (const platform of ['youtube', 'twitch']) {
  for (const fail of [false, true]) {
    test(`${platform} creator addition blocks overlapping requests and allows retry after ${fail ? 'failure' : 'success'}`, async () => {
      const state = { creatorPlatform: platform, addCreatorOpen: true };
      const requests = [];
      const context = vm.createContext({
        state, render() {},
        fetch: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })),
        readJsonResponse: async response => response,
      });
      vm.runInContext(addSource, context);
      const pending = context.addCreatorByPlatform('first');
      assert.equal(state.addCreatorBusy, true);
      await context.addCreatorByPlatform('second');
      assert.equal(requests.length, 1);
      assert.equal(requests[0].url, `/api/library/${platform}/creator`);
      assert.deepEqual(JSON.parse(requests[0].options.body), { input: 'first' });
      const library = { creators: [{ id: 'first' }] };
      if (fail) requests[0].reject(new Error('Could not add creator'));
      else requests[0].resolve({ library });
      await pending;
      assert.equal(state.addCreatorBusy, false);
      if (fail) {
        assert.equal(state.libraryError, 'Could not add creator');
        assert.equal(state.addCreatorOpen, true);
      } else {
        assert.equal(state.library, library);
        assert.equal(state.addCreatorOpen, false);
        assert.equal(state.librarySection, platform === 'youtube' ? 'videos' : 'vods');
      }
      const retry = context.addCreatorByPlatform('second');
      assert.equal(requests.length, 2);
      requests[1].resolve({ library });
      await retry;
      assert.equal(state.addCreatorBusy, false);
      assert.equal(state.libraryError, '');
    });
  }
}

test('creator result buttons reflect the shared pending-add guard', () => {
  const resultsSource = source.slice(source.indexOf('    const results=(state.creatorSearchResults'), source.indexOf('    const query=escapeHtml(state.creatorQuery'));
  for (const busy of [false, true]) {
    const markup = vm.runInNewContext(`${resultsSource}\nresults`, {
      state: { creatorSearchResults: [{ id: 'creator', name: 'Creator' }], addCreatorBusy: busy },
      platform: 'youtube', escapeHtml: String, creatorAvatarMarkup: () => '', formatCount: () => '0',
    });
    assert.equal(/\sdisabled(?:\s|>)/.test(markup), busy);
  }
});
