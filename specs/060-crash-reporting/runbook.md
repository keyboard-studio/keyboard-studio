# Runbook: crash reporting

Operational setup for [spec.md](spec.md). Everything here is a **dashboard action for the repository
owner** — none of it is code, and none of it blocks development or tests. Every server task ships
fully tested against an injected fetch stub with no repository, App, or credential in existence
(FR-136). What these steps unblock is the route's **live function**: until they are done,
`POST /report/crash` returns `503 reporting_not_configured` and the studio quietly files nothing.

---

## The kill switch (read this first)

**To disable crash reporting instantly, unset any one of the three `CRASH_REPORT_APP_*` variables and
redeploy.** The route's config builder returns `undefined` when any is absent or empty, so the
handler's `503 reporting_not_configured` branch fires before a token is minted or any GitHub call is
made. The client treats a 503 exactly as it treats a network failure: silently (FR-078). Authors see
nothing, no error surfaces, and nothing is retried.

This is deliberately the cheapest possible off switch. It needs no code change, no revert, and no
coordination — which matters, because the situation where you want it (an unexpected flood, a
misconfigured App, a privacy question raised mid-incident) is exactly the situation where a code
deploy is the slowest available option.

---

## Prerequisites

### 1. Create the `keyboard-studio/crash-reports` repository

A **separate repository** from `keyboard-studio/keyboards`. Public or private is an org decision;
the reports contain no author identity either way (FR-030 – FR-036).

Separate because the crash App is installed on it and nothing else — see step 3.

### 2. Create the crash-reporting GitHub App

A **second App**, distinct from the managed-PR App behind `GITHUB_APP_*`.

| Setting | Value |
|---|---|
| Permissions | **Issues: Read and write** — and nothing else |
| Repository access | Only select repositories → `crash-reports` |
| Webhooks | Not needed; disable |

Do not extend the existing managed-PR App instead. That App holds `contents: write` and
`pull_requests: write` on `keyboard-studio/keyboards`; reusing it would give a public, unauthenticated
POST endpoint a credential that can write keyboard source. The two Apps are kept apart in code as
well — `crash-report-installation-token.ts` has its own module-scope cache precisely so no call path
can hand one pipeline the other's token (FR-085).

### 3. Install the App on `crash-reports` only

Scope the installation to that single repository. This is the containment boundary: even a total
compromise of the crash route reaches one issue tracker.

### 4. Provision the environment variables

| Variable | Value |
|---|---|
| `CRASH_REPORT_APP_ID` | The App's numeric id |
| `CRASH_REPORT_APP_PRIVATE_KEY` | The PEM private key, **base64-encoded** |
| `CRASH_REPORT_APP_INSTALLATION_ID` | The installation's numeric id |

Base64-encode the PEM so its newlines survive environment-variable injection:

```bash
base64 -w0 < crash-reports-app.private-key.pem
```

Set all three in the Vercel project (Production and Preview). Partial configuration is treated as
"not configured" — the route 503s rather than half-working.

`GITHUB_APP_*` is a different set and must not be reused for any of these.

### 5. Add the Vercel Firewall rule

| Setting | Value |
|---|---|
| Path | `/report/crash` (and `/report/crash/retract`) |
| Rate | 20 requests / 60 s per IP |
| Action | Deny, `429`, for 10 minutes |

**Configuration, not code** — and that placement is the point. This runs at the edge, before the
function is invoked, so a single-source flood costs no function invocations, no token mints, and no
GitHub API budget. The in-code flood control (session dedupe, comment cap, reopen cooldown, global
creation cap) bounds legitimate traffic; only the firewall bounds abusive traffic cheaply.

---

## Verifying a live setup

1. Confirm the route is configured: a POST with an obviously invalid body should return
   `400 invalid_request`, not `503 reporting_not_configured`. A 503 means step 4 is incomplete.
2. Trigger a real crash in a preview deployment and confirm one issue appears in `crash-reports`,
   titled `bug(studio): …`, labelled `crash/fp-<12 hex chars>`.
3. Trigger the same crash again from a **new browser session** (the client's per-session cache would
   otherwise suppress the second POST) and confirm it comments on the existing issue rather than
   creating a second one.
4. Read the filed issue and confirm it carries no author name, email, or login. This is asserted by
   test (SC-005), but it is worth one human look at real output the first time.

---

## Residual risks the owner accepts

- **The global creation cap is a bound, not a guarantee** (FR-106). It stops runaway *creation* of
  distinct-fingerprint issues within a 10-minute window; it does not stop a determined attacker from
  filing 200 issues, and the firewall rule in step 5 is what makes that expensive. The cap fails
  **open** on a probe error — a duplicate issue beats a dropped defect report.
- **Two racing first occurrences both create** (FR-097). There is no distributed lock. The result is
  occasionally two issues for one bug, which a maintainer closes as a duplicate. The alternative —
  locking — would add a state store this design deliberately does not have (FR-105).
- **Breadcrumb labels are written by call sites** (FR-047), so the client cannot guarantee no author
  text reaches one. The server scrubs every string again before writing to a public issue (FR-033),
  which is why that scrub exists as defence in depth rather than as redundancy.
