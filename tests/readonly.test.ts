import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { createBridge } from '../bridge/server.js';

const pairing = 'test-secret-that-is-longer-than-32-characters';
const auth = { Authorization: `Bearer ${pairing}` };
const json = { ...auth, 'Content-Type': 'application/json' };
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

async function start(readOnly: boolean) {
  const root = await mkdtemp(path.join(tmpdir(), 'vaultlink-readonly-test-'));
  const vault = path.join(root, 'vault');
  await mkdir(vault);
  await writeFile(path.join(vault, 'hello.md'), 'Alpha');
  const server = await createBridge({ vault, token: pairing, port: 0, readOnly });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return { root, vault, server, base };
}
const stop = async (s: Server, root: string) => { await new Promise<void>(r => s.close(() => r())); await rm(root, { recursive: true, force: true }); };

test('read-only mode rejects every write with 403 and leaves the vault untouched', async () => {
  const f = await start(true);
  try {
    const info = await (await fetch(`${f.base}/api/info`, { headers: auth })).json() as { readOnly: boolean; capabilities: string[] };
    assert.equal(info.readOnly, true);
    assert.equal(info.capabilities.includes('upload'), false);
    const put = await fetch(`${f.base}/api/note?path=hello.md`, { method: 'PUT', headers: json, body: JSON.stringify({ content: 'changed', revision: sha('Alpha') }) });
    assert.equal(put.status, 403);
    assert.equal((await put.json() as { code: string }).code, 'read_only');
    const create = await fetch(`${f.base}/api/note?path=new.md`, { method: 'PUT', headers: json, body: JSON.stringify({ content: 'x', revision: null }) });
    assert.equal(create.status, 403);
    const upload = await fetch(`${f.base}/api/file?path=a.png`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/octet-stream' }, body: new Uint8Array([1, 2, 3]) });
    assert.equal(upload.status, 403);
    for (const method of ['DELETE', 'PATCH']) assert.equal((await fetch(`${f.base}/api/note?path=hello.md`, { method, headers: auth })).status, 403, method);
    assert.equal(await readFile(path.join(f.vault, 'hello.md'), 'utf8'), 'Alpha');
    assert.deepEqual((await readdir(f.vault)).sort(), ['hello.md']);
    assert.equal((await fetch(`${f.base}/api/note?path=hello.md`, { headers: auth })).status, 200);
    assert.equal((await fetch(`${f.base}/api/search?q=alpha`, { headers: auth })).status, 200);
    assert.equal((await fetch(`${f.base}/api/note?path=hello.md`, { method: 'PUT' })).status, 401, 'auth is still checked first');
  } finally { await stop(f.server, f.root); }
});

test('writes still work when read-only is off', async () => {
  const f = await start(false);
  try {
    const info = await (await fetch(`${f.base}/api/info`, { headers: auth })).json() as { readOnly: boolean };
    assert.equal(info.readOnly, false);
    const put = await fetch(`${f.base}/api/note?path=hello.md`, { method: 'PUT', headers: json, body: JSON.stringify({ content: 'changed', revision: sha('Alpha') }) });
    assert.equal(put.status, 200);
    assert.equal(await readFile(path.join(f.vault, 'hello.md'), 'utf8'), 'changed');
  } finally { await stop(f.server, f.root); }
});
