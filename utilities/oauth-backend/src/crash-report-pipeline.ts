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

import {
  mintRetractionToken,
  verifyRetractionToken,
} from "./crash-report-retraction-token.js";
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

/**
 * Page size for the cap probe. GitHub's own hard ceiling for `per_page`.
 *
 * This is a CEILING, not a preference: asking for more returns 100 anyway. That
 * matters because the cap is 200, so a single page can never observe enough
 * creations to trip it — see `checkGlobalCreateCap`.
 */
export const CRASH_REPORT_CREATE_PROBE_PER_PAGE = 100;

/**
 * How many pages the cap probe may read, DERIVED from the cap rather than
 * chosen.
 *
 * The bound has to be `ceil(cap / per_page)` exactly. Fewer pages and the cap is
 * unreachable — which is the bug this constant exists to close. More pages and
 * every probe past the decisive one is a wasted call against the App's 5,000/hr
 * budget, in the middle of the flood the cap is trying to bound. Deriving it
 * means raising `CRASH_REPORT_GLOBAL_CREATE_CAP` cannot silently reintroduce the
 * unreachable-cap bug.
 */
export const CRASH_REPORT_CREATE_PROBE_MAX_PAGES = Math.ceil(
  CRASH_REPORT_GLOBAL_CREATE_CAP / CRASH_REPORT_CREATE_PROBE_PER_PAGE,
);

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

// ---------------------------------------------------------------------------
// GitHub REST caller #3 — see the vendoring note at the top of this file
// ---------------------------------------------------------------------------

/**
 * Pipeline-local fetch abstraction, structurally identical to
 * `GitHubPipelineFetchResponse` in github-pipeline.ts. Duplicated rather than
 * imported for the same reason the caller itself is: this module must stay
 * usable from the `api/**` function bundle without dragging in the managed-PR
 * pipeline's whole graph.
 */
export interface CrashReportFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type CrashReportFetchFn = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<CrashReportFetchResponse>;

export interface CrashReportPipelineConfig {
  /**
   * Returns a crash-App installation token per call, so @octokit/auth-app's
   * cache/refresh runs per-request rather than at startup (tokens expire ~1 h).
   * MUST be the crash App's minter, never the managed-PR one (FR-085).
   */
  getInstallationToken: () => Promise<string>;
  fetch: CrashReportFetchFn;
  /**
   * Key material for signing and verifying retraction capability tokens
   * (FR-074a). In production this is `CRASH_REPORT_APP_PRIVATE_KEY`, which the
   * token module domain-separates and hashes before use.
   *
   * REQUIRED, not optional, and that is the whole point: an optional field with
   * a "skip the check when absent" fallback is an authorization bypass one
   * missing env var away. A route that cannot supply this cannot construct a
   * config, and a route with no config already 503s.
   */
  retractionSecret: string;
}

export type CrashReportAction = "created" | "commented" | "reopened";

export type CrashReportHandlerResult =
  | {
      ok: true;
      data: {
        issueUrl: string;
        issueNumber: number;
        action: CrashReportAction;
        /** Set when this request added a comment; lets Undo remove that one. */
        commentId?: number;
        /**
         * Signed capability authorizing retraction of THIS report (FR-074a).
         *
         * The only thing that makes `POST /report/crash/retract` safe on a public
         * endpoint: the retract route reads its target out of this token, so a
         * caller who was never handed one cannot name an issue at all. Absent on
         * the retract route's own responses — retracting a retraction is not an
         * operation.
         */
        retractionToken?: string;
      };
    }
  | {
      ok: false;
      status: number;
      error: string;
      /** Surfaced via Retry-After on 429. */
      retryAfterSeconds?: number;
    };

/** The shape this module reads back from GitHub's issues API. */
export interface GitHubIssue {
  number: number;
  html_url: string;
  state: "open" | "closed";
  comments: number;
  updated_at: string;
  labels?: Array<{ name: string } | string>;
}

function buildHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

