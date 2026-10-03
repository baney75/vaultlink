import { useEffect, useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { getDocument, GlobalWorkerOptions, type PageViewport } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { AttachmentProps } from '../lib/types';
import { copyName, downloadBlob, transformPdf, validateCopyPath, type PdfChange } from '../lib/attachments';

GlobalWorkerOptions.workerSrc = workerUrl;

type Props = AttachmentProps & { blob: Blob };
type Tool = 'none' | 'text' | 'highlight';

export default function PdfEditor({ path, api, blob, onCreated, onDirtyChange }: Props) {
  const [bytes, setBytes] = useState<Uint8Array>();
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<Tool>('none');
  const [text, setText] = useState('');
  const [textSize, setTextSize] = useState(16);
  const [highlightWidth, setHighlightWidth] = useState(120);
  const [highlightHeight, setHighlightHeight] = useState(18);
  const [positionX, setPositionX] = useState(40);
  const [positionY, setPositionY] = useState(40);
  const [renderReady, setRenderReady] = useState(false);
  const [name, setName] = useState(copyName(path, 'annotated', 'pdf'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewport = useRef<PageViewport | null>(null);

  useEffect(() => {
    let active = true;
    setBytes(undefined);
    blob.arrayBuffer().then(data => { if (active) setBytes(new Uint8Array(data)); }).catch(e => { if (active) setError(String(e)); });
    return () => { active = false; };
  }, [blob]);

  useEffect(() => {
    if (!bytes) return;
    let active = true;
    setRenderReady(false);
    const task = getDocument({ data: bytes.slice(), useSystemFonts: true });
    task.promise.then(async pdf => {
      if (!active) return;
      setPages(pdf.numPages);
      const selected = Math.min(page, pdf.numPages - 1);
      if (selected !== page) setPage(selected);
      const pdfPage = await pdf.getPage(selected + 1);
      if (!active) return;
      const view = pdfPage.getViewport({ scale: zoom });
      if (view.width * view.height > 16_000_000) throw new Error('This zoom level is too large to render.');
      const target = canvas.current;
      if (!target) return;
      target.width = Math.ceil(view.width);
      target.height = Math.ceil(view.height);
      viewport.current = view;
      const context = target.getContext('2d');
      if (!context) throw new Error('Canvas is unavailable.');
      await pdfPage.render({ canvas: target, canvasContext: context, viewport: view }).promise;
      if (active) { setRenderReady(true); setError(''); }
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : String(e)); });
    return () => { active = false; viewport.current = null; void task.destroy(); };
  }, [bytes, page, zoom]);

  async function apply(change: PdfChange) {
    if (!bytes || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const output = await transformPdf(bytes, [change]);
      setBytes(output);
      if (change.type === 'delete') setPage(Math.max(0, Math.min(page, pages - 2)));
      onDirtyChange?.(true);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  function placeAt(x: number, y: number) {
    if (!bytes || busy || tool === 'none' || !renderReady) return;
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) { setError('Position must use nonnegative PDF coordinates.'); return; }
    if (tool === 'text') void apply({ type: 'text', page, x, y, text, size: textSize });
    else void apply({ type: 'highlight', page, x, y: y - highlightHeight / 2, width: highlightWidth, height: highlightHeight });
  }

  function annotate(event: React.MouseEvent<HTMLCanvasElement>) {
    if (!viewport.current || !renderReady) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const pixelX = (event.clientX - rect.left) * event.currentTarget.width / rect.width;
    const pixelY = (event.clientY - rect.top) * event.currentTarget.height / rect.height;
    const [x, y] = viewport.current.convertToPdfPoint(pixelX, pixelY);
    placeAt(x, y);
  }

  function outputBlob() { return new Blob(bytes ? [new Uint8Array(bytes)] : [], { type: 'application/pdf' }); }
  async function save() {
    if (!bytes || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const target = validateCopyPath(name, 'pdf');
      if (target === path) throw new Error('Choose a new filename to preserve the original.');
      await api.upload(target, outputBlob());
      onDirtyChange?.(false);
      onCreated(target);
      setMessage(`Saved copy: ${target}`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  return <section className="attachment-workspace" aria-label="PDF editor" aria-busy={busy}>
    <div className="attachment-toolbar">
      <button type="button" disabled={busy || page === 0} onClick={() => setPage(page - 1)}>Previous</button>
      <span aria-live="polite">{pages ? `Page ${page + 1} of ${pages}` : 'Loading PDF…'}</span>
      <button type="button" disabled={busy || page >= pages - 1} onClick={() => setPage(page + 1)}>Next</button>
      <label>Zoom <select value={zoom} disabled={busy} onChange={e => setZoom(Number(e.target.value))}><option value="0.75">75%</option><option value="1">100%</option><option value="1.5">150%</option><option value="2">200%</option></select></label>
      <button type="button" disabled={busy || !bytes} onClick={() => void apply({ type: 'rotate', page })}><RotateCw size={15} aria-hidden="true" /> Rotate page</button>
      <button type="button" disabled={busy || pages <= 1} onClick={() => void apply({ type: 'delete', page })}>Delete page</button>
    </div>
    <div className="attachment-toolbar" role="group" aria-label="PDF annotation tools">
      <label>Click tool <select value={tool} disabled={busy} onChange={e => setTool(e.target.value as Tool)}><option value="none">Pan / view</option><option value="text">Add text</option><option value="highlight">Add highlight</option></select></label>
      {tool === 'text' && <label>Text <input value={text} disabled={busy} maxLength={500} onChange={e => setText(e.target.value)} placeholder="Text to add" /></label>}
      {tool === 'text' && <label>Size <input type="number" disabled={busy} min="6" max="72" value={textSize} onChange={e => setTextSize(Number(e.target.value))} /></label>}
      {tool === 'highlight' && <><label>Width <input type="number" disabled={busy} min="1" max="2000" value={highlightWidth} onChange={e => setHighlightWidth(Number(e.target.value))} /></label><label>Height <input type="number" disabled={busy} min="1" max="2000" value={highlightHeight} onChange={e => setHighlightHeight(Number(e.target.value))} /></label></>}
      <span className="attachment-hint">Click the page to place {tool === 'none' ? 'an annotation after choosing a tool' : tool === 'text' ? 'new text' : 'a highlight'}.</span>
    </div>
    {tool !== 'none' && <div className="attachment-toolbar attachment-position" role="group" aria-label="Place annotation by coordinates">
      <span className="attachment-hint">Keyboard placement · PDF points from bottom left</span>
      <label>X <input type="number" min="0" disabled={busy} value={positionX} onChange={e => setPositionX(Number(e.target.value))} /></label>
      <label>Y <input type="number" min="0" disabled={busy} value={positionY} onChange={e => setPositionY(Number(e.target.value))} /></label>
      <button type="button" disabled={busy || !renderReady || (tool === 'text' && !text.trim())} onClick={() => placeAt(positionX, positionY)}>Place {tool}</button>
    </div>}
    <div className="attachment-pdf-scroll"><canvas ref={canvas} onClick={annotate} className={tool === 'none' ? '' : 'attachment-clickable'} style={{ visibility: renderReady ? 'visible' : 'hidden' }} aria-label="PDF page preview; use selected tool to annotate" />{!renderReady && <p role="status" className="attachment-render-status">Rendering page…</p>}</div>
    {renderReady && <p role="status" className="attachment-ready">Page ready</p>}
    <div className="attachment-toolbar attachment-savebar">
      <label>Copy path <input className="attachment-path" value={name} disabled={busy} onChange={e => setName(e.target.value)} /></label>
      <button type="button" disabled={busy || !bytes} onClick={() => void save()}>Save copy to vault</button>
      <button type="button" disabled={busy || !bytes} onClick={() => downloadBlob(outputBlob(), name.split('/').pop() || 'annotated.pdf')}>Download copy</button>
    </div>
    <p className="attachment-hint">Annotations add content to the page. Existing PDF text cannot be rewritten here. The original stays intact.</p>
    {error && <p role="alert" className="attachment-error">{error}</p>}{message && <p role="status">{message}</p>}
  </section>;
}
