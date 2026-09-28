# Research: carve suppression (issue #1802)

Decisions the plan leaves open, resolved here before design. Each entry: **Decision** / **Rationale** / **Alternatives considered**.

## D-01 — Typed `nul`/`context` as IR output elements, not strings

**Decision**: FR-004 models `nul`, `context`, and `context(N)` as typed elements in the IR rule's output list (a small discriminated union alongside the existing text/store output elements), and the codec parses/emits them. The "nul on text-bearing context is a compiler error" (FR-009/FR-014 extension) is enforced in the existing output-position validation next to FR-009, not in the codec — the codec's job is faithful typing, the validator's job is rejection.

**Rationale**: The suppression compiler (slice 2) must distinguish "output that does nothing" from "output that emits text" structurally; stringly-typed output would force every consumer to re-parse. Typing at the codec keeps `parse → IR → emit` total and lets the verb table pattern-match on shape.

**Alternatives considered**: (a) Keep output as opaque strings and detect `nul`/`context` textually in the suppression compiler — rejected: every future reader of the IR would repeat the parse, and shadowing analysis in Layer B needs the distinction too. (b) Reject `nul`-on-context in the codec — rejected: a base keyboard the codec cannot parse fails the whole scaffold (Article II); the construct must round-trip even when a later layer flags it.

## D-02 — Suppression by in-place rewrite, not by appended block

**Decision**: A blocked carved rule is rewritten **in place** — the suppression rule occupies the carved rule's exact group position — rather than appended to a behaviour-owned group at the end of `main`. The original rule survives in the carve overlay's deleted set and is restored on un-carve.

**Rationale**: Keyman resolves rules top-down; moving a suppression to the end of `main` would change what it shadows and what shadows it, producing exactly the "shadowing surprises" FR-005's amendment forbids. In-place keeps the compiled keyboard's match order identical to the author's mental model (scenario 2: "keeping its shadowing position"). Ownership (`ownedByBehaviour`) is what distinguishes the suppression from author content, not position.

**Alternatives considered**: (a) Append all suppressions to a behaviour group after real bindings (the 076 §"Edge Cases" default placement) — rejected for carve: the carved rule's old neighbours are the correct shadowing context; a block group would also need fragile ordering against multiple carve groups. (b) Delete the rule and rely on `swallowUndefined` — rejected: sequencing puts suppression before `swallowUndefined`, and `swallowUndefined` is declined for sparse Latin overlays where suppression must still work.

## D-03 — `comboId` is the carve-node id; dispositions live in the studio store

**Decision**: `comboId` is the existing carve-node id from `irToCarveNodes` — the rule `nodeId` for rule carves, the `<storeNodeId>#<index>` slot id for store-slot carves. Dispositions live in `workingCopyStore.carveDispositions`, keyed by `comboId`, and are passed **as a parameter** to the pure engine compiler. They never enter the IR or the emitted keyboard.

**Rationale**: Carve-node ids are already stable across recompiles (051's collateral-guard and slot-expansion tests depend on that stability), so no new id scheme is needed. Keeping dispositions in studio state (not the IR) preserves the Article III single-working-copy model and keeps the engine pure — the same `compileCarveSuppression(ir, dispositions)` runs in the studio seam and the output pipeline. Un-carve already deletes by node id; deleting the disposition entry rides the same path.

**Alternatives considered**: (a) Store dispositions on the IR as rule annotations — rejected: the IR is the compiler's input language; author decisions are studio state (cf. `deletedNodeIds`, which also live outside the IR). (b) Derive a new combo key from key+modifiers — rejected: two carved rules can share a key on different layers/contexts; the node id is already the correct identity.

## D-04 — Reference host layouts as a versioned static module

**Decision**: The four reference hosts (US, US-International, AZERTY, QWERTZ) ship as a static, versioned data module (`referenceHostLayouts.ts`) mapping virtual-key + modifier layer → produced character for the printable layer. The source (public layout documentation) and the extraction date are recorded in the module header. The gallery caption states these are examples and the studio cannot see the typists' machines (FR-023).

**Rationale**: The studio runs in a browser and cannot query the typist's OS layout; the demo the spec demands needs *some* concrete hosts. A static module is auditable, testable, and honest about its limits — the caption does the epistemic work. Only the printable layer is needed (frame keys are never carved).

**Alternatives considered**: (a) Query the OS at runtime — impossible from the browser sandbox, and the demo must work for layouts the author doesn't have. (b) Derive host output from the base keyboard's declared layout — wrong direction: the base is what was carved away; the host is the typist's machine. (c) More than four hosts — deferred; four named examples plus the honesty caption satisfies FR-023, and the module is additive.

## D-05 — Loudness reads A6; no per-carve knob

**Decision**: `compileCarveSuppression` takes a single `loud: boolean` derived from the A6 strategy answer for the keyboard. There is no per-carve loudness control anywhere in state, UI, or metadata.

**Rationale**: Binding ruling §4 — loudness is a keyboard-wide strategy answer, and a per-carve beep knob would let one row surprise the author with beeps. The verb table appends `beep` mechanically when `loud` is true.

**Alternatives considered**: Per-carve loudness — rejected by the ruling; recorded here so tasks don't re-propose it.

## D-06 — Guard rules reproduce context up to the trigger, placed immediately ahead

**Decision**: For a blocked store-slot carve (`any()`/`index()` pair), suppression synthesises one guard rule per carved slot reproducing the rule's context **up to and including the trigger** with output `> nul` (or `> context`/`beep` per the verb table), placed immediately ahead of the paired rule in the same group. Interior `nul` store padding remains forbidden.

**Rationale**: A store slot is not a rule, so there is nothing to rewrite in place; the guard must win the match before the paired rule fires, hence immediate precedence. Reproducing only the context up to the trigger (not the whole rule) keeps the guard minimal and avoids duplicating output logic that stays live for the surviving slots.

**Alternatives considered**: (a) `nul`-fill the vacated slot in the store — forbidden by the ruling (interior `nul` padding breaks `any()`/`index()` indexing for sibling slots). (b) One guard per store — too coarse: it would block surviving slots sharing the store.

## D-07 — Import recogniser keys on the ownership marker alone

**Decision**: On Track 2 import, any rule with `ownedByBehaviour: "carve-suppression"` lifts as behaviour-owned, regardless of its verb or position. No shape matching, no heuristics.

**Rationale**: The marker is written by our own compiler (slice 2); trusting it is exact, while shape-matching (`> nul` rules can be legitimate author content) would misclassify. This mirrors FR-002's "recompiled, removed, and displayed by owner" — the marker *is* the identity.

**Alternatives considered**: Shape-based recognition (bare `> nul` ⇒ suppression) — rejected: false positives on author-written `nul` rules, which are idiomatic in released keyboards.

## Resolved clarifications

- **Bulk card with no state yet** (plan slice 3): if the closed-keyboard card (076 US1) has not been answered, pre-fill falls back to the FR-005 proposal rule — non-Latin script → `block`, sparse Latin overlay → `allow-host` — with provenance `"bulk-default"`. The card remains the authority once answered.
- **KeymanWeb loud Block**: flashes rather than beeps (spec FR-023) — a test-pane rendering concern, no engine work.
- **Sparse Latin overlays**: rows still pre-fill (to `allow-host`) and the A2 banner shows; the per-row table shows all four hosts regardless.
