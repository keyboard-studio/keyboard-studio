# Phase 0 Research: Mobile/touch layout derivation

All Technical-Context unknowns and the spec's **Open Questions** are resolved below.
Each decision cites the code it is grounded in.

---

## R1 — The engine already ships a physical→touch projection; scope shrinks accordingly

**Decision**: Treat
[`scaffoldTouchLayout`](../../packages/engine/src/scaffolder/scaffoldTouchLayout.ts) as the
existing US2 reseed engine. Do **not** reimplement Keyman Developer's Delphi
`physical→OSK→touch` converter, and do **not** port its desktop-shaped full grid.

**Rationale**: `scaffoldTouchLayout(ir)` (scaffoldTouchLayout.ts:760) already:
- emits a **compact `phone` platform** — 3 layers (default + shift + numeric, ≤10 keys/row),
  built by `buildCanonicalPhoneLayers` (:352) — not the 5-row PC grid the spec's "Reference
  implementation" section describes;
- projects desktop rules → touch layers via `buildKeyMap`/`classifyModifiers` (:158/:109):
  no-mods → `default`, SHIFT → `shift`, RALT → `altgr`; CAPS stripped;
- augments deadkey longpress `sk[]` from `recognizedPatterns` (`strategyId` `S-02`) via
  `buildDeadkeySuccessors` (:196).

The spec's "Reference implementation" section describes *Keyman Developer's* output (desktop
grid, 22 modifier layers, tablet/desktop only). Our engine's projection is **already the
simplified equivalent**. Therefore the simplification rules in the spec are largely
*already satisfied by the compact template*: ~10 keys/row (rule 1 ✔), no PC function row
beyond space/bksp/enter (rule 2 ✔), collapsed to default+shift+numeric (rule 3 ✔),
touch-proportioned widths (rule 4 ✔), numeric on its own layer (rule 5 ✔).

**Consequence — the true remaining gaps** (this is the whole feature):
1. **Desktop-modification replay** onto the *import-and-adapt* (Case B) path (R3).
2. **Wiring the seed-source fork** so US1/US2 is a real choice (R4).
3. A **coverage guard** so simplification/replay never orphans an inventory char (R5).
4. **Removing the stale QWERTY seed** behavior + comment (R2).

**Alternatives considered**: (a) *Port Developer's converter* — rejected: explicitly out of
scope per spec Out-of-Scope + user direction 2026-07-13; would add a desktop-shaped grid we
then have to simplify back down. (b) *Build a fresh projection engine* — rejected: duplicates
`scaffoldTouchLayout`, violates the "reuse the engine touch pipeline" assumption (spec
Assumptions).

---

## R2 — What the "fixed QWERTY seed" actually is (FR-001)

**Decision**: FR-001's "fixed minimal QWERTY seed" refers to **two concrete behaviors**, both
removed/corrected:
- the stale header comment in
  [TouchGallery.tsx:19-30](../../packages/studio/src/editors/assignLoop/TouchGallery.tsx)
  ("seeded from a fixed minimal QWERTY layout … Desktop edits are NOT transferred to mobile"),
  which no longer matches the code (the code already calls `scaffoldTouchLayout(baseIr)`); and
- the `buildMinimalPhoneTouchLayout()` fallback (scaffoldTouchLayout.ts:725, empty keyMap →
  US keycaps) used for VFS injection / preview when there are no real edits.

**Rationale**: The header comment is documentation drift that directly contradicts the
feature's premise; leaving it is a defect by the project's own "stale = defect" doctrine.
The real seed is already IR-derived; the work is to make that derivation *carry the desktop
modifications* and to stop the empty-keyMap fallback from surfacing as the author's seed.

**Alternatives considered**: Interpreting FR-001 literally as "there is a hardcoded QWERTY
constant that is the sole seed" — rejected after reading the code: `detectedChars` and the
Case A build already derive from `baseIr`. Recorded so `/speckit-tasks` scopes FR-001 as a
correction + fallback-guard, not a from-scratch seed rewrite.

---

## R3 — Desktop-modification replay: carve removals + letter placements (FR-002/004/005)

**Decision**: Add a pure engine function
`applyDesktopModifications(seed: TouchLayoutIR, mods): { layout, warnings }` that replays the
locked desktop work onto a touch seed, and call it in **both** paths inside
[buildTouchLayoutJson](../../packages/studio/src/lib/buildTouchLayoutJson.ts). Inputs `mods`:
- **carve removals** — the set of characters removed on desktop (Phase D), derived from the
  post-lockDesktop `baseIr` rules vs the base's original rules (or the working copy's
  `deletedNodeIds`/`deletedItemIds` overlay);
