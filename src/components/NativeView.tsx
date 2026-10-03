import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, CircleHelp, Maximize2, Monitor, Settings2, X } from 'lucide-react';
import { clearNativeURL, loadNativeURL, storeNativeURL } from '../lib/native';
import '../native.css';

interface Props { onBackToTools: () => void }

export function NativeView({ onBackToTools }: Props) {
  const [origin, setOrigin] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [slow, setSlow] = useState(false);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [frameError, setFrameError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  function openSettings() {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditing(true);
  }

  function closeSettings() { setEditing(false); setError(null); }

  useEffect(() => {
    if (!editing || !origin) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previous = returnFocusRef.current;
    dialog.querySelector<HTMLInputElement>('input')?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); closeSettings(); return; }
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href],select:not(:disabled),textarea:not(:disabled)'));
      if (!controls.length) { event.preventDefault(); dialog!.focus(); return; }
      const first = controls[0];
      const last = controls.at(-1)!;
      if (event.shiftKey && (document.activeElement === first || !dialog!.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog!.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [editing, origin]);

  useEffect(() => {
    let active = true;
    void loadNativeURL().then(saved => {
      if (!active) return;
      setOrigin(saved); setInput(saved ?? ''); setEditing(!saved);
    }).catch(cause => {
      if (active) { setError(cause instanceof Error ? cause.message : 'Could not load the desktop address.'); setEditing(true); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!origin) return;
    setSlow(false); setFrameError(false); setFrameLoaded(false);
  }, [origin]);

  useEffect(() => {
    if (!origin || frameLoaded) return;
    const timeout = window.setTimeout(() => setSlow(true), 15000);
    return () => window.clearTimeout(timeout);
  }, [origin, frameLoaded]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(null);
    try {
      const normalized = await storeNativeURL(input);
      setOrigin(normalized); setInput(normalized); setEditing(false); setSlow(false); setFrameError(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the desktop address.'); }
    finally { setSaving(false); }
  }

  async function forget() {
    try { await clearNativeURL(); setOrigin(null); setInput(''); setEditing(true); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not forget the desktop address.'); }
  }

  function fullPage() {
    const url = new URL(location.href);
    url.searchParams.delete('panel');
    url.searchParams.set('view', 'native');
    window.open(url.href, '_blank', 'noopener,noreferrer');
  }

  return <main className="native-shell">
    <header className="native-topbar" inert={editing && Boolean(origin)}>
      <button className="native-back" onClick={onBackToTools} aria-label="Return to VaultLink tools"><ArrowLeft size={17} /><span>Tools</span></button>
      <div className="native-heading"><Monitor size={17} aria-hidden="true" /><strong>Native Obsidian</strong></div>
      <div className="native-controls">
        {origin && <button className="native-icon" title="Native view help" aria-label="Native view help" onClick={() => setSlow(true)}><CircleHelp size={17} /></button>}
        {origin && <button className="native-icon" title="Desktop address" aria-label="Desktop address" onClick={openSettings}><Settings2 size={17} /></button>}
        {origin && <a className="native-icon" title="Open desktop in a new tab" aria-label="Open desktop in a new tab" href={origin} target="_blank" rel="noopener noreferrer"><ArrowUpRight size={18} /></a>}
        {new URLSearchParams(location.search).has('panel') && <button className="native-icon" title="Open VaultLink full page" aria-label="Open VaultLink full page" onClick={fullPage}><Maximize2 size={17} /></button>}
      </div>
    </header>

    {loading ? <div className="native-center"><p>Opening native view…</p></div> : origin ? <div className="native-desktop">
      <iframe key={origin} className="native-frame" title="Native Obsidian desktop" src={origin} sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-pointer-lock" allow="clipboard-read; clipboard-write; fullscreen" allowFullScreen referrerPolicy="no-referrer" inert={editing} tabIndex={editing ? -1 : 0} onLoad={() => setFrameLoaded(true)} onError={() => setFrameError(true)} />
      {(slow || frameError) && <div className="native-help" role="status" inert={editing}><span>{frameError ? 'The desktop could not be displayed here.' : 'Still waiting for the desktop?'} Check that the separate desktop host is running and its private address allows embedding. If sign-in does not appear, open the desktop directly once, sign in, then return.</span><a href={origin} target="_blank" rel="noopener noreferrer">Open directly <ArrowUpRight size={13} /></a><button aria-label="Dismiss desktop help" onClick={() => { setSlow(false); setFrameError(false); }}><X size={14} /></button></div>}
      {editing && <div className="native-overlay" role="presentation"><div className="native-card native-config" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="native-config-title" tabIndex={-1}><div className="native-card-top"><div><div className="native-eyebrow">DESKTOP ADDRESS</div><h1 id="native-config-title">Connect the native view</h1></div><button className="native-icon" aria-label="Close settings" onClick={closeSettings}><X size={18} /></button></div><NativeForm input={input} setInput={setInput} onSubmit={save} saving={saving} error={error} /><button className="native-forget" onClick={() => void forget()} disabled={saving}>Forget saved address</button></div></div>}
    </div> : <div className="native-center"><div className="native-card"><div className="native-emblem"><Monitor size={24} /></div><div className="native-eyebrow">OPTIONAL NATIVE VIEW</div><h1>Your Obsidian desktop, here.</h1><p>Enter the private address of a browser-accessible Obsidian desktop running on a host you control. This view shows the themes and plugins installed on that host.</p><p><a className="native-setup-link" href="https://github.com/baney75/vaultlink/blob/main/native/README.md" target="_blank" rel="noopener noreferrer">Set up the native desktop <ArrowUpRight size={13} /></a></p><NativeForm input={input} setInput={setInput} onSubmit={save} saving={saving} error={error} /><p className="native-caveat">A Mac vault’s plugins and theme do not appear on a different host automatically. Configure that Obsidian installation separately. If sign-in does not appear, open the desktop directly once, sign in, then return. VaultLink never sends your companion token to the desktop address.</p></div></div>}
  </main>;
}

interface FormProps { input: string; setInput: (value: string) => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; saving: boolean; error: string | null }

function NativeForm({ input, setInput, onSubmit, saving, error }: FormProps) {
  return <form className="native-form" onSubmit={onSubmit}><label htmlFor="native-url">Private desktop address</label><input autoFocus id="native-url" type="url" value={input} onChange={event => setInput(event.target.value)} placeholder="https://desktop.tailnet.ts.net" autoComplete="url" required /><span className="native-hint">HTTPS *.ts.net, or local HTTP on this computer</span>{error && <p className="native-error" role="alert">{error}</p>}<button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Open native view'}</button></form>;
}
