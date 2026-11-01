# Contract: KeyboardIR → LDML keyboard3 mapping — profile `46`

**Spec**: [../spec.md](../spec.md) · **Evidence**: [../research.md](../research.md)

| Profile field | Value |
|---|---|
| Profile id / `conformsTo` | `46` |
| Namespace | `https://schemas.unicode.org/cldr/46/keyboard3` |
| TR35 revision written against | CLDR 49, `tr35-79` (2026-10-21) |
| Keyman release defining the hardware subset | Keyman 19, as pinned in CI: `@keymanapp/kmc-ldml@19.0.240-alpha` and `@keymanapp/common-types@19.0.240-alpha` (research R16). `origin/master` `cbc752f67b` (20.0.10-alpha) is evidence only |
| Status | Default profile |
| Amended | 2026-11-01 in `/speckit-plan`: rows 1.8, 3.17, 3.18, 3.22, 5.1, 5.2, 5.13, 6.1; new row 4.15; gap-key rule (research R17–R21) |

This file is the **first target profile** (spec FR-060). A later LDML version gets its own
profile, written as deltas from this one (FR-061). See "Version deltas" at the end. Research
R1 explains why the first profile is 46 and not 49.

This is the classification every exporter decision and every compatibility finding derives
from. One classifier produces it; the exporter, the authoring-time warnings, and the export
report all read the **same** classification, so the three can never disagree (FR-012).

## Status vocabulary

| Status | Meaning | Finding severity |
|---|---|---|
| **M** — Mapped | Exported with equivalent behaviour. | none |
| **A** — Approximated | Exported, but behaviour differs in the stated way. | **warning** for rules, hint otherwise |
| **N** — Not transferable | Not exported; no LDML equivalent. Recorded in the report. | **warning** for rules, hint otherwise |
| **K** — Keyman gap | Valid TR35, but Keyman 19 rejects it, so the exporter writes the conservative form (or omits it). | hint |

"Rule" means anything in a KMN group. Header stores, touch presentation, and package metadata
are not rules: their losses are **hints**, listed in the report, never warnings (spec FR-010).

Every A/N/K row names its finding code. Codes are the `KM_LINT_LDML_*` family (FR-011).

---

## 1. Keyboard structure

| # | IR construct | LDML | Status | Code | Notes |
|---|---|---|---|---|---|
| 1.1 | `IRHeader.entryPoints.main` (`begin Unicode > use(g)`) | the key map + `<transforms type="simple">` | M | — | The entry group is the keystroke group. |
| 1.2 | `begin ANSI` with no `begin Unicode` | — | N | `KM_LINT_LDML_ANSI_ONLY` | Export refused; see spec Edge Cases. |
| 1.3 | `begin NewContext` group | — | N | `KM_LINT_LDML_NO_KEY_TRIGGER` | Fires on focus or caret change. KMN requires the group to be `readonly`, so it **cannot change text**; it only selects the touch layer, e.g. starting on `shift`. LDML has no context-driven layer selection, only `key/@layerId`. The loss is **touch layer behaviour, never text** (research R15). |
| 1.4 | `begin PostKeystroke` group | — | N | `KM_LINT_LDML_NO_KEY_TRIGGER` | Fires after every keystroke and after predictive-text input. Also `readonly`. Used for start-of-sentence shift, return to the default layer, and staying on the numeric layer. The loss is **touch layer behaviour**. These groups never run on Windows, macOS or Linux, so the hardware half loses nothing. |
| 1.4a | `PostKeystroke` layer rules whose result depends only on **the current layer and the key just pressed**: the casing template's "caps stays caps" (`if(&layer = 'caps') > context`), "return to default" (`nomatch > layer('default')` when no start-of-sentence rule fires), and "numeric stays numeric after a digit" (`if(&layer = 'numeric') any(digit) > context`, where the digit is that key's own output) | `key/@layerId` on each touch key: the key outputs, then switches (TR35 `key/@layerId`). Keys that keep the layer get no `layerId` | M | — | The exporter evaluates the group statically for every (touch layer, output key) pair (spec FR-026). Edge: backspace re-evaluates against older text; it keeps the layer (row 1.4b). |
| 1.4b | `PostKeystroke` / `NewContext` layer rules that depend on **earlier text**: shift after sentence punctuation plus space (`any(sentencePunctuation) ' ' > layer('shift')`), shift at the start of a field (`nul > layer('shift')`), and re-evaluation after backspace or a predictive-text pick | — | N | `KM_LINT_LDML_NO_KEY_TRIGGER` | `key/@layerId` is unconditional, and a touch form always starts on `base`. The message names the lost behaviour, e.g. "start-of-sentence auto-shift". |
| 1.5 | context-only group reached by `use()` on **every** keystroke path of the calling group (rules, `nomatch`, implicit default) | a later `<transformGroup>` | M | — | LDML runs every group, in order, after each key that outputs. A group reached on every path is equivalent. |
| 1.6 | context-only group reached by `use()` on **some** paths only | a later `<transformGroup>` | A | `KM_LINT_LDML_GROUP_CHAIN_PARTIAL` | LDML runs it after every key that outputs, including the keys that never reached it in KMN. |
| 1.7 | a keystroke group (`using keys`) reached by `use()` from another keystroke group | merged into the key map, in call order | A | `KM_LINT_LDML_GROUP_CHAIN_PARTIAL` | LDML has one key map; layered keystroke dispatch flattens. |
| 1.8 | `match` rule whose output is only `use(g)` | a call-graph edge (rows 1.5/1.6) | M/A | as 1.5/1.6 | The IR keeps a `match`/`nomatch` right-hand side as one `raw` element. The classifier recognises `use(g)` from that element's text; anything else is row 1.9. |
| 1.9 | `match` / `nomatch` rule with literal output | — | N | `KM_LINT_LDML_MATCH_NOMATCH_OUTPUT` | No "after any match" or "no rule matched" hook. |
| 1.10 | `readonly` group | — | N | `KM_LINT_LDML_NO_KEY_TRIGGER` | Readonly groups exist to inspect context without a keystroke. |
| 1.11 | group unreachable from the entry group | — | — | hint `KM_LINT_LDML_UNREACHABLE` | Dead in KMN too; listed, not exported. |
| 1.12 | `call()` | — | N | `KM_LINT_LDML_CALL` | |
| 1.13 | `IRRule.targetSelector` `$keymanonly:` / `$keymanweb:` | resolved per form (desktop → hardware, web → touch) | A | `KM_LINT_LDML_PLATFORM_CONDITION` | LDML transforms are shared by all forms (row 4.6). |

