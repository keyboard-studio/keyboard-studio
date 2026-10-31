# Feature Specification: Privacy governance — Article XII in the constitution, a named owner, and gates that keep 095–099 true

**Feature Branch**: `spec/privacy-suite` (suite branch for specs 095–100; spec 101 joins the suite by amendment)
**Created**: 2026-10-14
**Status**: Draft — planning only. Suite source: `~/workspace/keyboard-studio-notes/privacy-gdpr-plan-2026-10-14.md` (§7, the drafted article text this spec adopts).
**Input**: Matthew's directive (2026-10-14): once the privacy policy work is done, the privacy guidelines need to be added to the constitution.

## Why this exists

Specs 095–099 build a notice, a record, two request procedures, and a breach runbook. Every one of them decays the same way the pre-cleanup spec corpus decayed: silently, by the next well-intentioned change that adds a store, a recipient, or (already planned — spec 101) an analytics SDK, written by someone who never heard of this suite. The repo's own history is the evidence: counts drifted, "single source of truth" claims contradicted the code for months, and nothing noticed until a dedicated audit.

The constitution is where this project puts rules that are meant to outrank convenience. Privacy belongs there for the same reason the state model does: the failure it prevents is not malice, it is an ordinary feature PR. This spec adds **Article XII — Privacy is a design constraint, not a page** (text pre-drafted in the privacy plan §7), names the owner role the other specs keep referencing, and wires the article into the two places features actually pass through: the spec/plan workflow and the annual review.

## Governing documents

- The constitution itself: v2 text (Arts. I–XI) is carried by open PR #2072 (`km/constitution-v2-ratify`) at spec time; the live constitution is v1.4.x (Arts. I–IX). This spec's article is numbered **XII against the v2 text**; if it lands before #2072 merges, it is rebased onto that branch — it MUST NOT be bolted onto the v1 text as a second, divergent privacy statement.
- Constitution Art. XI (done means integrated; status header = claim about code) — the article's model: the processing record is a checked fact in exactly Art. XI's sense.
- Specs 095–099 + 101: the machinery the article governs. The article states principles and gates; it MUST NOT restate their procedures (the anti-append lesson from the constitution v2 work: a second copy of a rule is a future contradiction).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Article XII is ratified as part of the constitution (Priority: P1)

The constitution gains Article XII with the six commitments drafted in the privacy plan: (1) the inventory is a checked fact — a change creating a store/recipient/purpose updates the record and notice in the same change; (2) minimise by construction — session-scoped identity, no user-profile store without amending the article, local-first default; (3) telemetry is anonymous or it does not run — no analytics/tracking without spec 101's design and the article's consent gate; (4) public means public, and is said first — permanence disclosed at the action surface, erasure promises limited to what we can perform; (5) requests are a feature — named owner, private intake, one-month discipline; (6) retention is a decision, not a default — every server store names its rule when created.

**Independent Test**: The merged constitution text contains the article with all six commitments; a reader comparing it against specs 095–099 finds principles pointing at the specs, and zero procedural detail duplicated from them.

### User Story 2 — A feature that touches personal data meets the gate in its plan, not in review (Priority: P1)

The spec-kit planning flow gains a privacy checkpoint: any spec/plan whose work creates a store, sends data to a new recipient, collects a new category, or adds telemetry MUST carry a short "Personal data" section in its plan answering: which record rows change, what the retention rule is, what the notice diff is, which DSAR/erasure map entries change. A plan with no personal-data impact states that in one line — the checkpoint is a question always asked, not a form always long.

**Independent Test**: Take the next three real feature plans after this lands; each contains the section (substantive or one-line-nil); a simulated plan adding a server store without the section is caught at the checkpoint in review.

### User Story 3 — The owner role exists, is named, and has a calendar (Priority: P1)

A privacy owner is named in `docs/privacy/` (the role, and the current holder — a person, not a team alias nobody reads). The role carries: the DSAR/erasure register's weekly review while rows are open (specs 097/098), the breach runbook's owner duties (spec 099), and an **annual privacy review**: re-verify the record against the code (the spec-096 coverage check plus a human read), re-check processor terms/retention facts, re-run one DSAR dry-run and one breach tabletop scenario, and refresh the notice's date if anything moved. The annual review produces a short written outcome in `docs/privacy/` — done, with findings, is a record; silence is not a review.

