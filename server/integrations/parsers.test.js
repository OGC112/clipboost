import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYoutubeInput, isoDurationToSeconds } from './youtube.js';
import { parseTwitchInput, twitchDurationToSeconds } from './twitch.js';

test('YouTube parser accepts handle and channel URL', () => {
  assert.deepEqual(parseYoutubeInput('@creator'),{forHandle:'@creator'});
  assert.deepEqual(parseYoutubeInput('https://youtube.com/channel/UC1234567890123456789012'),{id:'UC1234567890123456789012'});
  assert.equal(isoDurationToSeconds('PT1H2M3S'),3723);
});

test('Twitch parser accepts channel URL and durations', () => {
  assert.equal(parseTwitchInput('https://www.twitch.tv/Test_User'),'test_user');
  assert.equal(twitchDurationToSeconds('2h3m4s'),7384);
});
