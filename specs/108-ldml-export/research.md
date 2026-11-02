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
| Rules with empty `to` (`nul`, deletions) silently dropped | Rows 3.15a, 3.15b, FR-029 |
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

## R8 — RESOLVED (plan, 2026-11-01): backspace/enter/tab on LDML touch layouts

- **Decision**: write each touch `K_BKSP`, `K_ENTER` and `K_TAB` special key as a **gap key of the
  same width** with id `bksp`, `enter` or `tab`: `<key id="bksp" gap="true" width="1.5"/>`.
  Status A, hint `KM_LINT_LDML_TOUCH_SPECIAL_KEY` (mapping row 5.13).
- **Why**:
  - TR35 (CLDR 49, `display` element) says: "There is currently no way to indicate that a key
    has a standardized identity". Frame keys are out of scope.
  - The DTD's `key` has no type attribute. The only implied keys are `gap`, `space` and the
    alphanumerics.
  - CLDR's own sample `3.0/fr-t-k0-test.xml:43-51` comments out `bksp` and an
    `enter to="\u{000A}"`, and writes `<key id="enter" gap="true"/>` instead.
  - TR35 allows any NMTOKEN id on a gap key, and `width` on it. kmc-ldml accepts it without a
    message (`keys.ts:369-372,405`).
- **Rejected**:
  - `output="\u{0008}"` (or U+0009/U+000A/U+000D). kmc-ldml accepts it, but it would *insert*
    a control character; in KeymanWeb none of these keys is text.
  - Omitting the key. That breaks the row's shape and loses the slot a future key identity
    would fill.
- Keyman gap, for the record only: `kmc-ldml` has `TODO-LDML` touch placeholders
  (`keys.ts:148,240`), and Core's backspace path is vkey-based.

## R9 — RESOLVED (product ruling 2026-11-01): normalization stays on

**Decision.** Keep normalization on, which is the TR35 default (TR35 (CLDR 49) §Normalization).
The export warns per keyboard wherever an output string differs from its NFC form.

**Evidence** (`keymanapp/keyman` `origin/master` `cbc752f`):

- The LDML processor normalizes context to NFD
  (`core/src/ldml/ldml_processor.cpp:308-341`).
- It reports `supports_normalization() = !normalization_disabled`
  (`ldml_processor.hpp:80`).
- `state.cpp:136` then runs `actions_normalize`, which converts output to NFC for the
  application.
- The KMX processor does not normalize (`kmx_processor.hpp:84`).

**Consequence.** Under KMN the application receives the exact codepoints the rule wrote. Under
the LDML export it receives NFC. Two cases change visible output:

- deliberately decomposed output, and composition-excluded characters such as the Devanagari
  nukta forms U+0958–U+095F;
- canonical reordering of combining marks (Arabic harakat, Hebrew points, Vietnamese).

Mapping row 3.22 keeps the context-conflation case. Row 3.23 covers the output-form case. Both
use `KM_LINT_LDML_NORMALIZATION` (warning). `normalization="disabled"` is not used: it draws
`HINT_NormalizationDisabled` and changes matching for every rule.

**Consequence for FR-051**: the keystroke-equivalence harness NFC-normalises the KMN
expected text before comparing (research R24).

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
  namespace (an identifier only; confirmed in R30), and
  `info/@attribution`. It adds no set-mapping capability. `keyboard3/@draft` is not emitted: it
  is a CLDR-repository review status, not author data.
- **Set mapping is the same in both profiles.** Three facts:
  - The TR35 prose says `$[1:variable]` "Where '1' is any numbered capture group from 1 to 9",
    in both CLDR 46.1 and CLDR 49.
  - The CLDR 49 grammar allows only `mapped-set ::= '$[1:' var-id ']'`.
  - The CLDR 49 validity constraint requires exactly one capture group with a set variable in
    `from`.

  So `$[N:set]` with N > 1 is not a 46 to 49 addition and is grammar-invalid under 49. Both
  profiles expand such mappings (rows 3.7/3.8).
- **Further 46.1 to 49 deltas missed above.**
  - CLDR 49 forbids the `\0` escape that 46.1 allowed; the escape list is now explicit.
  - CLDR 49 adds a sentence that a hardware `modifiers="none"` layer becomes the base layer
    when the keyboard is used as touch (TR35 (CLDR 49) §layers).
  - The display note about output-less keys was rewritten.

  The "introduced in 47/48" attributions in the table above were not re-verified against
  `tr35-modifications.html`. Only presence in 46.1 versus 49 was checked on 2026-11-01.
- **Profile 46** already meets the product goal of spec-perfect touch, because the touch
  markup is identical in both.
- CI validates profile 49 against the CLDR 49 XSD plus the FR-052 rules (R30). Under FR-065 it is
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

## R16 — Keyman libraries the exporter reuses (product ruling 2026-11-01, FR-080)

