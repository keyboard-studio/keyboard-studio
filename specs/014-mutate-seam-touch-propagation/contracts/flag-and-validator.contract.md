# Contract: global rollback flag + real per-spine-prefix validator

**Feature**: 014-mutate-seam-touch-propagation | **Status**: UNGATED (gate cleared per PR #822, 2026-06-28) — front-end implementation work

> The dependency gate (#5b/#232) cleared with **PR #822** (`@keyboard-studio/contracts` 0.12.0). Re-validated 2026-06-28 (T000). The global flag + real per-spine-prefix validator are front-end implementation work (tasks T007/T034), unblocked by #822.

## Global `mutate` flag — `flags/mutateFlag.ts` (NEW)

- **F1 (single global, Q6/FR-015)**: one build/deploy-time global gates `mutate()`. On ⇒ `mutate()` is the IR write path. Off ⇒ P4b declared-only seam, **no** `mutate()` executes.
- **F2 (byte-identical-to-P4b, FR-016)**: with the flag off, produced IR + observable survey behavior are byte-identical to P4b; turning it off fully restores P0–P4b with no other code change (the defined rollback, SC-008).
- **F3 (no live toggle)**: mid-session flipping is out of scope (build/deploy-time global).

### Test obligations
- Flag off: full-spine output byte-identical to P4b, **zero** `mutate()` calls (SC-008). Flag on: `mutate()` is the write path. Both states demonstrated.

## Real per-spine-prefix validator — `dashboard/completeness.ts` C4 (EDIT) + `engine/src/validator`

- **V1 (real validator, FR-017)**: replaces 012's structural proxy `checkSpinePrefixShippability`; runs the real Layer-A validator against the `mutate()`-produced working copy at each prefix.
- **V2 (distinct from inputs-satisfiability, FR-018)**: shippability stays a check distinct from C5 inputs-satisfiability (a prefix can satisfy inputs yet fail validity, and vice versa).
- **V3 (Article IV)**: respects the single 300 ms debounce / single validation path — **no** second debounce timer, **no** parallel validation path.

### Test obligations
- Per spine prefix: real validator passes base-template-derived prefixes, flags a deliberately broken one (V1/SC-009); a probe confirms no second debounce timer / parallel path introduced (V3/SC-009).
