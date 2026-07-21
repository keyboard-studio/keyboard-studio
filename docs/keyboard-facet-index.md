# Keyboard facet index — audit companion

Generated — do not edit. The machine-readable artifact is [`keyboard-facet-index.json`](keyboard-facet-index.json); rebuild both with `npx tsx utilities/facet-index/cli.ts`.

## Build inputs

- **keyboards**: 927
- **facets**: added-char-count, caps-handling, casing, combining-mark-repertoire, declared-bcp47-tags, desktop-combo-mechanism, diacritic-mechanism, directionality, encoding, fallback-posture, font-dependency, license-fork-eligibility, mnemonic-vs-positional, normalization-posture, orthography-coverage-ratio, package-completeness, platform-coverage, primary-strategy, reordering-rules, rule-store-compaction, script, script-family, spare-key-budget, strategy-fingerprint, target-mix, touch-combo-mechanism, touch-modifier-layers, touch-number-row, touch-symbol-layer
- **scannerVersion**: `facet-index@1;schema@1;script@3;strategy-fingerprint@1;target-mix@1`
- **unicodeVersion**: 17.0.0
- **corpusScope**: `release/**`
- **corpusCommit**: `keyboard-studio/keyboards@435f82d69bfc926eb03c2d8632571b41b6da3266`
- **referencePins**: 10

## Coverage by facet (provenance tier)

| facet | content-derived | declared-metadata | fallback | undetermined |
| --- | ---: | ---: | ---: | ---: |
| `added-char-count` | 919 | 0 | 8 | 0 |
| `caps-handling` | 920 | 0 | 7 | 0 |
| `casing` | 919 | 0 | 8 | 0 |
| `combining-mark-repertoire` | 845 | 0 | 82 | 0 |
| `declared-bcp47-tags` | 0 | 927 | 0 | 0 |
| `desktop-combo-mechanism` | 915 | 0 | 12 | 0 |
| `diacritic-mechanism` | 917 | 0 | 10 | 0 |
| `directionality` | 914 | 0 | 13 | 0 |
| `encoding` | 881 | 0 | 46 | 0 |
| `fallback-posture` | 915 | 0 | 12 | 0 |
| `font-dependency` | 0 | 927 | 0 | 0 |
| `license-fork-eligibility` | 0 | 927 | 0 | 0 |
| `mnemonic-vs-positional` | 920 | 0 | 7 | 0 |
| `normalization-posture` | 811 | 0 | 116 | 0 |
| `orthography-coverage-ratio` | 919 | 0 | 8 | 0 |
| `package-completeness` | 0 | 927 | 0 | 0 |
| `platform-coverage` | 0 | 927 | 0 | 0 |
| `primary-strategy` | 212 | 0 | 715 | 0 |
| `reordering-rules` | 920 | 0 | 7 | 0 |
| `rule-store-compaction` | 915 | 0 | 12 | 0 |
| `script` | 914 | 6 | 5 | 2 |
| `script-family` | 845 | 0 | 82 | 0 |
| `spare-key-budget` | 577 | 0 | 350 | 0 |
| `strategy-fingerprint` | 917 | 0 | 10 | 0 |
| `target-mix` | 0 | 919 | 8 | 0 |
| `touch-combo-mechanism` | 927 | 0 | 0 | 0 |
| `touch-modifier-layers` | 927 | 0 | 0 | 0 |
| `touch-number-row` | 927 | 0 | 0 | 0 |
| `touch-symbol-layer` | 927 | 0 | 0 | 0 |

## Sample records — `added-char-count` (first 12 by id)

| keyboard | value | tier | outcome | evidence |
| --- | --- | --- | --- | ---: |
| `adiga_danef` | medium | content-derived | fully | 36 |
| `afghan_turkmen` | medium | content-derived | fully | 94 |
| `ahom_star` | medium | content-derived | fully | 99 |
| `akan` | medium | content-derived | fully | 64 |
| `akha_lahu` | small | content-derived | fully | 12 |
| `aksarabali_panlex` | medium | content-derived | partially | 74 |
| `amazigh_latin` | large | content-derived | fully | 122 |
| `anglish` | medium | content-derived | fully | 76 |
| `anglish_dvorak` | medium | content-derived | fully | 76 |
| `anglo_furthorc_english` | medium | content-derived | fully | 78 |
| `anii` | medium | content-derived | fully | 72 |
| `arabic_flick` | large | content-derived | fully | 169 |

