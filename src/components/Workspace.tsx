import { Brand } from './Brand';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowUpRight, CalendarDays, Check, ChevronRight, CircleHelp, CloudUpload, FilePlus2, Menu, Monitor, MoreHorizontal, PanelRightOpen, RefreshCw, Save, Unplug, X } from 'lucide-react';
import type { Connection, SearchHit, VaultAPI, VaultEntry, VaultInfo } from '../lib/types';
import { ApiError } from '../lib/api';
import { AttachmentEditor } from './AttachmentEditor';
import { FileTree } from './FileTree';
import { NoteEditor } from './NoteEditor';
import { clearDraft, loadDraft, storeDraft } from './draftCache';

interface Props { connection: Connection; api: VaultAPI; info: VaultInfo; onDisconnect: () => Promise<void>; onOpenNative?: () => void; active?: boolean }
type Conflict = { path: string; revision: string };
const editable = new Set(['md', 'txt', 'json', 'csv']);

function extension(path: string) { return path.split('/').pop()?.split('.').pop()?.toLowerCase() ?? ''; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'The request failed. Try again.'; }
function titleFrom(path: string) { return path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? path; }

export function Workspace({ connection, api, info, onDisconnect, onOpenNative, active = true }: Props) {
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [loadingTree, setLoadingTree] = useState(true);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [revision, setRevision] = useState<string | null>(null);
  const [loadingNote, setLoadingNote] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 650px)').matches);
  const [newDialog, setNewDialog] = useState(false);
  const [newFolder, setNewFolder] = useState('');
  const [newName, setNewName] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [menu, setMenu] = useState(false);
  const [attachmentDirty, setAttachmentDirty] = useState(false);
  const uploadInput = useRef<HTMLInputElement>(null);
  const noteLoadId = useRef(0);
  const savingRef = useRef(false);
  const creatingRef = useRef(false);
  const selectedRef = useRef<string | null>(null);
  const draftRef = useRef('');
  const selectionGeneration = useRef(0);
  const draftGeneration = useRef(0);
  const snapshot = () => ({ path: selectedRef.current, selection: selectionGeneration.current, draft: draftGeneration.current });
  const sameSelection = (start: ReturnType<typeof snapshot>) => selectedRef.current === start.path && selectionGeneration.current === start.selection;
  const unchanged = (start: ReturnType<typeof snapshot>) => sameSelection(start) && draftGeneration.current === start.draft;
  const onAttachmentDirty = useCallback((next: boolean) => {
    if (next) draftGeneration.current += 1;
    setAttachmentDirty(next);
  }, []);
  const dirty = selected !== null && editable.has(extension(selected)) && draft !== savedContent;
  const hasUnsaved = dirty || attachmentDirty;
  const selectedEntry = entries.find(entry => entry.path === selected);

  const refreshTree = useCallback(async () => {
    try { setEntries(await api.list()); setTreeError(null); }
    catch (error) { setTreeError(errorMessage(error)); }
    finally { setLoadingTree(false); }
  }, [api]);

  useEffect(() => { void refreshTree(); }, [refreshTree]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 650px)');
    const update = () => { setNarrow(media.matches); if (!media.matches) setDrawer(false); };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!query.trim()) { setHits([]); setSearchError(null); setSearching(false); return; }
    let active = true;
    const timer = window.setTimeout(() => {
      setSearching(true);
      void api.search(query.trim()).then(value => { if (active) { setHits(value); setSearchError(null); } }).catch(error => { if (active) { setHits([]); setSearchError(errorMessage(error)); } }).finally(() => { if (active) setSearching(false); });
    }, 280);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query, api]);
  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) { if (hasUnsaved) { event.preventDefault(); event.returnValue = ''; } }
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [hasUnsaved]);
  useEffect(() => {
    if (!selected || revision === null || !editable.has(extension(selected))) return;
    if (draft !== savedContent) void storeDraft(connection, info.id, selected, { draft, savedContent, revision }).catch(() => {});
  }, [connection, info.id, selected, draft, savedContent, revision]);

  async function selectPath(path: string, force = false) {
    if (!force && selected === path) { setDrawer(false); return; }
    if (!force && hasUnsaved && !window.confirm('You have unsaved changes. Leave this file and discard them?')) return;
    if (!force && selected && dirty) void clearDraft(connection, info.id, selected).catch(() => {});
    const id = ++noteLoadId.current;
    selectionGeneration.current += 1;
    draftGeneration.current += 1;
    selectedRef.current = path;
    setSelected(path); setDrawer(false); setMenu(false); setNotice(null); setConflict(null); setAttachmentDirty(false);
    setDraft(''); setSavedContent(''); setRevision(null);
    draftRef.current = '';
    if (!editable.has(extension(path))) { setLoadingNote(false); return; }
    setLoadingNote(true);
    try {
      const note = await api.read(path);
      if (id === noteLoadId.current) {
        const cached = await loadDraft(connection, info.id, path).catch(() => null);
        if (id !== noteLoadId.current) return;
        if (cached && cached.draft !== cached.savedContent) {
          draftRef.current = cached.draft;
          draftGeneration.current += 1;
          setDraft(cached.draft); setSavedContent(cached.savedContent); setRevision(cached.revision);
          setNotice('Recovered an unsaved draft from this browser session. Save to check for vault changes.');
        } else { draftRef.current = note.content; draftGeneration.current += 1; setDraft(note.content); setSavedContent(note.content); setRevision(note.revision); }
      }
    } catch (error) {
      if (id === noteLoadId.current) {
        const cached = await loadDraft(connection, info.id, path).catch(() => null);
        if (id !== noteLoadId.current) return;
        if (cached && cached.draft !== cached.savedContent) {
          draftRef.current = cached.draft;
          draftGeneration.current += 1;
          setDraft(cached.draft); setSavedContent(cached.savedContent); setRevision(cached.revision);
          setNotice(`Vault read failed; your browser-session draft was recovered. ${errorMessage(error)}`);
        } else setNotice(`Could not open ${path}: ${errorMessage(error)}`);
      }
    }
    finally { if (id === noteLoadId.current) setLoadingNote(false); }
  }

  async function save() {
    if (!selected || !editable.has(extension(selected)) || revision === null || !dirty || savingRef.current) return;
    const path = selected; const content = draft; const oldRevision = revision;
    const start = snapshot();
    savingRef.current = true;
    setSaving(true); setNotice(null); setConflict(null);
    try {
      const result = await api.save(path, content, oldRevision);
      if (sameSelection(start)) {
        setRevision(result.revision); setSavedContent(content); setNotice('Saved to vault.');
        if (unchanged(start) && draftRef.current === content) await clearDraft(connection, info.id, path).catch(() => {});
        else void storeDraft(connection, info.id, path, { draft: draftRef.current, savedContent: content, revision: result.revision }).catch(() => {});
      }
      void refreshTree();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        if (sameSelection(start)) { setConflict({ path, revision: oldRevision }); setNotice('This note changed in the vault. Your draft is still here.'); }
      } else if (sameSelection(start)) setNotice(`Save failed. Your draft is still here. ${errorMessage(error)}`);
    } finally { savingRef.current = false; setSaving(false); }
  }

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (!active) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void save(); }
      if (event.key === 'Escape') { setNewDialog(false); setMenu(false); setDrawer(false); }
    }
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  });

  async function reloadConflict() {
    if (!conflict || !window.confirm('Reload the vault version? Your unsaved draft will be discarded.')) return;
    const start = snapshot();
    await clearDraft(connection, info.id, conflict.path).catch(() => {});
    if (!unchanged(start)) {
      if (sameSelection(start) && revision !== null) void storeDraft(connection, info.id, conflict.path, { draft: draftRef.current, savedContent, revision }).catch(() => {});
      setNotice('Reload canceled because the draft changed while preparing it.');
      return;
    }
    await selectPath(conflict.path, true);
  }

  async function saveDraftCopy() {
    if (!conflict || savingRef.current) return;
    const original = conflict.path;
    const dot = original.lastIndexOf('.');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const copy = `${original.slice(0, dot)}-draft-${stamp}${original.slice(dot)}`;
    const start = snapshot();
    const copiedContent = draftRef.current;
    savingRef.current = true;
    setSaving(true); setNotice(null);
    try {
      await api.save(copy, copiedContent, null);
      await refreshTree();
      if (unchanged(start) && draftRef.current === copiedContent) {
        await clearDraft(connection, info.id, original).catch(() => {});
        if (unchanged(start) && draftRef.current === copiedContent) {
          await selectPath(copy, true);
        } else {
          if (sameSelection(start) && revision !== null) void storeDraft(connection, info.id, original, { draft: draftRef.current, savedContent, revision }).catch(() => {});
          setNotice(`Draft copy saved as ${copy}. Newer edits remain in this note.`);
        }
      } else setNotice(`Draft copy saved as ${copy}. Newer work remains open.`);
    } catch (error) { setNotice(`Could not save draft copy: ${errorMessage(error)}`); }
    finally { savingRef.current = false; setSaving(false); }
  }

  async function createNote(path: string, content = '') {
    if (creatingRef.current) return;
    const start = snapshot();
    const wasDirty = dirty;
    creatingRef.current = true;
    setCreating(true); setNotice(null); setModalError(null);
    try {
      await api.save(path, content, null);
      setNewDialog(false); setNewName('');
      await refreshTree();
      if (unchanged(start)) {
        if (wasDirty && start.path) await clearDraft(connection, info.id, start.path).catch(() => {});
        if (unchanged(start)) await selectPath(path, true);
        else setNotice(`Created ${path}. Newer work remains open.`);
      } else setNotice(`Created ${path}. Newer work remains open.`);
    } catch (error) { const detail = `Could not create note: ${errorMessage(error)}`; if (newDialog) setModalError(detail); else setNotice(detail); }
    finally { creatingRef.current = false; setCreating(false); }
  }

  function submitNew(event: React.FormEvent) {
    event.preventDefault();
    const name = newName.trim().replace(/\.md$/i, '');
    if (!name || /[/\\]/.test(name) || name.startsWith('.')) { setModalError('Enter a note name without slashes or a leading dot.'); return; }
    const path = `${newFolder ? `${newFolder}/` : ''}${name}.md`;
    if (hasUnsaved && !window.confirm('Discard unsaved changes and open the new note?')) return;
    void createNote(path, `# ${name}\n\n`);
  }

  async function createDaily() {
    if (hasUnsaved && !window.confirm('Discard unsaved changes and open today’s note?')) return;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const path = `${today}.md`;
    if (entries.some(entry => entry.path === path)) {
      if (selected && dirty) void clearDraft(connection, info.id, selected).catch(() => {});
      await selectPath(path, true);
      return;
    }
    await createNote(path, `# ${today}\n\n`);
  }

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    const folder = selected?.includes('/') ? selected.slice(0, selected.lastIndexOf('/')) : '';
    for (const file of Array.from(files)) {
      const path = `${folder ? `${folder}/` : ''}${file.name}`;
      try { await api.upload(path, file); setNotice(`Uploaded ${path}.`); }
      catch (error) { setNotice(`Upload failed for ${file.name}: ${errorMessage(error)}`); break; }
    }
    if (uploadInput.current) uploadInput.current.value = '';
    await refreshTree();
  }

  const folders = useMemo(() => entries.filter(entry => entry.kind === 'folder').map(entry => entry.path).sort(), [entries]);
  const crumbs = selected?.split('/') ?? [];
  const isNote = selected && editable.has(extension(selected));
  const isAttachment = selected && !editable.has(extension(selected));
  const attachmentStart = snapshot();

  async function disconnect() {
    if (hasUnsaved && !window.confirm('Discard unsaved changes and disconnect?')) return;
    if (selected && dirty) await clearDraft(connection, info.id, selected).catch(() => {});
    await onDisconnect();
  }

  function openSidebar() {
    void chrome.windows.getCurrent().then(window => {
      if (window.id === undefined) throw new Error('Could not identify this browser window.');
      return chrome.sidePanel.open({ windowId: window.id });
    }).catch(error => setNotice(`Could not open the sidebar: ${errorMessage(error)}`));
  }

  return <div className="app-shell">
    {drawer && <button className="drawer-scrim" aria-label="Close files" onClick={() => setDrawer(false)} />}
    <aside className={`sidebar ${drawer ? 'open' : ''}`} aria-label="Vault navigation" inert={narrow && !drawer}>
      <div className="brand"><Brand size={34} tagline="Personal workspace" /><button className="mobile-close icon-button" aria-label="Close files" onClick={() => setDrawer(false)}><X size={19} /></button></div>
      <div className="vault-title"><span className="vault-dot" /><span title={info.name}>{info.name}</span><button className="icon-button" title="Refresh files" aria-label="Refresh files" onClick={() => void refreshTree()}><RefreshCw size={15} /></button></div>
      <div className="sidebar-actions"><button className="new-note-button" onClick={() => setNewDialog(true)}><FilePlus2 size={16} /> New note</button><button className="icon-button upload-button" title="Upload attachment" aria-label="Upload attachment" onClick={() => uploadInput.current?.click()}><CloudUpload size={18} /></button></div>
      <FileTree entries={entries} selected={selected} query={query} hits={hits} searching={searching} searchError={searchError} onQuery={setQuery} onSelect={path => void selectPath(path)} />
      {loadingTree && <p className="tree-message">Loading files…</p>}
      {treeError && <div className="sidebar-error" role="alert">{treeError}<button onClick={() => void refreshTree()}>Retry</button></div>}
      <div className="sidebar-footer"><button onClick={() => void createDaily()}><CalendarDays size={17} /> Daily note</button><button onClick={() => void disconnect()}><Unplug size={17} /> Disconnect</button></div>
      <input ref={uploadInput} className="visually-hidden" type="file" multiple onChange={event => void uploadFiles(event.target.files)} aria-label="Choose attachments to upload" />
    </aside>
    <main className="workspace-main">
      <header className="topbar"><button className="mobile-menu icon-button" aria-label="Open files" onClick={() => setDrawer(true)}><Menu size={21} /></button><div className="breadcrumbs"><span>{info.name}</span>{selected && <><ChevronRight size={15} />{crumbs.slice(0, -1).map(crumb => <span key={crumb}>{crumb}</span>)}<ChevronRight size={15} /><strong>{crumbs.at(-1)}</strong></>}</div><div className="top-actions">{onOpenNative && <button className="icon-button" title="Native Obsidian view" aria-label="Native Obsidian view" onClick={onOpenNative}><Monitor size={18} /></button>}{typeof chrome !== 'undefined' && chrome.runtime?.id && chrome.sidePanel && !new URLSearchParams(location.search).has('panel') && <button className="icon-button" title="Open sidebar" aria-label="Open sidebar" onClick={openSidebar}><PanelRightOpen size={18} /></button>}{new URLSearchParams(location.search).has('panel') && <button className="icon-button" title="Open full page" aria-label="Open full page" onClick={() => { const url = new URL(location.href); url.searchParams.delete('panel'); window.open(url.href, '_blank', 'noopener,noreferrer'); }}><ArrowUpRight size={18} /></button>}<button className="icon-button" title="More options" aria-label="More options" aria-expanded={menu} onClick={() => setMenu(!menu)}><MoreHorizontal size={20} /></button>{menu && <div className="top-menu"><button onClick={() => { void refreshTree(); setMenu(false); }}><RefreshCw size={15} /> Refresh vault</button><button onClick={() => { setMenu(false); void disconnect(); }}><Unplug size={15} /> Disconnect</button></div>}</div></header>
      {selected ? <>
        <div className="document-header"><div><div className="document-kicker">{isNote ? 'NOTE' : 'FILE'} · {selectedEntry ? new Date(selectedEntry.modified).toLocaleDateString() : 'VAULT'}</div><h1>{titleFrom(selected)}</h1><p>{selected}</p></div>{isNote && <button className="primary-button save-button" onClick={() => void save()} disabled={!dirty || saving || loadingNote || revision === null}>{saving ? <RefreshCw size={16} className="spin" /> : dirty ? <Save size={16} /> : <Check size={16} />}{saving ? 'Saving…' : dirty ? 'Save note' : 'Saved'}</button>}</div>
        {notice && <div className={`notice ${conflict ? 'notice-conflict' : ''}`} role="status"><AlertTriangle size={16} /><span>{notice}</span><button aria-label="Dismiss message" onClick={() => setNotice(null)}><X size={15} /></button></div>}
        {conflict && <div className="conflict-actions"><button onClick={() => void saveDraftCopy()} disabled={saving}>Save draft copy</button><button onClick={() => void reloadConflict()} disabled={saving}>Reload vault version</button></div>}
        {loadingNote ? <div className="loading-document">Opening note…</div> : isNote ? revision !== null ? <NoteEditor key={selected} path={selected} content={draft} onChange={value => { draftRef.current = value; draftGeneration.current += 1; setDraft(value); }} entries={entries} api={api} onOpen={path => void selectPath(path)} /> : <div className="loading-document">The note could not be opened. Your vault files are unchanged.</div> : isAttachment ? <AttachmentEditor key={selected} path={selected} api={api} onCreated={path => { void refreshTree(); if (unchanged(attachmentStart)) void selectPath(path, true); else setNotice(`Created ${path}. Newer work remains open.`); }} onDirtyChange={onAttachmentDirty} /> : <div className="loading-document">This file type cannot be previewed here.</div>}
        <div className="document-status"><span>{dirty ? 'Unsaved changes' : isNote ? 'All changes saved' : attachmentDirty ? 'Unsaved changes' : 'Vault file'}</span>{isNote && <span>{draft.trim() ? draft.trim().split(/\s+/).length : 0} words</span>}</div>
      </> : <div className="empty-state"><div className="empty-icon"><CircleHelp size={27} /></div><div className="eyebrow">READY WHEN YOU ARE</div><h1>Your notes, right here.</h1><p>Choose a file from the sidebar, or make a new note to get started.</p><div className="empty-actions"><button className="primary-button" onClick={() => setNewDialog(true)}><FilePlus2 size={17} /> New note</button><button className="subtle-button" onClick={() => void createDaily()}><CalendarDays size={17} /> Open daily note</button></div></div>}
    </main>
    {newDialog && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setNewDialog(false); }}><div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="new-note-title"><div className="modal-heading"><div><div className="eyebrow">NEW FILE</div><h2 id="new-note-title">Create a note</h2></div><button className="icon-button" aria-label="Close dialog" onClick={() => setNewDialog(false)}><X size={19} /></button></div><form onSubmit={submitNew}><label htmlFor="note-folder">Folder</label><select id="note-folder" value={newFolder} onChange={event => setNewFolder(event.target.value)}><option value="">Vault root</option>{folders.map(folder => <option key={folder} value={folder}>{folder}</option>)}</select><label htmlFor="note-name">Note name</label><div className="name-input"><input autoFocus id="note-name" value={newName} onChange={event => setNewName(event.target.value)} placeholder="Untitled" required /><span>.md</span></div><p>Notes are saved immediately and can be edited afterward.</p>{modalError && <div className="form-error" role="alert">{modalError}</div>}<div className="modal-actions"><button type="button" className="subtle-button" onClick={() => setNewDialog(false)}>Cancel</button><button className="primary-button" disabled={creating} type="submit">{creating ? 'Creating…' : 'Create note'}</button></div></form></div></div>}
  </div>;
}
