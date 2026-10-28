# Spec 076 Rule behaviours (carve suppression slice): as built

**Status:** Retired 2026-10-14. Shipped in PR #1854 (squash `fb385fc`, 2026-09-29; amendment A4 in PR #1877, `8a8355c`, 2026-09-30). Tasks: 25/25 complete.
**Full docs:** [specs/_archive/076-rule-behaviours/](../_archive/076-rule-behaviours/) (spec, plan, tasks, research, quickstart). Not read by default.
**Pinned here:** [data-model.md](data-model.md), [contracts/carve-disposition.md](contracts/carve-disposition.md) (code `@see` links in `packages/contracts/src/carveDisposition.ts`; both still normative).

## What shipped
Only User Story 6 (carved key combinations) of the 6-story spec; tasks.md was rescoped to it (issue 1802).
- Carving a key no longer leaves its combination to silent host fallback: each carved combo gets a `block` / `allow-host` disposition.
- Blocked combos compile to suppression rules (`nul` / `context`, plus `beep` when loud), ownership-marked `carve-suppression`.
- Codec types `nul`, `context`, `context(N)` and models `begin` entry points.
- Track 2 import lifts marked rules as behaviour-owned (no shape heuristics).
- Studio: per-row disposition control, review-removed-keys panel, host-consequence table, touch keep-inert control, `layout_family` question, and (A4) a `layout` spine step (community Windows layout picker) after `identity`.

## Public contracts
- `CarveDisposition {comboId, disposition: "block"|"allow-host", provenance}` and zod schemas: `packages/contracts/src/carveDisposition.ts`, `schemas.ts` (CarveDispositionSchema). Provenance: `closed-keyboard-card`, `closed-keyboard-card-declined`, `bulk-default`, `author-override`, `deadkey-requirement`.
- `IRRule.ownedByBehaviour?: string` (mutually exclusive with `ownedByPattern`, zod refine): `keyboard-ir.ts`, `schemas.ts`. Value `"carve-suppression"` = `CARVE_SUPPRESSION_OWNER`.
- `IRHeader.entryPoints?: {main?, newContext?, postKeystroke?}`: `keyboard-ir.ts`.
- `comboId` = rule `nodeId`, or `<storeNodeId>#<index>` for slot carves (from `irToCarveNodes`); stale ids are dropped, never migrated.
- Engine: `compileCarveSuppression(ir, dispositions, {loud})`, `restoreCarveSuppression`, `slotGuardNodeIdPrefix` (`engine/src/pattern-apply/carveSuppression.ts`); `deriveCarvedIr` (`carvePipeline.ts`, shared by `applyCarveToVfs` and the studio editorMutate seam); `isInSwallowSet` (`swallowSet.ts`).
- Verb table and guard-rule shape: see pinned data-model.md.
- Validator: Layer A check #8 emits `KM_ERROR_NUL_WITH_TEXT_OUTPUT` (`engine/src/validator/checks/contextOrdering.ts`); I6 extension in `layer-a-prime.ts`.
- Dispositions persist on the carve overlay (`studio/src/decisions/carveOverlay.ts`, `carveDispositions`).
- Step manifest: `layout` step, `specRef: ["specs/076-rule-behaviours"]` (`studio/src/steps/registerEditorSteps.ts`, `manifest.specref.json`); the stub folder satisfies it.

## Key decisions
- Marker alone identifies owned rules on import; bare `> nul` can be legitimate author content (research D-07).
- Suppression is an in-place rewrite at the shadowing position; store interiors are never `nul`-padded (guard rules go ahead of the paired rule).
- Deadkey carves never fall through (forced `block`, no Allow offered).
- Soft is default; loud only via the A6 strategy answer. Never bare `beep`, never `nul` on a text-bearing context.
- A3: host-layout reference data includes UK English (AltGr+4 leak on `sil_cameroon_qwerty`).

## Gotchas and limits
- US1-US5 (swallowUndefined enumeration, markOnNonBase, canonicalOrder, reorderTable, replace, Behaviours step, cards, test pane, FR-005..FR-017) were NOT built here. Only the `swallowUndefined` skip-set predicate exists (stub enumeration).
- `BehaviourKinds` in `contracts/src/rulePack.ts` is the closed kind set (7 + `authored`).
- Pre-carve audit found 0 new unreachable-rule findings across 10 probes (T021).
- Playwright `carve-disposition-flows` (T023) was not run locally; CI-only.
- FR-014 LHS variant (`"x" + [K_A] > nul` as an error) not implemented.