## Sample records — `caps-handling` (first 12 by id)

| keyboard | value | tier | outcome | evidence |
| --- | --- | --- | --- | ---: |
| `adiga_danef` | any-index-fold | content-derived | fully | 1 |
| `afghan_turkmen` | — | content-derived | fully | 0 |
| `ahom_star` | — | content-derived | fully | 0 |
| `akan` | no-caps-rules | content-derived | fully | 1 |
| `akha_lahu` | — | content-derived | fully | 0 |
| `aksarabali_panlex` | — | content-derived | fully | 0 |
| `amazigh_latin` | mixed | content-derived | fully | 125 |
| `anglish` | per-rule-duplication | content-derived | fully | 192 |
| `anglish_dvorak` | per-rule-duplication | content-derived | fully | 192 |
| `anglo_furthorc_english` | — | content-derived | fully | 0 |
| `anii` | no-caps-rules | content-derived | fully | 1 |
| `arabic_flick` | — | content-derived | fully | 0 |

## Sample records — `casing` (first 12 by id)

| keyboard | value | tier | outcome | evidence |
| --- | --- | --- | --- | ---: |
| `adiga_danef` | cased | content-derived | fully | 1 |
| `afghan_turkmen` | caseless | content-derived | fully | 1 |
| `ahom_star` | caseless | content-derived | fully | 1 |
| `akan` | cased | content-derived | fully | 1 |
| `akha_lahu` | caseless | content-derived | fully | 1 |
| `aksarabali_panlex` | caseless | content-derived | partially | 1 |
| `amazigh_latin` | cased | content-derived | fully | 1 |
| `anglish` | cased | content-derived | fully | 1 |
| `anglish_dvorak` | cased | content-derived | fully | 1 |
| `anglo_furthorc_english` | caseless | content-derived | fully | 1 |
| `anii` | cased | content-derived | fully | 1 |
| `arabic_flick` | caseless | content-derived | fully | 1 |

## Sample records — `combining-mark-repertoire` (first 12 by id)

| keyboard | value | tier | outcome | evidence |
| --- | --- | --- | --- | ---: |
| `adiga_danef` |  | content-derived | fully | 0 |
| `afghan_turkmen` | َ+ِ+ّ+ْ+ٔ+ٚ+ٛ+ٰ | content-derived | fully | 8 |
| `ahom_star` | 𑜝+𑜞+𑜟+𑜠+𑜡+𑜢+𑜣+𑜤+𑜥+𑜦+𑜧+𑜨+𑜩+𑜪+𑜫 | content-derived | fully | 15 |
| `akan` |  | content-derived | fully | 0 |
| `akha_lahu` | — | default-fallback | fallback-only | 0 |
| `aksarabali_panlex` | ᬁ+ᬶ+ᬸ+ᬺ+ᬼ+ᬾ+ᭀ+ᭂ | content-derived | partially | 8 |
| `amazigh_latin` | ̀+́+̄+̣+̱ | content-derived | fully | 5 |
| `anglish` | ̅ | content-derived | fully | 1 |
| `anglish_dvorak` | ̅ | content-derived | fully | 1 |
| `anglo_furthorc_english` |  | content-derived | fully | 0 |
| `anii` |  | content-derived | fully | 0 |
| `arabic_flick` | ً+ٌ+ٍ+َ+ُ+ِ+ّ+ْ+ٚ+ٜ+ٰ | content-derived | fully | 11 |

## Sample records — `declared-bcp47-tags` (first 12 by id)

