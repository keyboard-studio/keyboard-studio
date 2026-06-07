# Corpus analysis — Keyman keyboard scan

This is the durable narrative analysis of the keyboard corpus that backs the studio's pattern gallery. It is the Content team's deliverable of record and the Day-4 Engine-team handoff. Per-keyboard detail lives in [keyboard-catalog.md](keyboard-catalog.md).

---

## Executive summary

This document is a systematic study of 27 real Keyman keyboards drawn from the `keymanapp/keyboards` repository — the shared catalog that backs Keyman's download platform. Twenty-two of them were chosen because they are among the most-downloaded keyboards on keyman.com, meaning they represent the typing tools that actual language communities rely on every day. The remaining five were chosen deliberately for a different reason: they each contain at least one known imperfection, making them useful as test cases for the studio's automated quality checks. Together the set covers a wide arc of the world's writing systems — Latin-script languages from Western Europe to the Pacific Northwest, the Ethiopic syllabary used across the Horn of Africa, the Myanmar and Tamil writing systems, Arabic-script right-to-left languages, Canadian Aboriginal Syllabics, and the newly encoded Wancho script of northeast India.

The most striking finding is how few underlying mechanisms cover so many different languages. Across 22 clean keyboards representing scripts from a dozen language families, the studio observed only a handful of distinct strategies: a key producing a single fixed character; a "prefix" key that is pressed before a letter to add an accent to it; a mechanism that looks at what is already on screen and quietly reshapes it when the next key is pressed; and a cycling system where pressing a tone key a second time replaces the first tone rather than stacking another one on top. Even the most technically complex keyboards in the set — the Burmese, Tamil and Javanese keyboards, where the written shape of a syllable depends on its neighbours — turn out to use combinations of these same four or five building blocks. This convergence across scripts is the single most useful empirical finding for the studio's pattern gallery: the gallery does not need a unique design for every script; it needs a well-designed set of composable building blocks.

The most-downloaded keyboards are also, in general, well-built. Every one of the 22 keyboards that were selected for their popularity compiled cleanly, declared correct authorship and copyright information, and behaved as its documentation claimed. Where the clean keyboards had caveats, those were minor stylistic matters — an older header format here, a legacy Caps Lock rule there — rather than broken behaviour.

The problems that do appear belong to a different category: paperwork, not function. The automated hygiene scan of all 102 keyboards in scope found 41 flags across 27 keyboards, and the five types of flag found are all documentary in nature. The most common (22 flags across 22 keyboards) is a version number written into a user-facing document — a README file or install screen — rather than kept solely in the source file where it belongs; when that version is later updated in the source, the document silently falls out of step. The next most common (12 flags) is a copyright line that is missing the required word "Copyright" before the copyright symbol, a detail that matters because the toolchain actually checks the exact format when assembling a distributable package. Four keyboards are missing the short description file that is shown to users at install time. Two have a mismatch between the version in the changelog and the version in the source file itself. One keyboard redundantly lists both a catch-all platform target and a specific platform that the catch-all already covers. None of these prevent the keyboard from typing correctly, but each is the kind of thing that would stop a new keyboard from passing the community repository's standard review.

The fifth keyboard in the rough set is in a class of its own, because it sits in the `release/` folder — the tier of keyboards considered ready for general distribution — yet it commits developer-local build artefacts (compiled binary outputs and a personal settings file) alongside the source. This shows that housekeeping failures are not confined to the experimental tier and confirms that an automated linter needs to check `release/` keyboards too.

For the studio's pattern gallery, the corpus shapes two decisions. First, a small number of well-documented composable patterns can realistically cover the needs of most writing systems represented in the popular download tier. Second, the metadata and file-layout requirements around a keyboard (version tracking, copyright format, install documentation) are a separate concern from the typing logic, and the studio's quality layer needs to check both independently. This document exists as the durable empirical record for both decisions and as the handoff to the Engine team for the integration milestone on Day 4.

---

## Corpus shape

### Breadth — the full automated scan

The automated scan covered 1,026 keyboards from `keymanapp/keyboards`. Mobile classification results:

| Verdict | Keyboards |
|---|---|
| DEVELOPED (hand-edited mobile layout) | 670 |
| DEFAULT_SCAFFOLD (untouched default) | 280 |
| DESKTOP_ONLY | 76 |

