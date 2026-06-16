# Quickstart: Defaults engine validation

Runnable scenarios that prove the feature end-to-end. Maps each user story (US1–US5) and success criterion (SC-001…SC-006) to a concrete check. Contracts and types are in [contracts/proposers.md](contracts/proposers.md) and [data-model.md](data-model.md) — not repeated here.

## Prerequisites

```bash
pnpm install
pnpm build            # runs prebuild: fetches pinned kmcmplib.wasm, CLDR, and (new) langtags.json
```

- A keyboard whose BCP47 tag resolves in `langtags.json` (for autonym, US1).
- A session on the GitHub-OAuth path (for the authenticated copyright identity, US1) and a ZIP-path run (for the no-identity edge case).
- A keyboard with ≥ 1 special character and a completed assignment map (for the Phase F table, US2).

## Unit-level validation (engine, pure proposers)

```bash
pnpm --filter @keyboard-studio/engine test src/proposers
pnpm --filter @keyboard-studio/engine test src/langtags
pnpm --filter @keyboard-studio/contracts test          # axisFills/DefaultProposal zod drift guards
```

Expected: proposers are deterministic (same `ProposerContext` → identical `ProposerResult`); every emitted `DefaultProposal` has a `ProvenanceLabel` (SC-003); each decision point yields a proposal **or** a `NoDefaultDecision`, never neither (SC-001).

## Scenario US1 — Identity phase is never a blank form (P1)

1. Start a GitHub-path session for the langtags-resolvable keyboard; advance to Phase A.
2. **Copyright (FR-002)**: the holder question offers *you / an organization*; *you* is seeded with the authenticated identity and a provenance chip; the submitter is **not** silently asserted. Switch to ZIP path → *you* falls to the representative, then a hinted prompt (edge case).
3. **Autonym (FR-003)**: pre-filled from the langtags `localname`, labeled `langtags`; force a tag with no langtags entry → falls to CLDR, labeled `cldr`; remove both → hinted prompt, recorded as a `NoDefaultDecision` (edge case), never blank.
4. **Display name (FR-004)**: the scaffolder's provisional value (from the English name) appears as an editable confirmation at the documentation stage.

**Pass**: no empty field appears in Phase A in the common case; every pre-fill shows provenance and is editable (SC-002, SC-003).

## Scenario US2 — Help documentation writes its own first draft (P1)

1. Complete Phases A–E for the multi-special-character keyboard; open Phase F.
2. The help body shows a **character→keystroke table** built from `confirmedInventory` + the assignment map (`effectiveMechanisms()`), plus an editable narrative.
3. Disable the LLM backend and reopen: the deterministic skeleton (title, autonym, table) still renders; only the narrative is skipped (FR-009 edge case).
4. Edit the draft and finalize: the secondary help format is regenerated from the confirmed content (parity).

**Pass**: help body non-empty on first view; the keystroke table matches the assignment map exactly (SC-004); no keystroke instruction is model-generated.

## Scenario US3 — Advisory questions arrive pre-answered (P2)

1. Run Phase B for a language whose BCP47 tag carries a region.
2. **Coexisting keyboards (FR-005)**: proposed from the region's official/contact languages cross-checked with Q1; the "only keyboard?" sub-question defaults from the region signal; **no** claim of OS/browser layout detection. Remove the region subtag → degrades to a hinted "only keyboard?" question (edge case).
3. **Primary use case (FR-006)**: pre-selected from A1 scale + region/speaker-count + Q1; changing it is allowed; it never blocks phase exit.

**Pass**: both advisory questions are pre-proposed with provenance and remain skippable/non-gating.

## Scenario US4 — Technical defaults pre-selected (P2)

1. Run Phase C′ for an Indic abugida: the family's canonical reorder is **pre-selected and ranked** with `derived-from-axis` provenance; swapping to another gallery entry is allowed; a family with no convergent reorder shows ranked candidates with **no forced selection** (FR-007 edge case).
2. Run Phase E for a keyboard with shift + AltGr planes: modifier-derived layers take standard layer ids automatically; only an author-added non-modifier plane prompts for a name (with a hinted default) (FR-008).

**Pass**: no blank reorder list; no author-typed layer ids for modifier-derived layers.

## Scenario US5 — Auditable proposals, blanks caught (P3)

1. Inspect any proposal → it carries a provenance label and is overridable in place (FR-010, SC-003).
2. Complete a survey → the origin of each filled discovery axis is recoverable from `SurveySession.axisFills` (FR-011, SC-005).
3. Force a derivable field blank (delete the seeded value, leave it empty) and attempt phase exit → the defaults-audit raises a `warning`-band `LintFinding` (the yellow check band), blocking silent acceptance (FR-013, SC-006). Confirm a `NoDefaultDecision` left blank does **not** raise a defect.

**Pass**: every axis fill's origin is recoverable; a derivable-but-blank field is reported before submission and none reaches the output artifact silently.

## E2E note

Playwright specs under `packages/studio/e2e/` remain `.skip`-ped (not wired up). Add the propose-then-confirm flows there following the unblock recipe at the top of each spec when E2E is enabled; until then, US1–US5 are validated by engine unit tests + the studio adapter's component tests.
