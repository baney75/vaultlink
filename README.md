# VaultLink

**Your Obsidian vault, beside the web.**

## Start in 3 steps

1. **Install Node.js 22.12 or newer** on the macOS or Linux computer that holds your vault, then download `vaultlink-<version>-companion.zip` from the [latest release](https://github.com/baney75/vaultlink/releases/latest) and extract the whole zip.
2. **Run `node setup.mjs`** in that folder. Enter your vault path. Press Enter at each remote question to keep it on this computer only. Setup prints an address and a pairing token.
3. **Open the address in your browser**, paste the token, and open a note. Keep the terminal open; Ctrl+C stops VaultLink.

Windows companion setup is not verified. No `npm install` is needed.

### Which remote option?

| Option | Use it when | Setup | Notes |
| --- | --- | --- | --- |
| **Tailscale Serve (recommended)** | You want your vault on your phone or another computer | Install Tailscale on both devices, run `tailscale serve`, give setup the `https://...ts.net` address | Private to your tailnet. Needs no extra browser permission setup and works with the prebuilt extension |
| **Custom HTTPS origin** | You already run a tunnel or reverse proxy, for example Cloudflare Tunnel, and will not use Tailscale | Give setup the one exact `https://` hostname. For the extension, build it with `VAULTLINK_CUSTOM_ORIGIN=https://your.host npm run build` | One origin only, HTTPS only, no wildcards. Your proxy must add its own access control. The pairing token is the only protection VaultLink adds. Never use a public, unauthenticated route |
| **Local only** | You only work on the computer that holds the vault | Press Enter at both remote questions | Companion listens on `127.0.0.1`. Nothing leaves the machine |

Add `Read-only` mode at the setup prompt (or run `npm run bridge -- --read-only ...`) to expose a vault for reading and searching only. The companion then rejects every write with 403 and the UI shows **Read-only**. This covers the companion API only. The optional native Obsidian view is a separate app with its own write access to the vault; VaultLink hides its button in read-only mode, and for a read-only native view you must also add `read_only: true` to the vault volume in `native/compose.yaml`.

> **Warning: native Obsidian mode is optional and works only with Linux plus Docker.** It streams a real Obsidian desktop from a container you run yourself. Skip it unless you need your Obsidian themes and plugins. The VaultLink workspace above does not need it.

---

VaultLink gives you two ways to work with the same ordinary vault files:

![VaultLink workspace with a sample vault](docs/images/workspace.png)

Built with TypeScript and Node.js.

| Choose | What opens | Best for |
| --- | --- | --- |
| **VaultLink workspace** | A focused browser editor and optional Chromium sidebar | Notes, search, Markdown preview, PDF markup, image copies, and quick work from another device |
| **Native Obsidian desktop** | The real Linux Obsidian app streamed into your browser | Vault themes and community plugins that work in that Linux environment |

The workspace has its own editor; it does **not** run Obsidian themes or plugins. The native desktop opens the vault's `.obsidian` settings, though plugins that need a particular operating system, external program, or device may behave differently. These are separate sessions and addresses.

[Download the latest release](https://github.com/baney75/vaultlink/releases/latest) · [Verification and limits](docs/VERIFICATION.md) · [Design](docs/DESIGN.md)

## Setup details

You need [Node.js 22.12 or newer](https://nodejs.org/) on the macOS or Linux computer that holds your vault. Windows companion setup has not been verified. From the [latest release](https://github.com/baney75/vaultlink/releases/latest), download `vaultlink-<version>-companion.zip`, extract the whole zip into a folder, and run:

```sh
node setup.mjs
```

Enter the path to your vault. Press Enter at the Tailscale question if you only need this computer. Setup starts a local companion and prints a browser address and pairing token. Open the address, enter both values in the connection screen, open a note, add a line, save, and reopen it to confirm the change. Keep the terminal open while using VaultLink; **Ctrl+C** stops it. The zip already contains the browser app and Node companion, so this path needs no `npm install`.

The pairing token is a password for the exposed vault. Setup keeps it in a private file under `~/.vaultlink`; keep it off shared screens and out of notes. The browser keeps it for the current session. A different local editor may still have unsaved changes that VaultLink cannot see, so save or close that editor before changing the same note here. VaultLink detects changes already saved to disk and offers conflict recovery.

### Add the Chromium sidebar

The full browser page works without an extension. For the sidebar, extract `vaultlink-<version>-chromium.zip` into its own folder. In Chrome open `chrome://extensions` (or `edge://extensions` in Edge), turn on **Developer mode**, choose **Load unpacked**, and select that extracted folder. Click the VaultLink icon, then connect with the same address and token. The extension can request access to that companion address; it has no page content scripts. Chromium 116+ and a working Side Panel API are required. Firefox and Safari packages are not included.

### Open the workspace on another device

Install and sign in to [Tailscale](https://tailscale.com/download) on the vault computer and the other device. Restrict your tailnet access rules to the devices or identities allowed to reach the vault computer. On the vault computer, while the companion runs:

```sh
tailscale serve --bg --https=8443 http://127.0.0.1:27124
tailscale serve status
```

Restart `node setup.mjs` and enter the private `https://...ts.net:8443` address printed by Serve. Open that address on the other device and enter the pairing token. The companion still listens only on loopback and still requires the token. Use Tailscale **Serve**, not Funnel. To remove the route, run `tailscale serve --https=8443 off`. See [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve) for HTTPS and access-rule prerequisites.

### Use a custom HTTPS origin instead of Tailscale

Only do this if you already operate a tunnel or reverse proxy. Forward HTTPS from one hostname to `http://127.0.0.1:27124`, and put your proxy's own authentication in front of it (for example Cloudflare Access). Run `node setup.mjs`, skip the Tailscale question, and enter the origin, such as `https://vault.example.com`. Setup accepts one DNS hostname over HTTPS, with no wildcard, path, credentials or IP address. The web app at that address works at once.

The Chromium extension is built for exactly one extra origin. Build from source with `VAULTLINK_CUSTOM_ORIGIN=https://vault.example.com npm run build`. The build adds that exact origin to `optional_host_permissions` and the page CSP, so the browser asks you for access when you connect and never holds it before. See [SECURITY.md](SECURITY.md) for the trade-offs.

## Use the native Obsidian desktop

> **Linux + Docker only, and optional.** There is no macOS or Windows path for this view.

This option runs LinuxServer's Obsidian container on a Linux host with Docker Compose and Tailscale. It uses a **different** HTTPS address and a desktop login password, not the VaultLink pairing token. The container sees only the vault folder and a separate persistent config folder. Follow the [native setup guide](native/README.md) and fill [the environment template](native/.env.example); the supplied [Compose file](native/compose.yaml) binds HTTP to `127.0.0.1:27125` for a private Tailscale HTTPS proxy on port 8444. It does not start or configure a service by itself.

After starting the container and private Serve route, open its `https://...ts.net:8444` address, sign in, and choose `/vault` in Obsidian. Confirm a note, theme, and plugin that matter to you. Close other writers to the same unsynced vault during this first check. Native plugin compatibility depends on the Linux environment and has not been established for every plugin.

![A vault theme and active plugin in Native Obsidian](docs/images/native-obsidian.png)

## What the VaultLink workspace supports

| File | Available tools |
| --- | --- |
| Markdown | Source editor, reading preview, split view, wiki links, local images, outline, and saved-file conflict handling |
| Text, JSON, CSV | Source editing with revision checks |
| PDF | Page viewing, text and highlight overlays, rotation, removal, and a new PDF copy |
| Browser-supported raster image | Crop, rotate, flip, resize, and export a new PNG or JPEG copy |
| Obsidian Canvas | View the canvas and edit supported text nodes |
| Audio and video | Playback when the browser supports the codec |

PDF tools do not rewrite existing PDF text or securely redact content. Image exports flatten layers and may discard metadata or animation. Attachment transformations save copies and preserve originals. Dataview queries, Bases, Excalidraw, and plugin views are not rendered as native Obsidian features in the workspace.

Existing note bytes are backed up outside the exposed vault tree before replacement. Hidden folders, including `.obsidian`, are not served by the workspace API. Keep normal vault backups and see [security boundaries](SECURITY.md) before connecting a sensitive vault.

## Build from source

For contributors, a source checkout uses npm:

```sh
npm ci
npm run check
npm run demo
```

The demo makes a synthetic vault under `.private/demo-vault`; open `http://127.0.0.1:27124` and use the sample token printed in the terminal. Re-running the demo resets those samples. `npm run setup` runs the source companion against a vault you choose after building. `npm run package` builds the browser app and produces both release zips plus `release/SHA256SUMS`. Browser tests use `npx playwright install chromium` followed by `npm run test:e2e`. The [protocol](docs/PROTOCOL.md) describes the local API.

VaultLink is independent of Obsidian and Tailscale. See [LICENSE](LICENSE) for licensing terms.
