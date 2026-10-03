import { useEffect, useRef, useState } from 'react';
import type { AttachmentProps } from '../lib/types';
import { copyName, downloadBlob, validateCopyPath, validateCrop, validateImageSize, type Crop } from '../lib/attachments';

type Props = AttachmentProps & { blob: Blob };
type Format = 'png' | 'jpeg';

function renderImage(bitmap: ImageBitmap, crop: Crop, rotation: number, flipX: boolean, flipY: boolean, width: number, height: number, format: Format): HTMLCanvasElement {
  validateCrop(crop, bitmap.width, bitmap.height);
  validateImageSize(width, height);
  const quarter = rotation % 180 !== 0;
  const contentWidth = quarter ? crop.height : crop.width;
  const contentHeight = quarter ? crop.width : crop.height;
  const natural = document.createElement('canvas'); natural.width = contentWidth; natural.height = contentHeight;
  const nctx = natural.getContext('2d'); if (!nctx) throw new Error('Canvas is unavailable.');
  nctx.translate(contentWidth / 2, contentHeight / 2);
  nctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  nctx.rotate(rotation * Math.PI / 180);
  nctx.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, -crop.width / 2, -crop.height / 2, crop.width, crop.height);
  if (width === contentWidth && height === contentHeight && format === 'png') return natural;
  const output = document.createElement('canvas'); output.width = width; output.height = height;
  const context = output.getContext('2d'); if (!context) throw new Error('Canvas is unavailable.');
  if (format === 'jpeg') { context.fillStyle = '#fff'; context.fillRect(0, 0, width, height); }
  context.drawImage(natural, 0, 0, width, height);
  return output;
}

export default function ImageEditor({ path, api, blob, onCreated, onDirtyChange }: Props) {
  const [bitmap, setBitmap] = useState<ImageBitmap>();
  const [crop, setCrop] = useState<Crop>({ x: 0, y: 0, width: 1, height: 1 });
  const [rotation, setRotation] = useState(0);
  const [flipX, setFlipX] = useState(false);
  const [flipY, setFlipY] = useState(false);
  const [width, setWidth] = useState(1);
  const [height, setHeight] = useState(1);
  const [format, setFormat] = useState<Format>('png');
  const [name, setName] = useState(copyName(path, 'edited', 'png'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const preview = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let active = true; let loaded: ImageBitmap | undefined;
    createImageBitmap(blob).then(image => {
      loaded = image;
      if (!active) { image.close(); return; }
      validateImageSize(image.width, image.height);
      setBitmap(image); setCrop({ x: 0, y: 0, width: image.width, height: image.height });
      setWidth(image.width); setHeight(image.height);
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : String(e)); });
    return () => { active = false; loaded?.close(); };
  }, [blob]);

  useEffect(() => {
    if (!bitmap || !preview.current) return;
    try {
      const rendered = renderImage(bitmap, crop, rotation, flipX, flipY, width, height, format);
      const target = preview.current;
      target.width = rendered.width; target.height = rendered.height;
      target.getContext('2d')?.drawImage(rendered, 0, 0);
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [bitmap, crop, rotation, flipX, flipY, width, height, format]);

  function mark() { if (busy) return; onDirtyChange?.(true); setMessage(''); }
  function cropField(field: keyof Crop, value: number) { if (busy) return; setCrop(previous => ({ ...previous, [field]: value })); mark(); }
  function setOutputFormat(next: Format) { if (busy) return; setFormat(next); setName(previous => previous.replace(/\.(png|jpe?g)$/i, `.${next === 'jpeg' ? 'jpg' : 'png'}`)); mark(); }
  async function exportBlob(): Promise<Blob> {
    if (!bitmap) throw new Error('Image is still loading.');
    const canvas = renderImage(bitmap, crop, rotation, flipX, flipY, width, height, format);
    return new Promise((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('Could not export image.')), `image/${format}`, 0.92));
  }
  async function save(download: boolean) {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const output = await exportBlob();
      const target = validateCopyPath(name, format === 'jpeg' ? 'jpg' : 'png');
      if (target === path) throw new Error('Choose a new filename to preserve the original.');
      if (download) downloadBlob(output, target.split('/').pop() || `edited.${format}`);
      else { await api.upload(target, output); onDirtyChange?.(false); onCreated(target); setMessage(`Saved copy: ${target}`); }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  const input = (label: string, value: number, update: (v: number) => void, min = 0) => <label>{label} <input type="number" min={min} step="1" value={value} disabled={busy} onChange={e => { if (!busy) update(Number(e.target.value)); }} /></label>;

  return <section className="attachment-workspace" aria-label="Image editor" aria-busy={busy}>
    <div className="attachment-toolbar">
      <button type="button" disabled={busy} onClick={() => { if (busy) return; setRotation((rotation + 90) % 360); setWidth(height); setHeight(width); mark(); }}>Rotate ↻</button>
      <button type="button" disabled={busy} aria-pressed={flipX} onClick={() => { if (busy) return; setFlipX(!flipX); mark(); }}>Flip horizontal</button>
      <button type="button" disabled={busy} aria-pressed={flipY} onClick={() => { if (busy) return; setFlipY(!flipY); mark(); }}>Flip vertical</button>
      <label>Format <select value={format} disabled={busy} onChange={e => setOutputFormat(e.target.value as Format)}><option value="png">PNG</option><option value="jpeg">JPEG</option></select></label>
    </div>
    <fieldset className="attachment-fields"><legend>Crop source pixels</legend>
      {input('Left', crop.x, v => cropField('x', v))}{input('Top', crop.y, v => cropField('y', v))}
      {input('Width', crop.width, v => cropField('width', v), 1)}{input('Height', crop.height, v => cropField('height', v), 1)}
      {bitmap && <span className="attachment-hint">Source: {bitmap.width} × {bitmap.height} px</span>}
    </fieldset>
    <fieldset className="attachment-fields"><legend>Output size</legend>
      {input('Width', width, v => { setWidth(v); mark(); }, 1)}{input('Height', height, v => { setHeight(v); mark(); }, 1)}
    </fieldset>
    <div className="attachment-image-scroll"><canvas ref={preview} aria-label="Edited image preview" /></div>
    <div className="attachment-toolbar attachment-savebar">
      <label>Copy path <input className="attachment-path" value={name} disabled={busy} onChange={e => { if (!busy) setName(e.target.value); }} /></label>
      <button type="button" disabled={busy || !bitmap || !!error} onClick={() => void save(false)}>Save copy to vault</button>
      <button type="button" disabled={busy || !bitmap || !!error} onClick={() => void save(true)}>Download copy</button>
    </div>
    <p className="attachment-hint">The original image stays intact. Animated images export as a still frame.</p>
    {error && <p role="alert" className="attachment-error">{error}</p>}{message && <p role="status">{message}</p>}
  </section>;
}