Top `.kmn` primitives by number of keyboards using them (from [scan_summary.md](scan_summary.md)):

| Primitive | Keyboards using | Total occurrences |
|---|---|---|
| `store(` | 1,021 | 24,400 |
| `use(` | 1,021 | 2,078 |
| `any(` | 576 | 57,019 |
| `index(` | 489 | 32,305 |
| `nul` | 277 | 1,686 |
| `dk(` | 255 | 14,653 |
| `context` | 235 | 7,562 |
| `caps` | 149 | 7,938 |
| `beep` | 149 | 1,494 |
| `deadkey(` | 63 | 1,777 |
| `platform(` | 40 | 281 |
| `set(` | 23 | 447 |

### Focus — the 27 popular hand-scanned keyboards

The hand-scan targeted 27 keyboards selected by rank on keyman.com monthly downloads, so the set reflects layouts people actually use. Twenty-two were clean positive references; five were chosen deliberately as rough examples (known hygiene defects) to serve as negative fixtures for `@keymanapp/keyboard-lint`.

By spec §9 group, the 22 clean keyboards split as follows:

| Group | Count |
|---|---|
| QWERTY/QWERTZ | 9 |
| AZERTY | 3 |
| Non-Roman | 10 |

Scripts represented: Latin (Europe, Francophone and Anglophone Africa, Philippines, Pacific Northwest, West Africa), Ethiopic syllabary, Tamil and Devanagari (Indic), Myanmar/Khmer/Javanese (SEA Brahmic), Arabic abjad (right-to-left), Canadian Aboriginal Syllabics. The 5 rough keyboards span QWERTY/mobile Latin (elfdalian, alkelang), AZERTY (clavbur9), and Non-Roman syllabary (gff_geez_emufi: Ethiopic; wancho: Wancho script).

---

## Patterns by frequency

The table below maps each strategy in the spec §7.3 catalog (S-01..S-12) to two independent evidence sources: tallied occurrences across the 27 hand-scanned keyboards documented in [keyboard-catalog.md](keyboard-catalog.md), and corpus-wide primitive signals drawn from the 1,026-keyboard automated scan in [scan_summary.md](scan_summary.md). "Observed" counts include both primary and secondary appearances (a keyboard that uses S-02 as a secondary under a primary S-08 strategy contributes 1 to the S-02 tally).

