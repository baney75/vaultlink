# Security boundaries

VaultLink exposes a selected local folder to holders of a pairing token. Run the companion as your ordinary user, bound to loopback. Reach it from other devices through Tailscale Serve and restrict those devices/users with your tailnet access rules. Do not publish the service through Funnel or an open internet reverse proxy.

## Optional custom HTTPS origin

Tailscale is the recommended path. If you already run a tunnel or reverse proxy (for example Cloudflare Tunnel), you may opt in to exactly one extra origin, named at setup. The rules are fixed in `src/lib/origin.ts` and unit-tested:

- HTTPS only. Plain HTTP is accepted only for loopback.
- One exact origin: a DNS hostname with an optional port. No wildcards, IP addresses, local names, paths, query, fragment, or credentials.
- The companion still binds to loopback, checks the Host header against that origin and the token on every API call. It adds no login of its own.
- The extension gets the origin only when you build it with `VAULTLINK_CUSTOM_ORIGIN`. The build adds that exact origin to `optional_host_permissions` and the extension-page CSP; the manifest never carries a broad host pattern, and Chromium asks you at connect time.
- The web app served from the companion may connect to the HTTPS origin that served it; this adds no new destination for the token.

A tunnel makes the token the only barrier unless you add access control at the proxy, for example Cloudflare Access. Do that. The proxy operator can see traffic you send through it. If you cannot accept that, use Tailscale or stay local.

## Read-only mode

Start the companion with `--read-only` (or answer yes at setup) to reject every write with 403 `read_only`. Read, search and download still work. It is a server-side switch, checked after authentication and before any request body is read. It does not stop a malicious local process from editing the vault files.

The token is a bearer credential, not a user account. It grants read/write access to the exposed file types throughout that vault unless the companion runs read-only. There are no per-folder permissions, audit identities, or multi-user administration in this release. Browser extension host permission is not authentication. Tailscale membership alone is not vault authorization.

The API requires authorization, validates the request Host and Origin, refuses path traversal, hides dot directories, and rejects symlinks. Note saves require matching revisions and create recovery copies before replacing bytes. Uploads create new files instead of overwriting attachments. The API never serves vault HTML as executable content. Markdown rendering strips active HTML and remote image requests; scripts and PDF workers ship in the extension.

The operating system, vault directory, and local user are trusted. A malicious local process with access to your vault or token can bypass this service. File revision checks cannot observe an unsaved editor buffer in Obsidian, prevent every external filesystem race, or replace backups. Avoid editing the same note simultaneously in separate applications. Do not share a vault directory with untrusted local writers.

The web UI and extension keep pairing credentials and recoverable note drafts in session storage. Disconnect clears the connection; ending the browser session clears session storage. An unlocked browser session can access an established connection. Attachment editing is in-memory until exported. No telemetry is included.

PDF text/highlight overlays are visible annotations. They do not remove content beneath them and must never be used for redaction. Image conversion can discard metadata, animation, and color-profile information. Downloaded files should be handled according to their actual file type.

## Native Obsidian view

Native mode embeds a separate, user-configured Obsidian desktop host. Its plugins execute with that desktop user’s filesystem and network access; VaultLink does not sandbox or audit those plugins. The companion token is never sent to this host. Only its normalized private origin is saved in local storage. Native desktop authentication and session lifetime belong to that host and browser, independently of the companion session.

The supplied container configuration binds HTTP to loopback, requires a desktop password, enables desktop hardening, and mounts only the selected vault and application configuration. Tailscale Serve supplies private HTTPS. Restrict tailnet access to trusted users and devices. Do not mount the Docker socket or broad host directories, enable privileged mode, or expose the desktop with Funnel. Desktop hardening removes convenience attack surfaces; it does not make untrusted plugins safe.

The native frame permits the scripts, forms, downloads, pointer input and clipboard/fullscreen features needed by the remote desktop. It cannot navigate the top-level VaultLink page. Server frame restrictions remain authoritative; open the native address directly when embedding is unavailable. Theme/plugin compatibility is the compatibility of the actual Obsidian host, including its operating system.

## Recovery and credential rotation

Stop the companion before changing credentials. Generate a new random token by removing its old token file and restarting the CLI, then reconnect trusted clients. Revocation takes effect when the running companion restarts with the new token. Remove an unused Tailscale Serve route separately.

Keep a regular vault backup independent of VaultLink's per-save recovery copies. The companion's hidden backup directory is not exposed over its API. To restore a note, stop conflicting editors and copy the chosen backup bytes into the intended note with your normal file tools.

## Reporting a vulnerability

Report a minimal reproduction without private notes or tokens through this repository's GitHub security reporting feature when available. Do not include working credentials in a public issue. There is no claim of a third-party certification or exhaustive security audit; review coverage is recorded in `docs/VERIFICATION.md`.
