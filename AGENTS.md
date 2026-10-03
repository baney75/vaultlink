# VaultLink
Local-first Chromium extension and Node companion for Obsidian-compatible vaults.
Use TypeScript. Run npm run check and npm run test:e2e for material changes.
Keep custom-tools runtime code bundled (MV3); no CDN scripts, remote fonts, analytics or content scripts. Native Obsidian is a separate explicit private remote-desktop frame, never code injected into the extension.
Treat every vault file as untrusted input. Never bypass path, authorization, or revision checks.
Write recoverably and refuse stale writes. Preserve original attachments when transforming them.
Use only synthetic fixture vaults in tests. Keep pairing credentials, real vault content and machine-specific addresses out of Git.
Parent owns package/lock/config/integration; delegated lanes own only assigned files. No worker pushes or commits.
