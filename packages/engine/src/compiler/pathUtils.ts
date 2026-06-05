// Browser-side replacements for Node's `path` module, used by the kmc-kmn
// compiler callbacks and the WASM oracle. Both pipelines drive kmcmplib
// across an in-memory VirtualFS where filenames are POSIX-style strings
// with no real filesystem behind them — Node's `path` would either pull
// in a polyfill or behave platform-dependently (Win32 vs POSIX), so we
// keep a tiny shared implementation here.
//
// Shared between:
//   - packages/engine/src/compiler/index.ts (kmc-kmn compile pipeline)
//   - packages/engine/src/validator/wasmLoader.ts (oracle handle)
//
// Both consumers were carrying byte-identical local copies before this
// module was extracted (Issue #17 tail cleanup).

export const pathUtils = {
  join: (...parts: string[]): string => {
    // Simple POSIX join, collapse multiple slashes.
    return parts
      .filter((p) => p !== undefined && p !== null && p !== "")
      .join("/")
      .replace(/\/{2,}/g, "/");
  },
  dirname: (p: string): string => {
    const stripped = p.replace(/[/\\]+$/, "");
    const idx = Math.max(stripped.lastIndexOf("/"), stripped.lastIndexOf("\\"));
    if (idx < 0) return "";
    return stripped.slice(0, idx);
  },
  basename: (p: string, ext?: string): string => {
    const stripped = p.replace(/[/\\]+$/, "");
    const idx = Math.max(stripped.lastIndexOf("/"), stripped.lastIndexOf("\\"));
    let base = idx < 0 ? stripped : stripped.slice(idx + 1);
    if (ext !== undefined && base.endsWith(ext)) {
      base = base.slice(0, base.length - ext.length);
    }
    return base;
  },
  extname: (p: string): string => {
    const base = pathUtils.basename(p);
    const dot = base.lastIndexOf(".");
    return dot <= 0 ? "" : base.slice(dot);
  },
};