- **letter placements** — desktop Phase C individual placements, already surfaced in
  `TouchGallery.desktopAssignments` (physical + individual) and by
  [touchSuggest](../../packages/studio/src/editors/touchSuggest/touchSuggest.ts) (which emits
  `physical-suggested` touch keys from physical decisions).

**Rationale**: The **Case A** path (`scaffoldTouchLayout(baseIr)`) already reflects desktop
work implicitly — `buildKeyMap` reads current `ir.groups` rules, and `baseIr` is the
*post-lockDesktop* snapshot (lock happens at `mechanisms`, after `carve`), so carved chars are
already absent and placed letters already present. **Case B is the real gap**:
`applyTouchAssignmentsToRawJson` preserves the shipped base layout verbatim and applies only
explicit Phase E touch assignments — desktop carve removals and letter placements are *not*
propagated. `applyDesktopModifications` closes that: it removes carved chars from the shipped
layout and injects/relocates placed letters, tagging touched keys `physical-suggested`
provenance so re-propagation never clobbers a later `hand-set` author edit (spec-014 axis,
`TouchKeyProvenance`).

**Alternatives considered**: (a) *Only fix Case A* — rejected: US1 (default, P1) is exactly
the Case B "base ships a touch layout" scenario, so the default path would silently drop the
desktop work. (b) *Do the replay in the studio store* — rejected: violates the pure-engine
boundary and would duplicate logic between preview and output; `buildTouchLayoutJson` is the
single seed→apply→emit choke point both call.

---

## R4 — Wiring the seed-source fork (FR-006)

**Decision**: In [advance.ts](../../packages/studio/src/steps/advance.ts), route
`mechanisms → touch_seed_source → touch` instead of the current `mechanisms → touch`
(which calls `nextSpineStepAfter("mechanisms")` and skips the `spine:false`
`touch_seed_source` step). The `touch_seed_source` step renders a **chooser panel** (new
`editors/touchSeedSource/`) that shows a preview of the base's touch layout (if any) and lets
the author pick **Import & adapt** (default, when a usable base layout exists) or **Reseed
from desktop**. The choice sets a session flag the touch build reads to select Case B-with-
replay vs Case A projection.

**Rationale**: The manifest already declares `touch_seed_source` as `spine:false` with
`joinTarget:"touch"` (manifest.ts:115-119; registerEditorSteps.ts:152-159) — it is wired
structurally but dead because `advance` never routes into it. The minimal, boundary-clean
change is one branch in the pure `advance` policy (`case "mechanisms"` returns
`{ next: "touch_seed_source" }`) plus a `case "touch_seed_source"` returning
`{ next: "touch" }` (its `joinTarget`). No manifest reordering needed.

