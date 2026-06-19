# GitHub integration — architecture

Status: **draft, not yet ratified into [spec.md](../spec.md).** Captures architecture decisions from the 2026-06-15 §3a/§3b user-skill conversation (which previously lived only in claude-mem, not in any PR or commit) and reconciles them with the Day-1 OAuth fork+PR pipeline already implemented in [packages/engine/src/output/github.ts](../packages/engine/src/output/github.ts) and the in-flight [oauth-backend PR #459](https://github.com/MattGyverLee/keyboard-studio/pull/459).

This is the home for "how does the keyboard get into `keymanapp/keyboards`?" Cross-link from here when adding new delivery paths, not the other way around.

## 1. North star — what the user is allowed to know about Git

Restated from [spec.md §3a](../spec.md) (User Skill Envelope, committed 2026-06-15):

> **The studio manages the tech side; the user manages only linguistics. A GitHub login is acceptable; a GitHub workflow is not.**

Operationally:

| User-facing | Studio-internal |
|---|---|
| "Sign in with GitHub" button | OAuth web-app flow, token exchange via `oauth-backend` |
| "Submit my keyboard" button | Fork detection / creation, branch naming, commit, push, PR open |
| "Update my keyboard" (later session) | Same working copy → new branch off current `main`, force-push policy decided by studio |
| "Your submission is being reviewed" | PR URL, CI status, reviewer comments surfaced as plain text |
| (nothing) | Branches, rebases, conflict resolution, PR-review thread navigation |

**Success = a PR lands in the chosen delivery path with the user never having seen the word "branch."** If the user has to read GitHub UI to finish a submission, the studio has failed at its job — that is a design defect, not a user-education gap.

Corollaries that shape the architecture:

- **One-time submission is the dominant case.** Monolingual keyboards typically ship once. The studio does not need a session-history browser, diff-against-previous-version, or "resume an old project" as a first-class feature. (Multi-year MML is out of scope; see [spec.md §3b](../spec.md) and §7.)
- **Within-studio forks are not a separate concept.** The user has one working copy per keyboard (the working-copy spine, [spec.md §3.1](../spec.md)). If someone else needs to take over a keyboard, they fork at the `keymanapp/keyboards` level — Keyman's policy, not the studio's UI.
- **Constructive user feedback after submission is not assumed.** "It doesn't work" is the realistic feedback channel. The studio optimises for *successful first submission*, not iterative improvement driven by post-submission user reports.
- **Licensing is MIT, surfaced in the documentation phase**, not as a checkbox at submit time.

## 2. Three delivery paths (Options A / B / C)

These are tracked operationally in [docs/github_flow.md](github_flow.md) (Status section). This doc owns the *why*; that one owns the *progress bar*.

- **Option A — User-fork, studio-managed PR.** The studio holds an OAuth token for the signed-in user, forks `keymanapp/keyboards` into the user's account if needed, creates a branch, commits the VirtualFS contents, pushes, opens a PR against upstream `main`. Default happy path for the broadest user (community activist with no software background).
- **Option B — Org-mediated PR.** A studio-controlled GitHub App / bot account owns the fork and PR; the user is credited via commit metadata (`Co-Authored-By` or attribution sidecar). Used when the user cannot or will not hold a GitHub account at all. Not yet implemented.
- **Option C — ZIP download.** Final fallback. The studio emits a `.zip` of the VirtualFS conforming to the `keymanapp/keyboards/<id>/` layout; the user (or a helper) submits it some other way. This is the only path that works fully offline and is the universal escape hatch when OAuth is unavailable.

The user is **not** asked to pick a path. The studio picks the highest path that's available given current auth state — A if signed in, C if not. B is a future contingency.

## 3. Architecture in code (Day-1)

The fork+PR pipeline already exists end-to-end on the SPA side; the missing piece is server-side token exchange, which Grace is landing as a sibling package.

### 3.1 Engine — `packages/engine/src/output/`

- **`github.ts` — `publishPR()` is an 8-step Fork+PR pipeline.** Resolve auth → ensure fork exists → create branch off upstream default → serialize VirtualFS → commit blobs → push tree → open PR → return `{ prUrl, commitSha }`. Errors are typed as the `PublishPRError` union so the SPA can surface remediation rather than a stack trace.
- **`createGitHubOutputService()` vs `createOutputService()`.** The real OAuth path is `createGitHubOutputService`. The bare `createOutputService` is a **stub** — returns the same `OutputService` shape but writes nowhere; used by tests and the ZIP-only path. Do not collapse the two; the stub's existence is what lets the studio run without network.
- **`sidecar.ts` + `import-attribution.ts`.** Companion files that emit the `*.sidecar.json` import-attribution record alongside the keyboard, so when a keyboard derives from an existing base (Track 1) or a real import (Track 2), the provenance is in-tree rather than only in the PR body. Extension points for issue #239 and related work.
- **`zip.ts`.** Serializes the VirtualFS to a buffer; used by Option C directly and by `github.ts` indirectly (push uses a different code path but expects the same layout).

### 3.2 Contracts — `packages/contracts/src/outputService.ts`

`OutputService` is the seam between the studio (which knows nothing about GitHub) and the engine (which does). Two fields matter for this doc:

- `importAttribution?: string` (on `PublishPROptions`, not `OutputService`) — non-null whenever the session was initialized from an imported keyboard; build via `buildImportAttributionBlock()` in `packages/engine/src/output/import-attribution.ts`.
- `PublishPRError` — discriminated union (`kind: "auth" | "scope" | "rate-limit" | "branch-exists" | "network" | "unknown"`) so the SPA's submit screen has a finite set of remediation copies to render. Add a variant here before adding a new failure mode in `github.ts`.

The studio talks to the `OutputService` interface, not to the engine implementation. That is the *only* abstraction barrier protecting §3a's "no GitHub workflow knowledge required" rule on the SPA side.

## 4. Auth — integrating with PR #459 (`packages/oauth-backend/`)

[PR #459 (gboltono)](https://github.com/MattGyverLee/keyboard-studio/pull/459) is the server-side companion the existing `github.ts` pipeline has been waiting for. Treat it as the assumed shape going forward; do not reinvent the boundary on the engine side.

**What it is.** A Fastify v5 service that holds `GITHUB_CLIENT_SECRET` server-side so the SPA can complete the GitHub web-app flow without exposing the secret to the browser.

**Endpoints (stable surface):**
- `POST /oauth/exchange` — authorization-code → access token
- `POST /oauth/refresh` — token rotation
- `GET  /oauth/health` — liveness probe

**Security invariants (do not break these on the consumer side either):**
- Client secret is server-side only — never returned, logged, or forwarded.
- **Stateless** — the backend does not persist tokens. The token lives in the SPA's session (memory or `sessionStorage`, not `localStorage`), and is sent on each `OutputService` call.
- CORS is an explicit allowlist via `ALLOWED_ORIGINS`; wildcard origins are rejected at startup.

**Integration contract (engine ↔ oauth-backend):**

The engine never calls the OAuth backend directly. The SPA owns the redirect dance and hands the resulting Bearer token to `createGitHubOutputService({ token })`. From the engine's perspective, the token is just a string; from the OAuth backend's perspective, the engine doesn't exist.

```
SPA ──"Sign in with GitHub"──▶ github.com/login/oauth/authorize
SPA ◀──code─────────────────── github.com (callback)
SPA ──code──▶ oauth-backend /oauth/exchange ──client_id+secret──▶ github.com
SPA ◀──token─ oauth-backend
SPA ──token──▶ createGitHubOutputService({ token }).publishPR(...)
                                        │
                                        ▼
                                  GitHub REST API
```

**Smooth-integration checklist for the engine side** (so we don't make Grace's life hard):
- `kind: "auth"` must be cleanly distinguishable from other 401s so the SPA knows to hit `/oauth/refresh` rather than re-prompting login. Note: `kind: "scope"` indicates missing scopes (re-auth required, not refresh).
- Token-bearing calls should never be retried with the same token after a 401 — refresh first, then retry once, then surface `kind: "auth"`.
- The engine must not log the token at any level. If a debug log of a request is needed, redact `Authorization:` before emitting.
- If/when the SPA gains a "submit again" path (later session), it must re-acquire a fresh token via the SPA flow — the engine does not cache tokens across sessions.

## 5. Open questions (parked, surface before implementing)

1. **Branch naming.** The convention is `add/<keyboardId>` — matching the shipped contract (`packages/contracts/src/outputService.ts` §12, `PublishPROptions.branchName` JSDoc) and the engine implementation (`packages/engine/src/output/github.ts`). Open question: whether to append a uniqueness suffix (e.g. `add/<keyboardId>-<shortHash>`, as Option B already does) to avoid collisions when the same keyboard is re-submitted while its prior branch is still open on the fork. Decide before second-submission UX lands.
2. **Re-submission posture.** If the same user re-opens the same working copy after their first PR merged, do we open a *new* PR off latest upstream `main`, or push to the existing branch? Default proposal: **always a new branch.** Avoids reasoning about whether the prior branch was deleted, force-pushed, or had upstream changes since.
3. **Option B (org-mediated).** Out of scope for the OAuth-backend PR. Will need a separate decision on bot identity, commit-attribution shape, and how the user is informed their submission is going via the org.
4. **Token storage in the SPA.** `sessionStorage` is the current assumption (cleared on tab close, not shared across tabs). Confirm with Grace before the OAuth-backend PR merges, since it constrains the SPA-side wrapper.

## 6. References

- [spec.md §3a — User Skill Envelope](../spec.md) (2026-06-15 commit on `claude/nice-noether-z122uh`)
- [spec.md §3b — Success Definition](../spec.md)
- [docs/github_flow.md](github_flow.md) — Options A/B/C delivery-path progress tracking
- [docs/workflow-model.md](workflow-model.md) — working-copy spine (single persistent copy, serialized only at output)
- [packages/engine/src/output/github.ts](../packages/engine/src/output/github.ts) — `publishPR()` 8-step pipeline
- [packages/engine/src/output/index.ts](../packages/engine/src/output/index.ts) — `createOutputService` vs `createGitHubOutputService` split
- [packages/contracts/src/outputService.ts](../packages/contracts/src/outputService.ts) — `OutputService`, `PublishPRError`
- [PR #459](https://github.com/MattGyverLee/keyboard-studio/pull/459) — `packages/oauth-backend/` (Grace, closes #63)
- claude-mem observations: #3619 (north-star goal), #3618 (submission posture, MIT/author-gated), #2815 (publishPR pipeline), #2830 (OAuth Fork+PR implementation), #2820 (stub vs real service split), #2817 (`OutputService` contract shape)
