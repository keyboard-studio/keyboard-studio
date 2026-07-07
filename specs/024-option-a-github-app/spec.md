# Feature Specification: Option A via GitHub App (retire the OAuth App)

**Feature Branch**: `024-option-a-github-app`

**Created**: 2026-07-06 · **Updated**: 2026-07-07 (FR-015/FR-016 decisions)

**Status**: Draft

**Input**: Re-implement the Option A "fork & submit yourself" delivery path using the studio's **GitHub App** (user-to-server token) instead of a separate **OAuth App**, modelled on how `kent-rasmussen/azt-recorder` + `kent-rasmussen/azt-collab` authenticate and write to GitHub. Goal: a single GitHub App serves sign-in **and** Option A **and** Option B, so the OAuth App can be retired entirely.

**Governing docs**: [docs/github-integration.md](../../docs/github-integration.md) §2 (Options A/B/C), §4a (auth), §5 Q3. This spec adds a delivery-path variant; cross-link it from `github-integration.md` §2 when landed. Progress tracked in [docs/github_flow.md](../../docs/github_flow.md).

---

## Background & motivation

Today Option A (user-fork, studio-managed PR — [github-integration.md §2](../../docs/github-integration.md)) is the **only** consumer of the classic **OAuth App** credential. Sign-in and Option B already run on the studio's **GitHub App**. The OAuth App exists solely because Option A forks `keymanapp/keyboards` into the *user's own account* and opens a PR *as the user*, which requires the `public_repo` scope — something a GitHub App was assumed unable to do.

Investigation of the A-Z+T mobile suite (`azt-recorder` + its `azt-collab` daemon) disproved that assumption. `azt_collabd/auth.py` obtains a **GitHub App user access token** and performs real git writes *as the user* on the user's own repositories, handling the App-installation lifecycle explicitly (`APP_NOT_INSTALLED`, `REPO_NOT_AUTHORIZED`, `APP_SUSPENDED`). A GitHub App **can** act on a user's repos — the cost is that the App must be **installed on the user's account** and the target repositories **authorized** to it.

Because Option A is already the **explicit opt-in, friction-tolerant** path (per §1a it is *"never the default and never required,"* and a Google-only user is *"prompted to connect a GitHub account"*), importing that install-flow friction onto Option A is acceptable in a way it would not be on the default path. This feature makes that trade and retires the OAuth App.

### What we borrow from the azt model

| azt-collab mechanism (`azt_collabd/auth.py`) | Adopted here |
|---|---|
| GitHub App user-to-server token; only the **public `client_id`** is embedded; secret stays server-side | Yes |
| Token **refresh** via `grant_type=refresh_token` | Yes |
| Detect installation: `GET /user/installations`, match app slug + account, read `repository_selection` (`all` vs `selected`), `installation_id`, `suspended_at` | Yes |
| Detect repo authorization: `GET /user/installations/{id}/repositories` | Yes |
| Diagnose a 403/404 into `APP_NOT_INSTALLED` / `REPO_NOT_AUTHORIZED` / `APP_SUSPENDED` / `ACCESS_DENIED` with a remediation URL (`settings/installations/<id>` or the install URL) | Yes |
| **Device flow** (`github.com/login/device/code`) for entering a code on a second screen | **No** — the SPA can redirect, so it uses the GitHub App **web authorization-code flow + PKCE** already shipped for sign-in. Device flow is noted as an out-of-scope fallback. |
| Local daemon holds the token on-device | **No** — not applicable to a browser SPA; token lifecycle is the existing SPA + `oauth-backend` seam ([github-integration.md §4](../../docs/github-integration.md)). |

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Power user submits their own PR via the GitHub App (Priority: P1)

