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
   *compile today*. Where Keyman accepts less than the standard:
   - **hardware**: the export conforms to the standard *and* stays inside Keyman's subset;
   - **touch**: the export follows the standard alone. The product goal is spec-perfect touch
     LDML, ready for Keyman's touch pipeline, which does not yet support the touch half.

   Either way the difference is a status-K row, never an "LDML incompatibility".
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

## R13 — RESOLVED: 46 vs current TR35 (CLDR 49), and Keyman's reaction

Infographic: [docs/design-notes/ldml-version-gap.html](../../docs/design-notes/ldml-version-gap.html) (text twin: [ldml-version-gap.md](../../docs/design-notes/ldml-version-gap.md)).

**Format delta 46 → 49.** Confirmed by diffing CLDR `keyboards/dtd/ldmlKeyboard3.dtd` at
`release-46` against `main` (49), plus the CLDR 47–49 release notes and
`tr35-modifications.html`:

| Introduced | Change | Kind |
|---|---|---|
| 47 | `info/@attribution` (CLDR-17971) | additive, optional |
| 47 | `keyboard3/@draft` = approved, contributed, provisional or unconfirmed (CLDR-18324) | additive, optional |
| 47 | formal ABNF for transform `from`/`to` (CLDR-16836/18318/18319) | grammar formalised; nothing added |
| 47–49 | `conformsTo` enum `45 \| 46` → `45 \| 46 \| 47 \| 48 \| 49` | allowed values |
| per release | `version/@cldrVersion` #FIXED "46" → "49" | optional; omitted by the exporter |
| 48 | clarifications: `display/@keyId` for keys with no output; `layer/@modifiers` when a hardware layout is used as touch; default backspace normalization | spec text only |
| 49 | clarifications to display, layer and backspace transform; test-data links removed; known issue CLDR-19754 (`minDeviceWidth` under-specified) | spec text only |

Every other element and attribute is unchanged. In particular there are **no touch schema
changes** between 46 and 49.

**Keyman's reaction** (`origin/master` `cbc752f`, 20.0.10-alpha): it **fails rather than
ignores**. The CLDR-46 JSON schema allows `conformsTo` 45 or 46 only, and sets
`additionalProperties:false` on 30 elements, including `keyboard3` and `info`. A single
violation stops the build with `Error_SchemaValidationError`, and no `.kmx` or `.kvk` is
written. Only the first violation is reported. `$[N:set]` with N > 1 also fails
(`Error_IllegalTransformToUset`). The only content Keyman deliberately ignores is
`<special>`.

**Touch in Keyman.** `kmc-ldml` compiles touch forms, flicks, long-press, multitap, layer
switches, widths and gaps into `layr`/`key2`. After that nothing consumes them:

- Core on desktop reads only the hardware key map, transforms and variables.
- KeymanWeb throws on `.kmx`, so Android and iOS cannot load any LDML keyboard, hardware half
  included.
- Keyman Developer has no LDML touch view, and "Test in browser" is a stub.

Roadmap: `epic/web-core` (not merged), plus #11293, #8093, #13429 and #13424, all milestone
20.0.

**Consequences for the profiles:**

- **Profile `49`** (TR35-only) = profile 46 plus `conformsTo="49"`, the `…/cldr/49/keyboard3`
  namespace (to confirm against the CLDR 49 XSD/DTD headers in planning), `info/@attribution`,
  and `$[N:set]` mappings. `keyboard3/@draft` is not emitted: it is a CLDR-repository review
  status, not author data.
- **Profile 46** already meets the product goal of spec-perfect touch, because the touch
  markup is identical in both.
- CI validates profile 49 against the CLDR 49 DTD plus the FR-052 rules. Under FR-065 it is
  exempt from the Keyman compile check.

## R14 — KMX+ and where it fits

