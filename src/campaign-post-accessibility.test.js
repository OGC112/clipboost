import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const panelSource = source.slice(source.indexOf('    const publishedPanel='), source.indexOf('    const importedRequirements='));
const html = vm.runInNewContext(`${panelSource}\npublishedPanel`, { posts: [] });

test('each tracking field has its own persistent native label, including units', () => {
  const fields = [...html.matchAll(/<label class="campaign-post-field"><span>([^<]+)<\/span>(<input\b[^>]*>|<select\b[^>]*>[\s\S]*?<\/select>)<\/label>/g)];
  assert.deepEqual(fields.map(([, label, control]) => [control.match(/id="([^"]+)"/)[1], label]), [
    ['campaignPostUrl', 'Post URL'],
    ['campaignPostPlatform', 'Platform'],
    ['campaignPostViews', 'Views'],
    ['campaignPostDuration', 'Clip (sec)'],
    ['campaignPostMinutes', 'Edit (min)'],
    ['campaignPostPayout', 'Confirmed ($)'],
    ['campaignPostStatus', 'Status'],
  ]);
  assert.equal((html.match(/class="campaign-post-field"/g) || []).length, 7);
});

test('labeled tracking controls retain the submission field mapping', async () => {
  const values = { campaignPostUrl: 'https://example.com/clip', campaignPostPlatform: 'YouTube Shorts', campaignPostViews: '1200', campaignPostDuration: '35', campaignPostMinutes: '8', campaignPostPayout: '12.50', campaignPostStatus: 'accepted' };
  let request, loads = 0;
  const state = { campaigns: [{}] };
  const start = source.indexOf('  async function addCampaignPost()');
  const handler = source.slice(start, source.indexOf('\n', start));
  await vm.runInNewContext(`${handler}\naddCampaignPost()`, {
    state,
    selectedCampaign: () => ({ id: 'campaign-1' }),
    document: { getElementById: id => {
      assert.ok(html.includes(`id="${id}"`));
      return { value: values[id] };
    } },
    fetch: async (url, init) => { request = { url, ...init }; return {}; },
    readJsonResponse: async () => ({}),
    loadCampaigns: async () => { loads++; },
  });
  const body = JSON.parse(request.body);
  assert.equal(request.url, '/api/campaigns/campaign-1/posts');
  assert.equal(request.method, 'POST');
  assert.ok(Number.isFinite(Date.parse(body.publishedAt)));
  delete body.publishedAt;
  assert.deepEqual(body, { url: values.campaignPostUrl, platform: 'YouTube Shorts', views: 1200, clipDuration: 35, editingMinutes: 8, payoutConfirmed: 12.5, submissionStatus: 'accepted' });
  assert.equal(state.campaigns, null);
  assert.equal(loads, 1);
});