| Strategy (S-code + name) | Observed in the 27 (count + notes) | Corpus-wide signal | Pattern YAML |
|---|---|---|---|
| S-01 Simple swap | 7 (primary in 5: sahaptin_umatilla, basic_kbdfr, pak_urdu_phonetic, saraiki, wancho; secondary in sil_akebu, elfdalian) | No distinctive primitive: store()/use() are present in 1,021 kbds regardless; simple swap uses none of the rarer markers | [simple-swap.yaml](patterns/substitute/simple-swap.yaml) |
| S-02 Deadkey composition | 13 (primary in 6: sil_euro_latin, sil_philippines, sil_tchad_qwerty, sil_uganda_tanzania, sil_eastern_congo, clavbur9; secondary in 7 others) | `dk(` in 255 keyboards / 14,653 occurrences — the strongest single-primitive signal in the corpus | [deadkey-single-tap.yaml](patterns/desktop-input/deadkey-single-tap.yaml) |
| S-03 Sequence replace | 11 (primary in 3: remington_gail, basic_kbdkni, gff_geez_emufi; secondary in 8 others as a finishing/reorder group) | `context` in 235 keyboards / 7,562 occurrences — the direct implementation primitive | [multi-char-sequence.yaml](patterns/desktop-input/multi-char-sequence.yaml), [context-sensitive-substitution.yaml](patterns/desktop-input/context-sensitive-substitution.yaml) |
| S-04 Parallel-store lookup | 17 (secondary in 17 keyboards; never observed as primary — per spec §7.3, a building block) | `any(` in 576 keyboards / 57,019 occurrences; `index(` in 489 keyboards / 32,305 occurrences — by far the largest raw counts in the corpus | — pending (building-block; not a standalone pattern) |
| S-05 Mnemonic spelling / transliteration | 5 (primary in 3: gff_amharic, sil_ethiopic_power_g, gff_geez_emufi; secondary in 2: fv_plains_cree, jawa) | No isolated primitive signal; relies on the same store/any/index infrastructure as S-04 | [mnemonic-spelling.yaml](patterns/transliteration/mnemonic-spelling.yaml) |
| S-06 Chained deadkeys (two-tier) | 3 (secondary only: sil_cameroon_azerty, sil_philippines, sil_akebu; no primary in the 27) | `deadkey(` in 63 keyboards / 1,777 occurrences (distinct from `dk(`; this is the explicit named-deadkey form used in multi-tier chains) | — pending |
| S-07 Diacritic cycle | 2 (primary in 1: sil_yoruba_dot; secondary in 1: sil_tchad_qwerty for gliding/contour tones) | `match` in 144 keyboards / 169 occurrences + `nul` in 277 keyboards / 1,686 occurrences — the cycle-advance idiom uses both | — pending |
| S-08 RAlt modifier-layer | 12 (primary in 5: sil_cameroon_qwerty, sil_cameroon_azerty, sil_akebu, elfdalian, alkelang; secondary in 7 others) | No single primitive is exclusive, but the pattern occurs wherever A7=fully-booked; indirect evidence from RALT key combinations throughout the corpus | [modifier-as-layer-switch.yaml](patterns/desktop-input/modifier-as-layer-switch.yaml), [flick-gestures.yaml](patterns/touch/flick-gestures.yaml), [hint-characters.yaml](patterns/touch/hint-characters.yaml), [multitap.yaml](patterns/touch/multitap.yaml) |
| S-09 Context-sensitive cluster formation | 4 (primary in 4: sil_myanmar_my3, thamizha_tamil99_ext, fv_plains_cree, jawa; no secondary appearances) | `context` in 235 keyboards (shared with S-03); `if(` in 89 keyboards / 40,993 occurrences — the conditional-state guards common in cluster keyboards | [indic-pre-base-vowel.yaml](patterns/reorder/indic-pre-base-vowel.yaml), [sea-stack-reorder.yaml](patterns/reorder/sea-stack-reorder.yaml), [tone-mark-canonicalization.yaml](patterns/reorder/tone-mark-canonicalization.yaml) |
| S-10 Constraints + beep | 6 (primary in 1: el_naija; secondary in 5: sil_cameroon_qwerty, sil_cameroon_azerty, jawa, alkelang, clavbur9) | `beep` in 149 keyboards / 1,494 occurrences — a reliable direct signal | [constraints-beep.yaml](patterns/validation/constraints-beep.yaml) |
| S-11 Stateful option toggle | 1 (secondary only: clavbur9, for its schwa-convention toggle) | `set(` in 23 keyboards / 447 occurrences; `if(` in 89 keyboards / 40,993 occurrences — the runtime variable infrastructure | — pending |
| S-12 DLL IME callout | 0 (no appearances; no CJK keyboard in the popular set) | No corpus signal in the 27; at corpus scale, `platform(` in 40 keyboards hints at CJK IME-adjacent patterns, but this is indirect | [dll-ime-callout.yaml](patterns/ime/dll-ime-callout.yaml) |

### Commentary

**What dominates.** S-02 (deadkey composition) and S-04 (parallel-store lookup) together define the structural core of Latin-script keyboard authoring. S-02 appears in 13 of the 27 scanned keyboards, and S-04 is present as a secondary in 17 — the `any(`/`index(` pair that S-04 uses generates the two highest raw occurrence counts in the 1,026-keyboard corpus (57,019 and 32,305 respectively). These two strategies are inseparable in practice: the deadkey-single-tap pattern correctly declares `combinesWith: ["S-04"]` and every corpus S-02 keyboard examined uses `any()`/`index()` to collapse its deadkey tables. S-08 (RAlt modifier-layer) is the third most frequent overall (12 appearances) and is the default secondary for any fully-booked keyboard, consistent with the §7.2 rule 10 add-on semantics. All three strategies have pattern files; S-04 is correctly omitted as a standalone file because spec §7.3 defines it as a building block rather than a primary.

