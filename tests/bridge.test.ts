import { test } from 'node:test';
import assert from 'node:assert/strict';
import { link, mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { promises as fs } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Server } from 'node:http';
import http from 'node:http';
import { createBridge } from '../bridge/server.js';

const hash = (text: string | Uint8Array) => createHash('sha256').update(text).digest('hex');

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'vaultlink-bridge-test-'));
  const vault = path.join(root, 'vault');
  await mkdir(vault);
  await mkdir(path.join(vault, 'Notes'));
  await writeFile(path.join(vault, 'Notes', 'hello.md'), 'Alpha\nBeta');
  await writeFile(path.join(vault, '.secret.md'), 'hidden');
  await writeFile(path.join(root, 'outside.md'), 'outside');
  await symlink(path.join(root, 'outside.md'), path.join(vault, 'leak.md'));
  await link(path.join(root, 'outside.md'), path.join(vault, 'hardlink.md'));
  const token = 'test-token-that-is-longer-than-32-characters';
  const server = await createBridge({ vault, token, port: 0, allowOrigins: ['http://127.0.0.1:5173', 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'] });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return { root, vault, token, server, base };
}

async function close(server: Server) { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
async function requestWithHost(base: string, token: string, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.get(`${base}/api/info`, { headers: { Host: host, Authorization: `Bearer ${token}` } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode ?? 0)); });
    req.on('error', reject);
  });
}

