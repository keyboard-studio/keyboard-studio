// see spec.md section 12 - output artifacts and glossary entry "virtual FS"

export interface VirtualFSEntry {
  /** POSIX-style path relative to the keyboard root (e.g. "source/tyv.kmn"). */
  path: string;
  content: Uint8Array | string;
  isBinary: boolean;
}

/**
 * In-memory virtual filesystem. The studio's source-of-truth for keyboard
 * source files during authoring; serialized to a zip ONLY through
 * {@link OutputService.toZip} (which strips compiled artifacts before
 * delegating to a free serializer). Direct serialization is intentionally
 * NOT on this interface — see #97. Callers that want a zip must go
 * through `OutputService.toZip`, which is the safe path that honors
 * criteria SS1 (no compiled artifacts in PRs, spec §12).
 */
export interface VirtualFS {
  get(path: string): VirtualFSEntry | undefined;
  set(path: string, content: Uint8Array | string, isBinary?: boolean): void;
  delete(path: string): boolean;
  list(prefix?: string): string[];
}
