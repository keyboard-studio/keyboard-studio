# Survey Modularity + CYOA Refactor — Plan / RFC

> **Status: PLAN / RFC — not yet implemented.** This document describes a target
> architecture and a phased migration. No code in this branch implements it. It
> is meant for review and amendment before any execution phase begins. File
> inventories below were verified against the live tree on the branch base
> (`origin/main`); the *target* tree and migration table are proposals.

---

## 1. Goal & scope

### Goal

Finish the move toward **modular, drop-in survey questions** on a **Choose Your
Own Adventure (CYOA)** model, and eliminate the structural duplication where a
single "question" can exist in up to four different forms. The end state:

- One canonical representation per question, with **flat-by-default, folder-when-needed** layout.
- A shared **`ui/` primitive library** so form controls are not inline-duplicated.
- Each question **declares its data dependencies (`inputs`) and the KeyboardIR it
  will populate (`writes`)** as static data, decoupling the editor/dashboard from
  the (not-yet-built) engine mutation seam.
- A single **`steps/` model + `steps/manifest.ts`** that unifies questions,
  hand-built wizard steps, and galleries as ordered "steps." `StudioShell` and
  the flow map both read this manifest, so **map == runtime by construction**.
- A **CYOA structure** of a spine, side trails, and reversible lock gates.
- **Surface-parameterized carve/add** so the touch surface gets the same
  carve+add affordances as physical, seeded from the base touch layout plus
  physical edits, with **per-key provenance** reserved for future propagation.
- The flow map upgraded into an honest **dashboard / index**.

### In scope

