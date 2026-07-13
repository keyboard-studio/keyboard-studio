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
1. **Desktop-modification replay onto both paths** (R3). Case B preserves the shipped
   layout verbatim and drops the desktop work; Case A projects from the **pristine
   instantiation-time `baseIr`**, which never receives carve removals or Phase C
   placements either — the earlier "Case A is implicitly covered" reading was wrong
   (see R3, corrected).
2. **Wiring the seed-source fork** so US1/US2 is a real choice (R4), with the fork
   memory / re-entry / draft-staleness rules in R12.
3. A **coverage guard** so simplification/replay never orphans an inventory char (R5 —
   extending the *existing* 18.6 check, not adding a duplicate).
4. **Correcting the stale QWERTY-seed comment** (R2) and the emission policy so the
   derived seed reaches preview/output even with zero Phase E edits (R11).

**Alternatives considered**: (a) *Port Developer's converter* — rejected: explicitly out of
scope per spec Out-of-Scope + user direction 2026-07-13; would add a desktop-shaped grid we
then have to simplify back down. (b) *Build a fresh projection engine* — rejected: duplicates
`scaffoldTouchLayout`, violates the "reuse the engine touch pipeline" assumption (spec
Assumptions).

---

## R2 — What the "fixed QWERTY seed" actually is (FR-001)

**Decision**: FR-001's "fixed minimal QWERTY seed" refers to **two concrete behaviors**:
- the stale header comment in
  [TouchGallery.tsx](../../packages/studio/src/editors/assignLoop/TouchGallery.tsx)
  ("seeded from a fixed minimal QWERTY layout … Desktop edits are NOT transferred to mobile").
  The QWERTY half is documentation drift (the code already derives Case A seeds via
  `scaffoldTouchLayout` and preserves shipped layouts verbatim in Case B); the
  desktop-edits half is **accurate** — both paths read the pristine instantiation-time base
  (see R3) — and is fixed by the replay work, after which the comment is rewritten; and
- the **emission policy**: when the author makes no real Phase E edit, `TouchGallery` /
  `StudioShell` emit `null` and the VFS/output keep whatever the base shipped, so desktop
  work never reaches touch without an explicit touch edit. Fixed by R11.

**Correction to the earlier draft of this decision**: `buildMinimalPhoneTouchLayout()`
(scaffoldTouchLayout.ts:725) has **no studio runtime call site** — it is used only by a
TouchGallery test mock and the engine's Phase E longpress compile regression test. There is
no runtime "empty-keyMap fallback surfacing as the author's seed" to guard against. Do
**not** scope a task to remove or guard it.

**Guard**: the `US_KEYCAPS` fallback inside `buildCanonicalPhoneLayers` **stays**. It is
what keeps the projected grid complete when the base's rules don't cover a template key.
FR-001's "never a fixed constant QWERTY" means *the seed must carry the author's work*,
not "delete the US fallback" — carve removals are applied on top of the completed grid.

**Rationale**: The header comment contradicts the feature's premise in one half and states
the actual defect in the other; leaving it unqualified is a defect by the project's own
"stale = defect" doctrine. The real seed is already IR-derived; the work is to make that
derivation *carry the desktop modifications* (R3) and to emit it even without Phase E
edits (R11).

**Alternatives considered**: Interpreting FR-001 literally as "there is a hardcoded QWERTY
constant that is the sole seed" — rejected after reading the code: `detectedChars` and the
Case A build already derive from `baseIr`. Recorded so `/speckit-tasks` scopes FR-001 as a
comment correction + emission-policy change, not a from-scratch seed rewrite.

---

## R3 — Desktop-modification replay: carve removals + letter placements (FR-002/004/005)

**Decision**: Add a pure engine function
`applyDesktopModifications(seed: TouchLayoutIR, mods): { layout, warnings }` (plus the Case B
raw-JSON variant — R9) that replays the locked desktop work onto a touch seed, and call it in
**both** paths inside
[buildTouchLayoutJson](../../packages/studio/src/lib/buildTouchLayoutJson.ts). Inputs `mods`:
- **carve removals** — the set of characters removed on desktop (Phase D), derived from the
  working copy's carve overlay (`deletedNodeIds`/`deletedItemIds`) as a **produced-set
  diff**: `buildProducedSet(baseIr)` minus `buildProducedSet(projectedWorkingIR)`, where
  `projectedWorkingIR` is the overlay-applied projection the output path already computes
  (`projectWorkingCopyForOutput`). A produced-*character* diff, not a rule-presence diff,
  because carve **nul-fills** carved slots (the rule survives, outputting `nul`; only the
  character disappears from the produced set);
