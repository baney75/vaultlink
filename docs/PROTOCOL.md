# Bridge protocol v1
All /api routes require Authorization: Bearer <token>. Content is private; cache no-store.
- GET /api/info -> { id, name, protocol:1, capabilities:string[] }. id is an opaque SHA-256 of the canonical root identity (path/device/inode), used to isolate session drafts
- GET /api/tree -> { entries: VaultEntry[] }. Folders and files; exclude every dot component and symlink.
- GET /api/note?path=... -> { path, content, revision }. revision is SHA-256 hex of bytes. Plain editable UTF8: md, txt, json, canvas, csv.
- PUT /api/note?path=... JSON { content, revision:string|null } -> same. null creates only if absent, otherwise revision must equal current bytes. 409 conflict. Existing file safely backed up before atomic replacement. Max note 2MiB.
- GET /api/file?path=... -> bytes, ETag: quoted sha256. Max attachment 40MiB. Set safe MIME, no-sniff, no-store. Never execute HTML/SVG.
- POST /api/file?path=... body bytes -> { path, revision }, create only; 409 if exists. Allowed attachment extensions only. Max 40MiB.
- GET /api/search?q=... -> { hits: {path,line,text}[] } case-insensitive literal text, max 100 hits. Bounded tree/search; return explicit limit error rather than silent truncation.
Errors JSON { error:string, code:string }; 400 invalid input, 401 auth, 403 origin/path restrictions, 404 missing, 409 conflict, 413 oversized. All writes serialized by path. No tokens in query strings. No unauthenticated vault metadata.
Default bind 127.0.0.1:27124. Allowed origins exact loopback development URL (explicit --allow-origin), exact chrome-extension://id (explicit --allow-origin), configured private HTTPS origin. No wildcard CORS. Requests without Origin allowed only with bearer auth. Validate Host against loopback service authority and explicit --public-url hostname:port; never trust forwarded headers. Tailscale Serve terminates HTTPS and proxies loopback; service still requires token.
