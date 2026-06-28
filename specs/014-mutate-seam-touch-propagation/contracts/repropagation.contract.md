# Contract: touch re-propagation (no-clobber)

**Feature**: 014-mutate-seam-touch-propagation | **Status**: UNGATED (gate cleared per PR #822, 2026-06-28) — front-end implementation work

> The dependency gate (#5b/#232) cleared with **PR #822** (`@keyboard-studio/contracts` 0.12.0); `TouchKeyIR.provenance?` — the field this no-clobber rule reads — is ratified. Re-validated 2026-06-28 (T000). This contract is front-end implementation work (task T022 et al.), unblocked by #822.

## Surface

`steps/repropagate.ts` (NEW) — triggered from the reducer on physical-lock break / physical-step completion; reads the `workingCopyStore` `staleSteps` slice; re-runs `editors/touchSuggest/touchSuggest.ts`.

## Guarantees

- **R1 (automatic, staleness-driven, FR-012/-013)**: re-propagation fires automatically on a physical change, driven by the P4b `staleSteps` root-set + completeness fixpoint — re-suggesting only keys derived from the changed physical decision, not the whole touch layer.
- **R2 (no-clobber, FR-012)**: overwrites **only** `base-derived` and `physical-suggested` keys; **never** a `hand-set` key. The empty-hand-set case is the trivial pass (SC-005).
- **R3 (coalesced single pass, Q10/FR-013)**: when multiple steps go stale at once, re-propagation runs **once** over the union of the staleness closure — each derived key re-suggested at most once per change.
- **R4 (promotion, FR-014)**: a manual edit to a `physical-suggested` key promotes it to `hand-set`; subsequent re-propagation leaves it untouched (SC-006).
- **R5 (no dependents)**: breaking a physical lock with no derived touch dependents yields an empty closure — a no-op, not an error.
- **R6 (orphaned hand-set)**: a `hand-set` key whose base a later physical change removes is NOT auto-overwritten (no-clobber wins); surfacing it is a dashboard concern, not a silent deletion.

## Test obligations

- Provenance-tagged touch-layout fixtures (Q7) mixing `base-derived` / `physical-suggested` / `hand-set`; a simulated physical change re-suggests only the first two and leaves 100% of `hand-set` keys byte-identical (R2/SC-005).
- Promotion test: edit a `physical-suggested` key → it becomes `hand-set` → re-propagate → untouched (R4/SC-006).
- Coalescing test: one change marks several steps stale → each derived key re-suggested exactly once (R3).