| keyboard | value | tier | outcome | evidence |
| --- | --- | --- | --- | ---: |
| `adiga_danef` | ady-Latn | declared-metadata | fully | 1 |
| `afghan_turkmen` | tk-Arab | declared-metadata | fully | 1 |
| `ahom_star` | aho-Ahom | declared-metadata | fully | 1 |
| `akan` | ak | declared-metadata | fully | 1 |
| `akha_lahu` | ahk+lhu | declared-metadata | fully | 2 |
| `aksarabali_panlex` | ban-Bali+kaw-Bali | declared-metadata | partially | 2 |
| `amazigh_latin` | auj-Latn+cnu-Latn+gha-Latn+gho-Latn+gnc+grr-Latn+jbe-Latn+jbn-Latn+kab+mzb-Latn+oua-Latn+rif+sds-Latn+shi-Latn+shy+siz-Latn+sjs-Latn+swn-Latn+taq+tez-Latn+thv+thz+tia-Latn+tjo-Latn+tzm+zen-Latn+zgh-Latn | declared-metadata | fully | 27 |
| `anglish` | ang | declared-metadata | fully | 1 |
| `anglish_dvorak` | ang | declared-metadata | fully | 1 |
| `anglo_furthorc_english` | en-Runr | declared-metadata | fully | 1 |
| `anii` | blo-Latn | declared-metadata | fully | 1 |
| `arabic_flick` | ar | declared-metadata | fully | 1 |

## Sample records — `desktop-combo-mechanism` (first 12 by id)

| keyboard | value | tier | outcome | evidence |
| --- | --- | --- | --- | ---: |
| `adiga_danef` | context-match | content-derived | fully | 1 |
| `afghan_turkmen` | direct-key | content-derived | fully | 103 |
| `ahom_star` | direct-key | content-derived | fully | 104 |
| `akan` | direct-key | content-derived | fully | 85 |
| `akha_lahu` | context-match | content-derived | fully | 7 |
| `aksarabali_panlex` | context-match | content-derived | partially | 101 |
| `amazigh_latin` | direct-key | content-derived | fully | 174 |
| `anglish` | direct-key | content-derived | fully | 192 |
| `anglish_dvorak` | direct-key | content-derived | fully | 192 |
| `anglo_furthorc_english` | direct-key | content-derived | fully | 98 |
| `anii` | direct-key | content-derived | fully | 96 |
| `arabic_flick` | direct-key | content-derived | fully | 169 |

## Sample records — `diacritic-mechanism` (first 12 by id)

| keyboard | value | tier | outcome | evidence |
| --- | --- | --- | --- | ---: |
| `adiga_danef` | stacking-combining | content-derived | fully | 1 |
| `afghan_turkmen` | stacking-combining | content-derived | fully | 9 |
| `ahom_star` | stacking-combining | content-derived | fully | 15 |
| `akan` | none | content-derived | fully | 0 |
| `akha_lahu` | none | content-derived | fully | 0 |
| `aksarabali_panlex` | stacking-combining | content-derived | partially | 10 |
| `amazigh_latin` | stacking-combining | content-derived | fully | 6 |
| `anglish` | stacking-combining | content-derived | fully | 2 |
| `anglish_dvorak` | stacking-combining | content-derived | fully | 4 |
| `anglo_furthorc_english` | none | content-derived | fully | 0 |
| `anii` | none | content-derived | fully | 0 |
| `arabic_flick` | stacking-combining | content-derived | fully | 11 |

## Sample records — `directionality` (first 12 by id)

| keyboard | value | tier | outcome | evidence |
| --- | --- | --- | --- | ---: |
| `adiga_danef` | ltr | content-derived | fully | 1 |
| `afghan_turkmen` | rtl | content-derived | fully | 1 |
| `ahom_star` | ltr | content-derived | fully | 1 |
| `akan` | ltr | content-derived | fully | 1 |
| `akha_lahu` | — | default-fallback | fallback-only | 0 |
| `aksarabali_panlex` | ltr | content-derived | partially | 1 |
| `amazigh_latin` | ltr | content-derived | fully | 1 |
| `anglish` | ltr | content-derived | fully | 1 |
| `anglish_dvorak` | ltr | content-derived | fully | 1 |
| `anglo_furthorc_english` | ltr | content-derived | fully | 1 |
| `anii` | ltr | content-derived | fully | 1 |
| `arabic_flick` | rtl | content-derived | fully | 1 |

## Sample records — `encoding` (first 12 by id)

