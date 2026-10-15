# Feature Specification: Erasure — delete what we hold, say plainly what we cannot, and prove both

**Feature Branch**: `spec/privacy-suite` (suite branch for specs 095–100)
**Created**: 2026-10-14
**Status**: Draft — planning only. Suite source: `~/workspace/keyboard-studio-notes/privacy-gdpr-plan-2026-10-14.md` (§5.3).
**Input**: Matthew's directive (2026-10-14): a deletion-request policy that we actually follow. Intake and contact route as ruled for spec 097.

## Why this exists

Erasure is where privacy programmes usually become theatre: a policy that says "we delete your data" over a system that can't, or won't say which parts it can't. Keyboard-studio has an unusually honest shape available, if the work is done:

- **Server drafts are fully deletable today in pieces** — a per-draft DELETE exists (`DELETE /drafts`, client `packages/studio/src/lib/serverDraftStore.ts`) — but there is no delete-*everything* path, no owner-executed purge for a requester who can't or won't use the UI, and no confirmation record.
- **Crash reports** are identity-redacted by design (spec 060), so for most reports there is no personal data to erase — but "most" is doing work in that sentence: free-text error messages and breadcrumbs can carry identifying content, and a retraction endpoint exists (`api/report/crash-retract.ts`) for the immediate window only.
- **Submissions are the hard limit**: a merged keyboard carries the author's name/email in upstream git history (`keymanapp/keyboards`), which this project cannot rewrite. Art. 17(2)'s standard — reasonable steps, honestly described — is the only truthful promise, and spec 095 already discloses it before submission. This spec builds the steps.

A deletion policy that doesn't distinguish those three cases is boilerplate. This spec is the three cases, engineered and written down.

## Governing documents

- GDPR Art. 17 (grounds 17(1), exceptions 17(3), the public-data duty 17(2)), Art. 12 (clock, shared with spec 097), Art. 19 (notify recipients of erasure where applicable).
- ICO guidance on the right to erasure — the right is conditional, and a partial erasure with explained grounds is compliance, not failure.
- Spec 060 (crash-report retraction machinery and its limits), spec 096 (retention rows this spec executes early, on request), spec 097 (shared intake, register, verification, clock).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Delete everything, self-service, in one action (Priority: P1)

A signed-in user finds "Delete all my server data" next to the spec-097 export, confirms with the gravity the action deserves (it names what will go: every server draft, payloads and metadata), and it happens: Blob objects and Postgres rows for their GitHub user id are gone, verifiably, in that session.

**Independent Test**: Seed an account with three drafts (one marked submitted); delete-all; the drafts API lists zero; direct store inspection shows no blobs and no rows for that user id; another user's drafts are untouched.

**Acceptance Scenarios**:

1. **Given** a draft marked `submitted` with a `pr_url`, **When** its author deletes all server data, **Then** the server copies are deleted like any other — submission status is a fact about a public PR, not a retention claim on our store — and the confirmation says the public PR itself is untouched (User Story 3).
2. **Given** the confirmation dialog, **When** the user reads it, **Then** it separates the three cases in plain words: *deleted now* (server drafts), *never left your device* (local drafts, with the in-app way to clear them), *public and not ours to retract* (submissions; crash reports already anonymous).

### User Story 2 — A requester who can't use the UI still gets deleted (Priority: P1)

An erasure request arriving through spec 097's intake (account deleted, account inaccessible, or simply a requester who asks) is executed by the privacy owner against the same machinery: an owner-side purge keyed by verified GitHub user id/login, producing a completion record the owner sends the requester, itemised per the three cases.

**Independent Test**: File a test erasure request through the advisory route for an account with seeded drafts; the owner executes the purge from the written procedure; stores verify empty; the requester receives the itemised confirmation within the Art. 12 clock; the register (spec 097) closes the row with the execution record attached.

### User Story 3 — The public-data case is handled as reasonable steps, documented (Priority: P2)

For name/email in merged upstream history and any identifying content in a public crash issue, the owner works a written playbook: what we control (our repos: edit/close/redact the crash issue; use 060's retraction where in window), what we can only request (upstream `keymanapp/keyboards` history — a request to the Keyman team with the author's own request relayed), and what cannot be done (rewriting merged public git history) — each step attempted, dated, and reported to the requester, including the failures.

**Independent Test**: Walk the playbook against a seeded crash issue containing planted identifying text; the issue ends redacted/closed, the log shows each playbook step with its date and outcome, and the requester-facing summary matches the log.

### User Story 4 — Grounds are checked before deletion, refusals are rare and recorded (Priority: P2)

Before executing, the owner checks the Art. 17(1) ground and any 17(3) exception. For this project's data the expected answer is almost always "delete"; where an exception is claimed (e.g. data needed for a live legal claim), the refusal is partial where possible, names the article and the review date, and is logged with the same rigour as a deletion.

**Independent Test**: The written procedure's decision checklist, applied to three scripted cases (plain delete; delete with public-history component; delete claimed under a legal-hold exception), produces the three correct routings without owner improvisation.

## Requirements

### Functional Requirements