**The Indic and SEA cluster.** S-09 (context-sensitive cluster formation) is the primary strategy for all four non-Latin abugida keyboards in the clean set — sil_myanmar_my3, thamizha_tamil99_ext, jawa, and fv_plains_cree. It never appears as a secondary, which is consistent with the §7.2 decision tree: rule 2 fires early and exclusively for abjad and cluster-sensitive abugida scripts. Two pattern files cover the two sub-patterns the corpus evidences: pre-base vowel reordering for Indic scripts ([indic-pre-base-vowel.yaml](patterns/reorder/indic-pre-base-vowel.yaml)) and subscript-consonant reordering for SEA Brahmic scripts ([sea-stack-reorder.yaml](patterns/reorder/sea-stack-reorder.yaml)). The nfd-latin reorder pattern has no `strategyId` field by design: it is a pipeline stage auto-applied by the scaffolder, not an output strategy the gallery surfaces.

**What is rare or peripheral.** S-07 (diacritic cycle) appears in only 2 of the 27 keyboards. The `match` primitive used to implement it shows up in 144 corpus keyboards, but for most of those the cycle is a minor secondary mechanism; only sil_yoruba_dot elevates it to a primary strategy. S-11 (stateful orthography toggle) appears in exactly one keyboard in the set — clavbur9's schwa-convention switch — and only as a secondary. The spec §7.3 card for S-11 names a Yoruba keyboard outside the popularity-ranked selection as its real exemplar, which explains the low count rather than reflecting low corpus prevalence. The §7.5 self-check table records the EuroLatin and IPA keyboards as intentional v1.1 gaps; those gaps remain open and are not introduced by this scan.

**What is absent and why.** S-12 (DLL IME callout) has zero appearances. The corpus of popular keyboards by download count contains no CJK keyboard because CJK users on mobile and desktop are served by OS-native input methods rather than Keyman. Spec §16 explicitly places CJK out of v1 scope. The two Ethiopic keyboards in the scan (gff_amharic, sil_ethiopic_power_g) use S-05 mnemonic transliteration, not S-12, confirming they are in the reachable part of the catalog.

---

## Exemplary keyboards

**EuroLatin (SIL)** serves writers of several hundred languages — European, African, Pacific and Indigenous-American — that all share the Latin alphabet but need different combinations of accent marks. The keyboard's central insight is that a typist already knows how to spell their language; they just need a way to add the right mark to any letter. Pressing a punctuation key that suggests an accent shape (the apostrophe for an acute, the caret for a circumflex, the colon for a diaeresis) and then the target letter delivers the accented character, while pressing the same punctuation key twice in a row gives the bare punctuation mark — nothing is lost. The design is particularly instructive because the same prefix-then-letter mechanism runs through paired lookup tables that cover thousands of combinations with only a handful of rules (release/sil/sil_euro_latin/source/sil_euro_latin.kmn lines 41-151, 243-261), making it the clearest available demonstration of how a small, well-structured rule set can serve a very large language family. It also demonstrates correct Caps Lock handling, touch-device support, and sentence-casing logic in the same file. [Full catalog entry](keyboard-catalog.md#sil_euro_latin)

