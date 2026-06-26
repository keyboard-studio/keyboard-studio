# Proposal: Unified sign-up/sign-in, profile page, welcome gate, and resumable edits

> Status: **proposed** (plan for review — no code yet). Companion to [docs/github-integration.md](github-integration.md).

## Context

The studio's identity flow is disjointed, and in-progress work is lost on reload. Problems to fix:

1. **No "preferred path."** On the Output screen, `SignUpPanel` shows GitHub and Google as equal peers. GitHub should be the prominent, recommended path; Google a smaller fallback.
2. **The "sign up twice" disconnect.** GitHub (a token) and Google (identity claims) live independently in `sessionStorage` with no notion they belong to one user. After signing up with GitHub, the panel still offers "Sign up with Google" — implying a *second* account, when the intent is **one Keyboard Studio account** that can *link* both providers.
3. **No profile page, no welcome landing.** No top-right account access; the app drops users straight into the survey.
4. **Edits don't survive.** The working copy is an in-memory Zustand store ([packages/studio/src/stores/workingCopyStore.ts](../packages/studio/src/stores/workingCopyStore.ts)) — a reload wipes it.

### Decisions confirmed

- **Account model:** client-side unified session, **no backend account table**. The union of `{ github token, google identity }` in `sessionStorage` is presented as one account; linking = attaching the other provider to the same session. (Accepted limitation: per-browser, not synced across devices.)
- **Auth/identity storage:** unchanged — stays in `sessionStorage` (the GitHub token is deliberately *never* in long-lived storage; see [packages/studio/src/lib/githubOAuth.ts](../packages/studio/src/lib/githubOAuth.ts)).
- **Welcome page = first-ever-visit only.** Show it only when the user has never visited before (a durable `localStorage` flag). Returning users — even with unsaved edits — skip welcome and land back on the edit phase they were on.
- **Edits must survive a tab close.** A durable `localStorage` working-copy draft, auto-saved and rehydrated on boot, so "pick up where you left off" actually works.

## Architecture today (key files)

- [packages/studio/src/components/SignUpPanel.tsx](../packages/studio/src/components/SignUpPanel.tsx) — the only sign-up UI; rendered by [OutputScreen.tsx](../packages/studio/src/components/OutputScreen.tsx). Inline `GitHubMark`/`GoogleMark` SVGs; 5 render branches.
- [packages/studio/src/hooks/useGitHubAuth.ts](../packages/studio/src/hooks/useGitHubAuth.ts) / [useGoogleAuth.ts](../packages/studio/src/hooks/useGoogleAuth.ts) — per-provider hooks (`status`, `connect`, `disconnect`, identity/login, `error`); rehydrate from `sessionStorage` at mount.
- [packages/studio/src/lib/identity.ts](../packages/studio/src/lib/identity.ts) — `IdentitySession` union.
- [packages/studio/src/StudioShell.tsx](../packages/studio/src/StudioShell.tsx) — hash router (`useRoute`), `NavBar` (left tabs only, no account control), route switch; default/invalid hash → `survey`.
- [packages/studio/src/lib/navigate.ts](../packages/studio/src/lib/navigate.ts) — `RouteId` union + `navigateTo()`.
- [packages/studio/src/main.tsx](../packages/studio/src/main.tsx) + [handleOAuthCallback.ts](../packages/studio/src/lib/handleOAuthCallback.ts) — boot runs the OAuth callback first; on success redirects to `/` (no hash) with the session already in `sessionStorage`, then mounts.
- **Reference for serialization (q7 branch, not on `main`):** `persistWorkingCopy.ts` on `km/github-integration-q7` already worked out VirtualFS→Base64, `Set`→array, and the "re-derive computed fields (`session`) rather than store them" policy. **Reuse that design**, adapted to the current store shape (no `WorkingCopyData`/`removalCapabilities` on this branch). Coordinate to avoid duplicate divergent copies when those branches merge.

## Implementation

### A. Identity / account UX

**1. `components/ProviderMarks.tsx` (new)** — extract the inline `GitHubMark`/`GoogleMark` SVGs so `SignUpPanel`, the header, and profile reuse them (CSP-safe inline SVG, as today).

**2. `hooks/useIdentitySession.ts` (new)** — compose `useGitHubAuth` + `useGoogleAuth` into one in-memory "account" view (**stores nothing new**): `isSignedIn`, `displayName`, `github { linked, login, status, error, connect, disconnect }`, `google { linked, identity, error, connect, disconnect }`, `isVerifying`. Single source of truth for "signed in, as whom."

**3. Restyle `SignUpPanel.tsx`** (drive all branches off `useIdentitySession`):
- *Signed out:* GitHub = primary CTA — larger button + small **"Recommended"** caption beneath. Below: muted "Don't have GitHub? Sign up with Google" + a smaller/secondary Google button. Keep error displays.
- *Signed in (GitHub):* "You're signed in" framing; the Google action reads **"Link Google account"** (not "Sign up with Google").
- *Signed in (Google):* the GitHub action reads **"Link GitHub"** (still encouraged — Option A fork+PR needs it).
- Update `SignUpPanel.test.tsx` for the new copy.

