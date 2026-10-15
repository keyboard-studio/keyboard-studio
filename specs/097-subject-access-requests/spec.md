# Feature Specification: Subject access requests — a private intake, a verified identity, a one-month clock, and a complete answer

**Feature Branch**: `spec/privacy-suite` (suite branch for specs 095–100)
**Created**: 2026-10-14
**Status**: Draft — planning only. Suite source: `~/workspace/keyboard-studio-notes/privacy-gdpr-plan-2026-10-14.md` (§5.2).
**Input**: Matthew's directive (2026-10-14): a data-request policy that we actually follow. Contact route ruled by Matthew 2026-10-14: private GitHub route.

## Why this exists

Today, a data subject access request (DSAR) against keyboard-studio would fail in the worst way — silently. There is no intake route, no owner, no register, and no clock discipline, while the ICO's position is that a request is valid **in any form, through any channel** (verbal, a public issue, a message — no form, no magic words) and the one-month clock starts on receipt. The realistic first DSAR for this project arrives as a GitHub issue saying "what data do you have on me?" and starts a legal deadline nobody notices.

The good news is structural: this project's server-side data map is short (spec 096's record: one Blob store, one Postgres table, public GitHub surfaces), the draft payload is already a portable JSON document, and identity is already anchored to a GitHub account the requester controls. A DSAR procedure here is mostly *discipline*, plus two pieces of tooling: a self-service export that makes the common case instant, and a register that makes the clock visible.

## Governing documents

- GDPR Art. 15 (right of access), Art. 12 (one month; +2 extension for complex/numerous requests with notice inside the first month; free unless manifestly unfounded or excessive), Art. 20 (portability — the draft JSON export satisfies it for user-provided data).
- ICO, *A guide to subject access* — recognising requests, proportionate identity checks, reasonable and proportionate search, secure supply. This spec follows it as the operational standard.
- Spec 096 (the record = the search map), spec 095 (the notice names this route), spec 098 (the sibling right; shared intake and register).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — A user can ask, privately, without legal vocabulary (Priority: P1)

From the privacy page, a user follows "request your data" to the private GitHub route (GitHub private vulnerability reporting on `keyboard-studio/keyboard-studio`, signposted per spec 095 FR-006), titles it a privacy request, and gets an acknowledgment that starts a tracked clock — without writing the words "subject access request" and without posting anything public.

**Independent Test**: A tester with only the privacy page as guidance files a request; it lands as a draft advisory visible only to maintainers and the requester; the register (User Story 3) gains a row dated the day of receipt.

**Acceptance Scenarios**:

1. **Given** a request arrives through *any* channel (advisory, public issue, direct message to a maintainer), **When** a maintainer recognises it as an access request, **Then** it is entered in the register with the **original receipt date** — the clock never restarts at triage.
2. **Given** a requester with no GitHub account, **When** they ask how to proceed, **Then** they are offered an alternative private channel for identity verification (the request is never refused for lacking the preferred channel).

### User Story 2 — The common case is self-service: export my drafts (Priority: P1)

A signed-in user can export everything the server holds for them — all draft payloads plus their metadata rows — as a single JSON download, without filing anything. Most access requests should end here, answered by the product rather than by a procedure.

**Independent Test**: Sign in, seed two server drafts, use the export; the download contains both full payloads and the metadata (login, keyboard ids, labels, saved-at, status, PR URLs) and nothing belonging to another user.

**Acceptance Scenarios**:

1. **Given** the export exists, **When** a formal DSAR is fulfilled for server-draft data, **Then** the fulfilled package is produced by the same export machinery (one code path, no hand-assembled copies).
2. **Given** a user who has only local drafts, **When** they export, **Then** the package says plainly that local drafts live in their browser and shows them how to view/export those locally — the answer never pretends the server copy is the whole story.

### User Story 3 — The owner works a register, not an inbox (Priority: P1)

The privacy owner (named in spec 100) works from a register: one row per request — received date, channel, verified identity, scope, due date, extension if any (with the date the requester was told), supplied date, outcome. The register lives where only maintainers can see it (the advisory threads themselves plus a private tracking record; it MUST NOT be a public file — the register is itself personal data).

**Independent Test**: File a test request; the register row exists within one business day; its due date is receipt + one calendar month; a weekly glance by the owner shows every open row and its remaining days.

### User Story 4 — Identity is verified by account control, proportionately (Priority: P2)

For GitHub-keyed data, the requester proves control of the GitHub account (they file from it, or sign in and show the in-app verification code the export/delete surface displays). No identity documents are requested for a free keyboard tool — the ICO's proportionality standard is the design, not an aspiration.

