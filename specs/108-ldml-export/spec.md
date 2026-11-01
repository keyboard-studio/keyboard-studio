# Feature Specification: LDML keyboard export

**Feature Branch**: `108-ldml-export`

**Created**: 2026-11-01

**Status**: Draft — blocked on governance gate G0 (see below)

**Owner**: Engine team (Constitution Art VI) — exporter, classifier, output path, SPA surfaces.
No Content-team surfaces change.

**Input**: User description: "Add an LDML export to the Output page. Any part of the IR that
can be mapped to LDML should be, with a clear list of items that won't transfer (physical
keyboard and touch). Include documentation and metadata if LDML allows it. Upstream in the
process, flag as a warning any rule that is not compatible with LDML. LDML supports regex
context mapping that KMN doesn't; LDML does not support context transformations that happen
without key input."

**Companion documents**:
- [contracts/ldml-mapping.md](contracts/ldml-mapping.md) — the construct-by-construct mapping
  and the finding-code table. **Normative** for this spec.
- [research.md](research.md) — sources, authority order, verified facts, open items R8/R9.
- [amendment.md](amendment.md) — the proposed Constitution Art VII amendment (gate G0).

## Governance gate G0 (prerequisite)

Constitution Art VII, spec.md §16, CLAUDE.md and README.md all list "LDML output" as out of
scope. This feature MUST NOT be planned or implemented until the product owner records a
ruling that adopts the amendment in [amendment.md](amendment.md), or a variant of it. The
ruling makes LDML export a **secondary, source-only** artifact; KMN stays the primary emission
format. Under the constitution's precedence table, a recorded product ruling beats spec text.

## Authority order

1. CLDR TR35 Part 7 (Keyboards) — what valid LDML is.
2. The Keyman team's upstream code (`keymanapp/keyman` `origin/master`) — what Keyman 19 can
   compile.
3. Prior art on the product owner's Keyman fork and sibling repos — mapping ideas only.

**Product goal**: spec-perfect LDML, the touch half included, ready for Keyman's touch
pipeline when it is implemented. Keyman's pipeline does not yet support the touch half of LDML.

Where Keyman accepts less than the standard:

- **hardware**: the export stays inside Keyman's subset, because Keyman compiles it today;
- **touch**: the export follows TR35, because nothing in Keyman consumes it yet.

Either way the difference is reported as a Keyman gap, never as an LDML incompatibility
(FR-053; research, "Authority order").

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Download an LDML version of my keyboard (Priority: P1)

An author has finished a keyboard. On the Output page, next to the existing downloads, they
choose "Download LDML". They receive a package containing their keyboard as a CLDR keyboard3
`.xml` file and an export report. The report lists, in plain language, everything that did not
carry over and why, each item located by its line in the keyboard source.

**Why this priority**: This is the feature. Everything else supports it.

**Independent Test**: Load a keyboard with only plain key assignments, deadkeys and stores.
Download the LDML export. The `.xml` validates against the LDML keyboard3 rules and compiles
with Keyman's LDML compiler. Typing the same keystrokes on the original and the export gives
the same text. The report says "nothing was lost".

**Acceptance Scenarios**:

1. **Given** a keyboard whose rules are all transferable, **When** the author downloads the
   LDML export, **Then** the `.xml` is valid keyboard3, compiles with Keyman's LDML compiler
   without errors, and the report lists zero approximated or non-transferable items.
2. **Given** a keyboard with an option-guarded rule (`if(opt = '1')`) and a `begin
   PostKeystroke` group, **When** the author downloads, **Then** the export still succeeds, the
   option rule is exported at the option's default value, the post-keystroke group is
   omitted, and the report lists both with their source lines and the reason.
3. **Given** a keyboard with keys that have no rule, **When** exported, **Then** each such key
   types the same character in LDML as the base keyboard would type under KMN.
4. **Given** the existing Output-page gate blocks downloads (e.g. a coverage blocker), **When**
   the author looks at the LDML download, **Then** it is disabled for the same reason as the
   other downloads.
