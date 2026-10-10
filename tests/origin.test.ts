import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEndpoint } from '../src/lib/api';
import { normalizeNativeURL } from '../src/lib/native';
import { parseCustomOrigin } from '../src/lib/origin';

const custom = 'https://vault.example.com';

test('the configured custom HTTPS origin is accepted, exactly', () => {
  assert.equal(normalizeEndpoint('https://vault.example.com', custom), custom);
  assert.equal(normalizeEndpoint('https://VAULT.example.com/', custom), custom);
  assert.equal(normalizeEndpoint('https://vault.example.com:443', custom), custom);
  assert.equal(normalizeNativeURL('https://vault.example.com', custom), custom);
  assert.equal(normalizeEndpoint('https://vault.example.com:8443', 'https://vault.example.com:8443'), 'https://vault.example.com:8443');
});

test('custom origin rejects http, other hosts, userinfo, unconfigured ports and paths', () => {
  for (const value of [
    'http://vault.example.com', 'https://other.example.com', 'https://evil.vault.example.com',
    'https://vault.example.com.evil.example', 'https://user:pw@vault.example.com', 'https://vault.example.com:8443',
    'https://vault.example.com/notes', 'https://vault.example.com/?token=x', 'https://vault.example.com/#x',
    'ftp://vault.example.com', 'javascript:alert(1)',
  ]) assert.throws(() => normalizeEndpoint(value, custom), value);
});

test('without a custom origin nothing outside loopback and ts.net passes', () => {
  assert.throws(() => normalizeEndpoint('https://vault.example.com', undefined));
  assert.equal(normalizeEndpoint('http://127.0.0.1:27124', custom), 'http://127.0.0.1:27124');
  assert.equal(normalizeEndpoint('https://host.tail1234.ts.net', custom), 'https://host.tail1234.ts.net');
  assert.throws(() => normalizeEndpoint('http://vault.example.com', custom), 'http stays rejected even when configured');
});

test('parseCustomOrigin only produces one exact HTTPS origin', () => {
  assert.equal(parseCustomOrigin(' https://Vault.Example.com/ '), 'https://vault.example.com');
  for (const value of [
    'http://vault.example.com', 'https://*.example.com', 'https://*', '*', 'https://user@vault.example.com',
    'https://vault.example.com/path', 'https://127.0.0.1', 'https://[::1]', 'https://localhost', 'https://intranet',
    'https://vault.local', 'https://1.2.3.4:8443', 'https://vault.example.com?x=1', 'https://vault.example.com#x', '', 'vault.example.com',
  ]) assert.throws(() => parseCustomOrigin(value), value);
});
