# Research: LDML keyboard export

**Spec**: [spec.md](spec.md) · **Mapping contract**: [contracts/ldml-mapping.md](contracts/ldml-mapping.md)
**Gathered**: 2026-11-01

## Authority order

When sources disagree, this order decides (set by the product owner for this feature):

1. **The LDML standard** — CLDR TR35 Part 7, Keyboards. Revision read: CLDR 49, `tr35-79`,
   dated 2026-10-21 (<https://www.unicode.org/reports/tr35/tr35-keyboards.html>). It defines
   what *valid* LDML is.
2. **The Keyman team's upstream work** — `keymanapp/keyman` `origin/master` (`cbc752f67b`,
   2026-10-29), the `epic/ng-compiler` branch, and draft PR #16870. It defines what Keyman can
   *compile today*. Where Keyman accepts less than the standard, the export conforms to the
   standard **and** stays inside Keyman's subset; the difference is a status-K row, never an
   "LDML incompatibility".
3. **The product owner's prior work** — the `kmc-kmn-to-ldml` converter on the
   `MattGyverLee/keyman` fork branches, `KMJStoLDML`, `ParseKB`. Prior art for mapping ideas
   and known losses; not an authority.

## R1 — Which `conformsTo`

- **Decision**: emit `conformsTo="46"`, `xmlns="https://schemas.unicode.org/cldr/46/keyboard3"`.
- **Why**: TR35 defines `conformsTo` as the *minimum* CLDR version the file needs (≥ 45).
  Keyman's schema accepts only `"45"` or `"46"`
  (`resources/standards-data/ldml-keyboards/46/ldml-keyboard3.schema.json`, `conformsTo` enum),
  and only the 46 data set ships upstream. Using only v46 features keeps the file valid under
  CLDR 49 and compilable by Keyman 19.
- **Rejected**: `conformsTo="49"` — valid TR35, rejected by every shipping Keyman.

## R2 — `info` attributes

- TR35 (CLDR 49) lists `name`, `author`, `layout`, `indicator`, `attribution`.
- Keyman's v46 schema: `info` has `additionalProperties:false` and only `name` (required),
  `author`, `layout`, `indicator`. **Emitting `attribution` breaks the Keyman compile.**
  Verified directly on `origin/master`. Mapping row 4.10.
- `version`: `number` must be plain semver; `cldrVersion`, if present, must be `"46"` — omit it.
- `settings`: only `normalization="disabled"` exists.

## R3 — Transform subset Keyman 19 accepts (stricter than TR35)

From `kmc-ldml` on the local checkout and `origin/master`:

- `from`: literals, `.`, `[...]`/`[^...]`, `\s\S\d\D\w\W\t\r\n\f\v`, `\u{…}`, `${str}`,
  `$[set]`, `\m{id}`/`\m{.}`, `(?:…)`, `|`, `?`, `{d,d}` with single-digit bounds, `^` at the
  start only. **No** `*`, `+`, lookaround, back-references, nested groups, bare `$`. Must not
  match the empty string.
- `to`: literals, `$1`–`$9`, `\\`, `\$`, `$$`, `\u{…}`, `\m{id}`, `${var}`, or a set mapping
  that is **the entire attribute**: `$[1:set]`.
- Set mapping: the mapped `($[set])` must be **capture group 1**; both sides `<set>` (not
  `<uset>`); equal item counts — checked only by a runtime `assert`, so the exporter must
  guarantee it.
- Upstream status: issue #16868 (open) and draft PR #16870 relax only the group index
  (`$[N:var]`). Multiple maps per transform need binary-format, core and compiler changes,
  targeted "v20?". **Plan for group-1-only.** Mapping rows 3.7–3.8.
- `\uXXXX` escapes are an error; use `\u{…}`. Non-NFC/NFD strings warn (`WARN_StringDenorm`).

## R4 — When LDML transforms run (the "no key input" boundary)

- TR35: transforms match the input context; backspace transforms run on backspace before
  simple transforms. The text does not define contextless transforms.
- Keyman core (`core/src/ldml/ldml_processor.cpp:182-292`): simple transforms run **only on
  key-down of a key with non-empty output**; backspace transforms on unmodified Backspace;
  there is **no** hook for context-only, key-up, or caps-lock events.
