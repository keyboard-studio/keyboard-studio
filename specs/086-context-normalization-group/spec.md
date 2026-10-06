# Feature Specification: Context normalization group

**Feature Branch**: `086-context-normalization-group`

**Created**: 2026-10-06

**Status**: Draft

**Input**: User description: "Context-normalization group: a cached, generated alternative to spec 062's per-rule variant generation. Insert a single context-only normalization group in front of the keyboard's entry group that rewrites the end of the context from any pasted NFC/NFD alternate into the exact form the keyboard itself produces, then hands the keystroke to the keyboard unchanged. The keyboard's own rules are never edited. The solution must be computed once per keyboard and reused: derive the output repertoire statically, generate deterministically, cache by keyboard source; the simulator verifies in the corpus harness only."

**Governing context**: [spec.md](../../spec.md) §3c (defaults are the product; propose-then-confirm; output must not change), §9 (normalization posture), §10 (validator layering). The capability (a keyboard behaves the same over composed and decomposed text) is defined by [062-canonical-context-tolerance](../062-canonical-context-tolerance/AS-BUILT.md) and is not re-derived here. The author-facing path (finding, propose, preview, confirm) is [078-context-tolerance-wiring](../078-context-tolerance-wiring/spec.md), shipped. This spec replaces the **engine mechanism** behind that path. The output-side mark reorder group is [076-rule-behaviours](../076-rule-behaviours/spec.md) User Story 3; this feature must coexist with it.

## Why this exists

Spec 062's generator makes a keyboard tolerant by adding a variant of every rule whose context breaks on the other normalization form. On `sil_yoruba8`, the keyboard the corpus harness was built around, that means:

- **325 added rules.** The emitted source grows from 231 to 569 lines.
- **55 added compile errors.** Diagnostics go from 11 to 66.
- **A changed backspace.** One generated rule matches the *precomposed* letters, so backspace after `à` would leave `a` instead of deleting the letter. That changes behaviour on composed text, which the feature exists to protect.

