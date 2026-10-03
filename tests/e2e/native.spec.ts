import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createBridge } from '../../bridge/server';
import { createFixture } from '../../scripts/fixtures';

test('native view is interactive, sends no companion token, and retains the tools draft', async ({ page }) => {
  const root = await mkdtemp(join(tmpdir(), 'vaultlink-native-'));
  await createFixture(root);
  const token = 'synthetic-native-switch-verification-token';
  const bridge = await createBridge({ vault: root, token, port: 0, staticDir: resolve('dist') });
  const seenAuthorization: Array<string | undefined> = [];
  const native = createServer((req, res) => {
    seenAuthorization.push(req.headers.authorization);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><html><body style="background:#211b2e;color:white"><h1>Native frame fixture</h1><button onclick="this.textContent=\'Input received\'">Try input</button></body></html>');
  });
  await new Promise<void>(done => native.listen(0, '127.0.0.1', done));
  const endpoint = `http://127.0.0.1:${(bridge.address() as AddressInfo).port}`;
  const nativeOrigin = `http://127.0.0.1:${(native.address() as AddressInfo).port}`;
  try {
    await page.goto(endpoint);
    await page.getByLabel('Companion address').fill(endpoint);
    await page.getByLabel('Access token').fill(token);
    await page.getByRole('button', { name: 'Connect to vault' }).click();
    await page.getByRole('button', { name: 'Welcome.md', exact: true }).click();
    await page.locator('.cm-content').fill('# Draft survives native view');
    await page.getByRole('button', { name: 'Native Obsidian view' }).click();
    await page.getByLabel('Private desktop address').fill('https://example.com');
    await page.getByRole('button', { name: 'Open native view', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('private HTTPS');
    await page.getByLabel('Private desktop address').fill(nativeOrigin);
    await page.getByRole('button', { name: 'Open native view', exact: true }).click();
    const frame = page.frameLocator('iframe[title="Native Obsidian desktop"]');
    await frame.getByRole('button', { name: 'Try input' }).click();
    await expect(frame.getByRole('button', { name: 'Input received' })).toBeVisible();
    expect(seenAuthorization.length).toBeGreaterThan(0);
    expect(seenAuthorization.every(value => value === undefined)).toBe(true);
    await page.getByRole('button', { name: 'Return to VaultLink tools' }).click();
    await expect(page.locator('.cm-content')).toContainText('Draft survives native view');
    await expect(page.getByRole('button', { name: 'Save note', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Native Obsidian view' }).click();
    await expect(frame.getByRole('heading', { name: 'Native frame fixture' })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    await page.close();
    bridge.closeAllConnections(); native.closeAllConnections();
    await Promise.all([new Promise<void>(done => bridge.close(() => done())), new Promise<void>(done => native.close(() => done()))]);
    await rm(root, { recursive: true, force: true });
  }
});
