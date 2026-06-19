# spec.md amendment — Save & resume (v1.4.0 spec revision)

**Status:** PROPOSED 2026-06-18. **Not yet applied/signed off** — amends a v1.3.0 working-copy-spine invariant (§12), which per the revision policy (§18) requires a joint engine+content session. This PR is the proposal artifact; the spec text carries the change marked PROPOSED so reviewers see the exact diff under review. Merge is gated on sign-off.

**Provenance:** Design discussion 2026-06-18 (login / save & resume for keyboard authors). Motivation, options, and the storage/credential/deployment decisions are summarized in the PR body and refined below.

---

## Motivation

Authors want to leave the studio and pick up an in-progress keyboard later. Today the working copy lives only in browser memory and is lost on refresh — a real usability gap for a tool used across multiple sittings. The spec's existing notion of "resume" (§ "Defer answers… the studio remembers gaps and resumes"; § "the same studio session re-opens the same working copy") is **within-session only**; cross-session persistence is explicitly forbidden by the §12 invariant. Enabling save & resume therefore requires a spec change, not just implementation.

## Product decision (the shape we landed on)

**Guest is the floor, account is additive, desktop is a later distribution channel — not a different product.**

- **Guest mode** is the default and is fully featured for authoring and both delivery paths. No login is ever required to use the studio.
- The studio shows a **persistent, ambient affordance** — placement is product-visible (e.g. a header chip), not buried in settings, and not a modal-on-load — that offers "log in or create an account to save your progress." It serves double duty: upgrade path *and* honest durability warning.
- **Sign-in is an additive upgrade.** Signing in migrates the guest's local projects to the account and turns on cross-device sync; the local store stays as an offline cache. Signing out stops syncing but does not delete local data.
- **Multi-project from day one.** Snapshots are keyed by a stable `projectId`. Guest mode is "a list of projects in IndexedDB," not "the one working copy in localStorage." Cheap now; expensive to retrofit later.
- **Two identity providers — GitHub SSO preferred, email + password the fallback.** GitHub SSO is the preferred, one-click default (it reuses the OAuth backend the PR-delivery path already needs, with login-only scopes; the PR-delivery scope is requested incrementally only at delivery time). Email + password is the fallback that keeps "no GitHub account ever required" honest for users who want cross-device resume but don't want a GitHub account.
- **The snapshot format is plain JSON** with no browser-specific references (no Blob handles, no IndexedDB cursors, no `window.location`-derived IDs). The same format works against IndexedDB, a server datastore, and (post-v1) a host filesystem in a desktop build.

## Section-by-section changes