/**
 * Map a GitHub non-ok response to a safe handler error.
 *
 * Reproduces github-pipeline.ts's vocabulary exactly (FR-088): 401/403 mean the
 * installation token is missing or insufficient — a server-side
 * misconfiguration — and are surfaced generically, never revealing WHICH
 * credential or permission is at fault. A caller that could tell "wrong App"
 * from "missing issues:write" would be a probe for the App's configuration.
 */
export function mapNonOk(res: CrashReportFetchResponse): CrashReportHandlerResult {
  if (res.status === 401 || res.status === 403) {
    return { ok: false, status: 502, error: "submission_unavailable" };
  }
  if (res.status === 429) {
    // FR-098: honour the header, defaulting to 60 when absent or non-numeric.
    const ra = Number(res.headers.get("Retry-After") ?? "60");
    return {
      ok: false,
      status: 429,
      error: "rate_limited",
      retryAfterSeconds: Number.isFinite(ra) ? ra : 60,
    };
  }
  return { ok: false, status: 502, error: "upstream_error" };
}

export interface GitHubCalls {
  listByLabel(label: string): Promise<CrashReportFetchResponse>;
  /** One page of the cap probe. `page` is 1-based, as GitHub's API numbers them. */
  listCreatedSince(sinceIso: string, page: number): Promise<CrashReportFetchResponse>;
  createIssue(payload: {
    title: string;
    body: string;
    labels: string[];
  }): Promise<CrashReportFetchResponse>;
  addComment(issueNumber: number, body: string): Promise<CrashReportFetchResponse>;
  patchIssue(
    issueNumber: number,
    payload: { state?: "open" | "closed"; labels?: string[] },
  ): Promise<CrashReportFetchResponse>;
  deleteComment(commentId: number): Promise<CrashReportFetchResponse>;
}

/**
 * The six REST calls this pipeline makes, and nothing else.
 *
 * Built per-request around one minted token. Every method returns the raw
 * response so each branch decides between `mapNonOk` and a branch-specific
 * recovery — the dedupe lookup, for instance, fails OPEN to creation rather
 * than surfacing an error (FR-096).
 */
export function createGitHubCalls(
  token: string,
  fetchFn: CrashReportFetchFn,
): GitHubCalls {
  const repoBase = `${API_BASE}/repos/${CRASH_REPORT_OWNER}/${CRASH_REPORT_REPO}`;
  const call = (
    url: string,
    method = "GET",
    payload?: unknown,
  ): Promise<CrashReportFetchResponse> =>
    fetchFn(url, {
      method,
      headers: buildHeaders(token),
      ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
    });

  return {
    listByLabel: (label) =>
      call(
        `${repoBase}/issues?labels=${encodeURIComponent(label)}&state=all&per_page=5`,
      ),
    // `sort=created&direction=desc` is explicit rather than relying on the
    // default, because the probe's early exit depends on the newest creations
    // arriving first: `since=` filters on UPDATED time, so an old issue merely
    // commented on in the window is in the result set too, and only a pinned
    // created-descending order guarantees those sort BEHIND every in-window
    // creation instead of interleaving with them.
    listCreatedSince: (sinceIso, page) =>
      call(
        `${repoBase}/issues?state=all&since=${encodeURIComponent(sinceIso)}` +
          `&sort=created&direction=desc` +
          `&per_page=${CRASH_REPORT_CREATE_PROBE_PER_PAGE}&page=${page}`,
      ),
    createIssue: (payload) => call(`${repoBase}/issues`, "POST", payload),
    addComment: (issueNumber, body) =>
      call(`${repoBase}/issues/${issueNumber}/comments`, "POST", { body }),
    patchIssue: (issueNumber, payload) =>
      call(`${repoBase}/issues/${issueNumber}`, "PATCH", payload),
    // Deletes a COMMENT, never an issue — an installation token cannot delete
    // an issue, and the retraction contract (FR-075) does not ask it to.
    deleteComment: (commentId) =>
      call(`${repoBase}/issues/comments/${commentId}`, "DELETE", undefined),
  };
}

// ---------------------------------------------------------------------------
// Issue body
// ---------------------------------------------------------------------------

