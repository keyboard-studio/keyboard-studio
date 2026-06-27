# Contract: `IRPath` / `inputs` / `writes` (the named P2 contract)

This is the **locked, exported contract** the P0 dashboard spec consumes by name
(FR-012). It is exposed from `@keyboard-studio/contracts` and the studio
`QuestionModule`. Treat the **shapes** below as the contract; field
renames/type-changes/removals are a breaking change to `@keyboard-studio/contracts`
(spec §18, Constitution Article I).

## 1. `IRPath` (contracts export)

```ts
// packages/contracts/src/ir-path.ts  (illustrative — mechanism per research R1)

/** A structural location in the KeyboardIR type tree. Canonical form is a
 *  readonly tuple of segments; an invalid path is a COMPILE ERROR. Derived from
 *  KeyboardIR, so a path absent from keyboard-ir.ts fails typecheck. */
export type IRPath = /* derived key-path over KeyboardIR, bounded at touch keys[] */;

/** Ergonomic typed builder. */
export declare function irPath(/* …segments */): IRPath;

/** Stable display string for the dashboard, e.g. "groups[].rules[].output". */
export declare function formatIRPath(path: IRPath): string;
```

**Guarantees**:
- **G1 (Design AC)**: a tuple that is not a valid path through `KeyboardIR` is
  not assignable to `IRPath` → compile error.
- **G2 (Drift AC)**: renaming/removing a field in `keyboard-ir.ts` invalidates
  any `IRPath` naming it → typecheck failure (no codegen to re-run).
- **G3 (coverage)**: paths exist for both surfaces — physical
  (`groups[]`/`stores[]`/…) and touch
  (`touchLayout.platforms[].layers[].rows[].keys[]`). `raw[]` (opaque fragment
  list) is addressable as a terminal; sub-fields of individual fragments are not
  (opaque fragments are not survey-editable).
- **G4 (bound)**: P2 does not recurse into `TouchKeyIR.sk`/`flick`/`multitap`.
  Likewise, `RawKmnFragment` is an atomic leaf — `raw[ARRAY_INDEX]` is the
  terminal path; further descent is not addressable.
- **G5 (serializable)**: `formatIRPath` yields a stable string the dashboard can
  render; the tuple is the canonical comparison key for the orphan-input lint.

## 2. `QuestionModule.inputs` / `.writes` (studio contract)

```ts
// packages/studio/src/survey/types.ts  (additions only)
export interface QuestionModule {
  definition: FlowQuestion;
  validate?: (value: string | string[] | undefined) => ValidationResult;
  fixtures: { valid: …; invalid: … };

  /** NEW — IR locations this question READS. Same IRPath space as `writes`. */
  inputs?: readonly IRPath[];
  /** NEW — IR locations this question will POPULATE (declared now, executed in P5). */
  writes?: readonly IRPath[];

  // mutate stays the documented stub — DO NOT implement (P5 / #5b / #232).
}
```

**Guarantees**:
- **G6 (single address space)**: `inputs` and `writes` are both `readonly IRPath[]`
  over the same `KeyboardIR` space → directly comparable (orphan-input lint).
- **G7 (presence, not non-empty)**: shipped modules declare **present** fields;
  empty arrays are valid and deliberate for read-/write-nothing questions. CI
  fails only on an absent field.
- **G8 (no execution)**: declaring `writes` mutates nothing; `mutate()` is a stub.

## 3. Enforcement gates (CI contract)

| Gate | Asserts | Fails when |
|---|---|---|
| `pnpm typecheck` | G1, G2 (via `ir-path.test.ts` type tests) | an invalid/stale path compiles, or a valid path is rejected |
| Coverage check (vitest, studio) | G7 / FR-006 | any of the 93 modules lacks a `inputs` or `writes` field |
| Orphan-input lint (vitest, studio, **manifest-scoped**) | FR-007 | a manifest-referenced question's `input` has no upstream `write` |
| Write-surface test (vitest, studio, **§7.7-conditional**) | FR-008 | a strategy-bearing question's `writes` ≠ its available §7.7 write surface |
| Missing-mirrored-test check (vitest, studio) | FR-009 | a `src/.../<id>` has no `tests/.../<id>.test.ts` |

## 4. Consumed-by

- **P0 dashboard** reads `inputs`/`writes` (via `formatIRPath`) to render input
  requirements and IR mutations per step. P0 references THIS contract by name and
  does not re-derive it.
- **P4 manifest / completeness** consumes the same declarations for the
  staleness/acyclicity/rejoin graph (§3.5) — later phases, out of P2 scope.

## 5. Stability

Breaking changes to §1/§2 shapes require a `@keyboard-studio/contracts` breaking
version bump + joint engine+content session (spec §18). The §18 session of
2026-06-26 has already ratified the *introduction* of this contract as that
breaking bump (see research R5 for the 0.11.0-vs-1.0.0 numbering call).