- **§12 (Output artifacts → "Working copy as the live edit target")** — the sentence "there is no intermediate persistence step between instantiation and output" is replaced with a **Save & resume** clause that permits a non-destructive **session snapshot**. The clause names the two persistence modes (Guest, Signed-in), the ambient sign-in affordance, the `projectId`-keyed multi-project shape, the plain-JSON portability rule, a named **rehydrate-equivalence check** (Layer A''-style, parallel to the Layer A' I-checks), and a **failure-modes paragraph** covering store-unreachable, corrupt-snapshot, multi-tab race, and base-drift. The core invariant is preserved: the working copy remains the single live edit target; a restored snapshot is identical to the one serialized; the snapshot is never a delivery path; **output (step 15) remains the only route to a `.zip` or PR.**
- **§16 (Out of scope → "Hosting and deployment")** — the bare "ships a static SPA" line gains a v1.4.0 exception that **enumerates** the two responsibilities the backing service is permitted to fulfil (OAuth token exchange; account-keyed save & resume) and **enumerates** what it stores (session record + per-account snapshot blobs). General-purpose hosting, multi-user collaboration, team workspaces, sharing, and history stay explicitly out of scope. The clause also carries explicit **data-protection (GDPR)** requirements the service must be designed to support — consent-based opt-in account creation, data minimization, export + erasure, a snapshot retention limit, strictly-necessary cookies only, and a processor DPA — with guest / browser-local as the privacy-by-default baseline. A desktop (Electron) distribution against the host filesystem is named as a post-v1 candidate covered by the same exception, so the door is open without committing the project to it.

## What does NOT change

- The 15-step pipeline, the two authoring tracks, and the re-projected-layers IR model (§12) are untouched.
- The two delivery paths — ZIP download (accountless) and GitHub OAuth fork+PR (§12) — are unchanged. The ZIP path stays fully accountless and offline-capable.
- No `Pattern`/`Criterion` schema (§5) change.
- Out-of-scope status of general hosting, MML authoring, touch-first, CJK/Ethiopic, etc. (§16) is unchanged.

## Implementation outline (informative — not part of the spec text)

Phased, additive, low-risk. Each phase ships a usable tool.

1. **Guest mode: browser-local autosave/restore.** Serialize the working copy to a JSON snapshot keyed by `projectId`; rehydrate on load. No login, no backend. Exercises the serialize↔rehydrate core (the inverse of `toZip`, which does not yet exist) needed by every later phase. The named rehydrate-equivalence check (Layer A''-style) is part of this phase's exit criteria.
2. **Signed-in mode: optional resume.** Lightweight login backed by a minimal Vercel serverless function + managed datastore. Two identity providers — GitHub SSO preferred, email + password the fallback:
   - **GitHub SSO** — reuses the OAuth backend the PR-delivery path already needs. Login-only scopes (`read:user`, `user:email`) are requested at sign-in; the PR-delivery scope (`public_repo`) is requested **incrementally**, only when the author actually attempts a PR delivery. This keeps login cheap (no scary scope prompt on day one) and keeps the delivery grant short-lived and re-prompted.
   - **Email + password** — for authors who do not have or do not want a GitHub account. Required so the "no GitHub account is ever required" floor holds even for users who want cross-device resume.
   Accounts started with one provider may be linked to the other (the spec doesn't mandate the order); the linking is an implementation concern, not a spec concern.
3. **Post-v1: host-filesystem distribution (Electron).** Same snapshot format, host filesystem instead of a server. Out of scope for v1; the spec text leaves the door open.

### Defaults (per §3c "no default is a defect")

- **Autosave cadence:** every keystroke debounced 1 s, plus on route change. (Tuned during Phase 1; documented as a default, not a tuning knob exposed to users.)
- **Retention (local):** snapshots kept indefinitely until the user explicitly deletes a project or the browser evicts the IndexedDB origin. Eviction is the durability gap the ambient sign-in affordance surfaces.
- **Retention (signed-in):** same as local; no automatic server-side TTL in v1.
- **Multi-tab policy:** last-write-wins on `updatedAt`; the older tab surfaces a visible "this project was edited in another tab" warning on next mutation.

### Settled design inputs (for the implementation epic, not the spec)

- **Deployment:** Vercel — SPA static + `oauth-backend` as serverless functions co-located at `/api` (same-origin → session cookie can be `SameSite=Lax`, simpler CSRF).
- **Token landscape (three distinct credentials, not to be conflated — even when two of them originate from the same GitHub OAuth grant):**
  - User GitHub OAuth **delivery** token — `public_repo` scope, in-memory in the browser, requested incrementally at PR-delivery time, short-lived.
  - Keyboard-studio **session/login** token — **httpOnly cookie**, long-lived, issued by the backend after either GitHub SSO (login-only scopes) or email+password sign-in. CSRF protection is a mandatory acceptance criterion of the cookie work — same-origin Vercel deployment keeps it small, not a separate issue.
  - Service **read** credential for base-keyboard fetch/mirror — CI/Vercel env, never in the browser.
  When GitHub SSO is the login provider, the OAuth callback produces the session cookie *only*; the delivery token is a separate grant requested later. The two scopes must never be merged into one fat token.
- **Snapshot shape (sketch):** `{ projectId: string, projectName: string, schemaVersion: number, updatedAt: string, workingCopy: SerializedWorkingCopy }`. The `workingCopy` field is the only one that evolves with the IR and the assignment-map; `schemaVersion` gates migration on rehydrate.

## Review

**PENDING.** Joint engine+content session not yet held. Sign-off and per-specialist findings to be logged in [docs/spec-signoff.md](spec-signoff.md) under Post-Sign-Off Amendments once the cycle completes.