**Naija Type** (el_naija) was built for the tone languages of Nigeria — Igbo, Yoruba, Hausa, Efik, Tiv and many related languages — where a single vowel may carry both a tone mark above and a quality mark below simultaneously. Most keyboards simply let the user pile up marks without checking whether the result is meaningful; Naija Type does not. It opens with an entire group of rules (release/el/el_naija/source/el_naija.kmn lines 81-137) that refuse illegal sequences — too many marks on one vowel, a mark on a consonant that cannot carry it, or a repeated accent — and sound a signal to tell the typist immediately. A separate group (release/el/el_naija/source/el_naija.kmn lines 161-166) then silently corrects the storage order of any stacked marks to the order that the Unicode standard requires. The combination — reject the wrong, silently fix the ordering of the right — is a model of careful design for any language that uses stacked diacritics, and it is the cleanest example in the corpus of constraint enforcement working alongside automatic normalization. [Full catalog entry](keyboard-catalog.md#el_naija)

**Myanmar3 (SIL)** serves Burmese speakers writing in the rounded Myanmar script, which is a writing system where consonants, vowel signs and tone marks are arranged in clusters around a base letter, and the stored order of those elements in a text file does not always match the visual left-to-right order a typist would naturally follow. The keyboard's defining design is invisible to the user: when the typist enters the front vowel "e" — which visually precedes its consonant but must be stored after it in the Unicode encoding — the keyboard buffers the vowel, waits for the consonant, and silently swaps the two into the correct storage order (release/sil/sil_myanmar_my3/source/sil_myanmar_my3.kmn lines 108-111), with a backspace rule (release/sil/sil_myanmar_my3/source/sil_myanmar_my3.kmn lines 162-167) that cleanly unwinds the buffer if the typist changes their mind. This before-and-after reordering pattern is the canonical solution for any writing system where visual input order diverges from logical storage order, and it appears in several other keyboards in the corpus (Tamil, Plains Cree) in closely related forms. [Full catalog entry](keyboard-catalog.md#sil_myanmar_my3)

**GFF Amharic** is the most-downloaded keyboard in the corpus at 5,362 downloads per month, and it serves one of the most structurally distinctive writing systems in the set. Ethiopic Fidel is a syllabary: each character represents a consonant-and-vowel pair rather than a single sound, giving several hundred distinct characters across seven vowel columns. The keyboard solves this by letting the typist spell phonetically in the Latin alphabet: typing the sound of a consonant produces its base Ethiopic form, and the following vowel letter transforms it into the correct column (release/gff/gff_amharic/source/gff_amharic.kmn lines 336-342, 37-43). Every rule is context-sensitive — what appears on screen depends on what is already there — and this single context-aware transform covers the entire grid, including labiovelars and Ethiopic numerals. It is the best available example of a transliteration-driven design for a large syllabary, and it demonstrates that even a script with hundreds of distinct characters can be handled with a modest and principled rule set. (Ethiopic is excluded from v1 — a sprint-2 candidate per spec §14 Decision 5 — so this keyboard is documented here as a corpus reference, not a v1 deliverable.) [Full catalog entry](keyboard-catalog.md#gff_amharic)

**Philippines (SIL)** covers more than a hundred languages across the Philippine archipelago — Tagalog, Cebuano, Ilocano, Hiligaynon and many smaller varieties — which share a common extended Latin alphabet with stress accents and a small set of phonetic letters. What makes it exemplary is its handling of stacked accents: Philippine orthography occasionally requires a vowel to carry both a length mark (macron) and a pitch mark (grave or acute) at the same time, and the keyboard achieves this by letting the typist press two prefix keys in sequence before the vowel rather than requiring a single dedicated key for each two-mark combination (release/sil/sil_philippines/source/sil_philippines.kmn lines 160-171). The pattern — a compositional prefix chain that degrades gracefully to a single mark when only one prefix is pressed — generalises well beyond Philippine languages, making this a teaching example for any multi-mark Latin orthography. It also carries a legacy character mapping that allows older documents typed on a different standard to be faithfully retyped. [Full catalog entry](keyboard-catalog.md#sil_philippines)

---

## Rough keyboards

The five keyboards below are documented as negative fixtures for `@keymanapp/keyboard-lint`. Each compiles and types correctly (Layer-A valid); the flags are all documentary hygiene issues of the type specified in [criteria.md](../docs/criteria.md). None of the flags below prevent correct typing behaviour.

**Elfdalian** (elfdalian) serves Övdalsk, a conservative North Germanic variety spoken by a few thousand people in Älvdalen, Sweden, whose orthography preserves letters — including several ogonek vowels, a ring-ogonek, and the eth character — that dropped out of standard Swedish centuries ago. The keyboard itself types correctly; its four hygiene flags are all documentary. Criterion 3.6: the changelog file records the version as '1.05' while the source file records it as '1.0.5' — two spellings of the same number that the automated check treats as a mismatch (experimental/e/elfdalian/source/elfdalian.kmn). Criterion 4.5: the LICENSE.md file is missing the exact phrasing `Copyright © <year> <holder>` that the package-build toolchain requires. Criterion 5.2: the README file repeats the version string 'Version 1.05', meaning it will silently fall out of date the next time the keyboard is updated. Criterion 7.2: the targets declaration reads `any mobile`, but `any` already includes mobile, making the explicit `mobile` redundant. Remediation is entirely mechanical: normalize the version string to one form across all files; add the literal word "Copyright" and a space before the copyright symbol in LICENSE.md; remove the version from the README; and replace `any mobile` with `any`. [Full catalog entry](keyboard-catalog.md#elfdalian)

**Geez EMUFI** (gff_geez_emufi) is a companion to a manuscript-font project for Classical Ethiopic (Geʾez), the liturgical language of the Ethiopian and Eritrean Orthodox churches. It uses some characters from the Unicode Private Use Area to encode manuscript letter-forms not yet standardized, which is why it lives in `experimental/` rather than `release/`. Three of its four hygiene flags are version and copyright paperwork. Criterion 4.5: LICENSE.md lacks the required well-formed copyright line (experimental/gff/gff_geez_emufi/source/gff_geez_emufi.kmn). Criterion 5.2, twice: the README states 'Version 1.0' while `source/welcome.htm` states 'v1.2' — two user-facing files stating different version numbers, a two-source inconsistency that misleads anyone trying to understand which version they have. Criterion 6: `source/readme.htm` is missing entirely, meaning the brief description normally shown to a user at install time would be blank. Remediation: add the correct copyright line to LICENSE.md; remove version strings from README.md and welcome.htm (the version belongs only in HISTORY.md and the source file); and create a `source/readme.htm` with a one-sentence description of the keyboard. [Full catalog entry](keyboard-catalog.md#gff_geez_emufi)

**Alkelang** (alkelang) is a touch-first keyboard for Bafut, a Grassfields Bantu language of the North West Region of Cameroon, and related languages of the same area that share the General Alphabet of Cameroonian Languages. It provides a dedicated IPA extension layer for the phonetic letters those languages require. The keyboard has three flags, all documentary. Criterion 4.5: the LICENSE.md copyright line reads `(C) NIBANN ENGINEERING` with no copyright symbol and no year, which fails the exact-syntax requirement (experimental/a/alkelang/source/alkelang.kmn). Criterion 5.2: the README embeds 'Version : 1.0'. Criterion 6: `source/readme.htm` is absent. Remediation: rewrite the copyright line as `Copyright © <year> NIBANN ENGINEERING` (or the appropriate holder name); remove the version string from the README; create `source/readme.htm`. [Full catalog entry](keyboard-catalog.md#alkelang)

**Wancho** (wancho) serves the Wancho community of Arunachal Pradesh and Nagaland in northeast India, whose community-designed script was added to Unicode in 2019. The keyboard is a direct one-character-per-key mapping — structurally the simplest design in the entire corpus — which makes it a particularly clean negative fixture for file-level hygiene checks, because there is no engine complexity to confuse the signal. Two flags. Criterion 4.5: the LICENSE.md copyright line reads `© 2020 Banwang Losu` — the copyright symbol is present and the year and holder name are correct, but the literal word "Copyright" before the symbol is absent, exactly the gap the criterion targets (experimental/w/wancho/source/wancho.kmn). Criterion 5.2: README.md embeds 'Version 1.0'. Remediation is minimal: prepend the word "Copyright " to the existing copyright line; remove the version string from the README. This keyboard is a useful test case precisely because the fix is so small — one word added to one line — yet without it the package-build toolchain would reject the submission. [Full catalog entry](keyboard-catalog.md#wancho)

**Clavier du Burkina** (clavbur9) is the most significant keyboard in the rough set because it sits in `release/` — the tier reserved for keyboards considered ready for general distribution — yet it carries hygiene flags that should have been caught before it reached that tier. It serves the many language communities of Burkina Faso (Mooré, Dioula, Fulfuldé, Gulmancema and others) through a mature, much-revised design (nine version generations) that is sophisticated in its typing logic, including a toggle that lets a community choose between two competing conventions for the schwa character. The rough flags have nothing to do with the typing logic. Criterion 1.11: the developer-local project settings file `clavbur9.kpj.user` is committed to the repository alongside the source (release/c/clavbur9/source/clavbur9.kmn); this file records the developer's own machine-specific state and should never be committed. Criterion 1.12: compiled binary outputs — `build/clavbur9.js`, `build/clavbur9.kmx`, `build/clavbur9.kvk` — are committed in the source tree; compiled files are build artefacts and belong only in the final distributable package, not in source control. Criterion 4.5: LICENSE.md lacks the required well-formed copyright line. Remediation: add `clavbur9.kpj.user` and `build/` to `.gitignore` and remove the committed instances; add the correct copyright line to LICENSE.md. The presence of all three flags on a long-published release keyboard confirms that the linter needs to run against `release/` as well as `experimental/`. [Full catalog entry](keyboard-catalog.md#clavbur9)

---

## Pattern catalog

The table below lists the 17 pattern YAML files currently in `content/patterns/`, grouped by category, with their associated strategy from the spec §7.3 catalog. This is 17 of a planned larger set; further pattern files (S-06 chained deadkeys, S-07 diacritic cycle, S-11 stateful toggle) are still pending.

| Pattern | Category | Strategy |
|---|---|---|
| [capslock-variant.yaml](patterns/desktop-input/capslock-variant.yaml) | desktop-input | S-01, S-08 |
| [context-sensitive-substitution.yaml](patterns/desktop-input/context-sensitive-substitution.yaml) | desktop-input | S-03, S-09 |
| [deadkey-single-tap.yaml](patterns/desktop-input/deadkey-single-tap.yaml) | desktop-input | S-02 |
| [modifier-as-layer-switch.yaml](patterns/desktop-input/modifier-as-layer-switch.yaml) | desktop-input | S-08 |
| [multi-char-sequence.yaml](patterns/desktop-input/multi-char-sequence.yaml) | desktop-input | S-03 |
| [dll-ime-callout.yaml](patterns/ime/dll-ime-callout.yaml) | ime | S-12 |
| [indic-pre-base-vowel.yaml](patterns/reorder/indic-pre-base-vowel.yaml) | reorder | S-09 |
| [nfd-latin.yaml](patterns/reorder/nfd-latin.yaml) | reorder | (scaffolder pipeline stage — no strategyId) |
| [sea-stack-reorder.yaml](patterns/reorder/sea-stack-reorder.yaml) | reorder | S-09 |
| [tone-mark-canonicalization.yaml](patterns/reorder/tone-mark-canonicalization.yaml) | reorder | S-09 |
| [simple-swap.yaml](patterns/substitute/simple-swap.yaml) | substitute | S-01 |
| [flick-gestures.yaml](patterns/touch/flick-gestures.yaml) | touch | S-08 |
| [hint-characters.yaml](patterns/touch/hint-characters.yaml) | touch | S-08 |
| [layer-switch-touch.yaml](patterns/touch/layer-switch-touch.yaml) | touch | S-13 (see open questions) |
| [multitap.yaml](patterns/touch/multitap.yaml) | touch | S-08 |
| [mnemonic-spelling.yaml](patterns/transliteration/mnemonic-spelling.yaml) | transliteration | S-05 |
| [constraints-beep.yaml](patterns/validation/constraints-beep.yaml) | validation | S-10 |

---

## Open questions for future work

- **Pattern-library completeness.** 17 pattern YAMLs exist. Files for S-06 (chained deadkeys), S-07 (diacritic cycle), and S-11 (stateful toggle) are still pending. The S-04 building block is intentionally omitted as a standalone pattern per spec §7.3.

- **Intentional §7.5 self-check gaps.** The EuroLatin and IPA strategy self-check entries in the §7.5 validation table are documented as intentional v1.1 gaps. They were not introduced by this scan and are not actionable until v1.1 planning.

- **Under-represented strategies.** S-11 (stateful orthography toggle) appears only once in the corpus (clavbur9's schwa-convention switch). S-12 (logographic IME callout) is absent because there is no CJK keyboard in the popular download tier; CJK is out of v1 scope per spec §16.

- **Ethiopic scope.** The two Ethiopic keyboards (gff_amharic, sil_ethiopic_power_g) are documented here as corpus references only. Ethiopic is excluded from v1 and is a candidate for sprint-2 pattern-library work (spec §14 Decision 5, §16); the gallery renders a "not yet supported" stub for it in v1 (§9). No pattern files for Ethiopic strategies are planned for v1.

- **DATA-INTEGRITY FLAG — S-13 in layer-switch-touch.yaml.** [layer-switch-touch.yaml](patterns/touch/layer-switch-touch.yaml) declares `strategyId: "S-13"`, which is outside the S-01..S-12 union defined in `packages/contracts/src/strategy.ts`. This needs resolution before the pattern can be used: either ratify S-13 in the union, add it to the §7.3 catalog, and add a §7.5 self-check row — or remove the `strategyId` field from the YAML.

- **Lint negative-fixture wiring.** The rough keyboards documented above are ready as negative fixtures, but `@keymanapp/keyboard-lint` is not yet scaffolded. Wiring these fixtures into actual test cases is deferred until the package exists.

- **Human Content-team review.** This document still needs review by a human Content-team member before issue #56 can fully close.