/**
 * Render the issue body.
 *
 * The `<!-- crash-fingerprint: … -->` trailer is for AUDITABILITY ONLY
 * (FR-092): it lets a maintainer confirm by eye that an issue's label matches
 * its content. Lookup reads the LABEL, never this comment — parsing bodies to
 * find duplicates would mean fetching every issue on every report.
 */
export function buildIssueBody(
  body: CrashReportBody,
  fingerprint: string,
  kind: CrashKind,
): string {
  const lines: string[] = [];
  lines.push(`**Kind:** \`${kind}\``);
  if (body.appVersion !== undefined) lines.push(`**Build:** \`${body.appVersion}\``);
  if (body.occurredAt !== undefined) lines.push(`**Occurred at:** ${body.occurredAt}`);
  lines.push("", "### Message", "", "```", body.message, "```");

  const frames = framesForBody(body);
  if (frames.length > 0) {
    lines.push("", "### Stack", "", "```");
    for (const f of frames) {
      const position =
        f.line !== undefined && f.column !== undefined
          ? `:${f.line}:${f.column}`
          : "";
      lines.push(`  at ${f.function} (${f.modulePath}${position})`);
    }
    lines.push("```");
  }

  const ctx = body.context;
  if (ctx !== undefined) {
    const rows: string[] = [];
    if (ctx.keyboardId !== undefined) rows.push(`| keyboard | \`${ctx.keyboardId}\` |`);
    if (ctx.bcp47Tags !== undefined) {
      rows.push(`| BCP47 | ${ctx.bcp47Tags.map((t) => `\`${t}\``).join(", ")} |`);
    }
    if (ctx.stepId !== undefined) rows.push(`| step | \`${ctx.stepId}\` |`);
    if (ctx.keyCount !== undefined) rows.push(`| keys | ${ctx.keyCount} |`);
    if (ctx.exemplarCount !== undefined) {
      rows.push(`| exemplars | ${ctx.exemplarCount} |`);
    }
    if (ctx.browserUA !== undefined) rows.push(`| browser | ${ctx.browserUA} |`);
    if (ctx.os !== undefined) rows.push(`| os | ${ctx.os} |`);
    if (rows.length > 0) {
      lines.push("", "### Context", "", "| | |", "|---|---|", ...rows);
    }

    if (ctx.decisionTail !== undefined && ctx.decisionTail.length > 0) {
      lines.push("", "### Recent decisions", "");
      for (const d of ctx.decisionTail) {
        lines.push(
          `- \`${d.id}\`${d.choice !== undefined ? ` -> \`${d.choice}\`` : ""}`,
        );
      }
    }

    if (ctx.breadcrumbs !== undefined && ctx.breadcrumbs.length > 0) {
      lines.push("", "### Breadcrumbs", "", "```");
      for (const b of ctx.breadcrumbs) {
        lines.push(`${b.at} [${b.channel}] ${b.label}`);
      }
      lines.push("```");
    }
  }

  lines.push("", `<!-- crash-fingerprint: ${fingerprint} -->`);
  return lines.join("\n");
}