**Open-Question resolution — "what makes a base touch layout *usable*"**: **Do not
auto-classify.** Show the base layout in a preview and let the author judge, defaulting the
selection to **Import & adapt** whenever a `.keyman-touch-layout` is present
(`resolveBaseTouchJson(baseVfs) !== undefined`) and to **Reseed** when absent. This matches
the spec's leaning (Open Questions) and Keyman Developer's own experience that "usable" is
hard to auto-detect. A lightweight *advisory* signal (e.g. "this layout has no phone
platform") may annotate the preview but never forces the choice.

**Alternatives considered**: (a) *Heuristic auto-detect of "usable"* — rejected as the
gating mechanism (kept only as an advisory hint); brittle and contradicts the spec's leaning.
(b) *Reorder the manifest to make `touch_seed_source` spine:true* — rejected: it is correctly
a side-trail; only the advance policy needs the branch.

---

## R5 — Coverage guard so simplification never orphans a character (FR-008)

**Decision**: Add a pure engine helper
`touchCoverage(layout, inventory): { uncovered: string[] }` and surface it as **Layer C touch
check 18.6 (coverage)** through the existing
[useTouchLint](../../packages/studio/src/hooks/useTouchLint.ts) path. Any inventory character
with **zero** reachable touch mechanism (not on any layer's key `text`/`output`, nor in any
`sk`/`flick`/`multitap` of a reachable key) is reported as an error; the derivation may not
finalize a layout that orphans a character.

**Rationale**: FR-008 is the one hard constraint on the simplification/replay. The touch
lint surface (checks 18.1–18.5) already runs in the gallery within the single 300 ms debounce
(Constitution IV); adding 18.6 there means **no new debounce timer** and one obvious place for
the author to see coverage. `TouchGallery` already computes a `detectedChars` set by walking
`layout.platforms[].layers[].rows[].keys[]` incl. `sk`/`multitap`/`flick` — the same traversal
`touchCoverage` needs, so the logic is extracted to the engine and shared.

**Alternatives considered**: (a) *Throw on uncoverable char in the engine apply* — rejected:
too blunt; the author needs to see *which* char and fix it in the gallery, not hit an
exception. (b) *A separate coverage panel* — rejected: duplicates the lint surface and risks a
second debounce path.

---

## R6 — Provenance tagging for derived vs authored keys

**Decision**: Keys created by projection/replay are tagged `provenance: "physical-suggested"`
(desktop-derived) or `"base-derived"` (carried from the base layout); author edits in the
touch gallery remain/become `"hand-set"`. `scaffoldTouchLayout`'s `buildLetterKey`
(scaffoldTouchLayout.ts:289) currently omits provenance — the derivation work sets it.

**Rationale**: `TouchKeyProvenance` (`keyboard-ir.ts:83`) is the existing no-clobber axis
(spec-014): re-propagation may overwrite `base-derived`/`physical-suggested` keys but never a
`hand-set` one. Tagging the derived seed correctly means a later re-run of derivation (e.g.
the author goes back and changes a desktop placement) refreshes the seed without wiping the
author's touch-gallery edits — the exact guarantee `promoteOnManualEdit`
([touchBehavior.ts](../../packages/studio/src/editors/assignLoop/touchBehavior.ts)) already
relies on for the host key.

**Alternatives considered**: No tagging (leave provenance absent → treated as `hand-set`) —
rejected: would make re-derivation either clobber author edits or refuse to refresh; the
provenance axis exists precisely for this.

---

## R7 — Phone vs tablet platform scope

**Decision**: The derivation targets the **phone** platform (what `scaffoldTouchLayout` and
`applyTouchAssignments` operate on today). Tablet is **not** in scope for this feature beyond
whatever the base layout already ships (Case B preserves shipped tablet verbatim). Record as a
known limitation.

**Rationale**: `scaffoldTouchLayout` Case A emits phone only (recon §3);
`applyTouchAssignments` mutates only the phone platform's default layer (applyTouchAssignments
.ts:56-77). The spec's simplification rule 1 asks for a **phone** platform (the thing missing
from Developer's tablet/desktop-only output) — the engine already produces exactly that.
Generating a distinct tablet grid is additive polish, not required by any acceptance scenario
(SC-001..004 speak to phone coverage/compile). Keeping tablet out avoids scope creep on "the
largest single MVP item."

**Alternatives considered**: Emit phone + tablet in the reseed — deferred: no acceptance
criterion requires it; can be a follow-up once the phone path is proven.

---

## R8 — Testing strategy

**Decision**:
- **Engine unit (vitest)** for the two new pure functions — `applyDesktopModifications`
  (carve removal drops the char from every platform's layers; letter placement appears;
  provenance tagged) and `touchCoverage` (reports exactly the orphaned inventory chars).
- **Engine unit** extending the existing `scaffoldTouchLayout`/`applyTouchAssignments` suites
  to assert the desktop-modification replay in Case A and Case B.
- **Studio unit** for the pure `advance` branch (`mechanisms → touch_seed_source → touch`).
- **Playwright E2E** — one walk per user story: US1 (base *with* touch layout → carve N,
  place M → assert emitted `.keyman-touch-layout` contains the M placements and none of the N
  removals, and is not the minimal QWERTY fallback); US2 (base *without* touch layout →
  choose reseed → assert simplified phone projection contains placed chars). Both assert the
  emitted file **compiles** (SC-004) via the existing artifact/compile path.

**Rationale**: Mirrors the repo's existing split — pure logic in vitest, flow in Playwright
(`copy-edit.spec.ts` is the model). The compile assertion reuses `useKeyboardArtifact` /
kmcmplib already exercised by the touch preview, so SC-004 needs no new harness.

**Alternatives considered**: E2E-only — rejected: the coverage guard and replay are pure and
cheapest to pin at the unit level; E2E is reserved for the two end-to-end story walks.
