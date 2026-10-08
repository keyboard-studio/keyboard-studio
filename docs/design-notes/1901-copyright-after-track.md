# #1901 — Author/copyright questions move after the track choice

Status: DECIDED (this note), implemented on `km/1901-copyright-after-track`.
Issue: #1901 "move the author/copyright questions after the track choice and
make them track-aware". Terminology per #1810: Track 2 is "update" (the
decision value stays `adapt`; no copy on this surface calls it "import").

## Why the question still showed in step one

Spec 092 anticipated this move: `il_copyright_holder` declares `extract` +
`seedWhen` (seed on the update track only), and its e2e acceptance walk
(`live-extraction-acceptance.spec.ts`) already expects the question to arrive
after the track choice, pre-filled. But the *relocation* never happened —
FR-005's original mechanism (a `requires` edge on `authoring-track`) was
replaced by ruling A2/G-14 (the edge became `snapshotInputs`, a data
dependency), and A2 deliberately kept the module in the identity screen
group. So the question kept rendering as the identity step's tail, before
the base or the track existed — on a fresh walk the seed can never fire
(the author has already answered, or left blank, by the time the setup
gate runs the extraction pass), and the holder defaults to the author even
on the update track, where the base's holder should be preserved.

## Premise verification — holder seed timing (checked, holds)

The one premise that could have falsified D1/D3: the extraction pass fires
at the setup commit (base instantiated + track recorded — StudioShell
doCommit), when the author name does not exist yet, and
`il_copyright_holder.requires` includes `author-name`. Verified in
`decisions/liveExtraction.ts`: the pass does NOT gate on `requires`
satisfaction — `requires` feeds ordering (`orderDecisions`) and the inputs
snapshot only; seeding gates on `filterGated` (conditional-`next`
reachability against recorded decisions) and the module's `seedWhen`. The
holder's `extract` reads only `ctx.ir.header.copyright`, so at track
completion on the update track the holder seeds from the base bundle
exactly as the spec-092 acceptance test expects, and the attribution step
renders that record pre-filled (record-first seeding, source caption
`from <base id>`). SurveyRunner additionally re-runs the idempotent pass
at question-push time (G-9), and spec 093 recalculation re-derives
extracted records on a base switch. No change to 092 machinery is needed.

## D1 — Placement: a new post-track flow + step (CHOSEN)

Move `il_author_name`, `il_author_email`, `il_copyright_holder` out of
`flowModules.identity_lite` into a new `flowModules.attribution` list
(walk order preserved), hosted as a new manifest step `attribution`
immediately after `track` and before `project_name`:

- New flow source `attribution` (phase "G", like its neighbours) in
  `steps/flowSources.ts`; new screen group `"attribution"` seeded in
  `registry.decisionModules`, declared between `track` and `project_name`.
- Order is enforced the architecture's way: `il_author_name` declares
  `screenRequires: ["authoring-track"]` (the `project_display_name`
  precedent — a screen-order fact folded into deriveScreens' full-list
  sort only, never a module `requires`, so per-flow orderParity never sees
  an unresolvable edge). Declaration order in `decisionModules` breaks
  the tie with `project_name` (which also screen-requires the track).
- Hosting follows `project_name`: `attributionOptions` +
  `makeFlowStepComponent` (flowStepOptions.tsx), a step declaration in
  registerEditorSteps.ts, and the copy/update fork in `steps/advance.ts`
  moves from the `track` case to the `attribution` case (track now
  advances to attribution on both tracks; attribution forks copy →
  project_name, update → characters).

Alternatives considered:

- **(b) Membership in the track flow.** Rejected. The track step is a
  manifest-level fork (its completion routes imperatively), not a
  SurveyRunner walk the trio can simply join; and mid-walk the
  `authoring-track` decision is not yet recorded, so the extraction
  pass's `seedWhen` — the mechanism 092 built for exactly this — could
  never fire for the holder question.
- **(c) Keep the trio in identity_lite and defer rendering until the
  track exists.** Rejected. Screen membership is static by construction
  (091); the identity step completes before base/track exist, and no
  mechanism re-enters a completed step's flow when the track lands.

## D2 — The supported-script gate after the split

