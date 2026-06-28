# Research Findings — Question Unification Investigation

> Concise, durable record of the investigation behind the question-unification
> migration. Companion to the full HTML design note
> (`docs/design-notes/question-unification.html`, also on branch
> `design-note/question-unification`, commit `d0d5cfe`) and the migration plan
> (`docs/design-notes/question-unification-migration-plan.md`). This doc exists so the
> research lives in the repo, not only in Slack or the HTML note. All file:line
> references verified against `main` (HEAD `ff0fe65`).

---

## (a) Flow-map root-cause trace

**Symptom.** The dashboard flow map advertises paths users mostly don't take and is
silent about the paths they do.

**Root cause — two ordering sources that are never forced to agree:**

1. **The map reads only the four `*.modular.yaml` files.** The survey-flow section is
   built from `FLOW_SOURCES` (`packages/studio/src/dashboard/DashboardView.tsx:48-54`)
   via `buildModularFlowGraph()`. Those four YAMLs are: identity-lite head, full
   Phase A identity, Phase B character discovery, Phase F help docs.
2. **`buildManifestStepGraph()` is written but never wired.** The projection function
   that emits exactly one node per manifest entry — with spine/fork/join/data edges —
   exists at `packages/studio/src/dashboard/buildStepGraph.ts:237`, but the dashboard
   **never calls it**. It is exercised only by tests; `completeness.ts` deliberately
   AVOIDS importing `buildManifestStepGraph` to prevent a circular dependency
   (`completeness.ts:526`).
3. **Consequence.** Two parallel ordering lists (the YAMLs vs the manifest) with no
   construct forcing them to agree. The manifest editor-steps (carve, mechanisms,
   touch — `packages/studio/src/steps/manifest.ts`) get **no map node**, and the
   "stub (gallery / wizard step)" legend swatch is dead because nothing emits that
   kind. The manifest header *declares* "map == runtime by construction"
   (`steps/manifest.ts:1-6`) — but that guarantee holds only at the inter-phase
   manifest level, not for the survey-flow section the dashboard actually renders.

**Maturity inversion (the deeper problem).** The unification refactor pulled the
*less-mature* paths into the registry + map (the per-phase `pb_*` / Phase A question
batteries) while the *mature, canonical* experiences stayed as hand-built React
components outside the unified data structure entirely:

- Phase B build-list default `BuildListView` — hand-built, in **no** data source
  (`survey/PhaseB.tsx:535`, used ~`692`); the map shows only the rarely-taken "step by
  step" `pb_*` battery.
- "Confirm the basics" Prefill — hand-built (`survey/Prefill.tsx:64`), no node.
- "How do you want to use this base?" TrackStep — manifest editor-step with no
  question (`editors/.../TrackStep.tsx:40`).
- Full non-identity Phase A — **orphaned**: shown in the map but never rendered, since
  `StudioShell.tsx:18` imports `IdentityLite, Prefill, PhaseB, PhaseF`, never `PhaseA`.

So the map advertises orphaned/low-maturity paths and hides the mature live ones —
the inversion in one sentence.

**Vestigial machinery already present for the fix.** `computeReserveNodes()`
(`buildStepGraph.ts:150-182`) can emit "library-not-in-flow" reserve nodes but is
currently empty (every registered module is listed in some YAML). The concept of an
inert-but-preserved library exists; it just isn't used yet to hold the genuine reserve
batteries.

---

## (b) Per-flow reachability / inventory matrix

Data status legend: **modular** = rendered from registry + YAML on a data branch;
**component** = rendered but in no unified data source; **orphaned** = in a data
source but never rendered; **library** = reserve/inert (target).

