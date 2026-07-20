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
| `encoding` | 46 | **likely the same key-map win** — per-role output/keys read via `index(store)`/`any(store)`. | reuse `key-map.ts` / store resolution; diagnose one first. |
| `casing` | 15 | subset of the old 108; produced-char extraction doesn't resolve `index(store)`/`outs(store)` outputs → "no produced characters". | resolve output-store chars (extend the produced-char extraction with store lookup). |
| `desktop-combo-mechanism` / `fallback-posture` | 12 each (shared set) | hard residue — **no recognized `using keys` key at all** (store-only / opaque / non-keystroke). | inspect each; decide genuine `notApplicable` vs a rule shape still unmodeled. List below. |
| `rule-store-compaction` | 12 | separate, small | low priority |
| `caps-handling` / `mnemonic-vs-positional` / `reordering-rules` | 7 each | the near-empty keyboards | low priority |

**Do NOT touch these `notApplicable` blocks** — they are correct per spec AS-4/5 and US2; forcing values is the defect §3c warns against:
- `caps-handling` 358 (caseless scripts), `normalization-posture` 455 (abjad/abugida), touch-`*` 151 each (desktop-only keyboards).

**The shared 12-keyboard residue** (undetermined in both `desktop-combo-mechanism` and `fallback-posture`):
`bukawa, cs_pinyin, galaxie_greek_hebrew_mnemonic, galaxie_greek_hebrew_positional, gff_amh_powerpack_7, gff_gurage_and_amharic, imperial_aramaic, karakalpak_latin, phonetic_farsi, sil_zaiwa, syriac_aramaic, vm_tamil`

## Recommended next step

**`encoding` (46) + `casing` (15) together** — highest leverage, reuses `key-map.ts`, likely ~60 recovered. Then a **`strategy-fingerprint` audit** (confirm the 709 are deliberate). Leave the low-priority small sets and the 12 residue for a per-keyboard pass once the big wins are in.

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
