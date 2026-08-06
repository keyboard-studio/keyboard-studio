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
}

export type CrashReportAction = "created" | "commented" | "reopened";

export type CrashReportHandlerResult =
  | {
      ok: true;
      data: { issueUrl: string; issueNumber: number; action: CrashReportAction };
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
  listCreatedSince(sinceIso: string): Promise<CrashReportFetchResponse>;
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
    listCreatedSince: (sinceIso) =>
      call(
        `${repoBase}/issues?state=all&since=${encodeURIComponent(sinceIso)}&per_page=100`,
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
 */
export async function checkGlobalCreateCap(
  gh: GitHubCalls,
  now: number,
): Promise<CrashReportHandlerResult | null> {
  const since = new Date(now - CRASH_REPORT_GLOBAL_CREATE_WINDOW_MS).toISOString();

  let res: CrashReportFetchResponse;
  try {
    res = await gh.listCreatedSince(since);
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
  const createdInWindow = issues.filter((i) => {
    const created = Date.parse((i as unknown as { created_at?: string }).created_at ?? "");
    return Number.isFinite(created) && created >= now - CRASH_REPORT_GLOBAL_CREATE_WINDOW_MS;
  }).length;

  if (createdInWindow < CRASH_REPORT_GLOBAL_CREATE_CAP) return null;

  return {
    ok: false,
    status: 429,
    error: "rate_limited",
    retryAfterSeconds: Math.ceil(CRASH_REPORT_GLOBAL_CREATE_WINDOW_MS / 1000),
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
    const capped = await checkGlobalCreateCap(gh, now);
    if (capped !== null) return capped;

    const created = await gh.createIssue({
      title: buildIssueTitle(normalizeMessage(body.message)),
      body: buildIssueBody(body, fingerprint, kind),
      labels: [label],
    });
    if (!created.ok) return mapNonOk(created);
    const issue = (await created.json()) as { number: number; html_url: string };
    return {
      ok: true,
      data: {
        issueUrl: issue.html_url,
        issueNumber: issue.number,
        action: "created",
      },
    };
  } catch {
    // Network-level error — do not propagate internal details.
    return { ok: false, status: 502, error: "submission_unavailable" };
  }
}
