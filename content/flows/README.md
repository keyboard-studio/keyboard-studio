# Flow YAML — Schema Reference

Flow YAML files define the question sequences that guide a language expert through
the keyboard-studio intake process. There are two related file shapes: **templates**
(question definitions) and **completed instances** (recorded answers).

---

## Template format

A template file defines the questions presented to the user. Each file has a top-level
`flow_id`, optional metadata, and a `questions` list.

```yaml
flow_id: phase_a_identity        # unique identifier for this flow
phase: "A"                       # spec §8 phase letter

# Key outputs (informational comment — not parsed)
# routing_group: derived from layout_family answer
# script_family: derived from script_family answer (non-Roman only)

questions:
  - id: language_name_autonym    # stable snake_case identifier
    prompt: "What is the name of your language in your own language?"
    help_text: >
      Write the name your community uses. This appears on the keyboard package
      exactly as you type it.
    type: text                   # see Types section below
    required: true
    next: language_name_english  # unconditional — always go to this question next
```

### Question fields

| Field | Required | Description |
|---|---|---|
| `id` | yes | Stable snake_case key. Used as `questionId` in completed instances. |
| `prompt` | yes (unless `engine_resolved`) | The question shown to the user. Plain language; no technical jargon. |
| `help_text` | yes (unless `engine_resolved`) | One or two friendly sentences expanding on the prompt. Rendered as always-visible secondary text directly below the prompt — not a tooltip or collapsible. Write it assuming it is always seen alongside the prompt. |
| `type` | yes (unless `engine_resolved`) | Input type — see Types below. |
| `options` | when type is `select`, `radio`, or `multi_select` (and not seeded via `options_source`) | List of `{value, label}` pairs. |
| `options_source` | when type is `autocomplete`, or a runtime-seeded `multi_select` | Data-source token (e.g. `@langtags_iso639`, `@picker_candidates_seeded`). |
| `required` | yes (unless `engine_resolved`) | `true` or `false`. |
| `next` | yes | Routing rule — see Branching below. |
| `engine_resolved` | no | Optional boolean. When `true`, the question is never shown to the user; the engine evaluates its `next` rules from context and prior answers (never `value`) and jumps directly. `prompt`, `help_text`, `type`, `options`, and `required` are ignored and should be omitted. Used for routing nodes that branch on Phase A state. |

### Types

| Type | Description |
|---|---|
| `text` | Free-form single-line text input. |
| `select` | Drop-down with a fixed list of options. |
| `autocomplete` | Searchable list; `options_source` names the data provider. |
| `radio` | Mutually-exclusive option buttons (short lists). |
| `bool` | Yes / No toggle. |
| `multi_select` | Checkbox grid; zero or more options may be selected. Answer `value` is a comma-and-space-delimited token string, e.g. `"U+0301, U+0300, U+0304"`. An empty selection is encoded as an empty string `""`. `options_source` may be used instead of a literal `options` list when the grid is seeded at runtime (e.g. `@picker_candidates_seeded`). |
| `notice` | Informational terminal screen shown to the user with no input. Used to surface a message (e.g. the §16 "not yet supported" stub) and end the flow (`next: null`). Has `prompt` and `help_text`; no `options` or answer value. |

Options are objects with `value` (the stored token) and `label` (the display string).

```yaml
options:
  - value: Latn
    label: "Latin (A, B, C ...)"
  - value: Arab
    label: "Arabic"
```

### Branching (`next`)

**Unconditional** — always proceed to the named question:

```yaml
next: some_question_id
```

**Terminal** — the flow ends here:

```yaml
next: null
```

**Conditional** — a list of rules evaluated top-to-bottom; first match wins.
A `default` catch-all is required and must appear last:

```yaml
next:
  - condition: "value == 'non-roman'"
    goto: script_family
  - condition: "value == 'azerty'"
    goto: layout_family_confirm
  - default: author_display_name
```

The engine evaluates rules in order; the first matching rule's `goto` target is
used.

`condition` expressions may reference any of three namespaces:

| Reference | Meaning |
|---|---|
| `value` | The current question's own answer (the common case). |
| `answers.<questionId>` | Any earlier answer in the same flow, by question id. |
| `ctx.<key>` | An engine-computed context value set before this phase began. |

Valid `ctx` keys carried from Phase A into Phase B:

