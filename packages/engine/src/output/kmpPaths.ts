// Path callbacks for the kmc-package (.kmp) bridge.
//
// Composes the shared ../compiler/pathUtils.js and adds the three functions
// kmc-package's `CompilerPathCallbacks` type requires that pathUtils lacks
// (isAbsolute, relative, resolve), plus the .kps-correct `resolveFilename`.
//
// WHY A SEPARATE MODULE, not additions to pathUtils.ts:
// these semantics deliberately deviate from Node's `path`, and pathUtils.ts
// advertises itself as a browser-side replacement FOR Node's path module.
//   - `resolve` returns a ROOTLESS relative path; Node's anchors at cwd and
//     always returns an absolute one.
//   - `relative` MAY return a leading `..`, which is the exact thing
//     pathUtils.normalize documents itself as dropping.
// Co-locating those with the shared module would invite someone to "fix" one
// against the other. If a second consumer ever needs them, promote them into
// pathUtils.ts verbatim and carry this comment along.
//
// WHAT kmc-package ACTUALLY CALLS (verified by grepping
// @keymanapp/kmc-package@19.0.240-alpha's build/src): `path.basename` (x30),
// `path.isAbsolute` (x1, only to warn about non-portable absolute paths), and
// `path.extname` (x1, in package-validation). `relative` and `resolve` are
// never reached; they exist here to satisfy the interface, so a future
// kmc-package version that starts calling them gets correct answers instead of
// a TypeError. Do not delete them, and do not invest in them either.

import { pathUtils } from "../compiler/pathUtils.js";

/** Convert Windows separators to POSIX. `.kps` member paths use backslashes. */
function toPosix(p: string | undefined | null): string {
  return (p ?? "").replace(/\\/g, "/");
}

/**
 * True only for path forms the VirtualFS can never hold: POSIX root-anchored
 * (`/x`), UNC (`//host/x`), or a Windows drive spec (`C:\x`).
 *
 * Everything the studio's VFS holds is rootless-relative, so in practice this
 * answers `false` — which is the point. kmc-package calls this solely to emit
 * `Warn_AbsolutePath` for paths that would not be portable to another machine
 * (kmp-compiler.js:423); answering `false` for our rootless keys keeps that
 * warning off the shipped package. Answering honestly for a genuinely absolute
 * `.kps` reference means it falls through to a loud lookup miss rather than
 * being silently reinterpreted as relative to `source/`.
 */
export function isAbsolute(name: string): boolean {
  const p = toPosix(name);
  return p.startsWith("/") || /^[A-Za-z]:\//.test(p);
}

/**
 * Rootless `resolve`. Node anchors at `process.cwd()`; here the VirtualFS root
 * IS the anchor, so the result is a rootless normalized path. The right-most
 * absolute-ish argument wins, matching Node's reset rule.
 *
 * Never called by kmc-package today — see the module header.
 */
export function resolve(...args: string[]): string {
  let acc = "";
  for (const a of args) {
    const p = toPosix(a);
    if (p === "") continue;
    acc = isAbsolute(p) ? p : acc === "" ? p : `${acc}/${p}`;
  }
  return isAbsolute(acc) ? acc : pathUtils.normalize(acc);
}

/**
 * Node-compatible `relative`.
 *
 * NOTE: unlike everything else in this module the result MAY start with `..`.
 * It is a display/derivation value, never a VirtualFS key, so it must NOT be
 * fed back through `pathUtils.normalize` (which would drop the `..`).
 *
 * Never called by kmc-package today — see the module header.
 */
export function relative(from: string, to: string): string {
  const a = pathUtils.normalize(toPosix(from)).split("/").filter(Boolean);
  const b = pathUtils.normalize(toPosix(to)).split("/").filter(Boolean);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return [...new Array<string>(a.length - i).fill(".."), ...b.slice(i)].join("/");
}

/**
 * Resolve a `.kps` member reference to a VirtualFS key.
 *
 *   ("source/bambara.kps", "..\\build\\bambara.kmx") -> "build/bambara.kmx"
 *   ("source/bambara.kps", "welcome.htm")            -> "source/welcome.htm"
 *   ("source/bambara.kps", "..\\LICENSE.md")         -> "LICENSE.md"
 *   ("bambara.kps",        "source/welcome.htm")     -> "source/welcome.htm"
 *
 * This is the single hinge of the whole .kmp path story: kmc-package's
 * `getMemberFileData` (kmp-compiler.js:490) calls
 * `resolveFilename` -> `fs.existsSync` -> `loadFile` on the SAME string, so all
 * three must agree on the key this returns.
 *
 * DELIBERATELY DIFFERENT from `compiler/index.ts`'s `resolveFilename`, whose
 * `|| /[/\\]/.test(filename)` branch returns any separator-containing path
 * verbatim — so it hands back `..\build\x.kmx` unresolved, backslashes and all.
 * That is survivable for the kmn bridge only because its `vfsPathCandidates`
 * falls back to basename matching. It is NOT survivable here, because a
 * basename fallback would let `source/x.kmx` masquerade as `build/x.kmx`.
 * `kmpPaths.test.ts` pins the divergence so the two are not "unified" later.
 *
 * Over-popping (`source/../../../etc/passwd`) is clamped by
 * `pathUtils.normalize` to a key that cannot exist in a rootless VFS, which
 * surfaces as a loud lookup miss. That clamp is the traversal safety net —
 * mirroring the `release/` prefix guard in `resolveKpsFontPath`.
 */
export function resolveFilename(baseFilename: string, filename: string): string {
  const f = toPosix(filename);
  if (f === "") return pathUtils.normalize(toPosix(baseFilename));
  if (isAbsolute(f)) return f;
  const dir = pathUtils.dirname(toPosix(baseFilename));
  return pathUtils.normalize(dir === "" ? f : `${dir}/${f}`);
}

/**
 * The complete `CompilerPathCallbacks` surface, for `callbacks.path`.
 *
 * `join` is inherited from pathUtils and does NOT normalize
 * (`join("source","..","x")` -> `"source/../x"`). That is why the VFS lookup
 * helpers in kmp.ts normalize their own argument rather than trusting an
 * incoming key — see the note there before "optimising" it away.
 */
export const kmpPathCallbacks = {
  dirname: pathUtils.dirname,
  extname: pathUtils.extname,
  basename: pathUtils.basename,
  join: pathUtils.join,
  normalize: pathUtils.normalize,
  isAbsolute,
  relative,
  resolve,
};