| Need | Library and entry points |
|---|---|
| LDML types, XML read and write, schema validation | `@keymanapp/developer-utils`: `LDMLKeyboardXMLSourceFile`, `KeymanXMLWriter`, `LDMLKeyboardXMLSourceFileReader` (including the AJV schema validate) |
| Normalization helpers | `@keymanapp/common-types`: `NFDAnalyzer`, `MarkerParser.nfd_markers`, `util.isNormalized` |
| Compile to KMX+ and `.kvk`, semantic validation | `@keymanapp/kmc-ldml`: `LdmlKeyboardCompiler`. It reuses `kmc-kmn`'s kmcmplib WASM as its UnicodeSet parser |
| Package | `@keymanapp/kmc-package` (already a dependency) |
| Project scaffold | `@keymanapp/kmc-generate`, `ldml-keyboard` template |

Not dependencies today: `kmc-ldml`, `kmc-generate`.

No library provides:

- KMN to LDML conversion (`kmc-convert` has only keylayout to kmn);
- a `\u{…}` escaper (Keyman only unescapes);
- touch layout to LDML;
- deterministic XML formatting.

These were read on a 19.x working tree. Confirm each against the pinned version in planning.

## R17 — TR35 Part 7 full reread (2026-11-01)

CLDR 49 (`tr35-79`) and CLDR 46.1 (`tr35-74`) were read in full. The findings are folded into
the mapping contract rows (2.7, 2.8, 2.17–2.19, 3.1–3.10, 3.15–3.16, 3.22–3.23, 4.8, 5.1, 5.2,
5.10 and the new modifier, backspace, key-store, context-start and reorder rows). There are no
meaning-changing 46.1 to 49 differences outside those listed in R13.

## Reference pairs in the corpus

- `ibono_chwerty` — a `.kmn` and a hand-written `source/extras/ibono_chwerty.xml` in the same
  project; shows CLDR punctuation key ids via `import base="cldr"`.
- `khmer_angkor` (`.kmn`) and `khmer_ldml` (experimental; a hand port of it) — the port
  exercises variables, `uset`, `<reorder>` and backspace transforms. KMN has no reorder
  element, so `khmer_angkor` expresses reordering as ordinary context rules; only the hand port
  uses `<reorder>`.
- `imperial_aramaic` — an LDML-only keyboard in `release/`.

---

# Plan-phase research (2026-11-01, `/speckit-plan`)

R18–R31 record the decisions the spec deferred to planning. Each one gives the decision, the
reason, and the alternatives rejected. The sources are:

- the pinned npm builds in `node_modules` (`@keymanapp/*@19.0.240-alpha`);
- the local `../keyman` checkout. Its HEAD is the feature branch
  `fix/windows/16462-osk-sticky-modifier` (`0db19a6eb7`, 2026-09-07). Where it differs from
  `origin/master` `cbc752f67b`, both are cited;
- TR35 CLDR 49 (`tr35-79`) and CLDR `main` raw files;
- the studio and engine source on this branch.

## R18 — Which Keyman defines "compilable"

- **Decision**: the pinned packages define it:
  - `@keymanapp/kmc-ldml@19.0.240-alpha`, a new engine devDependency;
  - `@keymanapp/common-types@19.0.240-alpha`, also a new engine dependency (the engine cannot
    resolve it today). T001 added it as a devDependency; T089 moved it to `dependencies` after
    confirming it is browser-safe (R32).

  Their own dependencies are exactly the 19.0.240-alpha set the engine already uses. The mapping
  contract's profile header names this pin. `origin/master` is evidence only.
- **Rationale**: FR-050 and FR-065 test "the Keyman schema pinned in CI". `origin/master` is
  20.0.10-alpha and differs: for example, it lets one touch form omit `minDeviceWidth` (R22).
- **Alternatives**:
  - Track `origin/master` from source. Rejected: nothing in CI builds Keyman.
  - Use 19.0.318-beta. Rejected: it does not match the engine's pinned kmc-kmn. A bump moves all
    `@keymanapp` packages together.

## R19 — Opaque and raw IR constructs

- **Facts** (`packages/contracts/src/keyboard-ir.ts`, `engine/src/codec/parse.ts`):
  - A rule has no key field. The keystroke follows a synthetic `{kind:"raw", text:"+"}`
    separator in `context` (`isPlusSeparator`, `rule-shape.ts:32`).
  - `set`/`save`/`reset` make the **whole rule** a `RawKmnFragment` (reason
    `option-store-directive`).
  - `if(opt <> 'v')` and an `if()` after other context become fragments (`if-option-store`).
  - `call()` becomes `call-return`.
  - `layer('x')` output, `platform(...)` context and a `match`/`nomatch` right-hand side become
    `raw` elements.
  - Only an `if(store = 'value')` in the head position is typed.