/** Body of the comment added when a known fingerprint recurs. */
export function buildRecurrenceComment(
  body: CrashReportBody,
  kind: CrashKind,
): string {
  const parts = [`Seen again (\`${kind}\`).`];
  if (body.appVersion !== undefined) parts.push(`Build \`${body.appVersion}\`.`);
  if (body.occurredAt !== undefined) parts.push(`Occurred at ${body.occurredAt}.`);
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Issue title (FR-093a)
// ---------------------------------------------------------------------------

/** Prefix fixed by CLAUDE.md's `<prefix>(<area>): <description>` grammar. */
const TITLE_PREFIX = "bug(studio): ";

/** Total title budget, so an issue list stays scannable. */
export const CRASH_REPORT_TITLE_MAX = 72;

/**
 * Build the generated issue title: `bug(studio): <normalized message summary>`.
 *
 * `bug`, not `auto`. CLAUDE.md reserves `auto` for machine-generated
 * HOUSEKEEPING with no defect content (dependency bumps, version bumps) and
 * `bug` for a reported defect. The filer here is a machine, but the content is
 * a genuine defect an author actually hit — so `bug` classifies the content
 * correctly even though `auto` would describe the mechanism.
 *
 * MUST NOT contain the `kind`, the fingerprint, or the build id (FR-093a) —
 * those live in the body. A title carrying a 12-hex fingerprint is unreadable
 * in a repository issue list, which is the one place a title has to work.
 *
 * The summary is derived from the CANONICALIZED message, so the quoted
 * user-supplied substrings normalization already stripped never reach a public
 * title either.
 */
export function buildIssueTitle(normalizedMessage: string): string {
  const room = CRASH_REPORT_TITLE_MAX - TITLE_PREFIX.length;
  const summary =
    normalizedMessage.length <= room
      ? normalizedMessage
      : `${normalizedMessage.slice(0, room - 1).trimEnd()}…`;
  return `${TITLE_PREFIX}${summary}`;
}

// ---------------------------------------------------------------------------
// submitCrashReport — the route handler
// ---------------------------------------------------------------------------

/** Read an issue's label names, tolerating both shapes GitHub returns. */
export function labelNames(issue: GitHubIssue): string[] {
  return (issue.labels ?? []).map((l) => (typeof l === "string" ? l : l.name));
}

// ---------------------------------------------------------------------------
// Global creation cap (FR-106) — stateless, derived from the repo itself
// ---------------------------------------------------------------------------

/**
 * Probe recent issue-creation volume and decide whether creation may proceed.
 *
 * STATELESS BY DESIGN (FR-105). There is no KV, Redis, or Postgres behind this:
 * the state is the target repository's own recent issue list, which every
 * instance of the function can read and none of them has to keep in sync. That
 * is the difference between a cap that works across a fleet of cold-started
 * serverless invocations and one that works only when there happens to be one.
 *
 * This is the LAST line of defence, not the first. The client session cache
 * (FR-101), the fingerprint dedupe (FR-090), and the Vercel Firewall per-IP
 * rule all sit in front of it. What it stops is the case none of those can: a
 * distributed flood of GENUINELY DISTINCT fingerprints, where every report is
 * legitimately new and every one would otherwise create an issue.
 *
 * Returns `null` when creation may proceed, or a `rate_limited` result when it
 * may not. A failed probe returns `null` — fails OPEN, matching the dedupe
 * lookup (FR-096): the cap exists to stop a flood, not to become one more way a
 * genuine report is silently dropped.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS PAGINATES, AND WHY IT USUALLY MAKES EXACTLY ONE CALL
 * ---------------------------------------------------------------------------
 *
 * The original single-request form could never trip. `per_page` is capped at 100
 * by GitHub, so one page observes at most 100 creations, while the cap is 200 —
 * `createdInWindow >= 200` was unsatisfiable and the documented "last line of
 * defence" was dead code in production. The unit tests did not catch it because a
 * stub `fetch` ignores `per_page` and happily returns a 200-element fixture no
 * real API page could contain.
 *
 * The fix is pagination bounded by `CRASH_REPORT_CREATE_PROBE_MAX_PAGES`, with
 * two early exits that keep the common case free:
 *
 *   - A SHORT PAGE means there is nothing after it, so stop.
 *   - A page contributing ZERO in-window creations means every later page is
 *     older still (the query pins created-descending order), so stop.
 *
 * A healthy tracker returns a handful of issues on page 1 and exits on the first
 * check — one request, exactly as before. Extra requests are spent only while an
 * actual flood is in progress, which is the one time they are worth spending.
 */
export async function checkGlobalCreateCap(
  gh: GitHubCalls,
  now: number,
): Promise<CrashReportHandlerResult | null> {
  const windowStart = now - CRASH_REPORT_GLOBAL_CREATE_WINDOW_MS;
  const since = new Date(windowStart).toISOString();

  let createdInWindow = 0;

  for (let page = 1; page <= CRASH_REPORT_CREATE_PROBE_MAX_PAGES; page += 1) {
    let res: CrashReportFetchResponse;
    try {
      res = await gh.listCreatedSince(since, page);
    } catch {
      return null;
    }
    if (!res.ok) return null;

    let issues: GitHubIssue[];
    try {
      issues = (await res.json()) as GitHubIssue[];
    } catch {
      return null;
    }
    if (!Array.isArray(issues)) return null;

    // `since` filters on UPDATED time, so the response includes issues merely
    // commented on in the window. Only genuine creations count against a
    // CREATION cap — otherwise a busy tracker caps itself on comment traffic.
    const createdThisPage = issues.filter((i) => {
      const created = Date.parse(
        (i as unknown as { created_at?: string }).created_at ?? "",
      );
      return Number.isFinite(created) && created >= windowStart;
    }).length;

    createdInWindow += createdThisPage;
    if (createdInWindow >= CRASH_REPORT_GLOBAL_CREATE_CAP) break;

    // Either exit means no later page can add to the count. See the note above.
    if (issues.length < CRASH_REPORT_CREATE_PROBE_PER_PAGE) break;
    if (createdThisPage === 0) break;
  }

  if (createdInWindow < CRASH_REPORT_GLOBAL_CREATE_CAP) return null;

  return {
    ok: false,
    status: 429,
    error: "rate_limited",
    retryAfterSeconds: Math.ceil(CRASH_REPORT_GLOBAL_CREATE_WINDOW_MS / 1000),
  };
}

/** Label added on reopen, so a regression is distinguishable at a glance. */
export const REGRESSION_LABEL = "regression";

/**
 * Look up an existing issue by the fingerprint label.
 *
 * Returns `null` both when there is genuinely no match and when the lookup
 * itself failed — the caller treats the two identically and creates (FR-096).
 * Collapsing them is deliberate: the only alternative is surfacing a lookup
 * failure as an error, which drops the report entirely.
 */
export async function findExistingIssue(
  gh: GitHubCalls,
  label: string,
): Promise<GitHubIssue | null> {
  let res: CrashReportFetchResponse;
  try {
    res = await gh.listByLabel(label);
  } catch {
    return null;
  }
  if (!res.ok) return null;

  try {
    const issues = (await res.json()) as GitHubIssue[];
    if (!Array.isArray(issues) || issues.length === 0) return null;
    return issues[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Read the created comment's id from GitHub's response.
 *
 * Returned to the client so Undo can remove THIS session's comment and nothing
 * else (FR-076). A missing or malformed id degrades to "no id", which makes
 * Undo unavailable for that report — the correct failure: better no retraction
 * than a retraction that guesses which comment to delete.
 */
async function readCommentId(
  res: CrashReportFetchResponse,
): Promise<{ commentId?: number }> {
  try {
    const json = (await res.json()) as { id?: unknown };
    return typeof json.id === "number" ? { commentId: json.id } : {};
  } catch {
    return {};
  }
}

/** Has this issue had a comment recently enough, or often enough, to skip? */
function commentIsCapped(issue: GitHubIssue, now: number): boolean {
  if (issue.comments >= CRASH_REPORT_COMMENT_CAP) return true;
  const updated = Date.parse(issue.updated_at);
  if (!Number.isFinite(updated)) return false;
  return now - updated < CRASH_REPORT_COMMENT_COOLDOWN_MS;
}

/**
 * Handle a fingerprint that already has an issue.
 *
 * Every decision here is derived from the matched issue's OWN metadata —
 * `state`, `comments`, `updated_at`, and its labels. No KV, no Redis, no
 * Postgres (FR-105): the tracker is the state store, which is what makes this
 * correct across a fleet of independently cold-started serverless invocations.
 */
async function handleExistingIssue(
  gh: GitHubCalls,
  issue: GitHubIssue,
  body: CrashReportBody,
  kind: CrashKind,
  now: number,
): Promise<CrashReportHandlerResult> {
  const found = {
    issueUrl: issue.html_url,
    issueNumber: issue.number,
  };

  if (issue.state === "open") {
    // NO STATE-CHANGE CALL IS MADE AT ALL (FR-094). An open issue has no state
    // left to change, and a PATCH that sets `state: "open"` on an already-open
    // issue is a write that bumps `updated_at` — corrupting the very signal the
    // comment cooldown below reads.
    if (commentIsCapped(issue, now)) {
      // Still a 200 with action "commented" (FR-104). The report was received
      // and correctly attributed; the comment was merely redundant. Surfacing
      // this as an error would make the client treat successful flood control
      // as a failure.
      return { ok: true, data: { ...found, action: "commented" } };
    }

    const commented = await gh.addComment(
      issue.number,
      buildRecurrenceComment(body, kind),
    );
    if (!commented.ok) return mapNonOk(commented);
    return {
      ok: true,
      data: { ...found, action: "commented", ...(await readCommentId(commented)) },
    };
  }

  // --- Closed match ---------------------------------------------------------
  //
  // Two rules that look contradictory until you see which signal each reads:
  //
  //   "The first hit after a close ALWAYS reopens"  (FR-095, the signal)
  //   "A repeat within the cooldown is suppressed"  (FR-095a, the churn bound)
  //
  // They are reconciled by the `regression` label, which is itself the
  // stateless record of "we have already reopened this one". An issue closed by
  // a maintainer does not carry it, so the first recurrence reopens no matter
  // how recent the close — the cooldown never eats the signal. An issue that
  // already carries it was reopened by this pipeline, and a second reopen
  // inside the window is churn, so it is suppressed.
  //
  // Reading `updated_at` alone would break the first rule: a maintainer who
  // closes an issue sets `updated_at` to now, so a recurrence one minute later
  // would fall "inside the cooldown" and be dropped — silently discarding the
  // single most valuable report the tracker can receive.
  const alreadyReopened = labelNames(issue).includes(REGRESSION_LABEL);
  const updated = Date.parse(issue.updated_at);
  const withinCooldown =
    Number.isFinite(updated) && now - updated < CRASH_REPORT_REOPEN_COOLDOWN_MS;

  if (alreadyReopened && withinCooldown) {
    // Suppressed — the same non-fatal shape a capped comment returns (P0-A).
    return { ok: true, data: { ...found, action: "commented" } };
  }

  const labels = Array.from(new Set([...labelNames(issue), REGRESSION_LABEL]));
  const reopened = await gh.patchIssue(issue.number, { state: "open", labels });
  if (!reopened.ok) return mapNonOk(reopened);

  // The reopen comment is NOT comment-capped (FR-095a): a reopen is a distinct,
  // rare event, and the cap exists to bound chatter on a busy open issue.
  const commented = await gh.addComment(
    issue.number,
    buildRecurrenceComment(body, kind),
  );
  if (!commented.ok) return mapNonOk(commented);

  return {
    ok: true,
    data: { ...found, action: "reopened", ...(await readCommentId(commented)) },
  };
}

/**
 * Run the crash-report pipeline for a validated body.
 *
 * Returns a discriminated result and never throws, in the same shape
 * github-pipeline.ts uses, so the route can `if (!result.ok)
 * reply.status(result.status)`.
 *
 * Error mapping (all token-leak-safe, per `mapNonOk`):
 *  - Network throw              -> 502 submission_unavailable
 *  - GitHub 401/403             -> 502 submission_unavailable (server misconfig)
 *  - GitHub 429                 -> 429 rate_limited (+ retryAfterSeconds)
 *  - Global creation cap hit    -> 429 rate_limited (+ retryAfterSeconds)
 *  - Any other non-ok           -> 502 upstream_error
 */
export async function submitCrashReport(
  rawBody: CrashReportBody,
  config: CrashReportPipelineConfig,
  /** Injectable clock, so cooldown and cap windows are testable without waiting. */
  now: number = Date.now(),
): Promise<CrashReportHandlerResult> {
  // Scrub BEFORE anything is written. The client's allowlist should mean there
  // is nothing to find; this route accepts a POST from anywhere and everything
  // it writes lands in a public issue, so "should" is not the control.
  const body = scrubBody(rawBody);
  const kind = kindForBody(body);
  const { fingerprint } = computeFingerprint(body);
  const label = fingerprintLabel(fingerprint);

  // Minted once per request. A throw here propagates to the caller, which maps
  // it to 502 submission_unavailable.
  const token = await config.getInstallationToken();
  const gh = createGitHubCalls(token, config.fetch);

  try {
    let result: CrashReportHandlerResult;

    // -----------------------------------------------------------------------
    // Dedupe lookup (FR-090, FR-091)
    //
    // `GET /search/issues` MUST NOT BE USED HERE, EVER, and the reason is not
    // stylistic:
    //
    //   1. INDEXING LAG. The search index trails writes by seconds to minutes.
    //      A crash that recurs 20 seconds after the first occurrence — which is
    //      the normal case, not the edge case, because the author retries what
    //      just broke — would not find the issue that was created for it, and
    //      would create a second one. Dedupe that fails exactly when reports
    //      cluster is worse than no dedupe: it produces bursts of duplicates
    //      under precisely the load it exists to control.
    //
    //   2. RATE LIMIT. Search allows 30 requests per minute, shared across the
    //      WHOLE installation. Ordinary REST gives 5,000 per hour. At one
    //      lookup per report, search caps the route at 30 reports/minute
    //      globally — a limit a single bad deploy would blow through.
    //
    // The label endpoint below is read-after-write consistent and draws on the
    // ordinary budget. That is why the fingerprint is a LABEL and not a body
    // trailer: the trailer (FR-092) exists for a human auditing an issue, and
    // finding duplicates by it would mean fetching every issue in the repo.
    //
    // FAILS OPEN (FR-096): a lookup error falls through to creation. A
    // duplicate issue is a nuisance; a dropped crash report is a lost defect.
    const match = await findExistingIssue(gh, label);

    if (match !== null) {
      result = await handleExistingIssue(gh, match, body, kind, now);
    } else {
      const capped = await checkGlobalCreateCap(gh, now);
      if (capped !== null) return capped;

      const created = await gh.createIssue({
        title: buildIssueTitle(normalizeMessage(body.message)),
        body: buildIssueBody(body, fingerprint, kind),
        labels: [label],
      });
      if (!created.ok) return mapNonOk(created);
      const issue = (await created.json()) as { number: number; html_url: string };
      result = {
        ok: true,
        data: {
          issueUrl: issue.html_url,
          issueNumber: issue.number,
          action: "created",
        },
      };
    }

    // Every ok path funnels through here, so no success branch can ship without
    // the capability the retract route requires. Attaching it at the single exit
    // rather than at each `return` is what makes that structural: a new branch
    // in handleExistingIssue inherits the token instead of silently omitting it
    // and making Undo a no-op for that case.
    return withRetractionToken(result, config.retractionSecret, now);
  } catch {
    // Network-level error — do not propagate internal details.
    return { ok: false, status: 502, error: "submission_unavailable" };
  }
}

// ---------------------------------------------------------------------------
// Retraction (FR-074 – FR-077)
// ---------------------------------------------------------------------------

/** Comment left in place of a retracted report, so the close is explicable. */
export const RETRACTION_COMMENT =
  "Retracted by reporter — this crash report was withdrawn from the studio within the undo window.";

/**
 * Attach a retraction capability to a successful report result (FR-074a).
 *
 * A non-ok result is returned untouched: there is nothing to retract, and
 * minting a token for a report that was never filed would hand out a capability
 * naming an issue number the caller supplied nothing to derive.
 */
function withRetractionToken(
  result: CrashReportHandlerResult,
  secret: string,
  now: number,
): CrashReportHandlerResult {
  if (!result.ok) return result;
  return {
    ok: true,
    data: {
      ...result.data,
      retractionToken: mintRetractionToken(
        {
          issueNumber: result.data.issueNumber,
          action: result.data.action,
          commentId: result.data.commentId,
        },
        secret,
        now,
      ),
    },
  };
}

/**
 * Retract a report this session just filed.
 *
 * THE TARGET COMES FROM THE TOKEN, NEVER FROM THE REQUEST BODY (FR-074a, P0-6).
 *
 * This endpoint is public and unauthenticated, and issue numbers on
 * keyboard-studio/crash-reports are sequential and public. An earlier form read
 * `issueNumber` / `action` / `commentId` straight off the parsed body, which let
 * any anonymous caller close or comment-delete an arbitrary crash report that
 * was not theirs; the 30 s Undo window is UI state in CrashNotice.tsx and binds
 * only a caller who bothered to load the SPA. The signed token
 * (crash-report-retraction-token.ts) closes that: the caller supplies one opaque
 * string, the server reads the parameters out of it, and a token it never issued
 * does not verify. Same move as removing `fingerprint` from the wire schema
 * (P0-1) — the forgeable field is gone rather than validated.
 *
 * TWO PATHS, AND NEITHER IS A DELETE OF THE ISSUE.
 *
 *   "created"   -> CLOSE the issue and add a retraction comment. An
 *                  installation token cannot delete an issue at all, so a true
 *                  delete is not merely undesirable, it is unavailable — which
 *                  is exactly why FR-077 forbids UI copy implying deletion.
 *                  Closing with an explanatory comment leaves an honest record:
 *                  a maintainer scanning the tracker sees why it is closed
 *                  rather than finding a gap in the issue numbers.
 *
 *   "commented" -> DELETE only this session's comment. The issue's open/closed
 *                  state is not touched and no other comment is affected. The
 *                  issue belongs to everyone who hit that bug; retracting one
 *                  person's report must not close it for the rest.
 *
 * A `"reopened"` report is treated as `"commented"`: the reopen itself is a
 * fact about the bug recurring, not about this author's report, so it stands.
 */
export async function retractCrashReport(
  body: { retractionToken: string },
  config: CrashReportPipelineConfig,
  /** Injectable clock, so token expiry is testable without waiting. */
  now: number = Date.now(),
): Promise<CrashReportHandlerResult> {
  const request = verifyRetractionToken(body.retractionToken, config.retractionSecret, now);
  if (request === null) {
    // 403 with ONE undifferentiated message for every rejection reason. Verified
    // BEFORE the token mint and before any GitHub call, so a forged or expired
    // token costs nothing against the App's rate budget.
    return { ok: false, status: 403, error: "retraction_not_authorized" };
  }

  const token = await config.getInstallationToken();
  const gh = createGitHubCalls(token, config.fetch);

  try {
    if (request.action === "created") {
      const commented = await gh.addComment(request.issueNumber, RETRACTION_COMMENT);
      if (!commented.ok) return mapNonOk(commented);

      const closed = await gh.patchIssue(request.issueNumber, { state: "closed" });
      if (!closed.ok) return mapNonOk(closed);

      return {
        ok: true,
        data: {
          issueUrl: issueUrlFor(request.issueNumber),
          issueNumber: request.issueNumber,
          action: "created",
        },
      };
    }

    // "commented" / "reopened" — remove only this session's comment.
    if (request.commentId === undefined) {
      // Nothing identifiable to remove. Non-fatal: the report simply stands.
      return {
        ok: true,
        data: {
          issueUrl: issueUrlFor(request.issueNumber),
          issueNumber: request.issueNumber,
          action: request.action,
        },
      };
    }

    const deleted = await gh.deleteComment(request.commentId);
    if (!deleted.ok) return mapNonOk(deleted);

    return {
      ok: true,
      data: {
        issueUrl: issueUrlFor(request.issueNumber),
        issueNumber: request.issueNumber,
        action: request.action,
      },
    };
  } catch {
    return { ok: false, status: 502, error: "submission_unavailable" };
  }
}

/** The public URL of an issue in the crash-reports repository. */
export function issueUrlFor(issueNumber: number): string {
  return `https://github.com/${CRASH_REPORT_OWNER}/${CRASH_REPORT_REPO}/issues/${issueNumber}`;
}
