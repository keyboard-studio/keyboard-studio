# Implementation Plan: keyboard attribution and license provenance

**Branch**: `059-keyboard-attribution` | **Date**: 2026-08-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/059-keyboard-attribution/spec.md`, with the six
Open Questions resolved in [research.md](research.md) (D1–D6).

## Summary

Two independently shippable slices, in dependency order.

**Slice A (US1) — capture and emit attribution.** Bug-fix character: today's output names the
*keyboard* as copyright holder. Retain `name`/`email` from the GitHub `/user` call already
made (D7), revive the three demoted attribution questions prefilled from it, and emit from one
source into `LICENSE.md`, `IRHeader.copyright`, and `.kps <Copyright>`/`<Author>`. No parsing,
no base fetching. Ships alone.

**Slice B (US2) — provenance chain.** Fetch the base's `LICENSE.md` (not fetched today), parse
it, accumulate holders, render a canonical MIT file. All the licensing risk lives here, isolated
into two pure functions with a corpus-harvested fixture table.

Keeping them apart matters: A is unambiguously correct, B carries decisions D4 and D5 that the
user may still overturn. Merged, the safe fix would wait on the contested one.

**US3 (persistence) is not separate work** — `Attribution` lives on the working copy, so the
existing draft persistence carries it for free.

## Technical Context

**Language/Version**: TypeScript 5.x, React 18, Vite 5; Node >= 20; pnpm 9 workspace.

**Primary Dependencies**: `@keyboard-studio/contracts` (new `CopyrightHolder` / `CopyrightBlock`
/ `Attribution` types + the pure functions), `@keyboard-studio/engine` (scaffolder, codec,
base-browser, output), `zustand` (working-copy store).

**Storage**: browser only — attribution rides the existing localStorage draft
([034](../034-mvp-authoring-walk/spec.md) US3). No host-disk writes (Article V).

**Testing**: vitest. The parse/render pair is unit-tested against a fixture table harvested by
[corpus-scan.py](corpus-scan.py) (FR-014); emission is tested at the scaffolder boundary;
one E2E asserting a derived keyboard's ZIP retains the base's copyright line.

**Target Platform**: the studio SPA (desktop web browser).

**Project Type**: TS monorepo — contracts + engine + studio.

**Performance Goals**: parse/render are pure string work on a ~1 KB file, called once at emit.
No effect on the single 300 ms validation debounce (Article IV) — this is not a validator and
adds no timer.

**Constraints**:
- Article II — no raw `.kmn` manipulation. Satisfied structurally: `IRHeader.copyright` already
  exists and the codec already round-trips the store (D8), so the work is populating an IR
  field.
- Article IV — no second debounce, no parallel validation path. Emission-time only.
- FR-010 / D5 — emission **blocks** on an unparseable base license. This is the one place the
  feature can stop a user finishing a walk, so the manual-entry escape hatch is not optional
  polish; it is what makes the block acceptable.
- Purity (P9) — the emit year is a parameter, never read from `Date` inside the pure functions,
  or the round-trip test becomes time-dependent.

**Scale/Scope**: one keyboard, one attribution record, a copyright block of 1–4 holders in
realistic use. Bounded by a single `LICENSE.md`.

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1 design.*

| Article | Verdict | Notes |
|---|---|---|
| I. Pattern schema locked | PASS | No `Pattern`/`Criterion` field touched. New types are additive and unrelated to the locked schema. |
| II. KeyboardIR spine | PASS | `IRHeader.copyright` is an existing required field; `parse.ts:980` and `emit.ts:268` already handle the store. We populate the IR field and never touch `.kmn` text. No codec change. |
| III. Single persistent working copy | PASS | `Attribution` is session state on the one working copy; only its projection (`header.copyright`) enters the IR. No second copy, no intermediate serialization. |
| IV. Validator layering / single debounce | PASS | Nothing runs in the validation cycle. Emission-time only; no new timer, no parallel validation path. |
| V. VirtualFS only during authoring | PASS | `LICENSE.md` is written into the VirtualFS as today. The base's `LICENSE.md` is fetched into the VFS, not to host disk. |
| VI. Team boundaries | **ATTENTION** | Predominantly Engine (scaffolder, codec-adjacent, output, stores). But reviving three attribution questions changes **survey text**, which is Content-owned (§12/§13). See below. |
| VII. Out of scope for v1 | PASS | Implements none of the forbidden list. See the note on multi-language `welcome.htm` below — flagged, not implemented. |
| VIII. House conventions | PASS | `feat(engine):` / `feat(survey):` prefixes, markdown-link file refs, no issue numbers in code, `[OK]`/`[WARN]`/`[ERROR]` console forms. |

### Article VI — the one boundary crossing

Slice A revives `author_display_name`, `author_contact_email`, and `pa_copyright_holder` onto
the live identity flow. Those modules **already exist, are registered, and are test-covered** —
they sit in the demoted `proposed/phase_a_identity.modular.yaml`. Reviving them is adding three
ids to a flow YAML.

Even so, their **prompts and help text are Content-owned surface**, and D1/D6 change their
semantics (holder defaults to author; guests must supply a name). Two consequences:

1. The YAML membership change and the emission wiring are Engine.
2. Any **edit to the three questions' prompt or help text** needs Content sign-off, and the
   prompts almost certainly do need editing — they were written for a fuller Phase A battery,
   not for a prefilled confirm-this step.

**Recommendation**: land Slice A's engine wiring against the questions **as written**, and
raise the prompt rewording as a separate Content-owned change. That keeps the boundary clean
and avoids Engine silently rewriting survey copy.

### Article VII — an adjacent flag, not a violation

Article VII lists **multi-language `welcome.htm` variants** as out of scope for v1. The
recently added Phase F question `pf_doc_language` offers a *bilingual* option. That question
only records the author's intent and emits nothing today (the help-page generator does not
exist), so there is no violation now — but whoever builds that generator must not emit
multi-language `welcome.htm` variants in v1. Recorded here because this plan is where the
constraint was noticed; it is not this feature's work.

## Project Structure

### Documentation (this feature)

```text
specs/059-keyboard-attribution/
├── spec.md              # Feature spec (OQs now resolved in research.md)
├── research.md          # Phase 0 — D1..D9, resolving all six Open Questions
├── data-model.md        # Phase 1 — CopyrightHolder / CopyrightBlock / Attribution
├── contracts/
│   └── copyright.md     # Phase 1 — parse/render contract, P1..P9 + fixture obligation
├── corpus-scan.py       # Evidence + FR-014 fixture harvester (reproducible)
├── corpus-scan.out.txt  # Committed scan output
└── tasks.md             # Phase 2 — NOT created here (/speckit-tasks)
```

### Source code

```text
packages/contracts/src/
├── copyright.ts              # NEW: CopyrightHolder, CopyrightBlock, ParseResult,
│                             #      parseCopyright(), renderLicense(), MIT_BODY constant
├── copyright.test.ts         # NEW: fixture table (FR-014) + round-trip (P7)
└── attribution.ts            # NEW: Attribution

