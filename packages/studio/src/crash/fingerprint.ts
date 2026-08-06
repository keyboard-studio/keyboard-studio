// Client-local fingerprint (spec 060, FR-011, FR-020 – FR-024, research D8).
//
// WHAT THIS VALUE IS FOR, AND ONLY FOR: the key of the per-session dedupe cache
// in send.ts (FR-101). It is never transmitted (FR-021) and nothing on the
// server ever reads it. The fingerprint that actually decides which GitHub
// issue a report lands on is computed server-side in crash-report-pipeline.ts
// from the raw `kind`/`message`/`stackFrames` the client sends. That split is
// the whole point of P0-1: a client that cannot name a fingerprint on the wire
// cannot redirect a report onto an issue its own content does not hash to.
//
// TWO DELIBERATE DUPLICATIONS LIVE IN THIS FILE.
//
// 1. `crypto.subtle.digest("SHA-256", ...)` is called DIRECTLY. The engine
//    already ships `computeSha256Hex` in packages/engine/src/codec/hash.ts and
//    it is functionally identical — importing it is still forbidden (FR-011).
//    A failed engine chunk is one of the crash classes this module exists to
//    report; a reporter that imports the engine dies with it. The gate in
//    engine-reachability.test.ts is what keeps that from being re-"fixed" by a
//    well-meaning de-duplication pass.
//
// 2. The canonicalization below is the same algorithm as FR-081a's server-side
//    implementation in utilities/oauth-backend/src/crash-report-pipeline.ts.
//    The two cannot share code — one ships in a browser bundle, the other in a
//    serverless function outside the workspace — so they are kept in step by
//    each pinning the FR-081d worked example in its own test.

import type { CrashKind, StackFrame } from "./types.ts";

/** How many leading frames enter the hash. Must match the server's limit (FR-081a). */
export const CANONICAL_FRAME_LIMIT = 5;

/** Hex characters retained from the digest (FR-081c). */
export const FINGERPRINT_LENGTH = 12;

/** Placeholder substituted for any quoted, user-supplied substring. */
const REDACTED = "<redacted>";

/**
 * Normalize a message for hashing (FR-081a step 1).
 *
 * Two classes are removed, both for the same reason: they vary between two
 * occurrences of the SAME bug, so leaving them in would fork one bug into many
 * issues.
 *
 *  - Quoted substrings carry the user's own data — the property name, the file
 *    name, the keyboard id that happened to be loaded. `(reading 'exemplarSet')`
 *    becomes `(reading <redacted>)`.
 *  - Stack-trace addresses (a URL with a `:line:col` suffix) shift on every
 *    rebuild independently of any logic change.
 */
export function normalizeMessage(message: string): string {
  return message
    .replace(/https?:\/\/\S*?:\d+:\d+/g, REDACTED)
    .replace(/'[^']*'/g, REDACTED)
    .replace(/"[^"]*"/g, REDACTED)
    .replace(/`[^`]*`/g, REDACTED)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Collapse a build-specific chunk-hash suffix (FR-081a step 2).
 *
 * `assets/main-DLGH1X0S.js` → `assets/main.js`. The greedy prefix makes the
 * match bind to the LAST hyphen-delimited segment, so a module whose own name
 * contains hyphens (`assets/key-editor-DLGH1X0S.js`) loses only the hash.
 */
export function canonicalizeModulePath(modulePath: string): string {
  const match = /^(.*)-([\w-]{8,12})\.js$/.exec(modulePath);
  return match === null ? modulePath : `${match[1]}.js`;
}

/**
 * Render the frame portion: the top N frames as `function@modulePath`, with
 * `line`/`column` dropped (they shift on any rebuild) and chunk hashes
 * collapsed.
 */
export function canonicalizeFrames(frames: StackFrame[]): string[] {
  return frames
    .slice(0, CANONICAL_FRAME_LIMIT)
    .map((f) => `${f.function}@${canonicalizeModulePath(f.modulePath)}`);
}

/**
 * Join kind, normalized message, and canonical frames in that fixed order.
 *
 * The build identifier is deliberately absent (FR-081b): hashing it would fork
 * a new fingerprint on every deploy, defeating "one issue per bug".
 */
export function canonicalizeCrashInput(input: {
  kind: CrashKind | "pre-mount";
  message: string;
  frames: StackFrame[];
}): string {
  return [
    input.kind,
    normalizeMessage(input.message),
    ...canonicalizeFrames(input.frames),
  ].join("|");
}

/** Lowercase-hex encode a digest. */
function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Compute the client-local fingerprint: canonicalize → SHA-256 → lowercase hex
 * → first 12 characters.
 *
 * Returns `null` when Web Crypto is unavailable (an insecure origin, or an
 * environment that never provided `crypto.subtle`). The caller treats a null
 * fingerprint as "cannot dedupe this session" and sends anyway — a duplicate
 * report beats a dropped one, which is the same fail-open posture the server's
 * dedupe lookup takes (FR-096).
 */
export async function computeClientFingerprint(input: {
  kind: CrashKind | "pre-mount";
  message: string;
  frames: StackFrame[];
}): Promise<string | null> {
  const canonical = canonicalizeCrashInput(input);
  try {
    const subtle = globalThis.crypto?.subtle;
    if (subtle === undefined) return null;
    const digest = await subtle.digest(
      "SHA-256",
      new TextEncoder().encode(canonical),
    );
    return toHex(digest).slice(0, FINGERPRINT_LENGTH);
  } catch {
    return null;
  }
}
