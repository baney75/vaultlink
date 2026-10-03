#!/usr/bin/env node
import { promises as fs, constants } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { createBridge } from './server.js';

function usage() {
  return `VaultLink bridge

Usage: npm run bridge -- --vault PATH --token-file PATH [options]

Required:
  --vault PATH          Absolute path to an Obsidian-compatible vault
  --token-file PATH     Private file holding the pairing credential

Options:
  --port NUMBER         Loopback port (default 27124)
  --allow-origin URL    Exact browser origin; repeat for each approved origin
  --public-url URL      HTTPS origin served through a private reverse proxy
  --web PATH            Built web app directory (for example dist)
  --show-token          Print pairing credential to this terminal
  --help                Show this help

The bridge listens on 127.0.0.1 only. Keep the token file private.
`;
}

async function main() {
  const args = process.argv.slice(2);
  const values: Record<string, string> = {};
  const allowOrigins: string[] = [];
  let showToken = false;
  for (let i = 0; i < args.length; i++) {
    const argument = args[i];
    if (argument === '--help' || argument === '-h') { process.stdout.write(usage()); return; }
    if (argument === '--show-token') { showToken = true; continue; }
    if (!['--vault', '--token-file', '--port', '--allow-origin', '--public-url', '--web'].includes(argument))
      throw new Error(`Unknown option ${argument}. Use --help for usage.`);
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error(`${argument} needs a value. Use --help for usage.`);
    if (argument === '--allow-origin') allowOrigins.push(value);
    else values[argument] = value;
  }
  if (!values['--vault'] || !values['--token-file']) throw new Error('Both --vault and --token-file are required. Use --help for usage.');
  if (!path.isAbsolute(values['--vault'])) throw new Error('--vault must be an absolute path.');
  const tokenFile = path.resolve(values['--token-file']);
  async function readPrivateToken() {
    const handle = await fs.open(tokenFile, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0) throw new Error('Token file must be a private regular file (chmod 600).');
      return (await handle.readFile('utf8')).trim();
    } finally { await handle.close(); }
  }
  let token: string;
  try {
    token = await readPrivateToken();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    token = randomBytes(32).toString('base64url');
    try { await fs.writeFile(tokenFile, `${token}\n`, { flag: 'wx', mode: 0o600 }); }
    catch (writeError) {
      if ((writeError as NodeJS.ErrnoException).code !== 'EEXIST') throw writeError;
      token = await readPrivateToken();
    }
  }
  const rawPort = values['--port'];
  if (rawPort && !/^\d+$/.test(rawPort)) throw new Error('--port must be a number from 1 to 65535.');
  const port = rawPort ? Number(rawPort) : 27124;
  if (port < 1 || port > 65535) throw new Error('--port must be a number from 1 to 65535.');
  const server = await createBridge({ vault: values['--vault'], token, port,
    allowOrigins, publicUrl: values['--public-url'], staticDir: values['--web'] });
  process.stdout.write(`VaultLink listening at http://127.0.0.1:${(server.address() as { port: number }).port}\n`);
  process.stdout.write(`Vault: ${values['--vault']}\nToken file: ${tokenFile}\n`);
  if (showToken) process.stdout.write(`Pairing token: ${token}\n`);
}

main().catch(error => { process.stderr.write(`VaultLink: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