- `ctx.routing_group` — `"qwerty-qwertz"` \| `"azerty"` \| `"non-roman"`.
- `ctx.script_family` — `"indic"` \| `"sea"` \| `"rtl"` \| `"syllabic"` \| `"alpha-nonlatin"` \| `"other"`
  (only set when `ctx.routing_group == "non-roman"`). Note: `logographic` (CJK) is NOT a valid `ctx.script_family` value — CJK (Han, Hangul) and Ethiopic are detected at the Phase A `primary_script` step and routed to the §16 `notice` stub before this context is ever set.

```yaml
next:
  - condition: "ctx.routing_group == 'non-roman'"
    goto: pb_non_roman_branch
  - default: pb_standard_letters
```

The bare `value == '...'` form remains valid and refers to the current
question. An `engine_resolved` question's conditions must use only `ctx.*` or
`answers.*` (never `value`, since it is never answered).

### Template variables

Some prompts contain `{{variable}}` placeholders that the engine fills at
render time. These are NOT user answers — they come from engine-computed context:

| Variable | Source |
|---|---|
| `{{detected_group}}` | Auto-detected routing group from Phase A heuristics (spec §9). |
| `{{language_name}}` | The `language_name_autonym` answer from earlier in the same flow. |

Template variables may appear in `prompt`, `help_text`, and option `label`
strings. Do not put them in `id` or `value` fields — those are stored tokens and
must be literal strings.

---

## Completed-instance format

A completed instance records the answers a user gave for a specific keyboard project.

```yaml
flow_id: phase_a_identity   # must match the template's flow_id
phase: "A"

answers:
  - questionId: language_name_autonym   # matches question id in template
    value: "Fà'"
  - questionId: language_name_english
    value: "Bafut"
  # ... one entry per question that was shown to the user

# Computed from answers (informational — not part of SurveyAnswer[]):
computed_axes:
  scriptClass: alphabetic
routing_group: qwerty-qwertz   # RoutingGroup value derived from layout_family answer
```

The `answers` array is compatible with `SurveyAnswer[]` from `packages/contracts`:
each entry has exactly `questionId` (string) and `value` (string). No extra fields.

Questions that were not shown (because a branch skipped them) are omitted from
the array entirely.

The `computed_axes` and `routing_group` fields below the answers array are
informational — they document what the engine computed from the answers but are
not part of the `SurveyAnswer` contract. `computed_axes` uses shorthand axis
labels (e.g. `A1`, `A4`); the corresponding TypeScript field names live in
`DiscoveryAxisVector` (`packages/contracts/src/axes.ts`) and may differ.

**Carrying context across phases.** A later phase may need a value an earlier
phase computed. The engine promotes the informational footer values of a
completed phase into a `ctx.<key>` namespace before the next phase runs — e.g.
Phase A's `routing_group` and `script_family` become `ctx.routing_group` and
`ctx.script_family`, which Phase B conditions read (see Branching).

**Question-id prefixing.** Phase A ids are unprefixed (`language_name_autonym`);
later phases prefix their ids by phase (Phase B uses `pb_`) so answers from
multiple phases never collide if merged into one map. New flows should follow
the per-phase prefix convention; existing Phase A ids are stable and are not
retro-prefixed.

---

## Provenance section

Templates may include an optional `provenance_questions` block after the main
`questions` list. These questions map to `KeyboardProvenance` fields in
`packages/contracts/src/provenance.ts` and are always `required: false`.
The studio presents them as a clearly-marked optional section.

Provenance data is serialized into the GitHub PR body and package metadata at
output time (spec §12). It is never written into the `.kmn` source file.

---

## Files in this directory

| File | Shape | Description |
|---|---|---|
| `phase_a_identity.yaml` | Template | Phase A identity and routing questions (spec §8 step 3). |
| `phase_b_characters.yaml` | Template | Phase B character-inventory discovery questions (spec §8 step 4). Branches on `routing_group` and `script_family` from Phase A. |
| `_examples/phase_a_bafut.yaml` | Completed instance | Hypothetical Bafut keyboard — shows expected Phase A answer shape. |
| `_examples/phase_b_bafut.yaml` | Completed instance | Hypothetical Bafut keyboard — shows expected Phase B answer shape (routing_group: qwerty-qwertz, primary_strategy: S-02). |

---

## Relationship between template and example

`_examples/phase_a_bafut.yaml` is a filled-in instance of `phase_a_identity.yaml`.
The `questionId` values in the example's `answers` array map 1:1 to the `id`
fields in the template. The example also shows the `routing_group` and
`script_family` values that the engine derives from the answers.