## Divergences from the spec
- A4 (2026-09-29) withdrew the carve-gallery Allow/Block UI; its components are archived as text under `docs/archive/carve-disposition-ui/`. The contracts, compiler, and overlay data remain live.
- data-model.md says dispositions live in `workingCopyStore.carveDispositions`; code keeps them in the carve overlay (`decisions/carveOverlay.ts`).
- Test pane / Behaviours step do not exist; `CarveHostSelector` was archived unmounted.

## Follow-ups and open issues
- Remaining behaviours: FR-001, FR-005..FR-017 (new spec needed).
- Stale links: `docs/tooling.md:163` cites FR-023 by number only (fine); `specs/082`, `specs/007` cite spec 076 as prose.
- Code cites `spec 076 FRxxx` in comments and resolves to this stub.

## Amendment: keyboard-wide fallback policy (FR-019 per-carve override RETIRED)

Design: [fallback-surface-design.md](fallback-surface-design.md). This amendment is the as-built record; the design doc's Status line points here.

- **FR-019 per-carve override is RETIRED.** The two-tier choice is now one keyboard-wide `fallbackPolicy: "swallow" | "pass-through"` on the working copy (`FallbackPolicy` in `contracts/src/fallbackPolicy.ts`, zod `FallbackPolicySchema` with a drift guard). Per-key Allow/Block, `DispositionControl`, `CarveHostSelector`, the pre-fill effect and the per-combo `carveDispositions` store are gone. The `CarveDisposition` contract type stays: it is the suppression compiler's internal input and the legacy-draft read shape.
- **Source of the decision only.** FR-020..FR-022 suppression mechanics are unchanged. `dispositionsForFallbackPolicy` (`engine/src/pattern-apply/fallbackPolicy.ts`) expands the policy over the live carved ids (deletedNodeIds + deletedItemIds): swallow -> `block`, pass-through -> `allow-host`. `deriveCarvedIr` / `applyCarveToVfs` / `applyCarveMutate` take `fallbackPolicy?` instead of `dispositions`; omitted keeps the legacy no-suppression path. `isInSwallowSet(combo, policy, ir)`: pass-through -> not in the set; behaviour-covered -> not in the set; otherwise in.
- **Backstops unchanged.** `compileCarveSuppression` still coerces `allow-host` on a deadkey-context rule to `block`, so a pass-through policy never leaves a deadkey armed. The UI states this as a rule, not a choice.
- **Removals that are not carves.** Disabled-family rules ride `deletedItemIds` but are plain removals; `suppressionExemptIds` keeps them out of the policy expansion so they are filtered, not rewritten into `nul` rules.
- **Flat default.** `swallow` for every keyboard. The script-based `sparseLatinOverlay` / `bulkDispositionDefault` logic and `isSparseLatinOverlayTarget` are removed.
- **`closedKeyboardCard` folded in and removed.** Migration (`survey/carve/fallbackPolicyMigration.ts`, used by draft restore and the carved-layout decision read): a current `fallbackPolicy` wins; card accepted -> swallow; declined -> pass-through; no card but dispositions present and every non-deadkey disposition `allow-host` -> pass-through; otherwise swallow. Loads never throw; the legacy fields are dropped on the next save. Fixtures `prePrDraft.json` and `v1-draft-18e63aa4.json` keep their legacy shape and are exercised by `workingCopyStore.fallbackPolicy.test.ts`.
- **Not part of the carved-layout decision value.** New values carry only `removals`; legacy values with `dispositions` / `closedKeyboardCard` still read (`legacyFallbackPolicy` on the overlay slice). Replay rebuild deliberately does not install the policy: it is an author-set working-copy setting (registry class EDITOR-AUTHORED), and a carve-time snapshot would revert a later choice.
- **Interim UI host.** The Behaviours step has not landed, so the radio group lives in a collapsible section at the bottom of the Assign Mechanisms step (`editors/fallback/FallbackPolicySection.tsx`, mounted by `AddPhysicalAdapter`). Never in the carve step. No new step, no step-order change. It moves to the Behaviours step when that exists.
- **Review carved keys.** A plain, disposition-free review (`editors/carve/ReviewCarvedKeys.tsx`, button in the carve gallery status strip; rows from `lib/carvedCombo.ts`). It is a carve review, not a fallback control.
- **Standing copy rules.** Each option states its own risk; neither is recommended; host output is "best guess, not sight" with "unknown" where no reference cell exists. The retired one-sided slogan is asserted absent from `packages/**` by `editors/fallback/retiredSlogan.test.ts`.
