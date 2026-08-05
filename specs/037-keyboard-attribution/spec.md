# Feature Specification: Keyboard attribution and license provenance

**Feature Branch**: `037-keyboard-attribution`

**Created**: 2026-08-04

**Status**: Planned — the six Open Questions are **resolved as PROPOSED decisions** in
[research.md](research.md) (D1–D6). **D4** (`LICENSE.md` vs `.kmn` precedence) and **D5**
(unparseable base license blocks emission) are legal/UX calls worth a deliberate ruling before
implementation; the other four follow from corpus evidence.

**Governing docs**: [spec.md](../../spec.md) §12 (working-copy spine), §16 (out of scope). Publication is [024](../024-option-a-github-app/spec.md); this feature supplies the attribution that publication carries.

**Input**: The studio does not capture who made a keyboard or who holds copyright. `LICENSE.md` is fabricated from the keyboard's display name, and forks of an existing base carry no record of the original author. Capture attribution, emit it into the package, and accumulate the copyright chain correctly when a keyboard is derived from a base.

---

## Context: what exists today *(audited 2026-08-04)*

**Nothing captures author or copyright.** The live identity flow
([identity_lite.modular.yaml](../../content/flows/identity_lite.modular.yaml)) is six
questions — English name, region, autonym, code, target script, unsupported-script stub.
No author, no copyright holder, no date.

Three modules that would cover it **already exist and are test-covered** —
`author_display_name`, `author_contact_email`, `pa_copyright_holder` — but live only in
[proposed/phase_a_identity.modular.yaml](../../content/flows/proposed/phase_a_identity.modular.yaml),
the demoted reserve flow. They are registered, on disk, and revivable by adding three ids
to a flow YAML (no new code).

Current emission, all in [scaffolder/index.ts](../../packages/engine/src/scaffolder/index.ts):

| Artifact | Today | Shipped-corpus norm |
|---|---|---|
| `LICENSE.md` | `Copyright © ${yyyy} ${displayName}` — **displayName is the keyboard's name, not a person** | 920/920 carry a real holder |
| `.kmn` header | the scaffolder's **stub template** writes `NAME / VERSION / KEYBOARDVERSION / TARGETS` and no `COPYRIGHT` — but see D8 below | 922/924 have `store(&COPYRIGHT)` |
| `.kps` `<Info>` | `<Name>` + `<Description>` only | 917/918 have `<Copyright>`; 442 have `<Author>` |

**The stub writer is write-if-absent** (`if (vfs.get(stub.path) === undefined)`), so a base's
`LICENSE.md` would survive if present — but **nothing fetches it**. `scaffolder/index.ts:351`
is the only `LICENSE.md` reference in the codebase outside tests and lint fixtures. Nothing
reads, parses, or merges it.

