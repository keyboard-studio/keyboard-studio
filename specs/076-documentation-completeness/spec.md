# Feature Specification: Documentation completeness — every package ships its full documentation set

**Feature Branch**: `076-documentation-completeness`

**Created**: 2026-09-10

**Status**: Draft

**Input**: User description: "076-documentation-completeness: Complete package documentation from three content tiers. Every generated keyboard package always ships six documentation members — README.md, HISTORY.md, LICENSE.md, source/readme.htm, source/welcome/welcome.htm (folder convention, with layout images alongside and listed in the .kps), and source/help/<id>.php carrying the standard help-site PHP header — and each member is filled from the best available source in priority order: derived from the keyboard, inherited from the base, authored in Phase F (adaptive). Base documentation is classified none / minimal / full at base selection. HISTORY.md gets a proposed entry from the recorded changes. Layout charts are generated per layer by a deterministic engine-side renderer, never by screenshotting the on-screen keyboard. Gaps warn and never block: an Output-step documentation checklist plus the Layer C documentation criteria rows as yellow findings. First user story: the fresh help page gets the standard help-site header. Decisions already made by the product owner: folder welcome convention; copy inherits structure and images only; gaps warn and list but never block; layout charts generated from the keyboard model, not the OSK iframe."

**Governing context**: [spec.md](../../spec.md) §12 (output/delivery — the documentation members a Keyman package ships), §10 (validator layering — Layer C hygiene), §11 (criteria model — the documentation rows in sections 3, 4, 5, 6, 8, 11 of `criteria.md`), and §3c (defaults are the product — propose-then-confirm). Builds directly on the completed [spec 061 — Help documentation generation](../061-help-docs-generation/spec.md) and the authoring guidance in [docs/keyboard-documentation-plan.md](../../docs/keyboard-documentation-plan.md). Corpus evidence is the `../keyboards` release tree (1026 keyboards): README 926, HISTORY 923, LICENSE 924, `readme.htm` 897, help page 920; the welcome page ships as `source/welcome/welcome.htm` in 728 keyboards and as flat `source/welcome.htm` in 144; 672 keyboards ship layout images beside their welcome page.

**Product-owner decisions recorded up front** (settled 2026-09-10; `/speckit-clarify` must not re-ask them):

| Decision | Choice |
|---|---|
| Welcome-page convention | Folder: `source/welcome/welcome.htm` with images alongside, all listed in the package descriptor |
| Copy (Track 1) inheritance from the base | Structure and images only — never the base's prose |
| Severity of documentation gaps at output | Warn and list; never block download or community submission |
| Layout charts | Generated from the keyboard model by a deterministic renderer; never a screenshot of the on-screen keyboard preview |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A brand-new keyboard's help page renders on the help site (Priority: P1)

An author builds a keyboard from scratch (no base help page to inherit), answers the required description, and produces a package. The generated online help page opens with the same standard help-site header every published keyboard uses — page name, page title, and the shared header include — so when the keyboard is submitted upstream its help page renders like the other 920 in the corpus instead of as a bare fragment.

**Why this priority**: Today a net-new keyboard's help page is a bare HTML fragment with no help-site header. It is the one shipped member that is currently *wrong* rather than merely thin, and it affects every net-new keyboard. It is also the smallest change in this feature and lands independently.

