# Erasure requests — procedure (spec 098)

Owner: the privacy owner (`docs/privacy/owner.md`). Erasure here means
real deletion. Spec 098 FR-003: no soft delete, tombstone, or
deactivation may be described to a requester as erasure.

## The three cases — always separated

Every erasure confirmation separates these explicitly. Blending them
("your data has been deleted" over a partial truth) is the failure this
document exists to prevent.

1. **Data on our servers** — deleted, by us, verifiably (below).
2. **Data on the requester's device** — never ours to delete. Local
   drafts (record row 1) leave when the author deletes them or clears
   site data; the confirmation gives the exact steps and never claims
   we deleted them.
3. **Data already public** — the Art. 17(2) playbook below. What can
   be done is done and evidenced; what cannot is said plainly.

## Grounds check (before acting)

Work Art. 17(1) grounds (no longer necessary; consent withdrawn;
objection with no overriding ground; unlawful processing; legal
obligation; child-data collection) and Art. 17(3) exceptions
(freedom of expression, legal obligation, public interest, legal
claims). Three scripted routings cover the realistic cases:

- **Drafts** → erase. No exception plausibly applies to a private
  working draft held at the author's request.
- **Our own repositories' issues/PRs containing personal data** →
  erase or redact what we control; public *code contributions* the
  author published deliberately are assessed under freedom of
  expression / the open-source record, and the assessment is recorded.
- **Third-party-controlled public data** (merged `keymanapp/keyboards`
  history) → playbook below; the limit is the answer, given honestly,
  not a refusal dressed as inability.

Record the ground relied on (or the exception and its reasoning) in
the register row.

## Case 1 execution — server data

- **Self-service**: signed-in authors can delete per-draft in the app,
  or **delete all server data** (My Keyboards → *Delete all my server
  data*), which removes every draft's **payload (Vercel Blob) and
  metadata (Postgres) together**, including the legacy `default`
  draft, and reports the count deleted.
- **Owner purge** (for requests arriving by any channel): run the
  purge path (`deleteAllDrafts`, `utilities/oauth-backend`
  draft-handlers) for the requester's verified `github_user_id`. The
  purge emits a completion record (identity key, count, timestamp,
  outcome); file it against the register row. Verify by re-listing the
  drafts for that identity: zero rows, zero blobs.
- **Crash reports**: if a report is ever found to contain personal
  data despite the spec-060 redaction, remediate the issue (edit/remove
  the content via the crash-reports repo controls) and record it; the
  retraction path (`api/report/crash-retract.ts`) serves
  author-initiated retraction.

## Case 3 playbook — public data (Art. 17(2) reasonable steps)

1. **What we control**: our repositories and forks (issues, PRs,
   branches we pushed) — delete/redact there, and evidence each action
   in the register.
2. **What others control**: for merged submissions in
   `keymanapp/keyboards`, send the Keyman maintainers an erasure
   request identifying the PRs/commits and the data concerned, and
   tell the requester we have done so and when.
3. **What nobody can do**: merged **git history is not rewritten** —
   name/email in commit trailers of merged history stays. This limit
   was disclosed before submission (spec 095 FR-004); the confirmation
   restates it without hedging.

## The GitHub App connection (standing honesty note)

We cannot disconnect the requester's own GitHub App installation or
revoke their tokens on GitHub's side — only the account holder can.
Every erasure confirmation that touches a connected author includes
the exact steps: GitHub → **Settings → Applications → Installed GitHub
Apps → Keyboard Studio → Uninstall** (and, for the Option A OAuth app,
**Settings → Applications → Authorized OAuth Apps → revoke**).

## Confirmation

Itemised, through a private channel, within the DSAR clock: per store
— deleted (with count/evidence), not held (with the reason), steps
given (device data), playbook actions taken + requests sent (public
data), and any exception relied on with its ground and the ICO
complaint route.