| keyboard | value | tier | outcome | evidence |
| --- | --- | --- | --- | ---: |
| `adiga_danef` | — | default-fallback | fallback-only | 0 |
| `afghan_turkmen` | bare-vk+named-modifier+split-modifier+u-notation | content-derived | fully | 208 |
| `ahom_star` | bare-vk+named-modifier+quoted-literal+u-notation | content-derived | fully | 204 |
| `akan` | bare-vk+named-modifier+quoted-literal | content-derived | fully | 170 |
| `akha_lahu` | quoted-literal | content-derived | fully | 6 |
| `aksarabali_panlex` | bare-vk+named-modifier+quoted-literal+split-modifier | content-derived | partially | 171 |
| `amazigh_latin` | bare-vk+named-modifier+split-modifier+u-notation | content-derived | fully | 347 |
| `anglish` | named-modifier+quoted-literal+split-modifier+u-notation | content-derived | fully | 384 |
| `anglish_dvorak` | named-modifier+quoted-literal+split-modifier+u-notation | content-derived | fully | 384 |
| `anglo_furthorc_english` | bare-vk+named-modifier+quoted-literal+u-notation | content-derived | fully | 196 |
| `anii` | bare-vk+named-modifier+quoted-literal | content-derived | fully | 192 |
| `arabic_flick` | bare-vk+named-modifier+quoted-literal+split-modifier+u-notation | content-derived | fully | 338 |

## Sample records — `fallback-posture` (first 12 by id)

| keyboard | value | tier | outcome | evidence |
| --- | --- | --- | --- | ---: |
| `adiga_danef` | relies-on | content-derived | fully | 47 |
| `afghan_turkmen` | blocks-comprehensively | content-derived | fully | 47 |
| `ahom_star` | blocks-comprehensively | content-derived | fully | 47 |
| `akan` | blocks-comprehensively | content-derived | fully | 47 |
| `akha_lahu` | relies-on | content-derived | fully | 47 |
| `aksarabali_panlex` | blocks-comprehensively | content-derived | partially | 47 |
| `amazigh_latin` | blocks-comprehensively | content-derived | fully | 47 |
| `anglish` | blocks-comprehensively | content-derived | fully | 47 |
| `anglish_dvorak` | blocks-comprehensively | content-derived | fully | 47 |
| `anglo_furthorc_english` | blocks-comprehensively | content-derived | fully | 47 |
| `anii` | blocks-comprehensively | content-derived | fully | 47 |
| `arabic_flick` | blocks-comprehensively | content-derived | fully | 47 |

## Sample records — `font-dependency` (first 12 by id)

| keyboard | value | tier | outcome | evidence |
| --- | --- | --- | --- | ---: |
| `adiga_danef` | self-contained | declared-metadata | fully | 1 |
| `afghan_turkmen` | system-font-reliant | declared-metadata | fully | 1 |
| `ahom_star` | system-font-reliant | declared-metadata | fully | 1 |
| `akan` | self-contained | declared-metadata | fully | 1 |
| `akha_lahu` | self-contained | declared-metadata | fully | 1 |
| `aksarabali_panlex` | system-font-reliant | declared-metadata | fully | 1 |
| `amazigh_latin` | self-contained | declared-metadata | fully | 1 |
| `anglish` | system-font-reliant | declared-metadata | fully | 1 |
| `anglish_dvorak` | system-font-reliant | declared-metadata | fully | 1 |
| `anglo_furthorc_english` | system-font-reliant | declared-metadata | fully | 1 |
| `anii` | self-contained | declared-metadata | fully | 1 |
| `arabic_flick` | system-font-reliant | declared-metadata | fully | 1 |

## Sample records — `license-fork-eligibility` (first 12 by id)

| keyboard | value | tier | outcome | evidence |
| --- | --- | --- | --- | ---: |
| `adiga_danef` | permissive | declared-metadata | fully | 1 |
| `afghan_turkmen` | permissive | declared-metadata | fully | 1 |
| `ahom_star` | permissive | declared-metadata | fully | 1 |
| `akan` | permissive | declared-metadata | fully | 1 |
| `akha_lahu` | permissive | declared-metadata | fully | 1 |
| `aksarabali_panlex` | permissive | declared-metadata | fully | 1 |
| `amazigh_latin` | permissive | declared-metadata | fully | 1 |
| `anglish` | permissive | declared-metadata | fully | 1 |
| `anglish_dvorak` | permissive | declared-metadata | fully | 1 |
| `anglo_furthorc_english` | permissive | declared-metadata | fully | 1 |
| `anii` | permissive | declared-metadata | fully | 1 |
| `arabic_flick` | permissive | declared-metadata | fully | 1 |

