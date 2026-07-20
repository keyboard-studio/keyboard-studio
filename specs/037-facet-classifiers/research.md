# Phase 0 Research: Deterministic Facet Classifiers

037 owns the **classifier algorithms**; [spec 036](../036-keyboard-facet-index/spec.md) owns the record
shape, freshness, and artifact those classifiers populate. This file resolves every classifier-specific
unknown, each grounded in the real `lib/ucd/` files and current engine source. Research was gathered
read-only by the KM crew (km-domain — script; km-keyman — engine analysis surface; km-strategy — strategy
fingerprint), citing file:line where a claim was verified.

Because 036 already resolved *where the tool lives*, *how reference data is pinned*, *where the artifact
lands*, and *the record shape* (036 research D1–D8, data-model.md), this file does **not** re-derive those.
It cites them and drills into the three algorithms and the corrections that surfaced when 036's D5
"analysis surface" was verified against code at planning depth.

---

## D1 — Inherited from spec 036 (not re-litigated here)

037 adopts these 036 decisions verbatim; they are settled and the classifiers must conform:

| Concern | 036 decision | Cite |
|---|---|---|
| Tool location/shape | standalone `utilities/facet-index/`, `tsx`, imports engine source directly, out of `pnpm -r` | 036 D1 |
| UCD pinning | Unicode 17.0.0, `scripts/ucd-version.json` + `data/SOURCES.json`, sourced from `lib/ucd/`, slim `codegen-ucd.mjs` lookup | 036 D2 |
| Record shape | `keyboards[<id>].facets[<facetId>]` with `value` / `distribution` / `confidence` / `confidenceClass` / `provenanceTier` / `evidenceSize` / `analyzedCoverage` / `analysisOutcome` | 036 data-model Entity 2 |
| Facet definitions | content-owned YAML `content/keyboard-facets/<id>.yaml` | 036 D3 |
| Determinism recipe | sort keyboards / facet keys / distribution keys; stable JSON writer; no timestamps in hashed payload | 036 research "Cross-cutting" |

The three 037 classifiers are the `derivation.classifierId` values those definitions name. 037 ships the
`script`, `strategy-fingerprint`, and `target-mix` definitions **and** their algorithms.

---

## D2 — Script classifier: per-character evidence and the four pinned UCD files

**Decision**: Classify from the produced-character set (`buildProducedSet(ir)` → `Set<string>` of NFC
Unicode scalars, membership only), mapping each scalar to script via the pinned UCD slim lookup, using
exactly the four files 036 D2 selected. Confirmed sufficient and correctly formatted:

| File | Role | Verified |
|---|---|---|
| `Scripts.txt` | codepoint → single long-name Script (`Arabic`, `Common`, `Inherited`) | ranges via `..`, `@missing` default `Unknown` (`lib/ucd/Scripts.txt:21-23`) |
| `ScriptExtensions.txt` | codepoint → Script_Extensions **override** set (short codes) | override-only; absence ⇒ `{base Script}` (`lib/ucd/ScriptExtensions.txt:25`) |
| `PropertyValueAliases.txt` | `sc` short↔long, incl. legacy aliases (`Qaac`→Coptic) | `sc ; Arab ; Arabic` … (`PropertyValueAliases.txt:1321-1350`); neutral trio `Zinh`/`Zyyy`/`Zzzz` (`:1494-1496`) |
| `Blocks.txt` | codepoint range → block name (Latin sub-profile only) | `Start..End; Block Name` (`Blocks.txt:15-17`) |

**Common/Inherited exclusion (FR-008)** is mechanically unambiguous: filter any scalar whose `Scripts.txt`
value is `Common`/`Zyyy` or `Inherited`/`Zinh` out of the denominator (shared punctuation, digits,
combining marks). `Common` = `0000..001F` etc.; `Inherited` = `0300..036F`, Arabic marks `064B..0655`, ZWJ
`200C..200D`, variation selectors (`Scripts.txt:27, 1652-1679`).

**Rationale**: `buildProducedSet` is membership-only (`packages/contracts/src/ir/producedSet.ts:210`,
exported at contracts root) — it iterates `for (const ch of normalized)` over an NFC string, so each `Set`
entry is exactly one Unicode scalar (astral characters handled correctly, not surrogate halves). This has
a hard consequence for the algorithm (see D3): **there is no rule-occurrence frequency**, so all measures
are over *distinct characters*, never token counts.

---

## D3 — Script_Extensions weighting: full weight, normalize by weighted total (FR-008)