packages/engine/src/
├── scaffolder/index.ts       # EDIT: LICENSE.md from renderLicense(), not the displayName
│                             #       template; populate IRHeader.copyright;
│                             #       buildKpsContent gains <Copyright>/<Author>
├── output/github.ts          # EDIT (D7): retain `name`/`email` in verifyToken's parse
└── base-browser/
    └── base-browser.ts       # EDIT (Slice B): fetch the base's LICENSE.md into the VFS

packages/studio/src/
├── stores/workingCopyStore.ts   # EDIT: hold Attribution (persists via the 034 draft)
└── survey/questions/a/          # (Slice A) revive the three demoted modules onto the
                                 #  live flow — YAML membership only; prompt text is
                                 #  Content-owned (Article VI)

content/flows/
└── identity_lite.modular.yaml   # EDIT: +author_display_name, +author_contact_email,
                                 #        +pa_copyright_holder
```

**Structure Decision**: the pure functions go in **contracts**, not engine. They are shared
vocabulary — the scaffolder renders with them and (Slice B) the base reader parses with them —
and contracts is already where zod-mirrored pure types live. It also keeps the riskiest logic
in the package with the lowest dependency weight, so its fixture suite runs without the engine
or a browser environment.

## Implementation order

Slice A:

1. Widen `verifyToken` to retain `name`/`email` (D7). Isolated, testable alone.
2. Add `Attribution` + `copyright.ts` to contracts with the harvested fixture table. **Pure,
   no integration** — the whole risk surface lands here, tested in isolation, before anything
   consumes it.
3. **Verify D8's open question**: does a base-derived keyboard already preserve the base's
   `COPYRIGHT` store through parse → emit? Stubs are write-if-absent, so it may. This changes
   how much of US2 remains and must be measured, not assumed.
4. Hold `Attribution` on the working-copy store; revive the three questions in the flow YAML.
5. Emit: `LICENSE.md` via `renderLicense`, `IRHeader.copyright`, `.kps <Copyright>`/`<Author>`.
6. Assert SC-003 — all three artifacts agree — at the scaffolder boundary.

Slice B:

7. Fetch the base's `LICENSE.md` into the VFS (FR-011).
8. Wire `parseCopyright` at instantiation; apply D4 precedence and record disagreements.
9. Accumulate per D3/P8; block per D5 with the manual-entry escape hatch.
10. E2E: derive from a real base, confirm the original line survives byte-identically.

Step 3 is deliberately early. It is cheap, and it is the one place this plan rests on an
inference rather than a verified fact.

## Complexity Tracking

| Item | Why it is here | Mitigation |
|---|---|---|
| Copyright parsing of free-text legal notices | Unavoidable — MIT requires retaining the original notice, and 920 real files are not uniform | Two pure functions, corpus-harvested fixtures (FR-014), failure-as-a-value (P1); no fuzzy matching (P8) |
| D5 can block a user completing a walk | The alternative silently strips a copyright notice | Manual-entry escape hatch; the block is never a dead end |
| Article VI boundary crossing on survey text | Attribution needs questions, questions are Content-owned | Engine lands YAML membership + wiring; prompt rewording raised separately for Content |

**No constitution violations.** One boundary crossing (Article VI) with a recommended split,
and one adjacent constraint flagged for a future feature (Article VII, multi-language
`welcome.htm`).
