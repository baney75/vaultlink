# Release verification

Version 0.1.0 was checked on October 2–3, 2026 using synthetic vaults. No personal vault contents, credentials, machine addresses, or private test profiles are included in the repository.

## Automated checks

- TypeScript check and production MV3 build passed.
- Fourteen unit/integration tests passed: private endpoint validation, native address-only storage, PDF/image transformations, authentication, exact origins and hosts, path confinement, symlink/hardlink rejection, serialized conditional writes, case aliases, exclusive uploads, recovery bytes, and static serving.
- Seven browser scenarios passed: editing/preview/wiki navigation/search/conflicts; PDF and image copy output; a loaded, paired MV3 extension and actual sidebar context; delayed saves and recoverable drafts; attachment save races; vault identity isolation; and interactive native framing without forwarding the companion token.
- The MV3 automation seeds an already-paired session. Chrome's native first-use permission prompt was checked separately in a disposable browser profile. It is not asserted by the CI test.
- The extracted companion kit served its UI and authenticated API from an unrelated working directory with Node alone. Unauthenticated API access returned 401.
- The production npm dependency audit reported zero advisories at the time of this check. This is not an audit of the native container's OS packages.

## Live checks

The actual Chromium extension opened a full workspace and native browser sidebar. A note edited in the sidebar was read back from the synthetic vault. Rendered desktop and 390 px layouts, PDF pages and image output were inspected; screenshots show only generated sample material.

The companion was reached over real Tailscale HTTPS. A second Linux computer saved and read back a note through that private route. An unauthenticated request returned 401.

A separate amd64 Linux container ran the pinned LinuxServer Obsidian image. Its browser endpoint returned 401 without credentials and 200 with the configured desktop credentials. Through Tailscale, a visible fixture theme loaded from `.obsidian`, and a fixture plugin's command created a note that was read back from the host filesystem. The real native desktop also rendered inside the MV3 extension's sandboxed frame and actual browser sidebar. A line typed through that native sidebar was saved and read back from the host. This demonstrates native theme and plugin execution for the fixture, not compatibility with every community plugin.

## Independent adversarial review

A reviewer separate from the writers challenged authentication, filesystem paths, races, token handling, release packaging, private native origins, framing, and container configuration. The final bounded security review passed. Another reviewer found and then approved fixes for attachment edits during saves, late navigation after asynchronous creation, and draft reuse across different vaults at one address. The corresponding browser regressions passed.

These are bounded agent reviews, not a third-party security certification. The release commit contains the reviewed source; future changes need their own checks.

## Limits

Firefox and Safari extensions, the Windows companion, ARM64 native hosting, arbitrary community plugins, deployment-specific Tailscale ACLs, and long-running multi-device sync were not verified. Native plugins retain their own permissions and operating-system requirements. VaultLink Tools has its own editor/theme and does not run those plugins. PDF overlays are not redaction or replacement of existing text. Concurrent unsaved buffers in other applications remain outside file revision checks.
