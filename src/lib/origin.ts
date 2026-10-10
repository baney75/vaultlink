// Origin rules shared by the web app, the extension, companion setup and the extension build.
// Keep this file free of imports so Node scripts can load it without a bundler.

declare const __VAULTLINK_CUSTOM_ORIGIN__: string | undefined;

/** Parse the one optional custom HTTPS origin. Returns the exact origin or throws. */
export function parseCustomOrigin(input: string): string {
  const text = input.trim();
  if (text.includes('*')) throw new Error('Wildcards are not allowed. Name one exact HTTPS origin.');
  let url: URL;
  try { url = new URL(text); } catch { throw new Error('Enter a complete address, such as https://vault.example.com.'); }
  if (url.protocol !== 'https:') throw new Error('A custom origin must use HTTPS.');
  if (url.username || url.password || url.search || url.hash || text.endsWith('?') || text.endsWith('#') || (url.pathname !== '/' && url.pathname !== ''))
    throw new Error('Use only the origin, without a path, password, query, or fragment.');
  const host = url.hostname;
  if (host.startsWith('[') || /^[\d.]+$/.test(host) || !host.includes('.') || host.endsWith('.'))
    throw new Error('Use a DNS hostname such as vault.example.com, not an IP address or a bare name.');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal'))
    throw new Error('Use a public or tunnel hostname, not a local name.');
  return url.origin;
}

export function isLoopbackHttp(url: URL): boolean {
  return url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
}

export function isTailnetHttps(url: URL): boolean {
  return url.protocol === 'https:' && url.hostname.endsWith('.ts.net') && url.hostname.split('.').length >= 4;
}

/** The custom origin baked in at build time (VAULTLINK_CUSTOM_ORIGIN), if any. */
export function buildCustomOrigin(): string | undefined {
  const value = typeof __VAULTLINK_CUSTOM_ORIGIN__ === 'string' ? __VAULTLINK_CUSTOM_ORIGIN__ : '';
  return value || undefined;
}

/**
 * The custom origin this page may talk to: the build-time origin, or, for the web app
 * served by the companion itself, the HTTPS origin that delivered the page. Talking to the
 * origin that served the code adds no exposure; the companion still enforces Host and token.
 */
export function activeCustomOrigin(): string | undefined {
  const built = buildCustomOrigin();
  if (built) return built;
  try {
    if (typeof location !== 'undefined' && location.protocol === 'https:') return parseCustomOrigin(location.origin);
  } catch { /* Not a valid custom origin; ignore. */ }
  return undefined;
}
