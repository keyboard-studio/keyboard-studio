# Feature Specification: Breach response — a 72-hour runbook for the stores we actually have, rehearsed before it is needed

**Feature Branch**: `spec/privacy-suite` (suite branch for specs 095–100)
**Created**: 2026-10-14
**Status**: Draft — planning only. Suite source: `~/workspace/keyboard-studio-notes/privacy-gdpr-plan-2026-10-14.md` (§5.4).
**Input**: Matthew's directive (2026-10-14): implement a privacy policy and actually follow it. A policy without a breach procedure fails exactly once, at the worst moment.

## Why this exists

Keyboard-studio holds other people's unpublished work in a Vercel Blob store and a Postgres table, behind credentials that live in environment variables (`BLOB_READ_WRITE_TOKEN`, `POSTGRES_URL`, GitHub App keys, OAuth secrets). The realistic breach scenarios are mundane, not cinematic: a leaked env secret, a mis-scoped token, a Blob URL-handling bug making "private" drafts readable, a maintainer account compromise. The project's own security audit (2026-10-05) already produced findings in exactly this neighbourhood — and its fixes for the managed-PR route (tree-path confinement, throttling) sit on an unlanded branch, which is what an unrehearsed security posture looks like.

GDPR Art. 33 gives **72 hours from becoming aware** to notify the supervisory authority where a breach is likely to risk individuals' rights, Art. 34 requires informing affected people without undue delay at high risk, and Art. 33(5) requires documenting **every** breach, notified or not. None of that is achievable inside 72 hours by improvisation from a standing start, by a project whose responders are maintainers doing this alongside everything else. The deliverable of this spec is small on purpose: a runbook, a private log, named roles, and one rehearsal.

## Governing documents

- GDPR Art. 33 (72-hour authority notification; phased notification permitted with reasons), Art. 34 (individual notification at high risk), Art. 33(5) (documentation of all breaches).
- ICO, *Personal data breaches: a guide* — the at-a-glance standard this runbook follows: recognise, contain, assess risk, notify, record.
- The keyboard-studio security audit (run-1, 2026-10-05) and its fix branch `km/security-audit-fixes` — known-weak surfaces the runbook's scenarios are drawn from.
- Spec 096 (the record: what stores exist is what a breach can expose), spec 100 (the owner role and the annual rehearsal duty).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Any maintainer can start the clock correctly (Priority: P1)

