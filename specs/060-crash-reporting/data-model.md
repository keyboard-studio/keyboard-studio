# Data Model: Crash reporting

Entities this feature introduces, their fields, validation rules, and the state transitions that
govern them. Identifiers here are pinned by the spec — see [contracts/](contracts/) for the wire and
UI contracts that quote them exactly.

Nothing in this document reshapes an existing entity. `Attribution`, `IdentitySession`,
`DecisionEntry`, and the working copy are **read-only inputs** at most, and three of them are read
only to guarantee their *absence* from the output.

---

## 1. `CrashReport` (client, in-memory)

Built at capture time by `src/crash/redact.ts` as an **allowlist** — named primitives copied off
approved sources, never a spread of an existing object (FR-030). Serialized straight to the POST body;
never persisted, never held in a store.

| Field | Type | Required | Rule |
|---|---|---|---|
| `kind` | `"render" \| "onerror" \| "rejection"` | yes (post-mount) | Which surface caught it (FR-006). The client never sends `"pre-mount"` — that value exists only as the server's default for an absent `kind`. |
| `message` | `string` | yes | Raw and unnormalized. Truncated to 4096 before send. |
| `stackFrames` | `StackFrame[]` | yes (post-mount) | Max 20. Extracted from `Error.stack` by the client. |
| `appVersion` | `string` | yes | `<pkg.version>+<sha7>` (FR-112). Never empty — SC-011. |
| `occurredAt` | ISO-8601 `string` | no | Client clock; advisory only. |
| `context` | `CrashContext` | no | See §3. Omitted entirely when nothing is available. |

**Invariant (FR-031, asserted by test, not by type).** No serialization of this object may contain
`Attribution.authorName`, `Attribution.authorEmail`, `Attribution.copyrightHolder`, any field of
`GitHubIdentitySession` (`token`, `login`), any field of `GoogleIdentitySession` (`sub`, `email`,
`emailVerified`, `name`, `picture`), or any raw OAuth profile field. The type system cannot express
this; SC-005 asserts it against a fixture populated with real values for all of them.

**Invariant (FR-021).** No fingerprint, hash, or dedupe key field exists on this entity. The client's
local fingerprint is a separate value that never enters the payload.

### `StackFrame`

| Field | Type | Required | Rule |
|---|---|---|---|
| `function` | `string` | yes | Max 200. `<anonymous>` when the frame has no name (FR-081f step 4). |
| `modulePath` | `string` | yes | Max 300. Sent **raw**, chunk hash intact — canonicalization is the server's job. |
| `line` | `int ≥ 0` | no | Sent, then dropped by canonicalization (FR-081a). |
| `column` | `int ≥ 0` | no | Same. |

---

## 2. `CrashReportBody` (wire schema, server)

`CrashReportBodySchema` in `utilities/oauth-backend/src/crash-report-schemas.ts`. Caps mirror
`ManagedPRBodySchema`'s existing discipline.

| Field | Type | Optional | Cap |
|---|---|---|---|
| `kind` | enum `"render" \| "onerror" \| "rejection" \| "pre-mount"` | **yes** | — |
| `message` | `string` | no | 4096 |
| `stackFrames` | `StackFrame[]` | **yes** | 20 entries |
| `stack` | `string` | **yes** | 8192 |
| `appVersion` | `string` | **yes** | 40 |
| `occurredAt` | ISO datetime | **yes** | — |
| `context.browserUA` | `string` | yes | 300 |
| `context.os` | `string` | yes | 100 |

**Deliberate absences.** `fingerprint` and `title` are **not** in this schema (FR-081, P0-1). There is
no client-supplied value for either, so neither can be trusted, validated, or accidentally read.

**Conditional rule (`.refine()`, FR-081, SC-020).** When `kind` is present and is not `"pre-mount"`,
at least one of `stackFrames` or `stack` MUST be present. When `kind` is absent or `"pre-mount"`,
neither is required. This keeps the pre-mount body (`{ message, stack, appVersion }`) valid while
stopping a malformed post-mount body from validating on `kind` + `message` alone and over-colliding
onto one fingerprint.

