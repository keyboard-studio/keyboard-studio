# Implementation Plan: Base-keyboard fallback

**Spec**: [spec.md](spec.md) · **Research**: [research.md](research.md) · **Data model**: [data-model.md](data-model.md) · **Contract**: [contracts/fallback-contract.md](contracts/fallback-contract.md)

## Summary

Four pieces, in dependency order. (1) Generate per-key character data for all 186 catalog layouts by extending the existing base-layout codegen. (2) Add one engine function, `enumerateUnhandledPositions(ir)`, that returns the key-and-modifier positions no rule matches; the leak list, the swallow store and spec 108's fill all call it. (3) Change `FallbackPolicy` in contracts from one value to one value per class (letters, digits, punctuation and symbols), add the per-class proposal logic, and compile `swallowUndefined` as one store plus one `nul` rule written through `mutate()`. (4) Rebuild `FallbackPolicySection` to name the base keyboards, list the leaks per picked base keyboard, show a per-class summary, and keep unconfirmed drafts unchanged until the author confirms.

## Constitution Check

| Principle | Assessment |
|-----------|------------|
| I Pattern schema locked | PASS. `FallbackPolicy` is not part of `Pattern`; the zod schema and drift guards change in the same commit. |
| II IR is the spine | PASS. The enumerator reads the IR; the swallow rule is IR written via `mutate()`. |
| III One working copy, drafts save the envelope | PASS. Policy stays in the working-copy store; migration widens one value to three and records `confirmed: false`. |
| IV Validator layering | PASS. The emitted rule must pass Layer A/B and `kmcmplib`; no new layer. |
| V VirtualFS only | PASS. No host-disk writes. |
| VI Team boundaries | PASS. Engine: enumerator, compile, codegen, surface. Content: surface copy. |
| VII Out of scope | PASS. Touch layouts excluded (spec edge case). |
| VIII House conventions | PASS. `start*`/`base*` vocabulary; no issue numbers in code. |
| IX Decision registry | PASS. Setting stays at its interim host (FR-008). |
| X Defaults are proposals | PASS. Per-class proposals with evidence; unconfirmed drafts do not change (FR-021). |
| XI Done means integrated | PASS. The copy variant is tied to whether swallow is active (SC-003); the owner/trigger follow-up is recorded in the spec. |

D3: no new timer. The leak list is derived on render from the working copy.

## Project Structure

```text
scripts/codegen-base-layouts.mjs          extend BASE_KEYBOARDS to the full catalog (FR-030)
scripts/codegen-windows-layouts.mjs       imports BASE_KEYBOARDS; keep in step
packages/studio/src/lib/generated/baseLayouts.generated.json   regenerated, pinned commit + hashes
packages/studio/src/lib/referenceBaseLayouts.ts (+ codegen test)  widen BaseLayoutId to catalog ids
packages/contracts/src/fallbackPolicy.ts  per-class policy type + default
packages/contracts/src/schemas.ts         zod schema + drift guards
packages/engine/src/pattern-apply/unhandledPositions.ts   NEW enumerator (FR-040)
packages/engine/src/pattern-apply/swallowSet.ts           per-class predicate (FR-012)
packages/engine/src/pattern-apply/swallowUndefined.ts     NEW store + nul rule via mutate() (FR-010, 011, 013)
packages/engine/src/pattern-apply/fallbackPolicy.ts       per-class dispositions (FR-015)
packages/engine/src/pattern-apply/fallbackProposal.ts     NEW per-class proposal + evidence (FR-020)
packages/engine/src/pattern-apply/carvePipeline.ts        thread per-class policy + base chars
packages/studio/src/survey/carve/fallbackPolicyMigration.ts   widen + confirmed flag (FR-021)
packages/studio/src/stores/workingCopyStore.ts            policy shape, confirmed flag
packages/studio/src/editors/fallback/FallbackPolicySection.tsx   rewritten surface (FR-001..006)
packages/studio/src/lib/projectWorkingCopyVfs.ts, projectionInput.ts   pass picks + char data
packages/studio/src/locales/**            lingui ids + French (spec 046)
```

**Structure Decision**: engine owns the enumerator, proposal and compile (pure, no studio import, FR-041); the studio joins characters from generated data and passes them in.

## Phases

1. **Data (US3)**: codegen over all catalog layouts, regenerated JSON, codegen drift test.
2. **Enumerator (US4)**: `enumerateUnhandledPositions`, unit tests, equivalence test against spec 108's fill (SC-005).
3. **Policy + compile (US2)**: contracts change, migration, per-class swallow, `swallowUndefined`, corpus compile through Layer A/B and `kmcmplib` (SC-002).
4. **Surface (US1)**: copy, leak lists, summary, proposals, confirmation; Playwright walk on `sil_cameroon_qwerty` with UK English (SC-001), accessibility (spec 056), i18n.

US1 may ship before phase 3 only with the FR-005 "removed keys only" copy.