| Flow / question / wizard | Render mode (today) | Data status | Maturity | Target |
|---|---|---|---|---|
| Identity-lite head (`il_*`, `identity_lite.modular.yaml`) | modular via IdentityLite (`StudioShell.tsx:861-869`) | **modular** | mature & live | Keep first-class; already on `mutate()` (il_* writers) |
| Full Phase A — identity + 15 `provenance_*` (`phase_a_identity.modular.yaml`) | **not rendered** (PhaseA not imported, `StudioShell.tsx:18`) | **orphaned** | data-only, untested at runtime | Demote to library (Q3) |
| Choose base — BaseResolution | manifest editor-step `choose_base` | **component** | mature & live | Editor-step on spine; surfaced by manifest projection |
| Track chooser — "How do you want to use this base?" (`TrackStep.tsx:40`) | manifest editor-step `track` | **component** | mature & live; branch-defining | Promote to modular gate (fork becomes data) |
| Project name — ProjectNameStep | manifest editor-step `project_name`, `spine:false`, `joinTarget:"characters"` | **component** (side-trail node exists) | mature & live | Stays editor-step side-trail; map renders as fork |
| "Confirm the basics" — Prefill (`Prefill.tsx:64`) | hand-built sub-stage of `characters` (`StudioShell.tsx:930-940`) | **component** | mature & live | Promote to read-only modular node (`writes: []`) |
| Phase B build-list default — BuildListView (`PhaseB.tsx:535`, used ~`692`; `confirmedInventory` write `PhaseB.tsx:610`) | hand-built; no data-source entry; reached via the **mandatory** IntroChooser gate (~`744`), no auto-default | **component** | most mature B experience; the one users take | Promote to modular char-list drill-down; per-grapheme loop deferred (only if per-element sub-question UX is committed) |
| Phase B step-by-step — 55 `pb_*` (`phase_b_characters.modular.yaml`) | modular via SurveyRunner (manual path only, `PhaseB.tsx:712-740`) | **modular** (non-default branch) | comprehensive but rarely taken | Keep reachable via discovery gate; demote off default spine → library where off-branch. Only `pb_standard_letters` has a real `mutate()` (`questions/b/pb_standard_letters.ts:105-125`) |
| Phase F — help docs (8 `pf_*`) | modular via PhaseF (`StudioShell.tsx:956-964`) | **modular** | data & runtime aligned | Keep as-is — the reference "done right" shape |
| Carve — CarveGallery | manifest editor-step `carve`; **direct store mutators** (`CarveGallery.tsx:28-72`), not `mutate()` | **component** | mature & live; "Form 4" gallery | Editor-step on `mutate()` (highest-effort overlay, R1) |
| Mechanisms (physical) — MechanismGallery | manifest editor-step `mechanisms`, `lock:"physical"` (spread in `manifest.ts:96-99`); R1 `lockDesktop()` runs unconditionally (`reducer.ts:222`; the flag-gated touch re-propagation add-on at `reducer.ts:228-243` is off in P1); writes `groups[]`/`stores[]` (`ADD_GALLERY_WRITES`) | **component** | mature & live; **REFERENCE/known-good** | Editor-step on `mutate()`, parity-proven; convert last |
| Touch seed source — AddTouchAdapter fork | manifest editor-step `touch_seed_source`, `spine:false`, `joinTarget:"touch"` | **component** (off-spine node) | mature & live | Stays editor-step side-trail; map renders fork/join |
| Touch — TouchGallery | manifest editor-step `touch`, `lock:"touch"` (spread in `manifest.ts:109-112`); R2 `buildTouchLayoutJson`/side-car runs unconditionally (`reducer.ts:249-277`); writes `touchLayout.platforms[].layers[].rows[].keys[]` (`TOUCH_WRITES`) | **component** | mature & live; **known-good (verified)** | Editor-step on `mutate()`; convert last. Touch IR already first-class (#825) |
| Unsupported-script stub | hand-built terminal panel | **component** | mature; terminal | Already modelled as `il_script_not_supported`; projection links the terminal branch |

**Reading the matrix.** The mature, live experiences cluster in **component** (galleries,
build-list, prefill, track) or **modular-but-non-default** (`pb_*` battery). The one
truly **orphaned** structure (full Phase A) is also the least mature at runtime. That is
the inversion in tabular form.

---

## (c) Touch-vs-physical verification verdict

**Verdict: touch works end-to-end — it is a known-good reference flow, NOT a risk.**

- **Touch write path runs unconditionally**, mirroring physical's R1. Touch's R2
  (`buildTouchLayoutJson` / `setTouchLayoutJson` → shipped `.keyman-touch-layout`
  side-car) executes at `reducer.ts:249-277`, exactly parallel to physical's R1
  `lockDesktop` at `reducer.ts:221-245`. Neither base path is flag-gated.
- **Touch IR + per-key provenance are first-class** in `KeyboardIR.touchLayout` (US2–US5,
  #825; contracts at 0.13.0).
- **Side-car wiring merged.** #831 serializes the re-propagated touch IR into the
  shipped side-car — merged as commit **`c9f64ba`** (verified in `git log`).
- **Tests pass.** All touch tests green; the studio suite is at **328 tests** (the
  test-corpus seed fix landed as #834 / `ff0fe65`).
- **Only the optional auto-re-propagation is flag-gated.** The single flag-gated touch
  piece is the *optional* automatic physical→touch re-propagation enhancement
  (`reducer.ts:228-243`) — an add-on over the working base flow, consistent with
  Article VII (touch is seeded from the locked physical layout, never the reverse). The
  base touch flow itself is unconditional and working.
- **Remaining gap is the shared one.** Touch's only outstanding gap is the same as every
  other gallery: its UI is a hand-built Form-4 gallery, not yet a first-class modular
  node in the map/registry — closed by the map projection (design note §C), not by any
  write-path repair.

**Implication for the migration.** Both physical and touch are the target shape every
other flow should match. Convert them **last** and never destabilize them to unblock
another flow; each conversion to a declared-writes `mutate()` surface must be
byte-for-byte parity-proven before any default flip.
