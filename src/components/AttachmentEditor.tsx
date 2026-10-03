import { useEffect, useState } from 'react';
import type { AttachmentProps, FileDocument } from '../lib/types';
import { downloadBlob, MAX_ATTACHMENT_BYTES } from '../lib/attachments';
import PdfEditor from './PdfEditor';
import ImageEditor from './ImageEditor';
import CanvasEditor from './CanvasEditor';
import './attachment.css';

const imageTypes: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' };
const audioTypes: Record<string, string> = { mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac' };
const videoTypes: Record<string, string> = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/mp4' };

export function AttachmentEditor(props: AttachmentProps) {
  const { path, api, onDirtyChange } = props;
  const extension = path.split('/').pop()?.split('.').pop()?.toLowerCase() || '';
  const [file, setFile] = useState<FileDocument>();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { onDirtyChange?.(false); }, [path, onDirtyChange]);
  useEffect(() => {
    if (extension === 'canvas') return;
    let active = true;
    setFile(undefined); setError('');
    api.file(path).then(result => {
      if (!active) return;
      if (result.blob.size > MAX_ATTACHMENT_BYTES) throw new Error(`File is too large to open here (${Math.round(result.blob.size / 1024 / 1024)} MB).`);
      setFile(result);
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : String(e)); });
    return () => { active = false; };
  }, [api, path, extension]);

  useEffect(() => {
    if (!file) { setUrl(''); return; }
    const mime = imageTypes[extension] || audioTypes[extension] || videoTypes[extension] || file.blob.type || 'application/octet-stream';
    const next = URL.createObjectURL(new Blob([file.blob], { type: mime }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file, extension]);

  if (extension === 'canvas') return <div className="attachment-root"><CanvasEditor {...props} /></div>;
  const filename = path.split('/').pop() || 'attachment';
  return <div className="attachment-root">
    {file && <p className="attachment-meta">{(file.blob.size / 1024).toFixed(1)} KB</p>}
    {error && <p role="alert" className="attachment-error">{error}</p>}
    {!file && !error && <p role="status">Loading attachment…</p>}
    {file && extension === 'pdf' && <PdfEditor key={path} {...props} blob={file.blob} />}
    {file && extension in imageTypes && <ImageEditor key={path} {...props} blob={file.blob} />}
    {file && extension in audioTypes && url && <section className="attachment-media"><audio controls preload="metadata" src={url} aria-label={filename} /><p>Audio preview</p></section>}
    {file && extension in videoTypes && url && <section className="attachment-media"><video controls preload="metadata" src={url} aria-label={filename} /><p>Video preview</p></section>}
    {file && !(extension === 'pdf' || extension in imageTypes || extension in audioTypes || extension in videoTypes) && <p className="attachment-hint">Preview is unavailable for this file type. Download it to open in a suitable app.</p>}
    {file && <div className="attachment-toolbar"><button type="button" onClick={() => downloadBlob(file.blob, filename)}>Download original</button></div>}
  </div>;
}

export default AttachmentEditor;
