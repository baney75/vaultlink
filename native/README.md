# Native Obsidian in a private browser session

This mode streams the **real Linux Obsidian desktop** through LinuxServer's Selkies container. It is separate from VaultLink's file editor. Obsidian reads the mounted vault at `/vault`, including its `.obsidian` folder, so vault themes and community plugins can load in the native app. Some plugins depend on platform-specific binaries, external programs, or desktop integrations and may need separate setup or may not work in this Linux container.

The container's browser session is effectively a remote desktop. [LinuxServer's security guide](https://docs.linuxserver.io/selkies/user-guide/security/) warns that an unprotected session can control a powerful environment. Keep the published Docker port on loopback, require the desktop password, restrict the Tailscale ACL to your own approved source identities, and never use Tailscale Funnel for this service.

## Before starting

Use a Linux host with Docker Compose and Tailscale signed in. The [LinuxServer Obsidian image](https://docs.linuxserver.io/images/docker-obsidian/) supports x86-64 and arm64. Have the exact vault directory on that host, plus a separate persistent directory for `/config`. Ensure both are writable by the numeric user and group in `.env`. Back up the vault before connecting a new Obsidian installation. Close other editors that may write to the same unsynced vault while you check the first native session.

From this `native` directory:

```sh
cp .env.example .env
chmod 600 .env
id -u
id -g
```

Fill `.env` with the absolute `VAULT_PATH` and `CONFIG_PATH`, matching `PUID` and `PGID`, a login name, and a strong random `OBSIDIAN_PASSWORD`. The example pins the multi-platform image used for the release verification. Its amd64 build was tested; ARM64 is published upstream but was not tested here. Review a newer digest deliberately when updating. Compose refuses to start until the remaining required values are supplied. The filled `.env` is ignored by Git.

Validate the paths, image reference, and Compose expansion before starting:

```sh
docker compose --env-file .env config --quiet
docker compose --env-file .env up -d
docker compose --env-file .env ps
```

The container's HTTP port 3000 maps only to `127.0.0.1:27125` on the host. It must sit behind HTTPS; do not browse port 27125 directly. After restricting your tailnet ACL so only your approved identities/devices can reach this host's port 8444, start the private HTTPS route on the host:

```sh
tailscale serve --bg --https=8444 http://127.0.0.1:27125
tailscale serve status
```

Open the printed `https://...ts.net:8444` address on an authorized device and sign in with `OBSIDIAN_USER` and `OBSIDIAN_PASSWORD`. In Obsidian choose **Open folder as vault** and select `/vault`. Verify a note and a theme or plugin you actually use; a successful login alone does not prove plugin compatibility or sync behavior. Then choose **Open Native Obsidian** in VaultLink and paste that same private desktop address. In an existing Tools workspace, the monitor button opens Native Obsidian. You can keep it in the sidebar, expand VaultLink to a full tab, or open the desktop directly. If a browser does not show the desktop sign-in prompt inside the frame, sign in at the direct address first, then return. The companion pairing token belongs to the separate Tools mode.

At narrow sidebar widths, collapse Obsidian’s own file explorer to give the note room. The expand button opens a full VaultLink tab.

One native desktop has one primary controlling browser client. Opening it in another tab or sidebar can disconnect the previous view; the Obsidian process and its notes continue running. The browser may ask for clipboard access; deny it if you do not need clipboard integration.

`HARDEN_DESKTOP=true` disables the bundled terminal and sudo shortcuts and some Selkies file operations, as documented in the [Selkies hardening guide](https://docs.linuxserver.io/selkies/user-guide/security/). It reduces access from the browser session but does not turn a desktop container into a sandbox for untrusted users. Do not add `privileged`, a Docker socket mount, or a public port mapping.

To stop access, run `tailscale serve --https=8444 off`, then `docker compose --env-file .env down` from this directory. The mounted vault and config directories remain on disk. Review them before deletion.
