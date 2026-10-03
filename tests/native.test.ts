import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNativeURL, storeNativeURL, loadNativeURL, clearNativeURL } from '../src/lib/native';

test('native view accepts only private HTTPS or loopback HTTP origins', () => {
  assert.equal(normalizeNativeURL('https://desktop.tail1234.ts.net:8443/'), 'https://desktop.tail1234.ts.net:8443');
  assert.equal(normalizeNativeURL('http://127.0.0.1:3000'), 'http://127.0.0.1:3000');
  for (const value of [
    'https://desktop.tail1234.ts.net.evil.example',
    'http://desktop.tail1234.ts.net',
    'https://example.com',
    'https://desktop.tail1234.ts.net/login',
    'https://desktop.tail1234.ts.net/?token=private',
    'https://desktop.tail1234.ts.net/?',
    'https://desktop.tail1234.ts.net/#',
    'https://user:secret@desktop.tail1234.ts.net',
    'file:///Users/example/vault',
    'javascript:alert(1)',
  ]) assert.throws(() => normalizeNativeURL(value), value);
});

test('native address storage retains only normalized origin', async () => {
  const values = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  } });
  try {
    await storeNativeURL('https://desktop.tail1234.ts.net:8443/');
    assert.equal(await loadNativeURL(), 'https://desktop.tail1234.ts.net:8443');
    assert.deepEqual([...values.values()], ['https://desktop.tail1234.ts.net:8443']);
    await clearNativeURL();
    assert.equal(await loadNativeURL(), null);
    values.set('vaultlink.native-origin', 'https://evil.example');
    assert.equal(await loadNativeURL(), null);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
