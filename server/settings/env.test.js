import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEnvText, serializeEnv, maskSecret } from './env.js';

test('env parser ignores comments and preserves values', () => {
  const parsed=parseEnvText('# comment\nA=1\nB="two words"\n');
  assert.deepEqual(parsed,{A:'1',B:'two words'});
});

test('env serializer strips embedded newlines', () => {
  const text=serializeEnv({A:'hello\nworld'});
  assert.equal(text,'A=helloworld\n');
});

test('maskSecret never exposes full secret', () => {
  assert.equal(maskSecret(''),'');
  assert.equal(maskSecret('short'),'••••••••');
  const masked=maskSecret('abcdefghijklmnop');
  assert.ok(masked.startsWith('abcd'));
  assert.ok(masked.endsWith('mnop'));
  assert.ok(!masked.includes('efghijkl'));
});