test('auth, exact CORS, host validation and private metadata', async () => {
  const f = await fixture();
  try {
    const unauth = await fetch(`${f.base}/api/info`);
    assert.equal(unauth.status, 401);
    assert.equal((await unauth.text()).includes('vault'), false);
    assert.equal(await requestWithHost(f.base, f.token, 'evil.example'), 403);
    const badOrigin = await fetch(`${f.base}/api/info`, { headers: { Origin: 'http://evil.example', Authorization: `Bearer ${f.token}` } });
    assert.equal(badOrigin.status, 403);
    assert.equal(badOrigin.headers.get('access-control-allow-origin'), null);
    const good = await fetch(`${f.base}/api/info`, { headers: { Origin: 'http://127.0.0.1:5173', Authorization: `Bearer ${f.token}` } });
    assert.equal(good.status, 200);
    assert.equal(good.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5173');
    assert.equal(good.headers.get('access-control-expose-headers'), 'ETag');
    assert.equal((await good.json() as { protocol: number }).protocol, 1);
    const sameOrigin = await fetch(`${f.base}/api/info`, { headers: { Origin: f.base, Authorization: `Bearer ${f.token}` } });
    assert.equal(sameOrigin.status, 200);
    assert.equal(sameOrigin.headers.get('access-control-allow-origin'), f.base);
    const preflight = await fetch(`${f.base}/api/note`, { method: 'OPTIONS', headers: { Origin: 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'Authorization, Content-Type' } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  } finally { await close(f.server); await rm(f.root, { recursive: true, force: true }); }
});

test('tree, path restrictions and literal search exclude hidden and linked files', async () => {
  const f = await fixture();
  const auth = { Authorization: `Bearer ${f.token}` };
  try {
    const tree = await fetch(`${f.base}/api/tree`, { headers: auth });
    assert.equal(tree.status, 200);
    const entries = (await tree.json() as { entries: Array<{ path: string }> }).entries.map(e => e.path);
    assert.deepEqual(entries.sort(), ['Notes', 'Notes/hello.md']);
    for (const file of ['../outside.md', '.secret.md', 'leak.md', 'hardlink.md', 'Notes/../hello.md']) {
      const response = await fetch(`${f.base}/api/note?path=${encodeURIComponent(file)}`, { headers: auth });
      assert.equal(response.status, 403, file);
    }
    const search = await fetch(`${f.base}/api/search?q=beta`, { headers: auth });
    assert.deepEqual((await search.json() as { hits: unknown[] }).hits, [{ path: 'Notes/hello.md', line: 2, text: 'Beta' }]);
  } finally { await close(f.server); await rm(f.root, { recursive: true, force: true }); }
});

test('conditional note updates serialize, reject stale writes and retain a private backup', async () => {
  const f = await fixture();
  const auth = { Authorization: `Bearer ${f.token}`, 'Content-Type': 'application/json' };
  try {
    const initial = await fetch(`${f.base}/api/note?path=Notes%2Fhello.md`, { headers: auth });
    const revision = (await initial.json() as { revision: string }).revision;
    assert.equal(revision, hash('Alpha\nBeta'));
    const update = (content: string) => fetch(`${f.base}/api/note?path=Notes%2Fhello.md`, { method: 'PUT', headers: auth, body: JSON.stringify({ content, revision }) });
    const [a, b] = await Promise.all([update('First'), update('Second')]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    const actual = await readFile(path.join(f.vault, 'Notes', 'hello.md'), 'utf8');
    assert.ok(actual === 'First' || actual === 'Second');
    const backupDir = path.join(f.root, '.vault-vaultlink-backups');
    const backups = await readdir(backupDir);
    assert.equal(backups.length, 1);
    assert.equal(await readFile(path.join(backupDir, backups[0]), 'utf8'), 'Alpha\nBeta');
    assert.equal((await stat(backupDir)).mode & 0o077, 0);
    const stale = await update('Stale');
    assert.equal(stale.status, 409);
    assert.equal(await readFile(path.join(f.vault, 'Notes', 'hello.md'), 'utf8'), actual);
    const create = await fetch(`${f.base}/api/note?path=Notes%2Fnew.md`, { method: 'PUT', headers: auth, body: JSON.stringify({ content: 'New', revision: null }) });
    assert.equal(create.status, 200);
    const duplicate = await fetch(`${f.base}/api/note?path=Notes%2Fnew.md`, { method: 'PUT', headers: auth, body: JSON.stringify({ content: 'Again', revision: null }) });
    assert.equal(duplicate.status, 409);
  } finally { await close(f.server); await rm(f.root, { recursive: true, force: true }); }
});

test('all writes in one vault share a queue, even with different path spellings', async () => {
  const f = await fixture();
  const originalLink = fs.link;
  let entered!: () => void;
  let release!: () => void;
  const firstEntered = new Promise<void>(resolve => { entered = resolve; });
  const firstReleased = new Promise<void>(resolve => { release = resolve; });
  let active = 0;
  let maximumActive = 0;
  fs.link = async (...args) => {
    active++;
    maximumActive = Math.max(maximumActive, active);
    try {
      if (active === 1 && maximumActive === 1) { entered(); await firstReleased; }
      return await originalLink(...args);
    } finally { active--; }
  };
  try {
    const auth = { Authorization: `Bearer ${f.token}`, 'Content-Type': 'application/json' };
    const create = (name: string) => fetch(`${f.base}/api/note?path=${encodeURIComponent(name)}`, {
      method: 'PUT', headers: auth, body: JSON.stringify({ content: name, revision: null }),
    });
    const first = create('Notes/one.md');
    await firstEntered;
    const second = create('Notes/two.md');
    await delay(100);
    assert.equal(maximumActive, 1, 'a second write entered the filesystem while the first was held');
    release();
    const responses = await Promise.all([first, second]);
    assert.deepEqual(responses.map(response => response.status), [200, 200]);
    assert.equal(maximumActive, 1);
  } finally {
    release();
    fs.link = originalLink;
    await close(f.server);
    await rm(f.root, { recursive: true, force: true });
  }
});

test('case aliases cannot both replace the same revision on case-insensitive vaults', async (t) => {
  const f = await fixture();
  try {
    const alias = path.join(f.vault, 'Notes', 'HELLO.md');
    try { await stat(alias); } catch { t.skip('fixture filesystem is case-sensitive'); return; }
    const auth = { Authorization: `Bearer ${f.token}`, 'Content-Type': 'application/json' };
    const revision = hash('Alpha\nBeta');
    const write = (spelling: string, content: string) => fetch(`${f.base}/api/note?path=${encodeURIComponent(spelling)}`, {
      method: 'PUT', headers: auth, body: JSON.stringify({ content, revision }),
    });
    const responses = await Promise.all([write('Notes/hello.md', 'lowercase'), write('Notes/HELLO.md', 'uppercase')]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  } finally { await close(f.server); await rm(f.root, { recursive: true, force: true }); }
});

test('upload is exclusive, bounded, and served as a non-executable attachment', async () => {
  const f = await fixture();
  const auth = { Authorization: `Bearer ${f.token}` };
  try {
    const data = Buffer.from([1, 2, 3]);
    const upload = await fetch(`${f.base}/api/file?path=Notes%2Fphoto.png`, { method: 'POST', headers: auth, body: data });
    assert.equal(upload.status, 200);
    assert.deepEqual(await upload.json(), { path: 'Notes/photo.png', revision: hash(data) });
    const duplicate = await fetch(`${f.base}/api/file?path=Notes%2Fphoto.png`, { method: 'POST', headers: auth, body: data });
    assert.equal(duplicate.status, 409);
    const file = await fetch(`${f.base}/api/file?path=Notes%2Fphoto.png`, { headers: auth });
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('etag'), `"${hash(data)}"`);
    assert.match(file.headers.get('content-disposition') ?? '', /^attachment;/);
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), data);
    const huge = await fetch(`${f.base}/api/note?path=Notes%2Fhuge.md`, { method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'x'.repeat(2 * 1024 * 1024 + 1), revision: null }) });
    assert.equal(huge.status, 413);
    const unsupported = await fetch(`${f.base}/api/file?path=Notes%2Fbad.svg`, { method: 'POST', headers: auth, body: '<svg />' });
    assert.equal(unsupported.status, 403);
  } finally { await close(f.server); await rm(f.root, { recursive: true, force: true }); }
});