## Sample records — `mnemonic-vs-positional` (first 12 by id)

| keyboard | value | tier | outcome | evidence |
| --- | --- | --- | --- | ---: |
| `adiga_danef` | positional | content-derived | fully | 1 |
| `afghan_turkmen` | positional | content-derived | fully | 1 |
| `ahom_star` | positional | content-derived | fully | 1 |
| `akan` | positional | content-derived | fully | 1 |
| `akha_lahu` | positional | content-derived | fully | 1 |
| `aksarabali_panlex` | positional | content-derived | partially | 1 |
| `amazigh_latin` | positional | content-derived | fully | 1 |
| `anglish` | positional | content-derived | fully | 1 |
| `anglish_dvorak` | positional | content-derived | fully | 1 |
| `anglo_furthorc_english` | positional | content-derived | fully | 1 |
| `anii` | positional | content-derived | fully | 1 |
| `arabic_flick` | positional | content-derived | fully | 1 |

## Sample records — `normalization-posture` (first 12 by id)

| keyboard | value | tier | outcome | evidence |
| --- | --- | --- | --- | ---: |
| `adiga_danef` | — | default-fallback | fallback-only | 0 |
| `afghan_turkmen` | — | content-derived | fully | 0 |
| `ahom_star` | — | content-derived | fully | 0 |
| `akan` | — | default-fallback | fallback-only | 0 |
| `akha_lahu` | — | content-derived | fully | 0 |
| `aksarabali_panlex` | — | content-derived | fully | 0 |
| `amazigh_latin` | nfc | content-derived | fully | 20 |
| `anglish` | — | default-fallback | fallback-only | 0 |
| `anglish_dvorak` | — | default-fallback | fallback-only | 0 |
| `anglo_furthorc_english` | — | content-derived | fully | 0 |
| `anii` | nfc | content-derived | fully | 3 |
| `arabic_flick` | — | content-derived | fully | 0 |

## Sample records — `orthography-coverage-ratio` (first 12 by id)

| keyboard | value | tier | outcome | evidence |
| --- | --- | --- | --- | ---: |
| `adiga_danef` | not-derivable | content-derived | fully | 0 |
| `afghan_turkmen` | not-derivable | content-derived | fully | 0 |
| `ahom_star` | not-derivable | content-derived | fully | 0 |
| `akan` | not-derivable | content-derived | fully | 0 |
| `akha_lahu` | not-derivable | content-derived | fully | 0 |
| `aksarabali_panlex` | not-derivable | content-derived | partially | 0 |
| `amazigh_latin` | not-derivable | content-derived | fully | 0 |
| `anglish` | not-derivable | content-derived | fully | 0 |
| `anglish_dvorak` | not-derivable | content-derived | fully | 0 |
| `anglo_furthorc_english` | 0 | content-derived | fully | 26 |
| `anii` | not-derivable | content-derived | fully | 0 |
| `arabic_flick` | not-derivable | content-derived | fully | 0 |

## Sample records — `package-completeness` (first 12 by id)

| keyboard | value | tier | outcome | evidence |
| --- | --- | --- | --- | ---: |
| `adiga_danef` | help+osk | declared-metadata | fully | 2 |
| `afghan_turkmen` | help+osk | declared-metadata | fully | 2 |
| `ahom_star` | help+osk | declared-metadata | fully | 2 |
| `akan` | help+osk | declared-metadata | fully | 2 |
| `akha_lahu` | help+osk | declared-metadata | fully | 2 |
| `aksarabali_panlex` | help+osk | declared-metadata | fully | 2 |
| `amazigh_latin` | help+osk | declared-metadata | fully | 2 |
| `anglish` | help+osk | declared-metadata | fully | 2 |
| `anglish_dvorak` | help+osk | declared-metadata | fully | 2 |
| `anglo_furthorc_english` | help+osk | declared-metadata | fully | 2 |
| `anii` | help+osk | declared-metadata | fully | 2 |
| `arabic_flick` | help+osk | declared-metadata | fully | 2 |

## Sample records — `platform-coverage` (first 12 by id)