- **Decision**:
  - The classifier sub-classifies fragments by `reason`, and `raw` elements by their `text`.
    It recognises a small closed set of patterns: `use(g)`, `layer('x')`, `platform('…')`, and
    `set(&layer='x')` inside `readonly` groups (for FR-026). Anything else is
    `KM_LINT_LDML_OPAQUE`.
  - Fragments are **never exported** (status N), because exporting from `sourceText` would mean
    re-parsing `.kmn` text (Art II).
  - Row 3.18 becomes N (it was A). Row 6.1 routes the reasons above to their specific codes.
- **Alternatives**:
  - Widen the codec to type `set`/`save`/`reset` and `<>` first. Rejected: that is spec 103's
    territory. A lift row is recorded instead (mapping "Version deltas").
  - Parse `sourceText` in the exporter. Rejected by Art II.

## R20 — Normalization follow-up

- **Decision**: as R9.
- **Follow-up**: an opt-in `normalization="disabled"` export for keyboards that deliberately type
  decomposed text.
  - Owner: the engine team.
  - Trigger: the first author report of a keyboard that needs NFD output, or Keyman exposing a
    per-keyboard output-normalization setting.
  - Expiry: the spec 108 retirement pass, at which it is either filed as an issue or deleted
    (Art XI).

## R21 — Compiling the export with Keyman in tests (FR-050)

- **Decision**: `__testing__/keymanCompile.ts` wraps the compiler:
  1. `new LdmlKeyboardCompiler()`;
  2. `init(callbacks, { readerOptions: { cldrImportsPath, localImportsPaths: [] } })`;
  3. `load(name)`, which parses and checks the schema;
  4. `validate(source)`;
  5. `run(name)`, which returns the `.kmx`/`.kvk` for the Story 3 build check.

  Message codes are collected from `callbacks.reportMessage`.
- **Callbacks**:
  - `loadFile` serves the four `developer-utils/build/src/types/import/46/*.xml` files.
  - The callbacks reuse the in-memory shape of `engine/src/compiler/index.ts:328-363`, but with a
    real path join in `resolveFilename`. The existing one returns any name containing `/`
    unchanged, so `46/keys-…xml` would never resolve.
- **kmcmplib**: kmc-ldml builds a `KmnCompiler` for UnicodeSet parsing, so the kmcmplib WASM
  loads exactly as it does for kmc-kmn.
- **Schema check**: `SchemaValidators.default.ldmlKeyboard3` from `@keymanapp/common-types`
  validates the object `LDMLKeyboardXMLSourceFileReader.load` produces. `load` already calls it,
  so the compile harness covers FR-050's schema clause. `schema.test.ts` asserts it separately
  for clearer failures.
- **K-row assertion**: every K row in a profile names the Keyman message code it is expected to
  raise. The test asserts that the compiler's code set equals the export's K-row code set.
- **Alternatives**:
  - `@keymanapp/developer-test-helpers`' `TestCompilerCallbacks`. Rejected: one more pinned
    package for about 40 lines of callbacks.
  - Spawning the `kmc` CLI. Rejected: there is no CLI in CI, and it is slower.

## R22 — `minDeviceWidth`

- **Decision**: always write it. The phone form gets `1` (`PHONE_MIN_DEVICE_WIDTH`) and the
  tablet form `150` (`TABLET_MIN_DEVICE_WIDTH`, mm). Both are named constants in
  `lower/touchForms.ts`.
- **Rationale**:
  - TR35 defines it as the "minimum required width, in millimeters", "a whole number between 1
    and 999", and says "the `layers` entry with the greatest matching width will be selected".
    The DTD makes it optional.
  - The pinned kmc-ldml requires it on every touch form (`layr.ts:30-41`,
    `ERROR_InvalidLayerWidth`). `origin/master` relaxes this for one form.
  - Writing it is valid TR35, so it is not a degradation (FR-053), and row 5.1 stays M.
  - 150 rather than 100: width alone cannot tell a landscape phone (about 140–160 mm) from a
    tablet, and KeymanWeb always gives a phone its phone layout. The cost is that the smallest
    tablets in portrait get the phone layout.
  - TR35 leaves "matching" under-specified (CLDR-19754).
- **Alternatives**:
  - Omit it on the phone form. Rejected: the pinned compile fails.
  - Use 100 mm. Rejected for the landscape-phone reason. It stays a constant that can be retuned.

## R23 — Gap keys and the conformance checker

- **Decision**: the FR-052 checker (`__testing__/tr35Conformance.ts`) enforces TR35's gap-key
  ban, which kmc-ldml does not check. A gap key may have no `output`, `layerId`, `flickId`,
  `longPressKeyIds`, `longPressDefaultKeyId` or `multiTapKeyIds`, and no `<display>` may refer
  to it.
