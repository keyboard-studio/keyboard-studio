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
  /**
   * Returns raw zip bytes. Browser callers wrap in
   * `new Blob([bytes], { type: 'application/zip' })` at the download site;
   * Node callers (compiler service, vitest) consume the bytes directly.
   * See spec section 12 for the output-artifact contract.
   */
  serializeZip(): Promise<Uint8Array>;
}
