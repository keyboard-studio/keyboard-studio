# content/recognizer-rules/

Curated rules that teach the pattern recognizer which IR node clusters to lift
into `Pattern` instances with `origin: 'recognized'`.

## Relationship to `content/patterns/`

`content/patterns/` defines what a pattern *is* — its survey questions, KMN
fragment template, and test vectors. A pattern YAML is used by the survey and
scaffolder.

`content/recognizer-rules/` defines how to *find* patterns in an existing
keyboard's `KeyboardIR`. A recognizer rule YAML is used by the recognizer engine
(`packages/engine/src/recognizer/`) at import time. Each rule:

1. Describes an IR node cluster shape (which `IRRule`, `IRStore`, and `IRGroup`
   field values indicate "this is an S-02 deadkey family").
2. Names the `Pattern` to lift when the cluster matches.
3. Describes how to extract slot values from the matched nodes.

Recognition is a separate pass from authoring. A user may start a session from
an imported keyboard (IR already exists) instead of from the survey.

## Format status — ratified: TypeScript (issue #232 closed)

Issue #232 closed and ratified **TypeScript predicates** as the canonical rule format. The YAML files in this directory (`s01-direct-substitution.yaml`, `s02-deadkey-single-tap.yaml`) are **reference documentation** — design notes that informed the decision and serve as pre-work for issue #273. They are not parsed by any code.

The working recognizer rules are TypeScript files in `packages/engine/src/recognizer/rules/`. Implement new rules by implementing the `RecognizerRule` interface from `packages/engine/src/recognizer/types.ts`.

<details>
<summary>Historical YAML format (reference only — not parsed)</summary>

Fields in each file:

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Unique rule identifier; matches the `Pattern.id` it lifts to |
| `strategyId` | yes | S-XX strategy this rule targets |
| `patternRef` | yes | Repo-root-relative path to the corresponding pattern YAML (e.g. `content/patterns/desktop-input/deadkey-single-tap.yaml`). Always resolved from the repository root, not relative to this file's directory. |
| `description` | yes | Human-readable summary of what this rule detects |
| `predicate` | yes | Machine-readable IR cluster match spec (see below) |
| `lifts_to` | yes | How to populate the lifted `Pattern` instance |
| `corpus_evidence` | recommended | Keyboards that validate this rule; required for AC |
| `format_status` | yes | `provisional` until #232 closes; `ratified` after |

### Predicate block structure

```yaml
predicate:
  cluster_type: <string>          # human label, e.g. "three-rule-deadkey"
  shared_key: <field>             # IR field that links rules in the cluster
  rules:                          # one entry per role in the cluster
    - role: <trigger|fan-out|escape|single>
      context_pattern:            # ContextElement[] constraints
        - kind: <vkey|deadkey|any|char|index|raw>
          constraints: { ... }
      output_pattern:             # OutputElement[] constraints
        - kind: <char|deadkey|index|beep|outs|raw>
          constraints: { ... }
  store_constraints:              # IRStore-level checks
    - store: <slot name>
      isSystem: false
      items_kind: <char|vkey|deadkey|raw>
      same_length_as: <other store slot name>
  group_constraints:
    usingKeys: true
    all_rules_same_group: true
  disqualifiers:                  # conditions that veto the match
    - <description>
  combinedWith_if:                # optional combinesWith inference
    - condition: { ... }
      add: <S-XX>
```

### Slot mapping block structure

```yaml
lifts_to:
  origin: recognized
  patternId: <id>
  slot_mapping:
    <slotId>:
      source: <ir_field_path>     # dot-path into the matched cluster
      transform: <optional>       # e.g. "store_items_to_string"
```

</details>

## File naming

The reference YAML files in this directory are named `s<NN>-<strategy-slug>.yaml`, matching the S-XX identifier in
`spec.md §7.3`. This makes the priority order from issue #240 immediately
visible in a directory listing.

## Priority order (issue #240 first pass)

1. `s02-deadkey-single-tap.yaml` — S-02 deadkey composition; most common in
   `release/` Latin keyboards (12/20 scanned keyboards).
2. `s01-direct-substitution.yaml` — S-01 simple swap; simple but widespread.
3. `s07-diacritic-cycling.yaml` — S-07 cycling; important for several SIL
   keyboards. **Not yet authored.**
4. `s05-mnemonic-spelling.yaml` — S-05 Hausa-style. **Not yet authored.**
5. S-09 and others as time permits.

## Adding a new rule

1. Read the matching Pattern in `content/patterns/` for the slot structure.
2. Read `packages/engine/src/recognizer/types.ts` for the `RecognizerRule` interface.
3. Implement `match(ir: KeyboardIR): MatchResult[]` and `lift(match: MatchResult): Pattern` in a new file under `packages/engine/src/recognizer/rules/s<NN>-<slug>.ts`.
4. Register the new rule in the recognizer's rule registry.
5. Add unit tests alongside the rule file.
6. The YAML files in this directory may serve as design notes when authoring new rules.
