import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { Columns2, Eye, List, Pencil, Search, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { SearchHit, VaultAPI, VaultEntry } from '../lib/types';
import { MarkdownPreview } from './MarkdownPreview';

interface Props { path: string; content: string; onChange: (content: string) => void; entries: VaultEntry[]; api: VaultAPI; onOpen: (path: string) => void }
type Mode = 'write' | 'split' | 'preview';

export function NoteEditor({ path, content, onChange, entries, api, onOpen }: Props) {
  const isMarkdown = path.toLowerCase().endsWith('.md');
  const [mode, setMode] = useState<Mode>('write');
  const [details, setDetails] = useState(false);
  const [mentions, setMentions] = useState<SearchHit[] | null>(null);
  const [mentionsError, setMentionsError] = useState<string | null>(null);
  const [findingMentions, setFindingMentions] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const actualMode = isMarkdown ? mode : 'write';
  const outline = useMemo(() => {
    const headings: { level: number; text: string }[] = [];
    let fenced = false;
    for (const line of content.split('\n')) {
      if (/^\s*```/.test(line)) { fenced = !fenced; continue; }
      if (fenced) continue;
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) headings.push({ level: match[1].length, text: match[2].replace(/\s+#+\s*$/, '').replace(/[*_`]/g, '') });
    }
    return headings;
  }, [content]);

  function jumpToHeading(index: number) {
    setMode('preview'); setDetails(false);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      previewRef.current?.querySelectorAll('h1,h2,h3,h4,h5,h6')[index]?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }));
  }

  async function findMentions() {
    setFindingMentions(true); setMentionsError(null);
    try {
      const title = path.split('/').at(-1)?.replace(/\.md$/i, '') ?? path;
      setMentions((await api.search(title)).filter(hit => hit.path !== path));
    } catch (error) { setMentionsError(error instanceof Error ? error.message : 'Could not search mentions.'); }
    finally { setFindingMentions(false); }
  }

  return <div className="note-editor">
    {isMarkdown && <div className="editor-mode" role="group" aria-label="Editor view">
      <button type="button" className={actualMode === 'write' ? 'active' : ''} onClick={() => setMode('write')} title="Write" aria-label="Write view"><Pencil size={16} /><span>Write</span></button>
      <button type="button" className={actualMode === 'split' ? 'active' : ''} onClick={() => setMode('split')} title="Split" aria-label="Split view"><Columns2 size={16} /><span>Split</span></button>
      <button type="button" className={actualMode === 'preview' ? 'active' : ''} onClick={() => setMode('preview')} title="Preview" aria-label="Preview view"><Eye size={16} /><span>Preview</span></button>
      <span className="editor-mode-separator" />
      <button type="button" className={details ? 'active' : ''} onClick={() => setDetails(!details)} title="Note details" aria-label="Note details" aria-expanded={details}><List size={16} /><span>Details</span></button>
    </div>}
    <div className={`editor-panes mode-${actualMode}`}>
      {actualMode !== 'preview' && <div className="source-pane" aria-label="Markdown source editor"><CodeMirror value={content} onChange={onChange} extensions={isMarkdown ? [markdown({ codeLanguages: languages })] : []} basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false }} placeholder={isMarkdown ? 'Start writing…' : 'Enter text…'} aria-label="Note content" /></div>}
      {actualMode !== 'write' && <div className="preview-pane" ref={previewRef}><MarkdownPreview content={content} path={path} entries={entries} api={api} onOpen={onOpen} /></div>}
    </div>
    {details && isMarkdown && <div className="note-details" role="region" aria-label="Note details"><div className="details-header"><strong>Note details</strong><button aria-label="Close note details" onClick={() => setDetails(false)}><X size={16} /></button></div><div className="details-scroll"><div className="details-label">OUTLINE</div>{outline.length ? outline.map((heading, index) => <button key={`${index}:${heading.text}`} className="outline-row" style={{ paddingLeft: 12 + (heading.level - 1) * 11 }} onClick={() => jumpToHeading(index)}>{heading.text}</button>) : <p className="details-empty">Add headings to see an outline.</p>}<div className="details-label mentions-label">MENTIONS</div><p className="details-caption">Find notes containing this note’s title.</p><button className="find-mentions" onClick={() => void findMentions()} disabled={findingMentions}><Search size={14} />{findingMentions ? 'Searching…' : mentions ? 'Search again' : 'Find mentions'}</button>{mentionsError && <p className="details-error" role="alert">{mentionsError}</p>}{mentions && (mentions.length ? mentions.map((hit, index) => <button key={`${hit.path}:${hit.line}:${index}`} className="mention-row" onClick={() => onOpen(hit.path)}><strong>{hit.path}</strong><span>Line {hit.line} · {hit.text}</span></button>) : <p className="details-empty">No mentions found.</p>)}</div></div>}
  </div>;
}