- **Other FR-052 rules the checker enforces**:
  - every touch form has a `base` layer;
  - touch layers have an `id` and no `modifiers`;
  - hardware layers have `modifiers` and no `id`;
  - every `layerId`, `flickId` and gesture key id resolves;
  - gesture-target keys carry no gestures of their own;
  - `minDeviceWidth` is 1–999 and distinct per form;
  - `width` is 0.01–100;
  - rows are joined by single spaces.

## R24 — Keystroke equivalence (FR-051)

- **Facts**:
  - No JS/TS runtime for LDML exists. KeymanWeb's LDML path is commented out, and Core WASM is
    not on npm.
  - The engine's simulator runs a **compiled KeymanWeb `.js`**, not the IR
    (`simulator/index.ts:283`). It needs `&TARGETS` to include web, fixes the base layout to
    `us`, and cannot preset option stores.
- **Decision**:
  - **KMN side**: the existing simulator. The harness compiles a test copy with `&TARGETS`
    forced to `any`. The fixture changes the target only, never the rules.
  - **LDML side**: `__testing__/ldmlInterpreter.ts`, a test-only interpreter limited to what the
    exporter emits:
    - the hardware key map by layer;
    - `simple` and `backspace` transform groups, in order;
    - markers;
    - `$[set]` and `${str}` variables, and `$[1:set]` mapping;
    - NFD matching and NFC output.
  - **Sequences**, generated per keyboard:
    - every key in every layer once;
    - every context rule's `context + key` path;
    - seeded random walks.
  - **Comparison**:
    - The KMN text is NFC-normalised before comparison (R9).
    - Positions are compared through the `us` base layout only, because that is the simulator's
      fixed base.
    - A mismatch is allowed only when the sequence exercises a report item. The harness maps
      each fired KMN rule (`firedRule`) to its classification item.
- **Alternatives**:
  - Build Core WASM in CI. Rejected: the toolchain cost is too high (see Complexity Tracking).
  - Emit `keyboardTest3` XML from the same cases for a later Core run. Deferred; the
    interpreter's case format keeps this possible.

## R25 — One classification, two paths (FR-012, SC-005)

- **Facts**:
  - The live preview already compiles the **projected** `.kmn` and parses it (`parsedIr` in
    `useKeyboardArtifact.ts:714,889`). It hands that IR to the context-tolerance analysis
    (spec 078) and then drops it.
  - The Output downloads re-project with the **output** identity (`projectWorkingCopyForOutput`,
    `applyIdentityStubMutation`). That can add `&VERSION`/`&COPYRIGHT` lines and changes the
    effective id, so line numbers can differ between the two projections.
- **Decision**:
  - The classifier is one pure engine function, `classifyForLdml(input, profile)`.
  - The preview publishes the EPHEMERAL store field `previewProjection`: `parsedIr` plus the
    projected touch-layout and `.kvks` text from the VFS it compiled, so all three inputs come from
    one projection.
    `useLdmlFindings` memoises the classification over it.
  - The download parses the output projection's `.kmn` and classifies again.
  - A **site** is identified by its IR node, not its line: `(code, rowId, nodeKey)`.
    - `nodeKey` is one of `group:<name>#<rule ordinal>`, `fragment#<ordinal>`, `store:<NAME>`,
      `touch:<platform>/<layer>/<key>`, `header:<field>` or `base:<layer>/<vkey>` (row 2.26).
    - The line is a display attribute. Findings show the preview projection's line; the report
      shows the output projection's line, which is the line in the downloaded KMN package's
      `.kmn`.
  - A corpus test runs both paths on each corpus working copy and asserts that the site sets are
    equal (SC-005).
- **Alternatives**:
  - Classify the store's `ir ?? startIr`, as oe2 does. Rejected: it lacks the projected physical
    assignments, so its sites can differ from the export's.
  - Run `projectWorkingCopyForOutput` inside the cycle. Rejected: it is async and heavy, and it
    would add a second projection on every edit.

## R26 — Base-keyboard resolution (spec FR-027, per-export picker)

