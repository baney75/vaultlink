import { useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import type { VaultAPI, VaultEntry } from '../lib/types';

interface Props { content: string; path: string; entries: VaultEntry[]; api: VaultAPI; onOpen: (path: string) => void }

function escapeHtml(value: string) { return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char); }

function resolveRelative(base: string, target: string): string | null {
  const parts = target.startsWith('/') ? [] : base.split('/').slice(0, -1);
  for (const segment of target.replace(/^\//, '').split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') { if (!parts.length) return null; parts.pop(); }
    else parts.push(segment);
  }
  return parts.join('/');
}

function resolveVaultPath(base: string, target: string, entries: VaultEntry[]): string | null {
  const decoded = (() => { try { return decodeURIComponent(target); } catch { return target; } })().split('#')[0];
  const raw = decoded.replace(/^\//, '');
  const paths = new Set(entries.filter(entry => entry.kind === 'file').map(entry => entry.path));
  if (paths.has(raw)) return raw;
  const relative = resolveRelative(base, decoded);
  if (relative && paths.has(relative)) return relative;
  const basename = raw.split('/').at(-1);
  const matches = entries.filter(entry => entry.kind === 'file' && entry.name === basename);
  if (matches.length === 1) return matches[0].path;
  return relative;
}

function frontmatter(input: string): string {
  const match = input.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!match) return input;
  const rows = match[1].split('\n').filter(line => /^[\w -]+:\s*.*$/.test(line)).map(line => {
    const colon = line.indexOf(':');
    return `<tr><th>${escapeHtml(line.slice(0, colon).trim())}</th><td>${escapeHtml(line.slice(colon + 1).trim())}</td></tr>`;
  }).join('');
  return `${rows ? `<div class="frontmatter"><table>${rows}</table></div>\n\n` : ''}${input.slice(match[0].length)}`;
}

function obsidianSyntax(input: string): string {
  return frontmatter(input).split(/(```[\s\S]*?```|`[^`\n]+`)/g).map((part, index) => {
    if (index % 2) return part;
    return part.replace(/!\[([^\]\n]*)\]\(([^)\n]+)\)/g, (_match, alt: string, raw: string) => {
      const target = raw.trim().replace(/\s+["'][^"']*["']$/, '');
      if (/^(https?:|data:|blob:|\/\/)/i.test(target)) return `<span class="blocked-image">Remote image blocked${alt ? `: ${escapeHtml(alt)}` : ''}</span>`;
      return `<span data-vault-image="${escapeHtml(target)}" data-vault-alt="${escapeHtml(alt)}"></span>`;
    }).replace(/(!?)\[\[([^\]\n]+)\]\]/g, (_match, embed: string, text: string) => {
      const [target, alias] = text.split('|');
      if (embed && /\.(png|jpe?g|webp|gif|avif)$/i.test(target.trim())) return `<span data-vault-image="${escapeHtml(target.trim())}"></span>`;
      if (embed) return `**Embedded file:** ${escapeHtml(target.trim())}`;
      return `<a data-vault-link="${escapeHtml(target.trim())}" href="#">${escapeHtml(alias?.trim() || target.trim())}</a>`;
    }).replace(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/gim, (_match, kind: string) => `> **${kind[0]}${kind.slice(1).toLowerCase()}** · `);
  }).join('');
}

export function MarkdownPreview({ content, path, entries, api, onOpen }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const html = marked.parse(obsidianSyntax(content), { gfm: true, breaks: false }) as string;
    root.innerHTML = DOMPurify.sanitize(html, { FORBID_TAGS: ['img', 'svg', 'math', 'iframe', 'object', 'embed', 'form', 'button', 'style', 'script', 'video', 'audio', 'picture', 'source', 'track'], FORBID_ATTR: ['style', 'src', 'srcset', 'background', 'poster'], ADD_ATTR: ['data-vault-link', 'data-vault-image', 'data-vault-alt'] });
    const urls: string[] = [];
    let active = true;
    for (const input of root.querySelectorAll<HTMLInputElement>('input')) {
      if (input.type !== 'checkbox') { input.remove(); continue; }
      input.disabled = true;
      input.removeAttribute('name');
    }
    for (const item of root.querySelectorAll<HTMLElement>('[data-vault-image]')) {
      const rawPath = item.dataset.vaultImage ?? '';
      const resolved = resolveVaultPath(path, rawPath, entries);
      if (!resolved) { item.textContent = 'Invalid image path'; continue; }
      item.className = 'image-loading'; item.textContent = `Loading ${rawPath}…`;
      void api.file(resolved).then(({ blob }) => {
        if (!active) return;
        if (!blob.type.startsWith('image/') || blob.type === 'image/svg+xml') { item.textContent = `Preview unavailable: ${rawPath}`; return; }
        const url = URL.createObjectURL(blob); urls.push(url);
        const img = document.createElement('img'); img.src = url; img.alt = item.dataset.vaultAlt || rawPath; img.loading = 'lazy';
        item.replaceWith(img);
      }).catch(() => { if (active) item.textContent = `Image unavailable: ${rawPath}`; });
    }
    for (const link of root.querySelectorAll<HTMLAnchorElement>('a')) {
      if (link.dataset.vaultLink) continue;
      const raw = link.getAttribute('href') ?? '';
      if (/^https?:\/\//i.test(raw)) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
      else if (/^(mailto:|#)/i.test(raw)) { /* kept local */ }
      else { try { link.dataset.vaultLink = decodeURIComponent(raw); } catch { link.removeAttribute('href'); } }
    }
    return () => { active = false; urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [content, path, api, entries]);

  function handleClick(event: React.MouseEvent<HTMLDivElement>) {
    const anchor = (event.target as Element).closest<HTMLAnchorElement>('a[data-vault-link]');
    if (!anchor) return;
    event.preventDefault();
    const target = anchor.dataset.vaultLink ?? '';
    const resolved = resolveVaultPath(path, /\.[^/]+$/.test(target) ? target : `${target}.md`, entries);
    if (resolved) onOpen(resolved);
  }

  return <div className="markdown-preview" ref={ref} onClick={handleClick} aria-label="Note preview" />;
}
