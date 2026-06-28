# Contract: `mutate()` write seam + reducer patch application

**Feature**: 014-mutate-seam-touch-propagation | **Status**: RATIFIED (gate cleared per PR #822, 2026-06-28)

> The `mutate?(value, ctx: MutateContext): Partial<KeyboardIR>` surface is **ratified** and landed at the type level in `survey/types.ts` by **PR #822** (`@keyboard-studio/contracts` 0.12.0). Re-validated against the ratified `KeyboardIR`/mutation surface on 2026-06-28 (T000) — no shape drift (plan gate G-II RESOLVED). The reducer apply path + per-module implementations remain front-end work (tasks T008/T014/T015).

## Surface

`QuestionModule.mutate?(value, ctx): Partial<KeyboardIR>` — pure; returns a patch the reducer applies. Activated from the P2 stub in `packages/studio/src/survey/types.ts`.

## Guarantees

- **M1 (pure)**: `mutate()` MUST NOT mutate the IR in place or perform side effects; it returns a `Partial<KeyboardIR>` patch (FR-002).
- **M2 (path-scoped deep merge, Q9)**: the reducer applies the patch by writing each value to its declared `IRPath` location only; sibling nested IR under a shared parent is preserved. NOT a shallow top-level branch replace.
- **M3 (declared-`writes` containment, Q11/FR-003)**: the patch MUST touch only the module's declared `writes` paths. A patch touching any undeclared path is **rejected whole** (no partial apply), the failure **surfaced** (never swallowed), the IR **unchanged** — in **all** builds (not dev-only).
- **M4 (idempotent, FR-004)**: applying the same `value` against the same IR twice = byte-identical to once.
- **M5 (empty patch)**: `{}` is valid and merges to a no-op (preserves all existing IR).
- **M6 (single write path, FR-005)**: when the flag is on, `mutate()` is the ONLY IR write route for in-scope surfaces; no in-scope surface writes by any other route (SC-001).

## Scope (Q4=B)

- IN: carve/add shell (carve remove-mode + add galleries — the prong carrying the strategy-bearing carve/mechanism/touch writes) + the 5 question modules with non-empty `writes` (the identity/header writers).
- NO-OP: display-only (empty `writes`).
- OUT: answer-store-only / identity-metadata modules.

## Test obligations (per-question, Q7 — `packages/studio/tests/survey/questions/<phase>/<id>.test.ts`)

For each in-scope module, applying `mutate()` to a known IR fixture:
1. changes the IR at **exactly** the declared `writes` paths and nothing else (siblings byte-identical) — M2/SC-002;
2. a patch that would write outside `writes` **fails fast, rejects the whole patch, leaves IR unchanged** — M3/SC-002;
3. is **idempotent** (apply twice = once) — M4/SC-003;
4. round-trips cleanly against the reused existing IR fixtures — SC-004.
