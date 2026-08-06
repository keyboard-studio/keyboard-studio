# Contract: `POST /report/crash` and `POST /report/crash/retract`

The HTTP interface the studio codes against and the server handler tests assert. Every identifier
below — route, field name, enum member, error string, label format, env var — is quoted **exactly**
as the spec pins it. Do not rename, recase, or pluralize any of them.

**Route**: `POST /report/crash`
**Rewrite** (`vercel.json`): `/report/crash` → `/api/report/crash`, inserted **above** the terminal
`/(.*)` → `/index.html` catch-all (research D9).
**Adapter**: `api/report/crash.ts` (Web-fetch default export, mirroring `api/submit/managed-pr.ts`).
**Local-dev mirror**: a matching Fastify route in `utilities/oauth-backend/src/server.ts`.
**Credential**: the crash-reporting GitHub App installation token only. Never a user OAuth token.

**Retraction route**: `POST /report/crash/retract` → `/api/report/crash-retract.ts`, same rewrite
placement, same credential, same status vocabulary. See [Retraction](#retraction) below.

---

## Request body — `CrashReportBodySchema`

```ts
{
  kind?:        "render" | "onerror" | "rejection" | "pre-mount";  // optional; server defaults to "pre-mount"
  message:      string;    // required, max 4096, raw and unnormalized
  stackFrames?: Array<{
    function:   string;    // max 200
    modulePath: string;    // max 300, chunk hash intact
    line?:      number;    // int, >= 0
    column?:    number;    // int, >= 0
  }>;                      // max 20 entries
  stack?:       string;    // max 8192, raw unparsed Error.stack
  appVersion?:  string;    // max 40
  occurredAt?:  string;    // ISO datetime
  context?: {
    keyboardId?:     string;   // max 80
    bcp47Tags?:      string[]; // max 10 entries, each max 40
    stepId?:         string;   // max 80
    keyCount?:       number;   // int, >= 0
    exemplarCount?:  number;   // int, >= 0
    decisionTail?:   Array<{ id: string; choice?: string }>;  // max 20, each field max 120
    breadcrumbs?:    Array<{ at: string; channel: BreadcrumbChannel; label: string }>;  // max 50
    browserUA?:      string;   // max 300
    os?:             string;   // max 100
  };
}
```

**`context` carries the full structural set, not just `browserUA` / `os`.** An earlier revision of this
table declared only those two, which under-specified against FR-040 and data-model §3: zod strips
unknown keys, so a schema following the short table would have silently dropped the keyboard id, the
BCP47 tags, the step id, the counts, and the decision tail — making FR-040 unsatisfiable while every
request still returned 200. The two fields the table did pin keep their exact caps (300 / 100); the
rest follow the same cap discipline. The list is **exhaustive, not illustrative** (FR-041): no
VirtualFS snapshot and no raw file content, ever.

**No `fingerprint` field. No `title` field.** Both are computed server-side. A body carrying either is
not "rejected" — the fields simply do not exist in the schema, so nothing reads them.

**`.refine()` rule.** When `kind` is present and `kind !== "pre-mount"`, at least one of `stackFrames`
or `stack` MUST be present. Violation → `400 invalid_request` (SC-020).

**Pre-mount body** — this exact shape MUST validate and file (SC-018):

```json
{ "message": "…", "stack": "…", "appVersion": "0.1.0+a1b2c3d" }
```

---

## Responses

| Status | Body | When |
|---|---|---|
| `200` | `{ issueUrl, issueNumber, action, commentId?, retractionToken? }` | `action` is `"created"`, `"commented"`, or `"reopened"`. A comment suppressed by the cap still returns `action: "commented"` (FR-104). `commentId` is present when this request added a comment, so Undo can remove that one and no other (FR-076). `retractionToken` is the signed capability the retract route requires (FR-074a). |
| `400` | `{ "error": "invalid_request" }` | Unparseable JSON or schema/`.refine()` failure. |
| `429` | `{ "error": "rate_limited" }` + `Retry-After` | GitHub 429 (header value, default `60`), or the global creation cap (FR-106). |
| `502` | `{ "error": "submission_unavailable" }` | Network throw, token-mint failure, or GitHub 401/403 — never revealing which credential or permission is at fault (FR-088). |
| `502` | `{ "error": "upstream_error" }` | Any other non-ok GitHub response. |
| `503` | `{ "error": "reporting_not_configured" }` | Any `CRASH_REPORT_APP_*` env var absent or empty. |
| `405` | `{ "error": "method_not_allowed" }` + `Allow: POST` | Non-POST. |

`issueUrl` and `issueNumber` are read back from GitHub's own create/comment/reopen response at request
time — runtime values, not literals in source.

---

## Environment

| Variable | Purpose |
|---|---|
| `CRASH_REPORT_APP_ID` | Crash-reporting App id |
| `CRASH_REPORT_APP_PRIVATE_KEY` | base64-encoded PEM. Also the key material retraction capability tokens are signed with, domain-separated and hashed before use — see [Retraction](#retraction). No sixth variable. |
| `CRASH_REPORT_APP_INSTALLATION_ID` | Installation id |

**MUST NOT** be, read, or fall back to `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` /
`GITHUB_APP_INSTALLATION_ID` — those stay exclusively the managed-PR pipeline's (FR-085).

Target repository is a **source constant**, not an env var:

```ts
const CRASH_REPORT_OWNER = "keyboard-studio";
const CRASH_REPORT_REPO  = "crash-reports";
```

---

## GitHub calls (caller #3)

Hand-written minimal REST caller inside `crash-report-pipeline.ts`, with a header comment documenting
— in the vendoring-note style of `github-pipeline.ts:9-24` — that this is caller #3 and why extraction
is blocked (FR-084).

| Purpose | Call |
|---|---|
| Dedupe lookup | `GET /repos/{owner}/{repo}/issues?labels=crash/fp-<hash12>&state=all&per_page=5` |
| Global cap probe | `GET /repos/{owner}/{repo}/issues?state=all&since=<iso>&sort=created&direction=desc&per_page=100&page=<n>` — **paginated**, see below |
| Create | `POST /repos/{owner}/{repo}/issues` |
| Comment | `POST /repos/{owner}/{repo}/issues/{n}/comments` |
| Reopen + label | `PATCH /repos/{owner}/{repo}/issues/{n}` |
| Retract a comment | `DELETE /repos/{owner}/{repo}/issues/comments/{id}` |

**The cap probe MUST paginate.** `per_page` is capped at 100 by GitHub while
`CRASH_REPORT_GLOBAL_CREATE_CAP` is 200, so a single-request probe can observe at most 100 creations
and the cap is unsatisfiable arithmetic — the documented last line of defence never engages, and no
route-level test notices, because a stub `fetch` ignores `per_page` and returns whatever fixture it was
given. The probe therefore reads up to `CRASH_REPORT_CREATE_PROBE_MAX_PAGES` pages, **derived** as
`ceil(cap / per_page)` so raising the cap cannot reintroduce the gap, and stops early on either a short
page or a page contributing no in-window creations. `sort=created&direction=desc` is explicit because
that early exit depends on it: `since=` filters on *updated* time, so created-descending order is what
guarantees old-but-recently-commented issues sort behind every in-window creation. A healthy tracker
costs exactly one request, as before; extra requests are spent only while a flood is actually in
progress. Test-side, a cap-probe stub MUST honour `per_page` and `page` — one that does not is the
reason this bug shipped.

**`GET /search/issues` MUST NOT be used, ever.** A comment at the lookup call site MUST state why:
indexing lag of seconds to minutes, and a 30 req/min limit shared across the whole installation,
versus the ordinary REST budget of 5,000/hr (FR-091).

### Labels

`crash/fp-<hash12>` — the **only** thing lookup reads. `regression` — added on reopen.
Project-local ops convention for this one repository; MUST NOT propagate to
`keyboard-studio/keyboards` or upstream (FR-099).

### Issue title

`bug(studio): <normalized message summary>` — ≤72 chars, ellipsized. MUST NOT contain the `kind`, the
fingerprint, or the build id (FR-093a).

### Body trailer

`<!-- crash-fingerprint: <hash> -->` — auditability only, never the lookup mechanism (FR-092).

---

## Server-side scrub (defence in depth, before any GitHub write)

Applies to `message`, `stackFrames[]`, `body`, and `context`:

| Class | Pattern / action |
|---|---|
| Secrets (FR-033) | `ghp_`, `gho_`, `github_pat_`, `sk-`, `AKIA`, `xox[bp]-`, generic ≥32-char hex/base64 runs |
| Emails (FR-033) | email-shaped substrings |
| Mentions (FR-033a) | `/@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})/g` — neutralized (zero-width space after `@`, or inline code span) |
| Images (FR-033b) | `![...](...)` and raw `<img>` — stripped or converted to a plain-text link |

---

## Flood-control constants

Exported named constants in `crash-report-pipeline.ts` (FR-103) — never inlined literals.

| Constant | Default |
|---|---|
| `CRASH_REPORT_COMMENT_CAP` | `20` |
| `CRASH_REPORT_COMMENT_COOLDOWN_MS` | `600_000` (10 min) |
| `CRASH_REPORT_REOPEN_COOLDOWN_MS` | `600_000` (10 min) |
| `CRASH_REPORT_GLOBAL_CREATE_WINDOW_MS` | `600_000` (10 min) |
| `CRASH_REPORT_GLOBAL_CREATE_CAP` | `200` |
| `CRASH_REPORT_CREATE_PROBE_PER_PAGE` | `100` (GitHub's own ceiling, not a preference) |
| `CRASH_REPORT_CREATE_PROBE_MAX_PAGES` | derived: `ceil(CAP / PER_PAGE)` |
| `CRASH_RETRACTION_TOKEN_TTL_MS` | `120_000` (2 min) — in `crash-report-retraction-token.ts` |

---

## Bundle safety

`crash-report-schemas.ts`, `crash-report-pipeline.ts`, `crash-report-installation-token.ts`, and
`crash-report-retraction-token.ts` MUST NOT **value**-import any `@keyboard-studio/*` package;
`import type` is erased and fine. Any literal
otherwise owed to `packages/contracts` is copied locally behind a compile-time drift guard, following
the `GITHUB_OAUTH_CLIENTS` idiom (FR-082).

`"api/report/crash.ts"` and `"api/report/crash-retract.ts"` MUST both be listed in
`FUNCTION_ENTRIES` in [api/bundle-safety.test.ts](../../../api/bundle-safety.test.ts) (FR-086,
FR-131).

---

## Retraction

**Route**: `POST /report/crash/retract`
**Adapter**: `api/report/crash-retract.ts` — same credential, same `configOverride` test seam, same
503/400/403/429/502 vocabulary as the report route.
**Local-dev mirror**: a matching Fastify route in `utilities/oauth-backend/src/server.ts`.

A separate route rather than a mode flag on the report body: it is a different operation on a different
resource — it names a filed report, not a crash — and merging them would produce one endpoint whose
required fields depend on a flag and whose `message` is meaningless on half its traffic.

### Request body — `CrashRetractBodySchema`

```ts
{
  retractionToken: string;  // required, 1..2048, opaque to the client
}
```

**No `issueNumber`. No `action`. No `commentId`.** Same reasoning as the absent `fingerprint` on the
report body, and the same class of defect: this route is public and unauthenticated, and it acts on a
repository whose issue numbers are sequential and guessable. A body that named its own target let any
anonymous caller close or comment-delete an arbitrary crash report belonging to someone else — the 30 s
Undo window is UI state in `CrashNotice.tsx` and constrains only a caller who bothered to load the SPA.
Those three fields are now carried **inside** the signed token, and the server reads them from there. A
body still sending them has them stripped by zod, unread (FR-074a).

### The capability token (FR-074a)

Minted by `POST /report/crash` on every successful report — including the flood-controlled ones, since
a report whose comment was skipped by the cap still told the author a report was sent and must still be
withdrawable. Format:

```
v1.<base64url(payload)>.<base64url(HMAC-SHA256(key, payload))>
payload = { i: issueNumber, a: action, c?: commentId, x: expiryEpochMs }
```

| Property | Rule |
|---|---|
| Key material | Derived from `CRASH_REPORT_APP_PRIVATE_KEY`, domain-separated by a fixed label and SHA-256'd. **No sixth env var**: a secret whose absence silently disables an authorization check is the worst thing to add to the manual prerequisites, and the App key is already mandatory, so there is no "configured but unsigned" state. |
| TTL | `CRASH_RETRACTION_TOKEN_TTL_MS` = `120_000`. Looser than the 30 s Undo window on purpose — it absorbs the report round-trip, a cold function, and clock skew — but still the first server-side time bound this route has. |
| State | None. No KV, no Redis, no issued-token table (FR-105). The token *is* the record. |
| Revocation | Not available, and acceptable: a replay is idempotent in effect (closing a closed issue is a no-op; deleting a deleted comment 404s to a non-fatal error) and cannot reach any issue other than the one the token names. |
| Rejection | **One undifferentiated failure** for every reason — bad shape, bad signature, expired, unknown version, unreadable payload. A caller that could distinguish them learns whether it guessed the key. Verified **before** the installation-token mint and before any GitHub call, so a forgery flood costs nothing against the App's rate budget. |
| Shape checks | A signature-valid payload is still range-checked (positive integer issue number, known action, finite expiry) — a token minted by an older build must not be coerced into an issue-number path. |

### Responses

| Status | Body | When |
|---|---|---|
| `200` | `{ issueUrl, issueNumber, action }` | Retraction applied, or a non-fatal no-op (a `"commented"` token with no `commentId` — better to leave the report standing than guess which comment to remove). Carries **no** `retractionToken`: retracting a retraction is not an operation. |
| `400` | `{ "error": "invalid_request" }` | Unparseable JSON, or a body with no usable `retractionToken` — including the pre-FR-074a shape that named an issue. |
| `403` | `{ "error": "retraction_not_authorized" }` | Token forged, tampered, expired, or signed with another key. No GitHub call is made. |
| `429` | `{ "error": "rate_limited" }` + `Retry-After` | GitHub 429. |
| `502` | `{ "error": "submission_unavailable" }` | Network throw, token-mint failure, or GitHub 401/403. |
| `502` | `{ "error": "upstream_error" }` | Any other non-ok GitHub response. |
| `503` | `{ "error": "reporting_not_configured" }` | Any `CRASH_REPORT_APP_*` env var absent or empty — the same kill switch as the report route, so disabling reporting cannot leave this write path open. |

### GitHub-side behaviour

| Token `action` | Effect |
|---|---|
| `"created"` | Add `RETRACTION_COMMENT`, **then** `PATCH state: "closed"`. In that order: closing without the explanatory comment leaves a maintainer a closed issue and no reason for it. A failed comment aborts before the close. |
| `"commented"` | `DELETE` only the comment the token names. The issue's open/closed state is untouched and no other comment is affected — the issue belongs to everyone who hit that bug. |
| `"reopened"` | Treated as `"commented"`. The reopen is a fact about the bug recurring, not about this author's report, so it stands. |

**Never a delete of the issue.** An installation token cannot delete an issue at all, so UI copy MUST
NOT imply deletion (FR-077).
