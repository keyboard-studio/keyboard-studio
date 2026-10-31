# Breach response runbook (spec 099)

Owner: the privacy owner (`docs/privacy/owner.md`) is the notification
owner; every maintainer who suspects a breach reports it to the
privacy owner immediately — suspicion is enough, certainty is not
required to start the clock.

> **Verification note (2026-10-14)**: console steps below are written
> from the providers' documented flows as read at drafting. Steps the
> builder could not live-verify are phrased as operator steps —
> confirm the exact console path at first use and correct this runbook
> in the same change (spec 099 FR-002 discipline).

## The clock

- The 72 hours (Art. 33) run from **awareness** — when any maintainer
  first has reasonable certainty a personal-data breach occurred —
  not from full scoping.
- The privacy owner records the awareness timestamp in the breach log
  at first report, before investigation.
- **Phased notification is allowed** (Art. 33(4)): notify what is
  known inside 72 hours; complete the picture by amendment. An
  incomplete on-time notification beats a complete late one.

## Step 1 — Contain (per-store cards)

**Drafts — Vercel Blob (record row 2a)**
1. Rotate/replace `BLOB_READ_WRITE_TOKEN` in the Vercel project env;
   redeploy so functions pick up the new token.
2. Review Blob store access in the Vercel dashboard; if the store
   itself is exposed, treat every payload as in-scope for assessment.

**Drafts — Vercel Postgres (row 2b)**
1. Rotate the database credentials (`POSTGRES_URL` and friends) in
   project env; redeploy.
2. Review recent queries/connections the provider exposes; preserve a
   copy for the assessment before rotating further.

**Identity — GitHub Apps / OAuth (rows 3, 4)**
1. For a compromised GitHub App: regenerate the App's **private key**
   (App settings → Private keys) and the client secret; the old key
   stops working immediately. Do the same, per-App, for the
   crash-reports App and the managed-PR App — they are separate Apps
   with separate keys.
2. Google OAuth client secret: rotate in the Google Cloud console
   credentials page for the sign-in client.
3. **There are no server-side sessions to revoke** — sessions are the
   author's browser session holding *their own* provider tokens.
   Token revocation for affected users happens on GitHub/Google's
   side; our lever is telling affected users to revoke/reconnect, and
   rotating our server-side secrets so stolen material stops working.

**Platform (row 8)**
1. Review Vercel deployment + env-change history for unauthorised
   changes; roll back to a known-good deployment if integrity is in
   doubt.
2. If the repo is the vector: review GitHub org/repo audit log,
   collaborator list, and Actions runs; disable a compromised workflow
   before investigating it.

## Step 2 — Assess (decision tree, keyed to this inventory)

Ask in order; the first "yes" sets the floor, not the ceiling:

1. **Server draft payloads or metadata exposed** (rows 2a/2b)? Drafts
   are private working documents tied to a named GitHub identity →
   **likely risk to individuals: notify the authority**; assess
   individual notification by content sensitivity (attribution emails
   present? drafts of unreleased work?).
2. **Identity material exposed** (rows 3/4 — tokens, secrets)? Secrets
   themselves are ours to rotate; if **user tokens** were exposed,
   treat as likely risk → notify; direct affected users to revoke.
3. **Crash-report pipeline abused** (row 5)? Reports are anonymised by
   design; assess whether injected content carried personal data →
   notify only if it did.
4. **Public data only** (rows 6/7 — material already public by the
   author's own act)? Generally **no new risk → no notification**;
   record the reasoning.
5. Anything inconclusive at the deadline → **notify phased** with what
   is known; do not let assessment overrun the clock.

## Step 3 — Notify

- **Authority**: ICO (UK) — online reporting route — within 72 hours
  of awareness where Step 2 requires it, containing Art. 33(3): nature
  and categories, approximate numbers of subjects and records, privacy
  owner contact, likely consequences, measures taken/proposed.
- **Individuals**: without undue delay where the risk is **high**
  (Art. 34), in plain language: what happened, likely consequences,
  what we have done, what they can do (e.g. revoke/reconnect), contact
  point. Not required where data was unintelligible to unauthorised
  parties, measures removed the risk, or effort is disproportionate
  (then public communication instead) — Art. 34(3), reasoning recorded
  either way.
- **No-notify decisions are decisions**: signed by the privacy owner
  with the reasoning, in the log. "We decided not to" is a record;
  silence is not.

## Step 4 — Log and follow up

- Every breach — notified or not — gets a breach-log entry (template:
  `docs/privacy/templates/breach-log.md`), kept **privately**, never
  in a public repo while an incident is live (Art. 33(5); spec 099
  FR-007).
- Follow-ups land as record/procedure amendments or issues — never
  only in chat or the log.
- One tabletop per annual review (spec 100), rotating the scenario's
  store; routing and timing recorded in the year's review file.
