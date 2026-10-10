import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { transform } from 'esbuild';

const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));

// Optional single custom HTTPS origin: VAULTLINK_CUSTOM_ORIGIN=https://vault.example.com npm run build
// The exact origin (never a wildcard) is added to optional_host_permissions, so the browser asks the
// user at connect time, and to the extension-page CSP. Validation is shared with the app (src/lib/origin.ts).
const requested = process.env.VAULTLINK_CUSTOM_ORIGIN?.trim();
if (requested) {
  const source = await readFile('src/lib/origin.ts', 'utf8');
  const { code } = await transform(source, { loader: 'ts', format: 'esm' });
  const { parseCustomOrigin } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const origin = parseCustomOrigin(requested);
  manifest.optional_host_permissions.push(`${origin}/*`);
  const csp = manifest.content_security_policy.extension_pages;
  manifest.content_security_policy.extension_pages = csp
    .replace(/(connect-src [^;]*)/, `$1 ${origin}`)
    .replace(/(frame-src [^;]*)/, `$1 ${origin}`);
  console.log(`Custom origin enabled: ${origin}`);
}

await mkdir('dist',{recursive:true});
await writeFile('dist/manifest.json',JSON.stringify(manifest,null,2)+'\n');
await copyFile('public/background.js','dist/background.js');
const id=createHash('sha256').update(Buffer.from(manifest.key,'base64')).digest('hex').slice(0,32).replace(/[0-9a-f]/g,c=>String.fromCharCode(97+parseInt(c,16)));
console.log(`Extension ready: dist/ · ID ${id}`);