- **letter placements** — desktop Phase C individual placements, already surfaced in
  `TouchGallery.desktopAssignments` (physical + individual) and by
  [touchSuggest](../../packages/studio/src/editors/touchSuggest/touchSuggest.ts) (which emits
  `physical-suggested` touch keys from physical decisions).

**Corrected premise (supersedes the earlier draft of this decision)**: `baseIr` is **not**
a post-lockDesktop snapshot. It is set exactly once, at instantiation, from the pristine
base ([workingCopyStore.ts:875/920](../../packages/studio/src/stores/workingCopyStore.ts)),
and `lockDesktop()` only sets the `desktopLocked` boolean (workingCopyStore.ts:820) — it
snapshots nothing. Carve removals live in the `deletedNodeIds`/`deletedItemIds` overlay;
Phase C placements live in `phaseResults`. Therefore a "post-lockDesktop `baseIr` vs
original rules" diff compares two identical objects and is always empty, and
`scaffoldTouchLayout(baseIr)` reflects **neither** carve removals **nor** placements.

**Rationale**: **Both paths are gaps.** Case A projects from the pristine `baseIr` (see
corrected premise), so the replay is what carries *all* desktop work into the projection.
Case B (`applyTouchAssignmentsToRawJson`) preserves the shipped base layout verbatim and
applies only explicit Phase E touch assignments — desktop carve removals and letter
placements are *not* propagated. `applyDesktopModifications` closes both: it removes carved
chars from the seed and injects/relocates placed letters. Provenance tagging applies on the
Case A IR path only; Case B's no-clobber guarantee comes from pipeline ordering (see R6,
amended).

**Alternatives considered**: (a) *Only fix Case B* (the earlier framing) — rejected: Case A
is equally broken because `baseIr` is pristine; fixing one path ships FR-004/FR-005 broken
on the other. (b) *Feed the projection the carve-working `ir` instead of `baseIr`* —
rejected: `buildTouchLayoutJson`'s own contract forbids the carve-working IR (it may carry
mutate-seam writes and mid-carve state), and placements still wouldn't be present; an
explicit `mods` input keeps the derivation pure and testable. (c) *Do the replay in the
studio store* — rejected: violates the pure-engine boundary and would duplicate logic
between preview and output; `buildTouchLayoutJson` is the single seed→apply→emit choke
point both call.

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

**Corrected premise (supersedes the earlier draft of this decision)**: criterion **18.6
already has a shipped check**.
[check-18-6-inventory-coverage.ts](../../packages/keyboard-lint/src/checks/check-18-6-inventory-coverage.ts)
(`KM_LINT_INVENTORY_UNCOVERED`) covers the **desktop rules** via `buildProducedSet(ir)`, at
**warning** severity, scope-guarded to `ir.origin === "scaffolded"` with no raw fragments,
and it runs only through `lintWithContext()` (needs `keyboardIR` + `inventory`) — **not**
through the plain `engine.lint()` that
[useTouchLint](../../packages/studio/src/hooks/useTouchLint.ts) calls. "Register a new 18.6
check" as originally written would fork one criterion into two divergent rubrics — the drift
class this repo's tooling exists to catch.