**The IR already models copyright (D8).** `IRHeader.copyright` is a required field
([keyboard-ir.ts:158](../../packages/contracts/src/keyboard-ir.ts)); `parse.ts:980` populates it
from `store(&COPYRIGHT)` and `emit.ts:268` writes the store back. So the `.kmn` gap is confined
to the scaffolder's stub template, and a **base-derived** keyboard may already preserve the
original `COPYRIGHT` through parse → emit. Verifying that is step 3 of
[plan.md](plan.md#implementation-order) — it changes how much of US2 remains.

**GitHub identity is nearly free.** `verifyToken`
([output/github.ts:156](../../packages/engine/src/output/github.ts)) already calls `/user`
but keeps only `login`:

```ts
const data = (await res.json()) as { login?: string };
```

`name` and `email` are in that same response and discarded. Retaining them costs no extra
request.

### Corpus evidence *(scan of keymanapp/keyboards, 2026-08-04)*

Findings that shape the requirements below:

- **"The license body is a constant" — CONFIRMED.** All 920 `release/` `LICENSE.md` files are
  MIT, and after stripping copyright lines there are exactly **2 distinct bodies** — differing
  only by a **UTF-8 BOM**. One canonical body is sufficient; BOM must be normalised.
- **No file has 2+ copyright lines. No file has 0.** Every one of the 920 has exactly one.
  So multi-holder files have **no precedent** — the studio would author the first ones. The
  parser's real multi-holder obligation is **round-tripping its own output**, not exotic
  legacy shapes.
- **Marker styles all occur**: `©` 597, `(c)` 316, `(C)` 7.
- **Year styles**: range 720, single 197, **no year 2**, comma list 1. Ranges are the
  *common* case, not an edge.
- **`SIL International` (280) and `SIL Global` (152) are both live in the same tier.** An
  active rename. Historical lines must never be rewritten.
- **`.kmn` `store(&COPYRIGHT)` is a poor date source**: **556 of 922 carry no year**
  (e.g. `© Samar`, `© SIL Global`). It yields a holder, usually not a date.
- **22 keyboards disagree** between `LICENSE.md` and `.kmn` on the holder — mostly the
  SIL rename applied to one file and not the other. The two sources drift; one must be
  authoritative.
- **Real shapes a regex must survive**, all found in `release/`:
  - `Copyright (c) YYYY _____________________` — an **unfilled template**, shipped
  - `Copyright © SIL International` — holder, no year
  - `Copyright © 2015` (in `legacy/`) — **year, no holder**
  - BOM-prefixed first line
- **Legacy tier**: 554 keyboard folders, **9 `LICENSE.md`**. ~545 state no license terms —
  which is why they cannot be bases (see Dependencies).

---

## Clarifications

### Session 2026-08-04

- Q: Are legacy keyboards available as authoring bases? → A: **No, and now pinned.** The base
  crawler is anchored to `release/` (`KPS_PATH_RE`), so `legacy/` is unreachable. That was
  scope rather than an explicit check, with nothing recording why. Pinned by
  [base-browser.tierScope.test.ts](../../packages/engine/src/base-browser/base-browser.tierScope.test.ts),
  verified to fail when the regex is widened. **Out of scope here; already landed.**
- Q: Does the license body need detection or compatibility logic? → A: **No.** The corpus scan
  shows one canonical MIT body across all 920 files. The body is a constant; only the
  copyright block varies. No license detection, no compatibility matrix.
- Q: Must the parser handle pre-existing multi-holder files? → A: **Not from the corpus** — none
  exist. It must handle **its own emitted output**, since a fork-of-a-fork re-parses what this
  feature wrote. Round-trip stability is the requirement.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — A new keyboard is attributed to its actual author (Priority: P1)

An author signed in with GitHub reaches the end of the walk. The studio has already proposed
their name from their GitHub profile; they confirm it, and optionally name a different
copyright holder (their organisation or language committee). The downloaded package carries
that attribution in `LICENSE.md`, the `.kmn` header, and the `.kps` metadata.

**Why this priority**: This is a correctness bug, not an enhancement — today's output names
the *keyboard* as the copyright holder. It is self-contained: no parsing, no base fetching,
no policy about accumulation. It ships alone.

**Independent Test**: Complete a walk as a signed-in user; confirm the emitted `LICENSE.md`,
`store(&COPYRIGHT)`, and `.kps <Copyright>`/`<Author>` all name the confirmed holder and a
plausible year, and that none of them contains the keyboard's display name as the holder.

**Acceptance Scenarios**:

1. **Given** a signed-in author, **When** the attribution step renders, **Then** their name is
   pre-filled from their GitHub profile for confirmation, not requested on a blank form.
2. **Given** a confirmed author name, **When** the package is emitted, **Then** `LICENSE.md`,
   `store(&COPYRIGHT)`, and `.kps <Copyright>` all carry the same holder string.
3. **Given** an author whose GitHub profile has no display name set, **When** the step renders,
   **Then** they are asked for a name rather than shown a blank or the bare login handle.
4. **Given** a guest with no GitHub session, **When** they author via the ZIP path, **Then**
   attribution is still collected and emitted (subject to OQ-6).
5. **Given** any emitted package, **When** `LICENSE.md` is inspected, **Then** the copyright
   holder is never the keyboard's display name.

---

### User Story 2 — A keyboard derived from a base preserves the original author (Priority: P1)

An author copies an existing `release/` keyboard as their base. The published result credits
both the original author and the new one, with the original's notice untouched.

**Why this priority**: This is the licensing obligation. MIT requires the original copyright
notice be retained in derivative works; emitting a `LICENSE.md` naming only the new author
would strip it. Equal priority to US1 but strictly dependent on it — accumulation needs
something to accumulate.

**Independent Test**: Copy a base with a known copyright line, complete the walk as a
different author, and confirm the emitted `LICENSE.md` contains both lines, the original
verbatim, ordered by earliest year.

**Acceptance Scenarios**:

1. **Given** a base whose `LICENSE.md` reads `Copyright (c) 2016-2021 Original Author`,
   **When** a new author derives from it, **Then** the output contains that line **byte-identical**
   plus a new line for the new author.
2. **Given** a base holder recorded as `SIL International`, **When** the derived package is
   emitted, **Then** that string is **not** rewritten to `SIL Global`.
3. **Given** a derived keyboard whose own output is later used as a base again, **When** the
   third author derives from it, **Then** all three holders appear, deduped, ordered by
   earliest year.
4. **Given** the same holder deriving twice in different years, **When** emitted, **Then** their
   single line carries a year range rather than a duplicate line.
5. **Given** a base whose `LICENSE.md` cannot be parsed for any copyright line, **When**
   emission is attempted, **Then** the tool **fails loudly** and never emits a `LICENSE.md`
   whose only holder is the new author (see OQ-5 for the exact failure mode).

---

### User Story 3 — Attribution survives a reload (Priority: P3)

Attribution answers persist with the rest of the working copy and are restored on resume.

**Why this priority**: Falls out of the existing draft persistence
([034](../034-mvp-authoring-walk/spec.md) US3) at no extra cost, provided attribution is
stored in the working copy rather than read live from the auth session at emit time.

**Independent Test**: Enter attribution, hard-reload, confirm the values are restored.

---

### Edge Cases

- Base `LICENSE.md` contains the unfilled template `Copyright (c) YYYY ____________`:
  `YYYY` must not parse as a year and `____` must not become a holder. Treat as unparseable.
- Base line has a holder but no year (`Copyright © SIL International`): carry the holder
  forward with no year rather than inventing one.
- Base line has a year but no holder (`Copyright © 2015`, seen in `legacy/`): unparseable
  holder — must not silently drop the line.
- `LICENSE.md` begins with a UTF-8 BOM: normalise before comparison; do not treat as a
  distinct license body.
- `LICENSE.md` and `.kmn` disagree on the holder (22 real cases): resolve per OQ-4.
- The new author is already a holder on the base (re-deriving one's own keyboard): update
  the existing line's year range, never add a duplicate.
- GitHub profile `email` is null (private): do not block; email is optional metadata.
- A keyboard with two `.kmn` files carrying different `COPYRIGHT` values (`ekwtamil99uni`):
  do not assume one per keyboard.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The walk MUST collect an author display name and a copyright holder, and MUST
  pre-fill the author name from the authenticated GitHub profile where available
  (propose-then-confirm, never a blank form).
- **FR-002**: `verifyToken` MUST retain `name` and `email` from the `/user` response it already
  fetches. No additional request may be introduced for this.
- **FR-003**: Emission MUST write the copyright holder into all three artifacts —
  `LICENSE.md`, `.kmn` `store(&COPYRIGHT)`, and `.kps` `<Info><Copyright>` — from one source
  of truth, so they cannot drift.
- **FR-004**: `LICENSE.md` MUST NOT use the keyboard's display name as the copyright holder.
- **FR-005**: The license body MUST be emitted as one canonical MIT text, byte-identical
  across keyboards, with a UTF-8 BOM normalised away. No license detection logic.
- **FR-006**: Copyright MUST be modelled as structured data with pure parse and render
  functions, not string manipulation at emit time. Round-tripping this feature's own output
  MUST be stable (`parse(render(x)) === x`).
- **FR-007**: When a keyboard is derived from a base, every copyright line found in the base
  MUST be carried into the derived `LICENSE.md` **verbatim** — no normalisation of holder
  names, marker style, or spacing.
- **FR-008**: Holders MUST be deduped, and a repeat contribution by an existing holder MUST
  extend that holder's year range rather than add a second line.
- **FR-009**: Holder lines MUST be ordered by earliest year so the provenance chain reads
  chronologically. Lines with no year MUST have a defined position (see OQ-3).
- **FR-010**: If the base's `LICENSE.md` exists but yields no parseable copyright line, the
  tool MUST fail loudly and MUST NOT emit a `LICENSE.md` whose only holder is the current
  user. Silently stripping a notice is prohibited.
- **FR-011**: The base's `LICENSE.md` MUST be fetched into the working copy when a base is
  chosen (it is not fetched today).
- **FR-012**: The parser MUST accept `©`, `(c)`, and `(C)` markers, single years, hyphen
  ranges, and comma-separated year lists — the shapes present in the corpus.
- **FR-013**: The parser MUST reject as unparseable, rather than misread: the literal `YYYY`
  placeholder, underscore-run holders, and lines with no holder token.
- **FR-014**: Parser and renderer MUST be covered by a fixture table **harvested from
  keymanapp/keyboards**, not hand-invented, including every shape listed in Edge Cases.
- **FR-016**: Attribution capture MUST publish the author contact into `SurveyContext` under
  the key `author_contact`, so downstream questions can pre-fill from it instead of asking a
  second time. The Phase F consumer seam already exists and is inert until this key is written
  — `phaseFOptions.seeds` pre-fills `pf_contact_info` from it
  ([flowStepOptions.tsx](../../packages/studio/src/editors/adapters/flowStepOptions.tsx),
  `CTX_AUTHOR_CONTACT`). `pf_contact_info` stays optional; the value is a starting point the
  author may clear or replace with a community address.
- **FR-015** *(resolved by D6)*: A guest with no GitHub session MUST supply an author name
  before emission. No placeholder holder may be emitted — that is how the corpus's own
  `Copyright (c) YYYY _____________________` file came to exist.

### Key Entities

- **CopyrightHolder**: `{ name: string; years: number[] }`. `name` is verbatim as written in the
  source — never normalised. `years` may be empty (holder with no year).
- **CopyrightBlock**: an ordered, deduped `CopyrightHolder[]`. The only part of a `LICENSE.md`
  that varies between keyboards.
- **Attribution**: the captured `{ authorName, authorEmail?, copyrightHolder, year }` on the
  working copy — the single source feeding all three artifacts (FR-003).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 0% of emitted packages name the keyboard's display name as copyright holder
  (today: 100%).
- **SC-002**: For a keyboard derived from any of the 920 `release/` bases, the original
  copyright line appears byte-identical in the derived `LICENSE.md` in 100% of cases.
- **SC-003**: `LICENSE.md`, `.kmn` `COPYRIGHT`, and `.kps` `<Copyright>` agree on the holder in
  100% of emitted packages (corpus baseline: 22 of 913 disagree).
- **SC-004**: `parse(render(block)) === block` for every fixture, including three- and
  four-holder chains.
- **SC-005**: A base with an unparseable copyright line fails loudly 100% of the time and
  never produces a single-holder `LICENSE.md`.
- **SC-006**: The canonical MIT body is byte-identical across every emitted keyboard.

## Assumptions

- The MIT license is the only target. Non-MIT output is out of scope (all 920 release
  keyboards are MIT).
- Legacy keyboards are not reachable as bases, and this feature does not change that.
- Attribution is captured once per keyboard, not per edit session.
- GitHub `login` is always present for a signed-in user; `name` and `email` may be null.

## Out of Scope

- **Legacy-tier relicensing** — obtaining author permission to move a `legacy/` keyboard into
  `release/` is a human process, not a tool feature.
- License **detection** or compatibility checking — the body is a constant (FR-005).
- Non-MIT license output.
- Rewriting attribution in the 22 corpus keyboards whose files disagree; this feature governs
  what the studio *emits*, and does not retro-fix the repo.
- The Phase F help-page generator (separate gap: Phase F answers are collected and consumed
  by nothing).
- Google identity as an attribution source (`useGoogleAuth` exists; GitHub is the publish path).

## Dependencies

- Attribution capture: revive `author_display_name`, `author_contact_email`,
  `pa_copyright_holder` from
  [proposed/phase_a_identity.modular.yaml](../../content/flows/proposed/phase_a_identity.modular.yaml)
  onto the live identity flow.
- Identity source: `verifyToken` in [output/github.ts](../../packages/engine/src/output/github.ts).
- Emission: [scaffolder/index.ts](../../packages/engine/src/scaffolder/index.ts) —
  `generateStubs` (LICENSE.md, `.kmn` header) and `buildKpsContent` (`<Info>`).
- Base file fetch: [base-browser/base-browser.ts](../../packages/engine/src/base-browser/base-browser.ts).
- Tier scope already pinned by
  [base-browser.tierScope.test.ts](../../packages/engine/src/base-browser/base-browser.tierScope.test.ts).

## Open Questions

**All six are now RESOLVED as proposed decisions in [research.md](research.md) (D1–D6).** They
are retained here as the questions of record, each annotated with its resolution. Overturning
any of them changes only the corresponding decision, not the spec.

- **Resolution summary** — D1: one free-text holder + separate author name. D2: year derived at
  emit. D3: inherited holders precede the current author, year-less first with a stable sort.
  D4: `LICENSE.md` authoritative, never merged. D5: unparseable base license blocks emission,
  with a manual-entry escape hatch, on both paths. D6: guests must type an author name.
- **Still worth a deliberate ruling**: **D4** is a legal-interpretation call, and **D5** is the
  one decision that can stop a user finishing a walk.

- **OQ-1 [RESOLVED → D1]** — Is the copyright holder the individual, the organisation, or both? The corpus does
  all three: `Rehmat Aziz Chitrali` (individual), `SIL Global` (org),
  `FirstVoices, SIL International, First Peoples' Cultural Foundation` (several), and
  `Galaxie Software and SIL Global` (joint). Does the studio ask for one free-text holder, or
  model author and holder separately?
- **OQ-2 [RESOLVED → D2]** — Which year? Scaffold time, or first publish? A keyboard scaffolded in December and
  published in January gets the wrong year under the current `new Date()` approach.
- **OQ-3 [RESOLVED → D3]** — Where do year-less holders sort? FR-009 orders by earliest year, but 2 corpus
  `LICENSE.md` lines and 556 `.kmn` values carry no year. First, last, or preserve source order?
- **OQ-4 [RESOLVED → D4, ruling advised]** — When `LICENSE.md` and `.kmn` disagree, which wins? 22 real cases. Proposal:
  `LICENSE.md` is authoritative because it is the legal notice and always carries a year more
  often — but this needs ratifying.
- **OQ-5 [RESOLVED → D5, ruling advised]** — Unparseable base license: hard block or warn-and-proceed? FR-010 forbids silently
  stripping. Does that mean blocking publish outright, or emitting with a review flag? Note the
  PR path ([024](../024-option-a-github-app/spec.md)) and the ZIP path may warrant different
  answers.
- **OQ-6 [RESOLVED → D6]** — Guest with no GitHub session (the ZIP path needs no OAuth): is a typed author name
  required before download, or may `LICENSE.md` ship with a placeholder? A placeholder risks
  reproducing the corpus's own `Copyright (c) YYYY ______` bug.

### Sequencing note *(not a question — a consequence)*

The proposal's fallback chain is `LICENSE.md` → `store(&COPYRIGHT)` → author metadata → flag
for review. For a studio-generated keyboard **all three sources are empty today**, so the
review flag would fire on every keyboard until US1 lands. US1 must precede US2; the parser is
third in dependency order, not first, despite being the bulk of the work.
