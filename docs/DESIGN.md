# VaultLink design

VaultLink is a quiet shell around the user's own files. The brand appears in the outer shell: the Connect screen, the sidebar, the workspace chrome, and the toolbar icon. It does not style the contents of the Native Obsidian view.

Tagline: **Your vault, beside the web.**

## Mark

The mark is a V made of two leaves that meet at a single hinge point. The left leaf (vellum) stands for the vault; the right leaf (mint) stands for the web page it sits beside. A thin keyline separates them at the hinge: the two surfaces are connected without merging. The mark does not use a chain.

Geometry, on a 64-unit grid:

| Part | Shape | Color |
| --- | --- | --- |
| Tile | Rounded square, 64 × 64, corner radius 15 | `#133A32` |
| Web leaf | Round-capped stroke, width 9, from (45, 18) to (32, 46) | `#7DC9A5` |
| Keyline | Round-capped stroke, width 13, on the vault leaf's path, in the tile color | `#133A32` |
| Vault leaf | Round-capped stroke, width 9, from (19, 18) to (32, 46) | `#F3F0E4` |

The leaves span 14.5–49.5 horizontally and 13.5–50.5 vertically, so the V sits centered on the tile. The keyline is drawn over the web leaf, so the web leaf ends just short of the hinge.

Sources, kept in sync by hand:

- `public/brand.svg`: the standalone file.
- `src/components/Brand.tsx`: the inline React component. It uses the same paths and makes no network requests.
- `scripts/icons.mjs`: rasterizes the same geometry into `public/icons/icon-{16,32,48,128}.png` with 8 × 8 supersampling. Its only output is `public/icons`. Small sizes get slight optical thickening (×1.12 at 16 px, ×1.05 at 32 px) while the keyline gap stays fixed. The 128 px icon has an 8 px transparent margin.

The mark's colors are fixed. They do not follow page tokens or vault themes.

## Brand component

```tsx
import { Brand, BrandMark, BRAND_TAGLINE } from './components/Brand';

<Brand size={32} tagline="Personal workspace" />  // lockup: mark + wordmark (+ optional line)
<BrandMark size={16} />                          // decorative mark, hidden from assistive tech
<BrandMark size={44} title="VaultLink" />        // standalone mark with an accessible name
```

| Prop | Applies to | Default | Meaning |
| --- | --- | --- | --- |
| `size` | both | 32 | Mark size in CSS pixels. The wordmark scales with it (name ≈ 0.58 × size). |
| `tagline` | `Brand` | none | Optional second line. Use `BRAND_TAGLINE` or a short context label. |
| `title` | `BrandMark` | none | Accessible name. Omit it when visible text already says VaultLink. |
| `className` | both | none | Added after `vl-brand` / `vl-mark`. |

The wordmark is "VaultLink" as one word in the display serif, weight 600, with a single color.

## Color

Tokens live on `:root` in `src/styles.css` with the `--vl-` prefix. Sibling stylesheets, such as `native.css`, may use them.

| Token | Value | Use |
| --- | --- | --- |
| `--vl-paper` | `#f7f6f1` | Page background (warm ivory) |
| `--vl-surface` | `#fff` | Cards, editor, top bar |
| `--vl-sidebar` | `#f2f3ed` | Sidebar |
| `--vl-ink` | `#17302a` | Headings, strong labels |
| `--vl-text` | `#2b3b35` | Body |
| `--vl-text-2` | `#4c5d55` | Secondary text |
| `--vl-text-3` | `#5f6f66` | Tertiary text, at least 4.5:1 on `--vl-sidebar` |
| `--vl-icon` | `#6f8078` | Non-text glyphs, at least 3:1 |
| `--vl-brand` | `#1a5e52` | Primary actions, eyebrows, links (about 7.6:1 with white) |
| `--vl-brand-hover` | `#134a40` | Hover |
| `--vl-brand-tint` | `#e3efe8` | Selected and soft actions; disabled primary |
| `--vl-focus` | `#1f7a68` | Focus ring (about 5:1 on white) |
| `--vl-danger` / `--vl-warn` / `--vl-ok` | | Each with `-bg` and `-line` variants for notices |

The shell is light only (`color-scheme: light`). There is no dark shell yet, because the attachment editors hard-code light colors.

## Type

Only local system fonts. Nothing is fetched.

- UI: `system-ui, -apple-system, "Segoe UI", Roboto, …`, at 12.5–14 px in the shell.
- Display (wordmark, page titles, rendered headings): `"Iowan Old Style", Charter, "Bitstream Charter", "Sitka Text", Cambria, Georgia, serif`, weight 600, tracking −0.015 to −0.022 em.
- Mono (source editor, code): `ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas`.
- Eyebrows and section labels are uppercase, 10.5 px, tracking 0.12–0.14 em. Counts and dates use tabular figures.
- No shell text is smaller than 10.5 px.

## Accessibility

- Every focusable element gets a visible 2 px `--vl-focus` outline through a zero-specificity `:where()` rule, so component rules can still refine it. Rows inside scrolling lists use an inset outline (`outline-offset: -2px`) so the scroll container doesn't clip it.
- A selected file shows a 2 px inset bar in addition to its color change.
- Inputs show the focus ring on their wrapper (`:focus-within`).
- The disabled primary button (for example, "Saved") switches to the tint style instead of fading.
- `prefers-reduced-motion` turns off transitions and the save spinner. `forced-colors` adds outlines to selected states and buttons.
- The external setup link announces that it opens in a new tab.

## Layout

- The full page uses a 268 px sidebar, then 236 px at 900 px wide. At 650 px and below, the sidebar becomes a drawer: `min(300px, 86vw)`.
- The side panel (320–390 px) gets tighter padding on the Connect card, document header and preview. The Connect page aligns to the top so the form stays above the fold.
- Spacing steps are about 4 px. Radii are 6, 8 and 14 px.

## Connect screen

The screen is a single primary path: companion address, access token, and **Connect to vault**. The setup reality is stated plainly: the companion needs a computer that holds the vault, Node.js, and must keep running. It links to the [quick start](https://github.com/baney75/vaultlink#quick-start) instead of showing a command.

If the app passes `onOpenNative`, a secondary panel offers **Open Native Obsidian**. It explains that the view shows the user's own Obsidian desktop over a private Tailscale address, keeps that host's theme and installed plugins, and that these don't copy over from other devices. It makes no promise that every plugin works in a stream.

## Native Obsidian keeps its own theme

VaultLink's own tools (Markdown, PDF, image, Canvas) edit files through the authenticated companion. They don't emulate Obsidian themes or plugins.

The Native Obsidian view embeds the user's real Obsidian runtime, and that runtime is authoritative for everything inside its frame. The rules:

- VaultLink styles only the chrome around the frame (top bar, back control, connection cards). `native.css` may use `--vl-` tokens there.
- No VaultLink styles, fonts, or scripts are injected into the embedded runtime. Its CSS snippets, theme, and plugins render as configured on that host.
- The frame background is neutral, so the theme's own colors define the content area.

## Design collaboration

The VaultLink mark, palette, typography, responsive workspace styling, and connection screen were developed with Claude Opus 5.5. Runtime theme rendering remains entirely under the connected Obsidian installation’s control.