- **Decision** (owner ruling, reconciled with the clarify session 2026-11-01): one base keyboard
  per export, chosen with a **per-export picker** on the Output page. `lib/ldmlBaseLayout.ts`
  computes the default and the options:
  - **Default**: the primary hardware base, i.e. the first element of the `windows-layout`
    decision's selection (`getPickedWindowsLayouts(…)[0]`, `lib/layoutFamily.ts:104`). If that
    layout has no reference character data (`WindowsLayout.host` unset), the default is shown
    as **unavailable**: the download is disabled with an explanation until the author picks
    another. It is never silently substituted (FR-027, Art X).
  - **Without a primary pick**: the first entry of `resolveLikelyBases`
    (`components/rules/baseLayouts.ts:387`) with the picks removed, so layout family, then
    language tag; then `us` (`en-US`).
  - **Options**: every reference host with character data (`REFERENCE_BASES`: `us`,
    `us-intl`, `uk`, `azerty`, `qwertz`), labelled with their names. The default is marked.
  - The chosen entry is mapped into the `referenceBaseLayouts` vocabulary (`intl` → `us-intl`)
    and passed to the engine as an `LdmlBaseLayout` whose `source` records who chose it. The
    engine never imports the studio (depcruise rule `engine-not-to-studio`).
  - **Caps layers**: the tables have four layers (`base`, `shift`, `altgr`, `shiftAltgr`), so the
    caps layers are derived as Windows does. A key whose base character has a distinct uppercase
    gets the shifted character under caps, and caps+shift gives the base character. Every other
    key repeats its non-caps output.
  - **ISO family**: the host table has a `K_OE2` cell (FR-020).
  - **`info/@layout`**: the family label comes from the host id. `us`, `us-intl` and `uk` give
    QWERTY, `azerty` gives AZERTY, and `qwertz` gives QWERTZ.
- **Fill**: the positions to fill come from spec 109's shared enumerator (its FR-040). Positions
  whose class spec 109 swallows carry `nul` rules from `swallowUndefined` and export as gap keys
  (rows 2.25, 3.15a), independent of the base keyboard. Only the remaining positions are filled.
- **Base dead keys**: the tables mark 12 dead-key cells (AZERTY, US-International) with a
  sentinel only. A position no rule covers is omitted, and row 2.26 reports it
  (`KM_LINT_LDML_BASE_DEADKEY`, hint).
- **Alternatives**:
  - The clarify session's first answer, "first entry of the ranking, no export control".
    Superseded: it predated the FR-027 ruling, and it silently skipped a primary pick without
    character data.
  - `resolveLikelyBaseLayouts` (`lib/layoutFamily.ts:243`) for the fallback. Rejected: a third
    ranking order.

## R27 — Persisting the profile and base-keyboard choices

- **Decision**: two working-copy fields, `ldmlProfile: LdmlProfileId | null` and
  `ldmlBaseLayout: BaseLayoutId | null` (FR-027), where `null` means the default. It follows the `chartPreference` precedent:
  - the store field and its setter;
  - `WorkingCopySnapshot` snapshot and apply (`persistWorkingCopy.ts:406,580`);
  - registration in `derivedSurfaceRegistry` as EDITOR-AUTHORED;
  - the draft fixtures.

  There is no `DRAFT_VERSION` bump, because the field is optional and additive.
- **Alternatives**:
  - A separate store with its own envelope field (the `testing` precedent). Rejected: heavier
    than one value needs.
  - A decision. Rejected: FR-062 makes it an export option, not a survey decision (Art IX).

## R28 — Determinism (FR-030)

- **Facts**:
  - `toZip` always injects `NEXT_STEPS.md`, which holds keymanapp/keyboards submission steps and
    is wrong for the LDML package.
  - fflate's `zipSync` stamps entries with the current time unless `mtime` is given.
  - `KeymanXMLWriter` (developer-utils) cannot place comments where FR-042 needs them, and its
    output can change when the dependency is bumped.
- **Decision**:
  - `ToZipOptions` gains `nextSteps?: boolean` (default `true`) and `fixedMtime?: Date`. The LDML
    package passes `false` and `new Date(1980, 0, 1)`. The local-time constructor gives the same
    DOS timestamp in every timezone.
  - The XML is written by `xml/writeKeyboard3.ts`, with fixed element and attribute order, `\n`
    line endings, a two-space indent, and comments placed per FR-042.
  - Ids are derived from content (mapping "Key ids"). Collisions get a numeric suffix assigned
    in sorted order, never traversal order.
  - The report and the comments are built only from English constant strings in the engine.
- **Alternatives**: `KeymanXMLWriter`. Rejected because of the comments, and because a pinned
  dependency should not decide the export's bytes.

## R29 — Findings routing and grouping (FR-015, FR-018)

- **Routing**:
  - Codes go to existing question surfaces where one exists: touch codes to `touch-layout`, key
    codes to `physical-layout`.
  - `lintToQuestion.ts` gains a small `LINT_CODE_TO_STEP_IDS` map for codes whose owner is a step
    with no question chip. Rule codes go to the `rules` step.
  - Codes with no owner (package metadata, ANSI-only, Keyman gap) fall back to the Output page.
    So does a code whose step is absent from the current route.
  - The full table is in [contracts/findings-routing.md](contracts/findings-routing.md).
- **Grouping**:
  - `LintSummary` gains a `groupByCode` mode: one row per code with its count, expanding to every
    finding (FR-018).
  - The step badge counts **distinct LDML codes**, not findings, so hundreds of `OPTION_STATE`
    findings badge as one. Existing codes keep their per-finding counts.
- **Alternatives**: everything on the Output page. Rejected: FR-015 requires step routing for
  warnings and hints alike (clarify session).