**What it is.** KMX+ is the binary that Keyman compiles an LDML keyboard into
(`docs/file-formats/kmx-plus-file-format.md`, #7043). It is a block inside an ordinary `.kmx`:
a classic `KXTS` header with flag `KF_KMXPLUS`, plus `COMP_KEYBOARD_KMXPLUSINFO` pointing at
the block. `kmc-ldml` is its **only** producer, and always writes file version 17 (`0x1100`).
KMN keyboards still compile to classic `.kmx`.

**Sections and runtime use** (Keyman Core `ldml_processor.cpp`):

| Section | Holds | Core at runtime |
|---|---|---|
| `keys` (key map) | `<keys>` placed by hardware `<layers>` | read |
| `tran` | simple transforms, reorders | read |
| `bksp` | backspace transforms | read |
| `vars`, `elem`, `uset` | variables, transform sets, markers | read |
| `meta` | `info`, `version`, `conformsTo`, `settings` | the normalization flag only |
| `keys` (gestures) | flicks, long-press, multitap | validated, unused |
| `layr` | hardware **and touch** layers | validated, unused |
| `list` | long-press and multitap key lists | validated, unused |
| `disp` | `<displays>` | validated, unused |
| `loca` | `locale`, `<locales>` | validated, unused |

Desktop keycaps reach the on-screen keyboard through the `.kvk` that `kmc-ldml` builds from
the `us` hardware form.

**Two separate version axes.**

- CLDR `conformsTo` (45/46) lives in the source. It selects the schema and the CLDR imports,
  and Core only logs it. This is what the studio's profiles (FR-060–066) control.
- The KMX+ file version is v17 today. The unmerged `epic/web-core` adds v19, with a `sec2`
  table of contents and a version on every section, behind a `targetVersion` compiler option.
- Nothing maps one axis to the other. Core refuses a file newer than its `VERSION_MAX`, with no
  fallback.
- The studio never writes KMX+, so the KMX+ version is Keyman's axis. A profile's "Keyman
  compiles it" label depends only on the schema accepting its `conformsTo`.

**Roadmap that makes the touch export directly useful** (all open, milestone 20.0):

- **web-core** (#11293): KeymanWeb, and with it Android and iOS, loads `.kmx`/KMX+ through
  Core WASM. That brings the hardware half of LDML keyboards to mobile.
- **Touch tables still to do:** reading `layr`, `disp` and key gestures (#15290, #13429,
  #13424, #8093).
- **#12620** "embed .kvk, .keyman-touch-layout in .kmx": Keyman plans to *convert a KMN
  keyboard's `.kvks` and touch layout into LDML source and compile them into KMX+ tables*.
  That is the same touch-to-LDML conversion as mapping contract section 5. The studio's
  converter is therefore prior art for an upstream need, and a candidate for contribution
  alongside the `kmc-convert` follow-up in R10.

**In-browser compile (plan option, untested).**

- `kmc-ldml/src` has no `fs`, `path` or `node:` imports; all I/O goes through callbacks. It
  needs the kmcmplib WASM (its UnicodeSet parser) and the CLDR implied-import XMLs, served
  through `loadFile`.
- The studio could therefore compile its export to KMX+ in the browser, as a build check
  against the K-row set (FR-050) without waiting for CI. The `/speckit-plan` decision is
  whether to do it, weighed against bundle size and Art IV: it would be a download-time
  check, not a diagnostic cycle.
- `kmxToXml` (`kmc-ldml/src/util/serialize.ts`, #12874) round-trips the in-memory KMX+ model
  back to XML. It loses transforms that lack source hints, and all comments.

## R15 — Is "context rules without key input" a real gap?

**For text, no.** KMN cannot rewrite text without a keystroke either:

- A context-only KMN group runs only when a keystroke rule hands off to it with `use()`. LDML
  covers that with chained `transformGroup`s (mapping row 1.5).
- The two entry points that do fire without a character keystroke, `begin NewContext` and
  `begin PostKeystroke`, require `readonly` groups, which cannot emit text
  (help.keyman.com `developer/language/reference/begin.md:39-57`, Keyman 15.0).

**Corpus check** (`../keyboards`, release and experimental, 2026-11-01): 50 of 1,036 `.kmn`
files use either entry point. All 97 entry groups are `readonly`, and every file uses them
for touch layer switching. The dominant rules are:

- `any(sentencePunctuation) ' ' > layer('shift')`
- `nomatch > layer('default')`
- `if(&newLayer = "") > use(detectStartOfSentence)`
- `if(&layer = 'numeric') any(digit) > context`

None rewrites text.

**The real gap: automatic touch layer state.** That means start-of-sentence shift, return to
the default layer, numeric-layer stickiness, and caps emulation (casing support, #3621, Keyman
15).

- LDML's only layer control is `key/@layerId` on the pressed key. A key may output and then
  switch.
- TR35 discards the input context when the insertion point moves, and has no hook for that
  event or for a post-keystroke layer choice.
- The loss is touch-only: these groups run only on web, iOS and Android, never on Windows,
  macOS or Linux (`begin.md:103-107`).

**Upstream status.**

- **Known only in passing.** On #15286 (open, 20.0, web-core `processPostKeystroke`), Marc
  Durdin wrote on 2026-04-14 that PostKeystroke is "conceptually supported by the
  KmxKeyboardProcessor … but not LdmlKeyboardProcessor". #15291 covers NewContext for KMN.
  Keyman Core does not run either group even for KMX today; only the KeymanWeb JS compiler
  does (`kmw-compiler.ts:114-118,280-284`).
- **No issue asks for an LDML or CLDR equivalent.** #8093 (LDML touch umbrella) does not
  mention it. #12620, which converts KMN touch layouts to LDML/KMX+, would drop this behaviour
  for those 50 keyboards unless KMX+ or TR35 gains a mechanism. Ten `gh` searches found no
  CLDR GitHub issue; CLDR Jira was not searched.
- **Follow-up candidate:** raise it with the Keyman team (on #12620/#8093) and as a CLDR
  ticket. It is out of scope for spec 108, which reports it as `KM_LINT_LDML_NO_KEY_TRIGGER`
  with a touch-specific consequence message.

## Reference pairs in the corpus

- `ibono_chwerty` — a `.kmn` and a hand-written `source/extras/ibono_chwerty.xml` in the same
  project; shows CLDR punctuation key ids via `import base="cldr"`.
- `khmer_angkor` (`.kmn`) and `khmer_ldml` (experimental; a hand port of it) — exercises
  variables, `uset`, reorder, backspace transforms.
- `imperial_aramaic` — an LDML-only keyboard in `release/`.
