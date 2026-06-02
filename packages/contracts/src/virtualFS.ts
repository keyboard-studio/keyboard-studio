// see spec.md section 12 - output artifacts and glossary entry "virtual FS"

export interface VirtualFSEntry {
  /** POSIX-style path relative to the keyboard root (e.g. "source/tyv.kmn"). */
  path: string;
  content: Uint8Array | string;
  isBinary: boolean;
}

export interface VirtualFS {
  get(path: string): VirtualFSEntry | undefined;
  set(path: string, content: Uint8Array | string, isBinary?: boolean): void;
  delete(path: string): boolean;
  list(prefix?: string): string[];
  /** Serialize to a .zip Blob for the download delivery path (spec section 12). */
  serializeZip(): Promise<Blob>;
}
