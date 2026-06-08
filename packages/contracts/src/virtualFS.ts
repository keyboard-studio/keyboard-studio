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
  /**
   * Set or overwrite an entry at `path`.
   *
   * Returns the previous entry if `path` already existed (so callers can
   * tell user-edited-existing from user-created-new), or `undefined` for
   * a fresh path. Mirrors {@link delete}'s did-it-exist signal for
   * symmetry.
   */
  set(
    path: string,
    content: Uint8Array | string,
    isBinary?: boolean
  ): VirtualFSEntry | undefined;
  delete(path: string): boolean;
  list(prefix?: string): string[];
  /**
   * Return entry snapshots filtered by prefix — equivalent to
   * `list(prefix).map((p) => get(p)!)` but in one call, without the
   * non-null assertion, and in O(n) rather than O(n²) for callers that
   * iterate every entry (e.g. `OutputService.toZip` walking the tree).
   *
   * @param prefix - Optional path prefix; omitted → all entries.
   * @returns An array of `VirtualFSEntry` snapshots. Order is unspecified.
   */
  entries(prefix?: string): VirtualFSEntry[];
}

/**
 * Create a minimal in-memory {@link VirtualFS} pre-populated with the given
 * entries. Shared by the real engine and mock services so they stay in sync.
 */
export function createVirtualFS(entries?: VirtualFSEntry[]): VirtualFS {
  const store = new Map<string, VirtualFSEntry>(
    (entries ?? []).map((e) => [e.path, e])
  );
  return {
    get(path: string): VirtualFSEntry | undefined { return store.get(path); },
    set(path: string, content: Uint8Array | string, isBinary = false): VirtualFSEntry | undefined {
      const prev = store.get(path);
      store.set(path, { path, content, isBinary });
      return prev;
    },
    delete(path: string): boolean { return store.delete(path); },
    list(prefix?: string): string[] {
      const keys = [...store.keys()];
      return prefix === undefined ? keys : keys.filter((k) => k.startsWith(prefix));
    },
    entries(prefix?: string): VirtualFSEntry[] {
      const all = [...store.values()];
      return prefix === undefined ? all : all.filter((e) => e.path.startsWith(prefix));
    },
  };
}
