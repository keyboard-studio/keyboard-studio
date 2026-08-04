# Switch-base-keyboards popup — empirical behavior log

> **Investigation log, 2026-07-23.** Produced by the exploratory Playwright
> matrix in
> [packages/studio/e2e/switch-base-exploration.spec.ts](../../packages/studio/e2e/switch-base-exploration.spec.ts)
> (31 scenarios, run against the local dev server, corpus = the sibling
> `../keyboards` checkout). Raw per-scenario JSON (dialogs, console traffic,
> state dumps) lives in the session scratchpad
> (`/private/tmp/claude-501/-Users-grace-github-sil-keyboards/5f050279-211d-4d0e-83d1-b72d58a70f25/scratchpad/switch-base-results/*.json`
> — temp storage; re-runnable any time via the spec above); this file is the
> human digest.
>
> The "popup" is the native `window.confirm` in
> [src/lib/confirmRebase.ts](../../packages/studio/src/lib/confirmRebase.ts):
> *"Switching base keyboards will discard your current edits (carve deletions
> and survey answers). Continue?"* — fired by `confirmRebaseIfEdited()` when
> `instantiateFromBase` would overwrite an edited working copy.

> **Status update, 2026-07-27.** F1 (silent-stayed-on-old-base after confirming
> a different base) and F2 (spurious popup on plain refresh) are fixed — see
> the id-aware `instantiatedForBaseIdRef` gate and synchronous `confirmRebaseTo`
> guard landed in this PR. F3–F7 below remain open.

## Fixture

- Initial base: `bj_cree_woods` (Western Cree TH-Woods; has raw `rule#93` for the carve level)
- Switch-to base: `basic_kbdfr` (French Basic)
- Identity: free-text language "Test", script "other" → Track 1 (adapt)

## Completion levels

| Level | State when probed |
|---|---|
| L1 | identity-lite finished; at base picker; nothing previewed |
| L2 | base previewed (compile settled), **not** confirmed |
| L3 | base confirmed ("Choose this keyboard"); at Authoring Track step; working copy instantiated, draft `ks.draft.bj_cree_woods.v1` created |
| L4 | track chosen (adapt); at prefill confirmation |
| L5 | prefill confirmed; at Phase B intro |
| L6 | Phase B done (added `᙮`); at carve gallery |
| L7 | carved `rule#93` (deletedNodeIds = 1); still at carve gallery |

---

## Probe 1 — page refresh