**Decision**: For each qualifying (non-Common/Inherited/Unknown) produced scalar `c`, let `S(c)` = its
`ScriptExtensions.txt` set if present, else `{base Script}`. Add **weight 1.0 to every script in `S(c)`**
(not `1/|S(c)|`). The published distribution is each script's tally ÷ **the sum of all script tallies**
(which may exceed the character count because shared characters are counted into each of their scripts).

**Why full-weight, not fractional**: this is the only *monotonic* scheme — a shared character can only
raise a script's share, never lower a competing script's — which is exactly FR-008's "shared characters
strengthen rather than dilute." Fractional `1/n` (or count-then-renormalize as a strict partition) shrinks
other scripts' shares whenever a character is shared, reintroducing the dilution FR-008 prohibits. Worked
example: `0660..0669` (Arabic-Indic digits) has base `Arabic` but `Script_Extensions = {Arab, Thaa, Yezi}`
(`ScriptExtensions.txt:78`) — under full-weight these digits add to Arab, Thaa, and Yezi without any of
them stealing from the pure-Arabic letter evidence.

**Determinism caveat**: `ScriptExtensions.txt` orders codes alphabetically as documentation only ("ordering
not material"). The `codegen-ucd.mjs` step MUST insert each set in a canonical sorted order (JS `Set`
iteration is insertion order), and the fold MUST sort `S(c)` before accumulating, so FR-001 byte-identity
holds regardless of future data-file reordering.

**Evidence size / coverage** (FR-009): `evidenceSize` = count of distinct qualifying scalars;
`analyzedCoverage` per D6.

---

## D4 — Latin sub-profile: block-derived hints, intersected with Script=Latin (FR-010)

**Decision**: When Latin dominates, emit a `subProfile.latin` hint bucketed from `Blocks.txt` membership,
computed **only over produced scalars whose `Scripts.txt` value is `Latin`** — the sub-profile is a
within-Latin refinement, not a block lookup on its own. This matters because the candidate blocks are
**not** uniformly single-script:

| Bucket | Blocks (range) | Script purity |
|---|---|---|
| plain / basic | Basic Latin `0000..007F`, Latin-1 Supplement `0080..00FF` | fully Latin (plus ASCII punctuation/Common) |
| extended | Latin Extended-A `0100..017F`, -B `0180..024F`, Additional `1E00..1EFF`, -C `2C60..2C7F`, -D `A720..A7FF`, -E `AB30..AB6F`, -F `10780..107BF`, -G `1DF00..1DFFF` | fully Latin |
| IPA orientation | **IPA Extensions `0250..02AF`** (fully Latin) + **Phonetic Extensions `1D00..1D7F`** + **Phonetic Extensions Supplement `1D80..1DBF`** share over a threshold | **mixed-script — see correction below** |

**Correction (supersedes an earlier over-claim in this section)**: IPA Extensions `0250..02AF` is fully
`Script=Latin`. Phonetic Extensions `1D00..1D7F` is **not** — it also contains Greek codepoints
(`1D26..1D2A`, `1D5D..1D61`, `1D66..1D6A`, `Script=Greek`) and Cyrillic codepoints (`1D2B`, `1D78`,
`Script=Cyrillic`) per `lib/ucd/Scripts.txt`. The earlier draft of this decision cited "verified
`Scripts.txt:657, 660`" as evidence that "all three buckets are `Script = Latin`" — that was a cherry-picked
spot-check of two lines, not a survey of the whole block, and it was wrong for Phonetic Extensions. The
fix: because the Latin sub-profile is computed only over scalars the classifier has already confirmed are
`Script=Latin` (the block membership check runs *after* the script filter, not instead of it), the
Greek/Cyrillic members of Phonetic Extensions are automatically excluded from the Latin sub-profile — they
correctly tally to their true script (`Grek`/`Cyrl`) at the tier-1 main distribution instead.

