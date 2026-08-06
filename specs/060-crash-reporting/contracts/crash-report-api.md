# Contract: `POST /report/crash`

The HTTP interface the studio codes against and the server handler tests assert. Every identifier
below — route, field name, enum member, error string, label format, env var — is quoted **exactly**
as the spec pins it. Do not rename, recase, or pluralize any of them.

**Route**: `POST /report/crash`
**Rewrite** (`vercel.json`): `/report/crash` → `/api/report/crash`, inserted **above** the terminal
`/(.*)` → `/index.html` catch-all (research D9).
**Adapter**: `api/report/crash.ts` (Web-fetch default export, mirroring `api/submit/managed-pr.ts`).
**Local-dev mirror**: a matching Fastify route in `utilities/oauth-backend/src/server.ts`.
**Credential**: the crash-reporting GitHub App installation token only. Never a user OAuth token.

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
    browserUA?: string;    // max 300
    os?:        string;    // max 100
  };
}
```

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
| `200` | `{ issueUrl, issueNumber, action }` | `action` is `"created"`, `"commented"`, or `"reopened"`. A comment suppressed by the cap still returns `action: "commented"` (FR-104). |
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
| `CRASH_REPORT_APP_PRIVATE_KEY` | base64-encoded PEM |
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
| Global cap probe | `GET /repos/{owner}/{repo}/issues?state=all&since=<iso>&per_page=100` |
| Create | `POST /repos/{owner}/{repo}/issues` |
| Comment | `POST /repos/{owner}/{repo}/issues/{n}/comments` |
| Reopen + label | `PATCH /repos/{owner}/{repo}/issues/{n}` |
| Retract a comment | `DELETE /repos/{owner}/{repo}/issues/comments/{id}` |

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

---

## Bundle safety

`crash-report-schemas.ts`, `crash-report-pipeline.ts`, and `crash-report-installation-token.ts` MUST
NOT **value**-import any `@keyboard-studio/*` package; `import type` is erased and fine. Any literal
otherwise owed to `packages/contracts` is copied locally behind a compile-time drift guard, following
the `GITHUB_OAUTH_CLIENTS` idiom (FR-082).

`"api/report/crash.ts"` MUST be added to `FUNCTION_ENTRIES` in
[api/bundle-safety.test.ts](../../../api/bundle-safety.test.ts) lines 41–50 (FR-086, FR-131).
