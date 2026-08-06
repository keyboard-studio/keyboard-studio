/**
 * Crash-report pipeline (spec 060) — canonicalization, fingerprinting, the
 * server-side scrub, and the GitHub calls that file the issue.
 *
 * ---------------------------------------------------------------------------
 * VENDORING NOTE — this is GitHub REST caller #3 (FR-084)
 * ---------------------------------------------------------------------------
 *
 * In the style of the note at github-pipeline.ts:9-24. The repository now has
 * three hand-written GitHub REST callers:
 *
 *   1. packages/engine/src/output/github.ts   — Option A, the user's own token
 *   2. utilities/oauth-backend/src/github-pipeline.ts — Option B, managed PR
 *   3. this module                            — crash reports, issues only
 *
 * EXTRACTION IS BLOCKED, and not for want of trying. Caller #1 ships in the
 * browser bundle and holds a user OAuth token. Caller #2 runs server-side under
 * the managed-PR App and speaks the Git Data API (trees, commits, refs, pulls).
 * This one runs server-side under a DIFFERENT App with issues:write on one
 * repository and speaks only the Issues API. A shared client would have to be
 * reachable from `api/**`, which forbids value-importing any
 * `@keyboard-studio/*` package (api/bundle-safety.test.ts) — so #1 is out of
 * reach by construction — and it would have to take the credential as a
 * parameter, which is precisely the coupling FR-085 exists to prevent: the
 * whole point of the second App is that no code path can hand the crash route
 * a token with write access to keyboard-studio/keyboards.
 *
 * What IS shared is the vocabulary. `mapNonOk` below reproduces
 * github-pipeline.ts's error mapping exactly — 401/403 → 502
 * `submission_unavailable`, 429 → `rate_limited` with `Retry-After`, anything
 * else non-ok → 502 `upstream_error` — so the SPA sees one error language
 * across both submission paths.
 *
 * BUNDLE SAFETY: value-imports nothing from `@keyboard-studio/*`. See
 * api/bundle-safety.test.ts for why that is an outage-class invariant and not a
 * style rule.
 */

import { createHash } from "node:crypto";

import type {
  CrashContext,
  CrashKind,
  CrashReportBody,
  CrashStackFrame,
} from "./crash-report-schemas.js";

// ---------------------------------------------------------------------------
// Target repository — a SOURCE CONSTANT, never request-derived (FR-089)
// ---------------------------------------------------------------------------

/**
 * The crash App's installation is scoped to this one repository, so a
 * request-derived target could not reach anything else even if one existed.
 * Keeping it a source constant means the route has no repository parameter to
 * validate, sanitize, or get wrong.
 */
export const CRASH_REPORT_OWNER = "keyboard-studio";
export const CRASH_REPORT_REPO = "crash-reports";

const API_BASE = "https://api.github.com";

// ---------------------------------------------------------------------------
// Flood-control constants (FR-103) — named, exported, never inlined literals
// ---------------------------------------------------------------------------

/** Max comments added to one issue before further comments are silently skipped. */
export const CRASH_REPORT_COMMENT_CAP = 20;

/** Min gap between comments on the same issue. */
export const CRASH_REPORT_COMMENT_COOLDOWN_MS = 600_000;

/** Min gap between reopens of the same issue. Bounds churn, never the signal. */
export const CRASH_REPORT_REOPEN_COOLDOWN_MS = 600_000;

/** Window the global creation cap is measured over. */
export const CRASH_REPORT_GLOBAL_CREATE_WINDOW_MS = 600_000;

/** Max issues created repo-wide within the window before creation is skipped. */
export const CRASH_REPORT_GLOBAL_CREATE_CAP = 200;

// ---------------------------------------------------------------------------
// Canonicalization (FR-081a – FR-081f) — PURE, no I/O (FR-081e)
// ---------------------------------------------------------------------------

/** How many leading frames enter the hash. Must match the client's limit. */
export const CANONICAL_FRAME_LIMIT = 5;

/** Hex characters retained from the digest for the label (FR-081c). */
export const FINGERPRINT_LENGTH = 12;

/** Placeholder substituted for any quoted, user-supplied substring. */
const REDACTED = "<redacted>";

/** Substituted when a frame carries no function name (FR-081f step 4). */
const ANONYMOUS = "<anonymous>";

/**
 * V8 (`    at fn (path:line:col)`) and Firefox/Safari (`fn@path:line:col`)
 * frame shapes in one pattern, exactly as FR-081f pins it.
 */
const RAW_FRAME_RE =
  /^\s*(?:at\s+)?(?:(?<fn>[^\s@()]+)\s*[@(]\s*)?(?<path>[^\s():]+):(?<line>\d+):(?<col>\d+)\)?\s*$/;

