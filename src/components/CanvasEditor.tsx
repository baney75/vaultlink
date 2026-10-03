import { useEffect, useMemo, useState } from 'react';
import type { AttachmentProps, NoteDocument } from '../lib/types';

type CanvasNode = { id: string; type: string; x: number; y: number; width: number; height: number; text?: string; file?: string; url?: string; color?: string };
type CanvasEdge = { id: string; fromNode: string; toNode: string };
type CanvasData = { nodes: CanvasNode[]; edges: CanvasEdge[]; [key: string]: unknown };
const MAX_CANVAS_CHARS = 2_000_000;

function parseCanvas(content: string): CanvasData {
  if (content.length > MAX_CANVAS_CHARS) throw new Error('Canvas is too large to preview.');
  const value: unknown = JSON.parse(content);
  if (!value || typeof value !== 'object' || !('nodes' in value) || !Array.isArray(value.nodes)) throw new Error('This file is not a JSON Canvas document.');
  const data = value as CanvasData;
  if (data.nodes.length > 500 || (Array.isArray(data.edges) && data.edges.length > 1000)) throw new Error('Canvas has too many items to preview.');
  data.edges = Array.isArray(data.edges) ? data.edges : [];
  for (const node of data.nodes) {
    if (!node || typeof node !== 'object' || typeof node.id !== 'string' || !['text', 'file', 'link', 'group'].includes(node.type) || ![node.x, node.y, node.width, node.height].every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 100_000) || node.width <= 0 || node.height <= 0 || (node.text !== undefined && typeof node.text !== 'string') || (node.file !== undefined && typeof node.file !== 'string') || (node.url !== undefined && typeof node.url !== 'string')) throw new Error('Canvas contains an unsupported node.');
  }
  if (data.nodes.length) {
    const minX = Math.min(...data.nodes.map(n => n.x)); const minY = Math.min(...data.nodes.map(n => n.y));
    const maxX = Math.max(...data.nodes.map(n => n.x + n.width)); const maxY = Math.max(...data.nodes.map(n => n.y + n.height));
    if (maxX - minX > 10_000 || maxY - minY > 10_000) throw new Error('Canvas is too large to preview.');
  }
  for (const edge of data.edges) if (!edge || typeof edge !== 'object' || typeof edge.id !== 'string' || typeof edge.fromNode !== 'string' || typeof edge.toNode !== 'string') throw new Error('Canvas contains an unsupported edge.');
  return data;
}

export default function CanvasEditor({ path, api, onDirtyChange }: AttachmentProps) {
  const [document, setDocument] = useState<NoteDocument>();
  const [data, setData] = useState<CanvasData>();
  const [selected, setSelected] = useState<string>();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    setDocument(undefined); setData(undefined); setSelected(undefined); setDrafts({}); setError('');
    api.read(path).then(result => { if (active) { setDocument(result); setData(parseCanvas(result.content)); } }).catch(e => { if (active) setError(e instanceof Error ? e.message : String(e)); });
    return () => { active = false; };
  }, [api, path]);

  const bounds = useMemo(() => {
    if (!data?.nodes.length) return { x: 0, y: 0, width: 600, height: 300 };
    const minX = Math.min(...data.nodes.map(n => n.x)); const minY = Math.min(...data.nodes.map(n => n.y));
    const maxX = Math.max(...data.nodes.map(n => n.x + n.width)); const maxY = Math.max(...data.nodes.map(n => n.y + n.height));
    return { x: minX - 24, y: minY - 24, width: maxX - minX + 48, height: maxY - minY + 48 };
  }, [data]);
  const nodeMap = useMemo(() => new Map(data?.nodes.map(node => [node.id, node]) || []), [data]);
  const selectedNode = selected ? nodeMap.get(selected) : undefined;
  const hasChanges = !!data?.nodes.some(node => node.type === 'text' && drafts[node.id] !== undefined && drafts[node.id] !== node.text);

  function select(node: CanvasNode) { if (busy) return; setSelected(node.id); setMessage(''); }
  async function save() {
    if (!document || !data || !hasChanges || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const updated = { ...data, nodes: data.nodes.map(node => node.type === 'text' && drafts[node.id] !== undefined ? { ...node, text: drafts[node.id] } : node) };
      const content = JSON.stringify(updated, null, 2);
      const saved = await api.save(path, content, document.revision);
      setDocument(saved); setData(updated); setDrafts({}); onDirtyChange?.(false); setMessage('Text changes saved.');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  return <section className="attachment-workspace" aria-label="Canvas preview" aria-busy={busy}>
    <p className="attachment-hint">Visual preview. Select a text card to edit its text. Files and links are labels only; they do not open here.</p>
    {data && <div className="attachment-canvas-scroll"><div className="attachment-canvas-map" style={{ width: bounds.width, height: bounds.height }}>
      <svg className="attachment-canvas-edges" width={bounds.width} height={bounds.height} aria-hidden="true">
        {data.edges.map(edge => { const from = nodeMap.get(edge.fromNode); const to = nodeMap.get(edge.toNode); return from && to && <line key={edge.id} x1={from.x + from.width / 2 - bounds.x} y1={from.y + from.height / 2 - bounds.y} x2={to.x + to.width / 2 - bounds.x} y2={to.y + to.height / 2 - bounds.y} />; })}
      </svg>
      {data.nodes.map(node => <button type="button" key={node.id} disabled={busy} className={`attachment-canvas-node ${selected === node.id ? 'selected' : ''}`} style={{ left: node.x - bounds.x, top: node.y - bounds.y, width: node.width, height: node.height }} onClick={() => select(node)}>
        <small>{node.type === 'text' ? 'Text' : node.type === 'file' ? 'File' : node.type === 'link' ? 'Link' : 'Group'}</small>
        <span>{node.type === 'text' ? (node.text || '(empty text)').slice(0, 1000) : node.type === 'file' ? (node.file || '(file)').slice(0, 1000) : node.type === 'link' ? (node.url || '(link)').slice(0, 1000) : 'Group'}</span>
      </button>)}
    </div></div>}
    {selectedNode?.type === 'text' && <div className="attachment-canvas-edit">
      <label htmlFor="canvas-text-edit">Text card</label>
      <textarea id="canvas-text-edit" value={drafts[selectedNode.id] ?? selectedNode.text ?? ''} maxLength={100_000} disabled={busy} onChange={e => { if (busy) return; const next = { ...drafts, [selectedNode.id]: e.target.value }; setDrafts(next); onDirtyChange?.(data?.nodes.some(node => node.type === 'text' && next[node.id] !== undefined && next[node.id] !== node.text) || false); }} rows={7} />
      <button type="button" disabled={busy || !hasChanges} onClick={() => void save()}>Save text changes</button>
    </div>}
    {!data && !error && <p role="status">Loading canvas…</p>}
    {error && <p role="alert" className="attachment-error">{error}</p>}{message && <p role="status">{message}</p>}
  </section>;
}