Today `il_target_script`'s conditional `next` default-branches to
`il_author_name`; that edge is what "attribution follows a supported
script" means in routing. With the trio in another flow the edge cannot
survive (a flow's FlowDef can only route to its own questions), so
`il_target_script`'s `next` keeps only the unsupported branch — a
supported script now *ends* the identity flow at the script question.

The gate itself is preserved by the session terminal, its existing
single home: `advance("identity")` routes to `"unsupported"` when
`deriveIdentityResult().supported` is false, so the attribution step is
unreachable in the walk for a gated script — the same protection, at the
same layer the identity completion already uses. The trio's modules
become roots of their own flow (no routing-derived gate), so the
attribution screen is ungated and on the spine — which is the truth of
the walk: every author on a supported script passes through it; it is
not an optional fork.

Alternative: a `declaredScreenGates` entry for `"attribution"` reading
`target-script`. Rejected — it would duplicate the unsupported-script
set at the composition layer (a second source for one fact), and a
gated screen is derived as a SIDE TRAIL (joinTarget `characters`),
misstating a step every author walks. Declared gates remain for
manifest-level forks that routing cannot express (the project_name
copy fork, the touch seed fork); this is not one of those once the
terminal is accounted for.

## D3 — Seeding: who proposes what, per track

The setup gate (092 FR-004) fires instantiation + the live extraction
pass when the track is recorded — strictly before this step mounts — so
the record channels work exactly as they do for Phase F:

- **Copyright holder, update track:** the pass seeds `copyright-holder`
  (provenance `extracted`, source = base id) under `seedWhen`; the
  runner's record-first seeding renders it pre-filled with its
  "from <base>" caption. Keeping it preserves the base's holder; the
  year is not part of the answer at all — inherited holders keep their
  years from the base LICENSE at emit, and the session holder's line
  takes the emit year (contracts/copyright + scaffolder
  `attributionText`; untouched by this change).
- **Copyright holder, copy track:** `seedWhen` forbids the seed (the
  copied notice is retained by the attribution machinery, and offering
  it for re-entry is the D4 duplicate-holder hazard). The field is
  blank; blank = the author (D1).
- **Author name / email, both tracks:** confirm-style defaults from the
  stored profile. The rule stays in the modules (`lookupDefault`,
  spec 092 T033); the step's seed callbacks evaluate it against an
  `ExtractContext` carrying `identity.authorProfile` — the
  caller-proposal channel (the pre-092 host-prop pattern), read live at
  question-push time, so there is no mount-effect race and no store
  write. The factory's deps gain `authorProfile` (one `useGitHubAuth`
  read in makeFlowStepComponent) to supply it.
- **Re-entry:** an already-asked record's value is the seed (the
  project_name/track pattern); the extracted record still wins while it
  stands unanswered, via the runner's record-first channel.

## D4 — What does not move

- Decision ids, question ids, values, `apply`, and the emit path are
  untouched: attribution still lands via `il_copyright_holder.apply`
  (089), now dispatched at the attribution step's completion — pass 2's
  trigger ("a completion that recorded one of its `requires`") is this
  step's completion recording `author-name`, the same shape as before.
  The golden walk must stay byte-identical.
- `deriveAttribution` / `deriveIdentityResult` compose from decision
  ids, not step membership — unchanged and now the sole live source of
  `IdentityLiteResult.attribution` (the answer-shaped
  `extractIdentityLite` no longer sees the questions).
- Draft migration: records and saved answers are keyed by decision /
  question id, never by step; a pre-change draft's il_* answers resume
  as asked records and seed this step. The `step` stamp on old records
  still says `identity` — it is trail cosmetics, nothing routes on it.

## Deliberate baseline changes (review points)

- `stepOrder.parity.test.ts`: BASELINE_ORDER gains `"attribution"`
  after `"track"`; BASELINE_MEMBERSHIP moves the three decisions from
  `identity` to a new `attribution` entry. Side trails and locks
  unchanged. This is the file's documented "a change here is a decision
  to review" case; the change is this issue.
- `orderParity.test.ts`: identity_lite's frozen order loses the trio;
  the new attribution flow's order is frozen as
  `[il_author_name, il_author_email, il_copyright_holder]`.
