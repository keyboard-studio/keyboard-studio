# LDML 46 vs TR35 49, and what Keyman does with each

**Visual version**: [ldml-version-gap.html](ldml-version-gap.html) (same content, rendered).
**Spec**: [specs/108-ldml-export](../../specs/108-ldml-export/spec.md) — research R13, R14, R15.
**Evidence as of 2026-11-01**:

- TR35 Part 7 Keyboards, CLDR 49 (`tr35-79`, 2026-10-21).
- CLDR `keyboards/dtd/ldmlKeyboard3.dtd` at `release-46` and at `main`.
- CLDR 47/48/49 release notes.
- `keymanapp/keyman` `origin/master` `cbc752f` (2026-10-29, 20.0.10-alpha), and the unmerged
  `origin/epic/web-core` `236a6e6`.

## In short

| Finding | Detail |
|---|---|
| **0 touch changes** in the schema | Every touch element and attribute is identical in the 46 and 49 DTDs. |
| **Keyman fails** on any 47+ feature | A schema error stops the build and no `.kmx` is written. Nothing is skipped or ignored. |
| **The touch half is unused** in Keyman | It is compiled into the keyboard file and then nothing runs it. Mobile cannot load LDML at all yet. |

The format barely moved between 46 and 49, and nothing about touch changed. Keyman compiles
LDML into KMX+, a binary block inside a `.kmx`, and its runtimes read only part of that block.
Touch is the big gap, but the gap is in Keyman, not in the LDML version. KMX+ is also where
Keyman plans to close it.

## 1. What changed between 46 and 49

Confirmed by diffing the CLDR DTD at `release-46` against `main` (49), plus the release notes and
the TR35 modification lists.

| CLDR | Change | Kind | Keyman |
|---|---|---|---|
| 46 | Baseline: the keyboard3 format as Keyman 19 and 20-alpha validate it. `conformsTo` 45 or 46. | — | builds |
| 47 | `info/@attribution`: who designed the layout (CLDR-17971) | new optional attribute | **build fails** |
| 47 | `keyboard3/@draft`: approved, contributed, provisional, unconfirmed (CLDR-18324) | new optional attribute | **build fails** |
| 47 | Formal ABNF for transform `from`/`to` (CLDR-16836/18318/18319) | grammar formalised; nothing added | — |
| 48 | A key with no output can still get a keycap via `display/@keyId` | clarification | — |
| 48 | `layer/@modifiers` applies when a hardware layout is used as a touch layout | clarification | — |
| 48 | Normalization of the default backspace transform | clarification | — |
| 49 | `conformsTo` may be 47, 48 or 49 | allowed value | **build fails** |
| 49 | `display`, `layer` and backspace `transform` clarified; test-data links removed. Known issue: `minDeviceWidth` under-specified (CLDR-19754) | clarification | — |

**Unchanged from 46 to 49**:

- `keys`/`key` (width, gap, longPress, multiTap, flickId, layerId, stretch)
- `flicks`
- `forms`/`scanCodes`
- `layers`/`layer`/`row`
- `variables`
- `transforms`/`transformGroup`/`transform`/`reorder`
- `displays`, `import`, `settings` and `locales`

The one fixed value that moves is `version/@cldrVersion` ("46" → "49"). It is optional, so the
export leaves it out.

## 2. Does Keyman fail, or use what it understands?

It fails. Keyman validates the whole file against its CLDR-46 JSON schema before compiling:

- The schema allows `conformsTo` 45 or 46 only.
- It sets `additionalProperties:false` on 30 elements, including `info` and `keyboard3`.
- One violation stops the build, and no `.kmx` or `.kvk` is written. Only the first violation
  is reported.
- The only content Keyman deliberately ignores is `<special>`.

| Part of an LDML keyboard | Keyman mobile (Android, iOS) | Keyman desktop (Windows, macOS, Linux; Core) | Keyman compiler (kmc / kmc-ldml) | Keyman Developer (TIKE) |
|---|---|---|---|---|
| **Hardware half, CLDR 46 syntax** | | | | |
| Keys and hardware layers | can't load | works | works | works |
| Transforms and reorders | can't load | works | works | works |
| Backspace transforms | can't load | works | works | works |
| Markers (KMN deadkeys) | can't load | works | works | works |
| Variables and set mapping | can't load | works | works | works |
| Displays (keycap labels) | can't load | works: on-screen keyboard only, via `.kvk` | works | works |
| info, version, locales | can't load | works; locales compiled, unused | works | works |
| **Touch half, CLDR 46 syntax** | | | | |
| Touch layers (`formId="touch"`) | can't load | compiled, unused | compiled, unused | compiled, unused; no touch view or editor |
| Flicks, long-press, multitap, layer switch, width, gap | can't load | compiled, unused | compiled, unused | compiled, unused |
| **Anything from CLDR 47–49** | | | | |
| `info/@attribution`, `keyboard3/@draft` | build fails | build fails | build fails | build fails |
| `conformsTo` 47, 48 or 49 | build fails | build fails | build fails | build fails |