/**
 * Normalize a message for hashing (FR-081a step 1).
 *
 * Removes the two classes that vary between two occurrences of the SAME bug and
 * would otherwise fork one bug into many issues: quoted substrings (which carry
 * the author's own data — a property name, a keyboard id) and stack-trace
 * addresses (which shift on every rebuild).
 *
 * Mirrors packages/studio/src/crash/fingerprint.ts. The two cannot share code —
 * one ships in a browser bundle, the other in a function bundle outside the
 * workspace — so each pins the FR-081d worked example in its own test.
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
 * `assets/main-DLGH1X0S.js` → `assets/main.js`. The greedy prefix binds the
 * match to the LAST hyphen-delimited segment, so a module whose own name
 * contains hyphens loses only the hash.
 */
export function canonicalizeModulePath(modulePath: string): string {
  const match = /^(.*)-([\w-]{8,12})\.js$/.exec(modulePath);
  return match === null ? modulePath : `${match[1]}.js`;
}

/**
 * Extract frames from a raw `Error.stack` string (FR-081f).
 *
 * Step 2 is the subtle one: the first line is discarded only when it is NOT
 * itself a frame. V8 prepends the error's own message line; Firefox and Safari
 * do not, so an unconditional `shift()` would eat a real frame there and fork
 * one pre-mount bug into a per-browser issue — the exact failure FR-081f exists
 * to close.
 */
export function framesFromRawStack(stack: string): CrashStackFrame[] {
  const lines = stack.split("\n");
  const first = lines[0];
  if (first !== undefined && !RAW_FRAME_RE.test(first)) lines.shift();

  const frames: CrashStackFrame[] = [];
  for (const line of lines) {
    if (frames.length >= CANONICAL_FRAME_LIMIT) break;
    const match = RAW_FRAME_RE.exec(line);
    if (match?.groups === undefined) continue;
    const { fn, path, line: ln, col } = match.groups;
    // `path` is the one mandatory group; a match without it is not a frame.
    if (path === undefined) continue;
    frames.push({
      function: fn ?? ANONYMOUS,
      modulePath: path,
      line: Number(ln),
      column: Number(col),
    });
  }
  return frames;
}

/**
 * Render the frame portion: the top N frames as `function@modulePath`, with
 * `line`/`column` dropped and chunk hashes collapsed.
 */
export function canonicalizeFrames(frames: CrashStackFrame[]): string[] {
  return frames
    .slice(0, CANONICAL_FRAME_LIMIT)
    .map((f) => `${f.function}@${canonicalizeModulePath(f.modulePath)}`);
}

/**
 * Join kind, normalized message, and canonical frames in that fixed order.
 *
 * PURE (FR-081e): no I/O, no request headers, no dependence on which repository
 * or label currently exists. That is what makes it unit-testable in isolation
 * from every GitHub-calling part of this module.
 *
 * The build identifier is deliberately absent (FR-081b): hashing it would fork
 * a new issue on every deploy, defeating "one issue per bug".
 */
export function canonicalizeCrashInput(input: {
  kind: CrashKind;
  message: string;
  frames: CrashStackFrame[];
}): string {
  return [
    input.kind,
    normalizeMessage(input.message),
    ...canonicalizeFrames(input.frames),
  ].join("|");
}

/**
 * Reduce a validated body to the single canonical frame array both input shapes
 * converge on (FR-081a).
 *
 * Structured `stackFrames` wins when present; otherwise a raw `stack` string is
 * parsed by FR-081f's rule. Both shapes normalize to one array BEFORE
 * canonicalization runs, so there is exactly one canonicalization path — not a
 * structured path and a string path that could drift apart.
 */
export function framesForBody(body: CrashReportBody): CrashStackFrame[] {
  if (body.stackFrames !== undefined && body.stackFrames.length > 0) {
    return body.stackFrames;
  }
  if (body.stack !== undefined && body.stack !== "") {
    return framesFromRawStack(body.stack);
  }
  // Neither present: the frame portion contributes nothing and the canonical
  // string is kind + normalized message alone (FR-081a).
  return [];
}

/** An absent `kind` is `"pre-mount"` (FR-081, FR-006, P0-B). Applied before canonicalization. */
export function kindForBody(body: CrashReportBody): CrashKind {
  return body.kind ?? "pre-mount";
}

/** SHA-256 → lowercase hex → first 12 characters (FR-081c). */
export function fingerprintOf(canonical: string): string {
  return createHash("sha256")
    .update(canonical, "utf8")
    .digest("hex")
    .slice(0, FINGERPRINT_LENGTH);
}

/**
 * The whole fingerprint derivation for a validated body, in one call.
 *
 * The server derives this from the content it holds. There is no
 * client-supplied fingerprint to read — the schema has no such field — so a
 * forged report can only ever land on the issue its own content hashes to
 * (P0-1).
 */
export function computeFingerprint(body: CrashReportBody): {
  canonical: string;
  fingerprint: string;
} {
  const canonical = canonicalizeCrashInput({
    kind: kindForBody(body),
    message: body.message,
    frames: framesForBody(body),
  });
  return { canonical, fingerprint: fingerprintOf(canonical) };
}

