# Processing record (GDPR Art. 30)

Spec 096. This is the project's record of processing activities — the
single source the privacy notice, the DSAR search map, and the erasure
map are derived from. Constitution Article XII: a store this record
does not name must not exist; `pnpm check:privacy-record` (spec 096
FR-005) mechanically checks the server-side enumeration against this
file.

**Controller**: SIL Global (responsible department: Language Technology Use, LT Use) — ruled 2026-10-14, contingent on SIL Global's acceptance of the controller role; the notice does not publish until that acceptance is confirmed (spec 095). **Privacy owner**:
`docs/privacy/owner.md`. **Record version**: 2026-10-14 (written from a
code audit of this tree on that date; every row traces to a store,
endpoint, or pipeline found by search, not to intention).

Fields per activity: data categories · purpose · lawful basis · store /
location · processor · retention rule · deletion mechanism · DSAR hint.

---

## 1. Local drafts (never leave the device)

- **Data**: keyboard draft content, including the attribution fields the
  author types (display name, optional email address, copyright holder).
- **Purpose**: authoring without an account (the default mode).
- **Basis**: the author's own use of the tool; no controller processing
  — the data never reaches us. Listed because authors reasonably assume
  we hold it, and because specs 097/098 must answer for it honestly.
- **Store**: browser `localStorage`, keys `ks.draft.*` and
  `ks.draftIndex.v1` (`packages/studio/src/lib/draftPersistence.ts`).
- **Processor**: none.
- **Retention**: until the author deletes the draft or clears site data.
- **Deletion**: in-app draft deletion; browser site-data controls.
- **DSAR hint**: not searchable by us — the procedures say so and give
  the author the export/clear steps instead.

## 2a. Server drafts — payloads

- **Data**: the full draft payload (same content as activity 1,
  including attribution fields) for authors who sign in and save.
- **Purpose**: cross-device draft storage and submission preparation,
  at the author's direction.
- **Basis**: contract / steps at the data subject's request (Art.
  6(1)(b)) — the author asks us to hold the draft.
- **Store**: **Vercel Blob**, private store (`api/drafts/_store.ts`).
- **Processor**: Vercel (Blob).
- **Retention**: **until the user deletes it** (per-draft delete, the
  delete-all surface of spec 098, or the owner purge). No automatic
  expiry exists today; an inactivity purge is an open ruling recorded in
  spec 096, not current practice, and this row changes if it is ruled.
- **Deletion**: `DELETE` draft (Blob object + metadata row, both, in
  that operation); delete-all; owner purge
  (`deleteAllDrafts` in `utilities/oauth-backend`).
- **DSAR hint**: list by `github_user_id`; export via `GET
  /drafts/export`.

## 2b. Server drafts — metadata

- **Data**: `github_user_id`, `github_login`, `keyboard_id`, draft
  label, status, `pr_url`, size, created/updated timestamps
  (`api/drafts/schema.sql`).
- **Purpose**: indexing, listing ("My Keyboards"), and submission
  state for activity 2a.
- **Basis**: as 2a.
- **Store**: **Vercel Postgres** (Neon-backed), drafts table.
- **Processor**: Vercel (Postgres).
- **Retention / deletion / DSAR hint**: as 2a — metadata and payload
  are created and deleted together; a half-deleted draft is a defect
  (spec 098).

## 3. GitHub identity — sign-in and the GitHub App connection

- **Data**: GitHub numeric user id and login (from `GET /user` at
  sign-in, `utilities/oauth-backend/src/verify-github-user.ts`); the
  fact of the user's GitHub App installation/connection; OAuth/App
  tokens during the flows.
- **Purpose**: identifying whose drafts these are (activity 2), and
  enabling fork/PR submission (activity 7).
- **Basis**: contract (Art. 6(1)(b)) for sign-in identity; the App
  connection is the author's own act on GitHub.
- **Store**: **no server-side profile or token store exists.** Tokens
  live in the author's browser session (`sessionStorage`, tab-scoped)
  and are presented per-request; the server verifies and does not
  retain. The App connection itself is held **by GitHub**.
- **Processor**: GitHub.
- **Retention**: session-scoped in the browser; the App connection
  until the user disconnects it on GitHub (we cannot disconnect it for
  them — spec 098 confirmations include the exact steps).
- **Deletion**: sign-out / tab close (session); GitHub settings
  (connection).
- **DSAR hint**: we can state the id/login we verify and the drafts
  keyed to it (activity 2); the connection record itself is GitHub's.

## 4. Google identity — sign-in exchange

- **Data**: Google account **email address (the author's Gmail
  address), display name, profile picture URL, and Google subject id
  (`sub`)**, returned by the exchange
  (`utilities/oauth-backend/src/google-handlers.ts`).
- **Purpose**: offering Google as a sign-in route into the same
  session model as activity 3.