- Restructuring `packages/studio/src/` (components, survey, flowmap, stores).
- Finishing the loader cutover for Phase A / F / identity-lite (the tail of #410).
- Net-new structure: `ui/`, `steps/`, declared `inputs`/`writes`, dashboard.

### Explicitly OUT of scope (deferred)

- **Publishing.** The four eventual publish paths (zip source → Keyman Developer;
  compiled `.kmp` → test in Keyman; publish via our GitHub org assisted; connect
  your own fork of `keyboards` → Keyman review) are **not designed here.** The
  plan only **reserves a home** for them (a future end-step sequence or a
  separate publishing tab) and stops there.
- **The actual KeyboardIR mutate execution.** `QuestionModule.mutate` stays a
  declared-but-not-executed seam until the engine contract (#5b / #232) lands.
  `inputs`/`writes` are declared *now*; `mutate()` runs *later*.
- **Deleting the legacy YAML loader.** #410 scopes out "replacing the YAML
  loader." Retiring `content/flows/*.yaml` + `parseFlow` is a follow-up *beyond*
  #410 (see Phase P3).

---

## 2. Current state — the four forms (verified inventory)

A "question" currently exists in up to **four** parallel forms. Verified against
the live tree:

### Form 1 — Modular per-question modules (runtime truth for Phase B only)

`packages/studio/src/survey/questions/<phase>/<id>.ts`, each exporting a
`QuestionModule` (`definition`, optional `validate`, `fixtures`; `mutate` is a
commented-out stub — see `survey/types.ts`). Registered via per-phase
sub-registries merged in `registry.ts`, loaded by `loadModularFlow.ts` from thin
`content/flows/*.modular.yaml` manifests.

```
survey/questions/
  a/   (Phase A identity/provenance — modules EXIST but are NOT runtime truth yet)
       author_contact_email.ts, author_display_name.ts, desktop_first_notice.ts,
       iso_code.ts, language_name_autonym.ts, language_name_english.ts,
       layout_family.ts, pa_copyright_holder.ts, pa_primary_target.ts,
       primary_script.ts, provenance_additional_notes.ts,
       provenance_casing_notes.ts, provenance_community_involvement.ts,
       provenance_community_rep_email.ts, provenance_community_rep_name.ts,
       provenance_community_rep_role.ts, provenance_existing_tools.ts,
       provenance_language_status.ts, provenance_opt_in.ts,
       provenance_orthography_url.ts, provenance_regions.ts,
       provenance_requester_affiliation.ts, provenance_requester_contact.ts,
       provenance_requester_name.ts, provenance_requester_relation.ts,
       provenance_speaker_count.ts, region.ts, script_family.ts,
       script_not_supported_stub.ts, writing_direction.ts   (+ colocated *.test.ts)
  b/   (Phase B characters — RUNTIME TRUTH today; ~60 modules)
       pb_accent_marks_gate.ts, pb_additional_methods.ts, pb_azerty_qz_swap.ts,
       pb_capitals_marks.ts, pb_char_count.ts, pb_co_installed_keyboards.ts,
       pb_contact_language.ts, pb_diacritic_select.ts, pb_digit_set.ts,
       pb_discovery_intro.ts, pb_existing_keyboards.ts, pb_indic_conjuncts.ts,
       pb_indic_nukta_detail.ts, pb_indic_nukta_gate.ts,
       pb_indic_pre_base_vowels.ts, pb_indic_virama.ts, pb_indic_vowels_onset.ts,
       pb_indic_vowels_onset_list.ts, pb_indic_vowels_separate.ts,
       pb_latin_azerty_branch.ts, pb_latin_digraphs_gate.ts,
       pb_latin_digraphs_list.ts, pb_latin_qwerty_branch.ts, pb_legacy_encoding.ts,
       pb_linguist_confirm.ts, pb_mark_input_order.ts, pb_mark_style.ts,
       pb_non_roman_branch.ts, pb_other_free_entry.ts, pb_picker_confirm.ts,
       pb_punctuation_gate.ts, pb_punctuation_list.ts, pb_routing_branch.ts,
       pb_rtl_direction_confirm.ts, pb_rtl_direction_marks.ts,
       pb_rtl_direction_marks_detail.ts, pb_rtl_short_vowels.ts,
       pb_rtl_special_letters.ts, pb_sea_medials.ts, pb_sea_stacked_consonants.ts,
       pb_spare_keys_azerty.ts, pb_spare_keys_qwerty.ts, pb_special_letters.ts,
       pb_special_letters_list.ts, pb_special_letters_notes.ts,
       pb_stacking_marks.ts, pb_standard_letters.ts, pb_syllabic_finals_detail.ts,
       pb_syllabic_finals_gate.ts, pb_syllabic_grid.ts, pb_syllabic_note.ts,
       pb_text_sample.ts, pb_text_sample_review.ts, pb_typing_approach.ts,
       pb_use_case.ts   (+ colocated *.test.ts)
  f/   (Phase F help docs — modules EXIST but are NOT runtime truth yet)
       pf_contact_info.ts, pf_credits.ts, pf_usage_tip_1.ts … pf_usage_tip_5.ts,
       pf_welcome_paragraph.ts   (+ colocated *.test.ts)
  registry.a.ts, registry.b.ts, registry.f.ts, registry.ts, registry.test.ts
```

Loader / shared: `survey/loadModularFlow.ts` (+ `.test.ts`), `survey/types.ts`
(the `QuestionModule` interface and the **`mutate` stub** — see §3.3).

### Form 2 — Legacy full-YAML flows (still runtime truth for A, F, identity-lite)

`content/flows/phase_a_identity.yaml`, `content/flows/phase_b_characters.yaml`,
`content/flows/phase_f_helpdocs.yaml`, `content/flows/identity_lite.yaml`,
parsed by `survey/loadFlow.ts` (`parseFlow`). The `*.modular.yaml` manifests
(`phase_a_identity.modular.yaml`, `phase_b_characters.modular.yaml`,
`phase_f_helpdocs.modular.yaml`) are the thin counterparts consumed by
`loadModularFlow.ts`. Examples live under `content/flows/_examples/`
(`phase_a_bafut.yaml`, `phase_b_bafut.yaml`, `phase_f_bafut.yaml`).

Phase A/F/identity-lite still resolve through the legacy loader — the
**TODO(#410)** markers live in `survey/PhaseA.tsx`, `survey/PhaseF.tsx`, and
`survey/IdentityLite.tsx`. Phase B already runs on Form 1. The 93 modules were
copied **verbatim** from the legacy YAML, so for A/F/identity-lite the questions
literally exist twice.

### Form 3 — Hand-built wizard-step components (ask questions, never registered)

In `packages/studio/src/components/`:

- `TrackStep.tsx` — choose the build track.
- `ProjectNameStep.tsx` — name the project.
- `ScaffoldForm.tsx` — scaffold parameters.
- `TrackOneIdentityPanel.tsx` (+ `.test.tsx`) — identity panel for track one.
- `BaseResolution.tsx` (+ `.test.tsx`) — resolve/choose the base keyboard.

These collect answers but have **no `id`/`prompt`/`next`**, so the registry and
the flow map cannot see them.

### Form 4 — Galleries (mutate KeyboardIR directly via `workingCopyStore`)

- `components/CarveGallery.tsx` + the `components/carve/` subtree
  (`DepBanner.tsx`, `GlyphCell.tsx`, `InfoView.tsx` (+ `.test.tsx`),
  `Inspector.tsx`, `KeyCap.tsx`, `KeySeq.tsx`, `KindBadge.tsx`, `Rail.tsx`,
  `StatusBar.tsx`, `ToggleBox.tsx`, `carveShared.tsx`).
- `components/MechanismGallery.tsx` (+ `.test.tsx`).
- `components/TouchGallery.tsx` (+ `.test.tsx`).
- Supporting: `GalleryIntroSplash.tsx` (+ `.test.tsx`), `GalleryPreviewPane.tsx`,
  `lib/galleryTheme.ts`, `lib/irToCarveNodes.ts` (+ tests).

Galleries mutate `KeyboardIR` **directly** through `stores/workingCopyStore.ts`,
on a path **completely separate** from the survey answer flow.

### Cross-cutting current problems

- **Answers vs. IR are two separate worlds.** `QuestionModule.mutate` in
  `survey/types.ts` is a deliberate **commented stub** ("KeyboardIR mutation
  surface is not yet a real contract … do NOT implement until the engine has a
  real mutation seam"). Answers flow to `stores/workingCopyStore.ts` as a
  `SurveyPhaseResult`; `KeyboardIR` (defined in
  `packages/contracts/src/keyboard-ir.ts`) is mutated separately by the
  galleries.
- **The flow map is stale.** `flowmap/FlowMapView.tsx` → `buildFlowGraph.ts`
  reads the legacy `content/flows/*.yaml` via `parseFlow`, **not** the live
  modules, and cannot see galleries or wizard steps (no `id`/`prompt`/`next`).
- **Ordering is hardcoded.** Master wizard order lives in the `SurveyStage` union
  in `StudioShell.tsx`: `identity → base → track → project-name → prefill →
  carve → B → mechanisms → E → F → done | unsupported`.
- **No shared UI library.** `survey/QuestionField.tsx` is the de-facto form kit;
  buttons/inputs are inline-duplicated across components and galleries.

---

## 3. Target architecture

### 3.1 The step model (`steps/`)

A single ordered model unifies all three "things that advance the wizard":
registered **questions**, hand-built **wizard steps**, and **galleries**.

```ts
// steps/types.ts  (proposed)
type StepKind = "question-step" | "editor-step";

interface StepBase {
  id: string;            // unique across the whole flow
  kind: StepKind;
  title: string;
  /** Spine | side-trail membership and lock placement (see §3.5). */
  spine?: boolean;
  lock?: "physical" | "touch";
  /** Declared dependency graph — see §3.3. */
  inputs: IRPath[];      // answers / IR state this step reads
  writes: IRPath[];      // KeyboardIR paths this step will populate
}

interface QuestionStep extends StepBase {
  kind: "question-step";
  /** Resolves to a QuestionModule via the existing registry (by definition.id). */
  questionId: string;
}

interface EditorStep extends StepBase {
  kind: "editor-step";
  /** A gallery or hand-built panel; rendered by component, advances the flow. */
  component: React.ComponentType<EditorStepProps>;
  surface?: "physical" | "touch";   // for carve/add galleries (see §3.6)
}
```

- **`question-step`** wraps a registered `QuestionModule` (Form 1). The registry
  stays keyed on `definition.id`.
- **`editor-step`** wraps a gallery (Form 4) or a former wizard-step component
  (Form 3). It advances the flow but renders a rich editor instead of a single
  field.
- `steps/manifest.ts` is the **single ordered list** of steps (with spine /
  side-trail / lock metadata). It is the source of truth for both runtime
  ordering and the dashboard.

### 3.2 Shared `ui/` primitive library (NEW)

Extract the inline-duplicated controls into a real primitive library:

```
ui/
  Button.tsx, Dropdown.tsx, TextField.tsx, RadioGroup.tsx,
  MultiSelect.tsx, Notice.tsx, Card.tsx, theme.ts, index.ts
```

`survey/QuestionField.tsx` and the five wizard-step components (Form 3) refactor
onto these primitives. Gallery chrome currently in `lib/galleryTheme.ts` folds
into `ui/theme.ts`. Boundary note: `ui/` must remain dependency-free of `survey/`,
`steps/`, and `stores/` so dependency-cruiser can enforce it as a leaf (see §7).

### 3.3 Question contract: declared `inputs` / `writes`

Extend `QuestionModule` (in `survey/types.ts`) so **every question declares, as
static data**, what it depends on and what KeyboardIR it will eventually write:

```ts
interface QuestionModule {
  definition: FlowQuestion;
  validate?: (value: …) => ValidationResult;
  fixtures: { … };

  /** NEW — declared NOW, executed LATER. */
  inputs?: IRPath[];   // answers / IR state read to decide routing or content
  writes?: IRPath[];   // KeyboardIR paths this question will populate

  // mutate stays a STUB until the engine seam (#5b / #232) lands.
  // mutate?: (value, ctx) => Partial<KeyboardIR>;
}
```

The crucial decoupling: `inputs`/`writes` are **plain data**, so the dashboard,
the completeness checker, and the lock-staleness graph can all be built **before**
`mutate()` is ever callable. `mutate()` remains the deliberate stub described in
`survey/types.ts` until the engine mutation surface exists.

### 3.4 Manifest-driven ordering

`StudioShell.tsx` stops hardcoding the `SurveyStage` union and instead reads
stage order from `steps/manifest.ts`. The flow map renders the **same** manifest.
Because both read one source, **map == runtime by construction** — the central
fix for the "stale flow map" problem.

### 3.5 CYOA structure: spine, side trails, locks

- **SPINE** — the main story. Because the project starts from a working base
  template, **every prefix of the spine is a valid stopping point** (you always
  have a shippable keyboard).
- **SIDE TRAILS** — branch on an answer and **must rejoin the spine**. Encoded by
  `definition.next` routing plus `spine: false` on the step.
- **LOCK gates** — reversible checkpoints. Breaking a lock marks
  **downstream-derived state stale** via the `inputs`/`writes` dependency graph
  (§3.3): any step whose `inputs` intersect a re-opened step's `writes` is
  flagged stale.

**Spine order** (mirrors the `StudioShell` stages):

1. language metadata / identity
2. choose base keyboard
3. define alphabet / needed keys (Phase B)
4. physical carve (Phase D — remove unneeded base elements)
5. physical add (Phase C mechanisms — place your items)
6. 🔒 **physical lock**
7. touch carve + touch add (Phase E)
8. 🔒 **touch lock**
9. documentation (Phase F)
10. publish *(reserved; out of scope — see §1)*

### 3.6 Surface-parameterized carve/add + touch provenance

The base template ships **both** a physical layout and a touch layout, so **touch
also has carve+add.** Generalize the existing Carve / Mechanism galleries into
**one gallery family parameterized by `surface: "physical" | "touch"`**, operating
on the relevant IR surface (groups/stores for physical; `touchLayout?` for touch).

**Touch is NOT a pure projection of physical.** It is **seeded** from the base
touch layout + the physical edits, then **independently** carved/added (layers,
long-press popups, key sizing). The future "auto-update touch when physical
changes" is a **propagation/merge, not a re-projection.** That requires **per-key
provenance** — was a key *physical-derived seed* or a *direct touch decision*? —
so re-propagation does not clobber manual touch work.

> **Plan the provenance seam now, build later.** Reserve a per-key provenance
> field on the touch surface (e.g. `{ provenance: "physical-seed" | "touch-manual" }`)
> so Phase P5 propagation has somewhere to land. No propagation logic is built
> until then.

### 3.7 Dashboard (flow map becomes the index)

The flow map (`flowmap/`) graduates from a stale viewer into the **dashboard /
index**, reading `steps/manifest.ts`. It shows, per step:

- **input requirements** (from `inputs`)
- **KeyboardIR mutations** (from `writes`)
- **branching** (from `definition.next` / side-trail metadata)
- a **completeness check across all reachable paths** (every reachable spine
  prefix is shippable; flag unreachable steps and unsatisfiable `inputs`).

---

## 4. Target file tree (`packages/studio/src/`)

Proposed shape after the full refactor (P0–P5). New areas marked **(NEW)**.

```
packages/studio/src/
  StudioShell.tsx              # reads order from steps/manifest.ts (no hardcoded union)
  StudioShell.test.tsx
  index.ts  index.css  main.tsx  test-setup.ts  vite-env.d.ts

  ui/                          # (NEW) shared primitive library
    Button.tsx Dropdown.tsx TextField.tsx RadioGroup.tsx
    MultiSelect.tsx Notice.tsx Card.tsx theme.ts index.ts
    *.test.tsx

  steps/                       # (NEW) unified ordered step model
    types.ts                   # StepKind, QuestionStep, EditorStep, IRPath
    manifest.ts                # single ordered list (spine/side-trail/lock)
    manifest.test.ts
    registerQuestionSteps.ts   # adapts QuestionModules -> question-step
    registerEditorSteps.ts     # adapts galleries/panels -> editor-step

  survey/
    types.ts                   # QuestionModule + NEW inputs/writes (mutate still stub)
    index.ts  constants.ts
    SurveyRunner.tsx (+ .test.ts, .pinChip.test.tsx)
    QuestionField.tsx          # refactored onto ui/
    Prefill.tsx (+ .test.ts)
    placementSeeds.ts (+ .test.ts)
    loadModularFlow.ts (+ .test.ts)   # the surviving loader
    # loadFlow.ts / PhaseA.tsx / PhaseB.tsx / PhaseF.tsx / IdentityLite.tsx
    #   RETIRED after P3 (legacy loader removed) — see migration table.
    TextSampleView.test.ts
    __fixtures__/placement-map.sample.json
    questions/
      registry.ts registry.a.ts registry.b.ts registry.f.ts registry.test.ts
      a/  <id>.ts | <id>/index.ts (+ extras/)   # flat default; folder opt-in
      b/  <id>.ts | <id>/index.ts (+ extras/)
      f/  <id>.ts | <id>/index.ts (+ extras/)
      # each module gains declared inputs/writes (§3.3)

  editors/                     # (NEW) editor-step components (former galleries + panels)
    gallery/
      Gallery.tsx              # surface-parameterized carve/add family (§3.6)
      surfaceAdapter.ts        # physical (groups/stores) vs touch (touchLayout?)
      provenance.ts            # (NEW) per-key provenance seam — reserved, build later
      parts/                   # former components/carve/ subtree
        DepBanner.tsx GlyphCell.tsx InfoView.tsx (+ .test) Inspector.tsx
        KeyCap.tsx KeySeq.tsx KindBadge.tsx Rail.tsx StatusBar.tsx
        ToggleBox.tsx carveShared.tsx
      IntroSplash.tsx (+ .test) PreviewPane.tsx
      *.test.tsx
    panels/                    # former hand-built wizard steps (Form 3)
      TrackStep.tsx ProjectNameStep.tsx ScaffoldForm.tsx
      TrackOneIdentityPanel.tsx (+ .test) BaseResolution.tsx (+ .test)

  dashboard/                   # (NEW; absorbs flowmap/) the index/dashboard
    DashboardView.tsx          # was FlowMapView.tsx; reads steps/manifest.ts
    buildStepGraph.ts          # was buildFlowGraph.ts; consumes manifest not YAML
    completeness.ts            # (NEW) reachable-path completeness check
    FlowGraphView.tsx ScriptRoutingView.tsx StrategyTreeView.tsx
    buildScriptRouting.ts flowUtils.ts layout.ts model.ts tokens.ts
    *.test.ts(x)

  components/                  # remaining non-question, non-editor UI
    BaseKeyboardPicker.tsx (+ .test) DiagnosticsPanel.tsx KmnEditor.tsx
    MetadataCard.tsx OSKFrame.tsx OskModeToggle.tsx OutputScreen.tsx
    PickerPane.tsx PreviewPaneOverlay.tsx PreviewScreen.tsx
    PreviewShell.tsx (+ .test) ResizeHandle.tsx SignUpPanel.tsx (+ .test)
    UnsupportedScriptStub.tsx previewOutputLayout.ts
    # these refactor onto ui/ but keep their home

  stores/   hooks/   lib/   lint/        # unchanged in shape (lib/galleryTheme.ts
                                          #   folds into ui/theme.ts)
```

> The `editors/` and `dashboard/` names are proposals; the key decisions are the
> *grouping* (galleries+panels become editor-steps; flowmap becomes the
> manifest-driven dashboard), not the exact folder names.

---

## 5. File-by-file migration listing

Actions: **stays**, **move**, **rename**, **split**, **new**. Verified current
paths; destinations are proposals. (Colocated `*.test.*` files move with their
subject unless noted.)

### components → `ui/` (extraction)

| Current | Action | Destination / Notes |
|---|---|---|
| (inline buttons/inputs scattered across components & galleries) | **new** | `ui/Button.tsx`, `ui/Dropdown.tsx`, `ui/TextField.tsx`, `ui/RadioGroup.tsx`, `ui/MultiSelect.tsx`, `ui/Notice.tsx`, `ui/Card.tsx`, `ui/theme.ts`, `ui/index.ts` |
| `lib/galleryTheme.ts` | **move/merge** | folds into `ui/theme.ts` |
| `survey/QuestionField.tsx` | **stays** (refactor) | re-implemented on `ui/` primitives |

### components (Form 3 wizard steps) → `editors/panels/` (become editor-steps)

| Current | Action | Destination |
|---|---|---|
| `components/TrackStep.tsx` | **move** | `editors/panels/TrackStep.tsx` → registered as `editor-step` |
| `components/ProjectNameStep.tsx` | **move** | `editors/panels/ProjectNameStep.tsx` → `editor-step` (could become a `question-step` if reduced to a single field) |
| `components/ScaffoldForm.tsx` | **move** | `editors/panels/ScaffoldForm.tsx` → `editor-step` |
| `components/TrackOneIdentityPanel.tsx` (+`.test.tsx`) | **move** | `editors/panels/TrackOneIdentityPanel.tsx` → `editor-step` |
| `components/BaseResolution.tsx` (+`.test.tsx`) | **move** | `editors/panels/BaseResolution.tsx` → `editor-step` (the "choose base keyboard" spine step) |

Each gains an `id`/`title`/`inputs`/`writes` entry in `steps/manifest.ts` so the
dashboard and runtime can finally see it.

### components (Form 4 galleries) → `editors/gallery/` (surface-parameterized)

| Current | Action | Destination |
|---|---|---|
| `components/CarveGallery.tsx` | **split/generalize** | `editors/gallery/Gallery.tsx` (surface-parameterized) + `surfaceAdapter.ts` |
| `components/MechanismGallery.tsx` (+`.test.tsx`) | **merge** | folds into `editors/gallery/Gallery.tsx` as the "add" mode |
| `components/TouchGallery.tsx` (+`.test.tsx`) | **merge** | becomes `surface: "touch"` invocations of the unified gallery |
| `components/carve/*` (DepBanner, GlyphCell, InfoView(+test), Inspector, KeyCap, KeySeq, KindBadge, Rail, StatusBar, ToggleBox, carveShared) | **move** | `editors/gallery/parts/*` |
| `components/GalleryIntroSplash.tsx` (+`.test.tsx`) | **move/rename** | `editors/gallery/IntroSplash.tsx` |
| `components/GalleryPreviewPane.tsx` | **move/rename** | `editors/gallery/PreviewPane.tsx` |
| `lib/irToCarveNodes.ts` (+tests) | **stays** | shared helper used by the gallery; remains in `lib/` (re-evaluate boundary) |
| (touch surface IR) | **new** | `editors/gallery/provenance.ts` — per-key provenance seam, reserved (§3.6) |

Galleries register as **`editor-step`s** (with `surface`) via
`steps/registerEditorSteps.ts`; physical carve/add and touch carve/add are four
manifest entries around the two lock gates.

### survey/questions reshape (flat default, folder opt-in)

| Current | Action | Destination |
|---|---|---|
| `survey/questions/<phase>/<id>.ts` (flat) | **stays** | unchanged for questions with no companion artifacts |
| any `<id>.ts` needing images/sample text/custom component | **split** | graduates to `survey/questions/<phase>/<id>/index.ts` + `extras/`; registry resolves by `definition.id` so both forms are identical to callers |
| all 93 modules | **edit** | gain declared `inputs`/`writes` (§3.3) |
| `survey/questions/registry.{a,b,f}.ts`, `registry.ts`, `registry.test.ts` | **stays** | merge pattern unchanged; resolution stays keyed on `definition.id` |
| `survey/types.ts` | **edit** | add `inputs`/`writes` to `QuestionModule`; `mutate` stays the documented stub |

### loaders / phase components (the #410 tail, then legacy retirement)

| Current | Action | Destination / Notes |
|---|---|---|
| `survey/loadModularFlow.ts` (+`.test.ts`) | **stays** | the surviving loader |
| `survey/PhaseA.tsx` (+`PhaseA.test.ts`) | **edit then retire** | cut over from `loadFlow`→`loadModularFlow` (removes TODO(#410)); component retired once steps/manifest drives Phase A |
| `survey/PhaseF.tsx` | **edit then retire** | same cutover (removes TODO(#410)) |
| `survey/IdentityLite.tsx` (+`IdentityLite.test.ts`) | **edit then retire** | same cutover (removes TODO(#410)) |
| `survey/PhaseB.tsx` | **stays/retire** | already on modular loader; subsumed by steps/manifest in P4 |
| `survey/loadFlow.ts` (+`loadFlow.test.ts`) | **DELETE (P3, beyond #410)** | legacy full-YAML parser; removed only after A/F/identity-lite cut over |
| `content/flows/phase_a_identity.yaml`, `phase_b_characters.yaml`, `phase_f_helpdocs.yaml`, `identity_lite.yaml` | **DELETE (P3, beyond #410)** | legacy full flows |
| `content/flows/*.modular.yaml` | **stays** | thin manifests consumed by `loadModularFlow` |
| `content/flows/_examples/*` | **stays** | example/test fixtures |

### flowmap → dashboard

| Current | Action | Destination |
|---|---|---|
| `flowmap/FlowMapView.tsx` (+`.test.tsx`) | **move/rename** | `dashboard/DashboardView.tsx`; reads `steps/manifest.ts` (not YAML) |
| `flowmap/buildFlowGraph.ts` (+`.test.ts`) | **rewrite** | `dashboard/buildStepGraph.ts`; consumes manifest, surfaces `inputs`/`writes` |
| (completeness) | **new** | `dashboard/completeness.ts` — reachable-path check |
| `flowmap/FlowGraphView.tsx`, `ScriptRoutingView.tsx`, `StrategyTreeView.tsx`, `buildScriptRouting.ts`, `flowUtils.ts`, `layout.ts`, `model.ts`, `tokens.ts` | **move** | `dashboard/*` (rendering helpers reused) |

### unchanged (shape)

`stores/*` (incl. `workingCopyStore.ts`, `debugPinsStore.ts`), `hooks/*`,
`lib/*` (except `galleryTheme.ts` → `ui/theme.ts`), `lint/*`, and the residual
`components/*` (BaseKeyboardPicker, DiagnosticsPanel, KmnEditor, MetadataCard,
OSKFrame, OskModeToggle, OutputScreen, PickerPane, PreviewPaneOverlay,
PreviewScreen, PreviewShell, ResizeHandle, SignUpPanel, UnsupportedScriptStub,
previewOutputLayout.ts) — these **stay** but refactor onto `ui/`.

---

## 6. Phased execution

Each phase is **independently shippable.** The #410 relationship is called out
per phase. (#410 is OPEN/reopened, "feat(studio): modular survey questions…":
AC#1 per-question modules = done; AC#2 debug pin store = done — see
`stores/debugPinsStore.ts`; AC#3 two Playwright E2E lanes = blocked/unchecked.
#410 branches off PR #409 and rebases onto `main` when #409 merges.)

### P0 — Dashboard-honest flow map

Make the flow map read what actually runs. Minimal: point `buildFlowGraph` at the
live registry/modular manifests for Phase B, and stub the gallery/wizard-step
nodes so they at least appear. Establishes the "map == runtime" principle before
the bigger moves.
*Relation to #410:* none directly; unblocks honest verification of #410's modules.

### P1 — `ui/` primitive library extraction

Create `ui/`, migrate `QuestionField.tsx` and the five wizard-step components onto
it, fold `lib/galleryTheme.ts` into `ui/theme.ts`. Pure refactor; no behavior
change. Set up dependency-cruiser rules so `ui/` is a leaf.
*Relation to #410:* none; net-new beyond #410.

### P2 — Folder-per-question opt-in + declared `inputs`/`writes`

Add `inputs`/`writes` to `QuestionModule` and populate all 93 modules. Convert
the handful of modules with companion artifacts to the `<id>/index.ts` + `extras/`
form. Registry keeps resolving by `definition.id`.
*Relation to #410:* net-new beyond #410 (folder-per-question is not in #410's AC).

### P3 — Finish #410 A/F/identity-lite cutover, then retire legacy YAML

(a) **#410 tail:** cut `PhaseA.tsx`, `PhaseF.tsx`, `IdentityLite.tsx` from
`loadFlow` to `loadModularFlow`; remove the TODO(#410) markers; land the two
Playwright E2E lanes (AC#3). (b) **Follow-up beyond #410:** delete
`survey/loadFlow.ts` and `content/flows/phase_*.yaml` / `identity_lite.yaml`.
Keep (a) and (b) as separate commits/PRs so #410 can close on (a).
*Relation to #410:* (a) **closes** #410's remaining ACs; (b) is the explicit
out-of-#410 follow-up.

### P4 — `steps/manifest.ts` unification + manifest-driven ordering

Build `steps/` (types, manifest, the two register adapters). Move galleries →
`editors/gallery/` and wizard panels → `editors/panels/`, registering each as a
step. Replace the hardcoded `SurveyStage` union in `StudioShell.tsx` with manifest
reads. Repoint the dashboard at the manifest. After this, **map == runtime by
construction.**
*Relation to #410:* net-new beyond #410.

### P5 — KeyboardIR `mutate` seam + touch propagation

When the engine mutation contract (#5b / #232) lands: implement
`QuestionModule.mutate`, wire surface-parameterized carve/add to write through it,
and implement touch propagation/merge using the per-key provenance reserved in
P4. Until #5b/#232 land, this phase **does not start** — `inputs`/`writes` already
power the dashboard without it.
*Relation to #410:* fully out of #410; gated on #5b/#232.

---

## 7. Open decisions / risks

- **dependency-cruiser boundaries.** Adding `ui/`, `steps/`, `editors/`, and
  `dashboard/` requires new rules in `.dependency-cruiser.cjs`. Intended layering:
  `ui/` is a leaf (no deps on `survey/`/`steps/`/`stores/`); `steps/` may depend on
  `survey/` (registry) and `editors/`; `dashboard/` reads `steps/` only. Risk: the
  gallery still leans on `lib/irToCarveNodes.ts` and `stores/workingCopyStore.ts`
  — confirm those edges are allowed before moving files.
- **Strict-TS explicit extension imports.** The repo uses Bundler resolution with
  **explicit `.ts`/`.tsx` import extensions** (e.g. `import … from "../types.ts"`
  in `registry.ts`). Every move/rename must update import specifiers including the
  extension; folder-per-question (`<id>/index.ts`) must be imported as
  `…/<id>/index.ts`. Automated codemods must preserve extensions.
- **The `mutate` seam gates on #5b / #232.** `inputs`/`writes` are declared data
  and ship in P2 regardless, but no IR is actually written until the engine seam
  exists. Risk: declaring `writes` paths that later don't match the real
  `keyboard-ir.ts` shape — mitigate by typing `IRPath` against
  `packages/contracts/src/keyboard-ir.ts` so drift is a type error.
- **Touch provenance correctness.** If provenance is added late (P5) rather than
  reserved in P4, existing touch edits won't carry provenance and the first
  propagation could clobber them. Mitigate by reserving the field in P4 and
  defaulting pre-existing touch keys to `touch-manual`.
- **Verification during migration.** P0 must land first so every later phase can
  be checked against an honest dashboard; otherwise regressions in ordering or
  reachability are invisible.
- **Naming churn.** `editors/` and `dashboard/` are proposals; renaming touches
  many imports. Decide names before P4 to avoid a second rename pass.
```