5. **Given** the author exports the same unchanged keyboard twice, **Then** both packages are
   byte-identical.

---

### User Story 2 — See LDML incompatibilities while authoring (Priority: P2)

While building or editing a keyboard, an author who adds a rule that cannot carry over to LDML
— a `PostKeystroke` group, an option `set()`, a `call()`, a frame-key rule — sees a warning on
the step where that construct lives, before reaching the Output page. The warning names the
rule's line, says what LDML will do instead (approximate or drop), and does not block any
output.

**Why this priority**: The user asked for upstream flagging explicitly. It shares the
classifier with Story 1, so it is cheap once Story 1 exists, but it is independently valuable:
an author can keep a keyboard LDML-portable without ever exporting.

**Independent Test**: Import a keyboard that uses `if()`/`set()` options and `begin
PostKeystroke`. Without visiting the Output page, the relevant steps show LDML warnings with
the source lines. KMN `.kmp` and `.zip` downloads remain enabled.

**Acceptance Scenarios**:

1. **Given** a working copy containing a rule classified Approximated or Not transferable,
   **When** findings refresh in the normal validation cycle, **Then** a warning with an
   `KM_LINT_LDML_*` code appears for that rule, carrying its `source/<id>.kmn` line when the
   rule has one.
2. **Given** the author removes the offending rule, **When** findings refresh, **Then** the
   warning disappears in the same cycle.
3. **Given** LDML warnings exist, **When** the author goes to the Output page, **Then** every
   non-LDML download remains available, and the LDML findings are listed there too.
4. **Given** a keyboard with hundreds of option-guarded rules, **When** findings are shown,
   **Then** they are grouped by code with a count, and each rule can still be located
   individually.

---

### User Story 3 — Documentation and metadata travel with the export (Priority: P2)

The author's keyboard name, version, author, languages, description, copyright, licence, and
help documents are included in the export. Fields LDML supports go into the `.xml`; the rest
go into a Keyman LDML project around it, which Keyman Developer can open and build into an
installable package.

**Why this priority**: The user asked for documentation and metadata "if LDML allows it".
LDML proper carries only name, author, layout, indicator, version and locales, so the rest
needs the project wrapper to survive at all.

**Independent Test**: Export a keyboard with a description, licence, readme and welcome
document. The `.xml` `<info>`, `<version>` and locales match the keyboard. Running Keyman's
command-line build on the extracted project produces a `.kmp` whose package information
matches the studio's metadata.

**Acceptance Scenarios**:

1. **Given** a keyboard with name, author, version `1.2`, and languages `ibn` and `en`,
   **When** exported, **Then** `<info name author>` match, `<version number="1.2.0">`,
   `locale="ibn"`, and `<locales>` holds `en`.
2. **Given** a keyboard with a description, copyright and licence, **When** exported, **Then**
   the `.xml` opens with a documentation comment carrying them, and the project's package
   file, readme, welcome, LICENSE, README and HISTORY carry the full text.
3. **Given** the exported project, **When** built with Keyman's command-line compiler,
   **Then** it builds without errors.

---

### User Story 4 — Touch layout carries over, spec-perfect (Priority: P2)

When the keyboard has a touch layout, its phone and tablet layers, long-press, flick and
multitap keys, widths and layer switches are exported as LDML touch forms that conform exactly
to TR35. Presentation-only details that LDML cannot hold (fonts, hints) are listed in the
report.

**Why this priority**: The product goal is spec-perfect LDML, including the touch half,
**ready for Keyman's touch pipeline when it lands**. LDML can encode touch, but Keyman's
pipeline does not yet support the touch half end to end. The export must therefore be correct
against the standard now, not just against what Keyman builds today. When Keyman ships the
touch pipeline, exported keyboards should need no re-export.

