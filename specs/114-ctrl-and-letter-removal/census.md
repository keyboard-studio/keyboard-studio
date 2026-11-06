# Raw Ctrl census (SC-001)

Run on 2026-11-06 over `../keyboards/release` (920 keyboards with a `source/<id>.kmn`, all parsed by the codec, no failures). The detector is the shipped `findRawCtrlRules` in `packages/keyboard-lint/src/checks/criteria/check-raw-ctrl.ts` (criterion 7.29), fed by the engine codec `parse`. The throwaway script lived outside the repo.

## Counts

| Measure | Keyboards |
|---|---|
| Any rule on unsided `CTRL` without Alt (before exemptions) | 59 |
| Reported by 7.29 (after exemptions) | 39 |
| Reported, by key class (a keyboard can be in several): number row | 8 |
| Reported: letters | 11 |
| Reported: punctuation | 36 |
| Raw Ctrl on Space only, not reported (non-basic) | 9: farsi_phonetic, galaxie_greek_mnemonic, galaxie_greek_positional, galaxie_hebrew_mnemonic, hieroglyphic, jawa, sil_bunong, sil_khmer, sil_tai_dam_latin |
| `basic_*` keyboards with raw Ctrl (never reported) | 9 |
| Rules on an ASCII digit typing that same digit (exempt) | 4 keyboards have such a rule |

Supporting measure (output no other plain key produces, i.e. the spec's "unique output" notion, before exemptions): 44 keyboards; number row 18, letters 11, punctuation 26, Space 6.

## Differences from the spec figures

The spec reports: 131 keyboards on unsided Ctrl; 31 with unique output; number row 18, letters 11, punctuation 13, Space 5.

- **131 vs 59.** Not reproduced. Counting any Ctrl modifier flavour (`CTRL`, `LCTRL`, `RCTRL`, with or without Alt) gives 127; unsided `CTRL` with or without Alt gives 85; unsided `CTRL` without Alt gives 59. The spec's 131 most likely counted the `CTRL ALT` (AltGr) and sided rules too, which FR-001 excludes, and may have scanned rule text rather than parsed rules. Reason: FR-001 scope is raw Ctrl without Alt.
- **Letters 11 vs 11 and number row 18 vs 18.** These match when measured as "unique output" (supporting measure). The reported counts differ (letters 11, number row 8) because 7.29 exempts a Ctrl+digit rule typing the same digit, and number-row reports need output the digit key itself would not produce. The spec's 18 included keyboards whose Ctrl+digit rules are only the digit itself (4 keyboards) and rules whose output also exists elsewhere.
- **Punctuation 13 vs 36 (reported) / 26 (unique).** The detector reports every raw-Ctrl rule on any non-Space, non-digit-identity key, including deadkey and context group rules (ruled 2026-11-06) and Shift+Ctrl planes, and does not require the output to be unique. The spec's 13 counted only outputs no other key produces.
- **Space 5 vs 6 (unique) / 9 (any, not reported).** Space is exempt in 7.29, so it never appears in reported counts; the nine Space-only keyboards above are correctly silent. The spec's 5 counted unique-output special spaces only.
- **31 vs 39 reported.** The reported set (39) is broader than the "unique output" set because 7.29 does not test uniqueness; it also reports rules whose output duplicates a plain key (for example Shift+Ctrl letters in esperanto_sava_eujao that type the plain letter). Those are shortcut-collision cases, still raw Ctrl.
- **esperanto_sava_eujao** is reported. It is not a false positive under the final rule: it has Shift+Ctrl rules on punctuation typing characters such as the division sign, the section sign and the yen sign.
- **ewe** is reported (accented vowels on Ctrl+digits). **sil_bunong** is not reported (Ctrl+Space only). Both match User Story 1.

Result for SC-001: every keyboard with Ctrl output on a letter, number or punctuation key (outside basic_*) is reported; the nine Space-only keyboards are not; the figures that differ from the census differ for the reasons above.
