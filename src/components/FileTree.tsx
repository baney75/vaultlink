import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileImage, FileJson, FileText, Folder, FolderOpen, LayoutDashboard, Search, X } from 'lucide-react';
import type { SearchHit, VaultEntry } from '../lib/types';

interface Props {
  entries: VaultEntry[];
  selected: string | null;
  query: string;
  hits: SearchHit[];
  searching: boolean;
  searchError: string | null;
  onQuery: (query: string) => void;
  onSelect: (path: string) => void;
}

function iconFor(entry: VaultEntry) {
  if (entry.extension === 'canvas') return <LayoutDashboard size={16} />;
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'].includes(entry.extension)) return <FileImage size={16} />;
  if (entry.extension === 'json') return <FileJson size={16} />;
  return <FileText size={16} />;
}

export function FileTree({ entries, selected, query, hits, searching, searchError, onQuery, onSelect }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const sorted = useMemo(() => [...entries].sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' })), [entries]);
  const children = useMemo(() => {
    const map = new Map<string, VaultEntry[]>();
    for (const entry of sorted) {
      const parent = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '';
      map.set(parent, [...(map.get(parent) ?? []), entry]);
    }
    for (const items of map.values()) items.sort((a, b) => Number(b.kind === 'folder') - Number(a.kind === 'folder') || a.name.localeCompare(b.name, undefined, { numeric: true }));
    return map;
  }, [sorted]);

  function renderFolder(parent: string, depth: number): React.ReactNode {
    return (children.get(parent) ?? []).map(entry => {
      if (entry.kind === 'folder') {
        const closed = collapsed.has(entry.path);
        return <div key={entry.path}>
          <button className="tree-row folder-row" style={{ paddingLeft: 14 + depth * 16 }} onClick={() => setCollapsed(previous => { const next = new Set(previous); if (next.has(entry.path)) next.delete(entry.path); else next.add(entry.path); return next; })} aria-expanded={!closed} title={entry.path}>
            {closed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}{closed ? <Folder size={16} /> : <FolderOpen size={16} />}<span>{entry.name}</span>
          </button>
          {!closed && renderFolder(entry.path, depth + 1)}
        </div>;
      }
      return <button key={entry.path} className={`tree-row file-row ${selected === entry.path ? 'selected' : ''}`} style={{ paddingLeft: 29 + depth * 16 }} onClick={() => onSelect(entry.path)} title={entry.path} aria-current={selected === entry.path ? 'page' : undefined}>
        {iconFor(entry)}<span>{entry.name}</span>
      </button>;
    });
  }

  const normalized = query.trim().toLowerCase();
  const filenames = normalized ? sorted.filter(entry => entry.kind === 'file' && entry.path.toLowerCase().includes(normalized)) : [];
  const hitPaths = new Set(filenames.map(entry => entry.path));
  const contentHits = hits.filter(hit => !hitPaths.has(hit.path));

  return <>
    <div className="tree-search input-with-icon"><Search size={16} aria-hidden="true" /><input aria-label="Search notes and filenames" type="search" placeholder="Search your vault" value={query} onChange={event => onQuery(event.target.value)} />{query && <button aria-label="Clear search" title="Clear search" onClick={() => onQuery('')}><X size={15} /></button>}</div>
    <div className="tree-section-label">{normalized ? 'SEARCH RESULTS' : 'FILES'}{!normalized && <span>{sorted.filter(entry => entry.kind === 'file').length}</span>}</div>
    <nav aria-label="Vault files" className="tree-scroll">
      {normalized ? <>
        {filenames.map(entry => <button key={entry.path} className={`search-result ${selected === entry.path ? 'selected' : ''}`} onClick={() => onSelect(entry.path)}><span className="search-result-title">{iconFor(entry)} {entry.name}</span><span className="search-result-path">{entry.path}</span></button>)}
        {contentHits.map((hit, index) => <button key={`${hit.path}:${hit.line}:${index}`} className="search-result" onClick={() => onSelect(hit.path)}><span className="search-result-title"><FileText size={15} /> {hit.path.split('/').pop()} <small>:{hit.line}</small></span><span className="search-result-snippet">{hit.text}</span></button>)}
        {searching && <p className="tree-message">Searching content…</p>}
        {searchError && <p className="tree-message error-text" role="alert">{searchError}</p>}
        {!searching && !searchError && filenames.length + contentHits.length === 0 && <p className="tree-message">No matching notes.</p>}
      </> : sorted.length ? renderFolder('', 0) : <p className="tree-message">No files yet. Create your first note.</p>}
    </nav>
  </>;
}
