# GitHub integration — architecture

Status: **draft, not yet ratified into [spec.md](../spec.md).** Captures architecture decisions from the 2026-06-15 §3a/§3b user-skill conversation (which previously lived only in claude-mem, not in any PR or commit) and reconciles them with the Day-1 OAuth fork+PR pipeline implemented in [packages/engine/src/output/github.ts](../packages/engine/src/output/github.ts) and the shipped oauth-backend ([utilities/oauth-backend/src/server.ts](../utilities/oauth-backend/src/server.ts)).

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

**Sign-up offers two identities; neither dictates the submission path.** At submission the studio presents **two buttons — "Sign up with GitHub" and "Sign up with Google" (Gmail)**. Both identity flows are now implemented: GitHub OAuth (PKCE) via [packages/studio/src/lib/githubOAuth.ts](../packages/studio/src/lib/githubOAuth.ts) and Google OAuth (PKCE, S256) via [packages/studio/src/lib/googleOAuth.ts](../packages/studio/src/lib/googleOAuth.ts), surfaced in [packages/studio/src/components/SignUpPanel.tsx](../packages/studio/src/components/SignUpPanel.tsx). This is an *identity / account-creation* choice only, deliberately decoupled from how the keyboard reaches `keymanapp/keyboards`. A user who signs up with Google never needs a GitHub account. Both identity flows route to Option B (org-mediated submission) by default; see §2 and §4a for the implementation status.

**The default submission path is org-mediated (Option B), for everyone.** Regardless of which identity they signed up with, the studio submits on the user's behalf through a **studio-controlled GitHub organization** — the user is credited via commit metadata and never sees a fork, branch, or PR thread. This is the §1 north star taken to its conclusion: the org absorbs the entire Git workflow.

**"Fork it yourself" is an explicit opt-in for power users.** For users who want to own the contribution end-to-end, the studio offers a button to **fork `keymanapp/keyboards` into their own account and open their own PR** (Option A). This requires a connected GitHub identity with `public_repo` scope, so it is only meaningful for GitHub sign-ups (a Google-only account is prompted to connect GitHub first). It is never the default and never required.

Net effect on Options A/B/C (§2): **B is now the default for all signed-up users; A is an opt-in "more control" button; C is the no-sign-up / offline escape hatch.** This inverts the prior "A if signed in, C if not; B is a future contingency" picker. The Option B server-side pipeline is now implemented (§4a); the remaining gap is wiring the SPA submit screen to it and delivering a Vercel serverless route.

## 2. Three delivery paths (Options A / B / C)

These are tracked operationally in [docs/github_flow.md](github_flow.md) (Status section). This doc owns the *why*; that one owns the *progress bar*.

- **Option A — User-fork, studio-managed PR.** The studio holds an OAuth token for the signed-in user, forks `keymanapp/keyboards` into the user's account if needed, creates a branch, commits the VirtualFS contents, pushes, opens a PR against upstream `main`. Per §1a this is the **opt-in "fork & submit yourself" path** for users who want to own the contribution; it requires a GitHub identity with `public_repo` scope and is **not** the default. (Implemented in PR #505.)
- **Option B — Org-mediated PR.** A studio-controlled GitHub App installation owns the fork and PR; the user is credited via a `Co-Authored-By` commit trailer and a provenance block in the PR body. Per §1a this is now the **default path for all signed-up users**, including the broadest user (community activist with no software background), and for anyone who signs up with Google rather than GitHub. The server-side pipeline (`submitManagedPR` in [utilities/oauth-backend/src/github-pipeline.ts](../utilities/oauth-backend/src/github-pipeline.ts)) is **implemented** and wired into the standalone Fastify [utilities/oauth-backend/src/server.ts](../utilities/oauth-backend/src/server.ts) at `POST /submit/managed-pr`; it authenticates using a GitHub App installation token (see §4a). A Vercel `/api/submit/managed-pr` serverless function is a tracked follow-up — do not assume it is deployed to `/api` yet.
- **Option C — ZIP download.** Final fallback. The studio emits a `.zip` of the VirtualFS conforming to the `keymanapp/keyboards/<id>/` layout; the user (or a helper) submits it some other way. This is the only path that works fully offline and is the universal escape hatch when OAuth is unavailable.

