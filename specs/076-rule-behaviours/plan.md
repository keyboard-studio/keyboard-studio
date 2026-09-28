# Implementation Plan: Carve suppression — carved key combinations get an explicit allow/block fate (issue #1802)

**Branch**: `km/issue-1802-spec` | **Date**: 2026-09-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from [specs/076-rule-behaviours/spec.md](spec.md) — User Story 6, FR-019–FR-023, FR-005 amendment, and the binding ruling in `~/workspace/keyboard-studio-notes/1802-ruling.md` with amendments A1 (visible two-tier choice) and A2 (two-sided tradeoff framing).

**Scope**: This plan covers the #1802 deliverable only: codec closure (FR-004, prerequisite), the carve-suppression engine (FR-019–FR-022), and the studio choice UI (FR-023). Full `swallowUndefined` (FR-005 body) is a later 076 phase; this plan builds only its carve skip-set seam.

## Summary

Seven slices, in dependency order. The codec must type `nul`/`context` first (FR-004), because the suppression verb table cannot compile without it. The suppression itself is a new pure compiler in the carve layer — `compileCarveSuppression` — that rewrites each carved rule in place to its shape-correct verb (`nul` for bare keys, `context` for text-bearing context, `nul` for deadkey-only) and synthesises guard rules for store-slot carves, every emitted rule carrying `ownedByBehaviour`. Dispositions (`block` | `allow-host`) live in the studio working-copy store as carve-decision metadata, pre-filled from the closed-keyboard card with provenance and read at every recompile without re-prompting. The studio surfaces the choice where the spec demands it be seen: a per-row allow/block control with a four-host consequence table in the carve gallery, a host-layout selector in the test pane, and a "Review removed keys" panel — all copy stating the A2 tradeoff (Allow: always something, but it varies by computer; Block: nothing everywhere, a dead key if a character was expected), never the retired slogan.

1. **Codec closure (FR-004).** Type `nul`, `context`, `context(N)` in output position and `context(N)` (N>1) in context position; model the `begin` entry points on the IR header. Round-trip fixtures. Unblocks everything below.
2. **Suppression core.** `compileCarveSuppression(ir, dispositions, loudness)`: per-rule verb selection (FR-020), in-place rewrite at the rule's shadowing position, `ownedByBehaviour` on every emitted rule (FR-021), store-slot guard rules placed ahead of the paired rule (scenario 5), un-carve removes owned rules and restores originals. Simulator-backed unit tests.
3. **Disposition metadata (FR-022).** `carveDispositions` map in the working-copy store keyed by carve-node id; pre-fill from the closed-keyboard card's accepted/declined state with provenance; per-row override; recompile reads, never re-asks; un-carve deletes.
4. **`swallowUndefined` skip-set seam (FR-005 amendment).** Carved combos enter the swallow set on recompile; `allow-host` combos and combos covered by suppression-owned rules are skipped. The swallow behaviour itself is not built here.
5. **Import recogniser (FR-021/FR-012).** Lift `ownedByBehaviour: "carve-suppression"` rules as behaviour-owned on Track 2 import; never treat as author content or carve targets.
6. **Studio choice UI (FR-023).** Gallery row disposition control + host-consequence table with honesty caption; test-pane host selector (US, US-International, AZERTY, QWERTZ, blocked); "Review removed keys" panel with two-sided verdict; touch strip keycap consequence. Reference host-layout data file.
7. **Validation.** Layer B shadowing audit for guard-rule placement; `sil_cameroon_qwerty` regression per the ruling's verification plan; Playwright on one Latin and one non-Latin flow (shared with 076 phase 5).

Slices 1–3 are the engine deliverable and independently shippable; slice 6 depends on 3; slice 7 closes the phase.

## Technical Context

**Language/Version**: TypeScript 5.x, Node ≥ 22.19.0, pnpm 9

**Primary Dependencies**: `@keyboard-studio/engine` (`carveFilterIr`, `applyStoreSlotRemovals`, `applyCarveToVfs`, codec `parse`/`emit`, simulator), `@keyboard-studio/contracts` (`KeyboardIR`, `IRRule`, new `CarveDisposition` type), React 18 + Vite (`CarveGalleryV2`, `irToCarveNodes`, `workingCopyStore`, test pane)

**Storage**: Working-copy IR + `deletedNodeIds` / `deletedItemIds` in `workingCopyStore` (Article V); dispositions ride alongside as `carveDispositions` and never enter the emitted keyboard

**Testing**: vitest in both packages; the Cameroon QWERTY corpus keyboard as the regression fixture (see [docs/keyboard-index.md](../../docs/keyboard-index.md)); Playwright for the gallery/test-pane flows

**Target Platform**: Browser SPA + the engine package it consumes

