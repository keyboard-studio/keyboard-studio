# Contract: Seed derivation — desktop-modification replay

**Package**: `@keyboard-studio/engine` (pure functions) · **Team**: Engine

Closes FR-002 / FR-004 / FR-005 (replay the locked desktop work onto the touch seed on
**both** paths). Reuses existing `scaffoldTouchLayout`, `applyTouchAssignments`,
`applyTouchAssignmentsToRawJson`, `emitTouchLayout`.

## New: `applyDesktopModifications`

`packages/engine/src/pattern-apply/applyDesktopModifications.ts`

```ts
import type { TouchLayoutIR } from "@keyboard-studio/contracts";

export interface DesktopModifications {
  removals: readonly string[];                              // Phase D carve removals
  placements: readonly { char: string; hostKey: string }[]; // Phase C letter placements
}

export interface ApplyDesktopModificationsResult {
  layout: TouchLayoutIR;      // structurally shared where unchanged (pure, non-mutating)
  warnings: string[];         // e.g. placement hostKey not present on any layer
}

export function applyDesktopModifications(
  seed: TouchLayoutIR,
  mods: DesktopModifications,
): ApplyDesktopModificationsResult;
```

**Contract**:
1. **Pure** — does not mutate `seed`; returns a new layout with structural sharing for
   untouched platforms/layers/keys.
2. **Removals** — for every `char` in `mods.removals`, no key on any platform/layer produces
   it via `text`/`output`/`U_…` id, nor via any `sk`/`flick`/`multitap` entry. Removal
   **never deletes a key object** (R9): a gesture entry is dropped, but a key whose
   *primary production* is the carved char becomes an inert placeholder (reserved
   non-producing `T_removed_<n>` id, `text` cleared, `output` removed, gesture entries for
   other chars kept) so row geometry, widths, and touch targets stay stable. Removing the
   last producer of an inventory char is **not** silently allowed — such a case surfaces via
   the coverage guard (see [simplification.md](simplification.md)); this function still
   removes it and the guard reports it (do not special-case here).
3. **Placements** — each `{char, hostKey}` is reflected on the phone `default` layer: the
   `hostKey`'s key gains the char (as `sk`/longpress when the key already outputs another
   char, or as the key's `output` when the host is otherwise empty). If `hostKey` is absent
   from the layer, emit a warning and place the char on a sensible fallback so it stays
   reachable (edge case: no obvious touch position — includes custom/inventory chars with
   no `US_KEYCAPS` host on the template).
4. **Provenance** — Case A (IR) path only: keys created or altered by replay are tagged
   `provenance: "physical-suggested"`; keys carried unchanged from an imported base keep
   their existing provenance (`"base-derived"` when absent-on-import). Never overwrite a
   `"hand-set"` key. The raw-JSON variant below carries **no tags** (provenance is
   IR-only, R6); its no-clobber guarantee is pipeline ordering — replay runs before
   `applyTouchAssignmentsToRawJson`, so author edits are always applied last.
5. **Determinism** — same `(seed, mods)` → identical output (stable nodeId minting order).

## New: `applyDesktopModificationsToRawJson` (Case B variant — R9)

`packages/engine/src/pattern-apply/applyDesktopModificationsToRawJson.ts`

```ts
export function applyDesktopModificationsToRawJson(
  rawJson: string,
  mods: DesktopModifications,
): { json: string; warnings: string[] };
```

Same `mods` input and the same removal/placement semantics as the IR variant, implemented
as parse → **splice-in-place** → stringify, exactly like
[applyTouchAssignmentsToRawJson](../../../packages/engine/src/pattern-apply/applyTouchAssignmentsToRawJson.ts):
every unmodified key/layer/platform/field is preserved verbatim. **The shipped layout is
never round-tripped through the IR on this path** — `emitTouchLayout` drops per-key
`layer`, `displayUnderlying`, `font`/`fontsize`, and string-vs-int `sp`/`width`/`pad`.
Share removal/placement logic with the IR variant where practical (mirroring the existing
`applyTouchAssignments` / `…ToRawJson` split).

## Edited: `buildTouchLayoutJson` (studio orchestrator)

`packages/studio/src/lib/buildTouchLayoutJson.ts`

Extend the existing signature to accept the desktop modifications and the seed-source choice,
and call `applyDesktopModifications` in **both** branches:

