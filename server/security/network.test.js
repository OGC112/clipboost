import test from 'node:test';
import assert from 'node:assert/strict';
import { unsafeNetworkAddress } from './network.js';

test('unsafeNetworkAddress blocks loopback and RFC1918 IPv4', () => {
  for(const value of ['127.0.0.1','10.0.0.1','172.16.4.5','192.168.1.20','169.254.1.1']){
    assert.equal(unsafeNetworkAddress(value),true,value);
  }
});

test('unsafeNetworkAddress allows representative public IPv4', () => {
  assert.equal(unsafeNetworkAddress('8.8.8.8'),false);
  assert.equal(unsafeNetworkAddress('1.1.1.1'),false);
});

test('unsafeNetworkAddress blocks local IPv6', () => {
  assert.equal(unsafeNetworkAddress('::1'),true);
  assert.equal(unsafeNetworkAddress('fd00::1'),true);
  assert.equal(unsafeNetworkAddress('fe80::1'),true);
});
