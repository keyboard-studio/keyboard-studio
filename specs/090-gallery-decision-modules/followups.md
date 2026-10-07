# Spec 090 followups — slips and ruled residues the ledger close-out (T061) recorded

## Ledger row 1 residue — the spec-079 evidence layer (owner: 093)

The duplication ledger's first row reads "gallery answers in
`surveyAnswerStore`, `phaseBDraftStore` → deleted by 090". The
`phaseBDraftStore` half is deleted outright (T025; SC-004 grep: zero
code references). The `surveyAnswerStore` half closed differently by
ruling (D-090-29, option (a) over literal elimination): marks',
characters', and punctuation's within-step answers remain in the
answer store as spec 079's own draft/evidence surface — the state the
decision values are composed from — not as a gallery write-around.
What 090 deleted is answers as a *decision-shadowing* record: every
gallery step's settled value is a decision record, and T063 removed
the last working-copy answer state (`phaseAnswersByStep`).
The residue retires with **spec 093**, whose replay reads decisions
only and drops the saved answer slice entirely; if 093's design
keeps any 079 surface, the row's final disposition is recorded
there.

## Ledger row 3 scope note — edit-time writes are the ratified design

The third row ("in-place IR rewrites outside modules → deleted")
is verified for the rewrites it named: the reducer's completion-time
rewrites (MARKS guards, R1, R2, deadkey ops, context tolerance) are
all deleted; `applyStepCompletion`'s gallery cases no longer exist.
Edit-time working-copy writes inside the galleries themselves
(TouchGallery ×4, DeadkeySurface ×1 `setWorkingIR` call sites) remain
by ruling (D-090-27 ratified as D-090-31): they are the
record-from-working-copy architecture, whose settlement is the
decision record + completion effects — not a completion-time
rewrite outside a module. Recorded so the row is not read broader
than the ruled end-state (see also the D-090-34 note in
galleryWriteAudit.test.ts).

## US5 / SC-003 — D-090-43 ruled (a); G7 gallery gaps closed; starting-point residue REMAINS

The format question was ruled (a) — a real `decision` payload kind — and
US5 landed (research.md D-090-48; tasks T050–T053). The six G7 gallery gaps
(windows-layout, rule-set, touch-seed-source, deadkeys-defined,
punctuation-inventory, retained-convenience-chars) are verified closed at
the store level in decisions/galleryLogEntries.test.ts, and SC-003's live
walk is authored for CI (e2e/decision-log.spec.ts).

The HANDOFF G7 **starting-point** item remains open, verified still
reproducing at T051 (2026-10-07): completing choose_base leaves NO
base-contribution log entry, because the recorder fires synchronously
inside StepHost's completion handling — before StudioShell's doCommit
effect instantiates the working copy — and `recordBaseContribution`
returns null whenever the working copy's base/instantiation fields are
unset. The mechanism and its null condition predate 090 (spec 053/088);
the fix belongs with whoever owns the recorder/instantiation ordering
(088's recorder composition, or 092's live-extraction pass), not with the
gallery modules. The store-level pin lives in galleryLogEntries.test.ts
("HANDOFF G7 starting-point verification"); the live-walk spec
deliberately asserts nothing about base-contribution presence.
