# Survey Modularity + CYOA Refactor — Plan / RFC

> **Status: PLAN / RFC — P2 implemented (branch `claude/survey-modularity-cyoa-plan-pcpg9a`); P0–P1, P3–P5 remain proposals.**
> P2 shipped: `IRPath` typed key-path algebra exported from `@keyboard-studio/contracts`
> 0.11.0 (breaking bump, §18-ratified); `QuestionModule.inputs`/`writes` declared across
> all 93 modules (8 non-empty, 85 explicit empty); three CI gates (coverage, orphan-input
> lint, missing-mirror check); mirrored test tree at
> `packages/studio/tests/survey/questions/`; `mutate()` remains a stub (deferred to P5).
> All other phases are still proposals; file inventories and target tree below remain
> unimplemented. File inventories were verified against the live tree on the branch base
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
  the (not-yet-built) engine mutation seam. These are typed against the **`IRPath`
  type** (§3.3) — a typed path algebra over the nested `KeyboardIR` union, shipped
  in P2 and exported from `@keyboard-studio/contracts`.
- A single **`steps/` model + `steps/manifest.ts`** that unifies questions,
  hand-built wizard steps, and galleries as ordered "steps." `StudioShell` and
  the flow map both read this manifest, so **map == runtime by construction**.
- A **CYOA structure** of a spine, side trails, and reversible lock gates.
- A **shared assignment-loop shell** so the touch surface gets the same
  familiar carve+add UX as physical (one `ui/` kit, surface-parameterized
  chrome) while keeping **separate behaviors underneath** (physical =
  keys/AltGr/dead keys; touch = layers/long-press/flick/multitap), plus a
  **net-new `touchSuggest`** physical→touch generator, with **per-key
  provenance** reserved for future propagation.
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
  `inputs`/`writes` are declared *now*; `mutate()` runs *later*. **The four-forms
  problem is NOT fully closed by P4.** P4 unifies *ordering and the map* (one
  manifest, one runtime path). The deeper **state fork** — answers flowing to
  `workingCopyStore` as `SurveyPhaseResult` vs. galleries mutating `KeyboardIR`
  directly — **persists until P5**, when the `mutate` seam (gated on #5b / #232)
  finally unifies the two into one write surface.
- **Deleting the legacy YAML loader.** #410 scopes out "replacing the YAML
  loader." Retiring `content/flows/*.yaml` + `parseFlow` is a follow-up *beyond*
  #410 (see Phase P3).
- **Deleting unintegrated-but-vetted question modules.** Authored questions that
  no flow manifest references are **NOT** deleted — they become the **question
  library** (§3.8); only redundant *delivery forms* of a question are removed.
- **The dev-only interactive flow-map editor.** The interactive authoring UI on
  the flow map (reorder steps, edit constraints, promote library questions, with
  manifest write-back) is UI-heavy and **out of scope**, deferred to its own
  speckit feature request — see
  [`specs/009-flow-map-editor/spec.md`](../specs/009-flow-map-editor/spec.md)
  (Decided 2026-06-26, see §3.7). The **read-only** flow map remains in scope as
  **P0** (the dashboard-honest flow map).

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
       script_not_supported_stub.ts, writing_direction.ts   (tests live in a mirrored tree — see §4)
  b/   (Phase B characters — RUNTIME TRUTH today; 55 modules)
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
       pb_use_case.ts   (tests live in a mirrored tree — see §4)
  f/   (Phase F help docs — modules EXIST but are NOT runtime truth yet)
       pf_contact_info.ts, pf_credits.ts, pf_usage_tip_1.ts … pf_usage_tip_5.ts,
       pf_welcome_paragraph.ts   (tests live in a mirrored tree — see §4)
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

> **Manifest-name reconciliation (important).** The manifest names written in the
> code's `TODO(#410)` markers — `phase_a.modular.yaml`, `phase_f.modular.yaml`,
> `identity_lite.modular.yaml` — are **aspirational**, not the files on disk. The
> real, existing thin manifests are **`phase_a_identity.modular.yaml`**,
> **`phase_b_characters.modular.yaml`**, and **`phase_f_helpdocs.modular.yaml`**
> (these are the accurate current-state filenames on disk today). Critically,
> **`identity_lite.modular.yaml` does NOT exist yet** — identity-lite has only its
> full-YAML form (`identity_lite.yaml`); the thin modular manifest for it **must be
> created in P3** as part of the cutover. References to these names in §3 / §5 / §6
> reflect this reconciliation.
>
> **Target names follow the functional labels (Decision 2026-06-26).** Now that the
> sequential A–G vocabulary is retired (§3.5), the *target/aspirational* manifest
> names switch to their **functional** equivalents: `phase_a.modular.yaml` →
> **`identity.modular.yaml`**, `phase_f.modular.yaml` → **`helpdocs.modular.yaml`**,
> and `phase_b_characters.modular.yaml`'s target form → **`characters.modular.yaml`**
> (rename direction: from phase-letter target names *to* functional names). This is
> the renaming the cutover should land. It does **NOT** change the factual
> current-state above: the on-disk files are still
> `phase_a_identity.modular.yaml` / `phase_b_characters.modular.yaml` /
> `phase_f_helpdocs.modular.yaml`, and the `TODO(#410)` markers in the code still
> reference `phase_a.modular.yaml` — those existing names/markers stay accurate as
> descriptions of what exists today and will simply be renamed under the functional
> scheme when the cutover runs.

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
  /** Declared dependency graph — see §3.3. `IRPath` shipped in P2 (`@keyboard-studio/contracts`). */
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

/**
 * EditorStepProps — a SUPERSET of every editor's current prop needs, so the
 * differing gallery/panel signatures (Carve, Mechanism, Touch, the 5 wizard
 * panels) all satisfy one type behind the manifest. Side effects are NOT a
 * component concern: each editor calls `onComplete(result)` and the
 * manifest-level reducer (§3.4) performs the side-effecting transition.
 */
interface EditorStepProps {
  onComplete: (result: unknown) => void;   // hands result to the manifest reducer
  onBack: () => void;
  ctx: SurveyContext;                       // shared survey/identity context
  // surface, baseKeyboard, and other per-editor props are narrowed by adapters.
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
`steps/`, and `stores/` so dependency-cruiser can enforce it as a leaf (see §8).

### 3.3 Question contract: declared `inputs` / `writes`

> **Versioning (ratified §18 joint engine+content session, 2026-06-26).** Adding
> `inputs`/`writes`/`IRPath` to the `QuestionModule` contract is a **MAJOR version
> bump to `packages/contracts`** — **not** an additive-minor change shippable
> independently. The §18 joint engine+content session ratified that these contract
> additions (here and the `TouchKeyIR` provenance tag in §3.6) move
> `packages/contracts` to a new major version and are gated on that bump, rather
> than being treated as backward-compatible minor additions that any consumer can
> absorb silently.

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

#### `IRPath` — designed and shipped in P2

`IRPath` ships in `packages/contracts/src/ir-path.ts`, re-exported from
`@keyboard-studio/contracts`. `packages/contracts/src/keyboard-ir.ts` is a **nested
interface tree** (`KeyboardIR` → `groups[]`/`stores[]` for physical;
`touchLayout?.platforms[].layers[].rows[].keys[]` for touch — `TouchLayoutIR`
ratified at #232); `IRPath` is the typed key-path algebra over that tree. The
original acceptance criteria from P2 are recorded here for traceability:

- **Design AC.** `IRPath` derives a typed path over the nested `KeyboardIR` union,
  covering both surfaces — including the deep touch path
  `touchLayout.platforms[].layers[].rows[].keys[]` — such that an invalid path is
  a **compile error**, not a runtime miss. (Mechanism is open: a template-literal
  path-string type, a typed key-path tuple, or a generated lens set — to be chosen
  in P2.)
- **Drift AC.** A `writes` path that does not correspond to a real location in
  `keyboard-ir.ts` fails typecheck (this is what guards against declaring paths
  that won't match the real IR shape — see §8).
- **Write-surface AC.** A **unit test** asserts that every strategy-bearing
  question's declared `writes` match its `Pattern.strategyId` write surface
  (the IR locations that strategy actually populates), so declared `writes` and
  the strategy's real effect cannot silently diverge. The strategy write surface
  is **no longer unknowable/uncontracted**: the typed **§7.7 assignment-map
  contract is ratified (§18 joint engine+content session, 2026-06-26)** and is
  being built **incrementally ("along the way")** — the gallery's flat
  `selectedPatternIds` is migrating to the typed assignment map, which *is* the
  strategy write surface this AC cross-checks. The Write-surface AC is therefore
  **buildable**; it lands **as/once the §7.7 typed write-surface becomes
  available**, sequenced alongside that work — it is **not** blocked waiting on a
  separate joint session or a yet-to-be-defined contract.

### 3.4 Manifest-driven ordering

`StudioShell.tsx` (specifically its `SurveyView` component) stops hardcoding the
`SurveyStage` union and instead reads stage order from `steps/manifest.ts`. The
flow map renders the **same** manifest. Because both read one source, **map ==
runtime by construction** — the central fix for the "stale flow map" problem.

**Side effects go through a manifest-level `onComplete` reducer, not the
components.** Today `SurveyView` carries side-effecting transitions inline — e.g.
`lockDesktop()` and the `buildTouchLayoutJson` block on Phase E completion, plus
the copy/adapt branch. When ordering moves to the manifest, those transitions
move to a single manifest-level reducer that runs on each step's `onComplete`,
keyed by step id. Editor components stay pure (`EditorStepProps.onComplete`),
the reducer owns lock toggles, touch-layout building, and branch routing. This
is what makes P4 a real rewrite of `SurveyView` rather than a config swap (see
§6 P4a/P4b).

### 3.5 CYOA structure: spine, side trails, locks

- **SPINE** — the main story. Because the project starts from a working base
  template, **every prefix of the spine is a valid stopping point** (you always
  have a shippable keyboard).
- **SIDE TRAILS** — branch on an answer and **must rejoin the spine**. Encoded by
  `definition.next` routing plus `spine: false` on the step.
- **LOCK gates** — reversible checkpoints. Breaking a lock marks
  **downstream-derived state stale** via the `inputs`/`writes` dependency graph
  (§3.3).

#### Completeness / staleness model (precise)

The staleness/completeness logic is more than a one-hop intersection. It is
defined by three distinct invariants:

1. **Staleness = transitive closure to a fixpoint.** Re-opening a step
   invalidates not just steps whose `inputs` directly intersect its `writes`, but
   everything reachable along the `writes → inputs` edge relation, iterated to a
   **fixpoint** (a step goes stale, its own `writes` then invalidate *its*
   dependents, and so on). One-hop intersection is **insufficient** — a downstream
   step two or more edges away would be missed. The closure must be computed
   transitively until no new step is added.
2. **NO-CYCLE invariant (acyclicity).** The fixpoint above only terminates and
   only yields a sensible "downstream" if the `writes → inputs` graph is
   **acyclic**. Completeness logic therefore checks acyclicity explicitly and
   reports a cycle as a hard error (a cycle means "A depends on B depends on A",
   which has no valid staleness ordering).
3. **Side-trail rejoin invariant (`joinTarget`).** `definition.next`
   (`string | null | FlowGotoRule[]`) alone **cannot** guarantee that a side trail
   returns to the spine. So every `spine: false` chain carries an explicit
   `joinTarget` (the spine step it rejoins), and a **reachability check** verifies
   that the terminal `next` of every side-trail chain lands on a `spine: true`
   step — no side trail may dead-end or leak off-spine.

These are **distinct from** the spine-prefix shippability invariant below, and
each is its own check in `dashboard/completeness.ts`.

> **Net-new store slice.** Tracking which steps are currently stale is **new
> mutable state**: this implies a **net-new `staleness` slice in
> `stores/workingCopyStore.ts`** (the closure result, recomputed when a lock is
> broken or a step is re-answered). It is reserved/added when the staleness logic
> lands; pre-existing state defaults to "fresh."

> **Decided 2026-06-26:** retire the sequential A–G phase vocabulary in favor of
> functional labels (Identity, Characters, Carve, Mechanisms, Lock, Reorder,
> Desktop-OSK, Touch, Help, Package); the A→B→F gaps proved the alphanumeric
> scheme misleading. The functional spine order is **Identity → Characters →
> Carve → Mechanisms → Lock → Reorder → Desktop-OSK → Touch → Help → Package**.
> Note the critical fix this resolves: the old vocabulary mislabeled physical
> carve as "Phase D" and physical add as "Phase C mechanisms," but the old spec's
> Phase D actually meant OSK-desktop — under functional labels these become
> **Carve** and **Mechanisms**, removing the conflict.

**Spine order** (mirrors the `StudioShell` stages):

1. language metadata / identity (Identity)
2. choose base keyboard
3. define alphabet / needed keys (Characters)
4. physical carve — remove unneeded base elements (Carve)
5. physical add — place your items (Mechanisms)
6. 🔒 **physical lock** (Lock)
7. touch carve + touch add (Touch)
8. 🔒 **touch lock**
9. documentation (Help)
10. publish *(reserved; out of scope — see §1)* (Package)

#### Spine-prefix shippability (a DISTINCT invariant)

Separately from staleness and rejoin, the plan asserts **spine-prefix
shippability**: because the project starts from a working base template, **every
prefix of the spine yields a valid keyboard.** This is a distinct invariant tied
to the **validity / criteria gate** — it asks "does stopping here produce a
keyboard that passes the validity criteria?", which is **not** the same question
as "are this step's `inputs` satisfiable when it is reached?" (an
inputs-satisfiability check). The completeness checker enforces both, separately:
a spine prefix can have all inputs satisfiable yet still fail the validity gate,
and vice versa.

### 3.6 Carve/add shell, separate surface behaviors, and `touchSuggest`

**This is NOT a 3-into-1 gallery merge.** The earlier "surface-parameterized
3-into-1 gallery merge" idea is **rejected** (km-lead review + Matt + Cooper Abla,
who owns the galleries, agree it over-abstracts). The correct decomposition is
**three pieces**:

1. **A shared assignment-loop SHELL + `ui/` kit.** The familiar "pick a character,
   choose how it's reached" UX, **surface-parameterized** (chrome, layout, the
   loop itself). This is what is shared.
2. **SEPARATE behaviors underneath.** Physical and touch do **different things**
   and keep their own logic: physical = keys / AltGr / dead keys; touch = layers /
   long-press / flick / multitap. The shell hosts whichever behavior set the
   surface needs — it does **not** collapse them into one component.
3. **A NET-NEW `touchSuggest` physical→touch generator.** It translates physical
   access decisions into *proposed* touch methods the user can accept or override
   (see the dedicated subsection below).

**Carve stays its own remove-mode component**, sharing only the `ui/` kit. It is
**not** folded into the add-gallery sharing — `MechanismGallery`/`TouchGallery`
(add) and `CarveGallery` (remove) are different modes, and carve keeps its
identity.

The base template ships **both** a physical layout and a touch layout, so **touch
also has carve+add.** Touch keyboards are **inherently built on the physical
layout files + context rules**, which **compile into the touch keyboard's JS** —
the physical layout is a **mandatory substrate**, not an optional or independent
sibling. Touch is therefore always a **derivation/seed from the locked physical
layout**: it is **seeded** from the physical-derived base (the base touch layout
together with the locked physical edits), then refined with **additional
touch-specific detail layered over that physical-derived substrate** (layers,
long-press popups, key sizing). That touch-specific detail is layered **on top of**
the physical-derived base — it is **not** a set of decisions independent of, or
invisible to, physical.

> **Why Decision 6 holds (the architectural reason).** A touch keyboard with **no
> physical layout defined breaks the moment a Bluetooth keyboard is attached** to a
> touch device: Keyman falls back to the physical layout files, and if they aren't
> defined it becomes **impossible to use Keyman with a Bluetooth keyboard on that
> device.** This is the real reason touch cannot be authored independently of
> physical, and why the spec's locked **Decision 6** stands — **no touch-first
> authoring and no reverse touch→physical derivation in v1**; touch is seeded from
> the locked physical layout, never the other way around.

The future "auto-update touch when physical changes" is therefore a
**propagation/merge over the physical-derived substrate, not a re-projection.**

#### The `touch_seed_source` CYOA fork (touch-phase entry)

The touch phase **opens with a CYOA fork that rejoins the spine**, `touch_seed_source`.
The user chooses how the touch surface is seeded:

- **(A) Start from the base touch layout, then carve + add.** Here `touchSuggest`
  acts as **proposed edits layered onto the existing base layout** (the "how/when
  to apply" case). That base touch layout is itself **physical-derived** (it ships
  alongside, and compiles from, the physical layout substrate).
- **(B) Start from a generated proposed layout** that `touchSuggest` **builds from
  the physical decisions**, then refine.

Both branches **seed from a physical-derived layout** (consistent with Decision 6)
and **converge on the SAME carve/add shell.** They differ only in (a) the initial
touch IR state (seed) and (b) whether the mapper *generates* the layout vs.
*proposes changes* onto an existing one. **Don't fork the UI, just the seed.** As
a `spine: false` fork it carries a `joinTarget` back to the touch
carve/add spine step (§3.5 rejoin invariant).

#### Per-key provenance

Each touch key carries a provenance tag — **`base-derived`** (came from the base
touch layout), **`physical-suggested`** (proposed by `touchSuggest` from a
physical decision), or **`hand-set`** (a manual touch edit). Suggestions only
ever touch keys that are **not** `hand-set`; a later physical change re-suggests
only the **derived** keys (`base-derived` / `physical-suggested`) and **never
clobbers manual edits.** Provenance is what makes cycle-back re-propagation safe
and is essential to the seed fork above.

> **Plan the provenance seam now, build later.** Reserve the per-key provenance
> tag on the touch surface so P5 propagation has somewhere to land; pre-existing
> touch keys default to `hand-set` (conservative — never auto-overwritten). No
> propagation logic is built until P5. **Versioning:** adding this per-key
> provenance tag to `TouchKeyIR` is part of the **MAJOR version bump to
> `packages/contracts`** ratified at the §18 joint engine+content session
> (2026-06-26) — it is **not** an additive-minor change shippable independently of
> that bump. Reserving the tag is sequenced with the major-version release; only the
> propagation *logic* waits for P5.

#### `touchSuggest` — a DEFAULT ADAPTATION POLICY (defaults, not rules)

`touchSuggest` produces a touch-**adaptation** pass, not a per-key lookup. Its
explicit goal is to **beat Keyman Developer's current wholesale import**, which
imports each modifier (Alt / RAlt / Ctrl / Shift) as its **own layer** —
functional, but poorly adapted to touch. `touchSuggest` is a constraint-aware
generator.

**DEFAULTS, NOT RULES.** Everything it produces is **user-overridable at two
levels**: **per-key** (change a single key's placement/gesture) and
**policy-level** (tune the preferences themselves — width budget,
prefer-flick-vs-long-press, etc.). **The generator proposes; the user disposes.**
This is framed as **assistance, not automation.**

**v1 default policy:**

1. **Width budget ~10–11 keys/row** (Keyman guidance). Wide physical rows are
   **reflowed/repartitioned**, not copied 1:1.
2. **Number row / numeric sections → a symbol (or numeric) layer** (touch
   convention).
3. **Modifiers: consolidate, don't replicate.** Demote low-frequency modifier
   content to **long-press** on the related base key, group symbol-ish content
   into the symbol layer, and **reserve a real layer only where volume justifies
   it** — the opposite of Keyman's one-layer-per-modifier import.
4. **Dead key → LONG-PRESS ON THE BASE.** For each physical dead-key combo
   `deadkey + base = output`, append `output` to the **base character's**
   long-press popup — the **host is the base letter, NOT the dead key**. E.g.
   `;` + `a` = ɛ → long-press `a` yields ɛ. **Aggregation:** all dead-key outputs
   deriving from the same base merge into **one** long-press popup on that base
   (e.g. à / á / â / ɛ all hang off `a`), ordered by frequency — standard touch
   accent-popup behavior, collapsing many physical dead-key sequences into a few
   clean popups. **Edge cases:** (i) chained dead keys (the base is itself a
   dead-press); (ii) a dead-key output whose base isn't on the touch base layer
   (the popup hangs off wherever that base landed).

**Long-press is the DEFAULT for all alternates; FLICK is opt-in only.** Long-press
is the default gesture for **both** same-character variants **and** the menu of
distinct/derived options (the accent/dead-key popup). **Flick** is an **advanced,
opt-in-only** alternative the user can *add* (e.g. for closely-related variants
where a quick directional swipe feels natural) — it is **never a default** and
**never the sole way to reach a character**: a long-press fallback is always kept
so nothing is stranded behind an advanced gesture.

**Architecture: defaults as data.** The policy is a **declarative config**
`touchSuggest` reads — **extensible without touching the gallery.** Each generated
key carries **both** its provenance **and the specific default that produced it**
(explainable "why this key is here" + overridable; a later physical change re-runs
**only** the affected defaults).

### 3.7 Dashboard (flow map becomes the index)

The flow map (`flowmap/`) graduates from a stale viewer into the **dashboard /
index**, reading `steps/manifest.ts`. It shows, per step:

- **input requirements** (from `inputs`)
- **KeyboardIR mutations** (from `writes`)
- **branching** (from `definition.next` / side-trail metadata)
- a **completeness check across all reachable paths**, surfacing the distinct
  invariants of §3.5: transitive staleness closure, graph acyclicity, side-trail
  rejoin (`joinTarget` reachability), spine-prefix shippability (validity gate),
  and inputs-satisfiability — flagging unreachable steps, off-spine dead-ends,
  cycles, and unsatisfiable `inputs`.

The **read-only** flow map / viewer is **core to this refactor** and is the
dashboard-honest flow map shipped as **P0** (§P0 below) — the prerequisite the
later phases build on. It reuses existing UI; no new authoring UI is built here.

#### Dev-only interactive editor: DEFERRED — separate speckit feature (Re-scoped 2026-06-26)

An earlier note (2026-06-26) folded a **dev-only interactive editor** into the
dashboard — letting a developer reorder steps, edit constraints (locks, spine /
side-trail placement, branch conditions), and promote library questions (§3.8)
into the flow by direct manipulation, with edits writing back to the flow
manifest (`content/flows/*.modular.yaml`) as a reviewable git diff. **That
interactive editor is UI-heavy and is now explicitly deferred — it is NOT built
as part of this refactor** (Decided 2026-06-26, Matthew Lee). It is carved out
into a separate, detailed feature request: see
[`specs/009-flow-map-editor/spec.md`](../specs/009-flow-map-editor/spec.md). The
refactor ships only the **read-only** flow map (P0) and reuses existing UI; the
editor is the heavy, deferred piece.

### 3.8 Question library / reserve — preserve, don't delete (Decided 2026-06-26)

Not every authored question is wired into the live flow, and **that is
intentional.** Many Phase A / Phase B modules — **especially the non-Roman-script
research** (scripts, input methods, IME / keymap considerations) — are vetted and
useful but referenced by **no flow manifest today.** Unification must **preserve**
them, never delete them.

This falls out of the architecture for free. A question is "in the flow" **only
if a flow manifest references its `definition.id`** (§3.4). A registered
`QuestionModule` that no manifest references is therefore a **library / reserve**
entry — present, type-checked, test-covered, browsable in the dashboard (§3.7),
but **inert at runtime.** This is the **building-block catalog**: questions we can
later promote into the CYOA spine or a side trail by adding a manifest reference,
with **no code-rescue required.**

**Invariants:**

- **No-delete.** Migration (P3's legacy-YAML deletion especially) removes
  redundant *delivery forms* of a question, **never the question's research /
  content.** A module is deleted **only** when its content is provably duplicated
  by a surviving module. **Non-Roman-script research is explicitly out of scope
  for deletion.**
- **Library modules still compile and test.** Reserve modules carry the same
  per-question unit tests (§7) so they don't rot; they are excluded **only** from
  flow integration / E2E (which run the manifest, not the full registry).
- **Discoverable.** The dashboard (§3.7) surfaces reserve modules as a distinct
  "library / not-in-flow" set so they are findable as building blocks rather than
  buried.
- **Promotable.** Moving a library module into the flow is a **manifest edit**
  (add its id to a phase manifest), **not a rewrite.**

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
    types.ts                   # StepKind, QuestionStep, EditorStep, EditorStepProps,
                               #   IRPath (typed path over KeyboardIR, shipped P2 — §3.3)
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
      # per-question tests are NOT colocated here — they live in the mirrored
      #   tree under packages/studio/tests/survey/questions/ (see below + §7)

  editors/                     # (NEW) editor-step components (former galleries + panels)
    assignLoop/                # shared assignment-loop SHELL (§3.6 piece 1)
      AssignLoopShell.tsx      # surface-parameterized "pick char, choose access" loop
      surfaceAdapter.ts        # physical (groups/stores) vs touch (touchLayout?)
      physicalBehavior.ts      # physical = keys / AltGr / dead keys (§3.6 piece 2)
      touchBehavior.ts         # touch = layers / long-press / flick / multitap
      provenance.ts            # (NEW) per-key provenance: base-derived | physical-suggested | hand-set
      parts/                   # former components/carve/ subtree (shared chrome)
        DepBanner.tsx GlyphCell.tsx InfoView.tsx (+ .test) Inspector.tsx
        KeyCap.tsx KeySeq.tsx KindBadge.tsx Rail.tsx StatusBar.tsx
        ToggleBox.tsx carveShared.tsx
      IntroSplash.tsx (+ .test) PreviewPane.tsx
      *.test.tsx
    carve/                     # carve stays its OWN remove-mode component (shares ui/ only)
      CarveGallery.tsx (+ .test)
    touchSuggest/              # (NEW) physical->touch generator (§3.6 piece 3)
      touchSuggest.ts          # constraint-aware generator; proposes, never dictates
      defaults.ts              # DEFAULTS-AS-DATA: declarative adaptation policy
      touchSuggest.test.ts
    panels/                    # former hand-built wizard steps (Form 3)
      TrackStep.tsx ProjectNameStep.tsx ScaffoldForm.tsx
      TrackOneIdentityPanel.tsx (+ .test) BaseResolution.tsx (+ .test)

  dashboard/                   # (NEW; absorbs flowmap/) the index/dashboard
    DashboardView.tsx          # was FlowMapView.tsx; reads steps/manifest.ts
    buildStepGraph.ts          # was buildFlowGraph.ts; consumes manifest not YAML
    completeness.ts            # (NEW) transitive-closure staleness + acyclicity +
                               #   rejoin + spine-prefix shippability checks (§3.5)
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

  stores/   hooks/   lib/   lint/        # lib/galleryTheme.ts folds into ui/theme.ts;
                                          #   stores/workingCopyStore.ts gains a NET-NEW
                                          #   `staleness` slice (§3.5)

# Per-question tests live in a MIRRORED tree (sibling of src/, NOT colocated):
packages/studio/tests/                   # mirror root for per-question tests
  survey/questions/                      # mirrors src/survey/questions/ one-for-one
    a/  <id>.test.ts                      # mirrors src/survey/questions/a/<id>.ts
    b/  <id>.test.ts                      # mirrors src/survey/questions/b/<id>.ts
    f/  <id>.test.ts                      # mirrors src/survey/questions/f/<id>.ts
    # mirror path is DERIVED from the source path; a question can graduate to the
    #   <id>/index.ts + extras/ form (§3.3) without dragging its test into src/.
    #   "every question has a test" becomes a single directory-diff CI check (§7).
```

> The `editors/` and `dashboard/` names are proposals; the key decisions are the
> *grouping* (galleries+panels become editor-steps; flowmap becomes the
> manifest-driven dashboard), not the exact folder names.

---

## 5. File-by-file migration listing

Actions: **stays**, **move**, **rename**, **split**, **new**. Verified current
paths; destinations are proposals. (Colocated `*.test.*` files for non-question
components move with their subject unless noted. **Per-question** `*.test.ts`
files are the exception: they move OUT of the source tree into the mirrored test
tree under `packages/studio/tests/survey/questions/` — see the reshape table
below and §4 / §7.)

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

### components (Form 4 galleries) → `editors/` (shared shell, separate behaviors)

**Not a 3-into-1 merge (§3.6).** The add galleries share the assignment-loop
**shell**, but keep separate physical/touch **behaviors**; **carve stays its own
remove-mode component**, sharing only `ui/`.

| Current | Action | Destination |
|---|---|---|
| `components/MechanismGallery.tsx` (+`.test.tsx`) | **move/refactor** | `editors/assignLoop/AssignLoopShell.tsx` (physical "add" behavior via `physicalBehavior.ts`) |
| `components/TouchGallery.tsx` (+`.test.tsx`) | **move/refactor** | same shell, touch "add" behavior via `touchBehavior.ts` (layers/long-press/flick/multitap) |
| `components/CarveGallery.tsx` | **move** | `editors/carve/CarveGallery.tsx` — **stays its own** remove-mode component (shares `ui/` only; NOT folded into the shell) |
| `components/carve/*` (DepBanner, GlyphCell, InfoView(+test), Inspector, KeyCap, KeySeq, KindBadge, Rail, StatusBar, ToggleBox, carveShared) | **move** | `editors/assignLoop/parts/*` (shared chrome, used by shell + carve) |
| `components/GalleryIntroSplash.tsx` (+`.test.tsx`) | **move/rename** | `editors/assignLoop/IntroSplash.tsx` |
| `components/GalleryPreviewPane.tsx` | **move/rename** | `editors/assignLoop/PreviewPane.tsx` |
| `lib/irToCarveNodes.ts` (+tests) | **stays** | shared helper bound by the gallery/shell; remains in `lib/` (the `editors/ → lib/` edge must be **explicitly allowed** — see §8) |
| (touch surface IR) | **new** | `editors/assignLoop/provenance.ts` — per-key provenance (`base-derived` / `physical-suggested` / `hand-set`), reserved (§3.6) |
| (physical→touch mapper) | **new** | `editors/touchSuggest/touchSuggest.ts` + `defaults.ts` — net-new generator + defaults-as-data (§3.6) |

Galleries register as **`editor-step`s** (with `surface`) via
`steps/registerEditorSteps.ts`; physical carve/add and touch carve/add are four
manifest entries around the two lock gates. The `touch_seed_source` fork (§3.6)
adds a `spine: false` step at the touch-phase entry that rejoins via `joinTarget`.

### survey/questions reshape (flat default, folder opt-in)

| Current | Action | Destination |
|---|---|---|
| `survey/questions/<phase>/<id>.ts` (flat) | **stays** | unchanged for questions with no companion artifacts |
| any `<id>.ts` needing images/sample text/custom component | **split** | graduates to `survey/questions/<phase>/<id>/index.ts` + `extras/`; registry resolves by `definition.id` so both forms are identical to callers |
| all 93 modules | **edit** | gain declared `inputs`/`writes` (§3.3) |
| per-question `survey/questions/<phase>/<id>.test.ts` (currently colocated) | **move** | `packages/studio/tests/survey/questions/<phase>/<id>.test.ts` — mirrored tree, NOT colocated; mirror path derived from the source path (§4 / §7) |
| `survey/questions/registry.{a,b,f}.ts`, `registry.ts`, `registry.test.ts` | **stays** | merge pattern unchanged; resolution stays keyed on `definition.id` |
| `survey/types.ts` | **edit** | add `inputs`/`writes` to `QuestionModule`; `mutate` stays the documented stub |

### loaders / phase components (the #410 tail, then legacy retirement)

| Current | Action | Destination / Notes |
|---|---|---|
| `survey/loadModularFlow.ts` (+`.test.ts`) | **stays** | the surviving loader |
| `survey/PhaseA.tsx` (+`PhaseA.test.ts`) | **edit then retire** | cut over `loadFlow`→`loadModularFlow` on the existing `phase_a_identity.modular.yaml` (the TODO marker's `phase_a.modular.yaml` is aspirational); removes TODO(#410); retired once steps/manifest drives Phase A |
| `survey/PhaseF.tsx` | **edit then retire** | same cutover on the existing `phase_f_helpdocs.modular.yaml` (marker's `phase_f.modular.yaml` is aspirational); removes TODO(#410) |
| `survey/IdentityLite.tsx` (+`IdentityLite.test.ts`) | **edit then retire** | same cutover, BUT `identity_lite.modular.yaml` **does not exist yet** — it must be **created in P3** before this cutover; removes TODO(#410) |
| `content/flows/identity_lite.modular.yaml` | **new (P3)** | thin modular manifest for identity-lite; does not exist today (see §2 reconciliation) |
| `survey/PhaseB.tsx` | **stays/retire** | already on modular loader; subsumed by steps/manifest in P4b |
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

The phases are designed to be **shippable in order** — each lands cleanly on top
of the previous. They are **not** all independently shippable: in particular
**P0 is a hard prerequisite** for the later phases (it provides the honest
dashboard every later phase is verified against), not an optional standalone
improvement. The #410 relationship is called out per phase. (#410 is
OPEN/reopened, "feat(studio): modular survey questions…": AC#1 per-question
modules = done; AC#2 debug pin store = done — see `stores/debugPinsStore.ts`;
AC#3 two Playwright E2E lanes = blocked/unchecked. #410 branches off PR #409 and
rebases onto `main` when #409 merges.)

Phases now run **P0, P1, P2, P3, P4a, P4b, P5.** Each carries an
**acceptance-criteria + rollback + test-strategy** stub.

### P0 — Dashboard-honest flow map (PREREQUISITE)

Make the flow map read what actually runs. Minimal: point `buildFlowGraph` at the
live registry/modular manifests for Phase B, and stub the gallery/wizard-step
nodes so they at least appear. Establishes the "map == runtime" principle before
the bigger moves. **This is a prerequisite for every later phase**, not an
independent ship.
- **AC:** the map node set equals the live runtime step set for Phase B (no
  ghost/missing nodes); galleries + wizard steps appear as (stub) nodes.
- **Rollback:** revert `buildFlowGraph` to the YAML source; no other module
  depends on the change yet.
- **Test strategy:** snapshot the map node/edge set against the registry; assert
  every Phase B module id has a corresponding node.
- *Relation to #410:* none directly; unblocks honest verification of #410's modules.

### P1 — `ui/` primitive library extraction

Create `ui/`, migrate `QuestionField.tsx` and the five wizard-step components onto
it, fold `lib/galleryTheme.ts` into `ui/theme.ts`. Pure refactor; no behavior
change. Add the **net-new** dependency-cruiser leaf rule for `ui/` (none exists
today — see §8).
- **AC:** no visual/behavioral diff in existing components; `ui/` imports nothing
  from `survey/`/`steps/`/`stores/` (depcruise green).
- **Rollback:** revert the extraction commit; primitives are additive until
  call sites switch.
- **Test strategy:** existing component tests stay green unchanged; add a
  depcruise assertion for the `ui/` leaf rule.
- *Relation to #410:* none; net-new beyond #410.

### P2 — `IRPath` design + folder-per-question opt-in + declared `inputs`/`writes` — IMPLEMENTED

> **IMPLEMENTED** on branch `claude/survey-modularity-cyoa-plan-pcpg9a` (2026-06-26).
> `IRPath` typed key-path algebra (`packages/contracts/src/ir-path.ts`, re-exported
> from `@keyboard-studio/contracts` index) ships with `irPath()` and `formatIRPath()`.
> Invalid paths are compile errors; stale paths fail typecheck. Path coverage is bounded
> at `keys[]`; `RawKmnFragment` is terminal. `QuestionModule` (`packages/studio/src/survey/types.ts`)
> gained `inputs?: readonly IRPath[]` / `writes?: readonly IRPath[]`; all 93 modules now
> declare them (8 non-empty, 85 explicit empty). Three CI gates land: coverage (93/93),
> manifest-scoped orphan-input lint, missing-mirror check. Mirrored test tree at
> `packages/studio/tests/survey/questions/<phase>/<id>.test.ts` (all 93 mirrored).
> Folder-per-question opt-in is structurally supported; no module currently uses it.
> `mutate()` remains a stub (deferred to P5). `@keyboard-studio/contracts` bumped
> 0.10.0 → 0.11.0 (§18 breaking change, user-confirmed 0.11.0 under 0ver semantics).

**Design the net-new `IRPath` type** (§3.3) — a typed path over the nested
`KeyboardIR` union (incl. `touchLayout.platforms[].layers[].rows[].keys[]`). Add
`inputs`/`writes` to `QuestionModule` and populate all 93 modules. Convert the
handful of modules with companion artifacts to the `<id>/index.ts` + `extras/`
form. Registry keeps resolving by `definition.id`.

> **Contract-versioning gate (§18, 2026-06-26) — resolved.** Adding `inputs`/`writes`/`IRPath`
> to `QuestionModule` is a **MAJOR version bump to `packages/contracts`** ratified
> at the §18 joint engine+content session. P2 landed with the confirmed 0.11.0 bump
> (not 1.0.0 — user-confirmed 0ver semantics); it does not land as a silently backward-compatible addition.
- **AC:** `IRPath` makes an invalid path a compile error (Design AC, §3.3); a
  bogus `writes` path fails typecheck (Drift AC); the **unit test** asserting
  strategy-bearing questions' `writes` match their `Pattern.strategyId` write
  surface passes (Write-surface AC); all 93 modules carry `inputs`/`writes`.
- **How to verify the 93 declared-but-unexecuted inputs/writes are correct:**
  since `mutate()` does not run yet, correctness is checked **statically** — (1)
  `IRPath` typing rejects paths absent from `keyboard-ir.ts`; (2) the
  `writes`-vs-`strategyId` unit test cross-checks the strategy surface; (3) a
  manifest lint asserts each question's `inputs` are produced by some upstream
  step's `writes` (no orphan inputs).
- **Rollback:** `inputs`/`writes` are optional fields at the type level, so a
  revert leaves modules structurally valid and `IRPath` (type-only) reverts to
  looser typing — but note this is a rollback *within* the major-version line, not
  evidence that the addition is a freely-absorbable minor change: the contract
  addition itself is the **major bump** (§18, 2026-06-26) and consumers must adopt
  the new major version.
- **Test strategy:** the three ACs above are CI gates; per-module fixtures assert
  declared paths parse under `IRPath`.
- *Relation to #410:* net-new beyond #410 (folder-per-question + `IRPath` are not
  in #410's AC).

### P3 — Finish #410 A/F/identity-lite cutover, then retire legacy YAML

(a) **#410 tail:** cut `PhaseA.tsx`, `PhaseF.tsx`, `IdentityLite.tsx` from
`loadFlow` to `loadModularFlow`. For A/F this targets the **existing**
`phase_a_identity.modular.yaml` / `phase_f_helpdocs.modular.yaml`; for
identity-lite the thin manifest **does not exist** and must be **created**
(`content/flows/identity_lite.modular.yaml`) as part of this step (the TODO
markers' `phase_a.modular.yaml` / `identity_lite.modular.yaml` names are
aspirational — §2). Remove the TODO(#410) markers; land the two Playwright E2E
lanes (AC#3). (b) **Follow-up beyond #410:** delete `survey/loadFlow.ts` and
`content/flows/phase_*.yaml` / `identity_lite.yaml`. Keep (a) and (b) as separate
commits/PRs so #410 can close on (a). **Deletion here strips redundant *delivery
forms* only; research content (notably non-Roman-script questions) is preserved
as library entries per §3.8.**
- **AC:** A/F/identity-lite render identically via `loadModularFlow`; new
  `identity_lite.modular.yaml` exists and matches the legacy flow's question set;
  no remaining `TODO(#410)`; both E2E lanes pass.
- **Rollback:** (a) flip the loader import back per-phase; (b) restore the deleted
  YAML from git — keep (b) a separate commit so it reverts independently.
- **Test strategy:** golden-compare modular vs. legacy flow output per phase
  before deleting YAML; E2E lanes gate the cutover.
- *Relation to #410:* (a) **closes** #410's remaining ACs; (b) is the explicit
  out-of-#410 follow-up.

### P4a — Editor adapters behind the existing `SurveyStage` machine

Build `steps/` types + the `editor-step` adapters and `EditorStepProps`. Move the
galleries (into `editors/assignLoop/` + `editors/carve/`) and the **5 wizard-step
panels** into per-step editor adapters that **keep their current props**, but land
them **behind the existing `SurveyStage` machine** so any UI regression is
isolated from the ordering change. No union replacement yet.
- **AC:** every gallery/panel renders through its adapter with byte-identical
  behavior under the unchanged `SurveyStage` flow; depcruise green for the new
  `editors/` edges.
- **Rollback:** adapters wrap existing components; revert by pointing the stage
  machine back at the original imports.
- **Test strategy:** reuse the existing gallery/panel tests against the adapted
  components; visual regression on each of the 5 wizard steps.
- *Relation to #410:* net-new beyond #410.

### P4b — Replace the `SurveyStage` union with manifest-driven ordering

Build `steps/manifest.ts` + the register adapters and **replace the hardcoded
`SurveyStage` union** in `SurveyView` (`StudioShell.tsx`) with manifest reads.
This is a **~510-LOC rewrite of `SurveyView`** carrying its side-effecting
transitions — `lockDesktop()`, the `buildTouchLayoutJson` block, and the
copy/adapt branch — which are **routed through a manifest-level `onComplete`
reducer (§3.4), NOT the components.** Repoint the dashboard at the manifest. After
this, **map == runtime by construction.** (**Does not** close the four-forms
state fork — that is P5; §1.)
- **AC:** ordering comes entirely from `steps/manifest.ts` (no `SurveyStage`
  union remains); all former inline side effects fire from the reducer keyed by
  step id; dashboard and runtime read the same manifest; the §3.5 invariants
  (acyclicity, rejoin, spine-prefix shippability) hold on the manifest.
- **Rollback:** P4a left every editor behind the old stage machine, so reverting
  P4b restores the union-driven flow without touching the editors.
- **Test strategy:** assert map node/edge set == manifest; reducer unit tests for
  each side effect (lock, touch-layout build, copy/adapt); end-to-end run of the
  full spine order.
- *Relation to #410:* net-new beyond #410.

### P5 — KeyboardIR `mutate` seam + touch propagation (closes the state fork)

When the engine mutation contract (#5b / #232) lands: implement
`QuestionModule.mutate`, wire the carve/add shell to write through it, and
implement touch propagation/merge using the per-key provenance reserved in P4a.
**This is the phase that finally closes the four-forms STATE fork** (answer-store
vs. direct-IR-mutation; §1) by unifying both into one write surface. Until
#5b/#232 land, this phase **does not start** — `inputs`/`writes` already power the
dashboard without it.
- **AC:** `mutate()` is the single IR write path; a physical change re-suggests
  only derived touch keys (provenance check) and never clobbers `hand-set` keys.
- **Rollback:** gate `mutate()` behind a flag; falling back to the declared-only
  seam leaves P0–P4b intact.
- **Test strategy:** round-trip mutate against IR fixtures; provenance
  no-clobber tests on re-propagation.
- *Relation to #410:* fully out of #410; gated on #5b/#232.

---

## 7. Testing strategy

Goal: decouple test cost from the structural churn this refactor causes. Per-question
tests own the correctness of one question in isolation; flow-level tests own that the
assembled survey produces clean output. Restructuring questions (P1–P4) should break
per-question tests at most, and only mechanically — the flow/E2E tier stays green
because it asserts behavior and output, not module layout.

### 7.1 Two tiers

1. **Per-question unit tests** — one per `QuestionModule`, asserting that module's own
   contract in isolation:
   - **Input validation:** `validate` accepts every entry in `fixtures` and rejects
     malformed / out-of-range answers; declared `inputs` (`IRPath[]`) are present and
     well-typed; defaults and the `touchSuggest` / `touch_seed_source` policy resolve
     as declared.
   - **Output / mutation validation:** once the `mutate` seam lands (P5), applying
     `mutate` to a known IR fixture writes **exactly** the declared `writes` paths and
     nothing else, is idempotent on re-apply, and respects per-key provenance
     no-clobber. This pulls P2's aggregate write-surface AC down to the per-question
     level.
   - Until `mutate` is unstubbed, the output half asserts that the declared `writes` /
     `inputs` parse under `IRPath` and match the question's `Pattern.strategyId` write
     surface.
2. **Flow integration + E2E — structure-agnostic.** Drive the assembled flow through
   the manifest + registry (resolved by `definition.id`, never by file path) and assert
   on the **output**: golden-compare modular-vs-legacy IR per phase (P3), spine-prefix
   shippability, completeness / staleness transitions, and the two Playwright E2E lanes
   (#410 AC#3). These tests must not import individual question modules or assert on the
   file tree, so moving or splitting a question leaves them untouched.

### 7.2 Test layout — mirrored tree, not colocated

Tests live in a test tree that **mirrors** the questions tree, rather than colocated
beside each `<id>.ts`:

```
packages/studio/src/survey/questions/<phase>/<id>.ts
packages/studio/tests/survey/questions/<phase>/<id>.test.ts   # mirror — same relative path
```

(`packages/studio/tests/` is the mirror root — a sibling of `src/`; the package has no
pre-existing `tests/` or `__tests__/` root, so this is the established convention going
forward.) Rationale: keeps the source tree and the per-phase registries / manifests free
of test files, makes "every question has a test" a single directory-diff CI check, and
lets a question graduate to the `<id>/index.ts` + `extras/` folder form (§3.3) without
dragging its test into the source folder. The mirror path is derived from the source
path, so the same CI assertion that maps modules → map-nodes can map modules → test
files.

### 7.3 What this changes in the phase stubs

- The per-phase **Test strategy** stubs keep their flow-level gates (snapshot,
  depcruise, golden-compare, Playwright E2E) but hand per-question expectations to the
  two-tier model above.
- **P2** gains a CI gate: a module without a mirrored test file fails CI, same shape as
  the P0 map-node snapshot. The write-surface assertion moves from one aggregate test to
  per-question output tests.
- Integration / E2E lanes drop any remaining structural assertions and gate only on flow
  correctness and clean IR output.

---

## 8. Open decisions / risks

- **dependency-cruiser boundaries (all NET-NEW).** There is **no intra-`studio/src`
  layering in `.dependency-cruiser.cjs` today** — the existing rules are all
  cross-*package* boundaries. So **every** leaf/layer rule proposed here is
  net-new and must be **added** to `.dependency-cruiser.cjs`. Intended layering:
  `ui/` is a leaf (no deps on `survey/`/`steps/`/`stores/`); `steps/` may depend on
  `survey/` (registry) and `editors/`; **`dashboard/` reads `steps/` + `contracts`
  + `ui/`** (corrected — the dashboard reuses the `contracts` survey/IR types and
  `ui/` chrome, not `steps/` alone). **`editors/ → stores/ + lib/` must be
  explicitly ALLOWED**, because the galleries bind `stores/workingCopyStore.ts`
  and `lib/irToCarveNodes.ts` — these edges are intentional, not violations, so
  the new rules must whitelist them rather than forbid them.
- **Strict-TS explicit extension imports.** The repo uses Bundler resolution with
  **explicit `.ts`/`.tsx` import extensions** (e.g. `import … from "../types.ts"`
  in `registry.ts`). Every move/rename must update import specifiers including the
  extension; folder-per-question (`<id>/index.ts`) must be imported as
  `…/<id>/index.ts`. Automated codemods must preserve extensions.
- **The `mutate` seam gates on #5b / #232.** `inputs`/`writes` are declared data
  whose *execution* (actual IR writes) waits for the engine seam — no IR is
  written until #5b/#232 lands. The contract addition landed as **`packages/contracts`
  0.11.0** (§18-ratified MAJOR bump, 2026-06-26). Risk: declaring `writes` paths that
  later don't match the real `keyboard-ir.ts` shape — mitigated by `IRPath`
  (shipped in P2, `packages/contracts/src/ir-path.ts`, §3.3), which derives a typed
  path over the nested `KeyboardIR` union so an out-of-shape path is a compile error.
- **Touch provenance correctness.** If provenance is added late (P5) rather than
  reserved in P4a, existing touch edits won't carry provenance and the first
  propagation could clobber them. Mitigate by reserving the per-key tag in P4a and
  defaulting pre-existing touch keys to `hand-set` (the conservative tag — never
  auto-overwritten).
- **`touchSuggest` is assistance, not automation.** Risk: the generator's defaults
  feel like immovable rules. Mitigate with the §3.6 "defaults, not rules" stance —
  per-key AND policy-level overrides, defaults-as-data, and per-key provenance +
  producing-default so every suggestion is explainable and reversible.
- **Verification during migration.** P0 must land first so every later phase can
  be checked against an honest dashboard; otherwise regressions in ordering or
  reachability are invisible.
- **Staleness must be transitive + acyclic.** A one-hop staleness check silently
  misses multi-edge dependents; a cyclic `writes → inputs` graph has no valid
  ordering. Mitigate with the §3.5 transitive-closure-to-fixpoint + explicit
  acyclicity check, and the side-trail `joinTarget` rejoin reachability check
  (since `next` alone can't guarantee rejoin). This adds a **net-new `staleness`
  slice** to `workingCopyStore`.
- **Naming churn.** `editors/`, `assignLoop/`, and `dashboard/` are proposals;
  renaming touches many imports. Decide names before P4a to avoid a second rename
  pass.
```
