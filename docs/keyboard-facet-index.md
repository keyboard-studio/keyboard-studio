# Keyboard facet index — audit companion

Generated — do not edit. The machine-readable artifact is [`keyboard-facet-index.json`](keyboard-facet-index.json); rebuild both with `npx tsx utilities/facet-index/cli.ts`.

## Build inputs

- **keyboards**: 920
- **facets**: caps-handling, casing, desktop-combo-mechanism, encoding, fallback-posture, mnemonic-vs-positional, normalization-posture, reordering-rules, rule-store-compaction, script, strategy-fingerprint, target-mix
- **scannerVersion**: `facet-index@1;schema@1;script@2;strategy-fingerprint@1;target-mix@1`
- **unicodeVersion**: 17.0.0
- **corpusScope**: `release/**`
- **corpusCommit**: `keymanapp/keyboards@79e084f54985b458ac72315247719a8fabf3080f`
- **referencePins**: 5

## Coverage by facet (provenance tier)

| facet | content-derived | declared-metadata | fallback | undetermined |
| --- | ---: | ---: | ---: | ---: |
| `caps-handling` | 913 | 0 | 7 | 0 |
| `casing` | 905 | 0 | 15 | 0 |
| `desktop-combo-mechanism` | 812 | 0 | 108 | 0 |
| `encoding` | 874 | 0 | 46 | 0 |
| `fallback-posture` | 812 | 0 | 108 | 0 |
| `mnemonic-vs-positional` | 913 | 0 | 7 | 0 |
| `normalization-posture` | 806 | 0 | 114 | 0 |
| `reordering-rules` | 913 | 0 | 7 | 0 |
| `rule-store-compaction` | 908 | 0 | 12 | 0 |
| `script` | 894 | 14 | 10 | 2 |
| `strategy-fingerprint` | 910 | 0 | 10 | 0 |
| `target-mix` | 0 | 912 | 8 | 0 |

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
| `anglo_furthorc_english` | — | content-derived | fully | 0 |
| `anii` | no-caps-rules | content-derived | fully | 1 |
| `arabic_izza` | — | content-derived | fully | 0 |
| `arabic_w_o_dots` | — | content-derived | fully | 0 |
| `aramaic_hebrew` | — | content-derived | fully | 0 |

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
| `anglo_furthorc_english` | caseless | content-derived | fully | 1 |
| `anii` | cased | content-derived | fully | 1 |
| `arabic_izza` | caseless | content-derived | fully | 1 |
| `arabic_w_o_dots` | caseless | content-derived | fully | 1 |
| `aramaic_hebrew` | caseless | content-derived | fully | 1 |

## Sample records — `desktop-combo-mechanism` (first 12 by id)

| keyboard | value | tier | outcome | evidence |
| --- | --- | --- | --- | ---: |
| `adiga_danef` | — | default-fallback | fallback-only | 0 |
| `afghan_turkmen` | direct-key | content-derived | fully | 103 |
| `ahom_star` | direct-key | content-derived | fully | 104 |
| `akan` | direct-key | content-derived | fully | 85 |
| `akha_lahu` | — | default-fallback | fallback-only | 0 |
| `aksarabali_panlex` | context-match | content-derived | partially | 83 |
| `amazigh_latin` | direct-key | content-derived | fully | 174 |
| `anglo_furthorc_english` | direct-key | content-derived | fully | 98 |
| `anii` | direct-key | content-derived | fully | 96 |
| `arabic_izza` | — | default-fallback | fallback-only | 0 |
| `arabic_w_o_dots` | direct-key | content-derived | fully | 189 |
| `aramaic_hebrew` | direct-key | content-derived | fully | 33 |

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
| `anglo_furthorc_english` | bare-vk+named-modifier+quoted-literal+u-notation | content-derived | fully | 196 |
| `anii` | bare-vk+named-modifier+quoted-literal | content-derived | fully | 192 |
| `arabic_izza` | quoted-literal+u-notation | content-derived | fully | 90 |
| `arabic_w_o_dots` | bare-vk+named-modifier+quoted-literal+split-modifier | content-derived | fully | 378 |
| `aramaic_hebrew` | bare-vk+named-modifier+quoted-literal+u-notation | content-derived | fully | 66 |

## Sample records — `fallback-posture` (first 12 by id)

