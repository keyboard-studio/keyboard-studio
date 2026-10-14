# Subject access requests — procedure (spec 097)

Owner: the privacy owner (`docs/privacy/owner.md`). The clock and the
discipline in this document are the feature; the export button is a
detail.

## Intake

- **Any channel counts.** A request that reaches any maintainer in any
  form — the private GitHub route, a public issue, an email, a comment
  — is a request, received on the day it arrives. "Wrong form" is
  never a refusal.
- **Named route**: GitHub **private vulnerability reporting** on
  `keyboard-studio/keyboard-studio` (repo **Security** tab → *Report a
  vulnerability*), with the request titled as a privacy / data request.
  The privacy notice and `SECURITY.md` signpost it in those words.
  Only maintainers and the reporter can see a private report.
- **Same-day registration**: on receipt, the privacy owner opens a row
  in the private request register (template:
  `docs/privacy/templates/request-register.md`) with the **true
  receipt date**, channel, and request type. Register entries are
  metadata about handling, never copies of supplied data; the register
  itself is kept privately, never in a public repository.

## Identity verification

Verify by **account control**: ask the requester to sign in to the
GitHub (or Google) account the request concerns and perform a trivial
action only its holder can (for the private route, filing from that
account is itself the evidence). Sign-in identity is the key every
server-held store uses, so account control is proportionate and
sufficient. Do not collect identity documents. If a requester cannot
demonstrate account control, ask for the minimum additional evidence
that resolves the doubt and record what was accepted and why.

## Search

Walk **every row of the processing record**
(`docs/privacy/processing-record.md`) — the record is the search map:

| Record row | Search action |
|---|---|
| 1 local drafts | Not held by us — state it; give the author their local export/clear steps |
| 2 server drafts | Export by `github_user_id` (`GET /drafts/export` machinery, owner-side) |
| 3 GitHub identity | State the id/login we verify and the App-connection facts; the connection record is GitHub's |
| 4 Google identity | Nothing persisted server-side — state it, plus what the exchange collects |
| 5 crash reports | Searchable by content, not by author (redacted by design) — state it |
| 6/7 submissions | Name the PRs/commits in the named public repositories |
| 8 platform logs | State the category and Vercel's limits; no extraction we cannot do |

Also state, without being asked: purposes, lawful bases, recipients,
retention, and the requester's other rights (Art. 15(1)) — the
processing record's rows carry all of it.

## Clock and response

- **One month from receipt** (Art. 12(3)). The register row carries
  the deadline; the privacy owner works to it personally.
- **Extension**: complex or numerous requests may extend by two
  further months, but the requester is told **within the first
  month**, with the reason. No silent extensions.
- **Delivery**: privately, through the channel the request came by
  (or a channel the requester chooses). Never post supplied personal
  data to a public issue, including one the requester opened publicly —
  move the content-bearing part private and say that is what happened.
- **Refusals**: only on a named ground (manifestly unfounded or
  excessive, Art. 12(5); an Art. 17(3)/exemption ground where the
  request is an erasure — see the erasure procedure), stated
  specifically, with the complaint route (the ICO) named. "We don't
  hold that" is a factual answer, not a refusal, and is given with the
  reasoning.

## Dry run (spec 097 FR-010)

Once per annual review (spec 100): work one test request end-to-end
against a test account — register, verify by account control, search
every row, produce the supply — and record elapsed time and every
friction point in the year's review file. Fix the procedure where it
disagrees with reality.