**Independent Test**: Export a keyboard with a phone and a tablet layout using long-press and
a layer switch. Both touch forms appear with the right layers and gestures, pass the TR35
touch conformance checks (FR-052), and each touch key's output equals what the KMN rules
produce for that key.

**Acceptance Scenarios**:

1. **Given** phone and tablet layouts, **When** exported, **Then** two touch forms are written
   (neither is discarded) with distinct device widths.
2. **Given** a touch key whose label differs from the character it types, **When** exported,
   **Then** the key types the rule's output and the label becomes its display.
3. **Given** any touch export, **Then** the report states once that Keyman's pipeline does not
   yet support the touch half of LDML, and that the touch forms are written to TR35 in
   readiness for it.
4. **Given** a touch construct that TR35 allows but today's Keyman compiler rejects or ignores,
   **When** exported, **Then** the standard decides: the construct is written as TR35
   specifies, and the Keyman difference is a Keyman-gap hint, not a reason to degrade the
   touch form.

---

### Edge Cases

- **ANSI-only keyboard** (`begin ANSI`, no `begin Unicode`): the download is disabled with an
  explanation. LDML is Unicode-only.
- **Mnemonic keyboard**: exported by resolving character keystrokes through the base keyboard
  (default `en-US`). The report says the layout is right only for that base keyboard. Prior
  art refused these.
- **No language tag**: `locale="und"`, plus a report item.
- **Non-semver version** (`1.0`, `2`, `1.0.0.4`): normalised to `major.minor.patch`, with the
  original in the header comment.
- **Rule expansion explodes** (several `index()` over large stores): stop at the cap, omit that
  rule, and report it. The cap is a named constant; default 1 000 transforms per rule.
- **Deadkey names that are not valid marker ids**, or that collide after sanitising: map
  injectively and keep the original names in comments.
- **Two keys produce the same character but have different context rules**: use trigger
  markers (mapping section 3). Not a user-visible loss, so no finding.
- **A matched deadkey that no rule ever outputs**: dropped as dead code, with a hint. Keyman's
  compiler would reject the matched-but-never-output marker.
- **Keyboard made entirely of opaque fragments**: the export is produced with a key map from
  the base keyboard only. Every fragment is reported.
- **Output gate already blocks downloads**: the LDML download shares the gate (Story 1,
  scenario 4).
- **Very large findings sets on imported keyboards**: grouped presentation (Story 2,
  scenario 4). No cap on what is recorded.

## Requirements *(mandatory)*

### Functional Requirements

**Governance**

- **FR-001**: Work MUST NOT start until gate G0 is recorded, i.e. the Art VII amendment, or a
  variant the product owner chooses, is applied to the four governing files in one change.

**Export**

- **FR-002**: The Output page MUST offer an LDML download alongside the existing downloads. It
  MUST share their gate and busy state, and MUST NOT appear on the `.kmp` or pull-request
  paths.
- **FR-003**: The export MUST be computed from the same projected working copy that the other
  downloads serialise. It operates on the KeyboardIR, never on raw `.kmn` text (Art II).
- **FR-004**: The export MUST be a zip package containing `source/<id>.xml` (keyboard3), the
  Keyman LDML project files listed in FR-040, and `LDML-EXPORT-REPORT.md`.
- **FR-005**: The `.xml` MUST declare `conformsTo="46"` and the matching keyboard3 namespace,
  and MUST use only constructs that both TR35 and Keyman 19's LDML compiler accept (research
  R1–R3, R6).
- **FR-006**: Writing the download MUST NOT start a validation pass of its own. It reuses the
  classification already computed (Art IV, D3).
- **FR-007**: The export MUST NOT write to host disk except through the browser download (Art V).

**Mapping**

- **FR-008**: Every IR construct MUST be classified as Mapped, Approximated, Not transferable,
  or Keyman gap, exactly as [contracts/ldml-mapping.md](contracts/ldml-mapping.md) specifies.
  Any construct the contract does not list MUST be classified Not transferable with code
  `KM_LINT_LDML_OPAQUE` until the contract is amended. It is never silently dropped.
