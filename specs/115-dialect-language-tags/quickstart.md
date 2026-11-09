# Quickstart: validating spec 115

**Spec**: [spec.md](spec.md) | **Contracts**: [contracts/](contracts/)

## Prerequisites

- Node ≥ 22.19, pnpm 9, `pnpm install`.
- `pnpm build` (runs prebuild: langtags, Glottolog, and the new variant codegen).
- `../keyboards` checked out at the `keyboard-studio/keyboards` fork's `master`, for the corpus checks (they skip visibly without it).

## 1. Parser and minimal tag (contracts, engine)

```sh
pnpm --filter @keyboard-studio/contracts exec vitest run src/utils/bcp47.test.ts
pnpm --filter @keyboard-studio/engine exec vitest run src/langtags
```

Expect: every row of the tables in [bcp47-parser.md](contracts/bcp47-parser.md) and [langtags-api.md](contracts/langtags-api.md) passes. The property test reports `9596/9596 tagsets: minimalTag(full) === tag` (SC-003).

## 2. Search coverage (SC-001, SC-002, SC-007)

```sh
pnpm --filter @keyboard-studio/studio exec vitest run src/survey/resolveTypedLanguage
```

Expect three printed measurements:
- `glottolog dialects with ISO parent in top 5: >= 95%` (baseline 931/13392, about 7%).
- `langtags dialect tagsets reachable: 229/229`.
- `language-name top result unchanged: 200/200` sampled queries.

## 3. Keyman parity (SC-004)

```sh
pnpm --filter @keyboard-studio/engine exec vitest run src/langtags/kmcParity.corpus.test.ts
```

Expect: 4,691 language IDs checked; disagreements equal to the fixture's list, each with a reason; zero unlisted.

## 4. Preservation (SC-005)

```sh
pnpm --filter @keyboard-studio/engine exec vitest run src/ldml-export src/start-browser
```

Expect: a fixture `.kps` listing `en-US-x-twain` and `fr-u-co-phonebk` round-trips through Open into `.kps`, help documents and LDML with both tags whole; script read as none for both.

## 5. Manual walk (Playwright, SC-006)

Script with the Playwright CLI against `pnpm dev`:

1. **Copy path.** On the language step, type `Gascon`.
   - The first result reads `Occitan … Gascon: a dialect of Occitan (oc) · ES, FR`.
   - Pick it. No region screen appears (Occitan has one region); "Specify a region…" is available.
   - The dialect question shows `Tag: oc-gascon (registered variant for Gascon)`. Confirm. That is three actions after typing.
   - Separately: pick French, use "Specify a region…", choose Canada. The tag is `fr-CA`. Choose France instead, and the tag is `fr`.
   - Build. The `.kps` has one `<Language ID="oc-gascon">`.
2. Repeat with `Rabinal`: the proposal is `acr-x-rabinal (langtags)`.
3. **Made-from-name subtag.** Pick a Glottolog-only dialect, e.g. `Aranese`. The proposal is `oc-x-aranese (made from the name)`.
   - Edit it to `aranese-valley`: Confirm is disabled, with the reason "private-use subtags are 1-8 letters or digits".
4. Change the language to Catalan. The dialect answer is flagged as re-proposed, not silently kept.
5. **Open path.** Open a keyboard and add `sr-Latn-RS` to the language list: a hint offers "Use `sr-Latn`". Add `sq-AL-gheg`: an error.

## 6. Gates

```sh
pnpm lint
pnpm --filter @keyboard-studio/studio exec vitest run src/steps src/decisions src/lib/legacyStepIds.test.ts
```

The parity pins (`stepOrder.parity`, `orderParity`, `legacyStepIds`, `manifest.specref.json`) are updated in the same change as the new question.