**Independent Test**: Produce a package for a net-new keyboard with only the required description answered; open `source/help/<id>.php` and confirm the header block (page name derived from the keyboard's display name, page title, shared header include) precedes the documentation body, and that the body still matches the welcome page's body (spec 061 parity).

**Acceptance Scenarios**:

1. **Given** a net-new keyboard named "Hausa Basic" with the required description answered, **When** the author produces a package, **Then** `source/help/hausa_basic.php` begins with the standard help-site header naming the page "Hausa Basic Keyboard Help" and including the shared header, followed by the rendered documentation body.
2. **Given** a keyboard adapted from a base that already ships a hand-authored help page with its own header, **When** the author produces a package, **Then** the base's header and body are preserved and the new answers are appended below the merge boundary, exactly as today — no second header is added.
3. **Given** a net-new keyboard where the author has not yet answered the required description, **When** an early package is produced, **Then** the help page still carries the standard header with the display-name-derived page name and a placeholder body, and the Output step lists the help page as "placeholder".

---

### User Story 2 - The welcome page ships in the corpus's folder convention, with its images (Priority: P2)

An author adapts a published keyboard whose welcome page lives in a `source/welcome/` folder alongside layout images (the majority convention). The produced package keeps that welcome page and every image, lists them all in the package descriptor, and names the welcome file in the descriptor the way the corpus does. A net-new keyboard's welcome page is written to the same folder location.

**Why this priority**: Today the tool reads and writes only the flat `source/welcome.htm` path. For roughly 730 bases the base welcome page is never found, so adaptation silently drops the base's welcome content and all of its graphics, and the package descriptor lists a file that does not exist in the base. This is the largest silent loss of inherited documentation.

**Independent Test**: Adapt `basic_kbdfr` (folder convention, three layout images) and produce a package; confirm `source/welcome/welcome.htm` and all three images are present in the output, listed in the descriptor's file list, and that the descriptor names the welcome file with the folder path. Then produce a package for a net-new keyboard and confirm its welcome page is at the same folder location.

**Acceptance Scenarios**:

1. **Given** a base whose welcome page is `source/welcome/welcome.htm` with images beside it, **When** the author adapts it and produces a package, **Then** the output contains that welcome page (with the author's answers appended) and every image, and the package descriptor lists each of them and names the welcome file by its folder path.
2. **Given** a base whose welcome page is the flat `source/welcome.htm`, **When** the author adapts it, **Then** the base welcome page is still found and merged, and the output places the result at the folder location.
3. **Given** a net-new keyboard (no base welcome page), **When** a package is produced, **Then** the welcome page is at `source/welcome/welcome.htm` and the descriptor names it by that path.
4. **Given** an author *copies* a base (Track 1) rather than adapting it, **When** a package is produced, **Then** the base's welcome images and page skeleton are carried over but none of the base's descriptive prose appears in the new welcome page.
5. **Given** the produced package is installed, **When** Keyman shows the welcome page, **Then** every image the page references resolves (no broken image references).

---

### User Story 3 - The Output step shows what documentation will ship and where it came from (Priority: P3)

Before downloading or submitting, the author sees a documentation checklist: each of the six shipped members, the source its content came from (derived from the keyboard, inherited from the base, or authored by them), and a clear marker on any member still carrying placeholder text. Nothing is blocked; the author decides whether to go back and fill a gap.

**Why this priority**: The tiering in this feature only helps if the author can see it. The checklist makes "what will my package say about itself" answerable in one glance and turns silent placeholders into a visible, optional decision. It is also the surface where every later story reports.

**Independent Test**: Reach the Output step with a keyboard where one member is on placeholder; confirm the checklist lists all six members, shows a source tier for each, marks the placeholder member, offers a way back to the step that fills it, and that both download and submission remain available.

**Acceptance Scenarios**:

1. **Given** a keyboard whose required description is answered but whose HISTORY entry is still the stub, **When** the author reaches the Output step, **Then** the checklist shows six members, the HISTORY row is marked as placeholder, and the other rows show their source tier.
2. **Given** a member marked placeholder, **When** the author activates that row, **Then** they are taken to the step that supplies its content, and returning to Output shows the row updated.
3. **Given** any combination of placeholder rows, **When** the author chooses to download or to submit, **Then** both actions proceed; the checklist state is informational only.
4. **Given** a keyboard adapted from a fully documented base, **When** the author reaches Output, **Then** rows sourced from the base say so, and rows the author edited say "authored".

---

### User Story 4 - The help-docs step adapts to what the base already documents (Priority: P4)

When the author picks a base, the tool tells them how much documentation that base already carries — none, minimal, or full. In the help-docs step, the description question is required only when no usable base description exists; otherwise the base's description is proposed and the author confirms or rewrites it in one action.

**Why this priority**: Requiring a fresh description from an author who adapted a fully documented base is friction the defaults-first rule (§3c) says to remove, and the classification at base selection sets expectations before the author has invested time. This depends on nothing in stories 1–3 but is less urgent than fixing what ships.

**Independent Test**: Select a base with a full help page and confirm the base card or summary shows "documentation: full"; proceed to the help-docs step and confirm the description is prefilled from the base and the step can be completed by confirming. Repeat with a base that has no welcome or help page and confirm the classification says "none" and the description is required.

**Acceptance Scenarios**:

1. **Given** the author is choosing a base, **When** bases are shown, **Then** each shows a documentation level of none, minimal, or full derived from which documentation members the base ships and whether they carry more than a stub.
2. **Given** a base classified full, **When** the author reaches the help-docs step, **Then** the description is proposed from the base's own description and the author can accept it unchanged, edit it, or replace it.
3. **Given** a base classified none, or a net-new keyboard, **When** the author reaches the help-docs step, **Then** the description is required exactly as today.
4. **Given** the author copied (Track 1) a base classified full, **When** they reach the help-docs step, **Then** the description is *not* prefilled from the base's prose (copy inherits structure and images only) and is required.

---

### User Story 5 - HISTORY.md carries a real first entry, proposed from what the tool knows (Priority: P5)

The author's first HISTORY entry is proposed from the recorded changes — the base it started from, characters added, mechanisms chosen — and the author confirms or edits it. The stub "Initial release." ships only when the author explicitly keeps it.

**Why this priority**: HISTORY is the one member the corpus treats as mandatory (923 of 1026) that the tool still ships as a stub with no way to improve it in the survey. The tool already knows enough to draft a useful entry.

**Independent Test**: Build a keyboard by adapting a base and adding two characters via a mechanism; at the help-docs step (or the Output checklist), confirm a proposed HISTORY entry lists the base and the additions, and that accepting it makes the produced HISTORY.md carry those bullets under the correct version heading.

**Acceptance Scenarios**:

1. **Given** a keyboard adapted from `basic_kbdfr` with two added characters, **When** the author reaches the HISTORY proposal, **Then** the proposed entry names the base and the additions as bullets under a heading whose version matches the keyboard's version.
2. **Given** the proposal is shown, **When** the author edits a bullet and confirms, **Then** the produced HISTORY.md contains the edited text and the heading format the criteria require (version, date, bullet items).
3. **Given** the author dismisses the proposal without confirming, **When** a package is produced, **Then** HISTORY.md ships with the stub and the Output checklist marks it placeholder.
4. **Given** the keyboard was adapted from a published keyboard, **When** the entry is produced, **Then** the "Adapted from" attribution bullet the criteria require is present regardless of the author's edits.

---

### User Story 6 - Every keyboard's welcome page has a layout chart (Priority: P6)

The welcome page shows a chart of the keyboard's layout, one image per layer, generated from the keyboard itself. A net-new keyboard gets the chart the majority of published keyboards hand-draw; an adapted keyboard keeps the base's images unless the author chose to regenerate.

**Why this priority**: 672 corpus keyboards ship layout images; a welcome page without one is visibly poorer. This is the largest piece of work and the most self-contained, so it is deliberately last among the shipped-content stories.

**Independent Test**: Produce a package for a net-new keyboard with a desktop layout and a touch layout; confirm `source/welcome/` contains one chart image per layer, each is referenced from the welcome page in a "Keyboard Layout" section, each is listed in the package descriptor, and producing the package twice yields identical chart files.

**Acceptance Scenarios**:

1. **Given** a net-new keyboard with default and shift desktop layers and a phone touch layout, **When** a package is produced, **Then** `source/welcome/` holds one chart per layer, the welcome page's layout section references each, and the descriptor lists each.
2. **Given** the same keyboard, **When** the package is produced a second time with no changes, **Then** every chart file is byte-identical to the first production.
3. **Given** a keyboard adapted from a base that ships its own layout images, **When** a package is produced, **Then** the base's images are kept and no generated chart replaces them unless the author opted to regenerate.
4. **Given** a keyboard whose key outputs include combining marks or characters with no glyph in the chart's fallback font, **When** the chart is generated, **Then** each such key is still drawn with a legible representation (a dotted-circle carrier for marks, a code point for missing glyphs) rather than a blank key.

---

### User Story 7 - Documentation quality problems surface as yellow findings (Priority: P7)

The documentation rows already in the criteria catalog that describe mechanically checkable facts — HISTORY entry format and version match, copyright holder consistent across files, README platforms matching the keyboard's targets, well-formed welcome and help HTML, the help page's layer list and page-name format, and welcome/help body parity — are checked, and each problem appears as a warning-level finding with a plain-language hint. None blocks output.

**Why this priority**: These rows are banded as enforced hygiene but nothing implements them today; the catalog promises checks it does not run. With stories 1–6 generating the content, these checks keep it honest, especially after the author edits. They come last because they verify rather than produce.

**Independent Test**: Produce a package, then hand-edit the working copy so HISTORY's top version disagrees with the keyboard version; confirm a single warning finding names the mismatch with a hint, and that download and submission still proceed.

**Acceptance Scenarios**:

1. **Given** a HISTORY.md whose top entry version differs from the keyboard's version, **When** validation runs, **Then** one warning finding names both versions and points at HISTORY.md.
2. **Given** README.md lists a platform the keyboard's targets do not include, **When** validation runs, **Then** one warning finding names the extra platform.
3. **Given** the welcome page body and help page body differ after normalizing whitespace and headers, **When** validation runs, **Then** one warning finding reports the parity break.
4. **Given** every documentation check passes, **When** validation runs, **Then** no documentation findings appear and the Output checklist shows no warnings.
5. **Given** a finding present in a base's own documentation before the author touched it, **When** validation runs on an adaptation, **Then** the finding is shown muted as an upstream finding, consistent with how other inherited findings are shown today.

---

### Edge Cases

- **Base ships both welcome conventions** (`source/welcome.htm` and `source/welcome/welcome.htm`): the folder-convention file wins for inheritance; the flat file is not carried into the output.
- **Base's package descriptor names a welcome file that does not exist** (the corpus has such cases): treated as "no base welcome page"; the classification reports minimal or none accordingly.
- **Base welcome page references images the base does not ship**: the page is inherited, the missing images are reported in the Output checklist as a warning, and the descriptor lists only files that exist.
- **Author's display name contains characters that need escaping** in the help-site page name or in HTML: rendered safely, as spec 061 already requires for free text.
- **Author changes the keyboard's version after confirming a HISTORY entry**: the proposal is re-derived and the heading follows the new version; the author's confirmed bullets are kept.
- **Keyboard has no touch layout**: only desktop layer charts are generated; the welcome page's layout section lists only those.
- **Keyboard has only a touch layout target** (no desktop): only touch charts are generated.
- **Very large layer count** (a touch layout with many layers): charts are generated for every layer; the welcome page groups them under the layout section without omission.
- **Base already has images with unrelated names** (Track 2): base images are preserved by their own names; generated charts use distinct, predictable names so they never overwrite a base image.
- **Early download before the help-docs step**: all six members ship (placeholders where needed), the help page still has its header, the welcome page is still in the folder location, and the checklist marks placeholders.

## Requirements *(mandatory)*

### Functional Requirements

**Always-complete member set**

- **FR-001**: Every produced package MUST contain all six documentation members: `README.md`, `HISTORY.md`, `LICENSE.md`, `source/readme.htm`, `source/welcome/welcome.htm`, and `source/help/<id>.php`, regardless of which base (if any) the keyboard started from and regardless of how far the author has progressed.
- **FR-002**: The welcome page MUST be written at `source/welcome/welcome.htm`; the package descriptor MUST name the welcome file by that folder path and MUST list the welcome page and every image file in `source/welcome/` in its file list. A flat `source/welcome.htm` MUST NOT appear in the output.
- **FR-003**: A help page that is not inherited from a base MUST begin with the standard help-site header used by published keyboards — a page name derived from the keyboard's display name in the form "<Display Name> Keyboard Help", a page title equal to the page name, and the shared header include — followed by the documentation body. An inherited help page keeps its own header and is never given a second one.
- **FR-004**: The documentation body shared between the welcome page and the help page (spec 061 FR-005) MUST remain identical after this feature; the help-site header and the welcome page's layout section are the only permitted differences.

**Content tiers**

- **FR-005**: Each documentation member's content MUST be filled from the highest-priority available source in this order: (1) facts derived from the keyboard itself; (2) content inherited from the base; (3) content authored in the help-docs step. Derived facts MUST always be applied even when tiers 2 and 3 are empty, so a package with no base and no answers is still internally consistent (names, language, platforms, links, holder).
- **FR-006**: On an adaptation (Track 2), the system MUST inherit from the base its welcome page (found under either the folder or the flat convention), the images beside it, its help page body, its README description, and its HISTORY entries, and MUST append the author's answers to inherited prose rather than replacing it.
- **FR-007**: On a copy (Track 1), the system MUST inherit only the base's welcome images and page skeleton; none of the base's descriptive prose (welcome body, help body, README description, HISTORY bullets) MAY appear in the produced documentation.
- **FR-008**: At base selection, the system MUST classify each base's documentation as none, minimal, or full, from which documentation members the base ships and whether the welcome page or help page carries more than a stub, and MUST show that classification to the author before they commit to the base.
- **FR-009**: In the help-docs step, the description question MUST be required only when no usable base description is available under the inheritance rules (net-new, copy, or a base classified none). When a usable base description exists on an adaptation, it MUST be proposed for confirmation and the author MUST be able to accept, edit, or replace it in a single action.

**HISTORY**

- **FR-010**: The system MUST propose a first HISTORY entry built from the recorded changes to the working copy — at minimum the base it started from (when any), characters added, and mechanisms chosen — under a heading whose version matches the keyboard's version and whose format satisfies the criteria for HISTORY entries.
- **FR-011**: The author MUST be able to confirm, edit, or dismiss the proposed entry; a dismissed proposal leaves the existing stub in place and the Output checklist marks HISTORY as placeholder.
- **FR-012**: When the keyboard was adapted from a published keyboard, the produced HISTORY entry MUST contain the "Adapted from" attribution bullet regardless of the author's edits (criterion 19.2), and prior entries inherited from the base MUST be preserved below the new entry (criterion 3.4).

**Layout charts**

- **FR-013**: The system MUST generate one layout chart image per layer of the keyboard (desktop layers from the visual keyboard and rule outputs; touch layers from the touch layout) into `source/welcome/`, reference each from a "Keyboard Layout" section of the welcome page, and list each in the package descriptor.
- **FR-014**: Chart generation MUST be deterministic: producing the same keyboard twice MUST yield byte-identical chart files. Charts MUST be produced from the keyboard model, never by capturing the on-screen keyboard preview.
- **FR-015**: When a base ships its own layout images, the system MUST keep them and MUST NOT replace them with generated charts unless the author opts to regenerate; generated charts MUST use names that cannot collide with a base's images.
- **FR-016**: Every key on a chart MUST be drawn legibly: combining marks on a dotted-circle carrier, characters with no available glyph as their code point, and a visibly distinct treatment for keys that produce nothing on that layer.

**Visibility of gaps**

- **FR-017**: The Output step MUST show a documentation checklist listing each of the six members with its source tier (derived, inherited, authored) and a placeholder marker for any member whose content is still the fallback stub; each placeholder row MUST offer a way to the step that supplies its content.
- **FR-018**: No documentation gap or documentation finding MAY block download or community submission; the checklist and findings are informational.
- **FR-019**: The following criteria rows MUST be implemented as Layer C checks producing warning-level findings with plain-language hints: 3.3 (most recent HISTORY entry at top), 3.4 (HISTORY cumulative), 3.5 (HISTORY entry format), 3.6 and 7.1 (top HISTORY version matches the keyboard version), 3.7 (HISTORY bullets reference no deleted files), 4.7 (copyright holder identical across LICENSE, source, descriptor, README, HISTORY), 5.7 (README platforms match targets), 11.5 (welcome and help HTML well-formed), 11.6 (help page layer list matches the keyboard's layers), 11.7 (help page name format), 11.9 (welcome/help body parity), 11.10 (welcome/help style parity). Each MUST run inside the existing validation cycle, not on a new timer.
- **FR-020**: A documentation finding already present in a base's own files before the author edited them MUST be shown as an upstream finding, using the existing muted treatment for inherited findings.

**Survey surface and provenance**

- **FR-021**: Every new user-facing survey surface this feature adds — the base documentation classification at base selection, the adaptive description proposal in the help-docs step, the HISTORY proposal, and the Output documentation checklist — MUST be declared in the step manifest with its typed inputs and writes, and every write to the working copy MUST route through the existing mutation seam.
- **FR-022**: Every documentation member MUST carry, in the working copy, a record of which tier supplied its current content, so the Output checklist and the upstream-finding rule (FR-020) read one source of truth rather than re-deriving it.
- **FR-023**: Regenerating documentation on every production (spec 061 FR-010) MUST continue to hold for all six members, including the welcome folder contents and the help-site header, so an edited answer, a changed version, or a changed layout is reflected in the next package.

### Key Entities

- **Documentation member**: one of the six files a package ships; has a path, a current content, a source tier, and a placeholder flag.
- **Source tier**: where a member's current content came from — derived (from the keyboard), inherited (from the base), or authored (help-docs step). One member may combine tiers (inherited body plus authored appendix); the recorded tier is the highest-priority tier that contributed prose.
- **Base documentation profile**: the none / minimal / full classification of a base, with the list of documentation members the base ships and the welcome convention it uses.
- **Welcome folder**: `source/welcome/` — the welcome page plus every image beside it, whether inherited or generated; every entry is listed in the package descriptor.
- **Layout chart**: a generated image for one (platform, layer) pair, named predictably, produced deterministically from the keyboard model.
- **HISTORY proposal**: a drafted entry (version heading plus bullets) derived from the recorded changes, with the author's confirmation state (proposed, confirmed, edited, dismissed).
- **Documentation finding**: a warning-level Layer C finding for one criteria row, with location, hint, and origin (authored or upstream).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of produced packages contain all six documentation members, measured across a net-new keyboard, a Track 1 copy, and a Track 2 adaptation of each of a flat-convention base, a folder-convention base, and a base with no documentation.
- **SC-002**: For every one of the 728 folder-convention bases in the corpus, adapting the base and producing a package preserves the base's welcome page and 100% of its images, each listed in the package descriptor (verified on the full corpus by an offline sweep, not a sample).
- **SC-003**: A net-new keyboard's help page carries the standard help-site header in 100% of productions, including early productions before the help-docs step.
- **SC-004**: Producing the same keyboard twice yields byte-identical documentation members and chart images in 100% of runs.
- **SC-005**: An author adapting a base classified full can complete the help-docs step in one confirmation action without typing a description.
- **SC-006**: At the Output step, every member's source tier and placeholder state is visible without scrolling or opening a secondary view, and both download and submission remain available in every checklist state.
- **SC-007**: All twelve documentation criteria rows named in FR-019 produce a finding on a deliberately broken fixture and no finding on a clean one; none of them blocks output.
- **SC-008**: Every generated chart draws every key legibly on a fixture containing combining marks, a character with no glyph in the fallback font, and an empty key.

## Assumptions

- Documentation is single-language per keyboard. Multi-language welcome page variants remain out of scope (spec §16 / constitution Article VII); the existing opt-in "documentation language" question continues to select the one language used.
- The help site supplies the shared header include; the tool emits the standard header block and does not attempt to bundle or emulate the include.
- Base documentation is read from the release tree the loader already fetches from; no new remote source is introduced. Where the base's package descriptor names a welcome file, that name is the first place to look, then the folder convention, then the flat convention.
- The "usable base description" test for FR-009 is: the base's welcome page or help page body, after removing the base's header and layout section, contains at least one paragraph that is not the tool's own placeholder text and is not solely a layout chart reference.
- The base documentation profile is computed from files the loader already sees for the selected base; it is not precomputed for the whole gallery unless doing so is cheap, and a base shown without a profile is treated as "unknown" rather than "none".
- Layout charts ship as image files in a format the installed Keyman welcome viewer renders; whether that is a vector file directly or a rasterized form is a planning decision, constrained by FR-014's byte-identical requirement.
- Generated chart file names follow a fixed pattern derived from platform and layer identifiers, so they can never coincide with hand-authored base images, whose names are free-form.
- The recorded changes that seed the HISTORY proposal are those the working copy already tracks (base identity, deleted and added items, mechanisms applied); no new change journal is introduced.
- "Adapted from" attribution (criterion 19.2) and LICENSE.md content are unchanged by this feature; LICENSE.md is listed as a member for completeness and its existing generation is reused.
- The existing upstream-finding treatment (muted, excluded from the submit threshold until the file is touched) is reused unchanged for documentation findings.
- The engine team owns every change in this feature except the help-docs question wording and the checklist copy, which the content team owns.