| keyboard | value | tier | outcome | evidence |
| --- | --- | --- | --- | ---: |
| `adiga_danef` | desktop+touch+web | declared-metadata | fully | 3 |
| `afghan_turkmen` | desktop+touch+web | declared-metadata | fully | 3 |
| `ahom_star` | desktop+touch+web | declared-metadata | fully | 3 |
| `akan` | desktop+touch+web | declared-metadata | fully | 3 |
| `akha_lahu` | desktop+touch+web | declared-metadata | fully | 3 |
| `aksarabali_panlex` | desktop+touch+web | declared-metadata | fully | 3 |
| `amazigh_latin` | desktop+touch+web | declared-metadata | fully | 3 |
| `anglish` | desktop+touch+web | declared-metadata | fully | 3 |
| `anglish_dvorak` | desktop+touch+web | declared-metadata | fully | 3 |
| `anglo_furthorc_english` | desktop+touch+web | declared-metadata | fully | 3 |
| `anii` | desktop+touch+web | declared-metadata | fully | 3 |
| `arabic_flick` | desktop+touch+web | declared-metadata | fully | 3 |

## Sample records — `primary-strategy` (first 12 by id)

| keyboard | value | tier | outcome | evidence |
| --- | --- | --- | --- | ---: |
| `adiga_danef` | — | default-fallback | fallback-only | 0 |
| `afghan_turkmen` | — | default-fallback | fallback-only | 0 |
| `ahom_star` | — | default-fallback | fallback-only | 0 |
| `akan` | — | default-fallback | fallback-only | 0 |
| `akha_lahu` | — | default-fallback | fallback-only | 0 |
| `aksarabali_panlex` | S-01 | content-derived | partially | 1 |
| `amazigh_latin` | S-02 | content-derived | fully | 2 |
| `anglish` | — | default-fallback | fallback-only | 0 |
| `anglish_dvorak` | — | default-fallback | fallback-only | 0 |
| `anglo_furthorc_english` | — | default-fallback | fallback-only | 0 |
| `anii` | — | default-fallback | fallback-only | 0 |
| `arabic_flick` | — | default-fallback | fallback-only | 0 |

## Sample records — `reordering-rules` (first 12 by id)

| keyboard | value | tier | outcome | evidence |
| --- | --- | --- | --- | ---: |
| `adiga_danef` | none | content-derived | fully | 1 |
| `afghan_turkmen` | none | content-derived | fully | 1 |
| `ahom_star` | none | content-derived | fully | 1 |
| `akan` | none | content-derived | fully | 1 |
| `akha_lahu` | none | content-derived | fully | 1 |
| `aksarabali_panlex` | none | content-derived | partially | 1 |
| `amazigh_latin` | none | content-derived | fully | 1 |
| `anglish` | none | content-derived | fully | 1 |
| `anglish_dvorak` | none | content-derived | fully | 1 |
| `anglo_furthorc_english` | none | content-derived | fully | 1 |
| `anii` | none | content-derived | fully | 1 |
| `arabic_flick` | none | content-derived | fully | 1 |

## Sample records — `rule-store-compaction` (first 12 by id)

| keyboard | value | tier | outcome | evidence |
| --- | --- | --- | --- | ---: |
| `adiga_danef` | consolidated-stores | content-derived | fully | 1 |
| `afghan_turkmen` | inline-rules | content-derived | fully | 101 |
| `ahom_star` | inline-rules | content-derived | fully | 100 |
| `akan` | inline-rules | content-derived | fully | 85 |
| `akha_lahu` | mixed | content-derived | fully | 7 |
| `aksarabali_panlex` | mixed | content-derived | partially | 88 |
| `amazigh_latin` | mixed | content-derived | fully | 174 |
| `anglish` | inline-rules | content-derived | fully | 192 |
| `anglish_dvorak` | inline-rules | content-derived | fully | 192 |
| `anglo_furthorc_english` | inline-rules | content-derived | fully | 98 |
| `anii` | inline-rules | content-derived | fully | 96 |
| `arabic_flick` | inline-rules | content-derived | fully | 169 |

## Sample records — `script` (first 12 by id)

