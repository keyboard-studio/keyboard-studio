// Self-contained `path` shim — no path-browserify dep, no CJS interop
// surprises. Provides default export only (matches Node's path API
// shape for the methods Emscripten's wasm-host.js detection code may
// touch). All methods are POSIX-style.
//
// kmc-kmn's vendored wasm-host.js has a Node-only branch with
// `var nodePath = require('path');`. The browser never executes that
// branch but Vite's static analysis rewrites the require into an ESM
// import. This shim satisfies the import without pulling in any CJS
// modules.

function join(...parts: string[]): string {
  return parts
    .filter((p) => p !== undefined && p !== null && p !== "")
    .join("/")
    .replace(/\/{2,}/g, "/");
}

function dirname(p: string): string {
  const stripped = p.replace(/[/\\]+$/, "");
  const idx = Math.max(stripped.lastIndexOf("/"), stripped.lastIndexOf("\\"));
  if (idx < 0) return ".";
  if (idx === 0) return "/";
  return stripped.slice(0, idx);
}

function basename(p: string, ext?: string): string {
  const stripped = p.replace(/[/\\]+$/, "");
  const idx = Math.max(stripped.lastIndexOf("/"), stripped.lastIndexOf("\\"));
  let base = idx < 0 ? stripped : stripped.slice(idx + 1);
  if (ext !== undefined && base.endsWith(ext)) {
    base = base.slice(0, base.length - ext.length);
  }
  return base;
}

function extname(p: string): string {
  const base = basename(p);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot);
}

function resolve(...parts: string[]): string {
  // Minimal POSIX resolve: collapse, join, return absolute path.
  let path = "";
  for (const p of parts) {
    if (p === undefined || p === null || p === "") continue;
    if (p.startsWith("/")) {
      path = p;
    } else {
      path = path === "" ? p : `${path}/${p}`;
    }
  }
  return path.replace(/\/{2,}/g, "/");
}

function normalize(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}

function relative(from: string, to: string): string {
  // Tiny relative impl — sufficient for kmcmplib's needs (none, in browser).
  if (from === to) return "";
  return to;
}

const pathModule = {
  join,
  dirname,
  basename,
  extname,
  resolve,
  normalize,
  relative,
  sep: "/",
  delimiter: ":",
  posix: undefined as unknown,
  win32: undefined as unknown,
};
pathModule.posix = pathModule;

export default pathModule;
export { join, dirname, basename, extname, resolve, normalize, relative };
