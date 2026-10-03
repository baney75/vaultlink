import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, timingSafeEqual, randomBytes } from 'node:crypto';
import { promises as fs, constants } from 'node:fs';
import path from 'node:path';

const NOTE_EXTENSIONS = new Set(['.md', '.txt', '.json', '.canvas', '.csv']);
const FILE_TYPES: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.heic': 'application/octet-stream',
  '.pdf': 'application/pdf', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4',
  '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.mp4': 'video/mp4',
  '.mov': 'video/quicktime', '.webm': 'video/webm',
};
const NOTE_MAX = 2 * 1024 * 1024;
const FILE_MAX = 40 * 1024 * 1024;
const TREE_MAX = 10_000;
const SEARCH_MAX_BYTES = 20 * 1024 * 1024;
const SEARCH_MAX_HITS = 100;

export interface BridgeOptions {
  vault: string;
  token: string;
  port?: number;
  host?: string;
  allowOrigins?: string[];
  publicUrl?: string;
  staticDir?: string;
}

class BridgeError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

const fail = (status: number, code: string, message: string): never => { throw new BridgeError(status, code, message); };
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const tokenMatch = (provided: string | undefined, expected: string) => {
  if (!provided?.startsWith('Bearer ')) return false;
  const actual = Buffer.from(provided.slice(7));
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
};

function validRelative(input: string | null): string {
  if (!input || input.length > 1024 || input.includes('\\') || input.startsWith('/') || input.includes('\0'))
    return fail(403, 'path_restricted', 'Use a relative vault path.');
  const parts = input.split('/');
  if (parts.some(p => !p || p === '.' || p === '..' || p.startsWith('.') || p.includes(':') || /[\x00-\x1f\x7f]/.test(p)))
    return fail(403, 'path_restricted', 'Dot, empty, and control path components are restricted.');
  return parts.join('/');
}

function checkExtension(relative: string, kind: 'note' | 'file') {
  const ext = path.extname(relative).toLowerCase();
  if (!(kind === 'note' ? NOTE_EXTENSIONS.has(ext) : Object.hasOwn(FILE_TYPES, ext)))
    fail(403, 'type_restricted', `Unsupported ${kind} extension.`);
  return ext;
}

async function safePath(vault: string, relative: string, mayCreate = false): Promise<string> {
  const parts = relative.split('/');
  let current = vault;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    let stat;
    try { stat = await fs.lstat(current); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' && mayCreate && i === parts.length - 1) return current;
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') fail(404, 'missing', 'Path does not exist.');
      throw error;
    }
    if (stat.isSymbolicLink() || (i < parts.length - 1 && !stat.isDirectory()) ||
        (i === parts.length - 1 && (!stat.isFile() || stat.nlink !== 1)))
      fail(403, 'path_restricted', 'Symlinks, hardlinks, and special files are restricted.');
  }
  return current;
}

async function readSafe(vault: string, relative: string, limit: number): Promise<Buffer> {
  const target = await safePath(vault, relative);
  const handle = await fs.open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1) fail(403, 'path_restricted', 'Special files and hardlinks are restricted.');
    if (stat.size > limit) fail(413, 'too_large', 'File exceeds the supported size.');
    const bytes = await handle.readFile();
    if (bytes.length > limit) fail(413, 'too_large', 'File exceeds the supported size.');
    return bytes;
  } finally { await handle.close(); }
}

async function body(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > limit) { req.resume(); fail(413, 'too_large', 'Request body exceeds the supported size.'); }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

async function walk(vault: string): Promise<Array<{ path: string; name: string; kind: 'file' | 'folder'; extension: string; size: number; modified: number }>> {
  const entries: Array<{ path: string; name: string; kind: 'file' | 'folder'; extension: string; size: number; modified: number }> = [];
  async function visit(relative: string): Promise<void> {
    const directory = relative ? path.join(vault, relative) : vault;
    for (const item of await fs.readdir(directory, { withFileTypes: true })) {
      if (++count > TREE_MAX) fail(413, 'tree_limit', 'Vault exceeds the tree entry limit.');
      if (item.name.startsWith('.')) continue;
      const name = relative ? `${relative}/${item.name}` : item.name;
      const stat = await fs.lstat(path.join(vault, name));
      if (stat.isSymbolicLink() || (!stat.isDirectory() && (!stat.isFile() || stat.nlink !== 1))) continue;
      const kind = stat.isDirectory() ? 'folder' : 'file';
      entries.push({ path: name, name: item.name, kind, extension: kind === 'folder' ? '' : path.extname(item.name).slice(1).toLowerCase(), size: kind === 'folder' ? 0 : stat.size, modified: stat.mtimeMs });
      if (kind === 'folder') await visit(name);
    }
  }
  let count = 0;
  await visit('');
  return entries;
}