| keyboard | value | tier | outcome | evidence |
| --- | --- | --- | --- | ---: |
| `adiga_danef` | Latn | content-derived | fully | 36 |
| `afghan_turkmen` | Arab | content-derived | fully | 68 |
| `ahom_star` | Ahom | content-derived | fully | 58 |
| `akan` | Latn | content-derived | fully | 49 |
| `akha_lahu` | Latn | default-fallback | fallback-only | 0 |
| `aksarabali_panlex` | Bali | content-derived | partially | 78 |
| `amazigh_latin` | Latn | content-derived | fully | 103 |
| `anglish` | Latn | content-derived | fully | 51 |
| `anglish_dvorak` | Latn | content-derived | fully | 51 |
| `anglo_furthorc_english` | Runr | content-derived | fully | 35 |
| `anii` | Latn | content-derived | fully | 59 |
| `arabic_flick` | Arab | content-derived | fully | 93 |

## Sample records — `script-family` (first 12 by id)

| keyboard | value | tier | outcome | evidence |
| --- | --- | --- | --- | ---: |
| `adiga_danef` | alphabet | content-derived | fully | 1 |
| `afghan_turkmen` | abjad | content-derived | fully | 1 |
| `ahom_star` | abugida | content-derived | fully | 1 |
| `akan` | alphabet | content-derived | fully | 1 |
| `akha_lahu` | — | default-fallback | fallback-only | 0 |
| `aksarabali_panlex` | abugida | content-derived | partially | 1 |
| `amazigh_latin` | alphabet | content-derived | fully | 1 |
| `anglish` | alphabet | content-derived | fully | 1 |
| `anglish_dvorak` | alphabet | content-derived | fully | 1 |
| `anglo_furthorc_english` | alphabet | content-derived | fully | 1 |
| `anii` | alphabet | content-derived | fully | 1 |
| `arabic_flick` | abjad | content-derived | fully | 1 |

## Sample records — `spare-key-budget` (first 12 by id)

| keyboard | value | tier | outcome | evidence |
| --- | --- | --- | --- | ---: |
| `adiga_danef` | — | default-fallback | fallback-only | 0 |
| `afghan_turkmen` | ralt-only | content-derived | fully | 26 |
| `ahom_star` | ralt-only | content-derived | fully | 26 |
| `akan` | ralt-only | content-derived | fully | 23 |
| `akha_lahu` | — | default-fallback | fallback-only | 0 |
| `aksarabali_panlex` | many | content-derived | partially | 2 |
| `amazigh_latin` | ralt-only | content-derived | fully | 31 |
| `anglish` | ralt-only | content-derived | fully | 26 |
| `anglish_dvorak` | ralt-only | content-derived | fully | 26 |
| `anglo_furthorc_english` | ralt-only | content-derived | fully | 26 |
| `anii` | ralt-only | content-derived | fully | 26 |
| `arabic_flick` | fully-booked | content-derived | fully | 52 |

## Sample records — `strategy-fingerprint` (first 12 by id)

| keyboard | value | tier | outcome | evidence |
| --- | --- | --- | --- | ---: |
| `adiga_danef` | — | content-derived | fully | 1 |
| `afghan_turkmen` | — | content-derived | fully | 103 |
| `ahom_star` | — | content-derived | fully | 104 |
| `akan` | — | content-derived | fully | 85 |
| `akha_lahu` | — | content-derived | fully | 7 |
| `aksarabali_panlex` | — | content-derived | partially | 101 |
| `amazigh_latin` | — | content-derived | fully | 176 |
| `anglish` | — | content-derived | fully | 192 |
| `anglish_dvorak` | — | content-derived | fully | 192 |
| `anglo_furthorc_english` | — | content-derived | fully | 98 |
| `anii` | — | content-derived | fully | 96 |
| `arabic_flick` | — | content-derived | fully | 169 |

## Sample records — `target-mix` (first 12 by id)

| keyboard | value | tier | outcome | evidence |
| --- | --- | --- | --- | ---: |
| `adiga_danef` | desktop+touch+web | declared-metadata | fully | 3 |
| `afghan_turkmen` | desktop+touch+web | declared-metadata | fully | 3 |
| `ahom_star` | desktop+touch+web | declared-metadata | fully | 3 |
| `akan` | desktop+touch+web | declared-metadata | fully | 3 |
| `akha_lahu` | desktop+touch+web | declared-metadata | fully | 3 |
| `aksarabali_panlex` | desktop+touch+web | declared-metadata | fully | 3 |
| `amazigh_latin` | desktop+touch+web | declared-metadata | fully | 3 |
| `anglish` | desktop+touch+web | declared-metadata | fully | 3 |
| `anglish_dvorak` | desktop+touch+web | declared-metadata | fully | 3 |
| `anglo_furthorc_english` | desktop+touch+web | declared-metadata | fully | 3 |
| `anii` | desktop+touch+web | declared-metadata | fully | 3 |
| `arabic_flick` | desktop+touch+web | declared-metadata | fully | 3 |

