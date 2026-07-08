# Contract: identity-question flow (both flows)

**Owner**: Content (survey text/order/flow) with an Engine dependency (langtags API above). **Files**: `content/flows/identity_lite.modular.yaml`, `content/flows/proposed/phase_a_identity.modular.yaml`, `packages/studio/src/survey/questions/a/*`, `packages/studio/src/survey/IdentityLite.tsx`, `packages/studio/src/survey/questions/registry.a.ts`.

## Question order (post-change)

**Live IdentityLite (`il_*`)** — membership list in `identity_lite.modular.yaml` AND `next` pointers must agree:

1. `il_language_english` — English-name autocomplete (`type: autocomplete`, `options_source: @langtags_iso639`, `required: true`). Free-text accepted (FR-013). `next` → region if `hasRegionVariants`, else `il_language_autonym`.
2. `il_language_region` *(new, conditional)* — region choice from resolved entry's `regionVariants[].regionName` (`required: false`). Only reached when ambiguous. `next` → `il_language_autonym`.
3. `il_language_autonym` — own-script name; options = selected variant's `localNames[]`, free-text override (`required: true`). `next` → `il_language_code`.
4. `il_language_code` — auto-filled confirmation of the resolved subtag (`type: autocomplete`, `required: false`, free-text/blank allowed). `next` → `il_target_script`.
5. `il_target_script`, `il_script_not_supported` — unchanged tail.

**Proposed Phase A (`language_name_*`)** — mirror the same reordering in `phase_a_identity.modular.yaml` + the `language_name_*` modules + `desktop_first_notice.next` (per FR-015). This flow is non-live (Flow Map Library graph only); its `next` chain must stay internally consistent.

## Seeding contract (IdentityLite.tsx)

- `handleAnswerCommit("il_language_english", value)` → resolve the langtags entry into `resolvedEntryRef`; set `selectedVariantRef` to the primary variant; if `regionVariants.length <= 1`, the region step is skipped.
- `handleAnswerCommit("il_language_region", value)` → set `selectedVariantRef` to the chosen variant.
- `getSeedValue("il_language_autonym")` → `selectedVariantRef.localNames` (choices); pre-fill primary when present.
- `getSeedValue("il_language_code")` → `resolvedEntryRef.subtag`.
- `getSeedValue("il_target_script")` → `selectedVariantRef.script` (existing behavior, now sourced from the resolved variant).
- **Invariant**: seed on first arrival only; never overwrite an author-edited value (existing SurveyRunner contract — SC-005). Editing Q1/region via Back re-resolves and re-seeds downstream, without clobbering values the author already customized.
- **Free-text/no match**: `resolvedEntryRef = null` → no seeds; Q2 is a single free-text field, Q3 free-text/blank; every step completable (FR-003).

## BCP47 assembly (FR-011)

`buildTargetBcp47` composes the tag from: confirmed language code (Q3) + resolved script (`il_target_script`) + selected region (`selectedVariantRef.region`, when a region variant was chosen).

## Flow-order contract tests

- `loadModularFlow` on `identity_lite.modular.yaml` yields questions in the new order; membership list and `next` chain agree (parity).
- `flow-parity` / `buildStepGraph` / `stepHost` golden-walk snapshots updated to the new order + region node.
- Region node appears in a walk only when the resolved entry is ambiguous; absent otherwise.
- Per-question fixtures updated: `il_language_english` (autocomplete/first), `il_language_region` (new), `il_language_autonym` (multi-choice), `il_language_code` (confirmation).
- The proposed-flow `language_name_*` order mirrors the live one.
