import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
await mkdir('dist',{recursive:true});
await writeFile('dist/manifest.json',JSON.stringify(manifest,null,2)+'\n');
await copyFile('public/background.js','dist/background.js');
const id=createHash('sha256').update(Buffer.from(manifest.key,'base64')).digest('hex').slice(0,32).replace(/[0-9a-f]/g,c=>String.fromCharCode(97+parseInt(c,16)));
console.log(`Extension ready: dist/ · ID ${id}`);
