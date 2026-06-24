# Keyboard Studio — Delivery Options

Three ways a user can submit a finished keyboard to `keymanapp/keyboards`.
The studio should offer all three; users pick at output time.

---

## Option A — User-fork, app-managed

> The keyboard lives permanently on the user's GitHub. The studio manages it
> on their behalf via OAuth, then hands control back to them for the PR.

**Flow**

1. User clicks "Submit via GitHub".
2. If they have not already forked `keymanapp/keyboards`, the studio guides
   them through that one-time step (or forks programmatically via the API
   using their token once they authorise).
3. User authorises the **keyboard-studio GitHub OAuth App** on their account
   (scope: `public_repo`).  This produces a token the studio holds for the
   session.
4. The studio uses that token to:
   - Create branch `add/<keyboardId>` on their fork.
   - Commit the VirtualFS source tree to that branch (compiled artifacts
     excluded per criteria SS1 — no `.kmx`, `.kvk`, `.js`).
5. When the user declares the keyboard stable, the studio opens a **draft PR**
   from `<userLogin>/keyboards:add/<keyboardId>` →
   `keymanapp/keyboards:master` with the auto-generated PR body (green/yellow/
   red checklist + copyright attestation, spec §12).
6. The user receives the PR URL and manages everything from that point on
   (add reviewers, respond to feedback, mark ready for review, merge).

**What the user needs**
- A GitHub account
- Permission to fork `keymanapp/keyboards` (public repo — always allowed)

**Backend required?**  No.  All API calls use the user's own token; nothing
server-side needs to be kept secret.

**Contract alignment** — `OutputService.publishPR(fs, opts)` with
`opts.token` = user OAuth token, `opts.forkOwner` = user GitHub login.
`OutputService.verifyToken(token)` gates the flow before the first API call.

---

## Option B — Org-mediated, abstracted

> The studio submits on the user's behalf through a keyboard-studio GitHub
> organisation account.  The user needs no GitHub account.

**Flow**

1. User clicks "Submit via Keyboard Studio".
2. User provides attribution: display name and email (shown in commit and PR).
3. The studio POSTs the VirtualFS + attribution to a **keyboard-studio backend
   proxy** (Cloudflare Worker / Vercel function).
4. The proxy — holding the org service-account token server-side — commits to
   the org's standing fork of `keymanapp/keyboards` on a branch named
   `add/<keyboardId>-<shortHash>`, using:
   ```
   Co-authored-by: Display Name <email@example.com>
   ```
5. The proxy opens a draft PR to `keymanapp/keyboards`, noting in the body
   that it was submitted through keyboard-studio on behalf of the named author.
6. The user receives a PR URL for monitoring.  The keyboard-studio org account
   is listed as the PR author; the human author appears in `Co-authored-by`.

**What the user needs**
- Nothing GitHub-specific; any email address suffices for attribution.

**Backend required?**  Yes — a lightweight serverless proxy is mandatory.
The org token **must not** be embedded in client-side code; any user could
extract it and push arbitrary content to the fork.

**Contract alignment** — `OutputService` needs an extension:
`publishManagedPR(fs, attribution, proxyEndpoint)`.  `forkOwner` and `token`
are not user-provided in this path; they are resolved server-side.

---

## Option C — ZIP download, manual upload

> No GitHub involvement from the studio.  The user downloads a compliant ZIP
> and submits it through whatever channel they prefer.

**Flow**

1. User clicks "Download ZIP".
2. The studio serialises the VirtualFS to a `.zip` (source files only,
   `NEXT_STEPS.md` injected, compiled artifacts stripped — spec §12).
3. User saves the file locally.
4. User submits to `keymanapp/keyboards` on their own:
   - Via GitHub web interface (upload files),
   - Via `git` CLI after cloning their fork, or
   - By emailing the maintainers / attaching to a GitHub issue.

**What the user needs**
- Nothing.  No account, no network call beyond the download itself.

**Backend required?**  No.

**Contract alignment** — `OutputService.toZip(fs)` already covers this path
exactly.

---

## Comparison

| | A — User fork | B — Org-mediated | C — ZIP |
|---|---|---|---|
| GitHub account required | Yes | No | No |
| Backend proxy required | No | Yes | No |
| PR authorship | User's account | Org account + Co-authored-by | n/a |
| User controls PR | Yes | No (view-only link) | n/a |
| Studio controls commit | Yes (via user token) | Yes (via org token) | n/a |
| Offline capable | No | No | Yes |
| `OutputService` method | `publishPR` | `publishManagedPR` (new) | `toZip` |

---

## Implementation order (recommended)

1. **Option C** — `toZip` implementation: no auth, no network, unblocks
   the full studio loop immediately.
2. **Option A** — `publishPR` implementation: register the GitHub OAuth App,
   implement fork-if-not-exists + commit + draft-PR using the user's token.
3. **Option B** — `publishManagedPR`: deploy the backend proxy, extend the
   `OutputService` contract, wire attribution into commit metadata.

---

## Status

> Keep this section up to date as work lands. Update it whenever a delivery
> option moves from "not started" to "in progress" or "done".
> Last updated: 2026-06-23

### Pipeline prerequisites (must exist before any delivery option works)