- **FR-009**: Mapped and Approximated constructs MUST be exported; Not-transferable ones MUST
  NOT be.
- **FR-020**: The hardware form MUST be `iso` when the keyboard uses an ISO-only key or its base
  keyboard is ISO-family, `abnt2`/`jis` when it uses keys only those forms have, and `us`
  otherwise. Only one hardware form is written.
- **FR-021**: Every main-block position in every exported hardware layer MUST have an explicit
  key. Positions without a rule get the base keyboard's character for that layer, because
  LDML does not fall through to the base keyboard.
- **FR-022**: Within each transform group, transforms MUST be written in KMN's effective
  precedence (longest context first, then source order), not in source order (research R5).
- **FR-023**: Every transform MUST meet Keyman 19's set-mapping limit: at most one mapping, as
  capture group 1, filling the whole replacement. Anything else MUST be expanded or reported.
- **FR-024**: No trigger marker introduced by the exporter may survive into the output text.
  Every such marker MUST have a final catch-all transform.
- **FR-025**: Context-only groups reached by `use()` MUST be exported as later transform
  groups. Groups that run without key input (`NewContext`, `PostKeystroke`, `readonly`) MUST
  be reported as Not transferable.

**Compatibility findings (authoring-time warnings)**

- **FR-010**: Each Approximated or Not-transferable **rule** MUST produce a finding of severity
  `warning`. Non-rule losses (header stores, touch presentation, package-only metadata) and
  Keyman gaps MUST produce `hint`s.
- **FR-011**: Finding codes MUST come from the `KM_LINT_LDML_*` family in the mapping
  contract's code table, layer C. They MUST NOT use the `KM_WARN_*` prefix, which the Output
  page filters out.
- **FR-012**: The authoring-time findings and the export report MUST come from one
  classification of the same working copy. For any working copy, the set of finding sites
  MUST equal the set of report rows for A and N items.
- **FR-013**: Every `RawKmnFragment` and every `raw` IR element MUST produce exactly one
  finding and one report row, naming its opaque reason.
- **FR-014**: The findings MUST be computed inside the existing validation cycle. The model is
  a memoised scan over the working IR, joined into the one published findings array, in the
  same way as the existing sole-source `oe2` finding. They MUST NOT add a timer or a parallel
  validation path (Art IV).
- **FR-015**: Each finding code MUST be routed to the step or question where its construct is
  authored. Codes with no owning step appear in the Output page's findings summary. All LDML
  findings MUST also be listed on the Output page next to the LDML download.
- **FR-016**: LDML findings MUST NOT block, gate or disable any download or the pull-request
  path, and MUST NOT count against criteria.
- **FR-017**: Each finding MUST carry the rule's `source/<id>.kmn` line when the rule has one,
  and a plain-language message saying what LDML will do instead. Synthesised rules without a
  line MUST name their group and owning pattern or behaviour.
- **FR-018**: Presentation MUST group findings by code with a count, while keeping every
  finding individually locatable.
- **FR-019**: All new author-facing strings MUST ship with their French translation and use
  the `output.download.*` and `lint.ldml.*` id namespaces. The new controls MUST meet the
  studio accessibility rules, including the aria-label matching the filename id.

**Versioned target profiles (remap per LDML version)**

- **FR-060**: The mapping MUST be organised as versioned **target profiles**, one per LDML
  keyboard version. A profile is keyed by `conformsTo` and records:
  - its namespace;
  - the TR35 revision it was written against;
  - the Keyman release whose compiler defines its hardware subset;
  - its classification rows.

  The first profile is `46`, which is [contracts/ldml-mapping.md](contracts/ldml-mapping.md).
- **FR-061**: A later profile MUST be expressible as **deltas** from the profile before it:
  rows whose status, LDML form or finding code changes. Supporting a new LDML version means
  adding a profile and its deltas. It MUST NOT require changing how the IR is walked.
