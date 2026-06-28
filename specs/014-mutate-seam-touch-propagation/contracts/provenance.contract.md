# Contract: `TouchKeyIR` provenance field

**Feature**: 014-mutate-seam-touch-propagation | **Status**: RATIFIED (gate cleared per PR #822, 2026-06-28)

> Locked-surface edit **landed in PR #822** (`@keyboard-studio/contracts` 0.11.0 → 0.12.0; §18 joint engine+content session recorded in [docs/spec-signoff.md](../../../docs/spec-signoff.md), reviewed by Matthew Lee — plan gates G-I/G-VI RESOLVED). `TouchKeyIR.provenance?: TouchKeyProvenance` + the zod mirror are present in `packages/contracts`; the editor type is already a re-export. Re-validated against the ratified `KeyboardIR` shape on 2026-06-28 (T000, G-II RESOLVED). Remaining work: the round-trip / default-on-missing tests and re-propagation wiring (front-end tasks).

## Surface

`TouchKeyIR.provenance: "base-derived" | "physical-suggested" | "hand-set"` added in `packages/contracts/src/keyboard-ir.ts`, mirrored in `schemas.ts`, exported from `index.ts`. `editors/assignLoop/provenance.ts` `TouchKeyProvenance` becomes a **re-export**.

## Guarantees

- **P1 (contract field, FR-008)**: each touch key carries the provenance tag as a contract field; the editor type is a re-export (single source of truth, SC-007).
- **P2 (conservative default, FR-009)**: pre-existing / untagged keys default to `hand-set` — never auto-overwritten.
- **P3 (round-trip, FR-010)**: every tag survives serialize → deserialize unchanged (SC-007); legacy/missing → `hand-set` on deserialize.
- **P4 (zod drift guard, Art. I)**: the zod schema is updated in the same change as the type.
- **P5 (MAJOR bump, FR-011/SC-010)**: shipped as a `@keyboard-studio/contracts` MAJOR bump with the §18 coordination note recorded; no consumer absorbs it as a silent minor.

## Test obligations

- Round-trip test in `packages/contracts`: a `KeyboardIR` with provenance-tagged touch keys serializes → deserializes with every tag intact (P3/SC-007).
- A compile/test check that `editors/assignLoop/provenance.ts` resolves to the contracts type (single definition, P1/SC-007).
