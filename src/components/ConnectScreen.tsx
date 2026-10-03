import { useState } from 'react';
import { AppWindow, ArrowRight, ArrowUpRight, KeyRound, LockKeyhole, Server } from 'lucide-react';
import type { Connection } from '../lib/types';
import { Brand, BRAND_TAGLINE } from './Brand';

const SETUP_GUIDE = 'https://github.com/baney75/vaultlink#quick-start';

interface Props {
  onConnect: (connection: Connection) => Promise<void>;
  error: string | null;
  connecting: boolean;
  onOpenNative?: () => void;
}

export function ConnectScreen({ onConnect, error, connecting, onOpenNative }: Props) {
  const [url, setUrl] = useState(() => location.hostname.endsWith('.ts.net') || (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && location.port === '27124') ? location.origin : 'http://127.0.0.1:27124');
  const [token, setToken] = useState('');

  return <main className="connect-page">
    <header className="connect-brand"><Brand size={36} tagline={BRAND_TAGLINE} /></header>
    <section className="connect-card" aria-labelledby="connect-title">
      <div className="eyebrow">Connect your vault</div>
      <h1 id="connect-title">Open your workspace.</h1>
      <p className="connect-intro">VaultLink works through a small companion app on the computer that holds your vault. Enter the address and access token it shows you.</p>
      <div className="connect-setup">
        <p><strong>First time?</strong> Set up the companion on that computer first. It takes a few minutes and needs Node.js. Keep it running while you work.</p>
        <a className="connect-link" href={SETUP_GUIDE} target="_blank" rel="noopener noreferrer">Read the setup guide<ArrowUpRight size={14} aria-hidden="true" /><span className="visually-hidden"> (opens in a new tab)</span></a>
      </div>
      <form onSubmit={event => { event.preventDefault(); void onConnect({ url: url.trim(), token: token.trim() }); }}>
        <label htmlFor="bridge-url">Companion address</label>
        <div className="input-with-icon"><Server size={17} aria-hidden="true" /><input id="bridge-url" type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="http://127.0.0.1:27124" required autoComplete="url" spellCheck={false} /></div>
        <label htmlFor="bridge-token">Access token</label>
        <div className="input-with-icon"><KeyRound size={17} aria-hidden="true" /><input id="bridge-token" type="password" value={token} onChange={event => setToken(event.target.value)} required autoComplete="off" spellCheck={false} placeholder="Paste the token from the companion" /></div>
        {error && <div role="alert" className="form-error">{error}</div>}
        <button className="primary-button connect-button" type="submit" disabled={connecting}>{connecting ? 'Connecting…' : 'Connect to vault'}<ArrowRight size={17} aria-hidden="true" /></button>
      </form>
      <p className="connect-foot"><LockKeyhole size={14} aria-hidden="true" /> The token stays in this browser session. Notes go straight between this browser and your companion.</p>
    </section>
    {onOpenNative && <section className="connect-native" aria-labelledby="connect-native-title">
      <div className="connect-native-icon" aria-hidden="true"><AppWindow size={18} /></div>
      <div>
        <h2 id="connect-native-title">Prefer the Obsidian app itself?</h2>
        <p>Native Obsidian shows a browser-accessible Obsidian desktop that you run on your own computer, over a private Tailscale address. It keeps that computer’s theme and installed plugins. They don’t copy over from other devices.</p>
        <button type="button" className="subtle-button connect-native-button" onClick={onOpenNative}>Open Native Obsidian<ArrowRight size={16} aria-hidden="true" /></button>
      </div>
    </section>}
    <footer className="connect-version">No VaultLink account. No cloud copy of your notes.</footer>
  </main>;
}