- **FR-001**: A self-service **delete-all-server-data** action MUST exist for a signed-in user, deleting every draft payload (Vercel Blob) and metadata row (Postgres) for their GitHub user id, behind a confirmation that implements User Story 1 scenario 2's three-case wording.
- **FR-002**: An owner-executed purge MUST exist (admin path or scripted procedure against the same store layer, `api/drafts/_store.ts` pattern) that deletes by verified GitHub user id/login without requiring the requester's session, and MUST emit a completion record (what was deleted, counts, timestamp, executor).
- **FR-003**: Deletion MUST be real deletion: Blob object removed (not flagged), Postgres row removed (not soft-deleted). Post-deletion verification (list + direct read) MUST be part of both the self-service flow's tests and the owner procedure.
- **FR-004**: The erasure procedure MUST share spec 097's intake, identity verification, register, and one-month clock; a request MUST be worked as erasure even if phrased as access or as a general "remove me" (and vice versa).
- **FR-005**: A crash-report remediation path MUST be documented and executable: locate reports by requester where identifiable, redact or close issues carrying identifying content, use the spec-060 retraction endpoint where applicable, and record that identity-redacted structural reports are not the requester's personal data — with that distinction explained to the requester, not merely asserted internally.
- **FR-006**: A public-submission playbook MUST exist (User Story 3) with named steps, the upstream contact route, and a requester summary template that itemises deleted / not-personal-data / requested-upstream / cannot-be-removed, with reasons.
- **FR-007**: Every erasure — self-service, owner-executed, partial, or refused — MUST produce a record in the spec-097 register: date, route, verification, stores acted on, exceptions claimed (article + review date), confirmation sent.
- **FR-008**: Local-device data MUST be addressed honestly in every confirmation: the project cannot delete browser-local drafts or session data on the requester's device; the confirmation MUST include the exact in-app steps for the requester to clear them, and MUST NOT claim they were deleted by us.
- **FR-009**: Where erasure is executed, recipients the project controls MUST be acted on in the same operation (Art. 19 within our control): e.g. a crash issue we are asked to remediate is not left public while the register says "erased".

### Edge Cases

- Delete-all while a submission is mid-flight (managed-PR request in progress): the purge deletes stored drafts; the in-flight/public PR is the public case, and the confirmation says so — the flow MUST NOT imply it can recall a PR.
- A requester whose drafts exist under the legacy `default` single-draft slot (pre-multi-draft rows, `api/drafts/schema.sql` migration shape): the purge MUST cover rows by user id across all draft ids, including `default`.
- Erasure of an account that only ever used Google sign-in: no server drafts exist (drafts are GitHub-keyed); the correct fulfilment is a verified nil return plus local-data instructions — recorded as such, not treated as an error. The Gmail address itself was collected at sign-in and is held only in the requester's own session — the confirmation says so rather than claiming it was never collected.
- The **GitHub App connection** lives on GitHub's side of the relationship: we cannot disconnect it for the user. Every erasure confirmation for a GitHub user MUST include the exact GitHub settings path to revoke the App's connection, and MUST NOT list the connection among things "we deleted".
- Analytics events, once spec 101 is live: erasure extends to the requester's events via the pseudonymous-id mapping spec 101 requires, or spec 101's anonymity design (if events are genuinely anonymous, there is nothing to erase and the confirmation cites that design rather than implying a deletion happened).

## Success Criteria

- **SC-001**: In the spec-097 dry-run extended with erasure, seeded server data is verifiably absent from both stores within the same session the purge runs, and the itemised confirmation is sent within 5 business days.
- **SC-002**: A red-team check after the dry-run — searching Blob listings, the Postgres table, and public crash issues for the test identity — finds zero residual personal data in project-controlled stores.
- **SC-003**: The three scripted routing cases (User Story 4) are all routed correctly by an owner using only the written procedure.

## Design decisions

- **Delete-all is a product surface, not an admin favour** (FR-001): the right is exercised best where the data lives; the owner path (FR-002) exists for those who can't, not as the primary route.
- **No soft deletes, anywhere in this flow**: a `deleted_at` flag on personal data whose erasure was requested is a contradiction the ICO would see through; removal is removal, and the register — not the data — is the evidence it happened.
- **The confirmation is itemised by the three cases** because a flat "your data has been deleted" would be false in case three and misleading in case two; honesty about limits is the compliance position, per Art. 17(2)'s reasonable-steps standard.

## Out of scope

- Rewriting or force-pushing any public git history, ours or upstream's — stated as a limit, never attempted as a workaround.
- Deleting a user's GitHub/Google account or their forks — not ours to delete; the confirmation points the requester at the provider.
- Retention-driven automatic purges (spec 096's ruled mechanisms, if any) — this spec is request-driven erasure.

## Sequencing

Depends on spec 097 (intake, verification, register, clock — shared, built once) and spec 096 (the store map). The self-service surface (FR-001) pairs naturally with 097's export (FR-003 there): one "your data" surface offering export and delete together. Dry-runs are shared with 097 (its FR-010, extended by this spec's SC-001).
