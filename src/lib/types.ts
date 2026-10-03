export interface Connection { url: string; token: string }
export interface VaultEntry { path: string; name: string; kind: 'file' | 'folder'; extension: string; size: number; modified: number }
export interface VaultInfo { id: string; name: string; protocol: 1; capabilities: string[] }
export interface NoteDocument { path: string; content: string; revision: string }
export interface SearchHit { path: string; line: number; text: string }
export interface FileDocument { blob: Blob; revision: string }
export interface VaultAPI {
 info(): Promise<VaultInfo>;
 list(): Promise<VaultEntry[]>;
 read(path: string): Promise<NoteDocument>;
 save(path: string, content: string, revision: string | null): Promise<NoteDocument>;
 file(path: string): Promise<FileDocument>;
 upload(path: string, data: Blob): Promise<{ path: string; revision: string }>;
 search(query: string): Promise<SearchHit[]>;
}
export interface AttachmentProps { path: string; api: VaultAPI; onCreated: (path: string) => void; onDirtyChange?: (dirty: boolean) => void }
