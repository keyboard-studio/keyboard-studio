# Feature Specification: Test-and-revise loop before publishing

**Feature Branch**: `094-test-and-revise`

**Created**: 2026-10-09

**Status**: Draft

**Input**: User description: "Test-and-revise workflow for sharing a keyboard with testers before publishing (GitHub issue #1804). Getting a keyboard to real people to test before publishing is a key step in keyboard authoring. Today an author can download the installable package or the source archive and pass it around by hand, but going back to fix the keyboard after testers report problems isn't practical, so testing is a dead end at the output step instead of a loop. Desired: test build -> testers report -> author revises the same working copy -> new test build -> publish."

**Governing spec**: [spec.md](../../spec.md) §11 (virtual FS and output), §16 (out of scope for v1: hosting, mobile-app integration), and the v1.3.0 working-copy spine composed in [docs/workflow-model.md](../../docs/workflow-model.md). Builds on navigation (spec 057, [AS-BUILT](../057-bulletproof-navigation/AS-BUILT.md)), the Output screen (spec 058), footer navigation (spec 081), documentation completeness and HISTORY entries (spec 080), and durable drafts.

## Clarifications

### Session 2026-10-09

- Q: How is a test build identified, given Keyman versions must be plain numbers? → A: Both. Each test build gets its own version number and a visible "Test build N" label. Every test-build version sorts below the version that will be published and above the version it replaces, so the published release is an upgrade for testers (FR-008, FR-008a).
- Q: Does the studio collect feedback from testers directly? → A: No. The studio holds the author's own notes about what testers reported, recorded against a build. Nothing tester-facing is built (FR-012).
- Q: May a test build be made from a keyboard that isn't ready to download? → A: No. A test build needs everything the normal download needs. Output names the blocking section and offers to open it (FR-004, FR-006).
- Q (planning): An adapted keyboard with a three-part version (for example 1.2.3) publishes as 1.2.4 today, and Keyman's package compiler allows at most three version parts, so no test version fits between them. About half the release corpus uses three-part versions. How are these numbered? → A: Bump the middle segment only when test builds were made. A three-part base that was tested publishes at 1.3.0 instead of 1.2.4, and its test builds are 1.2.4, 1.2.5, and so on. Untested keyboards and two-part bases publish exactly as today (FR-008a, FR-010).

## Context: what exists today

Recorded so this spec adds only what is missing.

- **Output** offers the installable package download (primary), the source archive download, and the managed pull-request submission. Downloads and submission are blocked while the touch layout is stale or characters still need placement, and the screen says why.
- **Going back**: an author on Output can already jump to any step they have visited (footer dots, the narrow-screen Contents menu, the Output tab). Answers are kept across leaving and returning. But after editing a step reached this way, the walk carries on forward and does **not** bring the author back to Output. Only jumps from the Decision trail return automatically, and they return to the Decision trail, not to Output. Full-page editing steps (character discard, deadkeys, rules, mechanisms, touch layout) never do. The phase strip is display-only, and Output has no list of sections to revise.
- **Versions**: there is no author-facing version. A new keyboard (copy track) ships at the copied keyboard's version, or 1.0 when it has none; an adapted keyboard's version is raised by one step at output, the same way every time. Nothing labels individual downloads.
- **The draft** survives downloads and sessions (local autosave, plus server sync when signed in). A successful managed submission freezes the project: it becomes read-only and can't be resumed. Re-submitting would open a new pull request rather than update the first.
- **Testers and feedback**: nothing in the studio refers to test builds, testers, or tester feedback.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Revise a section and come straight back (Priority: P1)

A tester reports that a key does the wrong thing. From the Output screen, the author picks the section that needs changing (for example "Rules" or "Touch layout") from a list of the keyboard's sections, makes the fix there, and is brought back to Output with one action. Nothing earlier in the walk has to be repeated.

**Why this priority**: This is the loop the issue describes as broken. Without it, every other story still ends in a dead end. It also helps authors who never share builds and simply notice a mistake late.

