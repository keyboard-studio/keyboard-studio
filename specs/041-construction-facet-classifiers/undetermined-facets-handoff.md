# Handoff — recovering `undetermined` construction-facet values

**Status:** in progress · **Branch:** `041-construction-facet-classifiers` · **PR:** [#1190](https://github.com/keyboard-studio/keyboard-studio/pull/1190) (open, unmerged)
**Scope:** follow-up polish on spec 041 classifiers — turning `undetermined` facet values into real values where the value is genuinely determinable. Not a new spec; rides the open 041 PR (the classifiers being fixed exist only on this branch, not yet on `main`).

## The core idea

The construction classifiers read the parsed `KeyboardIR`. Several were only recognizing **positional `[vkey]` rules** and silently dropping keyboards that express keystrokes another way. When a classifier can't read the signal it emits `undetermined` (via `undeterminedFallback`) — but for ~108 corpus keyboards the signal was there; the classifier just didn't parse the rule shape. So these are **classifier blind spots, not missing data**. The honest fix is to teach the classifier the rule shape (yielding a *real* value), never to assign a blanket default.

**Rule shapes that were being missed** (all legitimate keystroke rules in `using keys` groups):
- `+ any(store) > index(store,n)` — store-driven remap. Key matched via `any(store)`, not `[vkey]`. (bamum, akha_lahu, fulfulde_latin_qwerty, basic_kbdoldit, …)
- `";" + any(basekey) > index(out,2)` — a base-layout **overlay**: the bare keystroke falls through to QWERTY; only the `;`-prefixed form remaps. (adiga_danef archetype)
- `"x" + "y" > "z"` — character-literal keys / context prefixes. (ekwtamil99uni, deseret)

**Key IR facts** (`packages/contracts/src/keyboard-ir.ts`):
- A rule's whole LHS is flattened into `context[]` with **no `+` marker**. The **struck key is the LAST `context` element**; everything before it is match-context. (`ruleKey` / `ruleContextPrefix` in `ir-scan.ts`.)
- `IRGroup.usingKeys` distinguishes keystroke groups from context/output groups — gate keystroke detection on it.
- Store items: plain `[K_A]` → `{kind:"vkey",name}`; **modified `[SHIFT K_1]` → `{kind:"raw",text:"[SHIFT K_1]"}`** (recover the `K_` token by regex); char stores `"ab;"` → `{kind:"char",value}`.
- `caps-handling` and `rule-store-compaction` already read `any(store)` (see their in-file comments) — that's why they were never in the 108.

## Done (committed on this branch)

| commit | facet | undetermined | value→value | verification |
|---|---|---|---|---|
| `bb1b987` | `desktop-combo-mechanism` | 108 → **12** (96 recovered) | 92 corrected (53 false `modifier-key` → context-match/direct-key) | 3 tests; determinism byte-identical; lint green; tool tsc clean |
| `b2a37bd` | `fallback-posture` | 108 → **12** (96 recovered) | 145 corrected (100 `relies-on` → `blocks-comprehensively`) | 2 tests; verified basic_kbdoldit 37/47 keys, bassa_vah `any(vowelsK/consK/digitsK)` |

**Why the value→value changes are corrections, not regressions:** the old classifiers computed distributions/coverage from an incomplete rule census (only `[vkey]` rules). Recognizing the missing rules shifts the dominant *toward* the previously-invisible rule types — uniformly, in the expected direction. `modifier-key` was over-reported (it won by default when a keyboard's only counted rules were its few RALT chords); `relies-on` was over-reported (comprehensive `any(store)` coverage was invisible). Both movements are toward the truer picture. Blast radius is large (~20–26% of the corpus per facet) but justified. Spot-check any surprising flip with the probe recipe below before trusting a future change.

**Reusable machinery now in place:**
- `utilities/facet-index/ir-scan.ts` — `ruleKey(rule)`, `ruleContextPrefix(rule)`, `isKeystrokeRule(rule, group)` (usingKeys-gated; accepts vkey/char/any/notany keys).
- `utilities/facet-index/key-map.ts` — `US_CHAR_TO_KEY` (US-QWERTY char→physical key, shift folded onto base) and `physicalKeysForRuleKey(key, stores)` (resolves a rule's struck key to physical keys, enumerating `any(store)`). Built to be reused by `casing`/`encoding`.

## Remaining `undetermined` (current committed index)

| facet | undet | assessment | recommended approach |
|---|--:|---|---|
| `strategy-fingerprint` | 709 | **probably by-design** (037's fingerprint abstains without a strong signal). **Audit, do not "fix"** until confirmed it's deliberate, not a blind spot. | read the classifier; confirm the 709 are intentional abstentions. If some are the same rule-shape blind spot, apply `ir-scan`/`key-map`. |
| `normalization-posture` | 114 | separate cause (NFC/NFD signal genuinely absent). **+455 correct `notApplicable`** (abugida/abjad — leave alone). | diagnose one; likely needs the backspace-match / combining-sequence signal, not key-map. |
| `encoding` | 46 | **RE-DIAGNOSED (2026-07-19): NOT a key-map win.** The dominant cause is **store range notation** `U+XXXX .. U+YYYY` that the codec misparses (BMP: interior codepoints dropped, `..` → `{raw}`) or discards (SMP: whole store opaque). Alphabet-in-range historic scripts (Takri, Medefaidrin, Sogdian, Pahlavi, …) → empty produced set → `undetermined`. A minority (e.g. `adiga_danef`: `";" + any(basekey) > index(output_char,2)` over **char-literal** stores) is a genuine store-resolution case for the text-parse. | **Covered by [spec 042](../042-store-range-notation/spec.md)** — fix the codec range handling; the produced set then repairs `encoding`/`casing`/`script` with no classifier change (FR-011). The residual non-range `adiga_danef`-style cases stay here (extend the encoding text-parse to read store-declaration spelling for store-driven rules). |
| `casing` | 15 | **RE-DIAGNOSED (2026-07-19): same root cause as `encoding`.** `buildProducedSet` DOES resolve `index(store)`/`outs(store)`; the produced set is empty because the **output stores themselves** are range-notation/SMP and never parse into `ir.stores` (verified on `takri_inscript`: all `U`-suffixed output stores are `smp-literal` opaque; produced size 0). Not a produced-char-extraction bug. | **Covered by [spec 042](../042-store-range-notation/spec.md).** Once range/SMP stores parse, the produced set is non-empty and the script-identity gate reads a value. No `casing`-classifier change expected. |
| `desktop-combo-mechanism` / `fallback-posture` | 12 each (shared set) | hard residue — **no recognized `using keys` key at all** (store-only / opaque / non-keystroke). | inspect each; decide genuine `notApplicable` vs a rule shape still unmodeled. List below. |
| `rule-store-compaction` | 12 | separate, small | low priority |
| `caps-handling` / `mnemonic-vs-positional` / `reordering-rules` | 7 each | the near-empty keyboards | low priority |

**Do NOT touch these `notApplicable` blocks** — they are correct per spec AS-4/5 and US2; forcing values is the defect §3c warns against:
- `caps-handling` 358 (caseless scripts), `normalization-posture` 455 (abjad/abugida), touch-`*` 151 each (desktop-only keyboards).

**The shared 12-keyboard residue** (undetermined in both `desktop-combo-mechanism` and `fallback-posture`):
`bukawa, cs_pinyin, galaxie_greek_hebrew_mnemonic, galaxie_greek_hebrew_positional, gff_amh_powerpack_7, gff_gurage_and_amharic, imperial_aramaic, karakalpak_latin, phonetic_farsi, sil_zaiwa, syriac_aramaic, vm_tamil`

## Recommended next step

**SUPERSEDED (2026-07-19).** The `encoding` (46) + `casing` (15) residue was re-diagnosed: it is not a `key-map` win but the codec's **store range-notation** blind spot (`U+XXXX .. U+YYYY`), now owned by **[spec 042](../042-store-range-notation/spec.md)** on this same branch. Do that codec fix first — the produced set repairs `encoding`/`casing`/`script` with no classifier change. The remaining 041-local work is: the non-range `adiga_danef`-style store-spelling cases for `encoding`, then a **`strategy-fingerprint` audit** (confirm the 709 are deliberate). Leave the low-priority small sets and the 12 residue for a per-keyboard pass.

## Known limitation + a requested capability: glyph multi-path reachability

**Limitation found (touch-combo-mechanism).** Its distribution is **occurrence-based, not a key partition.** `keyMechanisms` (touch-layout.ts) tags a key with *every* affordance it offers (`longpress` if `sk`, `layer` if `nextlayer`, plus `flick`/`multitap`); only `key` (direct) is exclusive. `comboMechanismCounts` sums occurrences, so a key with both a longpress popup and a layer switch is counted in **both** buckets. Consequence: the shares summing to 1.0 does **not** mean the mechanisms are disjoint — the metric **cannot express affordance co-occurrence**. (Worked example: `ahom_star` has 25 longpress keys and 7 layer keys with **0** overlap, so its distribution happens to be a clean partition — but a keyboard that put a longpress popup on a layer-switch key would look identical in the shares while being materially different.)

**Requested capability (owner ask): tell me when a glyph — or a class of glyphs — is reachable by more than one input path.** This is a NEW analysis, not an `undetermined` fix; the current facets classify mechanism *distribution*, never per-glyph reachability. Sketch of what it needs:

- **Build a reachability map: output glyph → set of input paths.** Enumerate every path that can produce a glyph:
  - desktop `.kmn` — each rule's output glyph(s) via its key path (direct key, modifier chord, deadkey sequence, context-match); resolve `index(store,n)` / `outs(store)` outputs against the matched-key store so store-driven remaps expand to concrete glyphs (reuse `key-map.ts` + store resolution).
  - touch `.keyman-touch-layout` — each key's base `text`, plus its `sk` longpress popups, `multitap`, `flick`, and layer-reached variants (walk `iterKeys` + the sub-affordance arrays in touch-layout.ts).
- **Flag glyphs with ≥2 distinct paths** (e.g. a character available both as a desktop deadkey sequence and a touch longpress, or via both a longpress and a layer). Report per glyph AND aggregated by **glyph class** — by Unicode block / script (reuse `ucd/generated/scriptLookup.ts`), or by combining-class / base-vs-mark — so "all combining marks are reachable two ways" surfaces as one finding, not N.
- **Shape:** likely its own artifact/facet rather than bolting onto `touch-combo-mechanism` (which stays a per-keyboard mechanism histogram). Cross-references `encoding` (per-role glyph spelling) and the touch facets. Determinism + provenance rules apply as elsewhere.
- **Why it matters:** redundant input paths are a design signal (discoverability vs. clutter; touch/desktop parity), and single-path glyphs for a whole class flag a coverage gap. Keep it a *measurement* (surface reachability) — do not auto-"fix" redundancy.

## How to work (environment)

**Running the CLI (bash `tsx`/`npx tsx` are broken here — not on PATH):**
```bash
cd utilities/facet-index
TSXCLI="../../node_modules/.pnpm/tsx@4.22.4/node_modules/tsx/dist/cli.mjs"
node "$TSXCLI" cli.ts --classified-only              # regenerate docs/keyboard-facet-index.json (+ .md)
node "$TSXCLI" cli.ts --classified-only --out /tmp/x.json --quiet   # build to scratch (safe compare)
node "$TSXCLI" cli.ts --help                          # flags: --check, --out, --limit, --corpus-root
```
(Run from the **tool dir** so tsx reads the tool's tsconfig `paths` for `@keyboard-studio/contracts`. Version `4.22.4` — check `node_modules/.pnpm/` if it bumps. tsc runs fine via PowerShell: `npx tsc --noEmit -p tsconfig.json`.)

**Diagnose one keyboard's rule shapes** (adjust the id; corpus is the sibling `../keyboards` checkout, layout `release/<letter-or-word>/<id>/source/<id>.kmn`):
```bash
F=$(find ../keyboards -iname "<id>.kmn" | head -1)
```
Or run a `parse`-based probe with `import { parse } from '../../packages/engine/src/codec/index.ts'` via the `node "$TSXCLI" -e "…"` form (see git history of this session for the old-vs-new blocked-set probe used on basic_kbdoldit).

**Measure blast radius** (before/after value transitions) with a node script over `docs/keyboard-facet-index.json` (committed = before) vs a `--out` scratch build (after). Tally `null→value` (recovered) and `value→value` (corrected), grouped by transition, and confirm the direction is coherent.

## Verification checklist (every facet change)

1. `cd utilities/facet-index && npx vitest run <facet>-classifier.test.ts` — add a test per recovered rule shape.
2. `npx vitest run` — full suite green (currently **162**).
3. Rebuild `--classified-only`; **determinism**: build again to a scratch `--out` and `diff` — must be byte-identical.
4. `node utilities/facet-index-lint/index.js` — GREEN (16 facet definitions, 920 keyboards).
5. `npx tsc --noEmit -p tsconfig.json` (PowerShell) — clean.
6. Measure and eyeball the value→value transitions; spot-check ≥2 surprising flips against their `.kmn` with the parser probe. **Regenerate the committed `docs/keyboard-facet-index.json` + `.md`** (the classifier change is an artifact change).
7. Commit to this branch with a `fix(tools):` message stating the undetermined delta + the correction direction. It rides PR #1190.

## Guardrails

- **Never assign a blanket default or force a value** where the honest answer is `notApplicable` (§3c). Recover a value only by reading a real rule shape.
- Stay inside `utilities/facet-index/` + `content/` (FR-043 — no `packages/*` contract/codec change).
- `notany(store)` keys are left unresolved in `key-map.ts` (complement too broad) — conservative under-count; revisit only if a facet needs it.
- Keep behavior identical for pure `[vkey]` rules (the fixes were designed to be additive for those; verify via the value→value tally that vkey-only keyboards don't move).