test('external edits invalidate revisions and static shell stays within its build directory', async () => {
  const f = await fixture();
  const web = path.join(f.root, 'dist');
  await mkdir(path.join(web, 'assets'), { recursive: true });
  await writeFile(path.join(web, 'index.html'), '<html><script src="/assets/app.js"></script></html>');
  await writeFile(path.join(web, 'assets', 'app.js'), 'console.log("app")');
  await writeFile(path.join(web, 'assets', 'worker.mjs'), 'export const ready = true');
  await symlink(path.join(f.root, 'outside.md'), path.join(web, 'assets', 'leak.js'));
  await close(f.server);
  f.server = await createBridge({ vault: f.vault, token: f.token, port: 0, staticDir: web });
  f.base = `http://127.0.0.1:${(f.server.address() as { port: number }).port}`;
  try {
    const shell = await fetch(f.base);
    assert.equal(shell.status, 200);
    assert.match(shell.headers.get('content-security-policy') ?? '', /script-src 'self'/);
    assert.match(shell.headers.get('content-security-policy') ?? '', /style-src 'self' 'unsafe-inline'/);
    assert.match(shell.headers.get('content-security-policy') ?? '', /media-src 'self' blob:/);
    assert.match(await shell.text(), /app\.js/);
    const asset = await fetch(`${f.base}/assets/app.js`);
    assert.equal(asset.status, 200);
    assert.equal(await asset.text(), 'console.log("app")');
    const worker = await fetch(`${f.base}/assets/worker.mjs`);
    assert.equal(worker.status, 200);
    assert.match(worker.headers.get('content-type') ?? '', /text\/javascript/);
    assert.equal((await fetch(`${f.base}/assets/leak.js`)).status, 403);
    assert.equal((await fetch(`${f.base}/.secret.md`)).status, 403);
    assert.equal((await fetch(`${f.base}/not-built.html`)).status, 404);
    const auth = { Authorization: `Bearer ${f.token}`, 'Content-Type': 'application/json' };
    const stale = hash('Alpha\nBeta');
    await writeFile(path.join(f.vault, 'Notes', 'hello.md'), 'External edit');
    const save = await fetch(`${f.base}/api/note?path=Notes%2Fhello.md`, { method: 'PUT', headers: auth, body: JSON.stringify({ content: 'Overwrite', revision: stale }) });
    assert.equal(save.status, 409);
    assert.equal(await readFile(path.join(f.vault, 'Notes', 'hello.md'), 'utf8'), 'External edit');
    assert.equal((await fetch(`${f.base}/api/info?token=secret`, { headers: auth })).status, 400);
  } finally { await close(f.server); await rm(f.root, { recursive: true, force: true }); }
});