**Keyman is also stricter than TR35 within 46:**

- A set mapping must be capture group 1 and fill the whole `to` (`$[1:set]`). TR35 allows
  `$[2:set]` to `$[9:set]`. Keyman fails the build; the upstream fix, draft PR #16870, is
  unmerged.
- Only one set mapping is allowed per transform. Lifting this needs binary-format, core and
  compiler changes, pencilled in for v20.
- One loose end: `<import path="47/…">` is accepted and treated as 46, while `conformsTo="47"`
  is rejected.

## 3. Where KMX+ fits

KMX+ is the binary form Keyman compiles an LDML keyboard into
(`docs/file-formats/kmx-plus-file-format.md` in the Keyman repo). It is not a separate file
type: it is a block inside an ordinary `.kmx`, made of a classic `KXTS` header, the
`KF_KMXPLUS` flag, and the KMX+ block itself (v17, `0x1100`). The studio exports LDML source,
and Keyman's LDML compiler is the only thing that writes KMX+. KMN keyboards still compile to
classic `.kmx`.

**Pipeline**: studio export (LDML `.xml`) → `kmc-ldml` → `.kmx` with KMX+, plus a `.kvk` for
the desktop on-screen keyboard built from the `us` hardware form → Keyman Core. Files with the
KMX+ flag go to Core's LDML processor; KMN `.kmx` files go to the classic processor.

| KMX+ section | Comes from (LDML) | Keyman Core at runtime |
|---|---|---|
| `keys`: key map | `<keys>` placed by hardware `<layers>` | read |
| `tran` | `<transforms type="simple">`, reorders | read |
| `bksp` | `<transforms type="backspace">` | read |
| `vars`, `elem`, `uset` | `<variables>`, sets in transforms, markers | read |
| `meta` | `<info>`, `<version>`, `conformsTo`, `<settings>` | the normalization flag only |
| `keys`: gestures | flicks, long-press, multitap on `<key>`, `<flicks>` | validated, unused |
| `layr` | `<layers>`, hardware **and** touch | validated, unused |
| `list` | long-press and multitap key lists | validated, unused |
| `disp` | `<displays>` keycaps | validated, unused; keycaps reach the desktop on-screen keyboard through the `.kvk` |
| `loca` | `locale`, `<locales>` | validated, unused |
| `sect`, `strs` | table of contents, string pool | structural |

**Two version axes:**

- **CLDR `conformsTo`** is the studio's axis.
  - It lives in the LDML source: 45 or 46 for Keyman today.
  - The compiler checks it against its schema and uses it to pick the CLDR import files.
  - It is copied into KMX+ `meta`; Core only logs it.
  - The studio's version picker sets this.
- **KMX+ file version** is Keyman's axis.
  - v17 (`0x1100`) is what every Keyman compiler writes today.
  - The unmerged web-core branch adds KMX+ v19, with a version on every section, behind a
    compiler option.
  - Core refuses a file newer than it supports, with no fallback.
  - It is independent of `conformsTo`: nothing maps one to the other. The studio never writes
    KMX+, so it does not choose this.

**KMX+ is where Keyman's touch plans converge:**