| Service | Status | Notes |
|---|---|---|
| Base-browser (`BaseBrowserService`) | **Done** | Issue #20 — `packages/engine/src/base-browser/`; Trees API client, `.kps` parser, 10-min TTL cache, offline fallback |
| Validator — TS-portable checks | **Done** | Issues #14–15 — `packages/engine/src/validator/checks/` (9 checks) |
| Validator — WASM oracle | **Done** | Issue #16 — `packages/engine/src/validator/oracle.ts` + `wasmLoader.ts` |
| Compiler service | **Done** | Issue #17 — `packages/engine/src/compiler/` |
| Source loader (VFS hydration) | **Done** | Issue #39 — `packages/engine/src/loader/fetchKeyboardSourceToVfs.ts` |
| Scaffolder (`ScaffolderService`) | **Done** | Issue #32 — `packages/engine/src/scaffolder/`; `createScaffolderService().scaffold()` wired into studio UI via `ScaffoldForm`; codec fixes (`&VERSION` 1.0→14.0, `&CasedKeys` casing) proved by `scaffold-compile.integration.test.ts` (2 artifacts, 0 diagnostics) |
| VirtualFS serialisation | **Done** | Delivered as part of issue #46 — `toZip` walks the VirtualFS |

### Option C — ZIP download

| Step | Status | Notes |
|---|---|---|
| `OutputService.toZip` contract | **Done** | `packages/contracts/src/outputService.ts` |
| `toZip` implementation | **Done** | Issue #46 — `packages/engine/src/output/zip.ts`; fflate, injects `NEXT_STEPS.md`, compiled artifacts included per spec §12, 11 vitest specs |
| `serializeToZip` alias | **Done** | Exported from `packages/engine/src/output/zip.ts` |
| `createOutputService()` factory | **Done** | `packages/engine/src/output/index.ts` — zip wired; GitHub path throws "not implemented" until issue #47 |
| Studio UI — "Download ZIP" button | **Done** | Issue #32 — `PreviewShell` calls `getToZip()(stage.vfs)`, wraps result in `Blob`, triggers anchor click; button label "Download .zip"; `USE_REAL` flag respected (mock fallback in CI) |

### Option A — User-fork, app-managed

| Step | Status | Notes |
|---|---|---|
| `OutputService.publishPR` contract | **Done** | `packages/contracts/src/outputService.ts`; `PublishPROptions` has `token`, `forkOwner`, `branchName`, `commitMessage`, `prTitle`, `prBody` |
| `OutputService.verifyToken` contract | **Done** | Pre-flight scope check defined |
| `verifyToken` implementation | **Done** | Issue #47 — `packages/engine/src/output/github.ts`; reads `X-OAuth-Scopes`, accepts `public_repo` or `repo` |
| `publishPR` implementation | **Done** | Issue #47 — `packages/engine/src/output/github.ts`; fork-if-not-exists → tree → commit → branch ref → draft PR via GitHub Git Data API; compiled artifacts excluded (SS1); 13 vitest specs |
| `createGitHubOutputService()` factory | **Done** | Injectable `GitHubFetchFn` for testability; default delegates to global fetch |
| GitHub OAuth App registration | **Deploy-gated** | Issue #550 — runbook in [`utilities/oauth-backend/DEPLOY.md`](../utilities/oauth-backend/DEPLOY.md); needs org-admin to register a prod OAuth App with callback `https://<prod>/oauth/callback` |
| OAuth token-exchange backend | **Done (code) — co-located on Vercel; deploy pending** | Core in `utilities/oauth-backend/` (Fastify v5 + 30 specs); co-located as Vercel functions in `api/oauth/{exchange,refresh,health}.ts` (issue #550) reusing the tested core — served same-origin via root `vercel.json` rewrites. Remaining: switch Vercel Root Directory → repo root, register OAuth App, set env (see DEPLOY.md) |
| Studio UI — OAuth authorise flow | **Done** | Issue #148 — `packages/studio/src/lib/githubOAuth.ts` (PKCE + sessionStorage token store), `lib/handleOAuthCallback.ts`, `hooks/useGitHubAuth.ts`; engine `verifyToken` consumed via `services.ts` `getGitHubOutputService()`; copyright-attestation gate per spec §12/Scenario E |
| Studio UI — "Submit PR" button | **Done** | Issue #148 — `components/GitHubSubmitPanel.tsx`; gates on `verifyToken`, calls `publishPR` on confirm via `services.ts` `getGitHubOutputService()`; full `PublishPRError` message matrix; lint-checklist PR-body composer (green/yellow/red) deferred to follow-up — ships editable default body stub |

### Option B — Org-mediated, abstracted

| Step | Status | Notes |
|---|---|---|
| Contract extension (`publishManagedPR`) | Not started | New method needed on `OutputService`; current contract only covers Option A |
| Backend proxy (Cloudflare Worker / Vercel) | Not started | Required before any code can be written; org token must live server-side |
| Attribution (Co-authored-by) commit format | Not started | |
| Studio UI — attribution form + submit | Not started | |

### Summary

```
Option C  [====================]  100%  engine + studio UI done; full end-to-end zip download wired (#32)
Option A  [===================-]   95%  engine + studio UI done (#148); backend co-located on Vercel (#550); only deploy + OAuth App registration remain (DEPLOY.md)
Option B  [--------------------]    0%  design done (github_flow.md); nothing built
```