## R30 — Profile 49 validation and namespace

- **Decision**:
  - Profile 49 writes `conformsTo="49"` and `xmlns="https://schemas.unicode.org/cldr/49/keyboard3"`.
    The namespace is an identifier only:
    - CLDR's XSD has no `targetNamespace`;
    - the DTD declares `xmlns` as free text;
    - Keyman builds the namespace the same way (`kmc-ldml/src/util/serialize.ts:72-74`).
  - It is validated with **`xmllint-wasm`** (libxml2 compiled to WASM, a pinned devDependency)
    against the vendored CLDR 49 `ldmlKeyboard3.xsd`, plus the R23 TS checker. `xmllint-wasm`
    validates XSD only (its API is `validateXML({ xml, schema })`); CLDR generates the XSD from the
    DTD and ships both. The DTD value-range annotations are checked by R23.
  - Profile 46 is also XSD-checked against the vendored CLDR 46 XSD, so FR-005's "valid TR35
    throughout" is tested for both profiles.
  - `version/@cldrVersion` is never written. The DTD fixes it to its own CLDR release, and Keyman
    accepts only "46".
- **Alternatives**:
  - System `xmllint`. Rejected: it is missing on Windows developer machines.
  - A hand-written schema checker. Rejected: the CLDR schema is the authority.
  - A JS DTD validator. Rejected: none was found that works without a native libxml2.
- **Pinned version (T001, 2026-11-01)**: `xmllint-wasm` **5.3.0**, published 2026-08-05, the
  newest release and more than two weeks old on 2026-11-01 (previous: 5.2.0, 2026-03-24). Pinned
  exactly in `packages/engine/package.json` devDependencies.
- **XSD harness consequences found in T089** (also in R32): CLDR's XSD has no
  `targetNamespace`, so a document that carries the default `xmlns` is rejected by
  `xmllint-wasm` with "No matching global declaration available for the validation root". The XSD
  check (T015) must strip the default `xmlns="…"` attribute from a copy of the document before
  validating. The 46 XSD's `conformsTo` enumeration is 45 and 46, so a file written with
  `conformsTo="49"` validates only against the vendored 49 XSD. A source-text probe of the 49
  XSD also shows `<special>` is typed `any` with `processContents="strict"` (R32).
- The 46 → 49 format delta (R13) has no touch change. Profile 49 is therefore exactly the delta
  file [contracts/ldml-mapping-49.md](contracts/ldml-mapping-49.md).

## R31 — FR-070 trial design (Story 5 gate)

- **Pass criteria** (all required):
  1. `@keymanapp/kmc-ldml` loads lazily through the `kmp.ts` pattern (`_modulePromise`, sticky
     `_down`) and stays out of the entry chunk.
  2. It reuses the kmcmplib WASM the kmc-kmn chunk already ships; the build output has no second
     copy.
  3. The four `import/46/*.xml` files are bundled as assets and served through `loadFile`.
  4. A **real Vite production build** succeeds. `browser-bundle-safety.test.ts` follows neither
     dynamic nor bare imports, so it cannot vouch for this.
  5. A complete profile-46 export, touch forms included, compiles in the built bundle (checked by
     Playwright) with the same message set as CI. This confirms the spec's assumption that Keyman
     ignores the touch half without errors.
  6. The gzip size added to the lazy chunk is recorded in this file.
- **Fail**: Story 5 is withdrawn in the spec and the tasks, and FR-050 stays CI-only (FR-070).
- **Planned after the trial passed (2026-11-01)**: FR-071–FR-076 are in plan.md "Phase 8 amendment"; the Phase 8 row was a
  placeholder.
- **The Keyman schema validator in the browser** (left as a plan decision by the spec's
  assumptions):
  - **Not used for Stories 1–4.** The browser export does not depend on it: correctness is
    proven in CI by H1–H4.
  - **Story 5**: kmc-ldml's `load()` runs `SchemaValidators.ldmlKeyboard3` as part of the
    compile, so the trial exercises it at no extra cost.
  - **Not offered as a separate in-browser check**: that would load common-types' precompiled AJV
    validator for no author-visible gain.

### Trial results (2026-11-01)

Setup: `pnpm --filter @keyboard-studio/studio build` (tsc -b, then vite build; postbuild index step ran), then `vite preview` serving `dist/` on port 5274 through `packages/studio/playwright.trial.config.ts`. No `vite.config.ts` change was needed: `optimizeDeps.exclude` only affects the dev server, kmc-ldml needs no sibling `.wasm` fetch, and the four import files are TypeScript string constants (`LX/compile/ldmlImportAssets.ts`, byte-equality test against the pinned developer-utils), because developer-utils' `exports` map blocks a deep `?raw` import. The in-browser seam is `window.__ksE2E__.compileLdml`, which is live in production builds under `?e2e=1`, so the measured build is the tested build.