**Independent Test**: The annual review checklist exists; its first execution is this suite's own dry-runs (097 FR-010, 099 FR-008) recorded as review #1, so the calendar starts from evidence, not from a promise.

### User Story 4 — The muse-triage / review machinery knows the gate (Priority: P2)

The automated review sweep's checklist for PRs gains the privacy flag: a diff touching `api/`, storage SDKs, `utilities/oauth-backend`, identity code, or adding a network SDK is flagged for the privacy checkpoint (record + notice updated, or the one-line nil), the same way coverage and security flags already work. The flag asks the question; a human still answers it.

**Independent Test**: A test PR adding a dummy `api/` store without a record update is flagged; a test PR with the record update is not.

## Requirements

### Functional Requirements

- **FR-001**: Article XII MUST be added to the constitution (v2 text, via or on top of PR #2072) with the six commitments from the privacy plan §7, edited only for constitution register — no commitment dropped without Matthew's ruling recorded in this spec.
- **FR-002**: The article MUST reference the operational documents by name (processing record, privacy notice, DSAR/erasure procedures, breach runbook) without restating their content.
- **FR-003**: A privacy owner MUST be named (role + current holder) in `docs/privacy/`, and specs 097/098/099's references to "the privacy owner" MUST resolve to that page.
- **FR-004**: The plan template / planning checklist used by the spec workflow MUST gain the "Personal data" checkpoint (User Story 2), including the one-line-nil form.
- **FR-005**: An annual privacy review MUST be instituted with the User Story 3 checklist, a written outcome filed in `docs/privacy/`, and the first review executed as part of this suite's landing.
- **FR-006**: The review-automation flag (User Story 4) MUST be added to the triage/review checklist; its absence MUST NOT block PRs until it has run clean for one full suite cycle (flag-first, gate-later — the repo's established adoption pattern for new checks).
- **FR-007**: Governance text MUST record how this article itself changes: by the constitution's normal amendment rule (surveyable proposal, Matthew's ratification), and a change to any of the six commitments MUST be accompanied by the corresponding spec/record updates in the same change.

### Edge Cases

- PR #2072 (constitution v2) is still open at spec time: if it stalls, this spec does not fork the constitution — implementation waits or stacks, and the article text lives in this suite meanwhile (as it already lives in the plan). Two constitutions is the one outcome this spec exists to prevent.
- The owner role and a single-person project: where the owner is also the only maintainer, the article's duties still apply as written — the register and log are what make a one-person operation auditable, including by that person's future self.

## Success Criteria

- **SC-001**: The ratified constitution contains Article XII; `grep` of the ratified text for the six commitments' key phrases returns all six.
- **SC-002**: The first annual review is filed with dated outcomes for every checklist item, including the two rehearsals.
- **SC-003**: Within the first quarter after landing, zero merged PRs touched the flagged surfaces (`api/`, storage, identity, network SDKs) without either a record/notice update or the one-line-nil in their plan — measured by sampling the quarter's merges, not by assertion.

## Design decisions

- **Principles in the constitution, procedures in specs** — the split the v2 constitution work already established (Art. X states the defaults doctrine; specs carry mechanics). Duplicating procedure into the constitution would create the two-copies problem the anti-append rule exists to kill.
- **The gate is a question in the plan template**, not a new approval board: this project's velocity comes from plans being honest early; the checkpoint spends one paragraph to save a retrofit.
- **Flag-first for automation** (FR-006): consistent with how muse-triage and the coverage checks earned trust — observe, then enforce.

## Out of scope

- Any change to the substance of specs 095–099/101 — this spec governs their upkeep, not their content.
- Organisational appointments beyond the owner role (no DPO is required for this processing profile; if the profile changes — e.g. large-scale monitoring via analytics (spec 101) at real scale — the annual review must re-ask the question, and FR-005's checklist includes it).

## Sequencing

Last to land, first to matter: the article can be ratified as soon as the documents it names exist in draft (this suite), and MUST be ratified before spec 101's analytics is implemented — analytics is the first real test of the gate, and it should meet the gate standing up.