| keyboard | value | tier | outcome | evidence |
| --- | --- | --- | --- | ---: |
| `adiga_danef` | — | default-fallback | fallback-only | 0 |
| `afghan_turkmen` | blocks-comprehensively | content-derived | fully | 47 |
| `ahom_star` | blocks-comprehensively | content-derived | fully | 47 |
| `akan` | blocks-comprehensively | content-derived | fully | 47 |
| `akha_lahu` | — | default-fallback | fallback-only | 0 |
| `aksarabali_panlex` | mixed | content-derived | partially | 47 |
| `amazigh_latin` | blocks-comprehensively | content-derived | fully | 47 |
| `anglo_furthorc_english` | blocks-comprehensively | content-derived | fully | 47 |
| `anii` | blocks-comprehensively | content-derived | fully | 47 |
| `arabic_izza` | — | default-fallback | fallback-only | 0 |
| `arabic_w_o_dots` | blocks-comprehensively | content-derived | fully | 47 |
| `aramaic_hebrew` | blocks-comprehensively | content-derived | fully | 47 |

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
| `anglo_furthorc_english` | positional | content-derived | fully | 1 |
| `anii` | positional | content-derived | fully | 1 |
| `arabic_izza` | positional | content-derived | fully | 1 |
| `arabic_w_o_dots` | positional | content-derived | fully | 1 |
| `aramaic_hebrew` | positional | content-derived | fully | 1 |

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
| `anglo_furthorc_english` | — | content-derived | fully | 0 |
| `anii` | nfc | content-derived | fully | 3 |
| `arabic_izza` | — | content-derived | fully | 0 |
| `arabic_w_o_dots` | — | content-derived | fully | 0 |
| `aramaic_hebrew` | — | content-derived | fully | 0 |

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
| `anglo_furthorc_english` | none | content-derived | fully | 1 |
| `anii` | none | content-derived | fully | 1 |
| `arabic_izza` | none | content-derived | fully | 1 |
| `arabic_w_o_dots` | none | content-derived | fully | 1 |
| `aramaic_hebrew` | none | content-derived | fully | 1 |

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
| `anglo_furthorc_english` | inline-rules | content-derived | fully | 98 |
| `anii` | inline-rules | content-derived | fully | 96 |
| `arabic_izza` | inline-rules | content-derived | fully | 90 |
| `arabic_w_o_dots` | inline-rules | content-derived | fully | 189 |
| `aramaic_hebrew` | inline-rules | content-derived | fully | 33 |

## Sample records — `script` (first 12 by id)

| keyboard | value | tier | outcome | evidence |
| --- | --- | --- | --- | ---: |
| `adiga_danef` | Latn | content-derived | fully | 36 |
| `afghan_turkmen` | Arab | content-derived | fully | 68 |
| `ahom_star` | Ahom | content-derived | fully | 58 |
| `akan` | Latn | content-derived | fully | 46 |
| `akha_lahu` | Latn | default-fallback | fallback-only | 0 |
| `aksarabali_panlex` | Bali | content-derived | partially | 61 |
| `amazigh_latin` | Latn | content-derived | fully | 103 |
| `anglo_furthorc_english` | Runr | content-derived | fully | 35 |
| `anii` | Latn | content-derived | fully | 59 |
| `arabic_izza` | Arab | content-derived | fully | 53 |
| `arabic_w_o_dots` | Arab | content-derived | fully | 97 |
| `aramaic_hebrew` | Syrc | content-derived | fully | 32 |

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
| `anglo_furthorc_english` | — | content-derived | fully | 98 |
| `anii` | — | content-derived | fully | 96 |
| `arabic_izza` | — | content-derived | fully | 90 |
| `arabic_w_o_dots` | — | content-derived | fully | 189 |
| `aramaic_hebrew` | — | content-derived | fully | 33 |

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
| `anglo_furthorc_english` | desktop+touch+web | declared-metadata | fully | 3 |
| `anii` | desktop+touch+web | declared-metadata | fully | 3 |
| `arabic_izza` | desktop+touch+web | declared-metadata | fully | 3 |
| `arabic_w_o_dots` | desktop+touch+web | declared-metadata | fully | 3 |
| `aramaic_hebrew` | desktop+touch+web | declared-metadata | fully | 3 |