- **Basis**: contract (Art. 6(1)(b)) — sign-in at the author's request.
  Collection is processing even though retention is session-scoped;
  the suite records it as such (Matthew's correction, spec 101 session
  context / plan §3 row 3b).
- **Store**: held in the browser session only (`sessionStorage`,
  tab-scoped); the server exchange handles the values in flight and
  does not persist a profile.
- **Processor**: Google (identity provider).
- **Retention**: session-scoped; gone at tab close.
- **Deletion**: tab close / sign-out.
- **DSAR hint**: nothing server-side to search; the procedure says so
  and states what the exchange collects.

## 5. Crash reports (spec 060)

- **Data**: error message and stack frames, up to 50 breadcrumb
  entries, the decision-log tail, structural app context. **Author
  identity is redacted by design** (spec 060); reports are anonymised
  diagnostics.
- **Purpose**: diagnosing defects authors hit.
- **Basis**: legitimate interests (Art. 6(1)(f)) — defect diagnosis for
  a tool whose authors cannot reasonably file stack traces by hand;
  minimisation is structural (redaction + retraction), recorded in
  spec 060.
- **Store**: **public GitHub issues** in
  `keyboard-studio/crash-reports`, filed by a dedicated GitHub App;
  retraction handled by `api/report/crash-retract.ts`.
- **Processor**: GitHub.
- **Retention**: retained as a public bug record by default (same as
  any issue). An alternative (close on fix + 24-month review) is an
  open ruling in spec 096; this row changes if ruled.
- **Deletion**: retraction endpoint (author-initiated); maintainer
  remediation per spec 098 if personal data is ever found in a report.
- **DSAR hint**: searchable by content, not by author — there is no
  author key to search by, which the procedure states.

## 6. Managed-PR submission (keymanapp/keyboards)

- **Data**: the keyboard source files; the author's **display name and
  email address embedded in the commit (`Co-authored-by:` trailer) and
  PR body** (`utilities/oauth-backend/src/github-pipeline.ts`).
- **Purpose**: submitting the author's keyboard for review and
  publication, at the author's direction.
- **Basis**: contract / the author's explicit submission act (Art.
  6(1)(b)).
- **Store**: **public git history and PRs** in `keymanapp/keyboards`
  (and the pipeline's working fork).
- **Processor**: GitHub; the `keymanapp/keyboards` repository is
  controlled by the Keyman team once a PR is open/merged there.
- **Retention**: public and, once merged, **effectively permanent** —
  git history is not rewritten; this is disclosed before the act
  (spec 095 FR-004), not discovered after it.
- **Deletion**: pre-merge, closing the PR is available; post-merge,
  spec 098's playbook (our steps + a request to the Keyman team) is
  what exists, and its limits are stated, not softened.
- **DSAR hint**: PRs/commits under the author's name/email in the
  named repositories.

## 7. Option A submission (author's fork + PR)

- **Data**: as activity 6, created **by the author's own GitHub
  account** (OAuth App, `public_repo` scope) on the author's fork.
- **Purpose / basis**: as 6.
- **Store / processor**: GitHub, under the author's own repositories
  and the target repo's PR list.
- **Retention / deletion**: the author's own GitHub controls for their
  fork; PR-side, as activity 6.
- **DSAR hint**: as 6.

## 8. Hosting and platform logs

- **Data**: request metadata (IP address, user agent, timestamps,
  paths) in platform logs.
- **Purpose**: operating and securing the service.
- **Basis**: legitimate interests (Art. 6(1)(f)).
- **Store / processor**: **Vercel** (hosting, serverless functions,
  logs). Retention is Vercel's platform default as read 2026-10-14;
  re-verified at each annual review (spec 100).
- **Deletion**: platform-managed; not individually searchable.
- **DSAR hint**: state the category and its limits honestly; do not
  promise log extraction Vercel does not offer.

## 9. Translation contributions (Crowdin)

- **Data**: none of the studio's user personal data flows to Crowdin
  from the app. Translators' own Crowdin accounts are Crowdin's
  processing, not this record's. Listed to close the question.

---

## Pre-registered — NOT live (Art. XII: no silent activation)

- **Managed-PR throttle store** (Postgres): an abuse-throttle counter
  store for the submission endpoint, designed in the security-audit
  follow-up work. When it lands it becomes a numbered row here **in
  the same change**, with its keying (per-identity counters), retention
  (window-bound), and deletion story stated. Until then it does not
  exist and this entry authorises nothing.
- **Product analytics** (spec 101): no analytics collection exists
  today. Spec 101's assessment (lawful basis, posture A, taxonomy,
  retention, processor scorecard) lives in
  `specs/101-analytics-readiness/`. Activation requires the Art. XII
  ratification, the posture and retention rulings, and a numbered row
  here naming the processor — in the same change as the first event
  ships.
