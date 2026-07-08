# Contract: identity-question flow (both flows)

**Owner**: Content (survey text/order/flow) with an Engine dependency (langtags API above). **Files**: `content/flows/identity_lite.modular.yaml`, `content/flows/proposed/phase_a_identity.modular.yaml`, `packages/studio/src/survey/questions/a/*`, `packages/studio/src/survey/IdentityLite.tsx`, `packages/studio/src/survey/questions/registry.a.ts`.

## US1 structural decision — option 1 "mechanism-clean" (as shipped), 2026-07-08

Mechanism finding: the langtags autocomplete field (`LangtagsAutocompleteField`,
`options_source: "@langtags_iso639"`) **commits the language CODE** as the answer
(QuestionField.tsx: "the datalist value is the language code") and resolves to
exactly one unambiguous langtags entry. Committing the *name* instead would
reintroduce homonym ambiguity (T008: "Ainu" → aib/ain). Making the picker's field
show/commit the name (faithful "option A") fights that unambiguity, so the chosen
realization keeps the picker **code-committing** and derives the display fields as
*seeded confirmations* — this is what shipped:

- **Q1 = the langtags picker `il_language_code`** (already `type: autocomplete`,
  `options_source: "@langtags_iso639"`), promoted to FIRST and reworded to lead
  with the English name. The author types the English name, picks a suggestion,
  and the committed **code** resolves the entry.
- **Q2 `il_language_english`** and **Q3 `il_language_autonym`** stay as `text`
  fields but are **PRE-FILLED (seeded)** from the resolved entry's `englishName`
  / `autonym` (editable confirmations). Q3 becomes a multi-choice picker over
  `localNames` in US2; a single-value seed for now.
- **No separate code-confirmation step and NO `extractIdentityLite` inversion.**
  Because english/autonym remain stored `text` answers (just pre-filled),
  `extractIdentityLite` is **UNCHANGED** — `english` ← `il_language_english`,
  `autonym` ← `il_language_autonym`, `languageSubtag` ← `il_language_code`. This
  is why the shipped change is a low-risk reorder+seed rather than the delicate
  extraction inversion the earlier "option A" sketch implied.

Seeding wiring (`IdentityLite.tsx`): the `il_language_code` commit resolves the
entry (async `loadLangtags`) and sets `englishNameSeedRef` / `autonymSeedRef` /
`scriptSeedRef` + provenance; `getSeedValue` returns those for
`il_language_english` / `il_language_autonym` / `il_target_script`. The old
autonym→English seed and `autonymRef` are removed. SurveyRunner's
"seed-on-first-arrival, never overwrite" contract preserves author edits.

(The `regionVariants`/region-disambiguation and multi-choice localNames land in
US3/US2 — the picker-first order shipped in US1 is the platform for them.)

## Question order (post-change)

**Live IdentityLite (`il_*`)** — SHIPPED (US1); membership list in `identity_lite.modular.yaml` AND `next` pointers agree:

1. `il_language_code` — the langtags picker, FIRST (`type: autocomplete`, `options_source: @langtags_iso639`, `required: false`). Author types the English name and picks a suggestion; the committed **code** resolves the entry. Free-text/blank accepted (FR-003/FR-013). `next` → `il_language_english`. *(US3 will route here to `il_language_region` first when `hasRegionVariants`.)*
2. `il_language_english` — English-name confirmation (`type: text`, `required: true`), PRE-FILLED from the resolved entry's `englishName`; editable. `next` → `il_language_autonym`.
3. `il_language_autonym` — own-script name (`type: text`, `required: true`), PRE-FILLED from the resolved entry's `autonym`; editable. `next` → `il_target_script`. *(US2 turns this into a multi-choice over `localNames[]` + free-text override.)*
4. `il_target_script`, `il_script_not_supported` — unchanged tail. *(US3 inserts a conditional `il_language_region` between the picker and `il_language_english`, shown only when the resolved subtag has >1 region variant.)*

**Proposed Phase A (`language_name_*`)** — mirror the same reordering in `phase_a_identity.modular.yaml` + the `language_name_*` modules + `desktop_first_notice.next` (per FR-015). This flow is non-live (Flow Map Library graph only); its `next` chain must stay internally consistent.

## Seeding contract (IdentityLite.tsx)

SHIPPED (US1):
- `handleAnswerCommit("il_language_code", code)` → resolve the entry (async `loadLangtags` → `getLanguageDefaults`); reset then set `englishNameSeedRef` (`englishName`), `autonymSeedRef` (`autonym`), `scriptSeedRef` (mapped script), and provenance for the fields actually seeded.
- `getSeedValue("il_language_english")` → `englishNameSeedRef` (undefined when unmatched → author types it).
- `getSeedValue("il_language_autonym")` → `autonymSeedRef` (frequently undefined — ~60% of languages have no local name → free text).
- `getSeedValue("il_target_script")` → `scriptSeedRef` (unchanged mapping).
- `extractIdentityLite` is UNCHANGED: `english` ← `il_language_english`, `autonym` ← `il_language_autonym`, `languageSubtag` ← `il_language_code`. The old autonym→English seed and `autonymRef` are removed. SurveyRunner's "seed on first arrival, never overwrite" preserves author edits.

DEFERRED (US2/US3):
- US2: `getSeedValue("il_language_autonym")` returns the resolved entry's `localNames` as multi-choice options (still free-text override).
- US3: `handleAnswerCommit("il_language_region", …)` + a `selectedVariantRef`; region routing shown only when `regionVariants.length > 1`; script/localNames then sourced from the selected variant.
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