**Default.** Absent `kind` → `"pre-mount"`, applied before canonicalization (FR-081, FR-006, P0-B).

---

## 3. `CrashContext` (structural, all-optional)

Read by the **caller** and passed into the payload builder as plain data — the crash module never
imports the stores these come from (FR-012, FR-042, E-4).

| Field | Type | Source | Rule |
|---|---|---|---|
| `keyboardId` | `string` | working copy | Omitted, never `""`, when no working copy exists (FR-046). |
| `bcp47Tags` | `string[]` | working copy | Omitted when unresolved — an empty array would read as "confirmed none". |
| `stepId` | `string` | step-walk store | |
| `keyCount` | `int` | working copy | |
| `exemplarCount` | `int` | working copy | |
| `decisionTail` | `DecisionTailEntry[]` | `useDecisionLogStore.getState()` | Bounded tail of most-recent entries. |
| `breadcrumbs` | `Breadcrumb[]` | the ring (§4) | |
| `browserUA` | `string` | `navigator.userAgent` | |
| `os` | `string` | derived | |

**Exhaustive, not illustrative (FR-041).** No full VirtualFS snapshot and no raw file content, ever.

**Invariant (FR-047).** No field here may be or contain any FR-031 value. `DecisionTailEntry` and
`Breadcrumb` carry structural facts only — step ids, route hashes, stage names — never arbitrary
free text that could smuggle identity through a different layer.

---

## 4. `Breadcrumb` + the ring buffer

A fixed-size (~50) module-scope circular buffer in `src/crash/breadcrumbs.ts` (FR-043). Plumbing, in
the same category as `window.__ksE2E__`: not React state, not persisted, no store.

| Field | Type | Rule |
|---|---|---|
| `at` | ISO-8601 `string` | |
| `channel` | `"console.error" \| "console.warn" \| "route" \| "step" \| "stage" \| "oauth" \| "locale"` | |
| `label` | `string` | Structural only, bounded length (FR-047). |

**Install rule (FR-044).** Wrapping `console.error` / `console.warn` MUST call the original function
**and** push to the ring. Never replace existing console behaviour.

**Transition.** Append-only, overwriting oldest at capacity. Never read except when building a
payload; when the reporter itself fails, entries are pushed with no reader (the
"crash-in-the-crash-reporter" edge case, which swallows silently rather than escaping).

---

## 5. Fingerprint (server-authoritative) and its client-local twin

Two values, same algorithm, entirely different trust.

| | Server-authoritative | Client-local |
|---|---|---|
| Computed in | `crash-report-pipeline.ts` | `src/crash/fingerprint.ts` |
| Input | `kind` + normalized `message` + canonical frames | identical |
| Hash | `sha256` → lowercase hex → **first 12** | identical |
| Used for | the `crash/fp-<hash12>` label, lookup, and every mutation | the `sessionStorage` dedupe cache key **only** |
| Transmitted | n/a | **never** (FR-021) |
| Trusted | yes — it is derived from content the server holds | never read by anything |

**Canonicalization (FR-081a), one path for both input shapes:**

1. Normalize `message` — strip stack-trace addresses and quoted user-supplied substrings.
2. Take the top 3–5 frames. Drop `line` and `column`. Collapse the chunk-hash suffix in `modulePath`
   (trailing `-[\w-]{8,12}` before `.js`) → `assets/main-DLGH1X0S.js` becomes `assets/main.js`.
   Render each as `function@modulePath`.
3. Join `kind`, normalized message, and frames in that fixed order, `|`-delimited.

Excluded from the hash input: the build identifier (FR-081b) — hashing it would fork a new issue on
every deploy.

**Worked example (FR-081d), pinned by conformance test:**

```
render|TypeError: Cannot read properties of undefined (reading <redacted>)|KeyEditor@assets/main.js|renderWithHooks@assets/vendor.js
```