## Sample records — `touch-combo-mechanism` (first 12 by id)

| keyboard | value | tier | outcome | evidence |
| --- | --- | --- | --- | ---: |
| `adiga_danef` | key | content-derived | fully | 126 |
| `afghan_turkmen` | key | content-derived | fully | 100 |
| `ahom_star` | key | content-derived | fully | 174 |
| `akan` | key | content-derived | fully | 85 |
| `akha_lahu` | key | content-derived | fully | 98 |
| `aksarabali_panlex` | key | content-derived | fully | 85 |
| `amazigh_latin` | longpress | content-derived | fully | 94 |
| `anglish` | key | content-derived | fully | 117 |
| `anglish_dvorak` | key | content-derived | fully | 126 |
| `anglo_furthorc_english` | key | content-derived | fully | 97 |
| `anii` | key | content-derived | fully | 194 |
| `arabic_flick` | key | content-derived | fully | 194 |

## Sample records — `touch-modifier-layers` (first 12 by id)

| keyboard | value | tier | outcome | evidence |
| --- | --- | --- | --- | ---: |
| `adiga_danef` | none | content-derived | fully | 3 |
| `afghan_turkmen` | none | content-derived | fully | 3 |
| `ahom_star` | none | content-derived | fully | 3 |
| `akan` | none | content-derived | fully | 2 |
| `akha_lahu` | none | content-derived | fully | 2 |
| `aksarabali_panlex` | none | content-derived | fully | 3 |
| `amazigh_latin` | none | content-derived | fully | 3 |
| `anglish` | none | content-derived | fully | 4 |
| `anglish_dvorak` | none | content-derived | fully | 4 |
| `anglo_furthorc_english` | none | content-derived | fully | 2 |
| `anii` | none | content-derived | fully | 3 |
| `arabic_flick` | none | content-derived | fully | 6 |

## Sample records — `touch-number-row` (first 12 by id)

| keyboard | value | tier | outcome | evidence |
| --- | --- | --- | --- | ---: |
| `adiga_danef` | mixed | content-derived | fully | 1 |
| `afghan_turkmen` | digits | content-derived | fully | 1 |
| `ahom_star` | digits | content-derived | fully | 1 |
| `akan` | digits | content-derived | fully | 1 |
| `akha_lahu` | digits | content-derived | fully | 1 |
| `aksarabali_panlex` | digits | content-derived | fully | 1 |
| `amazigh_latin` | digits | content-derived | fully | 1 |
| `anglish` | digits | content-derived | fully | 1 |
| `anglish_dvorak` | digits | content-derived | fully | 1 |
| `anglo_furthorc_english` | digits | content-derived | fully | 1 |
| `anii` | digits | content-derived | fully | 1 |
| `arabic_flick` | digits | content-derived | fully | 1 |

## Sample records — `touch-symbol-layer` (first 12 by id)

| keyboard | value | tier | outcome | evidence |
| --- | --- | --- | --- | ---: |
| `adiga_danef` | absent | content-derived | fully | 1 |
| `afghan_turkmen` | present | content-derived | fully | 1 |
| `ahom_star` | absent | content-derived | fully | 1 |
| `akan` | absent | content-derived | fully | 1 |
| `akha_lahu` | absent | content-derived | fully | 1 |
| `aksarabali_panlex` | absent | content-derived | fully | 1 |
| `amazigh_latin` | absent | content-derived | fully | 1 |
| `anglish` | absent | content-derived | fully | 1 |
| `anglish_dvorak` | absent | content-derived | fully | 1 |
| `anglo_furthorc_english` | absent | content-derived | fully | 1 |
| `anii` | absent | content-derived | fully | 1 |
| `arabic_flick` | present | content-derived | fully | 1 |