The user is **not** asked to pick between A and B. Per §1a (2026-06-22), the default for every signed-up user is **Option B (org-mediated)**; **Option A** is an explicit opt-in "fork & submit yourself" button for power users; **Option C** is the no-sign-up / offline path for users who only want a `.zip`. (This supersedes the original "A if signed in, C if not; B is a future contingency" picker.)

## 3. Architecture in code (Day-1)

The fork+PR pipeline exists end-to-end: the SPA side drives the OAuth authorize/callback/exchange flow; the oauth-backend ([utilities/oauth-backend/](../utilities/oauth-backend/src/)) holds secrets server-side and provides both the token-exchange endpoints and the Option B managed-PR pipeline.

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

## 4. Auth — `utilities/oauth-backend/`

The OAuth backend is a Fastify v5 service ([utilities/oauth-backend/src/server.ts](../utilities/oauth-backend/src/server.ts)) that holds client secrets server-side so the SPA can complete GitHub OAuth flows without exposing secrets to the browser. It handles both GitHub credential pairs (§4a) and the Option B managed-PR pipeline.

**What it is.** A Fastify v5 service that holds GitHub client secrets server-side and provides the managed-PR pipeline endpoint. It supports two GitHub credential pairs — the GitHub App pair (default sign-in) and the OAuth App pair (Option A) — selected per-request via the `client` discriminator field. See §4a for the full credential model.

**Endpoints (stable surface):**
- `POST /oauth/exchange` — authorization-code → access token (both credential pairs; `client` field selects which)
- `POST /oauth/refresh` — token rotation
- `POST /submit/managed-pr` — Option B org-mediated fork+PR (installation token; 503 when App vars absent)
- `GET  /oauth/health` — liveness probe

**Security invariants (do not break these on the consumer side either):**
- Client secret is server-side only — never returned, logged, or forwarded.
- **Stateless** — the backend does not persist tokens. The token lives in the SPA's session (memory or `sessionStorage`, not `localStorage`), and is sent on each `OutputService` call.
- CORS is an explicit allowlist via `OAUTH_ALLOWED_ORIGINS`; wildcard origins are rejected at startup.

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

## 4a. Two GitHub credentials — registration, scopes, and env vars

The studio uses **two distinct GitHub credentials** with separate jobs. Do not conflate them.

### GitHub App — default sign-in AND Option B server-side delivery

The **GitHub App** serves two roles:

1. **Default identity / sign-in.** The "Sign up with GitHub" button initiates a **user-to-server OAuth flow** against the GitHub App (client id prefix `Iv23…`). This is the standard `github.com/login/oauth/authorize` → callback → `/oauth/exchange` round-trip, with PKCE, but **no scope** — the `scope` parameter is omitted entirely from the authorize URL. GitHub returns an identity-only token; `/user` returning 200 is the connected check. There is no `IDENTITY_SCOPE` constant in the shipped code; `beginAuthorize()` with no `flow` argument omits `scope` altogether.

2. **Option B server-side PR delivery.** The same App's **installation** (the App installed on the org account that owns the standing fork of `keymanapp/keyboards`) is used server-side to mint a short-lived **installation access token** via `@octokit/auth-app`. The installation token drives the entire git pipeline in `submitManagedPR` — fork check, tree creation, commit, branch, PR — without any user token. Required App permissions: Repository → Contents (read/write), Pull requests (read/write), Metadata (read).