**Decision**:
- Add the pure engine helper `touchCoverage(layout, inventory): { uncovered: string[] }`
  (unchanged from the original decision — a char is covered if produced by any navigable
  key's `text`/`output`/`U_…` id, or any `sk`/`flick`/`multitap` entry of a reachable key).
- Surface it as a **new check code `KM_LINT_TOUCH_UNCOVERED`** in
  `@keymanapp/keyboard-lint`, mapped to the **same criterion row**
  `18.6-inventory-fully-covered`. **No new criteria.json row** — the 148 count is
  test-enforced and the 18.13 addition was reverted for exactly this.
- The new check's scope guard must **not** copy the sibling's `origin === "scaffolded"`
  guard: imported bases (Case B) are this feature's primary audience, and the raw-fragment
  skip does not apply (the check walks the touch layout, not IR rules).
- **Severity/gating**: **warning** while editing in the gallery — a sparse imported seed
  legitimately starts with many not-yet-configured inventory chars, and a wall of errors at
  stage entry is noise — and **blocking at stage completion**: `handlePhaseEComplete` (or
  the stage-exit gate) re-runs `touchCoverage` and refuses to finalize while `uncovered` is
  non-empty (FR-008's "may not finalize").
- **Wiring**: extend `useTouchLint` to accept optional context (the derived layout + the
  confirmed inventory) and route through `lintWithContext` — same debounced effect, **no
  new debounce timer** (Constitution IV).

**Rationale**: FR-008 is the one hard constraint on the simplification/replay. The touch
lint surface (checks 18.1–18.5) already runs in the gallery within the single 300 ms debounce;
adding the coverage findings there means one obvious place for the author to see coverage.
`TouchGallery` already computes a `detectedChars` set by walking
`layout.platforms[].layers[].rows[].keys[]` incl. `sk`/`multitap`/`flick` — the same traversal
`touchCoverage` needs, so the logic is extracted to the engine and shared (fed the **derived
seed for the chosen seed source**, not `scaffoldTouchLayout(baseIr)` unconditionally).

**Alternatives considered**: (a) *A brand-new criteria.json row* — rejected: the criteria
count (148) is enforced by `packages/contracts` tests; the 18.13 lint-check addition was
reverted over this. (b) *Redefining `KM_LINT_INVENTORY_UNCOVERED` to also walk touch* —
rejected: different scope guards, different surfaces, different severities; forking one
code's rubric invites drift. (c) *Error severity live in the gallery* — rejected: floods the
panel at stage entry on any sparse imported layout. (d) *Throw on uncoverable char in the
engine apply* — rejected: too blunt; the author needs to see *which* char and fix it in the
gallery. (e) *A separate coverage panel* — rejected: duplicates the lint surface and risks a
second debounce path.

---

## R6 — Provenance tagging for derived vs authored keys

**Decision**: On the **Case A (IR) path**, keys created by projection/replay are tagged
`provenance: "physical-suggested"` (desktop-derived) or `"base-derived"` (carried from the
base layout); author edits in the touch gallery remain/become `"hand-set"`.
`scaffoldTouchLayout`'s `buildLetterKey` (scaffoldTouchLayout.ts:289) currently omits
provenance — the derivation work sets it.

**Case B caveat**: provenance is an **IR-only** concept. The wire-format
`.keyman-touch-layout` JSON has no provenance field, and emitting a non-standard field into
the shipped artifact is not acceptable — so the raw-JSON replay (R9) carries **no tags**.
Case B's no-clobber guarantee comes from **pipeline ordering** instead: every rebuild
re-derives seed → replay → `applyTouchAssignmentsToRawJson` (author Phase E edits applied
last), so replay can never overwrite an author edit. `promoteOnManualEdit` under the mutate
flag continues to tag the *working IR*, unchanged.

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

**Consequence to surface (see R10/R12)**: choosing reseed on a base that *ships* tablet or
desktop touch platforms **removes them from the emitted keyboard** (Case A emits phone
only). Acceptable as a v1 limitation, but the seed-source chooser must state it — the
author is trading the base's tablet coverage for a clean desktop-derived phone layout.

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

**Local-machine caveat**: the Playwright CLI is currently unavailable on the primary dev
machine (studio E2E lane broken locally); the E2E specs are CI-first, with local
verification falling back to Node probes / headless-Chromium CDP as done for prior touch
work.

**Alternatives considered**: E2E-only — rejected: the coverage guard and replay are pure and
cheapest to pin at the unit level; E2E is reserved for the two end-to-end story walks.

---

## R9 — Case B replay is a raw-JSON splice; removal semantics

**Decision**: Implement the Case B replay as a **raw-JSON variant** —
`applyDesktopModificationsToRawJson(rawJson, mods): { json, warnings }` — a sibling of
[applyTouchAssignmentsToRawJson](../../packages/engine/src/pattern-apply/applyTouchAssignmentsToRawJson.ts)
using the same parse → splice-in-place → stringify technique. Do **not** implement Case B as
parse → IR → `applyDesktopModifications` → re-emit: the verbatim-preserve guarantee is the
whole reason Case B exists, and round-tripping through `emitTouchLayout` drops per-key
`layer`, `displayUnderlying`, `font`/`fontsize`, and string-vs-int `sp`/`width`/`pad`
(documented in applyTouchAssignmentsToRawJson's header). The IR-typed
`applyDesktopModifications(seed, mods)` remains the Case A implementation; the two share
removal/placement logic where practical (mirroring the existing
`applyTouchAssignments` / `…ToRawJson` split).

**Removal semantics (both variants)**:
- A carved char in an `sk[]` / `multitap[]` entry or a `flick{}` direction: **drop the
  entry** (and the flick key for that direction).
- A carved char that is a key's **primary production** (its `text`/`output`, or a `U_XXXX`
  id that itself outputs the char): **never delete the key object** — row geometry, widths,
  and touch targets stay stable. Convert the key to an inert placeholder: id becomes a
  reserved non-producing `T_` id (e.g. `T_removed_<n>`), `text` cleared, `output` removed;
  gesture entries for *other* chars on that key are kept.
- The removal applies even when it orphans an inventory char; the coverage guard (R5)
  reports it rather than the replay silently refusing (unchanged from the seed-derivation
  contract clause 2).

**Alternatives considered**: (a) *Parse→IR→re-emit for Case B* — rejected (fidelity loss
above). (b) *Delete primary keys outright* — rejected: shifts row geometry mid-derivation,
surprising diffs against the shipped layout, and breaks width/pad assumptions of
neighbouring keys.

---

## R10 — Reseed must explicitly discard an existing touch layout

**Decision**: The reseed path calls `scaffoldTouchLayout` on an IR with the shipped touch
layout **stripped**: `scaffoldTouchLayout({ ...baseIr, touchLayout: undefined })`. No engine
change.

**Rationale**: `scaffoldTouchLayout` does **not** discard — when `ir.touchLayout` is
present it preserves all existing platforms and merely augments the phone platform
(scaffoldTouchLayout.ts:787-825). And `baseIr.touchLayout` *can* be populated (the artifact
path parses a shipped layout into the IR — useKeyboardArtifact.ts:406-413), so calling
`scaffoldTouchLayout(baseIr)` for "reseed" would intermittently return the base's own
layers, violating US2-AS4 ("the base layout is discarded and the desktop projection is
used"). Stripping in the studio orchestrator keeps the engine function's Case B behaviour
(used elsewhere) intact.

**Alternatives considered**: an `opts.ignoreExistingTouchLayout` flag on
`scaffoldTouchLayout` — acceptable, but a pure input transformation at the single call site
is smaller and leaves the engine API untouched.

---

## R11 — Emission policy: the derived seed is emitted even with zero Phase E edits

**Corrected premise**: today `TouchGallery` / `StudioShell.handlePhaseEComplete` emit
`null` (leave the VFS/output untouched) whenever the author makes no real (non-inherited)
touch edit — a deliberate design so KMW renders its polished native default or the shipped
file is used verbatim. Under 035 that policy silently breaks FR-004: carve removals must
reach the emitted touch layout *even when the author never opens a chooser card*.

**Decision** — emission matrix, implemented at `buildTouchLayoutJson`'s callers (both
TouchGallery's preview transform / `editedVfsForLint` and the completion/output path, so
preview, lint, and output agree):
- `seedSource === "reseed-from-desktop"` → **always emit** the derived layout (SC-002
  requires the file to exist).
- `seedSource === "import-adapt"` and (`mods` non-empty **or** any real Phase E edit) →
  **emit** the derived layout.
- `seedSource === "import-adapt"`, `mods` empty, no real Phase E edits → **emit nothing**;
  the shipped file is used verbatim (a byte-preserving no-op — this preserves today's
  behaviour for the truly-untouched case).
- `json === null` keeps its current meaning: engine failure → omit the file.

---

## R12 — Fork memory, re-entry, and draft staleness (FR-006 wiring details)

**Decisions**:
- **Memory**: `advance("mechanisms")` routes to `touch_seed_source` only when no valid
  choice exists — `AdvanceContext` gains `touchSeedSource: TouchSeedSource | null`; when a
  choice is already recorded (and not invalidated by staleness, e.g. base
  re-instantiation), advance goes straight to `"touch"`. Without this, every
  back-and-forth over mechanisms re-asks the question.
- **Re-entry**: the host wires TouchGallery's `onBack` (Back from the first character) to
  `touch_seed_source` rather than `mechanisms`; the chooser's `onBack` goes to `mechanisms`
  (locked/read-only). This is the path that keeps US2-AS4 ("author explicitly prefers
  reseed") reachable after the first pass — without it the choice is one-shot.
- **Draft staleness**: changing the seed source after touch edits exist clears `touchDraft`
  (its `charTouch` entries reference host keys of the *other* seed and would half-apply
  with warnings); the chooser warns before discarding.
- `touch_seed_source` is **not** added to `STEPS_WITH_APPLY_COMPLETION` (it only sets a
  session flag; it has no applyStepCompletion effect).
- **Update set**: `advance.test.ts` (`mechanisms → touch` walk becomes conditional), the
  golden-walk oracle, and the Flow Map render of the fork step.

---

## R13 — Seam reconciliation: one artifact writer (resolves the km-triage escalation on PR #1088)

**Question escalated**: should the 035 replay and spec-014's `repropagate`/`touchSuggest`
merge into one propagation mechanism, or is one inert while the other is live?

**Decision — single artifact writer; the seam stays IR-scoped**:
- The 035 stateless derivation (`buildTouchLayoutJson` under the R11 matrix) is the **only
  writer** of the `touchLayoutJson` side-car / VFS artifact, in **both** flag states.
- The spec-014 seam keeps its IR-level job — maintaining `ir.touchLayout` + provenance on
  the working IR (which `promoteOnManualEdit` and the flag-on preview rely on) — but
  **loses its side-car write**: remove `setTouchLayoutJson` from `RepropagateDeps`, the
  emit at [repropagate.ts:163-165](../../packages/studio/src/steps/repropagate.ts), and
  its injection at the reducer's mechanisms-completion call site
  ([reducer.ts:248](../../packages/studio/src/steps/reducer.ts)).
- The two mechanisms are **not merged**: `touchSuggest` remains the flag-gated mutate-seam
  propagation over the working IR; unifying it with `applyDesktopModifications` is
  spec-014-scope work with no 035 acceptance criterion behind it.

**Rationale**: the seam's side-car write was an issue-#831-era patch for a world where
nothing re-serialized the artifact after re-propagation. Under 035 the artifact is always
re-derived from seed + mods + assignments at the touch stage, so the write is redundant at
best — and **flag-on it is harmful**: it emits via `emitTouchLayout(ir.touchLayout)`, an IR
round-trip that violates the R9 verbatim guarantee whenever the base ships a touch layout,
and it bypasses the R11 emission matrix. The mutate flag defaults **off**
(`VITE_KM_MUTATE_SEAM` must be exactly `"1"`, no live toggle), so the removal is a no-op
for every default build; it MUST land before the flag is ever enabled on a 035-bearing
build.

**Consequence for tasks.md**: T024 is a **small real refactor** (one dep + one write
removed, flagParity test + docstrings updated), not a documentation task. Phase 5 timing
is safe *only because* the flag defaults off; the task carries the before-flag-on
constraint explicitly.

**Alternatives considered**: (a) *Route the seam's flag-on write through
`buildTouchLayoutJson`* — rejected: re-propagation fires at mechanisms-completion, before
the seed-source choice exists, so it cannot evaluate the R11 matrix; the touch stage
re-derives moments later anyway. (b) *Full merger of `touchSuggest` into the replay* —
rejected for 035: default-off seam, no acceptance criterion behind it, and T021's
provenance tagging in `scaffoldTouchLayout` already removes most of the duplication
pressure; revisit inside spec-014's own rollout.
