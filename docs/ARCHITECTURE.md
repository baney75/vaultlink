# Architecture

VaultLink has two local components: a bundled React workspace and a small Node HTTP companion. The Chromium MV3 package puts the workspace in `side_panel` and a full extension tab. The companion can also serve the same built workspace as a normal browser page. Both use the same vault-scoped API.

CodeMirror preserves Markdown source. Marked and DOMPurify produce a restricted reading view. Local attachments are fetched with authorization, then exposed only as short-lived blob URLs inside the UI. PDF.js renders bundled PDF data; pdf-lib writes new annotated PDFs. The image editor exports canvas pixels to a new attachment. Canvas support interprets the documented JSON Canvas structure without running embedded websites.

Every API call carries a bearer token. Tokens are kept in browser session storage, never a URL. A connection button requests an optional extension host grant for the specific companion origin. The default listener binds 127.0.0.1; Tailscale Serve provides the private HTTPS hop from another device.

The companion validates file paths and resource limits. Writes compare content hashes and preserve recovery bytes. API serialization prevents two VaultLink requests from accepting the same stale revision. A local external application remains outside that serialization boundary; the filesystem is not a multi-user transaction service.

## Native mode

A separate LinuxServer Obsidian desktop streams through a private HTTPS Tailscale origin. The extension embeds that desktop in a sandboxed frame. Obsidian reads the mounted vault and its `.obsidian` folder itself; VaultLink does not translate theme CSS, load plugin JavaScript in its own origin, or forward the companion token to the desktop. Native authentication is independent. Returning to Tools keeps the current draft mounted, and deactivates its save shortcut while native mode has focus.

The pinned image and loopback-only Compose recipe live in `native/`. Native mode requires a configured host; merely installing the extension does not make a desktop reachable. The host's operating system determines plugin compatibility. A single desktop session has one primary controlling client; opening another can disconnect the first while Obsidian keeps running.

## Primary implementation references

- [Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel): local sidebar page and user-gesture constraints.
- [Chrome permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions) and [network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests): optional per-host access.
- [MV3 security](https://developer.chrome.com/docs/extensions/develop/migrate/improve-security): bundle executable code and workers.
- [Firefox sidebar API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/sidebarAction): a separate implementation would be required.
- [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve): private reverse proxy and tailnet controls.
- [Obsidian file formats](https://obsidian.md/help/file-formats), [links](https://obsidian.md/help/links), and [JSON Canvas](https://jsoncanvas.org/spec/1.0/): preserve native files and link syntax.
- [LinuxServer Obsidian](https://docs.linuxserver.io/images/docker-obsidian/) and [Obsidian plugin manifests](https://docs.obsidian.md/Reference/Manifest): native desktop hosting and platform requirements.
- [PDF.js](https://mozilla.github.io/pdf.js/getting_started/) and [pdf-lib limitations](https://github.com/Hopding/pdf-lib#limitations): rendering versus page operations and annotations.

These references guide compatibility. Product support claims come from the implemented behavior and release checks, not from library capability alone.