## 2. Keys, positions, layers (hardware)

| # | IR construct | LDML | Status | Code | Notes |
|---|---|---|---|---|---|
| 2.1 | `vkey` keystroke on a main-block key (`K_A`…`K_SLASH`, `K_SPACE`, digits, punctuation) | a `<key>` placed in `<layers formId="us|iso">` rows by scan code | M | — | Position table: research R6. |
| 2.2 | `K_oE2` (ISO 102nd key) | form `iso` | M | — | Form choice: `iso` when any ISO-only key is used or the base keyboard is ISO-family, else `us` (FR-020). |
| 2.3 | `K_oC1` (ABNT2), `K_oE0`/`K_oE1` (JIS) | form `abnt2` / `jis` | M | — | Only one hardware form per file (TR35; Keyman `ERROR_ExcessHardware`). |
| 2.4 | a key not on the chosen form (mixed ISO + JIS keys, etc.) | — | N | `KM_LINT_LDML_FORM_KEY_MISSING` | |
| 2.5 | frame keys: `K_F1`…`K_F24`, numpad `K_NP*`, arrows, `K_HOME`/`K_END`/`K_PGUP`/`K_PGDN`, `K_INS`, `K_DEL`, `K_ENTER`, `K_TAB`, `K_ESC` | — | N | `KM_LINT_LDML_FRAME_KEY` | TR35 non-goal: frame keys are not part of the layout. |
| 2.6 | character keystroke `+ 'a'` on a positional keyboard | the key that types `a` on the US layout | M | — | Same rule kmcmplib uses (`VKToChar`, US layout). |
| 2.7 | character keystroke on a **mnemonic** keyboard (`&MNEMONICLAYOUT '1'`) | resolved to a position through the export's one **base keyboard** (spec FR-027) | A | `KM_LINT_LDML_MNEMONIC` | LDML is positional only. Exported layout matches the mnemonic keyboard **only** for users whose base keyboard is the one resolved against. Prior art refused these outright (research R7). |
| 2.8 | **key with no rule** (KMN falls through to the base keyboard) | an **explicit** `<key output="…">` with the base keyboard's character for that position and layer | M | — | LDML does not fall through: an undefined key outputs nothing. The exporter must fill every main-block position (FR-021), from the export's one base keyboard (FR-027). A suppressed position (rows 3.15a, 3.16) overrides the fill. Provenance is recorded per FR-028. |
| 2.9 | modifier `SHIFT` | `shift` | M | — | |
| 2.10 | `LALT` / `RALT` / `ALT` | `altL` / `altR` / `alt` | M | — | Prior art collapsed all three to `altR` — do not. |
| 2.11 | `LCTRL` / `RCTRL` / `CTRL` | `ctrlL` / `ctrlR` / `ctrl` | M | — | |
| 2.12 | `RSHIFT` (side-specific shift) | `shift` | A | `KM_LINT_LDML_SHIFT_SIDE` | LDML `shift` is either shift. |
| 2.13 | `CAPS` / `NCAPS` | layer with / without `caps` | M | — | |
| 2.14 | rule with **no** caps flag | emitted into **both** the `X` and `X caps` layers | M | — | LDML layers match modifiers exactly; `none` requires caps up. `&CASEDKEYS` and the base keyboard decide which keys caps-shift (kmcmplib `ExpandCapsRulesForGroup`). |
| 2.15 | `&CAPSALWAYSOFF`, `&CAPSONONLY`, `&SHIFTFREESCAPS` | — | N | `KM_LINT_LDML_CAPS_MODE` | Caps-lock behaviour settings; LDML has no caps-key semantics. |
| 2.16 | base layer | `<layer modifiers="none">` | M | — | Keyman rejects an empty `modifiers` (origin/master, #12423). Hardware layers carry no `id`. |
| 2.17 | modifier combination with no rules and no base-keyboard output (e.g. `ctrl` alone) | no layer | M | — | TR35 says unmatched keystrokes are ignored and produce no output (TR35 (CLDR 49) §layer). Do not describe this as "reaches the application unchanged". |
| 2.18 | `K_BKSP` with context, no modifiers | `<transforms type="backspace">` | M | — | `from` = the context, `to` = the rule output (empty `to` deletes). Simple transforms still run after a backspace transform (TR35 (CLDR 49) §transform). Backspace matching is NFD. The default backspace transform deletes one codepoint plus adjacent markers and needs a real codepoint, so a lone deadkey with no character needs an explicit backspace transform with `from="\m{id}"` and no `to`. |
| 2.19 | `K_BKSP` with modifiers | — | N | `KM_LINT_LDML_FRAME_KEY` | Keyman Core's backspace transforms fire only without modifiers (research R4), not a TR35 rule. |
| 2.20 | `K_SPACE` | implied key `space` | M | — | |
| 2.21 | `T_*` / `U_*` keystrokes in hardware rules | — | N | `KM_LINT_LDML_FRAME_KEY` | Touch-only ids have no hardware position; see 5.x for touch. |
| 2.22 | `NUMLOCK` / `NOTNUMLOCK` / `SCROLL` / `NOTSCROLL` modifier flags | — | N | `KM_LINT_LDML_MODIFIER` | LDML modifier components are only `none`, `alt`, `altL`, `altR`, `caps`, `ctrl`, `ctrlL`, `ctrlR`, `shift`, `other` (TR35 (CLDR 49) §layer). |
| 2.23 | left and right modifiers mixed in one rule (e.g. `LCTRL RALT`, `LALT RCTRL`) | the side-neutral form (`ctrl alt`) when no other rule in the keyboard distinguishes those sides; otherwise not exported | A, else N | `KM_LINT_LDML_MODIFIER_SIDES` | TR35 forbids mixing sides in one modifier value, errors on overlapping layers, and requires implementations to warn when a keyboard mixes `alt` with `altL`/`altR` (TR35 (CLDR 49) §layer). See rows 2.10 and 2.11. |
| 2.24 | `+ [K_BKSP]` rule with an empty context | — | N | `KM_LINT_LDML_BKSP_NO_CONTEXT` | A backspace transform requires `from` (TR35 (CLDR 49) §transform). |
| 2.25 | `any(store)` where the store holds virtual keys, in keystroke position (`+ any(keys) > index(out, n)`) | one `<key>` per store item, with its indexed output | M | — | Transforms have no key-identity construct, so the keystroke side is expanded into keys. Unequal store lengths or unresolvable items are N with code `KM_LINT_LDML_KEY_STORE` (warning). |

**Key ids.** LDML key ids are author-chosen; position comes from rows. The exporter generates
ids deterministically from content, never from time or counters that depend on traversal order:
implied ids (`a`, `A`, `0`, `space`) where the output matches, otherwise a stable id derived
from the output codepoints, the marker, or the layer target. Every id matches
`[A-Za-z0-9][A-Za-z0-9_-]*`. Rows are joined by exactly one space (Keyman splits on a single
space in two places).

## 3. Rules → keys and transforms

KMN fires on **keystroke identity**; LDML fires on **the key's output plus context**. The
exporter bridges the two this way:

1. A keystroke rule with no context and character-only output becomes the key's `output`.
2. A key that has any rule **with** context gets a **trigger**: by default, its no-context
   output (or its base-keyboard character). Transforms match `context + trigger`.
3. When two keys share the same trigger text but have different contextual rules, each gets a
   **trigger marker** `\m{…}` as its output instead. A final transform per marker,
   `\m{marker}` → the key's default output, sits last in its group so no marker is ever left
   in the text. (Prior art's combining-key scheme left markers behind when a key had no
   no-context rule; the catch-all closes that gap.)
4. Transforms within a group are written in **KMN's effective order**, not source order:
   kmcmplib sorts each group by key, then **longest context first**, then source line
   (`Compiler.cpp:701-755`). LDML applies the first match in document order.

| # | IR construct | LDML | Status | Code | Notes |
|---|---|---|---|---|---|
| 3.1 | `char` in context or output | literal; escaping differs by side | M | — | In `from`, regex metacharacters are escaped. In `to`, only `\\`, `\$` and `$$` are escapes (TR35 (CLDR 49) §transform); other punctuation is literal and must not be escaped. Applying NFD to literals is not required, because the implementation normalizes; it is harmless. |
| 3.2 | SMP character, mark (M), control (Cc), format (Cf) or non-space whitespace | `\u{…}` | M | — | TR35 (CLDR 49) §Syntax Considerations asks for these to be escaped. |
| 3.3 | `deadkey` / `namedDeadkey` in output | marker `\m{id}`, emitted before the character it belongs with | M | — | Ids mapped injectively to `[0-9A-Za-z_]{1,32}`. TR35 allows any NMTOKEN as a marker id, so this pattern is a conservative choice. A marker glues to the following character and can move relative to combining marks under NFD (TR35 (CLDR 49) §Markers), so a deadkey placed after a combining mark can drift. |
| 3.4 | `deadkey` in context | `\m{id}` in `from` | M | — | Keyman errors when a matched marker is never output (`ERROR_MissingMarkers`): a deadkey matched but never emitted is dead in KMN too and is dropped (hint `KM_LINT_LDML_UNREACHABLE`). |
| 3.5 | deadkey **plus** characters in one output | key output = characters + marker in order | M | — | Prior art dropped the characters. Emit the marker before the character it belongs with (row 3.3); a marker after a combining mark can drift under NFD. |
| 3.6 | `any(store)` | `$[store]` (`<set>`; `<uset>` only for large single-codepoint ranges never used in a mapping) | M | — | |
| 3.7 | `index(store, n)` — exactly one, its `any()` is the first capture group, equal store lengths | `($[from])` … `to="$[1:to]"` | M | — | Keyman 19 accepts set mapping only as group 1 and only as the whole `to` (research R3). The CLDR 49 grammar allows only `$[1:var]` and requires exactly one capture group with a set variable in `from`. |
| 3.8 | several `index()` in one rule, or a mapping that is not group 1, or `to` that mixes a mapping with other text | cartesian expansion into literal transforms, in **both** profiles | M | — | Faithful up to the expansion cap. The TR35 prose says `$[1:variable]` takes "any numbered capture group from 1 to 9" (CLDR 46.1 and 49), but the CLDR 49 grammar admits only group 1 (research R13). |
| 3.9 | expansion beyond the cap (default 1 000 transforms per rule) | — | N | `KM_LINT_LDML_EXPANSION_LIMIT` | |
| 3.10 | `notany(store)` with single-codepoint items | `[^…]` | M, N for non-NFD items | `KM_LINT_LDML_NEGATED_CLASS` (N rows only) | Only NFD single-codepoint items are allowed. A class containing non-NFD (precomposed) characters must be rejected by tools (TR35 (CLDR 49) §Regex), so those are N. TR35 does not say whether `[^…]` matches markers. |
| 3.11 | `notany(store)` with multi-codepoint items | — | N | `KM_LINT_LDML_NOTANY_MULTI` | No negated-string construct in the regex subset. |
| 3.12 | `context` / `context(n)` in output | capture group(s) + `$n` | M | — | |
| 3.13 | more than 9 capture groups needed | expansion, else — | N | `KM_LINT_LDML_CAPTURE_LIMIT` | TR35 allows `$1`–`$9`. |
| 3.14 | `outs(store)` | inlined literal | M | — | |
| 3.15a | `+ [K_X] > nul` with no context | `<key gap="true"/>` for that position, instead of the base keyboard's character | M | — | TR35 `key` requires at least one of `layerId`, `gap` or `output`; a gap produces nothing. kmc-ldml accepts gap keys. The suppressed position overrides the fill (row 2.8). Spec FR-029: never dropped. Prior art threw these rules away. |
| 3.15b | `nul` output with a context | transform with an empty `to`, ordered ahead of the more general rule (FR-022) | M | — | Spec FR-029: never dropped. |
| 3.16 | `beep` (both forms, as 3.15a and 3.15b) | as rows 3.15a and 3.15b | M | hint `KM_LINT_LDML_BEEP` | Only the audible feedback is lost. A key or transform with an empty output is not used: kmc-ldml rejects it (`Error_KeyMissingToGapOrSwitch`). Spec FR-029. |
| 3.17 | `if(option = 'v')` in the rule's head position (typed in the IR, spec 103) | evaluated against the option store's **default** value; true → condition dropped, false → rule dropped | A | `KM_LINT_LDML_OPTION_STATE` | LDML has no runtime state. The export behaves as the keyboard does with every option at its default. |
| 3.18 | `if(option <> 'v')`, an `if()` after other context, and any rule using `set()`, `save()` or `reset()` | — | N | `KM_LINT_LDML_OPTION_STATE` | The codec keeps these rules whole as `RawKmnFragment`s (reasons `if-option-store`, `option-store-directive`). There is no typed rule to evaluate or export, and Art II forbids re-parsing `sourceText`. The fragment's reason selects this code instead of `KM_LINT_LDML_OPAQUE` (row 6.1), and the finding still names the reason. FR-026 reads a `set(&layer=…)` inside a `PostKeystroke`/`NewContext` group (row 1.4a), so it is not reported here. |
| 3.19 | `platform()` / `if(&platform …)` | evaluated statically: hardware view for the hardware form, touch view for touch forms | A | `KM_LINT_LDML_PLATFORM_CONDITION` | Only when the two views produce **different** transforms; LDML transforms cannot be scoped to a form. Identical views are M. |
| 3.20 | `baselayout()` / `if(&baselayout …)` | evaluated against the export's one base keyboard (spec FR-027), the same one used for row 2.8 | A | `KM_LINT_LDML_BASELAYOUT_CONDITION` | |
| 3.21 | `layer()` / `if(&layer …)` / `&newLayer` / `&oldLayer` in a rule | — (touch layer switching maps through keys, row 5.4) | N | `KM_LINT_LDML_LAYER_STATE` | |
| 3.22 | rules whose behaviour depends on NFC vs NFD (e.g. `é` and `e`+U+0301 in contexts with different outputs) | normalization stays on; the conflated pair is reported | A | `KM_LINT_LDML_NORMALIZATION` | LDML matches in NFD. Normalization stays on per the R9 ruling. |
| 3.23 | a rule output string that differs from its NFC form (deliberately decomposed output; composition-excluded characters such as Devanagari nukta U+0958–U+095F; canonical reordering of combining marks, e.g. Arabic harakat, Hebrew points, Vietnamese) | exported as written; reported per keyboard | A | `KM_LINT_LDML_NORMALIZATION` | Keyman Core's LDML processor converts output to NFC for the application. The KMX processor does not. Under KMN the application gets the exact codepoints; under the export it gets NFC (research R9). |
| 3.24 | `nul` in context (start-of-text anchor) | leading `^` in `from` | A | `KM_LINT_LDML_CONTEXT_START` (hint) | TR35 (CLDR 49) §transform, Additional Features. Implementations may discard the input context at any time, so the anchor can match mid-text. |
| 3.25 | no KMN reorder construct; context rules that reorder (Myanmar, Khmer, Indic) | ordinary transforms; `<reorder>` is never generated | M | — | An optional hint `KM_LINT_LDML_REORDER_EMULATION` for such rules is a plan decision. It is not added here. |
| 3.26 | store item `raw` (e.g. `[SHIFT K_E]` in a store) | expanded when the parser's text is a key literal, else — | M/N | `KM_LINT_LDML_OPAQUE` | |

## 4. Header (system) stores and metadata

| # | IR / project source | LDML | Status | Code |
|---|---|---|---|---|
| 4.1 | `IRHeader.name` / `&NAME` | `<info name>` | M | — |
| 4.2 | author (`attribution.authorName`, `.kps` `<Author>`) | `<info author>` | M | — |
| 4.3 | `&KEYBOARDVERSION` | `<version number>` normalised to `major.minor.patch` (`1.0` → `1.0.0`) | M | — |
| 4.4 | language tags (identity overlay / `.kps` — **not** `IRHeader.bcp47`, which the parser leaves empty) | `keyboard3/@locale` = first tag; `<locales>` = the rest; all minimal | M | — |
| 4.5 | base keyboard family (QWERTY, AZERTY, …) | `<info layout>` | M | — |
| 4.6 | `&TARGETS` | decides which forms are exported (hardware always; touch when targets include mobile/web and a touch layout exists) | M | — |
| 4.7 | `&LAYOUTFILE` (`TouchLayoutIR`) | touch `<layers>` (section 5) | M | — |
| 4.8 | `&VISUALKEYBOARD` (`KvksIR`) labels that differ from output | `<displays>` (`keyId`) | M | — (a label that is a bare nonspacing mark gets U+25CC prepended; `display` never equals the key's `output`; gap keys carry no display: row 5.10) |
| 4.9 | `&COPYRIGHT`, description, licence, home page, `&MESSAGE`, attribution | XML header comment + package files (section 7) | N in LDML, carried in package | hint `KM_LINT_LDML_METADATA_PACKAGE_ONLY` |
| 4.10 | `info/@attribution` | not emitted | K | hint `KM_LINT_LDML_KEYMAN_GAP` — CLDR 47+ attribute; Keyman's v46 schema has `additionalProperties:false` on `info` |
| 4.11 | `&BITMAP` (icon), fonts | package files only | N in LDML | hint `KM_LINT_LDML_METADATA_PACKAGE_ONLY` |
| 4.12 | `&HOTKEY`, `&WINDOWSLANGUAGES`, `&LANGUAGE`, `&ETHNOLOGUECODE` (locale source only), `&DISPLAYMAP`, `&KMW_RTL`, `&KMW_EMBEDJS`, `&KMW_EMBEDCSS`, `&KMW_HELPFILE`, `&KMW_HELPTEXT`, `&INCLUDECODES`, `&VERSION` | — | N | hint `KM_LINT_LDML_HEADER_UNSUPPORTED` |
| 4.13 | `&CASEDKEYS` | drives row 2.14 | M | — |
| 4.14 | `&MNEMONICLAYOUT` | drives row 2.7 | A | `KM_LINT_LDML_MNEMONIC` |
| 4.15 | CLDR imports | none written. Every key the export uses is defined in the file, except implied keys (`a`–`z`, `A`–`Z`, `0`–`9`, `space`, `gap`), which Keyman imports itself. This keeps both profiles' files free of version-specific import paths | M | — |

## 5. Touch layout (`TouchLayoutIR`)

Touch keys trigger the same rules as hardware keys with the same id under the layer's
modifiers, so a touch key's output is resolved through the **same** key-resolution path as
section 3 — never from its label (prior art used labels as outputs).

The touch markup is the same in profiles 46 and 49. CLDR 49 adds one sentence: a hardware
`modifiers="none"` layer becomes the base layer when the keyboard is used as touch (TR35 (CLDR
49) §layers).

`minDeviceWidth` (rows 5.1/5.2) is in millimetres, a whole number from 1 to 999, with no
default (TR35 (CLDR 49) §layers). Every touch form gets an explicit, distinct value. The source
of the value (a fixed phone/tablet pair, or derived from the KMN platform) is a plan decision.

| # | IR construct | LDML | Status | Code |
|---|---|---|---|---|
| 5.1 | `platforms[phone]` | `<layers formId="touch" minDeviceWidth="1">` (constant `PHONE_MIN_DEVICE_WIDTH`) | M | — (TR35: "the `layers` entry with the greatest matching width will be selected", so 1 is the fallback for every device. The pinned Keyman compiler also requires the attribute on every touch form; research R20) |
| 5.2 | `platforms[tablet]` | a second `<layers formId="touch" minDeviceWidth="150">` (constant `TABLET_MIN_DEVICE_WIDTH`, millimetres) | M | — (Prior art discarded the tablet form whenever a phone form existed. 150 keeps landscape phones on the phone form, as KeymanWeb does; research R20) |
| 5.3 | `platforms[desktop]` | — (the hardware form covers desktop) | N | hint `KM_LINT_LDML_TOUCH_PRESENTATION` |
| 5.4 | layer `id` (`default` → `base`), `nextlayer` | `<layer id>`; `key/@layerId` | M | — |
| 5.5 | `sk` (long-press) incl. default | `longPressKeyIds`, `longPressDefaultKeyId` | M | — |
| 5.6 | `flick` (n…sw) | `<flicks>/<flick>/<flickSegment>` | M | — |
| 5.7 | `multitap` | `multiTapKeyIds` | M | — |
| 5.8 | gestures on a key that is itself a gesture target | — | N | hint `KM_LINT_LDML_TOUCH_PRESENTATION` (TR35: implementations ignore them) |
| 5.9 | `width`, `pad` | `width` (÷100); `pad` → a `gap` key | M | — |
| 5.10 | `text` label differing from output | `<display keyId>`. A label that is a bare nonspacing mark is an error: prepend U+25CC (TR35 (CLDR 49) §display). `display` must not equal the key's `output`. Gap keys cannot carry a display. | M | — |
| 5.11 | `font`, `fontsize`, `hint`, `defaultHint`, `displayUnderlying`, touch `dk` | — | N | hint `KM_LINT_LDML_TOUCH_PRESENTATION` |
| 5.12 | `sp` special keys: shift / layer switch | `layerId` keys | M | — |
| 5.13 | `sp` special keys: backspace (`K_BKSP`), enter (`K_ENTER`), tab (`K_TAB`) | a gap key of the same width: `<key id="bksp" gap="true" width="…"/>`, and likewise `enter` and `tab`. Never an `output` of U+0008, U+0009, U+000A or U+000D, which would insert a control character | A | hint `KM_LINT_LDML_TOUCH_SPECIAL_KEY`. TR35 has "no way to indicate that a key has a standardized identity", and CLDR's own sample writes `enter` as a gap. The touch form keeps the row's shape but has no working backspace, enter or tab key, and their labels are lost. Backspace **transforms** (row 2.18) still apply to the platform's backspace. Research R8 (resolved) |
| 5.14 | `T_*` / `U_*` touch key ids | resolved through rules (`+ [T_x]`) or `U_xxxx` → codepoint | M | — |
| 5.15 | any touch form | exported **spec-perfect to TR35** (spec FR-052/FR-053). Keyman compiles it into `layr`/`key2` but nothing runs it: Core ignores it, and KeymanWeb (hence Android/iOS) rejects LDML keyboards entirely (research R13) | K | stated once in the report, not a per-key finding. The touch half follows TR35, never Keyman's current behaviour: the export is preparation for Keyman's touch pipeline |

## 6. Opaque and unparsed content

| # | IR construct | LDML | Status | Code |
|---|---|---|---|---|
| 6.1 | `RawKmnFragment`, any reason in `codec/opaque-reasons.ts` | — | N | `KM_LINT_LDML_OPAQUE` (the message names the reason). The exception is a reason that selects a more specific row: `option-store-directive` and `if-option-store` go to row 3.18, `call-return` to row 1.12. Either way there is exactly one item per fragment |
| 6.2 | `raw` context/output element (incl. `platform()` text, `<>` comparisons, `layer()` output) | classified by its text where a row above covers it, else — | N | `KM_LINT_LDML_OPAQUE` |

Article II: nothing opaque is dropped silently — every fragment produces exactly one finding
and one report row (FR-013).

## 7. Documentation (what the package carries)

LDML itself carries only `info` (name, author, layout, indicator), `version`, and `locales`
(TR35 §info; Keyman schema). XML comments are valid but Keyman's parser discards them. So
documentation travels in two places:

- **Header comment** in `source/<id>.xml`: keyboard name, id, version, description, copyright,
  licence name, author, attribution, home page, studio version, and a one-line pointer to
  `LDML-EXPORT-REPORT.md`. No timestamp (exports are byte-reproducible, FR-030).
- **Structural comments**: one per `<transformGroup>` naming its KMN group, and one per
  transform naming its `source/<id>.kmn` line.
- **Package files** (Keyman's `kmc generate ldml-keyboard` layout): `source/<id>.kps` with
  `<Info>` (name, copyright, author, description, website), `readme.htm`, `welcome.htm`,
  `LICENSE.md`, `README.md`, `HISTORY.md`, languages, and the icon and fonts.

## Code table

| Code | Default severity | Rows |
|---|---|---|
| `KM_LINT_LDML_NO_KEY_TRIGGER` | warning | 1.3, 1.4, 1.10 |
| `KM_LINT_LDML_GROUP_CHAIN_PARTIAL` | warning | 1.6, 1.7, 1.8 |
| `KM_LINT_LDML_MATCH_NOMATCH_OUTPUT` | warning | 1.9 |
| `KM_LINT_LDML_CALL` | warning | 1.12, 6.1 (`call-return`) |
| `KM_LINT_LDML_PLATFORM_CONDITION` | warning | 1.13, 3.19 |
| `KM_LINT_LDML_FORM_KEY_MISSING` | warning | 2.4 |
| `KM_LINT_LDML_FRAME_KEY` | warning | 2.5, 2.19, 2.21 |
| `KM_LINT_LDML_MNEMONIC` | warning | 2.7, 4.14 |
| `KM_LINT_LDML_SHIFT_SIDE` | warning | 2.12 |
| `KM_LINT_LDML_CAPS_MODE` | hint | 2.15 (header stores) |
| `KM_LINT_LDML_EXPANSION_LIMIT` | warning | 3.9 |
| `KM_LINT_LDML_NOTANY_MULTI` | warning | 3.11 |
| `KM_LINT_LDML_CAPTURE_LIMIT` | warning | 3.13 |
| `KM_LINT_LDML_BEEP` | hint | 3.16 |
| `KM_LINT_LDML_CONTEXT_START` | hint | 3.24 |
| `KM_LINT_LDML_MODIFIER` | warning | 2.22 |
| `KM_LINT_LDML_MODIFIER_SIDES` | warning | 2.23 |
| `KM_LINT_LDML_BKSP_NO_CONTEXT` | warning | 2.24 |
| `KM_LINT_LDML_KEY_STORE` | warning | 2.25 |
| `KM_LINT_LDML_NEGATED_CLASS` | warning | 3.10 |
| `KM_LINT_LDML_OPTION_STATE` | warning | 3.17, 3.18, 6.1 (`option-store-directive`, `if-option-store`) |
| `KM_LINT_LDML_BASELAYOUT_CONDITION` | warning | 3.20 |
| `KM_LINT_LDML_LAYER_STATE` | warning | 3.21 |
| `KM_LINT_LDML_NORMALIZATION` | warning | 3.22, 3.23 |
| `KM_LINT_LDML_OPAQUE` | warning | 3.26, 6.1, 6.2 |
| `KM_LINT_LDML_ANSI_ONLY` | warning | 1.2 |
| `KM_LINT_LDML_UNREACHABLE` | hint | 1.11, 3.4 |
| `KM_LINT_LDML_HEADER_UNSUPPORTED` | hint | 4.12 |
| `KM_LINT_LDML_METADATA_PACKAGE_ONLY` | hint | 4.9, 4.11 |
| `KM_LINT_LDML_KEYMAN_GAP` | hint | 4.10 |
| `KM_LINT_LDML_TOUCH_PRESENTATION` | hint | 5.3, 5.8, 5.11 |
| `KM_LINT_LDML_TOUCH_SPECIAL_KEY` | hint | 5.13 |

**Gap keys.** TR35 forbids `output`, `layerId`, `flickId`, `longPressKeyIds`, `longPressDefaultKeyId`,
`multiTapKeyIds` and any `<display>` on a gap key. Keyman's compiler does not check this, so the
exporter's own conformance check does (FR-052; [test-harnesses.md](test-harnesses.md)).

Codes are `KM_LINT_*`, never `KM_WARN_*`: the Output page's "Other findings" panel filters out
`KM_WARN*` codes (`OutputScreen.tsx:147-151`), so a `KM_WARN_LDML_*` family would never reach
the author.

## Version deltas (what would lift each Keyman gap)

FR-063 requires every K row, and every A/N row with a known path to M, to record its lift
condition. These are the known candidates for the next profile:

| Row | Today (profile 46) | Lift condition | Next status |
|---|---|---|---|
| 4.10 `info/@attribution` | K, omitted | a profile whose `conformsTo` is ≥ 47 **and** a Keyman schema that accepts `attribution` | M |
| 3.7/3.8 set mapping not in group 1 | M by expansion, in both profiles (CLDR 49 grammar allows only `$[1:var]`) | Keyman accepts `$[N:var]` (upstream #16868 / PR #16870) **and** TR35 grammar admits N > 1 | M without expansion (smaller output) |
| 3.8 several mappings in one `to` | M by expansion; N past the cap (3.9) | Keyman supports several maps per transform (#16868, "v20?") | M without expansion; 3.9 shrinks |
| 5.13 touch backspace/enter/tab | A (gap placeholders) | TR35 gains a standardized key identity | M |
| 3.18 `if(option <> 'v')`, non-head `if()` | N (opaque in the IR) | spec 103 types these conditions | A, as row 3.17 |
| 5.15 touch forms in Keyman | K (pipeline not ready) | Keyman ships the LDML touch pipeline | M, and the report's delivery note is removed |
| `conformsTo` enum | 45, 46 | Keyman ships a 47+ standards-data set | a new default profile |

A new profile file states its id, namespace, TR35 revision and Keyman release, followed by
only the rows that differ from this profile.

**At launch** (spec FR-066), profile `49` ships beside this one, marked "TR35-only (awaiting
Keyman)". Its deltas are:

- `conformsTo="49"` and the 49 namespace;
- row 4.10 → M (`info/@attribution`).

Rows 3.7/3.8 expand in both profiles (see the set-mapping facts in research R13). The 46 → 49
format delta has no touch schema changes (research R13), so the touch markup in section 5 is
the same in both profiles. One CLDR 49 sentence applies to touch use: a hardware
`modifiers="none"` layer becomes the base layer when the keyboard is used as touch (TR35 (CLDR
49) §layers). The author picks between the two on the Output page (FR-062). The profile's file is
`contracts/ldml-mapping-49.md`, written in planning.
