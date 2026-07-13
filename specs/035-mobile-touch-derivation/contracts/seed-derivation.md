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
   it via `text`/`output`, nor via any `sk`/`flick`/`multitap` entry. Removing the last
   producer of an inventory char is **not** silently allowed — such a case surfaces via the
   coverage guard (see [simplification.md](simplification.md)); this function still removes it
   and the guard reports it (do not special-case here).
3. **Placements** — each `{char, hostKey}` is reflected on the phone `default` layer: the
   `hostKey`'s key gains the char (as `sk`/longpress when the key already outputs another
   char, or as the key's `output` when the host is otherwise empty). If `hostKey` is absent
   from the layer, emit a warning and place the char on a sensible fallback so it stays
   reachable (edge case: no obvious touch position).
4. **Provenance** — keys created or altered by replay are tagged
   `provenance: "physical-suggested"`; keys carried unchanged from an imported base keep their
   existing provenance (`"base-derived"` when absent-on-import). Never overwrite a `"hand-set"`
   key (R6 no-clobber).
5. **Determinism** — same `(seed, mods)` → identical output (stable nodeId minting order).

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
  `scaffoldTouchLayout(baseIr)` → `applyDesktopModifications` → `applyTouchAssignments` →
  `emitTouchLayout`.
- **`seedSource === "import-adapt"`** with `baseTouchJson`: Case B — parse the raw layout,
  `applyDesktopModifications`, re-emit preserving verbatim fields (or apply modifications as
  raw-JSON splices consistent with `applyTouchAssignmentsToRawJson`'s verbatim guarantee),
  then `applyTouchAssignmentsToRawJson` for the Phase E edits.
- Returns `{ json: string | null, warnings }` unchanged; `null` still means "omit the file".

**Back-compat note**: existing call sites (`TouchGallery`, `StudioShell.handlePhaseEComplete`)
must pass the new `opts` shape; the previous positional `baseTouchJson?` arg is folded into
`opts`. This is an internal studio helper, not a locked contract — no version bump.

## Acceptance mapping

| Spec | Assertion |
|---|---|
| FR-004 / US1-AS2 / US2 edge | after replay, none of `mods.removals` appears anywhere in the emitted layout |
| FR-005 / US1-AS3 | each `mods.placements[].char` appears at a sensible position |
| SC-001 | N removals + M placements all reflected in the import-adapt path |
| R6 | replayed keys are `physical-suggested`; `hand-set` keys untouched |