- **FR-062**: The exporter, the authoring-time findings and the report MUST all use the
  **selected** profile, and the report and the `.xml` header comment MUST name it.
  - The default profile is the newest one whose hardware subset Keyman compiles.
  - When more than one profile exists, the author MAY choose another. That choice is an
    export option, not a survey decision (Art IX).
- **FR-063**: Every Keyman-gap (K) row MUST record the condition that would lift it, for
  example "CLDR 47 `info/@attribution`" or "Keyman accepts `$[N:var]` (upstream #16868)". A
  new profile can then promote those rows without re-research.
- **FR-064**: Re-exporting an unchanged working copy under a newer profile MUST be possible
  with no author changes. The report of the new export MUST list what the version change
  gained, as rows that moved from A, N or K to M, alongside what it still cannot carry.
- **FR-065**: A test MUST fail when a profile's `conformsTo` is not accepted by the Keyman
  schema pinned in CI, unless the profile is marked "TR35-only (awaiting Keyman)". This keeps
  the default-profile rule honest.

**Report**

- **FR-030**: Identical working copies MUST yield byte-identical packages. The export uses no
  timestamps and no ids that depend on traversal order.
- **FR-031**: `LDML-EXPORT-REPORT.md` MUST contain:
  - counts per status;
  - one row per Approximated, Not-transferable and Keyman-gap item, with location, construct,
    code and consequence;
  - a separate "physical keyboard" list and "touch" list of items that did not transfer;
  - the Keyman 19 desktop-only delivery note;
  - the authority statement (TR35 version and Keyman version targeted).

**Documentation and metadata**

- **FR-040**: The package MUST be a Keyman LDML project in the layout of
  `kmc generate ldml-keyboard`: `<id>.kpj`, `source/<id>.xml`, `source/<id>.kps`,
  `source/readme.htm`, `source/welcome.htm`, `LICENSE.md`, `README.md`, `HISTORY.md`, plus the
  icon and fonts the KMN package carries. Its `.kps` MUST reference `build/<id>.kmx` and
  `build/<id>.kvk`.
- **FR-041**: The `.xml` MUST carry the metadata of mapping-contract section 4:
  - `info` holds only `name`, `author`, `layout` and `indicator`. `attribution` is not
    accepted by Keyman's v46 schema.
  - `version` and locales come from the identity overlay and package metadata, not from
    `IRHeader.bcp47`.
- **FR-042**: The `.xml` MUST open with a documentation comment carrying:
  - name, id, version, description, copyright, licence name, author, attribution, home page
    and studio version;
  - one comment per transform group naming its KMN group;
  - one comment per transform naming its source line.

**Quality**

- **FR-050**: Every exported `.xml` in the test corpus MUST pass Keyman's keyboard3 schema
  validation and compile with Keyman's LDML compiler in CI.
- **FR-051**: A keystroke-equivalence harness MUST compare KMN behaviour (the engine's
  simulator) with LDML behaviour on generated keystroke sequences for the test corpus.
  Mismatches are allowed only on sequences that exercise an item the report lists.
- **FR-052**: Because Keyman cannot yet exercise the touch half, touch forms MUST be checked
  against TR35 directly:
  - the CLDR keyboard3 DTD;
  - the TR35 touch rules: a `base` layer per touch form, ids on touch layers and no
    `modifiers`, every `layerId`/`flickId`/gesture key id resolving, gesture-target keys
    carrying no gestures of their own, `minDeviceWidth` 1–999 and distinct per form, widths
    and gaps well-formed.

  This conformance check is the touch half's source of truth. Keyman's compiler is a second
  check, and a construct Keyman rejects is resolved by FR-053.
- **FR-053**: Where TR35 and Keyman 19 disagree:
  - on the **hardware** half, the export uses the subset both accept, because Keyman compiles
    it today;
  - on the **touch** half, the export follows TR35, and each Keyman difference is a Keyman-gap
    hint.

  Keyman-only conventions MUST NOT be baked into the touch output.

