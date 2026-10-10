import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs, constants } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { createBridge } from '../bridge/server';
import { parseCustomOrigin } from '../src/lib/origin';

const extensionOrigin = 'chrome-extension://ehhkfcfccadfoelnhjhdgbcmpaeakihn';

function requireNode() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12))
    throw new Error('VaultLink needs Node.js 22.12 or newer. Install it, then run setup again.');
  if (process.platform === 'win32')
    throw new Error('This companion setup supports macOS and Linux. Windows token-file security has not been verified.');
}

async function privateTokenFile(file: string): Promise<string> {
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.nlink !== 1 || (info.mode & 0o077) !== 0 ||
        (process.getuid && info.uid !== process.getuid()))
      throw new Error(`Pairing token file is not private: ${file}. Keep it owned by you with mode 600.`);
    const token = (await handle.readFile('utf8')).trim();
    if (token.length < 32) throw new Error(`Pairing token file is invalid: ${file}.`);
    return token;
  } finally { await handle.close(); }
}

async function ensureToken(vault: string): Promise<{ token: string; file: string }> {
  const configDir = join(homedir(), '.vaultlink');
  await fs.mkdir(configDir, { recursive: true, mode: 0o700 });
  const info = await fs.lstat(configDir);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 ||
      (process.getuid && info.uid !== process.getuid()))
    throw new Error(`Configuration folder is not private: ${configDir}. Keep it owned by you with mode 700.`);
  const file = join(configDir, `${createHash('sha256').update(vault).digest('hex').slice(0, 16)}.token`);
  try { return { token: await privateTokenFile(file), file }; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const generated = randomBytes(32).toString('base64url');
  try { await fs.writeFile(file, `${generated}\n`, { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    return { token: await privateTokenFile(file), file };
  }
  return { token: generated, file };
}

async function bundledWebDirectory(): Promise<string> {
  const here = dirname(fileURLToPath(import.meta.url));
  // Bundled setup.mjs sits beside dist/. Source setup.ts sits one level below it.
  for (const candidate of [join(here, 'dist'), join(here, '..', 'dist')]) {
    try {
      const actual = await fs.realpath(candidate);
      if ((await fs.stat(join(actual, 'index.html'))).isFile()) return actual;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  throw new Error('Built web app not found beside setup. Re-extract the complete companion kit, or run npm run build in a source checkout.');
}

function privateHttpsOrigin(input: string): string | undefined {
  if (!input) return undefined;
  let parsed: URL;
  try { parsed = new URL(input); } catch { throw new Error('Enter the HTTPS address printed by Tailscale Serve.'); }
  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.ts.net') ||
      parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash)
    throw new Error('Use a private https://...ts.net address from Tailscale Serve, with no path or credentials.');
  return parsed.origin;
}

/** Opt-in for ONE non-Tailscale HTTPS origin, such as a Cloudflare Tunnel hostname. */
function customHttpsOrigin(input: string): string | undefined {
  return input.trim() ? parseCustomOrigin(input) : undefined;
}

async function main() {
  requireNode();
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    console.log('\nVaultLink companion\nKeep this terminal running while you use your vault.\n');
    const raw = (await rl.question('Path to your Obsidian vault: ')).trim().replace(/^~(?=\/|$)/, homedir());
    if (!raw) throw new Error('Choose a vault folder.');
    let vault: string;
    try { vault = await fs.realpath(resolve(raw)); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`Vault folder not found: ${resolve(raw)}`);
      throw error;
    }
    if (!(await fs.stat(vault)).isDirectory()) throw new Error('Choose a vault folder.');
    let publicUrl = privateHttpsOrigin((await rl.question('Tailscale HTTPS address (Enter to skip): ')).trim());
    if (!publicUrl) {
      publicUrl = customHttpsOrigin(await rl.question('Custom HTTPS origin, e.g. a tunnel hostname (Enter for this computer only): '));
      if (publicUrl) console.log(`\nCustom origin ${publicUrl} is outside Tailscale. Your tunnel or proxy must forward to http://127.0.0.1:27124 over HTTPS only, and should add its own access control.\nThe browser extension needs a build made with VAULTLINK_CUSTOM_ORIGIN=${publicUrl}; the web app works without it.`);
    }
    const readOnly = /^y(es)?$/i.test((await rl.question('Read-only mode, reject all saves and uploads? [y/N]: ')).trim()) || process.env.VAULTLINK_READ_ONLY === '1';
    const staticDir = await bundledWebDirectory();
    const { token, file } = await ensureToken(vault);
    await createBridge({ vault, token, port: 27124, publicUrl, allowOrigins: [extensionOrigin], staticDir, readOnly });
    if (readOnly) console.log('\nRead-only mode is on. Every write is rejected with 403.');
    const address = publicUrl ?? 'http://127.0.0.1:27124';
    console.log(`\nOpen ${address} or click the VaultLink extension.`);
    console.log(`Server address: ${address}\nPairing token: ${token}`);
    console.log(`\nThe token stays in ${file}. Keep it private.\nCtrl+C stops the companion.\n`);
  } finally { rl.close(); }
}

main().catch(error => { console.error(`VaultLink setup: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