**4. Header account control + routes** — `navigate.ts` adds `'welcome'` + `'profile'` to `RouteId`. `StudioShell.tsx`: `NavBar` gets a right-aligned account control (consumes `useIdentitySession`) — signed out → "Sign in"; signed in → name/avatar button → `#profile`. Add `case "welcome"`/`case "profile"` to the switch and to `VALID_ROUTES`; keep them out of the main tab list.

**5. `components/ProfileScreen.tsx` (new)** — display name; **GitHub** row (connected → `login` + "Sign out"; else **"Link GitHub"**); **Google** row (connected → name+email + "Sign out"; else **"Link Google account"**); note that one account links both, GitHub preferred.

**6. `components/WelcomeScreen.tsx` (new)** — "Welcome to Keyboard Studio"; **"Sign in to pick up where you left off"** → `github.connect()`; **"I'm new"** → `navigateTo('survey')`. Style after [GalleryIntroSplash.tsx](../packages/studio/src/components/GalleryIntroSplash.tsx).

### B. Durable resume

**7. `lib/persistWorkingCopy.ts` (new, adapted from q7 design)** — `localStorage` key `ks.working-copy.draft`:
- `saveWorkingCopyDraft(state)` — serialize the store's *data* fields: `baseVfs`→Base64 entries, `deletedNodeIds`/`deletedItemIds` Sets→arrays, drop derived `session` (re-derived via `mergePhaseResults` on load). `try/catch` quota guard (skip silently, as q7 does).
- `loadWorkingCopyDraft()` — parse + deserialize into a store-shaped object (Sets rebuilt, VFS via `createVirtualFS`, `session` re-derived); returns `null` if absent/corrupt.
- `clearWorkingCopyDraft()`.
- Sized for localStorage (~5MB) — keyboard sources are small; note IndexedDB as the fallback if a base ever exceeds quota.

**8. Auto-save + boot rehydrate** — subscribe to `useWorkingCopyStore` and debounce-write the draft on change (reuse the [useDebounce.ts](../packages/studio/src/hooks/useDebounce.ts) idiom; do **not** add a second 300 ms validator timer). Also persist a small UI-state record (`localStorage` `ks.ui-state`: top-level route + the SurveyView `stage`) so resume returns to the right phase — `SurveyView` currently hard-starts `stage` at `"identity"`; seed it from the persisted value when a draft is present ("preserve as much as possible" — working copy + route + stage; deeper sub-state is best-effort).

**9. First-visit + resume gate** — durable `localStorage` flag `ks.visited`. Boot landing logic (after OAuth callback, in `StudioShell`/`useRoute`, synchronous reads):
- Draft present → rehydrate store + route to saved phase (skip welcome).
- Else `!ks.visited` (true first visit) → `welcome`.
- Else → `survey` (fresh).
- Set `ks.visited = true` on leaving welcome / entering the app. Clearing the session and the draft (full sign-out / new keyboard `reset()`) should also clear `ks.working-copy.draft` + `ks.ui-state` so a stale draft can't resurrect.

## Files

**New:** `components/ProviderMarks.tsx`, `hooks/useIdentitySession.ts`, `components/WelcomeScreen.tsx`, `components/ProfileScreen.tsx`, `lib/persistWorkingCopy.ts` (+ co-located `.test.tsx`/`.test.ts` per existing conventions).

**Edited:** `components/SignUpPanel.tsx` (+ test), `StudioShell.tsx` (NavBar account control, routes, welcome/resume gate, SurveyView stage seed), `lib/navigate.ts`, and a small auto-save wiring at boot (in `StudioShell` or `main.tsx`).

## Coordination note

Durable persistence overlaps the `km/spec-save-resume` and `km/github-integration-q7` efforts. This proposal builds against `main`'s store and borrows q7's serialization *design* (not its code, which targets a divergent store). Flag for the team so the eventual merge consolidates to one `persistWorkingCopy.ts` rather than two divergent copies.

## Verification (once implemented)

1. `pnpm --filter @keyboard-studio/studio test` — SignUpPanel updates + new component/hook/persistence tests.
2. `pnpm typecheck` and `pnpm lint`.
3. Manual via `pnpm dev` (and/or Playwright MCP):
   - Clear all storage → **Welcome** appears; "I'm new" → survey; reload → no Welcome (visited flag set).
   - Make edits, **close the tab, reopen** → land back on the same edit phase with edits intact (draft resume); no Welcome.
   - Output screen signed-out → GitHub prominent + "Recommended"; Google smaller with "Don't have GitHub?" link.
   - After GitHub sign-in → no "Sign up with Google"; instead "Link Google account"; top-right shows account name.
   - Top-right → Profile shows GitHub connected + "Link Google account".
   - OAuth redirect mid-edit → returns with edits preserved (draft survives the redirect too).
