import type { Connection, VaultAPI, VaultInfo, VaultEntry, NoteDocument, SearchHit } from './types';

export class ApiError extends Error {
  constructor(message: string, public status = 0, public code = 'NETWORK_ERROR') { super(message); this.name = 'ApiError'; }
}
export function normalizeEndpoint(input: string): string {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error('Enter a complete address, such as http://127.0.0.1:27124.'); }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) throw new Error('Use only the server address, without a path, password, query, or fragment.');
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  const tailnet = url.hostname.endsWith('.ts.net') && url.hostname.split('.').length >= 4;
  if (!(loopback && url.protocol === 'http:') && !(tailnet && url.protocol === 'https:')) throw new Error('Use local HTTP on localhost, or the private HTTPS .ts.net address from Tailscale Serve.');
  return url.origin;
}
function extensionStorage() { return typeof chrome !== 'undefined' && chrome.runtime?.id && chrome.storage?.session ? chrome.storage.session : null; }
export async function loadConnection(): Promise<Connection | null> {
  const storage = extensionStorage();
  const raw: unknown = storage ? (await storage.get('vaultlink.connection'))['vaultlink.connection'] : JSON.parse(sessionStorage.getItem('vaultlink.connection') || 'null');
  if (!raw || typeof raw !== 'object' || !('url' in raw) || !('token' in raw) || typeof raw.url !== 'string' || typeof raw.token !== 'string') return null;
  try { return {url:normalizeEndpoint(raw.url),token:raw.token}; } catch { return null; }
}
export async function storeConnection(connection: Connection): Promise<void> {
  const value = {url:normalizeEndpoint(connection.url), token:connection.token};
  const storage = extensionStorage();
  if (storage) await storage.set({'vaultlink.connection':value}); else sessionStorage.setItem('vaultlink.connection',JSON.stringify(value));
}
export async function clearConnection(): Promise<void> {
  const storage = extensionStorage();
  if (storage) await storage.remove('vaultlink.connection'); else sessionStorage.removeItem('vaultlink.connection');
}
export async function requestConnectionPermission(input: string): Promise<boolean> {
  const url = normalizeEndpoint(input);
  if (typeof chrome === 'undefined' || !chrome.runtime?.id || !chrome.permissions) return true;
  return chrome.permissions.request({origins:[`${url}/*`]});
}
export function createAPI(connection: Connection): VaultAPI {
  const base = normalizeEndpoint(connection.url);
  if (!connection.token.trim()) throw new Error('Enter the pairing token shown by your companion.');
  async function request(route: string, init: RequestInit = {}): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(`${base}/api/${route}`, {...init, redirect:'error', cache:'no-store', credentials:'omit', signal:AbortSignal.timeout(30000), headers:{...init.headers,Authorization:`Bearer ${connection.token}`}});
    } catch { throw new ApiError('Cannot reach your vault. Check that the companion is running and both devices are connected to Tailscale. Your unsaved text is still here.'); }
    if (!response.ok) {
      let message = `The companion returned ${response.status}.`, code = 'REQUEST_FAILED';
      try { const body: unknown = await response.json(); if(body && typeof body==='object') { if('error' in body && typeof body.error==='string') message=body.error; if('code' in body && typeof body.code==='string') code=body.code; } } catch { /* A proxy may return a non-JSON error. */ }
      throw new ApiError(message,response.status,code);
    }
    return response;
  }
  const pathQuery = (path: string) => `path=${encodeURIComponent(path)}`;
  return {
    async info() { const body = await (await request('info')).json() as VaultInfo; if(body.protocol!==1 || typeof body.id!=='string' || !/^[a-f0-9]{64}$/.test(body.id) || typeof body.name!=='string' || !Array.isArray(body.capabilities)) throw new ApiError('This companion version is not supported.',502,'PROTOCOL_MISMATCH'); return body; },
    async list() { const body = await (await request('tree')).json() as {entries:VaultEntry[]}; if(!Array.isArray(body.entries)) throw new ApiError('Invalid vault listing.',502); return body.entries; },
    async read(path) { return await (await request(`note?${pathQuery(path)}`)).json() as NoteDocument; },
    async save(path,content,revision) { return await (await request(`note?${pathQuery(path)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({content,revision})})).json() as NoteDocument; },
    async file(path) { const res = await request(`file?${pathQuery(path)}`); return {blob:await res.blob(),revision:(res.headers.get('ETag')||'').replace(/^"|"$/g,'')}; },
    async upload(path,data) { return await (await request(`file?${pathQuery(path)}`,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:data})).json() as {path:string;revision:string}; },
    async search(query) { return (await (await request(`search?q=${encodeURIComponent(query)}`)).json() as {hits:SearchHit[]}).hits; }
  };
}