A maintainer who suspects a breach (a draft blob reachable without auth, a secret in a commit, a stranger's drafts visible in the UI) finds the runbook from the repo root's security signpost, and within 30 minutes has: contained the obvious hole or escalated to who can, notified the privacy owner and the incident lead, and opened the breach log entry with the awareness timestamp — because "became aware" is when the legal clock started, and it is recorded before anything else is debated.

**Independent Test**: Tabletop exercise with a scripted scenario and a maintainer who did not write the runbook: the log entry exists with a correct awareness time, the owner is notified, and the first containment action named matches the scenario's store — using only the runbook.

### User Story 2 — The notification decision is a decision tree, not a vibe (Priority: P1)

Within the 72-hour window, the incident lead works the runbook's assessment: what store, whose data, how many people, sensitivity (unpublished creative work + GitHub identities; no special-category data anywhere in the inventory — a fact that materially lowers, and honestly bounds, the risk picture), likelihood of misuse, containment state. The tree ends in one of three recorded outcomes: notify authority + individuals; notify authority only; do not notify — each with the reasoning written in the log. If facts are incomplete at 72 hours, the runbook directs a phased notification with reasons rather than a late complete one.

**Independent Test**: Three scripted scenarios (public Blob exposure of drafts; OAuth secret committed and rotated within the hour with no evidence of use; crash-report issue accidentally containing a user's email) are each routed to the defensible outcome by the tree, with the routing reasoning captured.

### User Story 3 — Affected users hear it from us, plainly, in time (Priority: P2)

Where the tree says individuals are at high risk, affected users are informed without undue delay through the channels that exist (the private GitHub route in reverse — maintainers can reach GitHub identities via the affected accounts' public contact surfaces and via an in-app notice on next sign-in), with the Art. 34 content: what happened, likely consequences, what we've done, what they can do, who to contact. The runbook carries a pre-drafted template so nobody writes this copy during an incident.

**Independent Test**: The template, filled from a tabletop scenario, contains every Art. 34 element and no minimising language ("we take security seriously" is not an element).

### User Story 4 — Every breach, notified or not, is in the log (Priority: P1)

A private breach log (maintainer-only location, named in the runbook — e.g. the private tracking space specs 097/098 use for the register, never a public repo) holds one entry per incident: awareness time, nature, store, approximate people/records, assessment, decisions + reasoning, notifications made (authority/individuals, times), containment and remediation, follow-ups with owners. An entry exists even for the incident that turned out to be nothing — the investigation's nil finding is recorded, closing the question.

**Independent Test**: After the tabletop, the log contains the exercise entry end-to-end; a later reader can reconstruct the incident and every decision from the entry alone.

## Requirements

### Functional Requirements

- **FR-001**: A breach runbook MUST exist at `docs/privacy/breach-runbook.md`, linked from the repo's security signpost (`SECURITY.md` or equivalent) and from the spec-096 processing record.
- **FR-002**: The runbook MUST name roles, not just steps: incident lead (decides, owns the clock), privacy owner (authority/individual notification, register liaison — the spec-100 role), and store operators for each system (Vercel dashboard: Blob/Postgres/env; GitHub: App keys, OAuth secrets, repo access). Where one person holds all roles today, the runbook says so and names the escalation if they are unreachable.
- **FR-003**: The runbook MUST contain per-store containment cards for the real surface: rotate `BLOB_READ_WRITE_TOKEN` / `POSTGRES_URL` and review Blob access; rotate GitHub App private keys and OAuth client secrets (`api/oauth/`, managed-PR and crash-report Apps); force-expire nothing that doesn't exist (sessions are client-side `sessionStorage` — the card states the honest consequence: tokens die with tabs, and GitHub-side revocation is the lever); review Vercel deployment/env change history.
- **FR-004**: The runbook MUST contain the assessment decision tree (User Story 2) keyed to Art. 33/34 thresholds, with the inventory's sensitivity facts pre-filled from spec 096 (what a draft store exposure does and does not contain).
- **FR-005**: The runbook MUST carry fill-in templates: authority notification (Art. 33(3) content), individual notification (Art. 34(2) content), and the breach-log entry.
- **FR-006**: A private breach log MUST be established with the User Story 4 fields; entries MUST be opened at awareness, not at conclusion.
- **FR-007**: The 72-hour rule MUST be stated in the runbook as hours from *awareness*, with the phased-notification instruction and the requirement to record reasons for any delay.
- **FR-008**: A tabletop rehearsal MUST be run before this spec is marked done, and MUST recur annually (owned by spec 100's review duty), rotating the scenario through the inventory's stores.
- **FR-009**: Post-incident, the runbook MUST require a follow-up entry in the relevant system's own tracking (issue/spec) for remediation that outlives the incident, linked from the log — incidents close when remediations land, not when notifications send.

### Edge Cases

- A breach at a *processor* (Vercel or GitHub incident exposing our stores): the clock still runs from our awareness; the runbook's card covers demanding the processor's incident facts and recording their notification to us (Art. 33(2) makes the processor's duty to inform us without undue delay — the card names where we'd hear it).
- A false alarm (a "public draft" that was the reporter's own, via their own session): still logged, closed as nil with the reasoning — Art. 33(5) documentation covers it and the next identical report gets answered in minutes.
- Discovery that a secret was committed long ago: awareness is now; the assessment weighs exposure window and evidence of use; rotation happens first, assessment second, and the log records that order deliberately.

## Success Criteria

- **SC-001**: The tabletop exercise (three scenarios) is completed with all routings defensible and the log entries complete; total elapsed exercise time per scenario under 90 minutes, most of it assessment, not hunting for the runbook.
- **SC-002**: A maintainer uninvolved in writing this spec, given a scenario cold, opens a correct log entry and notifies the right roles within 30 minutes using only the runbook.
- **SC-003**: Every containment card's steps are verified against the live consoles at writing time (each rotation path actually exists where the card says it does) — a card that describes a console that moved is a failed card.

## Design decisions

- **Runbook over tooling**: at this scale the failure mode is not detection engineering, it is a human not knowing the clock exists. The spec buys knowledge and rehearsal, not monitoring infrastructure — while noting honestly (Out of scope) that detection today is "someone notices".
- **Scenarios drawn from our own audit**, not from breach listicles: the runbook rehearses the failures this codebase has actually flirted with.
- **The log is private by construction**: it will contain affected identities and incident detail; its location is chosen with the same care as the DSAR register (spec 097).

## Out of scope

- Security engineering to prevent breaches (the security-audit fix branch's landing is its own work; this spec consumes its results as scenario input).
- Automated breach detection/alerting — a named gap the annual review (spec 100) re-examines; not silently implied by this runbook.
- Breaches of the public code/content repositories with no personal data involved (a defaced README is an incident, not a personal-data breach) — the runbook's first fork makes this distinction so the clock isn't cried wolf.

## Sequencing

Depends on spec 096 (store inventory for the containment cards) and spec 100 (role ownership). The runbook can be written as soon as 096's record exists; the rehearsal (FR-008) closes the suite's first pass together with 097/098's dry-run.
