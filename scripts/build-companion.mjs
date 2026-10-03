import { build } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outdir = resolve(root, 'release', 'companion-stage');
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: [
    { in: 'scripts/setup.ts', out: 'setup' },
    { in: 'bridge/cli.ts', out: 'bridge' },
  ],
  outdir,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  logLevel: 'warning',
});
console.log('Built standalone companion entry points.');
