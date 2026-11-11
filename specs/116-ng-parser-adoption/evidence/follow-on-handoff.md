# Follow-on spec handoff: breaking IR restructure (B3 → B1 → B2)

Spec 116 does not create this spec or its issue. The owner does.

## Number

**117** is the next free number, checked 2026-11-10:

- `main` holds `specs/` folders up to `114-ctrl-and-letter-removal`.
- Remote branches claim `115-dialect-language-tags` and `116-ng-parser-adoption`.
- No open PR adds a `specs/NNN-*` folder (`gh pr list --state open`: #2635, #2630, #2625, #2616,
  #2612, none touching `specs/`).

Re-check both before creating it: a number is claimed on a branch before `main` sees it.

## What it carries (spec 116 FR-040, copied)

The follow-on spec carries these changes, **in this order**. Line references are to Keyman's
`kmcmplib` `Compiler.cpp`.

1. **B3, modifier set.** A rule keystroke's modifiers become an unordered set over exactly the nine
   names the compiler accepts: NCAPS, LALT, LCTRL, RALT, RCTRL, ALT, CTRL, CAPS, SHIFT
   (Compiler.cpp:2512–2554, case-insensitive). CTRL and LCTRL stay distinct. Mixing left and right
   modifiers stays representable (it only warns, :2556). There is no NUMLOCK, SCROLL or ALTGR
   spelling. A key map that any format can read is a **derived** engine accessor, never stored in
   the IR.
2. **B1, explicit keystroke.** The keystroke becomes its own field on each rule, and the context
   holds only the pre-context. The keystroke is **one** element. kmcmplib uses only the first
   element and warns on more (:1745), so a multi-element keystroke stays an opaque fragment, even
   though Keyman's newer grammar accepts several. The forms are:
   - a virtual key with modifiers;
   - a quoted character with modifiers, `[SHIFT 'a']` (:2587–2608);
   - a bare character, which must be in the Basic Multilingual Plane (:1740);
   - `any(store)`.

   `outs()` is not a keystroke form.
3. **B2, typed left-hand side.** One field: `match`, `nomatch`, or input. Input has an optional
   leading `nul`, the **head run** of conditions (`if`, `platform`, `baselayout`), the pre-context
   and the keystroke.
   - A condition or `nul` that is not at the head is legal KMN (it only warns, :1514, :1520) and
     stays an in-context element, as spec 103 does today.
   - B2 moves head guards out of the context, which conflicts with spec 103's ratified shape. It
     MUST NOT start without an explicit revision request against spec 103 citing this evidence.

## Gates (spec 116 FR-041, copied)

- A joint engine and content session, and a major version bump of the contracts package.
- **Saved-draft migration.** Drafts store the starting-point IR (`startIr`). The follow-on MUST bump
  the draft envelope version and re-derive `startIr` by re-parsing the saved starting-point files,
  then re-seed the working IR from it. Discarding drafts on a version mismatch is not acceptable.
- Rule-level runtime schemas, because the IR schema passes rule shapes through unchecked today, so
  the existing drift guards would not catch a shape change.
- Offsets unchanged as written (spec 116 FR-033), with tests on guarded rules of the
  `if(...) any(s) + "k" > index(t,2)` shape.
- The spec 103 revision request named under B2 above.

## Rejected alternatives (spec 116 FR-042, copied)

- B4, a format field on opaque fragments: replaced by the importer policy in spec 116 FR-029b.
- Keeping B1–B3 in spec 116: rejected, so the reader swap ships and can be bisected separately from
  the contract change.
- Re-basing `index()` offsets: rejected (spec 116 FR-033).

## Where it starts

Spec 116 already routes every rule-shape read and write through
`packages/contracts/src/rule-shape.ts` (ESLint-enforced), so B1 and B2 change the accessors'
bodies, not their callers. Research R5 is the consumer inventory and the splitter-disagreement
record the follow-on builds on:

- [research.md R5](../research.md#r5--consumer-inventory-rule-shape-phase-1-and-kind-switches-phase-4)
  (R5a splitter disagreements, R5b migration surface, R5c kind-switch holes, R5d pattern data)
- [splitter-disagreements.md](splitter-disagreements.md)
