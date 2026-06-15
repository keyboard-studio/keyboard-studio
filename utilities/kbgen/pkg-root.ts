// Resolves the kbgen package root (the directory containing data/) regardless of
// execution context:
//   - tsx from repo root:      import.meta.url -> .../kbgen/pkg-root.ts -> dir = .../kbgen       -> use as-is
//   - node dist/cli.js:        import.meta.url -> .../kbgen/dist/pkg-root.js -> dir = .../kbgen/dist -> step up one
//   - node dist/sources/*.js:  same pkg-root.js import -> dir = .../kbgen/dist                   -> step up one
//
// All callers (cli.ts, fetch-data.ts, analyze.ts, sources/*.ts) previously inlined
// their own copy of this logic with subtly different predicates. This single helper
// is the authoritative version.

import path from "node:path";
import { fileURLToPath } from "node:url";

const _dir = path.dirname(fileURLToPath(import.meta.url));

export function pkgRoot(): string {
  // When compiled, this module lives in dist/; step up one to the package root.
  // When run via tsx, this module lives at the package root; return as-is.
  return _dir.endsWith("dist") ? path.join(_dir, "..") : _dir;
}