/** The dedupe label for a fingerprint. The ONLY thing lookup reads (FR-090). */
export function fingerprintLabel(fingerprint: string): string {
  return `crash/fp-${fingerprint}`;
}

// ---------------------------------------------------------------------------
// Server-side scrub — defence in depth, before any GitHub write (FR-033)
// ---------------------------------------------------------------------------

/**
 * Secret-shaped tokens. The client's allowlist should mean none of these ever
 * arrives, but "should" is not a security control: this route accepts a POST
 * from anywhere, and anything written here lands in a public issue body.
 */
const SECRET_PATTERNS: RegExp[] = [
  /gh[pousr]_[A-Za-z0-9]{16,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /sk-[A-Za-z0-9_-]{16,}/g,
  /AKIA[0-9A-Z]{12,}/g,
  /xox[bp]-[A-Za-z0-9-]{10,}/g,
  // Generic long hex / base64 runs. Deliberately last and deliberately blunt.
  /\b[A-Fa-f0-9]{32,}\b/g,
  /\b[A-Za-z0-9+/]{40,}={0,2}\b/g,
];

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** GitHub @mention shape, per FR-033a. */
const MENTION_RE = /@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})/g;

/** Markdown image and raw `<img>` (FR-033b). */
const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)]*)\)/g;
const HTML_IMG_RE = /<img\b[^>]*>/gi;

/** Zero-width space — breaks a mention's linkability without hiding the text. */
const ZWSP = "​";

/**
 * Scrub text bound for a public issue.
 *
 * Order matters. Emails go before mentions: an email's local part would
 * otherwise survive while `@example.com` got mention-neutralized, leaving a
 * half-redacted address that still identifies someone. Images go before
 * mentions too, so an alt-text `@name` is neutralized inside the plain-text
 * link the image becomes rather than inside markup that is about to be
 * rewritten.
 *
 * Mentions are NEUTRALIZED, not removed (FR-033a): a stack frame legitimately
 * containing `@vitejs/plugin-react` must stay readable. Inserting a zero-width
 * space after the `@` stops GitHub linking (and notifying) it while leaving the
 * text intact for a human reader.
 */
export function scrubText(text: string): string {
  let out = text;

  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, "<redacted-secret>");
  }
  out = out.replace(EMAIL_RE, "<redacted-email>");

  // Images: keep the destination as plain text so a maintainer can still see
  // what was referenced, without GitHub fetching or rendering it.
  out = out.replace(MD_IMAGE_RE, (_m, alt: string, href: string) =>
    href === "" ? `(image: ${alt})` : `(image: ${alt} -> ${href})`,
  );
  out = out.replace(HTML_IMG_RE, "(image removed)");

  out = out.replace(MENTION_RE, (m) => `@${ZWSP}${m.slice(1)}`);

  return out;
}

/** Scrub every string a `CrashContext` carries. */
export function scrubContext(context: CrashContext): CrashContext {
  const out: CrashContext = {};
  if (context.keyboardId !== undefined) out.keyboardId = scrubText(context.keyboardId);
  if (context.bcp47Tags !== undefined) out.bcp47Tags = context.bcp47Tags.map(scrubText);
  if (context.stepId !== undefined) out.stepId = scrubText(context.stepId);
  if (context.keyCount !== undefined) out.keyCount = context.keyCount;
  if (context.exemplarCount !== undefined) out.exemplarCount = context.exemplarCount;
  if (context.decisionTail !== undefined) {
    out.decisionTail = context.decisionTail.map((e) => ({
      id: scrubText(e.id),
      ...(e.choice !== undefined ? { choice: scrubText(e.choice) } : {}),
    }));
  }
  if (context.breadcrumbs !== undefined) {
    out.breadcrumbs = context.breadcrumbs.map((b) => ({
      at: b.at,
      channel: b.channel,
      label: scrubText(b.label),
    }));
  }
  if (context.browserUA !== undefined) out.browserUA = scrubText(context.browserUA);
  if (context.os !== undefined) out.os = scrubText(context.os);
  return out;
}

/** Scrub every string a validated body carries, before anything is written. */
export function scrubBody(body: CrashReportBody): CrashReportBody {
  return {
    ...(body.kind !== undefined ? { kind: body.kind } : {}),
    message: scrubText(body.message),
    ...(body.stackFrames !== undefined
      ? {
          stackFrames: body.stackFrames.map((f) => ({
            function: scrubText(f.function),
            modulePath: scrubText(f.modulePath),
            ...(f.line !== undefined ? { line: f.line } : {}),
            ...(f.column !== undefined ? { column: f.column } : {}),
          })),
        }
      : {}),
    ...(body.stack !== undefined ? { stack: scrubText(body.stack) } : {}),
    ...(body.appVersion !== undefined ? { appVersion: scrubText(body.appVersion) } : {}),
    ...(body.occurredAt !== undefined ? { occurredAt: body.occurredAt } : {}),
    ...(body.context !== undefined ? { context: scrubContext(body.context) } : {}),
  };
}