```ts
export function buildTouchLayoutJson(
  baseIr: KeyboardIR,
  assignments: ReadonlyArray<TouchAssignment>,
  opts: {
    baseTouchJson?: string;          // present ⇒ Case B (imported base layout)
    mods: DesktopModifications;      // NEW — replayed in both cases
    seedSource: "import-adapt" | "reseed-from-desktop";  // NEW — R4
  },
): BuildTouchLayoutJsonResult;
```

- **`seedSource === "reseed-from-desktop"`** (or `baseTouchJson` absent): Case A —
  `scaffoldTouchLayout({ ...baseIr, touchLayout: undefined })` (the strip is mandatory —
  R10: an unstripped `ir.touchLayout` is preserved-and-augmented, not discarded, violating
  US2-AS4) → `applyDesktopModifications` → `applyTouchAssignments` → `emitTouchLayout`.
  Note `mods` carries **all** the desktop work on this path too — `baseIr` is the pristine
  instantiation-time IR (R3), so without the replay the projection reflects neither carve
  removals nor placements.
- **`seedSource === "import-adapt"`** with `baseTouchJson`: Case B —
  `applyDesktopModificationsToRawJson` on the raw JSON, then
  `applyTouchAssignmentsToRawJson` for the Phase E edits. Both are splice-in-place; the
  shipped layout is **never** round-tripped through the IR (R9).
- Returns `{ json: string | null, warnings }` unchanged; `null` still means "engine failure
  → omit the file".

**Emission policy (R11)**: callers no longer gate the build on "has real Phase E edits".
The derived layout is injected/emitted per the matrix: reseed → always; import-adapt →
when `mods` is non-empty or a real Phase E edit exists; truly-untouched import-adapt →
emit nothing (shipped file used verbatim — byte-preserving no-op). Preview
(`vfsTransform`), lint (`editedVfsForLint`), and output (`handlePhaseEComplete` /
`serializeWorkingCopy` side-car) follow the same matrix so the three cannot drift.

**Back-compat note**: existing call sites (`TouchGallery`, `StudioShell.handlePhaseEComplete`)
must pass the new `opts` shape **in the same change**; the previous positional
`baseTouchJson?` arg is folded into `opts`. This is an internal studio helper, not a locked
contract — no version bump.

**Adjacent-seam decision (R13 — pinned, resolves the PR #1088 km-triage escalation)**: the
spec-014 flag-gated repropagation seam
([repropagate.ts](../../../packages/studio/src/steps/repropagate.ts) +
[touchSuggest.ts](../../../packages/studio/src/editors/touchSuggest/touchSuggest.ts))
also derives touch from physical decisions and, flag-on, writes the `touchLayoutJson`
side-car via `emitTouchLayout(ir.touchLayout)` (repropagate.ts:163-165). Resolution —
**single artifact writer**: `buildTouchLayoutJson` (under the R11 matrix) is the only
writer of the side-car / VFS artifact in both flag states. The seam keeps its IR-scoped
provenance job (`ir.touchLayout` maintenance for `promoteOnManualEdit` / flag-on preview)
but its side-car write is **removed** — `setTouchLayoutJson` comes out of
`RepropagateDeps`, the emit comes out of `repropagate()`, and its injection comes out of
the reducer's mechanisms-completion call site (reducer.ts:248). Flag-on, that write is an
IR round-trip that violates this contract's R9 verbatim guarantee on shipped base layouts
and bypasses the R11 matrix (it fires at mechanisms-completion, before the seed-source
choice exists). The mechanisms are **not** merged — `touchSuggest` unification is
spec-014-scope work. See research R13; implemented by tasks.md T024, which must land
before `VITE_KM_MUTATE_SEAM=1` is ever enabled on a 035-bearing build.

## Acceptance mapping

| Spec | Assertion |
|---|---|
| FR-004 / US1-AS2 / US2 edge | after replay, none of `mods.removals` appears anywhere in the emitted layout |
| FR-005 / US1-AS3 | each `mods.placements[].char` appears at a sensible position |
| SC-001 | N removals + M placements all reflected in the import-adapt path |
| R6 | Case A: replayed keys are `physical-suggested`; `hand-set` keys untouched. Case B: author edits applied after replay (ordering no-clobber; wire JSON carries no tags) |
| R9 | Case B output preserves every unmodified field of the shipped JSON byte-identically; primary-key removals keep row geometry (inert placeholder, no key deletion) |
