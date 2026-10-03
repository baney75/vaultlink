import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PDFDocument } from 'pdf-lib';
import { createBridge } from '../../bridge/server';
import { createFixture } from '../../scripts/fixtures';
const token='synthetic-test-token-not-a-real-user-credential';
const extensionId='ehhkfcfccadfoelnhjhdgbcmpaeakihn';
let root:string, vault:string, base:string, server:Server;
async function connect(page:Page,url=base,endpoint=base){
 await page.goto(url);
 await page.getByLabel(/(?:Bridge|Companion|Server) address/).fill(endpoint);
 await page.getByLabel(/(?:Access|Pairing) token/).fill(token);
 await page.getByRole('button',{name:'Connect to vault'}).click();
 await expect(page.getByRole('navigation',{name:'Vault files'})).toBeAttached();
}
async function openFile(page:Page,name:string){
 const button=page.getByRole('button',{name,exact:true});
 const menu=page.getByRole('button',{name:'Open files',exact:true});
 if(await menu.isVisible() && !await page.locator('.sidebar').evaluate(el=>el.classList.contains('open')))await menu.click();
 await expect(button).toBeVisible();
 await button.click();
}
test.beforeAll(async()=>{
 root=await mkdtemp(join(tmpdir(),'vaultlink-e2e-'));vault=join(root,'Sample vault');
 await createFixture(vault);
 await writeFile(join(vault,'Notes','Unsafe.md'),'# Safe preview\n\n<img src="https://tracker.invalid/pixel" onerror="alert(1)"><script>alert(2)</script>\n\n[Unsafe](javascript:alert(3))\n\n![](https://tracker.invalid/remote.png)');
 server=await createBridge({vault,token,port:0,staticDir:resolve('dist'),allowOrigins:[`chrome-extension://${extensionId}`]});
 base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
test.afterAll(async()=>{server?.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});});
test('write, preview, conflict recovery, search, and responsive workspace',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await connect(page);
 await openFile(page,'Welcome.md');
 const editor=page.locator('.cm-content');
 await expect(editor).toContainText('A little room to think');
 await editor.fill('# My browser note\n\nA thought worth keeping.\n\n[[Notes/Field notes|Read field notes]]');
 await page.getByRole('button',{name:'Save note',exact:true}).click();
 await expect.poll(()=>readFile(join(vault,'Welcome.md'),'utf8')).toContain('A thought worth keeping.');
 await page.getByRole('button',{name:'Preview view'}).click();
 await expect(page.locator('.markdown-preview')).toContainText('My browser note');
 await page.getByText('Read field notes',{exact:true}).click();
 await expect(page.locator('.cm-content')).toContainText('Small observations');
 await page.locator('.cm-content').fill('# Retained browser draft');
 await writeFile(join(vault,'Notes','Field notes.md'),'# Saved outside the browser\n');
 await page.getByRole('button',{name:'Save note',exact:true}).click();
 await expect(page.getByRole('button',{name:'Save draft copy'})).toBeVisible();
 await page.locator('.cm-content').fill('# Retained browser draft\nContinued after conflict');
 await page.getByRole('button',{name:'Save draft copy'}).click();
 await expect(page.locator('.cm-content')).toContainText('Continued after conflict');
 expect(await readFile(join(vault,'Notes','Field notes.md'),'utf8')).toBe('# Saved outside the browser\n');
 await page.getByLabel('Search notes and filenames').fill('reading');
 await expect(page.getByRole('navigation',{name:'Vault files'})).toContainText('Reading room.md');
 await page.getByRole('button',{name:'Clear search'}).click();
 await openFile(page,'Reading room.md');
 await page.getByRole('button',{name:'Preview view'}).click();
 await mkdir(resolve('.private/screenshots'),{recursive:true});
 await page.screenshot({path:resolve('.private/screenshots/workspace-desktop.png')});
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.setViewportSize({width:390,height:844});
 await expect(page.locator('.sidebar')).toBeHidden();
 await expect(page.getByRole('button',{name:'Open files',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:resolve('.private/screenshots/workspace-sidebar.png')});
 await openFile(page,'Unsafe.md');
 await page.getByRole('button',{name:'Preview view'}).click();
 await expect(page.locator('.markdown-preview script')).toHaveCount(0);
 await expect(page.locator('.markdown-preview img[src^="https:"]')).toHaveCount(0);
 await expect(page.locator('.markdown-preview [onerror]')).toHaveCount(0);
 expect(errors).toEqual([]);
});
test('PDF and image editors save transformed copies without changing originals',async({page})=>{
 await connect(page);await openFile(page,'reading-guide.pdf');
 await expect(page.getByText('Page 1 of 3',{exact:true})).toBeVisible();
 const original=await readFile(join(vault,'Attachments','reading-guide.pdf'));
 await expect.poll(()=>page.locator('canvas').evaluate((c:HTMLCanvasElement)=>c.width)).toBeGreaterThan(10);
 await page.getByRole('button',{name:/Rotate page/}).click();
 await page.getByRole('button',{name:'Save copy to vault'}).click();
 await expect.poll(async()=>{try{return (await PDFDocument.load(await readFile(join(vault,'Attachments','reading-guide annotated.pdf')))).getPage(0).getRotation().angle;}catch{return 0;}}).toBe(90);
 expect(await readFile(join(vault,'Attachments','reading-guide.pdf'))).toEqual(original);
 await expect(page.getByText('Page ready',{exact:true})).toBeAttached();
 await expect(page.getByText('Page 1 of 3',{exact:true})).toBeVisible();
 await page.screenshot({path:resolve('.private/screenshots/pdf-editor.png')});
 await openFile(page,'landscape.png');
 await expect(page.getByText('Source: 960 × 640 px')).toBeVisible();
 await page.getByRole('group',{name:'Output size'}).getByLabel('Width',{exact:true}).fill('480');
 await page.getByRole('group',{name:'Output size'}).getByLabel('Height',{exact:true}).fill('320');
 await page.getByRole('button',{name:'Save copy to vault'}).click();
 await expect.poll(async()=>{try{return (await readFile(join(vault,'Attachments','landscape edited.png'))).readUInt32BE(16);}catch{return 0;}}).toBe(480);
 expect((await readFile(join(vault,'Attachments','landscape.png'))).readUInt32BE(16)).toBe(960);
 await page.screenshot({path:resolve('.private/screenshots/image-editor.png')});
});
test('paired MV3 package opens full workspace and sidebar route',async()=>{
 test.setTimeout(90000);
 const profile=join(root,'chromium-profile');
 const context:BrowserContext=await chromium.launchPersistentContext(profile,{headless:false,channel:'chromium',ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});
 try {
  const browserSession=await context.browser()!.newBrowserCDPSession();
  const installed=await browserSession.send('Extensions.loadUnpacked',{path:resolve('dist')});
  expect(installed.id).toBe(extensionId);
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  expect(worker.url()).toContain(extensionId);
  // The native first-use permission prompt is checked manually; CI starts from a paired session.
  await worker.evaluate(async connection => { await chrome.storage.session.set({'vaultlink.connection':connection}); }, {url:base,token});
  const page=await context.newPage();await page.goto(`chrome-extension://${extensionId}/index.html`);
  await expect(page.getByRole('navigation',{name:'Vault files'})).toBeAttached();
  await openFile(page,'Reading room.md');await expect(page.locator('.cm-content')).toContainText('Reading room');
  await page.getByRole('button',{name:'Open sidebar',exact:true}).click();
  await expect.poll(()=>worker.evaluate(async()=> (await chrome.runtime.getContexts({contextTypes:[chrome.runtime.ContextType.SIDE_PANEL]})).length)).toBe(1);
  await page.goto(`chrome-extension://${extensionId}/index.html?panel=1`);
  await expect(page.getByRole('button',{name:'Open full page'})).toBeVisible();
  const panel=await worker.evaluate(()=>chrome.sidePanel.getOptions({}));
  expect(panel.path).toBe('index.html?panel=1');
 } finally {await context.close();}
});

