# Privacy owner

Spec 100, FR-003/FR-005. This page is where specs 097, 098 and 099's
references to "the privacy owner" resolve.

## The role

The privacy owner is accountable for the privacy system working in
practice, not just existing on paper:

- **Requests** — owns the DSAR/erasure register
  (`docs/privacy/dsar-procedure.md`, `docs/privacy/erasure-procedure.md`):
  reviews it **weekly while any row is open**, works or delegates each
  request inside the one-month clock, approves any refusal and its stated
  ground.
- **Breaches** — is the notification owner in
  `docs/privacy/breach-runbook.md`: receives every suspected-breach
  report, owns the 72-hour assessment clock, signs the notify / don't
  notify decision and its recorded reasoning.
- **The record** — owns `docs/privacy/processing-record.md`: a change
  that creates a store, a recipient, or a purpose does not land without
  the record (and, where user-visible, the privacy notice) updated in the
  same change.
- **The calendar** — runs the annual review below and files its outcome.

## Current holder

**Matthew (project maintainer)** — sole maintainer, and the privacy
owner acting for the data controller (SIL Global; responsible
department: Language Technology Use). Where this suite says "the privacy owner
decides", today that is Matthew. If the project gains maintainers, the
holder is re-named here in the same change that shares the duties; the
role is never left pointing at a team alias.

## Annual review checklist

Run once a year (and after any incident that suggests the system, not
just the store, failed). File the outcome at
`docs/privacy/reviews/<year>.md` — an item is done when its outcome is
written there, not when it was discussed.

1. **Record vs code** — run `pnpm check:privacy-record` (spec 096 FR-005)
   and also read the diff of `api/`, storage SDK usage, and
   `utilities/oauth-backend` since the last review by hand. The check
   proves enumeration; the read catches purposes, which enumeration
   can't.
2. **Processor facts** — re-read each processor's current terms, DPA, and
   retention facts relied on in the record (Vercel, GitHub, Google, and
   the spec-101 analytics processor once live). Platform defaults change;
   record the re-check date per processor.
3. **DSAR dry-run** — work one test request end-to-end per spec 097
   FR-010 (register, verify, search, supply) and one erasure per spec
   098, against a test account. Record elapsed time and every place the
   procedure disagreed with reality; fix the procedure, not the memory.
4. **Breach tabletop** — run one scenario from the breach runbook,
   rotating the store each year (drafts Blob/Postgres → OAuth/App
   credentials → crash-report pipeline → analytics store, once live).
   Record routing decisions and timing per spec 099.
5. **DPO question, re-asked** — does the processing profile now require
   a data protection officer (public-authority status, large-scale
   systematic monitoring, large-scale special-category data)? Re-ask
   explicitly at analytics scale: funnel analytics as designed in spec
   101 is aggregate and pseudonymous, but if its scale or granularity
   has grown past the assessment's assumptions, the answer may have
   changed. Record the answer and its reasoning either way.
6. **Notice truth pass** — read the published privacy notice against the
   record line by line; refresh its "last updated" date if anything
   moved, and confirm every linked route (intake, opt-out) still works.
7. **Open actions** — carry every unfinished item from the previous
   review forward by name, with its owner. An item may be closed,
   re-ruled, or carried — never silently dropped.
8. **Crash-report residue pass** — scan the year's crash issues
   (`keyboard-studio/crash-reports`) for personal data in free-text
   fields (error messages, breadcrumbs, decision-log tails); scrub or
   delete any offender and record the count (spec 096 ruling,
   2026-10-14).