**Raw-`stack` convergence (FR-081f).** A V8-shaped and a Firefox/Safari-shaped stack for the same
error both reduce to the frame portion `KeyEditor@assets/main.js|renderWithHooks@assets/vendor.js` —
identical to the structured path's frame portion for the same bug. When neither `stackFrames` nor a
parseable `stack` is present, the frame portion contributes nothing and the canonical string is
`kind` + normalized message alone.

---

## 6. `CrashIssue` (GitHub-side state)

Not a stored entity — the GitHub issue itself, identified solely by its `crash/fp-<hash12>` label.
All flood-control state is **derived** from the label-lookup response; no KV, Redis, or Postgres
(FR-105).

| Attribute | Value |
|---|---|
| Repository | `keyboard-studio/crash-reports` — a **source constant**, never request-derived (FR-089) |
| Title | `bug(studio): <normalized message summary>`, ≤72 chars ellipsized (FR-093a) |
| Labels | `crash/fp-<hash12>`, plus `regression` after a reopen |
| Body trailer | `<!-- crash-fingerprint: <hash> -->` — auditability only; the **label** is what lookup reads (FR-092) |
| Read for flood control | `state`, `comments` count, `updated_at` |

### State transitions

| Lookup result | Action | Guard |
|---|---|---|
| No match | **create** | Skipped → `429 rate_limited` when ≥ `CRASH_REPORT_GLOBAL_CREATE_CAP` issues created within `CRASH_REPORT_GLOBAL_CREATE_WINDOW_MS` (FR-106). |
| Match, **open** | **comment** | Skipped (still `200`) at `CRASH_REPORT_COMMENT_CAP` or within `CRASH_REPORT_COMMENT_COOLDOWN_MS` (FR-102, FR-104). **No state-change call is made at all** — an open issue has no state left to change (FR-094). |
| Match, **closed**, `updated_at` outside cooldown | **reopen + `regression` + comment** | Always proceeds. *The first regression hit after a close is never dropped.* |
| Match, **closed**, `updated_at` inside `CRASH_REPORT_REOPEN_COOLDOWN_MS` | **suppressed** | Returns the same non-fatal shape a capped comment uses (FR-095a, P0-A). |
| Lookup itself failed | **create** | Fails **open**, not closed (FR-096) — a duplicate beats a dropped report. |
| Two racing first occurrences | **both create** | Accepted, self-healing (FR-097). No distributed locking. |

### Retraction (FR-075, FR-076)

| This session's action | Undo does | Never does |
|---|---|---|
| `"created"` | close the issue + add a "retracted by reporter" comment | delete — unavailable to an installation token |
| `"commented"` | remove only this session's comment | touch the issue's open/closed state or any other comment |

---

## 7. Flood-control state (derived, not stored)

| Layer | Where the state lives | Bounds |
|---|---|---|
| Client session cache (FR-101) | `sessionStorage`, keyed by client-local fingerprint | repeat POSTs within one session |
| Comment cap (FR-102) | the matched issue's own `comments` + `updated_at` | comment writes only |
| Reopen cooldown (FR-095a) | the matched issue's own `state` + `updated_at` | reopen/label churn |
| Global creation cap (FR-106) | recent issue-creation volume in the target repo | distinct-fingerprint issue creation |
| Per-IP rate limit | Vercel Firewall — **configuration, not code** (Prerequisites #5) | single-source floods, before app code runs |

---

## 8. Build identifier

| Field | Value | Notes |
|---|---|---|
| `__KS_COMMIT_SHA__` | Vite `define`, from `VERCEL_GIT_COMMIT_SHA`, fallback `"dev"` | Compile-time constant, ambient-declared. Readable pre-mount (FR-114). |
| `appVersion` | `<pkg.version>+<sha7>` | Excluded from the fingerprint hash (FR-081b); carried as a payload field. Never empty (SC-011). |
