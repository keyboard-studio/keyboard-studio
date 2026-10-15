# Feature Specification: Processing record & retention — one maintained inventory of what we hold, and a decided lifetime for every store

**Feature Branch**: `spec/privacy-suite` (suite branch for specs 095–100)
**Created**: 2026-10-14
**Status**: Draft — planning only. Suite source: `~/workspace/keyboard-studio-notes/privacy-gdpr-plan-2026-10-14.md` (§3 inventory, §4 gaps).
**Input**: Matthew's directive (2026-10-14): implement a privacy policy and actually follow it. This spec builds the factual backbone the other five specs stand on.

## Why this exists

No document in the repo records what personal data keyboard-studio processes. The inventory had to be reverse-engineered from code for the privacy plan, and it contained a surprise even for the project: the deciding fact about several stores is that **nobody ever decided their retention**:

- Server drafts (Vercel Blob payload + Postgres metadata, `api/drafts/_store.ts`, `api/drafts/schema.sql`) — kept until the user deletes them, by default, not by decision. No TTL, no inactivity rule, no statement.
- Crash-report issues (`keyboard-studio/crash-reports`) — public; ruled permanent as the project's bug record on 2026-10-14 (see Open rulings).
- Platform request logs — whatever Vercel's defaults are; never examined.

GDPR Art. 30 requires a record of processing activities; Art. 13 requires the retention period *or the criteria for determining it* to be stated to users. "Until the user deletes it" is a lawful criterion — but only once it is chosen and said (spec 095 says it; this spec chooses and maintains the underlying record). The second failure mode this spec prevents is drift: the next store someone adds (the next `api/` route, the next SDK) silently invalidating the published notice. This repo already knows that failure mode from spec-trace and the gate-coverage registry; the same medicine applies.

## Governing documents

- GDPR Art. 30 (records of processing), Art. 5(1)(c)/(e) (minimisation, storage limitation), Art. 28 (processor terms — Vercel/GitHub/Google DPAs are accepted at the platform level and recorded here, not renegotiated).
- Constitution Art. XI (a status claim is a claim about code) — the record is a checked fact, and §FR-005 gives it a check.
- Spec 060 (crash reporting) — the fingerprint/label machinery whose issues are a retention row here.
- Spec 100 — makes "a new store updates this record in the same change" a constitutional gate; this spec builds the record and the check that gate leans on.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — A maintainer can answer "what do we hold on this person, and for how long?" from one document (Priority: P1)

The record lists every processing activity with: data categories, purpose, lawful basis, location/store, processor, retention rule, and the deletion mechanism that executes it. It is the same table the privacy plan produced from code, now living in the repo as `docs/privacy/processing-record.md` and kept true.

**Independent Test**: Pick any row; trace it to code (store, endpoint, or pipeline) and to the privacy page (spec 095). Every row traces both ways; every store in code appears as a row.

**Acceptance Scenarios**:

1. **Given** the record, **When** a DSAR arrives (spec 097), **Then** its search map is exactly the record's server-side rows — no additional hunting through code is needed to know where data lives.
2. **Given** a proposed change adding a server-side store, **When** the change is reviewed, **Then** the record diff is part of the change (FR-004) and the coverage check (FR-005) fails without it.

### User Story 2 — Every store has a decided retention rule, and the rules execute (Priority: P1)

Each row's retention is one of: a period, an event (user deletes; account inactivity threshold if ruled), or a stated platform default that has actually been read. Where execution is automatic (a purge), it runs and is observable; where execution is the user's own delete action, the rule says so and spec 098 guarantees the action exists and works.

**Independent Test**: For each server-side row, either (a) run/inspect the purge mechanism and observe it delete an aged test record, or (b) follow the user-facing delete path and observe the row and blob gone.

### User Story 3 — Crash-report retention is a decision with a mechanism, not a default (Priority: P2)

Crash issues are the project's bug record, but they are also indefinite public retention of (identity-redacted) user-context data. The ruled rule (2026-10-14): they are retained permanently as that record, the retention is justified in the processing record, and the annual review (spec 100) includes a residue pass — the year's crash issues scanned for personal data in free-text fields, any offender scrubbed or deleted via the existing label/fingerprint machinery so dedupe keeps working; the retraction endpoint remains the on-request path.

**Independent Test**: Given a crash issue the residue pass (or a retraction request) finds to contain personal data, acting on it (scrub or delete) does not break fingerprint dedupe for a recurrence (a recurrence reopens/creates correctly).

## Requirements

### Functional Requirements