**Project Type**: TypeScript monorepo — engine library + React SPA

**Performance Goals**: Suppression compile is one extra scan over carved rules only; no change to the 300 ms validation debounce (Article IV); no regression against the existing `#931` hoisting

## Project Structure

```
packages/engine/src/
  codec/
    parse.ts                  # FR-004: parse typed nul/context/context(N)
    emit.ts                   # FR-004: emit them back; begin entry points
  pattern-apply/
    carveSuppression.ts       # NEW: compileCarveSuppression + verb table (FR-019–FR-021)
    carveSuppression.test.ts  # NEW: shape matrix, ownership, un-carve restore
    carveFilterIr.ts          # composition point (unchanged semantics)
    applyCarveToVfs.ts        # compose suppression after filter+slot removals
packages/contracts/src/
  keyboard-ir.ts              # IRRule gains ownedByBehaviour (FR-002, additive optional)
  carveDisposition.ts         # NEW: CarveDisposition type (comboId, disposition, provenance)
packages/studio/src/
  lib/
    referenceHostLayouts.ts   # NEW: US/Intl/AZERTY/QWERTZ printable-layer reference data
    irToCarveNodes.ts         # carve-node ids become comboIds (no id changes expected)
  store/
    workingCopyStore.ts       # carveDispositions map + pre-fill/override/delete reducers
  editors/carve/
    CarveGalleryV2.tsx        # per-row disposition control + host-consequence table
    ReviewRemovedKeys.tsx     # NEW: review panel with two-sided verdict
  editors/test/               # host-layout selector for carved combinations
```

**Structure Decision**: The suppression compiler lives in `pattern-apply/` next to the two carve producers it composes with (`carveFilterIr`, `applyStoreSlotRemovals`), and both existing call sites (`applyCarveToVfs` for the output pipeline, `editorMutate` for the studio seam) call the same composed function — the byte-identical-across-paths invariant from `carveFilterIr`'s header extends to suppression.

## Constitution Check

| Article | Assessment |
|---|---|
| I. Pattern schema locked | **PASS** — no `Pattern` field changes; only additive optional fields on `IRRule` and a new standalone type. |
| II. KeyboardIR spine | **PASS** — suppression compiles to/from the IR only; codec models `nul`/`context` as typed elements, never raw text. |
| III. Single working copy | **PASS** — dispositions live in `workingCopyStore` beside `deletedNodeIds`; the IR is re-projected, never duplicated. |
| IV. Validator layering | **PASS** — no new debounce; guard-rule placement gets a Layer B shadowing audit, additive within the existing layer. |
| V. VirtualFS only | **PASS** — no host-disk writes; reference host data is a bundled static module. |
| VI. Team boundaries | **PASS** — Engine owns the engine package, the SPA, and the compiler service. No Content-owned surfaces change. |
| VII. Out of scope | **PASS** — none of the §16 items are touched. |
| VIII. House conventions | **PASS** — no issue numbers in shipped code/comments; commit titles use the locked vocabulary. |
| IX. Survey surface | **PASS** — the closed-keyboard card lives in the Behaviours step under the step manifest (076 phase 5); the per-row control is editor UI, not survey. |

No Complexity Tracking needed — no violations.

## Slice detail

### Slice 1 — Codec closure (FR-004)

- `parse.ts`: accept `nul`, `context`, `context(N)` in output position; `context(N)` for N>1 in context position. Model as typed IR elements (see [research.md](research.md) D-01).
- `emit.ts`: emit them back; model the `begin` entry-point set (`Unicode`/`ANSI`, `NewContext`, `PostKeystroke`) on the IR header so multi-entry keyboards round-trip. `NewContext`/`PostKeystroke` groups are `readonly`, never reorder hooks.
- Compiler error (extends FR-009/FR-014): `nul` with text-bearing context is rejected — the codec types it, a later layer errors. Decide the exact layer in tasks (likely the existing output-position check next to FR-009).
- Fixtures: round-trip `.kmn` snippets exercising every typed form plus a two-entry-group keyboard.
- **Done when**: parse→emit is identity on the fixtures; typed forms survive a scaffold round-trip.

### Slice 2 — Suppression core (FR-019–FR-021)