- Consequence (mapping section 1): context-only KMN groups reached by `use()` from a
  keystroke **do** map, as later `transformGroup`s — LDML runs every group after each
  outputting key. `begin NewContext`, `begin PostKeystroke`, `readonly` groups, and
  `match`/`nomatch` output **do not**.

## R5 — Rule precedence

kmcmplib sorts every group's keys by trigger key, then **context length descending**, then
source line (`developer/src/kmcmplib/src/Compiler.cpp:701-755`, `ProcessGroupFinish`), after
caps-rule expansion (`ExpandCapsRulesForGroup`). LDML applies the first matching transform in
document order. The exporter therefore writes each group's transforms in kmcmplib's effective
order, not source order.

## R6 — Hardware positions

- TR35 predefined forms: `us`, `iso`, `jis`, `abnt2`, `ks`, plus `touch`. One hardware
  `<layers>` per file.
- Keyman reads the per-form scan-code grids from `scanCodes-implied.xml`; unused positions
  become gaps. Rows must be joined by exactly one space (`layr.ts:78` vs `keys.ts:480`,
  `util.ts:64`).
- Hardware layers need non-empty `modifiers` (`"none"` for the base) and no `id`; touch layers
  need an `id` and no `modifiers` (origin/master `57f0dc4597`, #12423).
- `minDeviceWidth` may be omitted when there is one touch form (origin/master `7b6447c3e4`).
- Reusable position tables: the "RICH" prior-art generator's per-form row tables
  (us/iso/jis/abnt2/ks), and `ParseKB.py:15-66` (`kbLinks`: XKB name, scan code, VK, `K_*`,
  including `K_oE2`). The CLEAN branch's `vkeyToHardware` table is incomplete (no `K_oE2`) and
  unused — do not copy it.

## R7 — Prior art and what it teaches

Three generations of `kmc-kmn-to-ldml` exist on the product owner's Keyman fork:
`feat/kmn-ldml-roundtrip-clean` (CLEAN), `MattGyverLee/feat/kmn-ldml-roundtrip` (RICH, the
best design source), and `…/claude/ldml-ja-compile-clean-…` ≈ `feat/ldml-js-compile-clean`
(LATEST). Its corpus run reported 843/861 "successes", but **success meant "no exception
thrown"**: a line-by-line check on 111 SIL keyboards found 1 641 of 29 856 lines identical.
All 18 failures were mnemonic keyboards, which it refused.

Defects this spec designs out (each is a mapping-contract row or a functional requirement):

| Prior-art defect | Fix in this spec |
|---|---|
| Keys with no rule produced nothing (base-keyboard fall-through lost) | Row 2.8, FR-021 |
| All Alt variants collapsed to `altR` | Row 2.10 |
| Last rule wins on a key's output; context rules corrupted the base output | Section 3 trigger model |
| Combining-key markers left behind | Section 3, step 3 catch-all |
| Rules with empty `to` (`nul`, deletions) silently dropped | Row 3.15 |
| `if()` conditions silently removed, rule kept | Row 3.17 (default-value evaluation, warned) |
| `index()` silently dropped when pairing failed | Rows 3.7–3.9 |
| `notany`, `outs`, `context(n)` dropped | Rows 3.10–3.14 |
| Tablet touch layout discarded | Row 5.2 |
| Touch labels used as outputs | Section 5 preamble |
| Non-deterministic key ids (`Date.now()`) | Mapping "Key ids", FR-030 |
| Locale always `en` | Row 4.4 |
| Mnemonic refused | Row 2.7 (resolve + warn) |
| Output never validated | FR-031, SC-001 |

`KMJStoLDML` emits the pre-v44 `<keyboard>` shape from compiled KeymanWeb labels only — not a
mapping source. `ParseKB` produces no LDML but its `kbLinks` table and token classifier
(`buildCombo`) are useful cross-checks.

## R8 — OPEN: backspace/enter/tab on LDML touch layouts

The research did not establish how touch backspace, enter and tab keys are represented in
LDML. Frame keys are a TR35 non-goal for hardware.

Because the touch half targets the standard (spec FR-053), resolve this in `/speckit-plan`
against **TR35 and the CLDR touch examples first**: the `<keyboard3>` touch layouts in CLDR's
keyboards data, and `resources/standards-data/ldml-keyboards/46/3.0/*.xml`. Consult `kmc-ldml`
`keys.ts` only to record a Keyman gap.

Until then mapping row 5.13 is status A.

## R9 — OPEN: normalization default

LDML matches in NFD; KMN matches exact codepoints. Keeping normalization on is the standard's
default and conflates only rules that distinguish composed from decomposed text (row 3.22).
`normalization="disabled"` is closer to KMN semantics but draws `HINT_NormalizationDisabled`
and changes matching for every rule. Before planning, confirm which normalization form Keyman
core emits to the application when normalization is on, because a KMN keyboard that
deliberately outputs decomposed text would change its output under NFC. Default until then:
normalization on, conflated pairs warned.

## R10 — Upstream KMN↔LDML plans

No upstream issue proposes KMN→LDML conversion, and none lists an LDML-vs-KMN gap. `kmc-convert`
converts keylayout→kmn only; its planned shared model (#13339) is unbuilt. The ng-compiler
(#13349, milestone 20.0) targets KMX; its `NodeType` enum
(`developer/src/kmc-kmn/src/ng-compiler/node-type.ts` on the smbuilder branch) is a useful
checklist of KMN constructs and was used to check the mapping contract for coverage. Keyman 19
removed `clearcontext`, `fix`, `switch`, and `key` statements.

**Implication**: there is no official converter to defer to. If the studio's exporter proves
out, offering it upstream as a `kmc-convert` target (via #13339) is a follow-up, not a
dependency.

## R11 — Packaging an LDML keyboard in Keyman

`kmc build` compiles `.xml` to `.kmx` (KMX+) and `.kvk`. `kmc generate ldml-keyboard <id>`
creates `<id>.kpj` (v2.0), `source/<id>.xml`, `source/<id>.kps`, `source/readme.htm`,
`source/welcome.htm`, `LICENSE.md`, `README.md`, `HISTORY.md`. The `.kps` lists
`..\build\<id>.kmx` and `..\build\<id>.kvk`, not the `.xml`. In Keyman 19, LDML keyboards
target desktop only: `&TARGETS` is hard-coded to `desktop` and the web engine rejects `.kmx`.

## R12 — Studio surfaces (as of `origin/main`)

- The IR is KMN-shaped (spec.md:279). No document says it was designed for LDML; this spec
  is its first non-KMN emitter.
- `IRHeader.bcp47` is always `[]` from the parser (`parse.ts:1403`); language tags come from
  the identity overlay and the `.kps` writer.
- Output page: `OutputScreen.tsx` (.kmp button `:475-507`, .zip `:555-579`); handlers in
  `usePreviewArtifact.ts`; bundle builders in `lib/buildOutputBundle.ts`; engine output
  functions are lazy-loaded through `lib/services.ts`.
- `ProjectWorkingCopyForOutputResult` returns a VFS, not an IR. The exporter needs the
  projected IR: re-parse the projected `.kmn`, or widen the result. Plan decision.
- Precedent for an engine detector feeding studio findings inside the D3 cycle:
  `findSessionOe2SoleSourceGlyphs` → `useOe2SoleSourceFindings` (a `useMemo`, no timer) →
  `KM_LINT_OE2_SOLE_SOURCE_GLYPH`, Layer C, `warning`, routed to a question by
  `lintToQuestion.ts`.
- depcruise forbids `keyboard-lint → engine`, so a classifier shared by the exporter and the
  warnings belongs in the engine, not in `@keymanapp/keyboard-lint`.
- `@keymanapp/developer-utils` (already an engine dependency) ships `KeymanXMLWriter`, the
  `LDMLKeyboard` types, and `LDMLKeyboardXMLSourceFileReader.validate`. Browser bundle-safety is
  unverified; load it lazily, as `output/kmp.ts` loads `kmc-package`.
- The reference base-keyboard data (`referenceBaseLayouts.ts`) lives in the **studio**; the
  engine exporter must receive it as input.

## Reference pairs in the corpus

- `ibono_chwerty` — a `.kmn` and a hand-written `source/extras/ibono_chwerty.xml` in the same
  project; shows CLDR punctuation key ids via `import base="cldr"`.
- `khmer_angkor` (`.kmn`) and `khmer_ldml` (experimental; a hand port of it) — exercises
  variables, `uset`, reorder, backspace transforms.
- `imperial_aramaic` — an LDML-only keyboard in `release/`.
