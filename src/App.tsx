import { BrandMark } from './components/Brand';
import { useEffect, useState } from 'react';
import { createAPI, loadConnection, storeConnection, clearConnection, requestConnectionPermission } from './lib/api';
import type { Connection, VaultAPI, VaultInfo } from './lib/types';
import { ConnectScreen } from './components/ConnectScreen';
import { Workspace } from './components/Workspace';
import { NativeView } from './components/NativeView';

function message(error: unknown) { return error instanceof Error ? error.message : 'Could not connect to the vault.'; }

export default function App() {
  const [status, setStatus] = useState<'loading' | 'disconnected' | 'connected'>('loading');
  const [connection, setConnection] = useState<Connection | null>(null);
  const [api, setApi] = useState<VaultAPI | null>(null);
  const [info, setInfo] = useState<VaultInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [view, setView] = useState<'tools' | 'native'>(() => new URLSearchParams(location.search).get('view') === 'native' ? 'native' : 'tools');

  useEffect(() => {
    let active = true;
    void loadConnection().then(async saved => {
      if (!saved) { if (active) setStatus('disconnected'); return; }
      const client = createAPI(saved);
      try {
        const vault = await client.info();
        if (active) { setConnection(saved); setApi(client); setInfo(vault); setStatus('connected'); }
      } catch (cause) {
        if (active) { setError(`Saved connection unavailable: ${message(cause)}`); setStatus('disconnected'); }
      }
    }).catch(cause => { if (active) { setError(message(cause)); setStatus('disconnected'); } });
    return () => { active = false; };
  }, []);

  async function connect(next: Connection) {
    setConnecting(true); setError(null);
    try {
      if (!await requestConnectionPermission(next.url)) throw new Error('Browser permission was not granted for this bridge.');
      const client = createAPI(next);
      const vault = await client.info();
      if (vault.protocol !== 1) throw new Error(`Unsupported bridge protocol: ${vault.protocol}`);
      await storeConnection(next);
      setConnection(next); setApi(client); setInfo(vault); setStatus('connected');
    } catch (cause) { setError(message(cause)); }
    finally { setConnecting(false); }
  }

  async function disconnect() {
    await clearConnection();
    setConnection(null); setApi(null); setInfo(null); setError(null); setStatus('disconnected');
  }

  return <>
    <div hidden={view === 'native'} inert={view === 'native'} style={{ height: '100dvh' }}>
      {status === 'loading' ? <main className="boot-screen"><BrandMark size={44} /><p>Opening VaultLink…</p></main>
        : status === 'connected' && connection && api && info
          ? <Workspace connection={connection} api={api} info={info} onDisconnect={disconnect} onOpenNative={() => setView('native')} active={view === 'tools'} />
          : <ConnectScreen onConnect={connect} error={error} connecting={connecting} onOpenNative={() => setView('native')} />}
    </div>
    {view === 'native' && <NativeView onBackToTools={() => setView('tools')} />}
  </>;
}