- New `compileCarveSuppression(ir, dispositions, { loud })` in `pattern-apply/carveSuppression.ts`. Pure: takes the post-carve IR and the disposition map, returns the IR with suppression rules spliced in.
- Verb table (FR-020, see [data-model.md](data-model.md)): bare-key → `> nul`; text-bearing context → `> context`; deadkey-only `dk(x) + [K_X]` → `> nul`; mixed text+deadkey → `> context`; carved last-consumer of a deadkey-arming rule → `> nul`. Loud (A6) appends `beep`, never bare `beep` on a matched context; default soft.
- Rewrite **in place**: the suppression rule occupies the carved rule's group position (keeps shadowing), carries `ownedByBehaviour: "carve-suppression"`, mutually exclusive with `ownedByPattern`. The original rule is preserved by the carve overlay (deleted set), not destroyed — un-carve restores it.
- Store-slot carves: synthesise guard rule(s) reproducing the context up to the trigger, placed immediately ahead of the paired `any()`/`index()` rule. Interior `nul` store padding stays forbidden.
- Deadkey carves must never fall through (armed deadkey would leak to host).
- Composition: `applyCarveToVfs` and the studio `editorMutate` seam call filter → slot removals → suppression, one shared path.
- Tests: the full shape matrix against the simulator, ownership assertions, un-carve restore, no-fall-through for deadkeys, `sil_cameroon_qwerty` scenario tests (single RALT layer; two-level RALT+SHIFT).

### Slice 3 — Disposition metadata (FR-022)

- `CarveDisposition { comboId, disposition: "block" | "allow-host", provenance }` in `@keyboard-studio/contracts`; `comboId` is the carve-node id (rule `nodeId`, or `<storeNodeId>#<index>` for slot carves) — see [research.md](research.md) D-03.
- `workingCopyStore.carveDispositions: Record<comboId, CarveDisposition>`.
- Pre-fill: on carve, each new combo takes the closed-keyboard card's state — card accepted → `block` (provenance `"closed-keyboard-card"`); card declined → `allow-host` (provenance `"closed-keyboard-card-declined"`). If the card has no state yet (076 US1 not run), fall back to the FR-005 proposal rule: non-Latin script → block, sparse Latin overlay → allow-host, provenance `"bulk-default"`.
- Recompile reads the map; only genuinely new combos take the default. The author is never re-prompted. Un-carve deletes the combo's metadata and its owned rules.

### Slice 4 — `swallowUndefined` skip-set seam (FR-005 amendment)

- When the swallow store recompiles, carved combos enter it **except**: (a) combos whose disposition is `allow-host`, (b) combos covered by a carve-suppression-owned rule (no double emission, no shadowing surprises).
- This slice builds the skip-set predicate and its tests against a stub swallow enumeration, not the full FR-005 behaviour.

### Slice 5 — Import recogniser (FR-021, FR-012)

- Track 2 import: rules carrying `ownedByBehaviour: "carve-suppression"` lift as behaviour-owned; they are never treated as author content nor offered as carve targets. Recogniser tests with a hand-built IR.

### Slice 6 — Studio choice UI (FR-023)

- `CarveGalleryV2` row: visible Allow/Block disposition control, pre-filled per slice 3 with provenance label; expanded row shows the host-consequence table (per-disposition output on the keyboard's likely hosts) with the caption that the shown layouts are the studio's best guess, not sight of the typists' machines.
- Copy rule (A2): each option states its own risk; the prompt asks "do your typists expect a character on this key?"; the slogan "allow unpredictable / block predictable" must not appear. Copy lives under `behaviours.*` i18n keys; tests assert the banned slogan is absent.
- Test pane: host-layout selector (US, US-International, AZERTY, QWERTZ, blocked) for carved combinations; Block row uniform "nothing" on every host; on KeymanWeb the loud Block case flashes rather than beeping.
- "Review removed keys" panel: every carved combination with disposition and cross-host consequence, ending in the two-sided verdict line (allowed keys vary by computer; blocked keys are silent everywhere, dead keys if output was expected).
- Touch strip: keycap consequence ("removed from the touch layout" by default; "kept, does nothing" under the keep-inert override).
- Reference host data: new `referenceHostLayouts.ts` — static printable-layer maps for the five hosts, sourced and versioned, plus a `likelyHostLayouts(bcp47[])` resolver mapping language tags through a versioned region→layout table (default: the five reference hosts) — see [research.md](research.md) D-04. Sparse Latin overlays get the A2 banner; the per-row table shows the likely hosts.

### Slice 7 — Validation

- Layer B shadowing audit: guard rules placed ahead of paired rules must not shadow, or be shadowed by, author-modified rules; behaviour rules land deterministically, Layer B reports the remainder.
- `sil_cameroon_qwerty` regression per the ruling's verification plan (single RALT layer; two-level RALT+SHIFT; touch-layer variants).
- Playwright: one Latin flow (sparse overlay, allow-host default) and one non-Latin flow (Arabic base, block default, flip one row).

## Explicitly out of scope

- The full `swallowUndefined` behaviour (FR-005 body) — later 076 phase; only the skip-set seam here.
- Per-carve loudness control — ruled out by the binding ruling; loud/soft follows A6.
- §7.2/§7.5 strategy-tree changes — ruled out; disposition is behaviour narrowing.
- Mobile-app, LDML, CJK — Article VII.
