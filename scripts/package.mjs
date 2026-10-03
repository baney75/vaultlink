import { readdir, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import { createHash } from 'node:crypto';

async function walk(directory, files, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const source = join(directory, entry.name);
    const name = `${prefix}${entry.name}`;
    if (entry.isDirectory()) await walk(source, files, `${name}/`);
    else if (entry.isFile()) files[name] = new Uint8Array(await readFile(source));
    else throw new Error(`Refusing symlink or special file in release input: ${source}`);
  }
}

async function thirdPartyNotices() {
  const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
  const notices = ['VaultLink runtime dependency notices. Individual packages retain their licenses.'];
  for (const [path, entry] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b))) {
    if (!path.startsWith('node_modules/') || entry.dev) continue;
    let metadata, names;
    try { metadata = JSON.parse(await readFile(`${path}/package.json`, 'utf8')); names = await readdir(path); }
    catch (error) { if (entry.optional && error.code === 'ENOENT') continue; throw error; }
    const texts = [];
    for (const name of names.sort()) {
      if (/^(licen[cs]e|copying|notice)([.-]|$)/i.test(name)) {
        try { texts.push(await readFile(`${path}/${name}`, 'utf8')); }
        catch (error) { if (error.code !== 'EISDIR') throw error; }
      }
    }
    notices.push(`${metadata.name} ${metadata.version} — ${metadata.license ?? entry.license ?? 'See package source'}\n${texts.join('\n')}`);
  }
  return new TextEncoder().encode(notices.join('\n\n========================================\n\n'));
}

const version = JSON.parse(await readFile('package.json', 'utf8')).version;
const extension = {};
await walk('dist', extension);
extension['LICENSE'] = new Uint8Array(await readFile('LICENSE'));
extension['THIRD_PARTY_LICENSES.txt'] = await thirdPartyNotices();
const companion = {};
await walk('release/companion-stage', companion);
await walk('dist', companion, 'dist/');
companion['THIRD_PARTY_LICENSES.txt'] = extension['THIRD_PARTY_LICENSES.txt'];
companion['README.md'] = new Uint8Array(await readFile('README.md'));
companion['LICENSE'] = new Uint8Array(await readFile('LICENSE'));
companion['SECURITY.md'] = new Uint8Array(await readFile('SECURITY.md'));
await walk('docs', companion, 'docs/');
for (const name of ['compose.yaml', '.env.example', 'README.md'])
  companion[`native/${name}`] = new Uint8Array(await readFile(`native/${name}`));

await mkdir('release', { recursive: true });
const archives = [
  [`vaultlink-${version}-chromium.zip`, extension],
  [`vaultlink-${version}-companion.zip`, companion],
];
const sums = [];
for (const [name, files] of archives) {
  const bytes = zipSync(files, { level: 9 });
  await writeFile(`release/${name}`, bytes);
  sums.push(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`);
  console.log(`Packaged release/${name}`);
}
await writeFile('release/SHA256SUMS', `${sums.join('\n')}\n`);
await rm('release/companion-stage', { recursive: true, force: true });