**Independent Test**: A request for another user's drafts, filed from a different GitHub account, is refused at verification with the refusal and its basis logged; the data is not disclosed.

## Requirements

### Functional Requirements

- **FR-001**: A documented intake procedure MUST exist: any maintainer who receives anything recognisable as an access request, in any channel, MUST register it the same day with the true receipt date and notify the privacy owner.
- **FR-002**: The private GitHub route (private vulnerability reporting on `keyboard-studio/keyboard-studio`) MUST be enabled and signposted (with spec 095) as the primary intake; the repo MUST carry a `SECURITY.md`/privacy signpost so the route survives outside the app.
- **FR-003**: A self-service export MUST be available to a signed-in user covering all their server drafts (payloads + metadata) as one JSON package, produced server-side under the same identity verification as the drafts API (`api/drafts/` pattern: server-verified GitHub identity per request).
- **FR-004**: A request register MUST be maintained with the fields in User Story 3, held privately, reviewed by the owner at least weekly while any row is open.
- **FR-005**: The fulfilment procedure MUST search exactly the spec-096 record's rows: server drafts (by GitHub user id), crash-report issues (noting they are identity-redacted by design), the requester's public submissions and crash issues on GitHub (by login), and platform logs insofar as Vercel makes them retrievable — and MUST record which rows were searched, including nil returns. Two rows get explicit treatment rather than a shrug: **sign-in identity** (Gmail address/name/picture, GitHub id/login and the App connection) is collected and processed but held session-side and not persisted server-side — the response says exactly that, including what the exchange processed, instead of claiming "we hold nothing about you"; and **analytics events, once spec 101 is live**, are searched by their pseudonymous id mapping — pseudonymous is personal data, and the response treats it so.
- **FR-006**: The response MUST include the data plus the Art. 15 supplementary information (purposes, bases, recipients, retention, rights, complaint route) — in practice the spec-095 notice plus a covering note naming anything requester-specific.
- **FR-007**: The clock discipline MUST be implemented as written procedure: respond within one calendar month of receipt; any extension (max +2 months, complex/numerous only) MUST be communicated to the requester within the first month with reasons, and logged.
- **FR-008**: Refusals and redactions MUST cite a named ground (manifestly unfounded/excessive; another person's data; an applicable exemption), be approved by the privacy owner, and be logged with the basis and the review/complaint routes told to the requester.
- **FR-009**: Responses MUST be delivered through a private channel to the verified requester only (the advisory thread or the in-app export), never in a public issue or PR.
- **FR-010**: A DSAR dry-run MUST be executed before this spec is marked done: a test account's request is worked end-to-end against the register and the clock, and the run is recorded (spec 096 SC-003 consumes the same run).

### Edge Cases

- A request that is really a deletion request wearing access words (or vice versa): register once, work both rights — the requester is never bounced to re-file (spec 098 shares intake).
- Requests about a *submitted keyboard's* authorship: the data is public by the author's own submission; the response supplies it and says where it lives, including the parts the project cannot alter (spec 098's limit).
- A requester who deleted their GitHub account: verification falls back to the alternative channel in User Story 1 scenario 2, with the owner applying judgement proportionate to a draft store — and the difficulty recorded, not used as a silent refusal.

## Success Criteria

- **SC-001**: The dry-run request is answered completely within 5 business days (internal standard, well inside the legal month), with the register showing receipt, verification, search, and supply.
- **SC-002**: The self-service export's contents match a direct database read for the test account, field for field — completeness is compared, not assumed.
- **SC-003**: A maintainer who has never seen the procedure, given only the written procedure and a mock request, registers and routes it correctly (the procedure is the product).

## Design decisions

- **Self-service first** (User Story 2): for a store this small, the honest DSAR system is a button; the procedure exists for what the button can't cover (public surfaces, logs, disputes about scope).
- **The register is private and boring**: a list with dates. Its existence and weekly review are the entire control; tooling beyond that is deferred until request volume says otherwise.
- **Account control as identity proof**: proportionate to data whose worst case is someone else's keyboard drafts; document-based ID would be both heavier than the risk and, per ICO guidance, hard to justify demanding.

## Out of scope

- Erasure execution (spec 098) — shared intake and register only.
- Charging for excessive requests — the Art. 12 fee power is noted in the procedure as available and expected to remain unused.
- Requests from regulators or courts — handled by the owner directly, outside this procedure.

## Sequencing

Depends on spec 096 (search map) and on private vulnerability reporting being enabled on the repo (an admin action, listed in spec 095 FR-006's signposting work). Spec 095's page may publish its rights section once this intake is live. Shares its register and dry-run with spec 098.
