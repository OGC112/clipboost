import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAnalyticsPosts, youtubeVideoId } from './analytics-posts.js';

test('YouTube identifiers retain supported URL and raw-ID forms', () => {
  const id = 'abcdefghijk';
  for (const value of [id, `https://youtu.be/${id}?t=3`,
    `https://www.youtube.com/watch?v=${id}&t=3`,
    ...['shorts', 'live', 'embed'].map(kind => `https://youtube.com/${kind}/${id}`)]) {
    assert.equal(youtubeVideoId(value), id);
  }
  for (const value of ['', null, 'invalid', 'https://example.com/watch?v=abcdefghijk']) {
    assert.equal(youtubeVideoId(value), '');
  }
});

test('live metrics enrich campaign posts and matched organic posts are counted once', () => {
  const live = { _youtubeId: 'abcdefghijk', _title: 'Live title', _date: '2026-11-01',
    _views: 0, _likes: null, _comments: 4, _thumb: '/live.jpg' };
  const unmatched = { _youtubeId: 'unmatched01', _views: 20 };
  const campaigns = [{ id: 'campaign', name: 'Launch', currency: 'EUR', posts: [
    { id: 'post', platform: 'YouTube', url: 'https://youtu.be/abcdefghijk',
      views: 100, likes: 10, shares: 2, payoutConfirmed: 5 },
  ] }];
  const before = structuredClone(campaigns);
  const result = buildAnalyticsPosts(campaigns, [live, unmatched]);
  const post = result.campaignPosts[0];
  assert.equal(post._views, 0);
  assert.equal(post._likes, null);
  assert.equal(post._comments, 4);
  assert.equal(post._title, 'Live title');
  assert.equal(post._date, live._date);
  assert.equal(post._thumb, '/live.jpg');
  assert.equal(post._shares, 2);
  assert.equal(post._revenue, 5);
  assert.equal(post._currency, 'EUR');
  assert.deepEqual(result.organicPosts, [unmatched]);
  assert.deepEqual(result.allPosts, [post, unmatched]);
  assert.deepEqual(campaigns, before);
  assert.equal(live._views, 0);
});

test('manual campaign metrics retain fallbacks and do not match other platforms by ID', () => {
  const organic = { _youtubeId: 'abcdefghijk', _views: 90 };
  const result = buildAnalyticsPosts([
    { id: 'empty', posts: null },
    { id: 'manual', createdAt: '2026-10-01', posts: [
      { platform: 'TikTok', postId: 'abcdefghijk', caption: 'Manual title',
        views: -2, likeCount: '3', commentCount: '4', shareCount: '5', revenue: '6' },
      {},
    ] },
  ], [organic]);
  const [post, empty] = result.campaignPosts;
  assert.equal(post._platform, 'tiktok');
  assert.equal(post._views, 0);
  assert.equal(post._likes, 3);
  assert.equal(post._comments, 4);
  assert.equal(post._shares, 5);
  assert.equal(post._revenue, 6);
  assert.equal(post._title, 'Manual title');
  assert.equal(post._date, '2026-10-01');
  assert.equal(empty._id, 'manual-1');
  assert.equal(empty._title, 'Campaign post 2');
  assert.equal(empty._likes, null);
  assert.equal(empty._currency, 'USD');
  assert.deepEqual(result.organicPosts, [organic]);
  assert.deepEqual(buildAnalyticsPosts([], []), { campaignPosts: [], organicPosts: [], allPosts: [] });
});