### Key Entities

- **Compatibility item**: one classified construct. It has a status (M/A/N/K), a code, a
  location (source line, or group plus owner), the construct kind, a consequence sentence, and
  the mapping-contract row it came from. Findings and report rows are both views of it.
- **Export package**: the zip of the LDML project plus the report. It is derived from the
  projected working copy and has no state of its own.
- **Base-keyboard resolution**: the OS layout the export assumes for fall-through keys,
  mnemonic resolution and `baselayout()` evaluation. It comes from the studio's reference base
  keyboards and defaults to `en-US`. Distinct from the copied keyboard and the starting point.
- **Target profile**: one LDML keyboard version the exporter can write. It holds `conformsTo`,
  namespace, TR35 revision, the Keyman release it is compiled against, and its classification
  rows (or deltas from the previous profile). It is selected per export and named in the
  output.
- **Trigger marker**: an exporter-introduced LDML marker that preserves keystroke identity
  where two keys share an output. Internal; never reaches the author's text.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100 % of exports in the test corpus pass Keyman's keyboard3 schema validation and
  compile with Keyman's LDML compiler.
- **SC-002**: For every corpus keyboard whose report lists no A or N items, 100 % of generated
  keystroke sequences produce identical text under KMN and under the LDML export.
- **SC-003**: For every corpus keyboard, every keystroke-sequence mismatch is attributable to
  an item in its report. Zero unexplained mismatches.
- **SC-004**: Every opaque fragment and `raw` element in the corpus yields exactly one finding
  and one report row.
- **SC-005**: For any working copy, the finding sites and the report's A/N rows are the same
  set.
- **SC-006**: For `ibono_chwerty`, the exported key map and outputs match the hand-written
  `ibono_chwerty.xml` in the keyboards corpus for every hardware position both define.
- **SC-007**: An author can download the LDML package in one click from the Output page.
  Producing it for a corpus-sized keyboard (≤ 2 000 rules) takes under 2 seconds.
- **SC-008**: Adding or removing an incompatible rule changes the visible LDML warnings within
  the same validation cycle as other findings. No extra delay is introduced.
- **SC-009**: Two exports of an unchanged working copy are byte-identical.
- **SC-010**: 100 % of touch forms exported from the corpus pass the TR35 touch conformance
  check (FR-052). Zero touch constructs are degraded to fit today's Keyman compiler.
- **SC-011**: Adding a second profile that only changes the status of existing rows touches
  only that profile's definition and its tests. No exporter or finding code changes.

## Assumptions

- **Test corpus**: the starting points and fixtures already in the studio's tests, plus
  `ibono_chwerty`, `khmer_angkor` (compared with its hand port `khmer_ldml`), and at least one
  mnemonic keyboard. See [docs/keyboard-index.md](../../docs/keyboard-index.md).
- **Keyman tooling**: Keyman's LDML compiler and schema validator are available to CI as test
  dependencies. Whether the schema validator can also run in the browser (lazy-loaded) is a
  plan decision. The browser export must not depend on it.
- **Base keyboard**: the exporter receives the base-keyboard data as input. The reference
  data lives in the studio package, and the engine may not import the studio.
- **Option defaults**: an option store's default is its initial store value in the IR.
- **Expansion cap**: 1 000 transforms per KMN rule is enough for real keyboards. It is a
  tunable constant, not a contract.
- **Open items carried into planning**:
  - research R8: how Keyman expects touch backspace, enter and tab keys;
  - research R9: the normalization default.
  Neither changes the user-visible scope.
- **Out of scope**:
  - LDML **import**;
  - LDML as a primary emission format;
  - putting the LDML file in the `.kmp` or pull request;
  - authoring directly in LDML;
  - LDML regex features KMN cannot express, which are irrelevant to a KMN→LDML direction;
  - upstreaming the exporter to `kmc-convert`, which is a possible follow-up (research R10).