- **web-core (Keyman 20).** The browser engine, and with it Android and iOS, will load `.kmx`
  files through Core compiled to WASM. That brings the hardware half of LDML keyboards to
  mobile. Reading the touch tables (`layr`, `disp`, key gestures) is still a TODO there
  (#15290, #13429, #8093).
- **#12620 (open, Keyman 20).** Keyman plans to convert a KMN keyboard's `.kvks` and
  `.keyman-touch-layout` into LDML and compile them into KMX+ tables inside the `.kmx`, giving
  one file for every platform. That is the same touch-to-LDML conversion the studio's export
  performs, so spec-perfect touch LDML is on Keyman's own roadmap.

## 4. Touch is the big gap, but it is Keyman's gap

The same touch markup is valid in 46 and 49. What is missing is Keyman's ability to run it, at
every stage after compilation:

| Stage | State | Detail |
|---|---|---|
| LDML file | valid in 46 and 49 | Touch forms, flicks, long-press and multitap are fully specified. |
| Keyman compiler | compiles it | Stored in the KMX+ `layr`, `keys` and `list` sections of the `.kmx`. |
| Keyman desktop (Core) | ignores it | Core reads only the KMX+ key map, transforms and variables. `layr` and the gesture data are validated, then never used. |
| KeymanWeb → mobile | rejects the file | The loader throws ".kmx files are not currently supported". Android and iOS run on KeymanWeb, so neither half loads. |
| Keyman Developer | no touch view | The LDML editor is text plus a debugger. "Test in browser" is a stub, and the `.kvk` is built from the `us` hardware form only. |

**Upstream roadmap:**

- `epic/web-core`: Core (WASM) inside KeymanWeb, the route that brings LDML to web and mobile.
  237 commits, not merged.
- #11293: Core integration for Web, milestone 20.0.
- #8093: LDML processor touch support, milestone 20.0.
- #13429: touch keys in `.kmx` for web/touch, milestone 20.0.
- #13424: on-screen keyboard for mobile/desktop, milestone 20.0.

### The "no key input" gap is touch layer state, not text

KMN cannot rewrite text without a keystroke either:

- Context-only groups run only when a keystroke rule hands off to them with `use()`. LDML
  covers that with chained `transformGroup`s.
- `begin NewContext` and `begin PostKeystroke` must use `readonly` groups, which cannot emit
  text.

In the corpus, 50 of 1,036 keyboards use them. All 97 of those groups are `readonly`, and all
of them are used for touch auto-layer switching.

| Behaviour (Keyman casing template) | KMN rule | In the LDML export |
|---|---|---|
| Back to default after one shifted letter | `nomatch > layer('default')` | **carries over**: `layerId="base"` on Shift-layer output keys |
| Caps lock stays on | `if(&layer = 'caps') > context` | **carries over**: no layer switch on caps-layer keys |
| Stay numeric while typing digits | `if(&layer = 'numeric') any(digit) > context` | **carries over**: digit keys stay, others return to base |
| Shift after `. ` `? ` `! ` | `any(sentencePunctuation) ' ' > layer('shift')` | **lost**: an LDML layer switch cannot depend on earlier text |
| Start a new field on Shift | `NewContext` → `nul > layer('shift')` | **lost**: an LDML touch form always starts on `base` |
| Re-check after backspace or a predictive-text pick | `PostKeystroke` re-runs | **lost**: LDML has no hook for these events |

Keyman acknowledges the gap only in passing: on #15286, PostKeystroke is "conceptually
supported by the KmxKeyboardProcessor … but not LdmlKeyboardProcessor". No Keyman or CLDR
GitHub issue asks for an LDML equivalent; CLDR's Jira was not searched.

## 5. What this means for the studio's version picker

The two export profiles differ in three tokens of output. The touch half is spec-perfect and
identical in both, so a 46 export loses nothing on touch.

**Profile 46** is the default, and Keyman compiles it.

```xml
<keyboard3 xmlns="https://schemas.unicode.org/cldr/46/keyboard3"
           locale="ibn" conformsTo="46">
  <info name="Ibọnọ Chwerty" author="…"/>
  <!-- attribution: carried in this comment
       and in the .kps -->
```

- Builds in Keyman 19 and 20-alpha today.
- Desktop runs the hardware half. The touch half compiles and waits for Keyman 20.
- Attribution travels in the header comment and the package.

**Profile 49** is TR35-only and awaits Keyman.

```xml
<keyboard3 xmlns="…/cldr/49/keyboard3"
           locale="ibn" conformsTo="49">
  <info name="Ibọnọ Chwerty" author="…"
        attribution="…"/>
```

- The newest valid CLDR output, for other LDML implementations and for the future.
- Every Keyman tool fails to build it until Keyman ships a 47+ schema.
- May also use `$[N:set]` mappings, which make transforms smaller.

**Recommendation**:

- **Keep 46 as the default.** Because the touch half is identical, the goal of spec-perfect
  touch, ready for Keyman's pipeline, is already met by profile 46.
- **Profile 49 trades Keyman support for little.** It only adds attribution metadata and
  smaller transforms, and Keyman refuses the file.
- **The version profiles stay useful.** The next CLDR version may change more than this one
  did.
- **KMX+ stays Keyman's concern.** The studio exports LDML, not KMX+. For a build check, the
  studio could probably run Keyman's LDML compiler in the browser, which has no file-system
  dependencies, if it bundles the compiler's WASM and the CLDR import files. That is untested.

## Caveats

- The Keyman 19 beta branch was not diffed separately. Master still carries the "for version
  19" loader guard.
- The CLDR 47 TR35 modification page was unavailable, so the 47 items come from the release
  note and the DTD diff.
- The Keyman error text is reconstructed from its message template, not observed in a run.
