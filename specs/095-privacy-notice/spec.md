# Feature Specification: Privacy notice — say what we hold, where it goes, and what becomes public, at the moment it matters

**Feature Branch**: `spec/privacy-suite` (suite branch for specs 095–100)
**Created**: 2026-10-14
**Status**: Draft — planning only. Suite source: `~/workspace/keyboard-studio-notes/privacy-gdpr-plan-2026-10-14.md` (code-verified inventory, §3).
**Input**: Matthew's directive (2026-10-14): implement a privacy policy for keyboard-studio and actually follow it. This spec is the transparency third of that directive; specs 096–100 are the record/retention, DSAR, erasure, breach, and governance thirds.

## Why this exists

The repo today contains **zero** mentions of privacy, GDPR, or data protection (verified by search, 2026-10-14), while the product:

- stores signed-in users' full draft payloads server-side (Vercel Blob + Postgres, `api/drafts/`),
- **collects identity data at sign-in — Gmail addresses, names and profile pictures via Google sign-in, and a GitHub App connection on the user's account via GitHub sign-in** (exchanges under `api/oauth/`; held session-scoped client-side and not persisted server-side, but collected and processed — "not persisted" is a retention fact, not a disclosure exemption; Matthew's correction, 2026-10-14),
- publishes a submitting author's **name and email into public git history** (`utilities/oauth-backend/src/github-pipeline.ts` — commit trailer + PR body),
- auto-files **public** crash-report issues (spec 060),
- discloses every visitor's IP to Google on page load (Google Fonts, `packages/studio/index.html`),
- and **plans product analytics** (where authors get stuck in the flow) — not live today, governed by spec 101, and disclosed here the moment it lands, not after.

GDPR Art. 13 makes the information owed to a user a fixed list, owed **at collection time**. None of it is currently provided anywhere. The gap is not tone or boilerplate; it is that four real processing facts — one of them effectively irreversible — are undisclosed at the moment they happen.

## Governing documents

- GDPR Art. 13/14 (information to be provided), Art. 12 (concise, transparent, plain language) — the content checklist, not a style guide.
- Spec 060 (crash reporting): the redaction design and the auto-send-with-notice pattern this spec extends into a general transparency rule.
- Constitution Art. XI (done means integrated) and, once spec 100 lands, Art. XII (privacy is a design constraint): a notice that is not reachable at the collection moments named below is not done.
- Specs 097/098: the notice **names** the request route and rights those specs make real. The notice MUST NOT promise a procedure that does not yet exist; publication is sequenced after 097/098 intake exists (see Sequencing).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — A visitor can learn what the studio holds before signing in (Priority: P1)

A prospective author opens the studio, finds the privacy page from the welcome screen without signing in, and can answer for themselves: what stays on my device, what reaches the project's servers if I sign in, who else receives data, how long things are kept, and how I ask for my data or its deletion.