A spike (2026-10-06) tried a different shape and measured it. Leave every rule alone. Put one small step in front of the keyboard that rewrites the tail of the existing text into the form the keyboard itself produces. Then let the keyboard run exactly as before. On `sil_yoruba8` this needs **9 rules**, adds **no** compile errors, needs **no** backspace rules, and leaves typed output byte-identical. The same generator, run on six more keyboards, needed between 1 and 49 rules each, with typed output unchanged and every pasted-text probe passing (see [Evidence](#evidence-from-the-spike)).

The spike also showed the expensive part is not generating the step but *learning what the keyboard outputs*. It did that by simulating about 65,000 keystrokes per keyboard. A keyboard's answer does not change unless its source changes, so computing it on every compile or every visit is waste. This spec requires the step to be derived without simulation, computed once per keyboard source, and reused.

## Clarifications

### Session 2026-10-06

- Q: Rewrite pasted text on every keystroke, or only when the pressed key acts on it? → A: Every keystroke (FR-018). The NFC-equal rewrite of adjacent pasted text is accepted.
- Q: What happens to the spec 062 per-rule variant generator? → A: Fallback only. The normalization step is the default proposal; the 062 generator is offered only where the step refuses (FR-019).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A keyboard handles pasted composed and decomposed text without changing what it types (Priority: P1)

As an end user typing with a keyboard built in Keyboard Studio, I want a tone or accent key to work the same whether the letter before the cursor was typed by this keyboard, pasted from elsewhere, or re-normalized by the host application. Nothing I type into an empty field should come out differently than before.

**Why this priority**: This is the whole promise of spec 062, delivered without the 062 generator's side effects. It is independently valuable even with no studio UI: a generated keyboard that behaves this way is shippable.

**Independent Test**: Take `sil_yoruba8` with the generated step added. Paste decomposed `ẹ` (`e` + U+0323) and press the acute key: the result is `ẹ́` exactly as when `ẹ` was typed. Type any key sequence into an empty field: the output is byte-identical to the unmodified keyboard.

**Acceptance Scenarios**:

1. **Given** a keyboard with the generated step, **When** text the keyboard can produce is present in its other normalization form and the user presses a key, **Then** the result equals the result of pressing that key after the keyboard's own form.
2. **Given** a keyboard with the generated step, **When** the user types any key sequence starting from empty text, **Then** the output is byte-identical to the unmodified keyboard.
3. **Given** pasted decomposed text before the cursor, **When** the user presses backspace, **Then** the whole letter is deleted, as it is after the keyboard's own composed form. No backspace rules are generated to achieve this.
4. **Given** a keyboard whose own output is mixed (some letters precomposed, some combining sequences), **When** either form of any produced letter is pasted, **Then** it is treated as the form the keyboard produces for that letter, not as NFC or NFD globally.

---

### User Story 2 - The step is computed once per keyboard and reused (Priority: P1)

As an author (and as the studio acting for them), I want the tolerance step for a keyboard to be worked out once and reused every time I open, compile, or export that keyboard, until its source changes.

**Why this priority**: The user requirement is explicit: a solution, once found, is not recalculated. It also makes the step usable inside the 300 ms validation cycle (D3), which simulation-based derivation cannot be.

**Independent Test**: Generate the step for a keyboard twice from the same source: the two results are byte-identical and the second comes from the cache with no keystroke simulation. Change one rule in the source: the step is regenerated.

**Acceptance Scenarios**:

1. **Given** a keyboard source for which a step has already been generated, **When** the step is requested again, **Then** the stored step is returned without re-deriving it.
2. **Given** the keyboard source changes, **When** the step is requested, **Then** it is regenerated and the stored copy replaced.
3. **Given** the generator itself changes version, **When** the step is requested, **Then** stored steps from the old version are not reused.
4. **Given** the authoring path, **When** the step is derived or retrieved, **Then** no keystroke simulation runs.

---

### User Story 3 - The author accepts or declines the step through the existing tolerance surface (Priority: P2)

As an author, when the studio reports that my keyboard breaks on decomposed or composed text (spec 078), I want the proposed fix to be this step. I want to see how many rules it adds and a few before/after examples, and to accept or decline it as one decision.

**Why this priority**: Spec 078 already owns the surface. This story only changes what is proposed behind it, so it depends on Stories 1 and 2 but adds little new UI.

**Independent Test**: Import `sil_yoruba8`; the context-tolerance finding appears as today. The proposal shows "adds 9 rules, no changes to your rules" with examples. Accepting adds the step. Declining leaves the keyboard byte-identical.

**Acceptance Scenarios**:

1. **Given** a tolerance finding, **When** the author opens the proposal, **Then** it states the number of added rules, that no existing rule is changed, and shows representative pasted-text examples with before and after results.
2. **Given** the author accepts, **When** the keyboard is saved or exported, **Then** the step is present and the decision is recorded in the decision trail.
3. **Given** the author declines, **Then** the keyboard source is unchanged.
4. **Given** a keyboard the step cannot be generated for, **Then** the proposal is not offered and the reason is shown, never a partial step.

---

### User Story 4 - The corpus harness verifies each generated step once (Priority: P2)

As a maintainer, I want the corpus harness to check every generated step by simulation, typed output unchanged and pasted alternates tolerated, once per keyboard version. I want the result stored with the step so regressions are caught in CI and never re-measured in the authoring path.

**Why this priority**: The no-simulation authoring path is only trustworthy if a simulated check stands behind it.

**Independent Test**: Run the harness on the seven spike keyboards: each reports typed output identical and 100% of pasted probes passing. Rerunning without source changes reuses the stored results.

**Acceptance Scenarios**:

1. **Given** a keyboard version with a generated step, **When** the harness runs, **Then** it reports typed-output equality and pasted-probe pass rates, and stores them against the keyboard source.
2. **Given** any typed-output difference, **Then** the harness fails for that keyboard.

---

### Edge Cases

- **Mixed output forms** (`sil_yoruba8`: `á` precomposed, `e` + U+0329 + U+0301 not NFC). The target is the produced form per cluster, never a global NFC/NFD choice.
- **Marks typable in either order** (`sil_cameroon_qwerty`: `a◌́◌̧` and `a◌̧◌́`). Both share one NFC form, so the pasted form is ambiguous. Any produced order is acceptable; the choice is deterministic.
- **Both forms of a cluster produced** by the keyboard itself. That alternate is left untouched; rewriting it would change typed output.
- **Precomposed letters the keyboard cannot produce** (pasted `ạ` into `sil_yoruba8`). Out of scope; left as is.
- **Option stores** (`if(style='dot')` in `sil_yoruba8`). The repertoire is the union over option states.
- **Touch layouts** that emit text directly from a key. Those outputs are part of the repertoire.
- **Base-layout fallback.** Keys with no matching rule emit the base layout's character; those characters are part of the repertoire.
- **Mnemonic layouts.** KeymanWeb drops `[K_BKSP]` rules in mnemonic keyboards. The step adds none, so it is unaffected; the keyboard's own dropped rules stay dropped (not this feature's concern).
- **Deadkeys.** Invisible in the text, so not part of any cluster; the step never matches or removes them.
- **An existing output reorder group** (076 US3). The step runs before the keyboard; the reorder group after. Produced forms are measured *after* reordering.
- **A keyboard already containing a generated step.** Regeneration replaces it, never stacks a second.
- **Very large keyboards** (`vietnamese_telex`, about 72,000 rules). Generation must stay within the time bound, or the keyboard is refused with a reason.
- **Pasted text next to the cursor is rewritten on any key**, even a plain letter (`a◌́` then `b` gives `áb`). The result is NFC-equal but not byte-equal to the pasted text. Accepted (FR-018).

## Requirements *(mandatory)*

### Functional Requirements

**Repertoire and target form**

- **FR-001**: The system MUST derive, from the keyboard source alone and without keystroke simulation, the set of character clusters the keyboard can produce, with the exact code-point form of each. Sources are rule outputs and the stores they index, touch-layout key outputs, and base-layout fallback characters for keys without rules, across all option states.
- **FR-002**: For each producible cluster whose NFC or NFD form differs from it, the target of normalization MUST be the produced form itself, not a global NFC or NFD choice.
- **FR-003**: The system MUST generate mappings only for the NFC and NFD alternates of producible clusters. It MUST NOT map clusters the keyboard cannot produce.
- **FR-004**: When one alternate corresponds to more than one produced cluster (same NFC form, different mark order), the system MUST map it to one of them by a deterministic rule and record which.
- **FR-005**: When an alternate is itself a produced cluster, the system MUST NOT map it.

**The step**

- **FR-006**: The system MUST add a single normalization step that runs before the keyboard's own processing on every keystroke. The step MUST rewrite only the end of the existing text, then pass the same keystroke to the keyboard's entry point unchanged. The step MUST NOT consume the keystroke: the spike verified that a keystroke-consuming step followed by "no match, continue" does not pass the key on.
- **FR-007**: The keyboard's existing rules, stores, and groups MUST NOT be edited. The only change outside the added step is redirecting the keyboard's entry point to the step.
- **FR-008**: The step MUST be expressed in a small fixed set of compact, store-indexed rule shapes:
  - rewrite a letter and pass any following marks through;
  - compose a letter and a mark, one rule per mark;
  - compose a last mark while passing a middle mark through, over a learned set;
  - rewrite a letter with a fixed first mark and pass the rest through;
  - literal fallback.

  The shapes MUST be chosen to minimize rule count. A shape that passes marks through MUST be admitted for a letter only if it can never match a produced cluster and agrees with every known mapping it covers.
- **FR-009**: The step MUST NOT include backspace rules. Backspace after a pasted alternate MUST behave as after the produced form, by virtue of the rewrite.
- **FR-010**: Adding the step MUST NOT add compile errors or warnings beyond those of the unmodified keyboard, for any target the keyboard declares.
- **FR-011**: Generation MUST be idempotent. Regenerating replaces a previously generated step (identified as generated), and removing the step restores the keyboard's original entry point exactly.
- **FR-012**: When the step cannot be generated, the system MUST refuse with a stated reason and generate nothing, never a partial step. Cases include no Unicode entry point, an entry point that cannot be redirected, or the time bound exceeded.

**Behaviour guarantees**

- **FR-013**: For every keystroke sequence starting from empty text, output with the step MUST be byte-identical to the unmodified keyboard.
- **FR-014**: For every producible cluster and every key that acts on it, pressing the key after either alternate MUST give the same result as pressing it after the produced form (byte-exact, within FR-004).

**Compute once**

- **FR-015**: Generation MUST be deterministic: the same keyboard source and generator version always produce a byte-identical step.
- **FR-016**: The generated step MUST be stored, keyed by the keyboard source content and the generator version, and reused until either changes.
- **FR-017**: Deriving, generating, or retrieving the step MUST NOT run keystroke simulation. Simulation of the step runs only in the corpus harness (User Story 4), once per keyboard version, with results stored alongside it. The existing spec 078 tolerance diagnostic, which simulates in the background after each preview compile, is unchanged by this feature (see [research.md R7](research.md#r7-authoring-path-and-caching)).

**Author path and coexistence**

- **FR-018**: The step MUST run on every keystroke, rewriting pasted text adjacent to the cursor into the produced form whatever key is pressed. Pasted `a◌́` followed by `b` becomes `áb`. That is NFC-equal to the pasted text, and it is what lets backspace work without rules (FR-009).
- **FR-019**: The normalization step MUST be the default proposal. The spec 062 per-rule variant generator MUST remain available only as a fallback, offered for keyboards the step refuses under FR-012.
- **FR-020**: Through the spec 078 surface, the proposal MUST state the added rule count, that no existing rule changes, and representative before/after examples. Acceptance MUST be one decision for the whole step, recorded in the decision trail. Declining leaves the source unchanged.
- **FR-021**: The step MUST coexist with an output-side reorder group (076 US3). Produced forms are those *after* any output reordering, and the step and reorder group MUST NOT be merged or duplicated.

### Key Entities

- **Output repertoire**: The set of character clusters a keyboard can produce, each in its exact produced form. Derived from the keyboard source; the input to everything else.
- **Alternate**: The NFC or NFD form of a produced cluster, when it differs from the produced form. What arrives from paste, other keyboards, or host re-normalization.
- **Normalization map**: Alternate to produced form, with the deterministic choice recorded for ambiguous cases.
- **Normalization step**: The generated block of compact rules plus the redirected entry point. Identified as generated, so it can be replaced or removed.
- **Stored step**: The step, keyed by keyboard source content and generator version, with its rule count and, once the harness has run, its verification result.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On the seven spike keyboards, typed output is byte-identical to the unmodified keyboard for every key sequence of up to two keys over the full key set (35,532 sequences each).
- **SC-002**: On the same keyboards, 100% of pasted-alternate probes for producible clusters give the same result as the produced form.
- **SC-003**: Added rule counts do not exceed the spike's: `el_dinka` 1, `fv_northern_tutchone` 1, `fv_tlingit` 6, `sil_yoruba8` 9, `el_pan_sahelian` 12, `sil_cameroon_qwerty` 23, `sil_tchad` 49.
- **SC-004**: `sil_yoruba8` with the step reports the same compile diagnostics as without it (9 errors, all pre-existing), against 66 under the spec 062 generator.
- **SC-005**: Requesting the step for an already-processed keyboard source returns in under 1 second with no keystroke simulation. First generation completes in under 5 seconds for 95% of the corpus.
- **SC-006**: Across the harness corpus, no keyboard with an accepted step shows any typed-output difference (zero tolerance), and the harness reports pasted-probe pass rates per keyboard.

## Evidence from the spike

Measured 2026-10-06 against headless KeymanWeb builds, comparing each keyboard with and without a generated step. "Original fails" counts the same pasted probes on the unmodified keyboard.

| Keyboard | Own rules | Added rules | Typed output | Pasted probes | Original fails |
|---|---|---|---|---|---|
| `el_dinka` | 63 | 1 | identical | 32 / 32 | 8 |
| `fv_northern_tutchone` | 418 | 1 | identical | 264 / 264 | 132 |
| `fv_tlingit` | 146 | 6 | identical | 534 / 534 | 152 |
| `sil_yoruba8` | 147 | 9 | identical | 8,194 / 8,228* | 619 |
| `el_pan_sahelian` | 38 | 12 | identical | 2,086 / 2,086 | 301 |
| `sil_cameroon_qwerty` | 269 | 23 | identical | 1,814 / 1,814 | 49 |
| `sil_tchad` | 78 | 49 | identical | 3,500 / 3,500 | 881 |

\* `sil_yoruba8` was hand-built before the generator and probed with a wider string set. All 34 non-exact cases are pasted `ạ`, which the keyboard cannot produce (out of scope under FR-003).

Keyman behaviours confirmed during the spike:

- A context-only group called from the entry point leaves the keystroke for the next group. A keystroke-consuming group with "no match, continue" does not.
- `if()` occupies a position for `index()` offsets.
- `index()` in a context matches the same item as an earlier `any()`.
- A group may call itself, so a rewrite can finish in several steps.

The spike scripts and per-keyboard generated steps are kept outside the repository, in the handoff folder `yoruba8-context-tolerance/` (`normgen/`). They are not a durable reference; this table is.

## Assumptions

- KeymanWeb behaviour is representative of the other Keyman engines for context-only groups and `match`/`nomatch` chaining. Only KeymanWeb was simulated (see Open questions).
- Pasted and host-normalized text arrives in NFC or NFD, so canonical mark order is the only reordering to undo.
- The base layout for fallback characters is the one the harness already uses (US positional for non-mnemonic keyboards).
- The spec 078 surface, decision trail, and corpus harness exist and are reused as is.
- Rule count is minimized well, not optimally. The seven spike counts are the bar, not a proven minimum.

## Out of scope

- Changing Keyman itself.
- Backspace behaviour in mnemonic layouts (KeymanWeb drops those rules regardless).
- Reconstructing the typed mark order of a pasted cluster beyond "any order the keyboard produces".
- Optimal minimization, such as a two-pass reorder-then-compose step (`sil_tchad` is likely reducible further).
- Precomposed letters the keyboard cannot produce.

## Open questions

- **Other engines.** Does the step behave identically on Keyman for Windows, macOS, Linux, iOS and Android? Verification on at least one desktop engine is needed before this replaces the 062 mechanism by default.
- **Reorder group ordering.** If a keyboard carries both this step and a 076 output reorder group, is the measured produced form stable across engines?
- **Cache home.** Where does the stored step live: alongside the working copy, in the harness output, or both? This is a planning decision; FR-016 only requires that it exists and is keyed correctly.