async function holdWrite(page:Page,predicate:(url:string,body:string)=>boolean){
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 let arrived!:()=>void;const pending=new Promise<void>(resolve=>{arrived=resolve;});
 await page.route('**/api/**',async route=>{const request=route.request();if(['PUT','POST'].includes(request.method())&&predicate(request.url(),request.postData()||'')){arrived();await gate;}await route.continue();});
 return {pending,release,clear:()=>page.unroute('**/api/**')};
}
test('delayed saves preserve newer note edits and session recovery',async({page})=>{
 await writeFile(join(vault,'Race.md'),'# Original\n');await connect(page);await openFile(page,'Race.md');
 const editor=page.locator('.cm-content');await editor.fill('# First write');
 let hold=await holdWrite(page,url=>url.includes('path=Race.md'));
 await page.getByRole('button',{name:'Save note',exact:true}).click();await hold.pending;await editor.fill('# Later typing');hold.release();
 await expect.poll(()=>readFile(join(vault,'Race.md'),'utf8')).toBe('# First write');await expect(editor).toContainText('Later typing');await expect(page.getByRole('button',{name:'Save note',exact:true})).toBeEnabled();await hold.clear();
 await page.getByRole('button',{name:'Save note',exact:true}).click();await expect.poll(()=>readFile(join(vault,'Race.md'),'utf8')).toBe('# Later typing');
 hold=await holdWrite(page,(_url,body)=>JSON.parse(body).revision===null);
 await page.getByRole('button',{name:'Daily note',exact:true}).click();await hold.pending;await editor.fill('# Typed during creation');hold.release();
 await expect(page.getByRole('status')).toContainText('Newer work remains open');await expect(page.locator('.document-header h1')).toHaveText('Race');await expect(editor).toContainText('Typed during creation');await hold.clear();
 page.on('dialog',dialog=>dialog.accept());await expect.poll(()=>page.evaluate(()=>Object.keys(sessionStorage).some(k=>k.startsWith('vaultlink:draft:')))).toBe(true);await page.reload();await openFile(page,'Race.md');await expect(editor).toContainText('Typed during creation');
 await writeFile(join(vault,'Race.md'),'# External version\n');await page.getByRole('button',{name:'Save note',exact:true}).click();await expect(page.getByRole('button',{name:'Save draft copy'})).toBeVisible();
 hold=await holdWrite(page,(_url,body)=>JSON.parse(body).revision===null);await page.getByRole('button',{name:'Save draft copy'}).click();await hold.pending;await editor.fill('# Typed during draft-copy save');hold.release();
 await expect(page.getByRole('status')).toContainText('Newer work remains open');await expect(editor).toContainText('Typed during draft-copy save');expect(await readFile(join(vault,'Race.md'),'utf8')).toBe('# External version\n');await hold.clear();
});
test('attachment controls lock during writes and late completion keeps the current note',async({page})=>{
 await connect(page);await openFile(page,'Ideas.canvas');await page.getByRole('button',{name:/Start with a question/}).click();await page.getByLabel('Text card').fill('Canvas edit persisted');
 let hold=await holdWrite(page,url=>url.includes('Ideas.canvas'));await page.getByRole('button',{name:'Save text changes'}).click();await hold.pending;await expect(page.getByLabel('Text card')).toBeDisabled();hold.release();await expect(page.getByText('Text changes saved.',{exact:true})).toBeVisible();await hold.clear();expect(JSON.parse(await readFile(join(vault,'Notes','Ideas.canvas'),'utf8')).nodes[0].text).toBe('Canvas edit persisted');
 await openFile(page,'landscape.png');await expect(page.getByText('Source: 960 × 640 px')).toBeVisible();await page.getByLabel('Copy path').fill('Attachments/race-copy.png');await page.getByRole('button',{name:'Flip horizontal'}).click();
 hold=await holdWrite(page,url=>url.includes('race-copy.png'));await page.getByRole('button',{name:'Save copy to vault'}).click();await hold.pending;await expect(page.getByRole('button',{name:'Flip horizontal'})).toBeDisabled();await expect(page.getByRole('group',{name:'Output size'}).getByLabel('Width',{exact:true})).toBeDisabled();
 page.on('dialog',dialog=>dialog.accept());await openFile(page,'Reading room.md');await page.locator('.cm-content').fill('# Keep this newer note draft');hold.release();await expect.poll(()=>readFile(join(vault,'Attachments','race-copy.png')).then(b=>b.length).catch(()=>0)).toBeGreaterThan(100);await expect(page.locator('.cm-content')).toContainText('Keep this newer note draft');await hold.clear();
});
test('session drafts cannot cross vaults served at the same URL with the same token',async({page})=>{
 const first=join(root,'First vault'),second=join(root,'Second vault');await mkdir(first);await mkdir(second);await writeFile(join(first,'Same.md'),'# Same base');await writeFile(join(second,'Same.md'),'# Same base');
 let service=await createBridge({vault:first,token,port:0,staticDir:resolve('dist')});const port=(service.address() as AddressInfo).port;const endpoint=`http://127.0.0.1:${port}`;
 try{
  await connect(page,endpoint,endpoint);await openFile(page,'Same.md');await page.locator('.cm-content').fill('# Belongs to first vault');await expect.poll(()=>page.evaluate(()=>Object.keys(sessionStorage).some(k=>k.startsWith('vaultlink:draft:')))).toBe(true);
  service.closeAllConnections();await new Promise<void>(resolve=>service.close(()=>resolve()));service=await createBridge({vault:second,token,port,staticDir:resolve('dist')});
  page.on('dialog',dialog=>dialog.accept());await page.reload();await openFile(page,'Same.md');await expect(page.locator('.cm-content')).toHaveText('# Same base');
 }finally{service.closeAllConnections();await new Promise<void>(resolve=>service.close(()=>resolve()));}
});