- **FR-001**: A processing record MUST exist at `docs/privacy/processing-record.md` covering, at minimum, the verified activities: local drafts; server drafts (Blob + Postgres rows described separately); GitHub sign-in **including the GitHub App connection requested on the user's account and the id/login verification reads**; Google sign-in **including the Gmail address, name and picture collected through the exchange** (collection recorded as processing in its own right, with the session-scoped retention stated separately — the row MUST NOT describe identity collection as negligible because it is not persisted); crash reports; managed-PR submission; Option A submission; hosting/platform logs; plus a "no personal data" note for Crowdin strings, and pre-registered "not yet live" rows for the managed-PR throttle store (see Edge Cases) and for **product analytics (spec 101)** so both have names waiting before they land. Each row: categories, purpose, lawful basis, store/location, processor, retention rule, deletion mechanism, DSAR search hint.
- **FR-002**: Every server-side store MUST carry a retention rule in the record that is either a period, a user-controlled event, or a platform default cited from the processor's current documentation (with the check date recorded — platform defaults change).
- **FR-003**: Retention rules that require execution MUST have an execution path: a scheduled purge (drafts, if ruled), a periodic review list (crash issues), or the user delete path (spec 098). A rule with no path is a defect against this spec, not a note.
- **FR-004**: Any change that creates or alters a server-side store, an outbound personal-data recipient, or a processing purpose MUST update the record and, where user-visible, the spec-095 notice, in the same change.
- **FR-005**: An automated coverage check MUST exist in CI: it enumerates the server-side data surface (routes under `api/`, storage SDK imports — `@vercel/blob`, `@vercel/postgres` — and outbound identity/profile calls in `utilities/oauth-backend`) and fails if any enumerated item is not named in the record. The check is an enumeration-diff in the style of the gate-coverage registry cross-check, not a text search for the word "privacy".
- **FR-006**: The record MUST name each processor and where its DPA/terms live (Vercel, GitHub, Google), and MUST record the sub-processor-relevant platform facts relied on (e.g. Blob access is private; Postgres/Blob region if configurable).
- **FR-007**: Local-only processing (browser `localStorage` drafts, `sessionStorage` identity) MUST be recorded as such, with the explicit note that the project cannot access or delete it — the honest boundary specs 097/098 will state to requesters.

### Edge Cases

- The security-audit throttle work (Postgres-backed per-IP rate limiting on the managed-PR route, branch `km/security-audit-fixes`, unlanded at spec time) will, when it lands, create a new store of IP-derived data: FR-004/FR-005 exist precisely so that landing updates this record — the row is pre-registered in the record as "not yet live" so the check has a name waiting for it.
- Vercel platform logs are outside the app's control; the record states the platform's retention as read from Vercel's docs, re-checked at the spec-100 annual review.
- A draft marked `submitted` keeps a `pr_url` — retention of that row follows the draft rule, not the PR's permanence; the record keeps the two distinct.

## Success Criteria

- **SC-001**: The coverage check passes on the tree that ships this spec, and a deliberately planted unregistered store in a test branch makes it fail (the check is demonstrated, not asserted).
- **SC-002**: Every row's retention rule can be stated in one sentence and traced to an execution path; an audit sampling three rows finds zero "indefinite by silence" rows.
- **SC-003**: Spec 097's first DSAR dry-run (its SC) completes its search using only this record as the map.

## Design decisions

- **One table, in the repo, in Markdown** — proportionate Art. 30 compliance for a project this size; a register product or a database would be ceremony without a second reader.
- **Enumeration-diff over honour system** (FR-005): this project's own history (criteria counts, gate coverage) is that hand-maintained lists drift and computed cross-checks don't. The record is prose; its *completeness* is computed.
- **Retention defaults proposed, rulings flagged**: this spec proposed "drafts: until user deletes (stated), with an inactivity purge as an explicitly separate, later decision" and "crash issues: retained as bug record, reviewable after fix + 24 months". Crash retention was RULED 2026-10-14 (permanent bug record + written justification + annual residue review; the fix + 24-month deletion alternative was not taken). The drafts decision remains open — see Open rulings.

## Open rulings

- **Server-draft retention**: (A) until the user deletes them, stated plainly; (B) plus an inactivity purge (proposed 24 months untouched → notice → delete). A is sufficient and honest; B is better minimisation and more machinery (purge job + warning path).
- **Crash-issue retention**: RULED 2026-10-14 — keep permanently as the public bug record, with the justification written into the processing record and an annual personal-data residue review in the spec-100 checklist; the fix + 24-month deletion alternative was not taken.

## Out of scope

- Deleting anything (spec 098 executes erasure; this spec only decides and records lifetimes).
- Responding to requests (097/098).
- Choosing the controller identity (blocks 095, recorded there).

## Sequencing

First in the suite: 095 transcribes this record, 097's search map and 098's deletion map are this record read two ways. FR-005's check lands with the record, not after it.