| Level | Popup on reload? | Where you land | Working copy after |
|---|---|---|---|
| L1 | no | **identity Q1 — all progress lost** | not instantiated (no draft exists yet) |
| L2 | no | **identity Q1 — all progress lost** (preview isn't saved) | not instantiated |
| L3 | **YES — the switch-base confirm fires on reload** | Authoring Track (same step) | kept (`bj_cree_woods`) either way |
| L4 | **YES** | **Track step — one step earlier than where you were** (was at prefill) | kept |
| L5 | **YES** | **Track step — two steps earlier** (was at Phase B intro) | kept |
| L6 | no | carve gallery (correct step) | kept |
| L7 | no | carve gallery, **but the carve deletion is gone** (deletedNodeIds 1 → 0, silently) | base kept, carve edit lost |

**Cancel vs OK on the reload popup (L3–L5):** visually identical — both land
on the Track step with the same base. The difference is internal only:
OK re-runs `instantiateFromBase`, silently resetting `phaseResults`
(survey answers recorded on the working copy); Cancel keeps them. The author
cannot tell the two outcomes apart from the UI, and never asked to switch a
base in the first place.

**Interpretation.** On reload, `main.tsx` rehydrates the durable draft
(stores restored pre-mount), then StudioShell's single-instantiation effect
re-fires `doCommit` for the restored `baseConfirmed` base. That re-commit
runs `confirmRebaseIfEdited()` against the *just-rehydrated* working copy —
so the "Switching base keyboards…" question appears out of nowhere on a
plain F5, at levels where the author never touched the base picker. This is
the single most user-visible "not smooth" symptom.

---

## Probe 2 — browser back button

Same result at **every** level L1–L7:

- The SPA pushes no history entries per survey step, so browser-back leaves
  the app entirely (previous document / blank tab).
- No `beforeunload` guard fires — no dialog, no warning, even with unsaved
  carve edits (L7).
- In-memory progress is gone; at L3+ the durable draft in localStorage
  survives, so re-entering the URL resumes per Probe 1's refresh rows
  (including the reload popup at L3–L5).

The in-app back affordances (`survey-back` on question steps, per-editor
"← Back" buttons) do walk backwards correctly — e.g. from carve, 4 ×
editor-back + 1 × survey-back reaches the base picker; each hop was recorded
in the switch scenarios below.

---

## Probe 3 — switching the base keyboard in-session (back to picker → pick `basic_kbdfr` → "Choose this keyboard")

| Level | Popup? | Cancel outcome | OK outcome |
|---|---|---|---|
| L2 (not yet confirmed) | no (correct — nothing to discard) | n/a | switches cleanly: IR + draft become `basic_kbdfr` ✔ |
| L3 | **no popup — ever** | n/a | **silent desync** (see below) |
| L4 | **no popup — ever** | n/a | **silent desync** |
| L5 | **no popup — ever** | n/a | **silent desync** |
| L6 | **no popup — ever** | n/a | **silent desync** |
| L7 | n/a — **cannot switch at all**: after a carve deletion, previewing any base leaves "Choose this keyboard" permanently disabled ("Preparing preview…" → settles disabled; 120 s observed, both variants) | — | — |

**The silent desync (L3–L6, every run):** confirming the new base advances
the wizard to the Track step and the whole UI (heading, right-pane preview)
shows **French Basic** — but the working-copy IR is still
**`bj_cree_woods`**, and the draft keeps autosaving under
`ks.draft.bj_cree_woods.v1`. No dialog, no console warning. Cancel-vs-OK is
untestable in-session because the popup never gets a chance to fire.

**Mechanism.** `choose_base` is deliberately absent from
`STEPS_WITH_APPLY_COMPLETION`
([steps/advance.ts](../../packages/studio/src/steps/advance.ts)) — its
instantiation side effect runs only through StudioShell's
single-instantiation effect, which is gated by `instantiatedRef` to **once
per mount**
([StudioShell.tsx](../../packages/studio/src/StudioShell.tsx), `doCommit`).
After the first confirm, every later confirm flips `baseConfirmed` and
advances the wizard, but `doCommit` early-returns: no re-instantiation, no
rebase guard, no popup. The only way the popup can fire at all is after a
**remount** (refresh) — where it fires *spuriously* (Probe 1).

So the two symptoms are one bug with two faces:

1. **In-session:** base switch is applied to the UI but not to the working
   copy (guard never consulted → popup never shown → desync).
2. **On refresh:** the once-per-mount commit re-runs against the rehydrated
   draft → popup shown when the author did nothing.

**L7 lockout.** With one carved node, the preview pipeline for any *other*
base never reaches `previewStatus === "ready"` (the working-copy transform
carries a `deletedNodeIds` entry that doesn't exist in the new base's IR),
so the commit button — correctly gated on "ready" — stays disabled forever.
After carving, the author cannot change base at all without Start over.

---

## Findings ranked

1. **F1 — In-session base switch silently desyncs UI vs working copy (L3–L6).**
   The confirm popup never fires in-session; the wizard shows the new base
   while IR/draft/emit stay on the old one. Data-integrity bug, not polish.
2. **F2 — The popup fires on plain page refresh (L3–L5)** with switch-base
   wording, when no switch was requested. OK silently discards recorded
   survey answers; Cancel is indistinguishable in the UI. This is the
   "popup is not smooth" symptom as experienced.
3. **F3 — Refresh at the carve step silently drops carve deletions (L7)**
   (deletedNodeIds 1 → 0 across reload, no dialog) even though the durable
   draft schema persists `deletedNodeIds`.
4. **F4 — After any carve deletion, re-choosing a base is impossible (L7)** —
   "Choose this keyboard" permanently disabled for every previewed base.
5. **F5 — Refresh resumes at the wrong step (L4/L5)** — lands on Track
   instead of prefill / Phase B intro (traversal lags the working copy).
6. **F6 — Pre-instantiation progress (L1/L2) is lost entirely on refresh** —
   autosave only installs at first instantiation, so identity answers +
   an un-confirmed base preview don't survive.
7. **F7 — Browser back exits the app with no beforeunload guard** at every
   level; with unsaved-in-draft state (or pre-L3, any state) that's silent
   loss.

## Suggested direction (not implemented)

The root fix for F1/F2 is to make base re-confirmation a real, guarded
re-instantiation path instead of a once-per-mount side effect: on confirm,
if `isInstantiated()` and the confirmed base differs from
`workingCopy.baseKeyboard.id` (or same-id with edits), run the rebase guard
*before* advancing the wizard, and re-instantiate on OK / stay on the picker
on Cancel. On reload, skip `doCommit` entirely when the rehydrated working
copy is already instantiated for the same base (no re-commit → no spurious
popup). F4 needs the preview pipeline to drop stale carve overlays when
previewing a base other than the instantiated one.
