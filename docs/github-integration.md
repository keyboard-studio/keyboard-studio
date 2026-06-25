# GitHub integration — architecture

Status: **draft, not yet ratified into [spec.md](../spec.md).** Captures architecture decisions from the 2026-06-15 §3a/§3b user-skill conversation (which previously lived only in claude-mem, not in any PR or commit) and reconciles them with the Day-1 OAuth fork+PR pipeline already implemented in [packages/engine/src/output/github.ts](../packages/engine/src/output/github.ts) and the in-flight [oauth-backend PR #459](https://github.com/keyboard-studio/keyboard-studio/pull/459).

This is the home for "how does the keyboard get into `keymanapp/keyboards`?" Cross-link from here when adding new delivery paths, not the other way around.

## 1. North star — what the user is allowed to know about Git

Restated from [spec.md §3a](../spec.md) (User Skill Envelope, committed 2026-06-15):

> **The studio manages the tech side; the user manages only linguistics. A GitHub login is acceptable; a GitHub workflow is not.**

Operationally:

| User-facing | Studio-internal |
|---|---|
| "Sign up with GitHub" / "Sign up with Google" buttons (at submit, §1a) | Identity creation, decoupled from submission path; GitHub OAuth via `oauth-backend`, Google OAuth TBD |
| "Submit my keyboard" button | By default: studio GitHub org owns fork / branch / commit / push / PR (Option B). Optional "fork & submit yourself" → Option A |
| "Update my keyboard" (later session) | Same working copy → new branch off current `main`, force-push policy decided by studio |
| "Your submission is being reviewed" | PR URL, CI status, reviewer comments surfaced as plain text |
| (nothing) | Branches, rebases, conflict resolution, PR-review thread navigation |

**Success = a PR lands in the chosen delivery path with the user never having seen the word "branch."** If the user has to read GitHub UI to finish a submission, the studio has failed at its job — that is a design defect, not a user-education gap.

Corollaries that shape the architecture:

- **One-time submission is the dominant case.** Monolingual keyboards typically ship once. The studio does not need a session-history browser, diff-against-previous-version, or "resume an old project" as a first-class feature. (Multi-year MML is out of scope; see [spec.md §3b](../spec.md) and §7.)
- **Within-studio forks are not a separate concept.** The user has one working copy per keyboard (the working-copy spine, [spec.md §3.1](../spec.md)). If someone else needs to take over a keyboard, they fork at the `keymanapp/keyboards` level — Keyman's policy, not the studio's UI.
- **Constructive user feedback after submission is not assumed.** "It doesn't work" is the realistic feedback channel. The studio optimises for *successful first submission*, not iterative improvement driven by post-submission user reports.
- **Licensing is MIT, surfaced in the documentation phase**, not as a checkbox at submit time.

## 1a. Account creation vs. submission — decoupled (2026-06-22 decision)

Two things §1's north star left implicit, resolved 2026-06-22:

**Sign-up is guest-first and deferred.** The user moves through the entire keyboard-creation flow as a **guest** — no account is required to author. Sign-up is requested only at the *end*, at the point of submission. The exception is the ZIP path (Option C), which needs no account at all: a user who only wants a `.zip` never signs up.

**Sign-up offers two identities; neither dictates the submission path.** At submission the studio presents **two buttons — "Sign up with GitHub" and "Sign up with Google" (Gmail)**. Both identity flows are now implemented: GitHub OAuth (PKCE) via [packages/studio/src/lib/githubOAuth.ts](../packages/studio/src/lib/githubOAuth.ts) and Google OAuth (PKCE, S256) via [packages/studio/src/lib/googleOAuth.ts](../packages/studio/src/lib/googleOAuth.ts), surfaced in [packages/studio/src/components/SignUpPanel.tsx](../packages/studio/src/components/SignUpPanel.tsx). This is an *identity / account-creation* choice only, deliberately decoupled from how the keyboard reaches `keymanapp/keyboards`. A user who signs up with Google never needs a GitHub account. Note: both identity flows route to Option B (org-mediated submission), which remains unbuilt — see §2.

**The default submission path is org-mediated (Option B), for everyone.** Regardless of which identity they signed up with, the studio submits on the user's behalf through a **studio-controlled GitHub organization** — the user is credited via commit metadata and never sees a fork, branch, or PR thread. This is the §1 north star taken to its conclusion: the org absorbs the entire Git workflow.

**"Fork it yourself" is an explicit opt-in for power users.** For users who want to own the contribution end-to-end, the studio offers a button to **fork `keymanapp/keyboards` into their own account and open their own PR** (Option A). This requires a connected GitHub identity with `public_repo` scope, so it is only meaningful for GitHub sign-ups (a Google-only account is prompted to connect GitHub first). It is never the default and never required.

Net effect on Options A/B/C (§2): **B is now the default for all signed-up users; A is an opt-in "more control" button; C is the no-sign-up / offline escape hatch.** This inverts the prior "A if signed in, C if not; B is a future contingency" picker — and it is the gap against shipped code (PR #505 implemented Option A as the submit path; Option B does not yet exist).

## 2. Three delivery paths (Options A / B / C)

These are tracked operationally in [docs/github_flow.md](github_flow.md) (Status section). This doc owns the *why*; that one owns the *progress bar*.

- **Option A — User-fork, studio-managed PR.** The studio holds an OAuth token for the signed-in user, forks `keymanapp/keyboards` into the user's account if needed, creates a branch, commits the VirtualFS contents, pushes, opens a PR against upstream `main`. Per §1a this is the **opt-in "fork & submit yourself" path** for users who want to own the contribution; it requires a GitHub identity with `public_repo` scope and is **not** the default. (Implemented in PR #505.)
- **Option B — Org-mediated PR.** A studio-controlled GitHub App / bot account owns the fork and PR; the user is credited via commit metadata (`Co-Authored-By` or attribution sidecar). Per §1a this is now the **default path for all signed-up users**, including the broadest user (community activist with no software background), and for anyone who signs up with Google rather than GitHub. **Not yet implemented** — this is the critical path.
- **Option C — ZIP download.** Final fallback. The studio emits a `.zip` of the VirtualFS conforming to the `keymanapp/keyboards/<id>/` layout; the user (or a helper) submits it some other way. This is the only path that works fully offline and is the universal escape hatch when OAuth is unavailable.

The user is **not** asked to pick between A and B. Per §1a (2026-06-22), the default for every signed-up user is **Option B (org-mediated)**; **Option A** is an explicit opt-in "fork & submit yourself" button for power users; **Option C** is the no-sign-up / offline path for users who only want a `.zip`. (This supersedes the original "A if signed in, C if not; B is a future contingency" picker.)

## 3. Architecture in code (Day-1)

The fork+PR pipeline already exists end-to-end on the SPA side; the missing piece is server-side token exchange, which Grace is landing as a sibling package.

### 3.1 Google identity flow — `packages/studio/src/`

The Google OAuth PKCE flow ships across these files: [src/lib/googleOAuth.ts](../packages/studio/src/lib/googleOAuth.ts) (authorization + code exchange), [src/hooks/useGoogleAuth.ts](../packages/studio/src/hooks/useGoogleAuth.ts) (React hook), [src/lib/pkce.ts](../packages/studio/src/lib/pkce.ts) (shared PKCE helpers, used by both GitHub and Google), [src/lib/identity.ts](../packages/studio/src/lib/identity.ts) (`IdentitySession` discriminated union: `provider:"github" | "google"`), [src/lib/handleOAuthCallback.ts](../packages/studio/src/lib/handleOAuthCallback.ts) (`/oauth/google/callback` handling), and [src/components/SignUpPanel.tsx](../packages/studio/src/components/SignUpPanel.tsx) (renamed from `GitHubSignUpPanel.tsx`; now surfaces both identity buttons). The backend endpoint `POST /oauth/google/exchange` lives in [utilities/oauth-backend/src/google-handlers.ts](../utilities/oauth-backend/src/google-handlers.ts) (schemas: [google-schemas.ts](../utilities/oauth-backend/src/google-schemas.ts)).

### 3.3 Engine — `packages/engine/src/output/`

- **`github.ts` — `publishPR()` is an 8-step Fork+PR pipeline.** Resolve auth → ensure fork exists → create branch off upstream default → serialize VirtualFS → commit blobs → push tree → open PR → return `{ prUrl, commitSha }`. Errors are typed as the `PublishPRError` union so the SPA can surface remediation rather than a stack trace.
- **`createGitHubOutputService()` vs `createOutputService()`.** The real OAuth path is `createGitHubOutputService`. The bare `createOutputService` is a **stub** — returns the same `OutputService` shape but writes nowhere; used by tests and the ZIP-only path. Do not collapse the two; the stub's existence is what lets the studio run without network.
- **`sidecar.ts` + `import-attribution.ts`.** Companion files that emit the `*.sidecar.json` import-attribution record alongside the keyboard, so when a keyboard derives from an existing base (Track 1) or a real import (Track 2), the provenance is in-tree rather than only in the PR body. Extension points for issue #239 and related work.
- **`zip.ts`.** Serializes the VirtualFS to a buffer; used by Option C directly and by `github.ts` indirectly (push uses a different code path but expects the same layout).

### 3.4 Contracts — `packages/contracts/src/outputService.ts`

`OutputService` is the seam between the studio (which knows nothing about GitHub) and the engine (which does). Two fields matter for this doc:

- `importAttribution?: string` (on `PublishPROptions`, not `OutputService`) — non-null whenever the session was initialized from an imported keyboard; build via `buildImportAttributionBlock()` in `packages/engine/src/output/import-attribution.ts`.
- `PublishPRError` — discriminated union (`kind: "auth" | "scope" | "rate-limit" | "branch-exists" | "network" | "unknown"`) so the SPA's submit screen has a finite set of remediation copies to render. Add a variant here before adding a new failure mode in `github.ts`.

The studio talks to the `OutputService` interface, not to the engine implementation. That is the *only* abstraction barrier protecting §3a's "no GitHub workflow knowledge required" rule on the SPA side.

## 4. Auth — integrating with PR #459 (`packages/oauth-backend/`)

[PR #459 (gboltono)](https://github.com/keyboard-studio/keyboard-studio/pull/459) is the server-side companion the existing `github.ts` pipeline has been waiting for. Treat it as the assumed shape going forward; do not reinvent the boundary on the engine side.

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
3. **Option B (org-mediated) — now the default (§1a), still unbuilt.** Needs: the studio GitHub-org / bot identity, the commit-attribution shape (`Co-Authored-By` vs attribution sidecar), and how the user is told their submission goes via the org. This is now the critical path, not a contingency — and the gap against shipped code (PR #505 implemented Option A as the submit path; B does not yet exist).
4. **Token storage in the SPA.** `sessionStorage` is the current assumption (cleared on tab close, not shared across tabs). Confirm with Grace before the OAuth-backend PR merges, since it constrains the SPA-side wrapper.
5. **Google (Gmail) identity backend (§1a).** ~~Decide: does the studio gain its own account/identity store, or does Google sign-in mint a session that always routes through Option B?~~ **RESOLVED 2026-06-24:** Google sign-in mints a **stateless identity-only session** — no account or identity store is created, upholding the §4 "backend does not persist tokens" invariant. The backend's `POST /oauth/google/exchange` exchanges the authorization code at Google, validates the `id_token`'s `aud`/`iss`/`exp` cheaply (no JWKS dependency; token arrives directly from Google over TLS), and returns only decoded identity claims `{sub, email, email_verified, name, picture}` — never a token. The SPA stores this identity in `sessionStorage` (key `ks.google.identity`), never the Google access or id token. Submission for Google-identified users routes to the Option B (org-mediated) label. Option B itself remains unbuilt; see §2.
6. **Self-fork for non-GitHub identities (§1a).** ~~Decide the UX when a Google-only user clicks Option A — prompt to connect a GitHub account, or hide the button for Google sign-ups.~~ **RESOLVED 2026-06-24:** A Google-only user who clicks the Option A "fork it yourself" affordance is **prompted to connect a GitHub account**. The Option A button is **disabled (not hidden)** for sessions where `IdentitySession.provider === "google"` (see `src/lib/identity.ts`). Hiding it entirely would obscure the path's existence; disabling with a prompt preserves discoverability for power users who may later connect GitHub.
7. **Guest → sign-up hand-off (§1a).** Authoring happens as a guest with the working copy in memory; sign-up is deferred to submit time. Confirm the working copy survives the OAuth redirect round-trip (the redirect leaves and re-enters the SPA) so the guest's in-progress keyboard is not lost at the moment they sign up.

## 6. References

- [spec.md §3a — User Skill Envelope](../spec.md) (2026-06-15 commit on `claude/nice-noether-z122uh`)
- [spec.md §3b — Success Definition](../spec.md)
- [docs/github_flow.md](github_flow.md) — Options A/B/C delivery-path progress tracking
- [docs/workflow-model.md](workflow-model.md) — working-copy spine (single persistent copy, serialized only at output)
- [packages/engine/src/output/github.ts](../packages/engine/src/output/github.ts) — `publishPR()` 8-step pipeline
- [packages/engine/src/output/index.ts](../packages/engine/src/output/index.ts) — `createOutputService` vs `createGitHubOutputService` split
- [packages/contracts/src/outputService.ts](../packages/contracts/src/outputService.ts) — `OutputService`, `PublishPRError`
- [PR #459](https://github.com/keyboard-studio/keyboard-studio/pull/459) — `packages/oauth-backend/` (Grace, closes #63)
- claude-mem observations: #3619 (north-star goal), #3618 (submission posture, MIT/author-gated), #2815 (publishPR pipeline), #2830 (OAuth Fork+PR implementation), #2820 (stub vs real service split), #2817 (`OutputService` contract shape)
