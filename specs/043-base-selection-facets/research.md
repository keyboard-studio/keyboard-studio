# Phase 0 — Research: Base-Selection & Strategy Facet Classifiers

Decisions that shape the plan. Each open question the spec leaves is resolved here with rationale and the alternatives rejected. Everything below is content/engine implementation on the standalone `utilities/facet-index` tool — no `packages/*` build target changes, no locked-contract edits.

## Decision 1 — All 13 facets follow the spec-037 `{ classify, fallback }` archetype

**Decision**: Author each new facet as a flat `utilities/facet-index/<facet-id>-classifier.ts` exporting a `classify(ir, def, kb)` + `fallback(kb, def)` pair, registered in `DEFAULT_CLASSIFIERS` in `build-index.ts`, keyed by facet id — exactly as the 16 shipped classifiers are.

**Rationale**: The archetype is already the enforced standard (`ClassifierPair` type in `build-index.ts`; every classifier from spec 037/041 conforms). `classify` returns a `Categorization | null` (content-derived tier); `fallback` supplies the definition's `fallbackChain` tier when `classify` yields nothing or the codec cannot parse. The build shell already wraps `parse()` failures and routes to `fallback` without a try/catch inside any classifier — satisfying the KeyboardIR-spine edge case (Constitution Article II) for free.

**Alternatives rejected**: A new classifier framework (spec 037 explicitly closed this — construction classifiers are "further rule-structure classifiers, no new classifier spec needed"). A single mega-classifier emitting all 13 (breaks the one-file-per-facet registry convention and the per-facet test isolation the suite relies on).

## Decision 2 — Reuse `buildProducedSet` + `base-layout.ts` for every character-derived facet

**Decision**: The produced-character set comes from `buildProducedSet(ir)` (`@keyboard-studio/contracts`, already used by `script-classifier.ts`). Base-layout fall-through and the stock-layout diff come from `utilities/facet-index/base-layout.ts` (`loadBaseLayoutTable`, `resolveBaseLayout`, `namedBaseLayerVkeys`, `leakedChars`). `added-char-count`, `combining-mark-repertoire`, `orthography-coverage-ratio`, `directionality`, and the `declared-bcp47-tags` cross-check all consume these — no facet re-derives character production or fall-through.

**Rationale**: Spec Assumptions and FR-011 pin this reuse. The spec-040 fold is already inside these helpers, so `added-char-count` diffs an already-correct produced set against `base-layouts.json`'s `kbdus` entry. Re-deriving would risk divergence from the shipped `script`/`target-mix` facets that share the same set.

**Alternatives rejected**: A fresh per-facet character walk (duplicates logic, invites drift, and would miss the spec-040 fall-through fold).

## Decision 3 — `lineage.primary-strategy` reads the recognizer's per-keyboard mode, not a re-derivation

**Decision**: Compute `primary-strategy` as the **mode** of `ir.recognizedPatterns`' per-keyboard strategy tally — the same owned-rule tally `strategy-fingerprint-classifier.ts` builds before it aggregates into a distribution. A tie is recorded honestly (a `mixed` value or the tied set), never silently resolved.

**Rationale**: FR-010 and the Assumptions require reusing the existing strategy vector. The fingerprint classifier already computes the per-strategy owned-rule counts; `primary-strategy` is that map's arg-max, distinct from `lineage.strategy-fingerprint`'s neighborhood aggregate. The recognizer covers S-01/S-02 today; unrecognized-dominant keyboards land in residue → the honest value is "no clear mode."

**Alternatives rejected**: Re-running strategy recognition inside the new classifier (wasteful — recognition runs once centrally in `buildKeyboardRecord`); inventing a separate strategy taxonomy (violates the closed `StrategyId` union in `packages/contracts/src/strategy.ts`).

## Decision 4 — `source.platform-coverage` = modality inferred from bundled file types, never `<Targets>`