**Independent Test**: Load the app signed-out; follow the privacy link; check every Art. 13 item against the inventory (spec 096's record). No item requires an account to read.

**Acceptance Scenarios**:

1. **Given** a signed-out visitor, **When** they open the privacy page, **Then** every processing row of the spec-096 record appears in plain language with purpose and lawful basis — including what sign-in collects (Gmail address/name/picture via Google; the GitHub App connection and id/login via GitHub) stated as collection, not waved at as "session-only" — plus the affirmative statements that are true today: no cookies, no advertising, no sale of data, and no analytics yet (with spec 101's arrival updating this page in the same change, per FR-008).
2. **Given** the controller identity was ruled on 2026-10-14 (SIL Global; Language Technology Use the responsible department), **When** this spec is implemented, **Then** the page MUST NOT ship until SIL Global's acceptance of the controller role is confirmed — the acceptance is a gate, not a follow-up.

### User Story 2 — The submission permanence disclosure happens before the submit click (Priority: P1)

An author about to submit a keyboard sees, **in the submit panel itself** (not only on a linked page), that their display name and email will be embedded in the commit and PR on a public repository, and that once merged upstream the project cannot remove them from git history.

**Independent Test**: Drive the managed-PR submit flow (`packages/studio/src/components/ManagedPRSubmitPanel.tsx`) to the confirm step; the disclosure is visible without scrolling to a footer or opening a link, and names both fields (name, email) and the consequence (public, permanent).

**Acceptance Scenarios**:

1. **Given** an author on the submit confirm step, **When** they read the panel, **Then** the disclosure states what is published, where (public `keymanapp/keyboards` PR + commit history), and the erasure limit in the same words the privacy page uses.
2. **Given** the Option A fork+PR path, **When** an author uses it, **Then** the equivalent disclosure appears on that path too — one behaviour, both delivery paths (cf. the dual-path delivery model).

### User Story 3 — Sign-in and first server save carry the notice link (Priority: P2)

The two moments server-side processing starts — OAuth sign-in and the first server-side draft save — link the privacy page, so Art. 13 information is available at collection time, not discoverable only in a footer.

**Independent Test**: Sign in with GitHub and with Google; the sign-in surface links the privacy page. Save a draft server-side for the first time in a fresh account; the save confirmation links it too.

### User Story 4 — No undisclosed third-party load remains (Priority: P1)

The studio stops disclosing visitor IPs to Google Fonts: fonts are self-hosted, so the page load makes no third-party request. Until that lands, the privacy page discloses Google as a recipient — disclosure is the floor, removal is the goal.

**Independent Test**: Load the built studio with network logging; zero requests to `fonts.googleapis.com` / `fonts.gstatic.com`; text renders in the same families from same-origin assets.

## Requirements

### Functional Requirements

- **FR-001**: A privacy page MUST exist in the studio app, reachable signed-out from the welcome screen and from a persistent footer/settings link, containing every Art. 13 item mapped to the spec-096 record: controller identity + privacy contact route, purposes + lawful basis per purpose, recipients/processors (Vercel, GitHub, Google-where-applicable), retention per store, the eight rights + how to exercise them (specs 097/098), and the supervisory-authority complaint route (ICO named).
- **FR-002**: The page MUST distinguish the three data situations in plain language: *on your device* (local drafts), *on our servers* (signed-in drafts), *public* (crash reports; submissions).
- **FR-003**: The managed-PR submit panel and the Option A submit surface MUST show the permanence disclosure (User Story 2) at the confirm step.
- **FR-004**: Sign-in surfaces (GitHub + Google) and the first-server-save confirmation MUST link the privacy page.
- **FR-005**: Fonts MUST be self-hosted; the built app MUST make no request to Google Fonts origins. (Interim: FR-001's recipient list includes Google Fonts until FR-005 lands.)
- **FR-006**: The privacy contact route named on the page MUST be the ruled route (2026-10-14): GitHub private vulnerability reporting on `keyboard-studio/keyboard-studio`, presented as "send a private privacy request" with the path spelled out (Security tab → Report a vulnerability → title it a privacy request), because the form is vulnerability-shaped and undiscoverable without signposting.
- **FR-007**: Notice text MUST be i18n-catalogued like other studio chrome (spec 046 discipline) — en at ship, fr following the normal Crowdin flow; legal meaning MUST NOT drift between locales (the en text is the reference).
- **FR-008**: The page MUST carry a "last updated" date and a change note; substantive changes (new store, new recipient, new purpose) MUST update the date in the same change (enforced procedurally by spec 100, not by this spec's code).

### Edge Cases

- A user who never signs in and never submits: only local drafts + the fonts disclosure apply — the page MUST read truthfully for them (no server data is held about them).
- Crash reports are already auto-sent with an in-app notice (spec 060); the privacy page MUST describe that flow consistently with 060's shipped copy, not invent a second description.
- Google sign-in is optional and GitHub is the draft identity; the page MUST NOT imply Google receives draft content (it receives only the sign-in exchange).

## Success Criteria

- **SC-001**: An Art. 13 checklist walk against the published page, item by item, passes with zero gaps when checked against the spec-096 record.
- **SC-002**: A network capture of the built app's first load shows zero third-party requests.
- **SC-003**: In a moderated walk, a first-time author reaching the submit confirm step can state, unprompted, that their name and email become public and permanent — the disclosure is measured by comprehension, not presence.

## Design decisions

- **One page, three situations** (device / servers / public) is the organising structure, chosen over a per-feature FAQ: it matches how the data actually behaves and survives feature churn.
- **Disclosure at the point of action** for submission (FR-003) rather than page-only: Art. 13's "at the time data are obtained" makes the submit panel the legally relevant surface, and permanence is the one fact an author cannot undo.
- **Self-host fonts rather than disclose-and-keep** (FR-005): the cheapest processor removal in the whole suite; a disclosure for an avoidable disclosure is the Kukie-pattern failure this suite exists to avoid.

## Open rulings (block implementation, not this spec)

- **Controller identity**: RULED 2026-10-14 — SIL Global is named as controller, Language Technology Use (LT Use) as the responsible department, contingent on SIL Global accepting the role; the fallback if it declines is Matthew personally. The notice cannot ship until the acceptance is confirmed (User Story 1, scenario 2).
- **Notice placement** is otherwise settled by FR-001/FR-004.

## Out of scope

- Cookie/consent banners — the app sets no cookies and runs no analytics today; the planned analytics is spec 101's subject (its consent/ePrivacy posture is decided there), and any later addition is gated by spec 100, not this spec.
- The request procedures themselves (097/098) and retention engineering (096).
- Terms of service / acceptable use — a separate document if ever wanted; this spec is privacy only.

## Sequencing

Depends on: spec 096 (the record the notice transcribes) for content; specs 097/098 intake existing before the page promises it. Fonts self-hosting (FR-005) is independent and may land first. Pairs with spec 100 (the page's update discipline becomes constitutional).