**Registration** (GitHub → Settings → Developer settings → **GitHub Apps** → New):
- **Authorization callback URL** — must exactly match [`getRedirectUri()`](../packages/studio/src/lib/githubOAuth.ts): `https://<host>/oauth/callback` (path-based, not hash). Register per environment.
- **User-to-server client id** (`Iv23…`) → `GITHUB_CLIENT_ID` (backend) and `VITE_GITHUB_CLIENT_ID` (SPA). The client id is public; safe to ship in the browser.
- **User-to-server client secret** → `GITHUB_CLIENT_SECRET` (backend only — never the browser, §4 invariant).
- **App installation** on the org that owns the fork → yields `GITHUB_APP_INSTALLATION_ID`.
- Device flow: **off**. Webhook: not required for this use.

### OAuth App — Option A "fork & submit yourself" opt-in only

The **OAuth App** (client id prefix `Ov23…`) is used **only** when the user explicitly chooses the "fork & submit yourself" path. This flow requests `public_repo` scope so the user's own token can fork `keymanapp/keyboards` and open a PR in their own name.

**Registration** (GitHub → Settings → Developer settings → **OAuth Apps** → New):
- **Authorization callback URL** — same `https://<host>/oauth/callback` as above.
- **Client id** (`Ov23…`) → `GITHUB_OAUTH_CLIENT_ID` (backend) and `VITE_GITHUB_OAUTH_CLIENT_ID` (SPA).
- **Client secret** → `GITHUB_OAUTH_CLIENT_SECRET` (backend only).
- Device flow: **off**.

### Scopes — incremental authorization

Per the §1a decoupling of identity from submission:

| Flow | App type | Scope sent | Shipped constant |
|---|---|---|---|
| **Sign-up / identity** — the default | GitHub App (user-to-server) | **none** — `scope` param omitted | (no constant; `beginAuthorize()` omits it) |
| **Self-fork submit (Option A opt-in)** — only when user chooses "fork & submit yourself" | OAuth App | **`public_repo`** | `REQUIRED_SCOPE` |

The sign-up flow must **never** request `public_repo` — that would show an "access your repositories" consent screen just to log in, contradicting the §1 north star. [`beginAuthorize()`](../packages/studio/src/lib/githubOAuth.ts) defaults to the identity flow and omits scope; the Option A submit path calls `beginAuthorize("submit")` which uses the OAuth App client id and adds `REQUIRED_SCOPE`. The SPA enforces the scope check only for `oauth_app` tokens; a `github_app` identity token has no scopes and is treated as "connected" once `/user` returns 200.

### How the two flows share the same endpoints

Both sign-in flows hit the same `/oauth/exchange` endpoint. The SPA sends a `client: "github_app" | "oauth_app"` field in the exchange body; the backend ([utilities/oauth-backend/src/handlers.ts](../utilities/oauth-backend/src/handlers.ts)) picks the matching credential pair from `resolveCredentials()`. The stored `StoredGitHubToken` carries the `client` field so the SPA knows which app minted it. The engine's `verifyToken` is intentionally unchanged; `missingScopes` in its result is interpreted per token type in the SPA.

### Environment variables

| Variable | Required | Value | Purpose |
|---|---|---|---|
| `GITHUB_CLIENT_ID` | yes | `Iv23…` (GitHub App user-to-server client id) | Default sign-in — backend credential |
| `GITHUB_CLIENT_SECRET` | yes | (secret) | Default sign-in — backend only, never logged |
| `VITE_GITHUB_CLIENT_ID` | yes (SPA) | same `Iv23…` | Default sign-in — authorize URL builder in browser |
| `GITHUB_OAUTH_CLIENT_ID` | Option A only | `Ov23…` (OAuth App client id) | Option A "fork & submit yourself" — backend |
| `GITHUB_OAUTH_CLIENT_SECRET` | Option A only | (secret) | Option A — backend only, never logged |
| `VITE_GITHUB_OAUTH_CLIENT_ID` | Option A only | same `Ov23…` | Option A — authorize URL builder in browser |
| `GITHUB_APP_ID` | Option B only | numeric app id | Installation-token minter — distinct from `GITHUB_CLIENT_ID` |
| `GITHUB_APP_PRIVATE_KEY` | Option B only | base64-encoded PEM | Installation-token minter — decoded in memory, never logged |
| `GITHUB_APP_INSTALLATION_ID` | Option B only | numeric installation id | Installation-token minter |
| `GITHUB_ORG_LOGIN` | Option B only | org login | Org that owns the standing fork of `keymanapp/keyboards` |
| `GITHUB_ORG_TOKEN` | **retired** | — | Replaced by the installation token; remove from any deployment |