**Known limitation (deferred, not silently handled)**: a phonetic keyboard that legitimately uses those
Greek- or Cyrillic-scripted IPA-adjacent letters (e.g. `ɣ` U+0263 is Latin, but some Phonetic Extensions
letters used in IPA-adjacent transcription are `Grek`/`Cyrl` by Unicode's own script assignment) will
register a minor Greek or Cyrillic share in the main `script` distribution rather than being folded into the
Latin/IPA sub-profile. Such a keyboard may read as slightly "mixed" rather than purely IPA-Latin. This is a
consequence of Unicode's own per-codepoint script assignment, not a classifier defect — it is documented
here rather than special-cased, and flagged as a task line-item for `/speckit-tasks` (candidate follow-up:
an explicit allowlist of IPA-adjacent non-Latin codepoints to fold into the sub-profile with an honesty
note, if this proves to matter on real corpus keyboards).

**Sub-profile evidence floor is separate from the top-level floor.** km-domain flags that 10 concretely-
scripted characters is fine for cross-script discrimination but thin for a *within-Latin* block distinction
— two stray IPA symbols must not flip an otherwise-plain keyboard to "IPA orientation." The IPA-orientation
threshold is evaluated against **Latin-evidence count specifically** (recommend order-of-magnitude 10% of
Latin evidence; the exact number is a tunable classifier default, not a UCD fact). Spacing Modifier Letters
`02B0..02FF` is corroborating-only (holds both IPA suprasegmentals and ordinary modifier letters). These
labels are **hints, not authoritative** (spec Assumptions; confirmed by 038's propose-then-confirm).

---

## D5 — Fallback chain and multi-language resolution (FR-011)

**Decision**: The ordered chain is `content-derived → declared-metadata (script subtags in package
language tags) → default-fallback (language-default script) → undetermined`. Tier 3 is served by
**`getLanguageDefaults(subtag): LanguageDefaults | null`** (`packages/engine/src/langtags/index.ts:25`,
public via the `@keyboard-studio/engine/langtags` subpath), whose `LanguageDefaults.defaultScript?: string`
(`packages/contracts/src/langtags.ts:24-30`) is the ISO 15924 default script per language — a synchronous,
no-I/O lookup, matching the offline requirement (FR-005).

**Multi-language edge case (FR-011 + spec Edge Cases)**: a package may declare several language tags with
different scripts (Serbian Cyrl vs Latn). Tiers 2 and 3 MUST resolve **the set of all declared tags**, not
first-wins, and report a distribution/set when they disagree — never silently pick the first tag. km-domain
flags three contracts types carry `defaultScript`; planning picks the one `getLanguageDefaults` returns.

**Rationale**: langtags gives *default script per language* (coarse fallback tier); UCD gives *per-codepoint*
script (primary content tier) — both required, not either/or (036 D2). The firing tier is recorded in
`provenanceTier` (036 FR-004).

---

## D6 — Analyzed-coverage share is a NEW metric (correction to 036 D5)

**Decision**: 037 defines and computes the `analyzedCoverage` fraction; it does **not** exist today.
Verified: `KeyboardIR.raw: RawKmnFragment[]` (`packages/contracts/src/keyboard-ir.ts:370`), each fragment
optionally carries `producedOutput?: OutputElement[]` (`:295`), present when the codec could sketch output
from an opaque construct. The typed-rule population is `ir.groups.flatMap(g => g.rules)`.

`analyzedCoverage` = `1 − opaqueShare`. Recommend a **rule-node-based** measure for consistency with the
recognizer's own `totalRules` denominator (D7):

```
opaqueShare      = ir.raw.length / (ir.groups.flatMap(g => g.rules).length + ir.raw.length)
analyzedCoverage = 1 − opaqueShare
```

**Caveat to record**: `buildProducedSet` *already folds in* `ir.raw[].producedOutput`
(`producedSet.ts:231-235`), so a character-count coverage and a rule-count coverage diverge for
output-heavy opaque fragments. Planning picks one and states it; the rule-count measure is recommended
because it aligns with `recognizedRatio` and the minimum-coverage floor (spec Assumptions: <50% coverage ⇒
fall back a tier). `parse()`'s `opaqueFeatures: Array<{feature,count}>` is a *by-reason breakdown*, not a
fraction — do not conflate.

---

## D7 — Strategy fingerprint: prevalence measure and residue (FR-012/FR-013)

**Decision** (adopts 036 D5's formula, made exact): the fingerprint is derived from
`ir.recognizedPatterns[]` (typed `Pattern[]`, `keyboard-ir.ts:374`), each carrying `strategyId?: StrategyId`
and `ownedNodes: IRNodeRef[]`. Per strategy:

```
strategyRuleCount(S) = Σ over patterns p where p.strategyId === S of
                         p.ownedNodes.filter(n => n.kind === 'rule').length
distribution[S]      = strategyRuleCount(S) / totalRules
residue              = 1 − recognizedRatio
```

where `totalRules = Σ ir.groups[].rules.length` — the **same denominator** `recognizePatterns` divides by
(`recognizer/index.ts:29,57`). This makes `Σ distribution[S] = recognizedRatio` by construction, so adding
`residue` closes the sum to exactly 1 with **no second division**. Denominator is *share of all rules*, not
*share of recognized rules* — the latter would double-count against residue.

- **`residue` is a distinct field**, not a synthetic key inside `distribution` — keeps the `distribution`
  keyspace closed to the real `StrategyId` union so a fake `"unrecognized"` key can never validate against
  the facet definition's `limits` (036 D7).
- **Stability (FR-013)**: `recognizePatterns` reads only the parsed IR (`recognizer/index.ts:14-62` has no
  raw-text access); comment/whitespace normalization happens upstream in `parseKmn`. Inherited for free.
- **Omit zero-share ids**; state that convention in the record so a reviewer distinguishes "0% because
  absent" from "not computed."

**Recognizer coverage is 2 of 13 (correction).** The `StrategyId` union is **S-01..S-13** (13 values,
`packages/contracts/src/strategy.ts:3-16`; S-13 "Touch layer switch" added post-spec) — but only **S-01**
and **S-02** have recognizers today (`recognizer/index.ts:7-12`; the four `DEFAULT_RULES` collapse to
S-01/S-02 via hand-coded + generated pairs). S-03..S-13 have no recognizer, so most real keyboards show a
residue-dominated fingerprint. This is exactly the spec's Assumption ("recognizer's current coverage is
sufficient for v1; unrecognized strategies land in residue honestly"). **The record/docs MUST state
"recognizer covers S-01/S-02 as of classifier version X"** so a 90% residue on an S-05 keyboard is read as
"recognizer gap," not "mostly opaque parse failure" — these are different and `recognizedRatio` conflates
them (flag to km-strategy/km-doc; see D9).

**Fallback chain is legitimately shorter** than script's: content-derived → undetermined/fallback-only.
There is no metadata tier for "what strategies do the rules use." FR-002 should record this narrower chain
rather than imply parity with script's three tiers.

---

## D8 — Target/device-mix: declared ∪ artifact, with mismatch flag (FR-014)

**Decision**: The classifier fuses two evidence sources — new code, no existing scanner does this:

1. **Declared (package)**: `parseKps(xml): KpsMetadata` (`packages/engine/src/base-browser/kps-parser.ts:97`,
   reached by deep relative import per 036 D1). `<Targets>` is space-separated, filtered against
   `VALID_TARGETS = {windows, macosx, linux, web, mobile, tablet}`, and **defaults to `["windows"]`** when
   absent (`kps-parser.ts:132`) — this default is what FR-014 AC2 cites as "default target semantics …
   value was defaulted, not declared."
2. **Declared (`.kmn`)**: `IRHeader.targets: string[]` from the `&TARGETS` system store
   (`codec/parse.ts:976`). **Correction/caveat**: this path does NO enum validation and the common real
   value is the sentinel `'any'` (`parse.test.ts:8,102,…`), which is *not* a `KeymanPlatformTarget`. The
   classifier MUST special-case `'any'` → unrestricted/all-platforms rather than treat it as a literal
   platform. Treat `.kps` (validated) and `.kmn &TARGETS` (raw) as two different-fidelity signals.
3. **Artifact (touch)**: presence of a `.keyman-touch-layout` sibling, discovered via the `LAYOUTFILE`
   header store (`parseKmnHeaderStores(kmnText)` → `KmnHeaderStore[]`,
   `packages/engine/src/compiler/parseKmnHeaderStores.ts:47`; the 8 canonical sibling stores in
   `siblingAssetStores.ts:83-91`). **Artifact presence outranks declaration** (FR-014 AC1): a touch layout
   present ⇒ touch supported even if `<Targets>` omits it; the declaration/artifact mismatch is recorded in
   `notes`.

**Rationale**: matches FR-014's "report the union with per-source provenance, flag mismatches." No fs-based
loader exists (`fetchKeyboardSourceToVfs` is HTTP/VFS) — the tool reads siblings with `fs` itself, joining
the `LAYOUTFILE` store value relative to the keyboard's `source/` dir.

---

## D9 — Analysis-outcome model is a deliberate 3-state subset (correction to 036 D5)

**Decision**: `analysisOutcome ∈ {fully, partially, fallback-only}` maps from `ImportStatus`
(`packages/contracts/src/keyboard-ir.ts:378-408`) — but that enum has **4** members, not the 3 that 036 D5
listed:

| `ImportStatus` | `analysisOutcome` |
|---|---|
| `Clean` | `fully` |
| `CleanWithOpaque` | `partially` |
| `ParseFailure` | `fallback-only` |
| **`RoundTripDivergence`** | **unreachable — see below** |

`RoundTripDivergence` (the I2 round-trip check) is unreachable **not** because the offline tool skips the
`kmcmplib` WASM oracle, but because `checkRoundTrip` itself
(`packages/engine/src/validator/layer-a-prime.ts:224-260`) is a **deferred stub**: it requires the Keyman
Core keystroke runtime, which is not yet integrated in this build, and the current implementation
explicitly does not set `RoundTripDivergence` today. The pure primitives
(`parseKmn`/`buildProducedSet`/`recognizePatterns`) never call `checkRoundTrip` at all, so the classifiers
can *never observe* `RoundTripDivergence` regardless of the WASM question. **037 states explicitly that its
`analysisOutcome` is a deliberate 3-state subset**, citing the I2 stub as the reason — an assumption, not a
silent omission. (`importKeyboard`/`buildImportReport` also stay unused: both are exported locally from
`codec/import-keyboard.ts` but **not re-exported from the engine root** — see
`packages/engine/src/index.ts` — and `importKeyboard` is `async` and requires a live `VirtualFS`
(`codec/import-keyboard.ts:60,124`), which cuts against the VFS-free tool. Composing the primitives
directly is the right call, confirming 036 D5.)

---

## D10 — Fixtures (FR-006 / SC-004), from the keyboard phonebook

Concrete, real-corpus fixtures per classifier, all in [docs/keyboard-index.md](../../docs/keyboard-index.md):

**Strategy fingerprint** (km-strategy):
| Outcome | Keyboard (id) | Why |
|---|---|---|
| Confident single-strategy (S-01) | Akan (`akan`) | "canonical S-01 exemplar" (`recognizer/rules/generated/simple-swap.ts:76-83`) |
| Deadkey-heavy (S-02) | EuroLatin SIL (`sil_euro_latin`) / French Basic (`basic_kbdfr`) | cited as S-02 corpus evidence (`content/recognizer-rules/s02-deadkey-single-tap.yaml:170-186`) |
| High-residue (unrecognized, S-11 toggle) | Yorùbá 8 (`sil_yoruba8`) | S-11 exemplar (`specs/007-strategy-selection/spec.md:345`); proves residue honesty (FR-012) |

**Script** (km-domain): the SC-001 validation set (≥30 keyboards, ≥6 scripts, ≥3 Arabic-script, ≥3
IPA/extended-Latin, ≥2 dual-script) is content-team work; the fixture *unit tests* need at least one
clear-cut case per outcome — an Arabic-script keyboard (confident `Arab`), a plain-Latin keyboard
(`Latn` plain), an IPA keyboard (`Latn` IPA sub-profile), a dual-script keyboard (mixed), and a
symbols/punctuation-only keyboard (undetermined-from-content → fallback). Concrete ids to be drawn from the
phonebook during `/speckit-tasks`; every cited keyboard added to the phonebook per repo convention.

**Target mix** (km-keyman): a desktop-only keyboard (`<Targets>` absent ⇒ defaulted `windows`), a keyboard
with a `LAYOUTFILE` touch sibling (`longpress_touch` fixture pattern), and a package declaring `web`.

---

## Cross-cutting resolved facts

- **Determinism recipe** (from 036, restated as the classifier obligation): sort script/strategy/target
  distribution keys; canonical-sort `Script_Extensions` sets in codegen and fold; no `Date.now()` in the
  hashed payload; `0/0 → 0` explicitly (matches `recognizer/index.ts:56`).
- **Engine import surface**: `parseKmn`, `buildProducedSet`, `recognizePatterns`, `parseKmnHeaderStores`
  reach via root exports; `parseKps` and the UCD lookup need deep relative import — both fine under 036 D1's
  "import engine source directly" pattern.
- **Spec-text correction applied (doc pass)**: earlier drafts of this research file (and the strategy-
  fingerprint contract) referred to the strategy catalog as "S-01..S-12"; the catalog is now
  **S-01..S-13** (`strategy.ts`, `specs/007-strategy-selection` — S-13 "Touch layer switch" added
  post-spec) and every such reference in the 037 spec/research/contracts has been corrected to S-01..S-13
  in this pass. Note the km-strategy *agent profile* (`.claude/agents/km-strategy.md`) is separately stale
  on this (still says S-01..S-12) — that file is out of scope for this doc pass; flagged for a follow-up.
