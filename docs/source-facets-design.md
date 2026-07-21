# Source (construction) facets — design brief

**Status:** design brief (input to [specs/037-facet-classifiers](../specs/037-facet-classifiers/spec.md)
enrichment + a new deferred transform spec). Not itself a spec. Produced from a
grilling session on 2026-07-16 against [standards.md](../standards.md).

**Audience:** the KM crew and `/speckit-specify`, so the work is executed from a
fixed artifact rather than re-derived from a transcript.

---

## 1. Purpose and scope

`standards.md` catalogs a category of facet the current model only partly covers:
the **internal construction decisions of a keyboard's source** — how the same
behaviour is *spelled*, which input *mechanism* was chosen, the *normalization*
posture, code *structure*, and whether decisions were *followed through*
consistently or not.

We want to (a) **measure** these in candidate base keyboards, (b) **explain the
implications** of a given choice to the user, and eventually (c) **switch** a
base from one choice to another with low friction (e.g. all-longpress -> flicks).

**Agreed scope = C (staged).** Define a **transform-ready model now**, build only
**classification** in the spec-037 era, and defer the **transform engine** to its
own spec. Defining the facets *knowing they must one day be invertible* produces a
sharper schema than defining them for display alone.

## 2. Where source facets fit (three vocabularies)

| Vocabulary | Answers | Home |
|---|---|---|
| Session facets | "who is asking, on what, for whom, where output goes" | [content/facets/](../content/facets/README.md) (6 families) |
| Keyboard-level facets | "what this corpus keyboard **is**" (from its own rules) | [content/keyboard-facets/](../content/keyboard-facets/README.md) |
| Classifiers | how keyboard-facet values are *deterministically derived* | [specs/037-facet-classifiers](../specs/037-facet-classifiers/spec.md) |

**Placement decision:**
- Per-base construction facts are **keyboard-facet definitions** (measured from the
  source, classified by spec-037-style **rule-structure** classifiers).
- They feed a **new session-facet family `source/`** — "computable facts about the
  chosen base's construction," distinct from `orth/` (about the target orthography).
- [lineage.strategy-fingerprint](../content/facets/lineage/strategy-fingerprint.yaml)
  stays the **neighborhood aggregate**; source facets are the fine-grained,
  per-base, per-site layer it aggregates *from*. Same recognizer output, two grains,
  two consumers -- **but only for the KMN-rule-structure mechanisms**
  (deadkey, context-match). It does **not** hold for the touch mechanisms
  (longpress / flick / multitap): those live in the touch-layout JSON, not in
  the `.kmn` rule structure, and are invisible to the KMN strategy recognizer.
  `source.touch-combo-mechanism` therefore needs its own touch-layout scan, not
  a read of the existing recognizer output.

## 3. Transform-impact taxonomy (4 kinds)

The organizing axis is **what a transform of this facet changes** — because that is
exactly the axis along which switching safety, invertibility, and "explain the
implications" differ.

| Class | Examples | A transform... |
|---|---|---|
| **behavior-preserving** | encoding style; rule-vs-store compaction | rewrites source; output and UX identical. Always safe/invertible -- **except** `source.encoding`'s input match-kind axis (key-ref vs char-ref), which is ux/semantic, not behavior-preserving (see §5). |
| **ux-changing** | deadkey / longpress / flick / multitap; modifier+key | changes how the user types; output can stay identical. Often lossy one way. |
| **output-changing** | NFC <-> NFD (+ matching backspace rules) | changes emitted bytes; needs a coordinated multi-rule migration. |
| **gate** | mnemonic-vs-positional | measured, surfaced, filters/warns on base eligibility; **never switched**. |

Gate rationale: mnemonic keyboards only work on Windows, so they are likely
filtered out of source suggestions for the foreseeable future.

## 4. Measurement model

Each source facet records **dominant value + consistency + enumerated exception
sites**, and each exception site carries a **hypothesized cause tag**. Deviation is
not uniform "inconsistency" — the cause changes what we do:

| Cause | Example | Our response |
|---|---|---|
| principled-split | one method for diacritics, another for base chars | preserve it; do not flatten in a transform |
| capacity-forced | ran out of room on rAlt, spilled to another modifier | opportunity; a transform may consolidate |
| gap-omission | forgot to add a char to a longpress/layer | defect; surface it |

**Cause classification = predicate-fit.** Try to explain the exception set with a
small, extensible library of predicates; the cause tag is whichever predicate fits,
and `gap-omission` is the residue when none fit. Deterministic, auditable (show the
user the predicate), honest (confidence from goodness-of-fit).

Starter predicates: **character-class** ("all deviations are combining marks" ->
principled) and **layer-capacity** ("deviations begin exactly after the primary
layer filled" -> capacity-forced). Library is content-team-owned, extensible as
corpus patterns emerge.

The **character-class predicate carries a script-family applicability guard**: it
is scoped to alphabetic-with-diacritics corpora (Latin/Cyrillic/Greek-family) and
is **not applied** to abugida/abjad corpora until script-specific predicates exist
for those families -- applying a diacritic-oriented predicate to a script where
"combining mark" is not the relevant unit would misclassify, not merely
under-classify.

**Index storage:** the committed keyboard-facet index stores the summary; the
exception-site enumeration is **deterministically recomputable** (spec 037's
determinism rule) rather than bloating the index for ~1,000 keyboards. The *model*
definition still names exception sites as first-class.

## 5. Facet inventory

New `source/` session facets (+ the keyboard-facet definitions they derive from).
All start `status: candidate`.

**Behavior-preserving:**

| Facet | Meaning | House target |
|---|---|---|
| `source.encoding` | how the same char/key is spelled, via `input`/`base`/`combining` sub-profiles. **A rule's input can be a key-reference (`[K_E]`) OR a character-reference (`'e'` / `U+0065`)** -- e.g. `'a' + 'e' > 'ae'` matches on the produced character `'e'`, not a keystroke. These are **not interchangeable**: `[K_E]` matches the physical keystroke and is always reachable by pressing the key; `'e'` matches a produced character in the input buffer and may be **unreachable** if no rule produces it. Converting input match-kind (key-ref <-> char-ref) is therefore **semantic, not behavior-preserving** (see §3). Input sub-profile now has a **match-kind axis** `{key-ref, char-ref, mixed}`; within key-ref, a modifier-spelling axis `{bare-vk, named-modifier, split-modifier}`; within char-ref, a spelling axis `{quoted-literal, u-notation}`. base/combining sub-profiles unchanged: `{quoted-literal, u-notation, mixed}`. Only output-side spelling (base/combining) and within-kind input spelling are behavior-preserving; the input match-kind axis must never be auto-normalized. **Deadkeys are not an encoding value** -- deadkey is a `source.desktop-combo-mechanism` value, orthogonal to how the deadkey's own trigger/output characters are spelled. | `[K_M]` for key-ref input (spelling varies), `'m'` / `U+006D` for char-ref input, `'m'` for base, `U+0300` for combining/spacing (conditional -- see policy) |
| `source.rule-store-compaction` | inline rules vs consolidated stores ("lines -> Stores"); values `{inline-rules, consolidated-stores, mixed}` | measure only |
| `source.caps-handling` | how shift/CAPS is represented; values `{per-rule-duplication, any-index-fold, no-caps-rules, mixed}`. **Not-applicable when `source.casing` = `caseless`** (see Gate group). | measure only |

**UX-changing:**

| Facet | Meaning |
|---|---|
| `source.desktop-combo-mechanism` | values `{direct-key, modifier-key, deadkey, context-match, os-compose}` (os-compose = don't; `rota` dropped -- no KMN primitive corresponds to it) |
| `source.touch-combo-mechanism` | values `{key, layer, longpress, flick, multitap}` (`rota` dropped -- no touch-layout primitive corresponds to it) |
| `source.touch-number-row` | whether a 5th row shows on the touch layout, and whether it carries digits or is repurposed for letters; values `{absent, digits, letters, mixed}` |
| `source.touch-symbol-layer` | whether a dedicated symbol layer exists on touch; values `{present, absent}` |
| `source.touch-modifier-layers` | whether touch exposes desktop modifiers (ALT/RALT/CTRL) as their own touch layers -- often a desktop-derivation artifact (cause-taxonomy relevant, §4); values `{none, maps-desktop-modifiers, mixed}` |

**Output-changing / structural:**

| Facet | Meaning |
|---|---|
| `source.normalization-posture` | values `{nfc, nfd, mixed}`. **Scope note:** NFC/NFD is a meaningful axis only for alphabetic families whose canonical decomposition matters at the character level (Latin/Cyrillic/Greek); for abugidas/abjads it is near-vacuous -- the real structural axis for those families is **canonical (visual/logical) ordering**, not NFC/NFD. The classifier marks those corpora "not-applicable" rather than forcing a value. **Backspace-match is a consistency/exception signal, not a value of this facet** -- whether backspace rules were written to match the chosen normalization is recorded as consistency/exception-site data (§4), the follow-through half, layered on top of the `{nfc, nfd, mixed}` value. |
| `source.reordering-rules` | values `{none, group-reorder-swap, inline-swap, mixed}`. **Note:** Keyman has no dedicated `reorder` keyword -- reordering is a *convention* built from `group(...)` with a `use`/match-and-rewrite structure (the `group(reorder)` convention), not a distinct grammar construct, so the classifier is reading a structural pattern, not a keyword. |
| `source.fallback-posture` | how the base handles base-layout fall-through: `relies-on` / `blocks-comprehensively` / `mixed`; **leaked keys are the exception sites**. **Scope:** modality is **physical only** -- touch has no fall-through to model (touch keys are explicit JSON with no base-layout underneath). **Corrected 2026-07-20 (#1170):** the classifier cannot read this from the `.kmn` -- Keyman's `&baselayout` is a conditional-test predicate for branching a rule per detected physical/OS layout (used exactly like `platform()`), not a declared fallback-target store. The fall-through target is whatever OS layout the user actually has active at runtime, which the `.kmn` cannot express, so the classifier assumes a fixed reference layout (e.g. US QWERTY) to model fall-through characters and records this as a modeling assumption, not a defaulted-vs-declared distinction. |

**Gate:**

| Facet | Meaning |
|---|---|
| `source.mnemonic-vs-positional` | mnemonic -> Windows-only -> skip as source; values `{mnemonic, positional, mixed}` |
| `source.casing` | whether the target script has case at all; values `{cased, caseless, mixed}`. Caseless scripts (Arabic, Devanagari) make `source.caps-handling` **not-applicable** -- gates that measure-only facet's classifier, it does not filter the base itself. |

**Required new input facet:**

| Facet | Meaning |
|---|---|
| `orth.display-difficulty` | does the script render in common system fonts/editors; values `{well-supported, partially-supported, poorly-supported}`. **Derivation:** primary signal is the Unicode block's first-assigned version (older blocks = broader font support); overridden to `poorly-supported` when PUA usage is observed in the corpus for that script/range. Font-coverage databases are deferred (open item, §10). Feeds `source.encoding`'s house-target policy (poor rendering pushes toward `U+`-predominant spelling). |

**Excluded from the inventory:** `Comments` (real legibility signal, but no consumer
yet -- revisit if it earns one); `Walk` and `Keyman Team` sections (studio
workflow/deliverable notes, not base measurements).

## 6. Transform-ready schema fields

Added to the keyboard-facet / `source/` record shape (content-team data, **not** a
locked `packages/contracts` type until it survives an evaluation round):

| Field | Purpose |
|---|---|
| `transformImpactClass` | behavior-preserving / ux-changing / output-changing / gate |
| `houseTargetPolicy` | **decision-table**, not a scalar: `inputs -> target`. Starter inputs `script`, `display-difficulty`. Authored self-contained per facet; resolved through one shared resolver (shared inputs like `script` computed once). **Modeled on** the spec §7.2 ordered-decision-table *pattern* (ordered rows, first-match-wins) -- **not** a literal reuse of the (locked) §7.2 tree itself or its `StrategyRecommendation` / `PrimaryRuleNumber` types, which are the Pattern-schema strategy-selection contract and out of scope for this model to touch. Renders as a section-3c proposal with a provenance chip. Null for gates / measure-only. |
| `exceptionSites[]` | enumerated deviations; each carries its predicate-fit cause tag |
| `causePredicates[]` | the predicate library this facet uses |
| `implications` | human-readable "what changes if you switch this" -- feeds the section-3c propose-then-confirm UI |
| `invertibility` | coarse hint: lossless / lossy / one-way. The precise per-pair transition matrix + migration rules live in the deferred transform spec (split-C). |

House target is **conditional**: e.g. fall-through is fine on a Latin keyboard but a
hazard on an otherwise non-Latin one; a hard-to-display script pushes encoding
toward `U+` values. Hence a policy, not a constant.

## 7. Spec 037 findings (independent of the transform work)

1. **Fall-through must be modeled in produced-characters (US1).** In Keyman,
   unmapped keys fall through to whatever physical/OS layout the user actually
   has active at runtime and keep producing that layout's characters. This is
   **not** named or declared anywhere in the `.kmn` -- Keyman's `&baselayout`
   store is a conditional-test predicate (used exactly like `platform()`) for
   branching a rule per detected physical/OS layout, not a declared
   fallback-target store, and it says nothing about where an unhandled key's
   output comes from (corrected 2026-07-20, #1170; supersedes the earlier
   "reads `&baselayout`" framing). Because the analysis cannot know the real
   active OS layout, it must assume a fixed reference layout (e.g. US QWERTY)
   to model fall-through characters, recorded as a modeling assumption.
   "The characters the keyboard produces" therefore is **not** just what its
   rules emit -- it includes every un-blocked base-layout character under
   that assumed reference layout, and this is desktop-only (touch keys are
   explicit JSON with no base-layout underneath). A non-Latin keyboard that
   forgot to block a key (`[K_W] > nul`) technically produces a stray
   base-layout character (e.g. Latin `W`) under the assumed reference layout.
   The script classifier must account for fall-through or it will mis-score
   exactly the keyboards that failed to block it.
2. **Construction classifiers are further rule-structure classifiers** following the
   standard 037 already sets -- no new *classifier* spec is needed (per 037's own
   out-of-scope note); they are content/engine work under spec 036 extensibility.

## 8. Deliverable packaging

| # | Artifact | Change | Kind |
|---|---|---|---|
| 1 | facet READMEs ([session](../content/facets/README.md), [keyboard](../content/keyboard-facets/README.md)) | add the `source/` family + transform-ready fields to the schemas | content/schema |
| 2 | `content/facets/source/*.yaml` | author the `source.*` session-facet records (candidate) | content data |
| 3 | `content/keyboard-facets/*.yaml` + `orth.display-difficulty` | author the per-base construction keyboard-facet definitions | content data |
| 4 | [specs/037-facet-classifiers/spec.md](../specs/037-facet-classifiers/spec.md) | amend: US1 fall-through clarification; note construction classifiers | spec amendment |
| 5 | **new** `specs/0NN-facet-transform/` | the deferred transform engine -- owns the value-transition matrix + migration rules; cites `source.*` as input | new spec (stub) |

Items 1-4 are the substance of "enrich the spec before 037." Item 5 is birthed via
`/speckit-specify` and stubbed (problem + scope), not designed here. **No standalone
"source-facet model" spec** -- the catalog READMEs are the model's home, like the six
existing families, keeping it reshapeable empirical data.

## 9. Notation key for `standards.md`

`*` = do / include / supported. `X` = don't do. `?` = maybe / uncertain / open.

## 10. Open items carried forward

- `orth.display-difficulty` derivation (font-coverage signal) is asserted but its
  own derivation is unspecified -- resolve when authoring facet #3.
- The predicate library beyond the two starters is empirical; grows with the corpus.
- Per-pair transition matrix + migration rules are explicitly the deferred transform
  spec's content, not this brief's.