`GITHUB_APP_ID` (numeric App id) is **distinct** from `GITHUB_CLIENT_ID` (the App's `Iv23…` user-to-server client id). They refer to the same registered App but serve different purposes: the client id drives the OAuth authorize flow; the App id drives the installation-token mint via `@octokit/auth-app`.

All four Option B vars (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_ORG_LOGIN`) must be set together or all absent. A partial set triggers a startup warning and leaves `POST /submit/managed-pr` returning 503.

## 5. Open questions (parked, surface before implementing)

1. **Branch naming.** The convention is `add/<keyboardId>` — matching the shipped contract (`packages/contracts/src/outputService.ts` §12, `PublishPROptions.branchName` JSDoc) and the engine implementation (`packages/engine/src/output/github.ts`). Open question: whether to append a uniqueness suffix (e.g. `add/<keyboardId>-<shortHash>`, as Option B already does) to avoid collisions when the same keyboard is re-submitted while its prior branch is still open on the fork. Decide before second-submission UX lands.
2. **Re-submission posture.** If the same user re-opens the same working copy after their first PR merged, do we open a *new* PR off latest upstream `main`, or push to the existing branch? Default proposal: **always a new branch.** Avoids reasoning about whether the prior branch was deleted, force-pushed, or had upstream changes since.
3. **Option B (org-mediated) — server-side pipeline implemented; Vercel route is a follow-up.** `submitManagedPR` in [utilities/oauth-backend/src/github-pipeline.ts](../utilities/oauth-backend/src/github-pipeline.ts) is shipped: it uses a GitHub App installation token (§4a `GITHUB_APP_*` vars), commits with a `Co-Authored-By` trailer, and opens a draft PR. The route is wired into the standalone Fastify server. Open items: (a) wiring the SPA submit screen to `POST /submit/managed-pr` for non-Option-A users, (b) the Vercel `/api/submit/managed-pr` serverless function, and (c) the UX that tells the user their submission went via the org.
4. **Token storage in the SPA.** `sessionStorage` is confirmed: the shipped backend is stateless and the SPA stores `StoredGitHubToken` under `ks.github.token` (tab-scoped, cleared on tab close, not shared across tabs). The Google identity claim is stored under `ks.google.identity` on the same basis.
5. **Google (Gmail) identity backend (§1a).** ~~Decide: does the studio gain its own account/identity store, or does Google sign-in mint a session that always routes through Option B?~~ **RESOLVED 2026-06-24:** Google sign-in mints a **stateless identity-only session** — no account or identity store is created, upholding the §4 "backend does not persist tokens" invariant. The backend's `POST /oauth/google/exchange` exchanges the authorization code at Google, validates the `id_token`'s `aud`/`iss`/`exp` cheaply (no JWKS dependency; token arrives directly from Google over TLS), and returns only decoded identity claims `{sub, email, email_verified, name, picture}` — never a token. The SPA stores this identity in `sessionStorage` (key `ks.google.identity`), never the Google access or id token. Submission for Google-identified users routes to the Option B (org-mediated) path. The Option B server-side pipeline is implemented (§4a); the SPA wiring for Google-identified users submitting via Option B is a tracked follow-up.
6. **Self-fork for non-GitHub identities (§1a).** ~~Decide the UX when a Google-only user clicks Option A — prompt to connect a GitHub account, or hide the button for Google sign-ups.~~ **RESOLVED 2026-06-24:** A Google-only user who clicks the Option A "fork it yourself" affordance is **prompted to connect a GitHub account**. The Option A button is **disabled (not hidden)** for sessions where `IdentitySession.provider === "google"` (see `src/lib/identity.ts`). Hiding it entirely would obscure the path's existence; disabling with a prompt preserves discoverability for power users who may later connect GitHub.
7. **Guest → sign-up hand-off (§1a).** ~~Authoring happens as a guest with the working copy in memory; sign-up is deferred to submit time. Confirm the working copy survives the OAuth redirect round-trip (the redirect leaves and re-enters the SPA) so the guest's in-progress keyboard is not lost at the moment they sign up.~~ **RESOLVED 2026-06-25:** The working copy did **not** survive — this was a real defect. The working copy lives only in the in-memory Zustand store ([packages/studio/src/stores/workingCopyStore.ts](../packages/studio/src/stores/workingCopyStore.ts)); both OAuth flows use `window.location.assign` (full-page redirect), so the guest's in-progress keyboard was lost on sign-up.

   Resolution (now implemented): the working copy is **snapshotted to `sessionStorage` (key `ks.working-copy.draft`) immediately before the OAuth redirect and rehydrated on app mount**, reusing the same consume-and-clear `sessionStorage` idiom already used for the PKCE verifier/state in [packages/studio/src/lib/githubOAuth.ts](../packages/studio/src/lib/githubOAuth.ts). A full snapshot is stored (not a delta) — a typical working copy is ~50–100 KB, well under the ~5 MB quota, and delta-only would require a network base re-fetch at the post-redirect moment. Serialization is lossless: VirtualFS binary entries (icons) are Base64-encoded, `Set` fields (`deletedNodeIds`/`deletedItemIds`) are stored as arrays, and `KeyboardIR` is direct JSON. Derived fields are **not** stored but re-derived on rehydration: `removalCapabilities` (recomputed via `classifyRemovalCapabilities` from the restored IR) and `session` (recomputed via `mergePhaseResults`). Implemented in [packages/studio/src/lib/persistWorkingCopy.ts](../packages/studio/src/lib/persistWorkingCopy.ts), wired into the connect() paths of [packages/studio/src/hooks/useGitHubAuth.ts](../packages/studio/src/hooks/useGitHubAuth.ts) and [packages/studio/src/hooks/useGoogleAuth.ts](../packages/studio/src/hooks/useGoogleAuth.ts), and the rehydration seam in [packages/studio/src/main.tsx](../packages/studio/src/main.tsx).

## 6. References

- [spec.md §3a — User Skill Envelope](../spec.md) (2026-06-15 commit on `claude/nice-noether-z122uh`)
- [spec.md §3b — Success Definition](../spec.md)
- [docs/github_flow.md](github_flow.md) — Options A/B/C delivery-path progress tracking
- [docs/workflow-model.md](workflow-model.md) — working-copy spine (single persistent copy, serialized only at output)
- [packages/engine/src/output/github.ts](../packages/engine/src/output/github.ts) — `publishPR()` 8-step pipeline
- [packages/engine/src/output/index.ts](../packages/engine/src/output/index.ts) — `createOutputService` vs `createGitHubOutputService` split
- [packages/contracts/src/outputService.ts](../packages/contracts/src/outputService.ts) — `OutputService`, `PublishPRError`
- [utilities/oauth-backend/src/server.ts](../utilities/oauth-backend/src/server.ts) — Fastify oauth-backend (shipped; originated as PR #459)
- claude-mem observations: #3619 (north-star goal), #3618 (submission posture, MIT/author-gated), #2815 (publishPR pipeline), #2830 (OAuth Fork+PR implementation), #2820 (stub vs real service split), #2817 (`OutputService` contract shape)
