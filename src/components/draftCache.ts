import type { Connection } from '../lib/types';

export interface DraftRecord { draft: string; savedContent: string; revision: string }
const pending = new Map<string, Promise<unknown>>();

async function key(connection: Connection, vaultId: string, path: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${connection.url}\0${connection.token}\0${vaultId}\0${path}`);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return `vaultlink:draft:${Array.from(new Uint8Array(hash)).map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

function ordered<T>(connection: Connection, vaultId: string, path: string, run: (storageKey: string) => Promise<T>): Promise<T> {
  const identity = `${connection.url}\0${connection.token}\0${vaultId}\0${path}`;
  const previous = pending.get(identity) ?? Promise.resolve();
  const operation = previous.catch(() => {}).then(async () => run(await key(connection, vaultId, path)));
  pending.set(identity, operation);
  void operation.finally(() => { if (pending.get(identity) === operation) pending.delete(identity); }).catch(() => {});
  return operation;
}

export async function loadDraft(connection: Connection, vaultId: string, path: string): Promise<DraftRecord | null> {
  return ordered(connection, vaultId, path, async storageKey => {
    const raw = typeof chrome !== 'undefined' && chrome.storage?.session
      ? (await chrome.storage.session.get(storageKey))[storageKey] as DraftRecord | undefined
      : JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') as DraftRecord | null;
    return raw && typeof raw.draft === 'string' && typeof raw.savedContent === 'string' && typeof raw.revision === 'string' ? raw : null;
  });
}

export async function storeDraft(connection: Connection, vaultId: string, path: string, record: DraftRecord): Promise<void> {
  return ordered(connection, vaultId, path, async storageKey => {
    if (typeof chrome !== 'undefined' && chrome.storage?.session) await chrome.storage.session.set({ [storageKey]: record });
    else sessionStorage.setItem(storageKey, JSON.stringify(record));
  });
}

export async function clearDraft(connection: Connection, vaultId: string, path: string): Promise<void> {
  return ordered(connection, vaultId, path, async storageKey => {
    if (typeof chrome !== 'undefined' && chrome.storage?.session) await chrome.storage.session.remove(storageKey);
    else sessionStorage.removeItem(storageKey);
  });
}
