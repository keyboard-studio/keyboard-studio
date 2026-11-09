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

## 2. Search coverage and parity (SC-001, SC-002, SC-007, SC-009)

```sh
pnpm --filter @keyboard-studio/studio exec vitest run src/survey/languageChooser src/survey/resolveTypedLanguage
```

Expect four printed measurements:
- `glottolog dialects with ISO parent in top 5: >= 95%` (baseline 931/13392, about 7%).
- `langtags dialect tagsets reachable: 229/229`.
- `top result code vs today: 200 sampled, N exceptions = fixture`.
- `ethnolib codes in pinned langtags, same default script: all but fixture`.

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
3. **Made-from-name subtag.** Pick a Glottolog-only dialect, e.g. `Yabekolo` (an Ewondo dialect). The proposal is `ewo-x-yabekolo (made from the name)`.
   - Edit it to `yabekolo-east`: Confirm is disabled, with the reason "private-use subtags are 1-8 letters or digits".
   - Contrast: `Aranese` proposes `oc-aranes` (registered variant), and `Sursilvan` proposes `rm-sursilv`.
4. Change the language to Catalan. The dialect answer is flagged as re-proposed, not silently kept.
5. **Autosuggest kept (FR-038).**
   - Type `Ewon`: suggestions appear as you type, with Ewondo's card content.
   - Type `Ewondo` and tab away without clicking: it resolves, and code `ewo`, script and autonym are proposed.
   - Type `Bafutt`: Bafut is suggested.
6. **Nothing matches (US6).**
   - Type `bft`: Balti is proposed for confirmation.
   - Type `oc-gascon`: Occitan with the Gascon dialect.
   - Type a made-up name, choose "… is a dialect: find its language", then pick Occitan: the dialect step proposes `oc-x-…` from the name.
   - Choose "My language isn't listed" with no code: `qaa-x-…` is proposed. With code `zzz`: a warning.
   - In every case the code question shows a confirmed, non-blank code (SC-008).
7. **Open path.** Open a keyboard and add `sr-Latn-RS` to the language list: a hint offers "Use `sr-Latn`". Add `sq-AL-gheg`: an error.

## 6. Gates

```sh
pnpm lint
pnpm --filter @keyboard-studio/studio exec vitest run src/steps src/decisions src/lib/legacyStepIds.test.ts
```

The parity pins (`stepOrder.parity`, `orderParity`, `legacyStepIds`, `manifest.specref.json`) are updated in the same change as the new question.