**Independent Test**: Starting on Output with a finished keyboard, open any section from the Output screen's section list, change something, choose "Back to testing", and land on Output with the change in the next download, without passing through any other step.

**Acceptance Scenarios**:

1. **Given** an author on Output, **When** they open the section list, **Then** they see every section of their keyboard they have already completed (identity, characters, deadkeys, rules, mechanisms, touch layout, help and metadata, as applicable to their track), each with a one-line summary of its current state.
2. **Given** an author who opened a section from Output, **When** they finish their edit and confirm, **Then** they return to Output, including from full-page sections (deadkeys, rules, mechanisms, touch layout, character discard), not just from survey questions.
3. **Given** an author who opened a section from Output, **When** they decide not to change anything, **Then** they can return to Output without the section recording a change.
4. **Given** an edit that makes a later section out of date (for example a desktop change that makes the touch layout stale), **When** the author returns to Output, **Then** Output names the out-of-date section and offers to open it, instead of only disabling the downloads.

---

### User Story 2 - Make an identifiable test build (Priority: P1)

The author makes a test build of the keyboard as it is right now. The download clearly says which test build it is, so when a tester writes back "build 2 types the wrong vowel", the author knows exactly which version of the keyboard the report is about. Making another test build after edits produces the next build, from the same working copy.

**Why this priority**: Feedback is only useful if it can be tied to a build. This and Story 1 together are the minimum test-and-revise loop.

**Independent Test**: Make a test build, edit a section, make another test build; the two downloads are labelled build 1 and build 2, and installing each shows its label to the person using it.

**Acceptance Scenarios**:

1. **Given** an author on Output with a keyboard that can be packaged, **When** they choose "Make a test build", **Then** they receive an installable package with its own test version number and a "Test build N" label, both visible to a tester after installing (the version in Keyman, the label in the package's name or description and on its welcome page).
2. **Given** an earlier test build, **When** the author makes another after editing, **Then** the new build's number is one higher, and it was produced from the same working copy with no re-import or restart.
3. **Given** a list of past test builds, **When** the author views it, **Then** each entry shows its number, when it was made, and which sections changed since the previous build.
4. **Given** test builds have been made, **When** the author later publishes, **Then** the published keyboard carries no test-build label, its version is decided as it is today (except for the three-part rule in FR-008a), and that version is higher than every test build's, so a tester's installed test build upgrades to the release.
5. **Given** test builds have been made, **When** the author closes the studio and comes back later, **Then** the build count and build list are still there.

---

### User Story 3 - Keep track of what testers reported (Priority: P2)

As reports come in (by email, chat or in person), the author notes each problem against the build it was found in, marks it fixed once they have revised the keyboard, and can see what is still open before deciding testing is done.

**Why this priority**: Useful for more than a handful of reports, but the loop works without it: an author can keep notes elsewhere.

**Independent Test**: Record two reports against build 1, mark one fixed, make build 2; the open report is still listed and the fixed one shows which build fixed it.

**Acceptance Scenarios**:

1. **Given** at least one test build, **When** the author records a report, **Then** it is stored with the build it was found in, and optionally the section it concerns.
2. **Given** a report that names a section, **When** the author opens the report, **Then** they can go straight to that section and come back (Story 1).
3. **Given** open reports, **When** the author makes a new test build, **Then** reports they marked fixed record the build that contains the fix.

---

### User Story 4 - Move from testing to publishing (Priority: P2)

When the author decides testing is done, they move on to publishing through the existing submission path. They are shown what they are about to publish (the last test build, plus any edits made since it) and any reports still open, so they publish knowingly.

**Why this priority**: The issue asks for a clear path from testing to publishing. Publishing itself already works, so this story adds a hand-over rather than a new path.

**Independent Test**: With two test builds and one open report, choose "Testing done, publish"; the screen states whether the keyboard has changed since the last test build and lists the open report before submission is offered.

**Acceptance Scenarios**:

1. **Given** test builds exist, **When** the author chooses to publish, **Then** they are told whether the keyboard has changed since the last test build.
2. **Given** open tester reports, **When** the author chooses to publish, **Then** the open reports are listed and the author confirms before continuing. Open reports do not block publishing.
3. **Given** the author publishes, **When** submission succeeds, **Then** the published files contain no test-build labels, build lists, or tester reports.

### Edge Cases

- **Packaging fails** for a test build (the same failure the installable download can hit today): no build number is used up, and the author is told why and pointed to the section involved where known.
- **The keyboard can't be packaged yet** (characters still need placing, the touch layout is stale): no test build. The same rules as the normal download apply, and Output names the blocking section and offers to open it (FR-004).
- **Two test builds with no edit in between**: allowed, so a lost file can be re-sent. The list shows the second as identical to the first.
- **Start over**: discarding the draft discards its test builds and reports with it, and the confirmation says so.
- **After a managed submission** the project is frozen today. Test builds and reports become read-only along with it. Testing a published keyboard's next version is out of scope here (see Assumptions).
- **Signed-in author on two devices**: build count and reports follow the draft's existing sync. If both devices make a build before syncing, they must not both claim the same number unnoticed.
- **Track 2 (adapt)**: an adapted keyboard's published version is already raised one step at output (for example 2.3 to 2.4). Its test builds must sort between the two (above 2.3, below 2.4), so neither the old release nor the new one is confused with a test build.
- **New keyboard (Track 1)**: it publishes at the copied keyboard's version (1.0 when there is none) under a new keyboard id, so nothing is replaced. Its test builds must sort below the published version.
- **Many test builds**: the version scheme must not run out or wrap (for example after build 9, 99 or 999).

## Requirements *(mandatory)*

### Functional Requirements

**Revising from Output (Story 1)**

- **FR-001**: Output MUST offer a list of the keyboard's sections the author has completed, each opening that section for editing.
- **FR-002**: A section opened from Output MUST offer one action that returns to Output once the author confirms or abandons their edit. This MUST work for full-page editing sections as well as survey questions.
- **FR-003**: Returning to Output MUST NOT require passing through any other section, and MUST keep every answer and edit made elsewhere.
- **FR-004**: When an edit leaves a later section out of date, Output MUST name that section and offer to open it (using FR-002's return).
- **FR-005**: Revising from Output MUST edit the same working copy. No re-import, restart, or second copy.

**Test builds (Story 2)**

- **FR-006**: Output MUST offer "Make a test build", producing an installable package of the current working copy. It is available exactly when the normal installable download is, with one exception: where no test version fits under FR-008a (a new keyboard published at 0.0 or 0.0.x, or a version that is not plain dotted numbers), the test build alone is unavailable and Output says why. Otherwise Output names the blocking section (FR-004).
- **FR-007**: Each test build MUST carry a build number, starting at 1 and rising by one per successful build of the same keyboard project.
- **FR-008**: Each test build MUST carry both (a) its own keyboard version number, which Keyman shows the tester, and (b) a "Test build N" label in the package's displayed name or description, on its welcome page, and in the downloaded file's name.
- **FR-008a**: Test-build versions MUST rise with each build and MUST sort strictly below the version the keyboard will be published at, and, for an adapted keyboard, strictly above the version it replaces. A new keyboard (Track 1) replaces nothing, so only the upper bound applies. The published release is then always an upgrade over every test build. The numbering scheme is set in [research.md](research.md) R1 against Keyman's version rules. Example: an adapted keyboard going from 2.3 to 2.4 gets test versions 2.3.1, 2.3.2, and so on. A three-part base (1.2.3) that has test builds publishes at 1.3.0, with test versions 1.2.4, 1.2.5, and so on.
- **FR-009**: The studio MUST keep a list of the project's test builds (number, date and time, sections changed since the previous build) that persists with the draft across sessions and devices, using the draft's existing persistence and sync.
- **FR-010**: Test-build versions, labels and the build list MUST NOT appear in a published submission or in the source archive. Publishing decides the version exactly as today, with one exception: an adapted keyboard whose base version has three parts and that has at least one test build publishes with its middle segment bumped (FR-008a).
- **FR-011**: A failed test build MUST NOT consume a build number.

**Tester reports (Story 3)**

- **FR-012**: The author MUST be able to record a tester report against a test build: free text, optionally the section it concerns, and a status (open or fixed). These are the author's own notes. The studio offers testers no way to submit reports, and nothing tester-facing is built.
- **FR-013**: A report naming a section MUST open that section with the FR-002 return.
- **FR-014**: When a test build is made, reports marked fixed since the previous build MUST record that build as containing the fix.
- **FR-015**: Reports MUST persist with the draft like the build list (FR-009), and be discarded with it on start-over.

**Hand-over to publishing (Story 4)**

- **FR-016**: Choosing to publish after test builds MUST state whether the working copy has changed since the last test build, and list open reports, before offering the existing submission. Open reports MUST NOT block submission.
- **FR-017**: The existing submission paths MUST be reused unchanged in behaviour, except that they ignore build labels and reports (FR-010).

**Cross-cutting**

- **FR-018**: All new author-facing text MUST go through the i18n catalog (en and fr) under spec 046's message-id rules.
- **FR-019**: New controls MUST follow the studio accessibility rules (spec 056): keyboard-operable, programmatically labelled, and announced through existing live regions.
- **FR-020**: Nothing in this feature may write to the host disk except the author's own downloads (spec §11).

### Key Entities

- **Test build**: one installable package made for testing. It has a build number, its test version, when it was made, a fingerprint of the working copy it was made from (to tell "changed since" and "identical"), and the sections changed since the previous build. It belongs to one keyboard project.
- **Tester report**: one problem the author records. It has text, the build it was found in, an optional section, a status (open or fixed), and the build that fixed it once known. It belongs to one keyboard project.
- **Keyboard project** (existing): the durable draft, which now also carries its test builds and reports.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From Output, an author can open any completed section, make one change, and be back on Output in at most 2 navigation actions beyond the edit itself, for every section type including full-page ones.
- **SC-002**: An author can go from "tester reported a problem" to "new test build downloaded" without repeating any step they didn't change. Measured on the copy and adapt golden walks: zero unchanged steps revisited.
- **SC-003**: For any two test builds of a project, a tester can tell which build they have installed without asking the author: the label is visible after installation in 100% of builds.
- **SC-004**: 0 published submissions contain a test-build version, label, build list, or tester report (checked against the submitted files).
- **SC-004a**: For every project, the published version is higher than every test-build version made for it, so 100% of testers' installed test builds upgrade to the release.
- **SC-005**: Test builds and reports survive closing and reopening the studio in 100% of cases where the draft itself survives.
- **SC-006**: In a moderated test with first-time authors, at least 4 of 5 complete one full loop (build, record a report, revise, rebuild, publish hand-over) without help.

## Assumptions

- **Sharing is download-based.** The author shares the test build file themselves (email, chat, USB). A hosted shareable link would need hosting, which spec §16 puts out of scope for v1.
- **Testers install with Keyman as usual.** Nothing tester-side is built here, and mobile-app integration stays out of scope (spec §16).
- **Testing a keyboard after it has been published**, revising the project once it is frozen, and updating an existing pull request (the open "second-submission" question in [docs/github-integration.md](../../docs/github-integration.md)) are out of scope. This feature covers testing before the first publish.
- **Which edits make a later section out of date** is decided by the existing staleness rules,
  not by this feature. Today only a mechanisms edit marks the touch layout stale; carve,
  deadkeys and rules edits do not. FR-004 names whatever those rules report, and widening them
  is out of scope ([research.md](research.md) R5).
- **Editing the raw `.kmn` on Output** stays as it is. A test build includes whatever is in the working copy.
- **No new survey questions** are introduced. If planning finds one is needed, it MUST be declared in the decision registry (provides/requires, `gatedBy` where conditional) per constitution Article IX.
- **Who owns it** (spec §12): Engine owns the SPA, output paths and persistence parts. Content owns the new author-facing wording.