- **Chunks the lazy compile adds** (gzip -9; Vite's own figure matches): `main-DANsw5YO.js` (kmc-ldml) 96.6 kB raw, **27.8 kB gzip**; `ldmlImportAssets-C8yEVfyx.js` (the four XML files) 7.3 kB raw, 1.7 kB gzip. Total about **29.5 kB gzip**, fetched only when a compile is requested. Its other dependencies (`index-B3qrmLxr.js` developer-utils/common-types, `kvk-file-writer`, `version.inc`, `main-Bt7_7Ke0.js`) are chunks the kmc-package/kmc-kmn imports already preload. Attribution is from the chunk graph (`__vite__mapDeps` of the kmc-ldml import site); no pre-change baseline build was made to diff against.
- **WASM files in `dist/`**: 1 (`wasm-host-CBnZIFrP.wasm`, the kmcmplib). The browser run requested at most one `.wasm`.
- **Entry chunk** (`index-Bcciy05Z.js`): contains no kmc-ldml marker (`ERROR_SchemaValidationError` count 0; `keys-Latn-implied` count 0). Those strings occur only in `index-B3qrmLxr.js`/`main-DANsw5YO.js` and the assets chunk. The entry holds the loader's own code (`ldml-imports`, the `LdmlCompilerMessages` property name) and a dynamic `import("./main-DANsw5YO.js")`.
- **Browser compile**: `ldml-compile-trial.spec.ts` (2 passed). `chechen_latin` (touch layout, phone/tablet forms written, `formId="touch"` present), profile 46: browser code set `[]` equals H1's `[]`, `ok` true both. A deliberately broken copy gives `["ERROR_InvalidFile","ERROR_InvalidXml"]` in both, so the equal sets are not vacuous. The XML is the same string on both sides (exported once in Node, passed to `page.evaluate`).

### Trial verdict

1. **PASS** lazy load through the `kmp.ts` pattern, out of the entry chunk: `_modulePromise` plus sticky `_down` in `loadLdmlCompiler.ts`; entry has no kmc-ldml marker and reaches it only through a dynamic import.
2. **PASS** no second kmcmplib: exactly one `.wasm` in `dist/`.
3. **PASS** the four `import/46/*.xml` files are bundled and served through `loadFile` (as a lazy string-constant chunk, 1.7 kB gzip), byte-equal to the pinned package (`loadLdmlCompiler.test.ts`); a real `46/keys-Latn-implied.xml` import resolved in the browser compile.
4. **PASS** a real Vite production build succeeds (`vite build`, 0 errors; the existing chunk-size and mixed static/dynamic import warnings are unchanged in kind).
5. **PASS** a complete profile-46 export with touch forms compiles in the built bundle with the same message set as CI (Playwright, served by `vite preview`; the spec asserts the page is not the dev server).
6. **PASS** gzip added by the lazy chunks recorded above: 27.8 kB (kmc-ldml) + 1.7 kB (assets), about 29.5 kB.

**Overall: PASS** on all six criteria. Caveats: the size delta is chunk-graph attribution, not a baseline diff; the trial exercises compile (`init`, `load`, `validate`), not `run`.

## R32 — Decisions taken when merging the owner rulings (2026-11-01)

The `km/108-spec-review` rulings (FR-027–FR-029, FR-080, package id, set mapping, six new rows)
were merged after planning. Their plan consequences:

- **FR-080 reuse, confirmed against the pin where checkable.** `@keymanapp/developer-utils`
  19.0.240-alpha exports `KeymanXMLWriter`, `LDMLKeyboardXMLSourceFileReader` and the
  `LDMLKeyboard` types; `@keymanapp/common-types` 19.0.240-alpha exports
  `SchemaValidators.ldmlKeyboard3`. The remaining R16 entries (`NFDAnalyzer`,
  `MarkerParser.nfd_markers`, `util.isNormalized`, `kmc-generate`'s `ldml-keyboard` template) are
  confirmed, with their browser safety, by task T089 before any code uses them. The reuse and
  exception table is in [plan.md](plan.md#upstream-reuse-fr-080).
- **`<special>` (FR-028) needs no Keyman-gap row.** The pinned
  `ldml-keyboard3.schema.js` lists `special` among `keyboard3`'s properties with the `any`
  definition. The record is written as namespaced children
  (`<special xmlns:ks="https://keyboard-studio.github.io/ns/ldml-export/1">`). T089 also checks that
  the CLDR XSD accepts it; if not, the record goes to the report only and a K row is added, as
  FR-028 says.
- **`KM_LINT_LDML_REORDER_EMULATION` (row 3.25) is not added.** A hint on every
  reordering-by-context rule would fire on most Indic and Southeast Asian keyboards for behaviour
  that does carry over (the transforms are exported as written). Owner: engine team. Trigger: a
  keyboard whose reorder rules misbehave under the H5 harness.
- **Spec 109 dependency.** FR-021 and FR-028 use spec 109's enumerator (its FR-040). If spec 109
  has not landed when T031 starts, T031 builds the enumerator at the location spec 109 names, as
  its own commit, so spec 109 adopts it rather than duplicating it.
- **Profile 49** no longer carries a set-mapping delta (research R13): its deltas are
  `conformsTo`, the namespace and `info/@attribution`.

### T089 results (2026-11-01, run against the pinned `19.0.240-alpha` packages)

Method: the checks below were run, not read off documentation. Probe files were temporary and are
not committed.

1. **`common-types` normalization helpers: exported and browser-safe. Row stays "reuse".**
   - Exports (from `build/src`): `util.NFDAnalyzer`, `util.isNormalized`,
     `LdmlKeyboardTypes.MarkerParser` (with static `nfd_markers`). The spec's wording
     `MarkerParser.nfd_markers` is reached through the `LdmlKeyboardTypes` namespace.
   - The package's only runtime dependencies are `restructure` and two Keyman constant packages.
     A search of its `build/src` JavaScript finds no `node:`, `fs`, `path` or `process` imports.
   - A production Vite build (the studio's own Vite 7.3.5, library mode, browser target) of a probe
     module importing all three symbols succeeded: 66 modules, no "externalized for browser
     compatibility" warning. The helpers also ran under Node.
   - `src/browser-bundle-safety.test.ts` follows relative imports only and never follows bare
     specifiers, so it cannot fail on this package either way (R31, criterion 4). It is green.
     A full studio build is not yet meaningful: nothing in the engine imports `common-types` until
     the first task that does. That task runs the studio Vite build.
   - Outcome: `@keymanapp/common-types` moved from devDependencies to `dependencies` in
     `packages/engine/package.json`.
   - Accessor correction: the Keyman schema validator is
     `SchemaValidators.default.ldmlKeyboard3` (the module has only a default export), not
     `SchemaValidators.ldmlKeyboard3` as written above.
2. **`kmc-generate`'s `ldml-keyboard` template: not adopted. Row becomes "exception".**
   - The generator does not touch the disk itself. It asks `callbacks.loadFile` for each template,
     with the path built from `import.meta.url` and `callbacks.path`. A browser caller could
     supply those callbacks.
   - But the templates are plain files under `build/src/template/ldml-keyboard/` (`keyboard.kpj`,
     `source/keyboard.xml`, `keyboard.kps`, `readme.htm`, `welcome.htm`, `LICENSE.md`, `README.md`,
     `HISTORY.md`). The package `exports` map exposes only `"."`, so they are not importable as
     assets. Using them means copying them out of `node_modules` by path.
   - The package pulls `@keymanapp/langtags` (about 8.4 MB unpacked), `keyman-version` and
     `common-types` into the browser graph, for output the export overwrites (`keyboard.xml`,
     `keyboard.kps`).
   - Outcome: the engine writes the same layout itself (T036, T068), using the template files as
     the reference layout. `kmc-generate` is not added as a dependency.
3. **`<special>` with namespaced children (FR-028): Keyman accepts it, both CLDR XSDs reject it.**
   - Probe document: `<keyboard3>` with one key, one hardware layer and
     `<special xmlns:ks="https://keyboard-studio.github.io/ns/ldml-export/1">` holding
     `<ks:baseKeyboard>` and `<ks:position>`, for `conformsTo` 46 and 49.
   - Pinned `LDMLKeyboardXMLSourceFileReader.load`: loads, no messages, the `special` array is kept
     intact. Row stays reuse.
   - Vendored CLDR 46 XSD and CLDR 49 XSD (via `xmllint-wasm`, default `xmlns` stripped as noted
     in R30): the same document **without** `<special>` is valid; **with** it, both reject it.
     The `special` element is typed `any`, whose wildcard is `processContents="strict"`, so every
     foreign-namespace child needs its own global declaration, and `ks:*` has none.
   - Per FR-028 and T089: mapping row **4.17** (K, hint `KM_LINT_LDML_KEYMAN_GAP`, an existing
     code) is added to [contracts/ldml-mapping.md](contracts/ldml-mapping.md), and the FR-028
     provenance record goes to the report only. The exporter does not write `<special>`. The rows'
     "Keyman gap" wording is loose here: the rejecting validator is CLDR's XSD, and Keyman accepts.
     The alternative that keeps the in-file record is a small extension XSD for the `ks`
     namespace supplied to the XSD harness (T015); it is not adopted without an owner ruling,
     because the file would then no longer validate against CLDR's own schema alone.
   - Knock-on edits left for the owners (not made in T089): the `<special>` lines in
     [contracts/export-package.md](contracts/export-package.md), FR-028 and SC wording in
     [spec.md](spec.md), and the tasks that write or test `<special>`.