// This queue serializes requests within one bridge process. The revision is rechecked
// immediately before replacement to catch ordinary edits made by other programs.
const queues = new Map<string, Promise<unknown>>();
async function serialized<T>(key: string, action: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(action);
  queues.set(key, result);
  try { return await result; }
  finally { if (queues.get(key) === result) queues.delete(key); }
}

async function durableTemp(target: string, bytes: Buffer): Promise<string> {
  const temporary = path.join(path.dirname(target), `.vaultlink-${randomBytes(12).toString('hex')}.tmp`);
  const handle = await fs.open(temporary, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); }
  finally { await handle.close(); }
  return temporary;
}

async function syncDirectory(directory: string) {
  const handle = await fs.open(directory, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

async function createOnly(vault: string, relative: string, bytes: Buffer) {
  const target = await safePath(vault, relative, true);
  let temporary: string | undefined;
  try {
    temporary = await durableTemp(target, bytes);
    await fs.link(temporary, target); // atomic, fails if target appeared
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') fail(409, 'conflict', 'File already exists.');
    throw error;
  } finally { if (temporary) await fs.rm(temporary, { force: true }); }
}

async function replaceNote(vault: string, relative: string, content: Buffer, revision: string) {
  const target = await safePath(vault, relative);
  const old = await readSafe(vault, relative, NOTE_MAX);
  if (digest(old) !== revision) fail(409, 'conflict', 'Note changed since it was read. Reload before saving.');
  // Sibling directory stays outside the exposed tree, with private permissions.
  const backupDir = path.join(path.dirname(vault), `.${path.basename(vault)}-vaultlink-backups`);
  await fs.mkdir(backupDir, { recursive: true, mode: 0o700 });
  const backupStat = await fs.lstat(backupDir);
  if (!backupStat.isDirectory() || backupStat.isSymbolicLink()) fail(403, 'backup_restricted', 'Backup directory is unsafe.');
  if ((backupStat.mode & 0o077) !== 0) fail(403, 'backup_restricted', 'Backup directory must be private (mode 700).');
  const backupName = `${Date.now()}-${digest(Buffer.from(relative)).slice(0, 12)}-${path.basename(relative).slice(0, 60)}-${randomBytes(8).toString('hex')}.bak`;
  const backup = path.join(backupDir, backupName);
  const backupHandle = await fs.open(backup, 'wx', 0o600);
  try { await backupHandle.writeFile(old); await backupHandle.sync(); }
  finally { await backupHandle.close(); }
  await syncDirectory(backupDir);
  let temporary: string | undefined;
  try {
    temporary = await durableTemp(target, content);
    await safePath(vault, relative);
    if (digest(await readSafe(vault, relative, NOTE_MAX)) !== revision)
      fail(409, 'conflict', 'Note changed during save. Reload before saving.');
    await fs.rename(temporary, target);
    temporary = undefined;
    await syncDirectory(path.dirname(target));
  } finally { if (temporary) await fs.rm(temporary, { force: true }); }
}

function originAllowed(origin: string, allowed: Set<string>): boolean { return allowed.has(origin); }

/**
 * Starts a loopback HTTP bridge; callers own closing the returned server.
 * The vault and its parent are assumed to be controlled by the local owner.
 * Node's path-based filesystem API cannot make revision comparison and rename
 * one atomic operation against a different local process editing the same file.
 */
export async function createBridge(options: BridgeOptions): Promise<http.Server> {
  if (!path.isAbsolute(options.vault)) throw new Error('Vault path must be absolute.');
  const vault = await fs.realpath(options.vault);
  const vaultStat = await fs.stat(vault);
  if (!vaultStat.isDirectory()) throw new Error('Vault path must be a directory.');
  const vaultId = digest(Buffer.from(`${vault}\0${vaultStat.dev}\0${vaultStat.ino}`));
  if (!options.token || options.token.length < 32) throw new Error('Pairing token must be at least 32 characters.');
  const host = options.host ?? '127.0.0.1';
  if (host !== '127.0.0.1' && host !== '::1') throw new Error('Bridge must bind to loopback.');
  const port = options.port ?? 27124;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port.');
  const allowedOrigins = new Set<string>();
  for (const origin of options.allowOrigins ?? []) {
    const parsed = new URL(origin);
    const extension = /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
    if (!(extension || (parsed.origin === origin && ['http:', 'https:'].includes(parsed.protocol)))) throw new Error(`Invalid origin: ${origin}`);
    allowedOrigins.add(origin);
  }
  let publicAuthority: string | undefined;
  if (options.publicUrl) {
    const parsed = new URL(options.publicUrl);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash)
      throw new Error('Public URL must be an HTTPS origin.');
    publicAuthority = parsed.host.toLowerCase();
    allowedOrigins.add(parsed.origin);
  }
  let staticDir: string | undefined;
  if (options.staticDir) {
    staticDir = await fs.realpath(options.staticDir);
    if (!(await fs.stat(staticDir)).isDirectory()) throw new Error('Web directory must be a directory.');
    await fs.access(path.join(staticDir, 'index.html'));
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const actualPort = (server.address() as { port: number }).port;
      const authorities = new Set([`127.0.0.1:${actualPort}`, `localhost:${actualPort}`, `[::1]:${actualPort}`]);
      if (publicAuthority) authorities.add(publicAuthority);
      if (!req.headers.host || !authorities.has(req.headers.host.toLowerCase())) fail(403, 'host_restricted', 'Host is not allowed.');
      const origin = req.headers.origin;
      if (origin && !originAllowed(origin, allowedOrigins)) fail(403, 'origin_restricted', 'Origin is not allowed.');
      if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Access-Control-Expose-Headers', 'ETag'); res.setHeader('Vary', 'Origin'); }
      const rawPath = (req.url ?? '/').split('?', 1)[0];
      if (/%2e|%2f|%5c/i.test(rawPath) || rawPath.includes('\\') || rawPath.split('/').some(part => part === '.' || part === '..'))
        fail(403, 'path_restricted', 'Encoded or dot URL paths are restricted.');
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.searchParams.has('token')) fail(400, 'invalid_input', 'Credentials are not accepted in URLs.');
      if (staticDir && req.method === 'GET' && !url.pathname.startsWith('/api/')) {
        const requested = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
        const relative = validRelative(requested);
        const target = await safePath(staticDir, relative);
        const bytes = await readSafe(staticDir, relative, FILE_MAX);
        const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json' };
        const ext = path.extname(target).toLowerCase();
        if (!Object.hasOwn(mime, ext)) fail(403, 'type_restricted', 'Static file type is restricted.');
        res.writeHead(200, { 'Content-Type': mime[ext], 'Content-Length': bytes.length,
          'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self' http://127.0.0.1:* http://localhost:* https://*.ts.net:*; frame-src http://127.0.0.1:* http://localhost:* http://[::1]:* https://*.ts.net:*; object-src 'none'; base-uri 'self'; frame-ancestors 'none'" });
        return res.end(bytes);
      }
      if (req.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
        if (!origin || !['GET', 'PUT', 'POST'].includes(req.headers['access-control-request-method'] ?? ''))
          fail(403, 'origin_restricted', 'Invalid preflight request.');
        const headers = (req.headers['access-control-request-headers'] ?? '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
        if (headers.some(h => !['authorization', 'content-type'].includes(h))) fail(403, 'origin_restricted', 'Preflight header is not allowed.');
        res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, PUT, POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600' });
        return res.end();
      }
      if (!url.pathname.startsWith('/api/')) fail(404, 'not_found', 'Route does not exist.');
      if (!tokenMatch(req.headers.authorization, options.token)) fail(401, 'unauthorized', 'Pairing token required.');
      if (req.method === 'GET' && url.pathname === '/api/info') return json(res, 200, { id: vaultId, name: path.basename(vault), protocol: 1, capabilities: ['tree', 'note', 'file', 'search', 'upload'] });
      if (req.method === 'GET' && url.pathname === '/api/tree') return json(res, 200, { entries: await walk(vault) });
      if (req.method === 'GET' && url.pathname === '/api/note') {
        const relative = validRelative(url.searchParams.get('path'));
        checkExtension(relative, 'note');
        const bytes = await readSafe(vault, relative, NOTE_MAX);
        const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        return json(res, 200, { path: relative, content, revision: digest(bytes) });
      }
      if (req.method === 'PUT' && url.pathname === '/api/note') {
        const relative = validRelative(url.searchParams.get('path'));
        checkExtension(relative, 'note');
        if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) fail(400, 'invalid_input', 'Expected JSON content type.');
        const bytes = await body(req, NOTE_MAX + 1024);
        let parsed: unknown;
        try { parsed = JSON.parse(bytes.toString('utf8')); } catch { fail(400, 'invalid_input', 'Invalid JSON body.'); }
        if (!parsed || typeof parsed !== 'object' || typeof (parsed as { content?: unknown }).content !== 'string' ||
            !('revision' in parsed) || ((parsed as { revision?: unknown }).revision !== null &&
            !(typeof (parsed as { revision?: unknown }).revision === 'string' && /^[a-f0-9]{64}$/.test((parsed as { revision: string }).revision))))
          fail(400, 'invalid_input', 'Expected content and SHA-256 revision or null.');
        const { content, revision } = parsed as { content: string; revision: string | null };
        const data = Buffer.from(content, 'utf8');
        if (data.length > NOTE_MAX) fail(413, 'too_large', 'Note exceeds 2 MiB.');
        await serialized(vault, async () => {
          if (revision === null) await createOnly(vault, relative, data);
          else await replaceNote(vault, relative, data, revision);
        });
        return json(res, 200, { path: relative, content, revision: digest(data) });
      }
      if (req.method === 'GET' && url.pathname === '/api/file') {
        const relative = validRelative(url.searchParams.get('path'));
        const extension = checkExtension(relative, 'file');
        const bytes = await readSafe(vault, relative, FILE_MAX);
        res.writeHead(200, { 'Content-Type': FILE_TYPES[extension], 'Content-Length': bytes.length, ETag: `"${digest(bytes)}"`, 'Content-Disposition': `attachment; filename="${encodeURIComponent(path.basename(relative))}"` });
        return res.end(bytes);
      }
      if (req.method === 'POST' && url.pathname === '/api/file') {
        const relative = validRelative(url.searchParams.get('path'));
        checkExtension(relative, 'file');
        const data = await body(req, FILE_MAX);
        await serialized(vault, () => createOnly(vault, relative, data));
        return json(res, 200, { path: relative, revision: digest(data) });
      }
      if (req.method === 'GET' && url.pathname === '/api/search') {
        const query = url.searchParams.get('q');
        if (query === null || query.length === 0 || query.length > 200) return fail(400, 'invalid_input', 'Search query must be 1 to 200 characters.');
        const needle = query.toLocaleLowerCase();
        const entries = await walk(vault);
        const hits: Array<{ path: string; line: number; text: string }> = [];
        let scanned = 0;
        for (const entry of entries) {
          if (entry.kind !== 'file' || !NOTE_EXTENSIONS.has(path.extname(entry.path).toLowerCase())) continue;
          if (entry.size > NOTE_MAX) fail(413, 'search_limit', 'A note exceeds the search size limit.');
          scanned += entry.size;
          if (scanned > SEARCH_MAX_BYTES) fail(413, 'search_limit', 'Vault exceeds the search byte limit.');
          const content = new TextDecoder('utf-8', { fatal: true }).decode(await readSafe(vault, entry.path, NOTE_MAX));
          for (const [index, line] of content.split(/\r?\n/).entries()) {
            if (line.toLocaleLowerCase().includes(needle)) {
              if (hits.length === SEARCH_MAX_HITS) fail(413, 'search_limit', 'Search exceeds 100 hits; narrow the query.');
              if (line.length > 500) fail(413, 'search_limit', 'A matching line exceeds the search text limit.');
              hits.push({ path: entry.path, line: index + 1, text: line });
            }
          }
        }
        return json(res, 200, { hits });
      }
      fail(404, 'not_found', 'Route does not exist.');
    } catch (error) {
      if (res.headersSent) return res.destroy(error as Error);
      if (error instanceof BridgeError) return json(res, error.status, { error: error.message, code: error.code });
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return json(res, 404, { error: 'Path does not exist.', code: 'missing' });
      if (error instanceof TypeError || error instanceof URIError) return json(res, 400, { error: 'Invalid request.', code: 'invalid_input' });
      if (error instanceof Error && /encoded data was not valid/.test(error.message)) return json(res, 400, { error: 'File is not valid UTF-8.', code: 'invalid_input' });
      console.error('VaultLink bridge request failed:', error);
      json(res, 500, { error: 'Internal server error.', code: 'internal_error' });
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => { server.off('error', reject); resolve(); });
  });
  const actualPort = (server.address() as { port: number }).port;
  allowedOrigins.add(`http://127.0.0.1:${actualPort}`);
  allowedOrigins.add(`http://localhost:${actualPort}`);
  allowedOrigins.add(`http://[::1]:${actualPort}`);
  return server;
}
