# §18.6 decision note — inventory construction + origin streamline

**Date:** 2026-10-13 · **Ruled by:** Matthew (project owner), two
rulings the same day · **Implemented:** spec 084 Batch 4, PR #2048.

## Ruling 1 — the inventory is constructible for an Adapt case

Verbatim intent: for Ewondo we have the confirmed inventory, the
template keyboard, the fallback keyboard, and the user's additions
and deletions — a whole adapted keyboard — so the test CAN be built:
look up CLDR exemplars for each language target and union them; skip
the check only if no CLDR/SLDR entry exists.

Implemented as `packages/studio/src/criteria/buildCriteriaInventory.ts`,
wired into the authored criteria assembly (`useCriteriaFindings`;
foreign/Compare mode builds no inventory):

- **Requirement baseline:** per-target CLDR exemplars via the
  engine's single exemplar-sourcing path (CLDR, SLDR fallback),
  unioned across every language target (identity tag, decision-derived
  tag, the judged package's declared languages).
- **Author's confirmed decisions unioned in:** the confirmed alphabet
  (attested stacks, mandatory marks, letters incl. PUA with declared
  roles) and the confirmed-inventory flat list (carve adds, punctuation
  decisions). The template/fallback contribution reaches the build
  through those confirmed records (Phase B sources the alphabet from
  the adapted base before confirmation) — never by reading raw base
  IRs, which would conflate base-derived proposals with author facts.
- **Skip rule (the ruling's only one):** ANY target with no CLDR/SLDR
  entry skips the whole build; §18.6 shows Not yet checkable with the
  reason `no CLDR/SLDR entry for <tag>`. No target recorded → same
  status, reason says so. Never a guessed verdict.
- Multi-codepoint exemplar units contribute their constituent
  codepoints (an inventory entry is judged per codepoint); digraphs
  are not inventory characters; controls and plain space are omitted
  (no space key produces U+0020 as a rule output).

## Ruling 2 — "Make it so": delete the origin mechanism

The triage proposed *relaxing* check-18-6's origin guard (skip only
fragment-bearing imported IRs). Matthew sharpened it to a full
streamline: **the `"scaffolded"` value is deleted from `IROrigin`
and the zod schema, and the origin guard is deleted entirely** — not
relaxed. New run condition: an inventory was supplied AND the IR
carries no raw fragments (`ir.raw.length === 0`). With fragments
present the check emits nothing AND the assembly names §18.6
context-missing with the raw-fragment reason, so it surfaces as Not
yet checkable rather than reading as Met.

Why the deletion is safe (verified 2026-10-13): nothing in production
ever stamped a `KeyboardIR` `origin: "scaffolded"` — every IR birth
goes through `parseKmn`, which stamps `"imported"`; the value existed
only in test fixtures. The spec 058/063 guard therefore protected a
precondition that could never occur, and §18.6 could never fire on a
real keyboard. The guard element that protects a real failure mode —
opaque content the codec cannot structure (raw fragments) hiding
covered characters — is retained as the sole skip. Precedent: the
touch sibling check for the same §18.6 row (`KM_LINT_TOUCH_UNCOVERED`,
spec 035) deliberately never had an origin guard.

Spec 058's own documents are NOT rewritten; this note + the check
headers (rewritten to state the new basis) are the record.

## Blast-radius note (larger than the triage's S estimate)

- Every fixture/test origin literal migrated to `"synthesized"`
  (contracts, keyboard-lint, studio: irFixtures default, rules/a11y/
  decisions/mutateApply fixtures, irToCarveNodes builders).
- **Persisted draft envelopes** (studio `lib/__fixtures__`
  pre-079/pre-PR/v1 draft JSON) still carry the retired string in
  their serialized base IR. Deliberately NOT edited: they are
  historical artifacts, draft revival restores the IR as plain JSON
  with no origin validation, and post-streamline no code branches on
  IR origin, so a legacy value is inert.

## Ewondo verification (2026-10-13, this branch)

The real `sil_cameroon_qwerty` corpus folder judged in authored mode
through the production assembly + builder + resolver, target `ewo`:

- Re-parsed IR carries **0 raw fragments** — the fragment skip does
  not block Ewondo.
- Build succeeded: 85-character inventory (CLDR `ewo` baseline).
- **§18.6 verdict: Not met** — the first real verdict this criterion
  has ever produced. 22 uncovered characters: 19 precomposed tone
  stacks (á à ǎ é è ě í ì î ǐ ń ǹ ó ò ǒ ú ù û ǔ) that
  sil_cameroon produces as base + combining-mark sequences (its marks
  are credited; the check's documented strict-precomposed analysis
  does not credit NFD sequences — the finding hint names exactly
  this), plus 3 exemplar characters the keyboard does not emit
  (U+2010, U+2011, U+2030).
- Context: the base package's own `.kps` declares 278 languages, 200
  without a CLDR/SLDR entry — irrelevant to the project verdict (the
  adapted output declares the author's targets), recorded here
  because it is why the tag union is taken from the judged output,
  not the base.