A GitHub-signed-in author finishes a keyboard and clicks the opt-in **"Fork & submit yourself"** button. The studio, using the **same GitHub App identity** they signed in with, ensures the App is installed on their account, forks **`keyboard-studio/keyboards`** (the studio org's fork of `keymanapp/keyboards`, on which the App is installed — see FR-015) into their account, commits the working copy, pushes a branch, and opens a PR against `keyboard-studio/keyboards` — all under the user's own name. The user is shown their PR URL. No OAuth App is involved anywhere.

**Why this priority**: This is the feature. If it works end-to-end, the OAuth App can be deleted. It is the MVP.

**Independent Test**: With only the GitHub App credential configured (OAuth App env vars unset), a signed-in test user completes "Fork & submit yourself" and a PR appears on `keyboard-studio/keyboards` authored by that user, from a fork in their account.

**Acceptance Scenarios**:

1. **Given** a user signed in with the GitHub App who has the App installed with access to their repos, **When** they click "Fork & submit yourself", **Then** a fork is created (if absent), a branch is pushed, and a PR is opened against `keyboard-studio/keyboards`, and the PR URL is surfaced as plain text.
2. **Given** the same user, **When** the submission succeeds, **Then** the PR author is the user (not the studio org) and the commit is attributed to the user's verified email.
3. **Given** the OAuth App environment variables are entirely unset, **When** any user completes Option A, **Then** the flow succeeds using only the GitHub App credential (proving the OAuth App is unnecessary).

---

### User Story 2 — App not yet installed on the user's account (Priority: P1)

A GitHub-signed-in user clicks "Fork & submit yourself" but has never installed the studio's GitHub App on their account. Instead of a raw error, the studio detects `APP_NOT_INSTALLED` and shows a clear "Install the app to submit under your own name" prompt linking to the App's install page. After the user installs it and returns, the submission resumes.

**Why this priority**: Without this, first-time Option A users hit a dead end. The azt model shows this state is the norm, not an edge case — it must be a designed step, not an error.

**Independent Test**: A user who has never installed the App clicks Option A; the studio surfaces the install prompt with a working install URL; after installing and returning, the submission completes.

**Acceptance Scenarios**:

1. **Given** a signed-in user with the App **not** installed, **When** they trigger Option A, **Then** the studio surfaces `APP_NOT_INSTALLED` with the App install URL and does **not** show a stack trace or generic failure.
2. **Given** the install prompt, **When** the user installs the App and returns to the studio, **Then** the pending submission can be resumed without re-authoring or losing the working copy.

---

### User Story 3 — Fork exists but is not authorized to the installation (Priority: P2)

A user has the App installed with **"only select repositories"** selected. The studio creates (or finds) their fork of `keyboard-studio/keyboards`, but that fork is **not** in the installation's authorized set, so the push is refused. The studio detects `REPO_NOT_AUTHORIZED` and shows a prompt linking to `github.com/settings/installations/<id>` to add the fork, then resumes.

**Why this priority**: This is the crux difference from the OAuth App. A newly-created fork is a *new* repo that a "selected repositories" installation does not automatically cover. OAuth's `public_repo` blanket grant hid this; the GitHub App surfaces it. This must be handled, not left as a confusing 403.

**Independent Test**: With the App installed as "select repositories" (fork excluded), trigger Option A; confirm the studio surfaces `REPO_NOT_AUTHORIZED` with the correct per-installation settings URL; after the user authorizes the fork, the push and PR complete.

**Acceptance Scenarios**:

1. **Given** the App is installed with `repository_selection = "selected"` and the fork is not in the set, **When** the push is attempted, **Then** the studio surfaces `REPO_NOT_AUTHORIZED` with `owner/repo` and the `settings/installations/<id>` URL.
2. **Given** `repository_selection = "all"`, **When** the fork is created, **Then** no `REPO_NOT_AUTHORIZED` occurs and the submission proceeds without a return trip.
3. **Given** the App installation is **suspended**, **When** Option A is triggered, **Then** the studio surfaces `APP_SUSPENDED` with the resume URL rather than a generic error.

---

### User Story 4 — Google-only user opts into Option A (Priority: P3)

A user who signed up with Google clicks "Fork & submit yourself". Per [github-integration.md §5 Q6](../../docs/github-integration.md) (Self-fork for non-GitHub identities) the button is disabled with a "connect a GitHub account" prompt. Connecting runs the GitHub App user-to-server flow (not the OAuth App), after which Story 1 applies.

**Why this priority**: Preserves the existing §1a behaviour, but the "connect GitHub" action must now mint a **GitHub App** user token, not an OAuth App token.

**Independent Test**: A Google-identity session clicks Option A, is prompted to connect GitHub, completes the GitHub App connect flow, and reaches the Story 1 submit path.

**Acceptance Scenarios**:

1. **Given** an `IdentitySession.provider === "google"`, **When** the user clicks Option A, **Then** the button is disabled with a connect-GitHub prompt (unchanged from [github-integration.md §5 Q6](../../docs/github-integration.md)).
2. **Given** the connect-GitHub action, **When** it completes, **Then** the resulting token is a **GitHub App** user-to-server token (no OAuth App / `public_repo` involved).

---

### Edge Cases

- **Token expiry mid-pipeline.** A user access token expires during the 8-step publish. → Refresh once via `grant_type=refresh_token`, retry the failed call once, then surface `kind: "auth"` (per [github-integration.md §4](../../docs/github-integration.md) retry rule).
- **User belongs to multiple orgs that also installed the App.** `GET /user/installations` returns several entries. → Scope the installation check to the **repo owner / the user's own login** (azt's field-observed bug: picking the first match inspected an unrelated org's install and falsely reported `REPO_NOT_AUTHORIZED`).
- **Fork already exists from a prior submission.** → Reuse it; do not error. Branch naming follows §5 Q1 (`add/<keyboardId>`, uniqueness suffix TBD).
- **User revokes the App between sign-in and submit.** → Treated as `APP_NOT_INSTALLED`; re-prompt install.
- **Working copy must survive the install/authorize round trip.** Installing the App and authorizing a repo both leave and re-enter the SPA. → Reuse the existing snapshot-to-`sessionStorage` mechanism (`ks.working-copy.draft`, [github-integration.md §5 Q7](../../docs/github-integration.md)) so the in-progress keyboard is not lost.
- **PR base repo must have the App installed.** A user-to-server token can only open a PR whose base repo has the App installed (it does not inherit the user's ambient `public_repo` reach — confirmed in FR-015). → **Resolved by the FR-015 decision:** the base repo is `keyboard-studio/keyboards`, on which the App **is** installed, so the PR succeeds under the App token. Opening a PR directly against `keymanapp/keyboards` (App not installed) would 403 and is out of scope.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Option A MUST authenticate using the studio's **GitHub App** user-to-server token — the same App used for sign-in and Option B. It MUST NOT use a separate OAuth App.
- **FR-002**: The GitHub App user token MUST be obtained via the **web authorization-code flow with PKCE** already used for sign-in ([packages/studio/src/lib/githubOAuth.ts](../../packages/studio/src/lib/githubOAuth.ts)), with the code→token exchange performed server-side by `oauth-backend` so the client secret never reaches the browser.
- **FR-003**: The system MUST support **token refresh** for the GitHub App user token (`grant_type=refresh_token`), reusing the existing `POST /oauth/refresh` endpoint, and MUST refresh-then-retry-once before surfacing an auth failure.
- **FR-004**: Before pushing, the system MUST determine App-installation state for the user via `GET /user/installations`, reading `installation_id`, `repository_selection` (`all` vs `selected`), and `suspended_at`, and MUST scope the match to the **repo owner / user's own login** (not the first installation returned).
- **FR-005**: When `repository_selection = "selected"`, the system MUST verify the target fork is authorized via `GET /user/installations/{id}/repositories` before attempting a push.
- **FR-006**: The system MUST diagnose an access failure into one of `APP_NOT_INSTALLED`, `REPO_NOT_AUTHORIZED`, `APP_SUSPENDED`, or `ACCESS_DENIED`, each carrying a **remediation URL** (the App install URL, or `github.com/settings/installations/<id>`) that the SPA surfaces as a plain-language prompt — never a raw error.
- **FR-007**: The `PublishPRError` discriminated union ([packages/contracts/src/outputService.ts](../../packages/contracts/src/outputService.ts)) MUST gain variants `kind: "app-not-installed" | "repo-not-authorized" | "app-suspended"` so the SPA has a finite, typed set of remediation copies. The existing `kind: "scope"` variant becomes dead for Option A (no scopes on a GitHub App token) and MUST be removed once the OAuth App is gone.
- **FR-008**: On a resolvable remediation (`APP_NOT_INSTALLED`, `REPO_NOT_AUTHORIZED`, `APP_SUSPENDED`), the system MUST allow the user to complete the GitHub action and **resume** the same submission, preserving the working copy across the SPA round trip (reuse `ks.working-copy.draft`).
- **FR-009**: The fork+PR pipeline (`publishPR()` in [packages/engine/src/output/github.ts](../../packages/engine/src/output/github.ts)) MUST be reused unchanged in structure — only the auth-resolution step changes to yield a GitHub App user token, and the fork source / PR base becomes `keyboard-studio/keyboards` (FR-015). Fork → branch → commit → push → PR-against-`keyboard-studio/keyboards` semantics are preserved.
- **FR-010**: The PR MUST be authored by the **user** (their fork, their identity), preserving Option A's "own your contribution" property; commit attribution uses the user's verified primary email.
- **FR-011**: Once FR-001…FR-010 are in place, the system MUST retire the OAuth App: remove the `oauth_app` client discriminator and `REQUIRED_SCOPE`/`public_repo` submit path from [githubOAuth.ts](../../packages/studio/src/lib/githubOAuth.ts), remove `resolveCredentials()`'s OAuth-App branch and the `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET` / `VITE_GITHUB_OAUTH_CLIENT_ID` environment variables ([oauth-backend](../../utilities/oauth-backend/src/handlers.ts)), and update [github-integration.md §4a](../../docs/github-integration.md) to describe a single-App topology.
- **FR-012**: A Google-only identity clicking Option A MUST be prompted to connect GitHub via the **GitHub App** user-to-server flow (not the OAuth App); the disabled-button-with-prompt behaviour of [github-integration.md §5 Q6](../../docs/github-integration.md) is otherwise unchanged.
- **FR-013**: The GitHub App MUST be configured with the repository permissions Option A requires, confirmed against GitHub's permission reference ([permissions-required-for-github-apps](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps)): **Administration: write** + **Contents: read** to create the fork (`POST /repos/{owner}/{repo}/forks`), **Contents: write** to push the commit and branch to the fork, and **Pull requests: write** to open the PR (`POST /repos/{owner}/{repo}/pulls`). Only the App's **public `client_id`** is embedded in the SPA. These permissions must hold on the repository each call targets (see FR-015): the fork-creation permission on the source repo `keyboard-studio/keyboards` and push permission on the user's fork, and the **Pull requests: write** permission on the base repo `keyboard-studio/keyboards` — on which the App is installed (FR-015 decision).
- **FR-014**: No token (user access or refresh) may be logged at any level; `Authorization:` headers MUST be redacted in any debug logging (existing §4 invariant, restated because the credential type changes).

- **FR-015 (RESOLVED 2026-07-06 — answer: NO)**: A GitHub App token **cannot** open a pull request whose *base* is a repository the App is not installed on, even when the token has write to the head fork. Confirmed two ways:
  - **Empirical** (local run of the Option B installation-token path against the real App, `app_id 4144632` / installation `143577650`): `POST /repos/mattgyverlee/keyboards/pulls` (App absent on that owner) → **403 "Resource not accessible by integration"**; the identical call against `keyboard-studio/keyboards` (App installed) → **201**. Proven in both directions.
  - **Docs** ([permissions-required-for-github-apps](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps)): opening a PR needs **Pull requests: write** *on the base repo*; a user-to-server token carries only the **intersection** of the user's access and the App's *installed* permissions, so it does **not** inherit the user's ambient `public_repo` reach and cannot act on `keymanapp/keyboards` unless the App is installed there. (The finding was observed on the installation-token path; the same installation-scoping governs the user-to-server token Option A uses.)

  **DECISION (2026-07-07):** Option A targets **`keyboard-studio/keyboards`** — the studio org's fork of `keymanapp/keyboards`, on which the studio's GitHub App **is** installed — as both the fork source and the PR base. Because the App is installed there, it holds `administration:write`/`contents:read` (fork), `contents:write` (push to the user's fork), and `pull_requests:write` (PR) where each call lands, so the entire fork → push → PR flow runs on the GitHub App **user-to-server token alone**. This unblocks **SC-001** and **SC-004** and makes retiring the OAuth App achievable. The studio does **not** need `keymanapp` to install the App.

  Onward promotion of accepted PRs from `keyboard-studio/keyboards` to the real `keymanapp/keyboards` upstream is a **separate step, out of scope** for this spec (not user-facing; handled by the org, not the studio App). Opening a PR whose base is `keymanapp/keyboards` directly remains impossible under the App token (403) and is not attempted.
- **FR-016 (RESOLVED 2026-07-07)**: The connect/authorize entry point MUST use the **web authorization-code flow with PKCE** already shipped for sign-in (FR-002) — not device flow. **Decision:** no requirement forces device flow; the SPA can redirect, so it reuses the existing web flow. Device flow (azt's mechanism) stays out of scope unless the web flow proves unworkable in the SPA context, in which case it is the documented fallback (see Assumptions and Out of scope). This closes the last open marker in this spec.

### Key Entities

- **GitHub App user access token**: short-lived user-to-server token minted from the GitHub App via authorization-code exchange; acts with the intersection of the user's access and the App's permissions on installed repositories. Carries a refresh token. Replaces the OAuth App token for Option A.
- **App installation**: the record that the GitHub App is installed on the user's account; carries `installation_id`, `repository_selection` (`all`/`selected`), and suspension state. Gates whether the fork can be pushed.
- **Fork (user-owned)**: the user's fork of `keyboard-studio/keyboards`; created during Option A; must be within the installation's authorized repositories to be pushable.
- **`PublishPRError`**: the typed remediation union the SPA renders; gains the App-installation variants (FR-007).

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With the OAuth App environment variables entirely unset, a signed-in user completes Option A end-to-end and a PR appears on `keyboard-studio/keyboards` authored by that user, from a fork in their account. (The definitive proof the OAuth App is retired.)
- **SC-002**: Every App-installation failure mode (`APP_NOT_INSTALLED`, `REPO_NOT_AUTHORIZED`, `APP_SUSPENDED`) surfaces a plain-language prompt with a working remediation link — zero raw 403/404s reach the user.
- **SC-003**: After a user completes an install/authorize round trip, their in-progress working copy is intact and the submission resumes without re-authoring (0% working-copy loss across the round trip).
- **SC-004**: The codebase contains no remaining reference to a second (OAuth App) credential: no `oauth_app` discriminator, no `public_repo` / `REQUIRED_SCOPE`, no `GITHUB_OAUTH_CLIENT_*` env. A single GitHub App serves sign-in, Option A, and Option B. (Achievable under the FR-015 decision — Option A targets `keyboard-studio/keyboards`, where the App is installed.)
- **SC-005**: A "select repositories" installation whose set excludes the fork produces exactly one `REPO_NOT_AUTHORIZED` remediation (not a silent failure or a loop), and an "all repositories" installation produces zero return trips.

---

## Assumptions

- **The GitHub App is already the sign-in / Option B credential.** This spec assumes the "dual-topology" work (GitHub App as default sign-in + Option B installation token) has landed; it extends that App with the Option A capability rather than introducing a new App. If sign-in is still on the OAuth App per the current [github-integration.md §4a](../../docs/github-integration.md), that migration is a prerequisite.
- **Option A remains opt-in and GitHub-only.** It is never the default; the install/authorize friction is acceptable precisely because the user chose the "own your contribution" path.
- **Web authorization-code + PKCE is the flow.** Device flow (azt's mechanism) is out of scope for the SPA; we adopt azt's *token model and installation-lifecycle handling*, not its device-flow UX.
- **The existing `publishPR()` pipeline and `oauth-backend` seam are reused.** Only auth resolution and error mapping change; the fork/branch/commit/push/PR steps and the SPA↔engine `OutputService` boundary are unchanged.
- **`sessionStorage` working-copy snapshotting already exists** ([github-integration.md §5 Q7](../../docs/github-integration.md)) and is reused for the install/authorize round trips.
- **Retiring the OAuth App is the accepted end state** (product decision recorded during the azt investigation). This spec assumes that decision; it does not re-litigate whether to keep Option A. **Resolved (FR-015, 2026-07-07):** Option A targets `keyboard-studio/keyboards` (App installed), so full retirement is achievable on the GitHub App alone — no `keymanapp` App install is required.

---

## Out of scope

- Device-flow authentication (azt's mechanism) — noted only as a fallback if the web flow proves unworkable.
- Any change to Option B (org-mediated) or Option C (ZIP) beyond confirming they still run on the same single GitHub App.
- Submission targets other than `keyboard-studio/keyboards` — including opening PRs directly against `keymanapp/keyboards`, and the onward promotion of accepted `keyboard-studio/keyboards` PRs to that upstream (a separate, non-studio-App step).
- The on-device daemon model azt uses (`azt_collabd`) — not applicable to a browser SPA.
