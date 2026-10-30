// The inventory entry shape (spec 107 FR-010), shared by driftGuard.ts and the
// per-group inventory files without an import cycle.

export interface InventoryEntry {
  /** The exported function's name. */
  fn: string;
  /** Defining module: a studio src-relative path, or a package specifier. */
  module: string;
  /** Production files (studio src-relative) that import `fn`; at least one unless `provenBy` is set. */
  callers: readonly string[];
  /**
   * For a composite no production file calls by name (a hook memoizes its
   * pieces separately): the studio src-relative test that imports `fn` and
   * proves it equal to the hook the UI calls. Only with an empty `callers`.
   */
  provenBy?: string;
}