**Decision**: Read the `.kps` `<Files>` list; map extensions to a modality subset of `{desktop, web, touch}` — `.kmx`/`.kmn` → `desktop`, `.js` → `web`, `.keyman-touch-layout` → `touch`. Emit only the modalities the file set proves. Never read a `<Targets>` element (absent in this corpus's `.kps` dialect, verified against `bambara.kps`); never emit OS-level labels.

**Rationale**: Clarifications Session 2026-07-20 settled both the source (file-type presence) and the granularity (modality only). File presence cannot honestly distinguish Windows/macOS/Linux/iOS/Android, so OS labels would be fabrication.

**Alternatives rejected**: Parsing an assumed `<Targets>` (not in the dialect); OS-level granularity (not derivable from file presence).

## Decision 5 — `orthography-coverage-ratio` needs a pinned CLDR `exemplarCharacters` snapshot; `not-derivable` otherwise

**Decision**: Pin a CLDR `exemplarCharacters` snapshot in-repo under the facet-index tool's data area (following the existing `utilities/facet-index/ucd/` `DerivedAge.txt` and `data/base-layouts.json` pins), recorded in `utilities/facet-index/data/SOURCES.json`. Derive the ratio by comparing the produced-character set against the exemplar set for the base's declared BCP47 tag; when no exemplar set exists for the tag, record **not-derivable** (distinct from a 0.0 ratio). The exact CLDR release version is a data pin captured in `SOURCES.json`.

**Rationale**: FR-023 + Clarifications require a pinned reference for determinism (FR-004), matching how langtags/glottolog/`DerivedAge.txt` are already pinned. `not-derivable` (never a guess) preserves honesty; a 0.0 ratio means "reference exists, base covers none," which is a different signal.

**Alternatives rejected**: A live CLDR fetch or npm dependency resolved at build time (breaks byte-determinism across environments — FR-004 prohibits network). Guessing coverage from langtags alone (langtags is not an exemplar-character source).

## Decision 6 — Session-facet mirrors only for `lineage.*` / `source.*` / `env.*`; the four `keyboard.*` facets are index-only

**Decision**: Author `content/facets/<family>/*.yaml` mirrors for the nine facets whose id names a session family — `lineage.primary-strategy`, `lineage.added-char-count`, `source.platform-coverage`, `source.font-dependency`, `source.declared-bcp47-tags`, `source.package-completeness`, `env.license-fork-eligibility` (and the two P2/P3 `construction.*` facets ride the existing `source`-adjacent construction pattern — see data-model). The four `keyboard.*` facets (`directionality`, `script-family`, `combining-mark-repertoire`, `orthography-coverage-ratio`) get **no** session mirror.

**Rationale**: FR-006 + the Clarification pin this exactly. `construction.diacritic-mechanism` and `construction.spare-key-budget` are construction facets; their keyboard-facet home is `content/keyboard-facets/`, mirrored into the construction/source session vocabulary the way spec 041's construction facets already are. `keyboard.*` names no session family, so a mirror would have no home family and no consumer.

**Alternatives rejected**: Mirroring all 13 (the `keyboard.*` four have no session family — a mirror would fail lint contract C4's family resolution); mirroring none (breaks the two-vocabulary model FR-006 requires for the family-named facets).

## Decision 7 — Guards and honest sentinels reuse the `normalization-posture` pattern

**Decision**: `combining-mark-repertoire` is guarded by `keyboard.script-family`: **not-applicable** for abugida/abjad/syllabary/logographic families, same guard mechanism `normalization-posture-classifier.ts` uses. `orthography-coverage-ratio` records **not-derivable** absent a CLDR set. `license-fork-eligibility` records **unspecified** absent a matching `LICENSE.md` header — never inferred from author/copyright. Cause tags on exception sites reuse the spec-041 `cause-predicates.ts` library with its script-family applicability guard.

**Rationale**: Every honest-sentinel and guard requirement (FR-021, FR-023, FR-030, FR-002, and the Edge Cases) maps onto an existing pattern. `script-family` (FR-032) must land before or with `combining-mark-repertoire` since it is its guard — a sequencing constraint the tasks must honor even though `script-family` is P3 and `combining-mark-repertoire` is P2 (the classifier can compute script-family inline from ISO 15924 without the P3 facet being registered, but the registered facet is the durable guard).

**Alternatives rejected**: Forcing a value where the guard says not-applicable/not-derivable (SC-004 forbids); a new cause-predicate library (spec 041's is content-team-owned and extensible — reuse it).

## Decision 8 — `.kps` reads extend `scan.ts`'s already-collected package sources

**Decision**: The `source.*` and `env.*` facets read the `.kps` XML (`<Files>`, `<Languages>`, `<Font>` refs, `<LicenseFile>`) and `LICENSE.md`, all reachable from `ScannedKeyboard` (`kpsPath`, `sources`). A missing or malformed `.kps`/`LICENSE.md` falls to the facet's fallback tier — never crashes (Edge Cases). Font dependency corroborates against the `.kmn`'s `<Font>` visual store via the parsed IR.

**Rationale**: `scan.ts` already collects the `.kps` and its referenced source files per keyboard; the new facets parse fields already within reach. Keeping `.kps` parsing in the classifiers (or a small shared `kps-reader` helper) stays tool-local, honoring FR-043 (no codec parse-semantics change).

**Alternatives rejected**: Teaching the codec to model `.kps` (out of scope, FR-043); a network/registry lookup for license identity (FR-004 prohibits).

## Decision 9 — Rejected signals stay rejected (recency, transforms, A3/A5/A6 base facets)

**Decision**: No maturity/recency facet (NG-001 — needs git history, breaks determinism). No value-transition/rewrite logic (NG-002 — spec 039's scope). No `lineage.axis-coverage-vector` (NG-003). No font-coverage database (NG-004). No base-side A3/A5/A6 facets (NG-005). No offline-unreliable linguistic measures (NG-006).

**Rationale**: Each is a Clarification-level or Non-Goal decision already litigated in the spec; recording them here keeps the plan from silently re-opening them.
