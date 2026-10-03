import { normalizeEndpoint } from './api';

const STORAGE_KEY = 'vaultlink.native-origin';

export function normalizeNativeURL(input: string): string {
  try {
    if (/[?#]/.test(input.trim())) throw new Error('Address must be an origin.');
    return normalizeEndpoint(input);
  }
  catch { throw new Error('Enter only a private HTTPS *.ts.net origin, or an HTTP loopback origin for local development. Do not include a path, query, fragment, or credentials.'); }
}

function extensionStorage() {
  return typeof chrome !== 'undefined' && chrome.runtime?.id && chrome.storage?.local ? chrome.storage.local : null;
}

export async function loadNativeURL(): Promise<string | null> {
  const storage = extensionStorage();
  const raw: unknown = storage ? (await storage.get(STORAGE_KEY))[STORAGE_KEY] : localStorage.getItem(STORAGE_KEY);
  if (typeof raw !== 'string') return null;
  try { return normalizeNativeURL(raw); } catch { return null; }
}

export async function storeNativeURL(input: string): Promise<string> {
  const origin = normalizeNativeURL(input);
  const storage = extensionStorage();
  if (storage) await storage.set({ [STORAGE_KEY]: origin });
  else localStorage.setItem(STORAGE_KEY, origin);
  return origin;
}

export async function clearNativeURL(): Promise<void> {
  const storage = extensionStorage();
  if (storage) await storage.remove(STORAGE_KEY);
  else localStorage.removeItem(STORAGE_KEY);
}
