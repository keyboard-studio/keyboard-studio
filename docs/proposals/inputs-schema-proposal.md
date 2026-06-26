# RFC: A richer `inputs` schema for the `QuestionModule` contract

> **Status: DRAFT / RFC — NOT a settled decision.**
> **Authored: 2026-06-26. For: Matthew Lee's review.**
> Produced by the `/km-lead` crew (km-programmer + km-synthesis design probes,
> synthesized by the KM Team Lead). This proposal explores the `inputs` half of
> the §3.3 question contract. It does **not** edit
> `docs/survey-modularity-cyoa-plan.md` §3.3 — that remains Matt's call. Treat
> every type below as a concrete *starting point* to argue with, not a contract.

---

## 0. The problem (Matt's concern)

§3.3 of the plan introduces a net-new question contract:

```ts
// docs/survey-modularity-cyoa-plan.md:306-313
inputs?: IRPath[];   // answers / IR state read to decide routing or content
writes?: IRPath[];   // KeyboardIR paths this question will populate
```

A flat `IRPath[]` is too weak for **`inputs`**. A question's input dependency
comes in (at least) three distinct kinds, and `IRPath` only names the third:

1. **Step-completion dependency** — *"has a previous step/question been
   completed (answered)?"* A presence/completion boolean, **not** the value.
2. **Prior-response dependency** — *"what answer did the user give to a previous
   question?"* — the response value, keyed by `definition.id`, possibly a field.
3. **IR lookup** — *"read a value at an `IRPath` in `KeyboardIR`."*

`writes`, by contrast, only ever targets the IR — so it stays `IRPath[]`. The
asymmetry is the whole point of this RFC.

Matt: *"I don't know what this is going to look like… this is something we're
going to have to work out as we go."* So this is exploratory. The aim is a
well-reasoned, code-grounded first draft.

---

## 1. The schema

### 1.1 `IRPath` — net-new, proposed as a branded path-string

`IRPath` does not exist today (§3.3:325-341 — it is an explicit P2 deliverable).
`packages/contracts/src/keyboard-ir.ts:288-299` is a nested interface tree
(`KeyboardIR → stores[]/groups[].rules[]` physical;
`touchLayout.platforms[].layers[].rows[].keys[]` touch, `TouchKeyIR` at
`keyboard-ir.ts:65`), **not** a path algebra. Nothing names a location inside it.

**Proposed mechanism: a branded template-literal path-string type.** The §3.3
Design AC leaves the mechanism open (string type vs key-path tuple vs generated
lens). We propose the string form because:

- `inputs`/`writes` are explicitly **"plain data"** (§3.3:318-320) so the
  dashboard, completeness checker, and staleness graph can be built before
  `mutate()` exists. A JSON-/YAML-serialisable string survives manifest
  round-trip; a typed tuple or a lens object does not.
- A template-literal type still satisfies the **Design AC** ("an invalid path is
  a compile error", §3.3:336) by deriving the legal-prefix union from
  `KeyboardIR`, while erasing to a plain string at runtime.
- It is greppable and stable across the `packages/contracts` major bump
  (§3.3:293-300).

```ts
/** Opaque, compile-checked path into the nested KeyboardIR tree. */
type IRPath = string & { readonly __ir: unique symbol };

// Derived (sketch — the real expansion is the P2 deliverable):
//   IRPathOf<KeyboardIR> expands the nested union (keyboard-ir.ts:288-299) into
//   the set of legal dotted/[]-indexed prefixes, including the deep touch path
//   touchLayout.platforms[].layers[].rows[].keys[]. A string not in that union
//   fails typecheck (Design AC §3.3:336; Drift AC §3.3:338-341).
```

> **Alternative considered:** a typed key-path tuple (`["stores", number,
> "items", number]`). Stronger inference at the value end, but it cannot
> round-trip through the YAML manifest as plain data, which the plan requires.
> Rejected for `inputs`/`writes`; could resurface internally inside the lens.

### 1.2 `QuestionInput` — a `kind`-tagged discriminated union

```ts
// in packages/studio/src/survey/types.ts (joins QuestionModule, types.ts:110-141)

import type { AnswerType } from "@keyboard-studio/contracts"; // surveyPhaseResult.ts

type QuestionInput =
  // KIND 1 — step-completion: presence, not value.
  | {
      kind: "step";
      stepId: string;                              // a step/question definition.id
      satisfied?: "answered" | "required-satisfied"; // default "answered"
    }
  // KIND 2 — prior-response: the value a prior question got.
  | {
      kind: "response";
      questionId: string;                          // the producing question's id
      answerType?: AnswerType;                     // narrows the resolved value type
      field?: string;                              // sub-field of a structured answer (reserved)
    }
  // KIND 3 — IR lookup.
  | {
      kind: "ir";
      path: IRPath;
    };
```

### 1.3 The contract change

```ts
interface QuestionModule {
  definition: FlowQuestion;                  // types.ts:111
  validate?: (value: …) => ValidationResult; // types.ts:119
  fixtures: { … };                           // types.ts:132-140

  /** NEW — declared NOW, executed LATER (§3.3:318-320). */
  inputs?: QuestionInput[];   // was IRPath[] (§3.3:312) — now the union above
  writes?: IRPath[];          // STAYS IRPath[] (§3.3:313)

  // mutate stays a STUB until the engine seam (#5b/#232) lands. (types.ts:119-129)
}
```

**Why `inputs` needs the union but `writes` does not.** A *read* draws from two
distinct runtime stores — survey answer state vs `KeyboardIR` — and within answer
state there are two sub-kinds (presence vs value). A *write* has exactly one
target kind: a write only ever populates IR. There is no "write a step-completion"
or "write a prior answer" — answers flow IR-ward through `mutate`, never the
reverse. So `writes` has one target kind and needs no tag; `inputs` has three.

---

## 2. Resolution semantics

The three kinds resolve against two real runtime sources that exist today: the
**answer store** (`SurveyAnswer[]` per phase, `surveyPhaseResult.ts:36-42`; plus
the back-nav `AnswerStackEntry[]`, `types.ts:85-88`) and **`KeyboardIR`**.

| kind | source | "value" | resolved TS type |
|------|--------|---------|------------------|
| `step` | answer stack / phase answers | presence only | `boolean` |
| `response` | `SurveyAnswer` store | the answer value | `AnswerValueMap[answerType]` or the full value union |
| `ir` | `KeyboardIR` at `path` | IR value | the path-derived value type |

- **`step`** — read from the answer stack (`AnswerStackEntry[]`, `types.ts:85-88`)
  or the phase `SurveyAnswer[]`. `"answered"` = an entry for `stepId` exists with
  a defined value. `"required-satisfied"` = answered **and** that module's
  `validate` returns `{ ok: true }` (or `definition.required` is false). Resolves
  to `boolean`; carries no value — this is Matt's kind 1 exactly.
- **`response`** — read from the `SurveyAnswer` discriminated union
  (`surveyPhaseResult.ts:36-42`), matched on `questionId`. When `answerType` is
  supplied, narrow the union and resolve to `AnswerValueMap[answerType]`
  (`surveyPhaseResult.ts:25-33`) — e.g. `"char-list" → string[]`,
  `"boolean" → boolean`, `"select" → string`. Without `answerType`, the resolved
  type is the full `SurveyAnswer["value"]` union. `field` selects a sub-key of a
  structured answer (answers are flat today, so `field` is reserved). A missing
  answer resolves to `undefined`.
- **`ir`** — read `KeyboardIR` at `path` (`keyboard-ir.ts:288-299`). Resolves to
  the value type at that path location (via the lens the `IRPath` mechanism
  derives); `undefined` if an optional ancestor (e.g. `touchLayout?`) is absent.

### 2.1 `resolveInput` signature sketch (types only — no impl)

```ts
type AnswerStore = readonly SurveyAnswer[]; // surveyPhaseResult.ts:36

type ResolvedInput =
  | { kind: "step";     satisfied: boolean }
  | { kind: "response"; value: SurveyAnswer["value"] | undefined }
  | { kind: "ir";       value: unknown }; // refine to the path-derived type via the IRPath lens

declare function resolveInput(
  input: QuestionInput,
  store: AnswerStore,
  ir: KeyboardIR,
): ResolvedInput;
```

### 2.2 How this subsumes today's string conditions

Gating lives today entirely in `definition.next` `FlowGotoRule.condition`
strings, evaluated by `evalCondition` (`SurveyRunner.tsx:35-73`) over two LHS
forms — `value` (this question's own answer) and `ctx.<field>` (a prior answer
promoted into `SurveyContext`, `types.ts:72-78`). **There are 33 such conditions
across 22 question modules.** The union maps onto them:

- `value == 'true'` (`pb_accent_marks_gate.ts:16`), `value == 'other-alphabet'`
  (`pb_standard_letters.ts:35`) → `{ kind: "response", questionId: <this id>,
  answerType: <the question's type> }`; the `== 'x'` becomes a routing predicate
  over the *resolved* value rather than a string eval.
- `ctx.routing_group == 'non-roman'` (`pb_routing_branch.ts:16`) → the `ctx`
  fields (`language_name`/`detected_group`/`script_family`/`routing_group`,
  `types.ts:72-78`) are **derived from prior phase answers**, so each maps to a
  `{ kind: "response", questionId: <the producing question> }` (or, once promoted
  into IR, `{ kind: "ir", path }`). The `ctx` string-index is the legacy escape
  hatch; declared `inputs` name the producing question explicitly and remove the
  stringly-typed `ctx.field` lookup at `SurveyRunner.tsx:59,68`.

This is subsumption **at the data level**: `inputs` *declares* the upstream
dependencies the condition strings *consume*. See §5 risk #2 for the catch.

---

## 3. Worked examples (real questions)

### 3.1 `pb_diacritic_select` — gated on a prior bool answer

`pb_accent_marks_gate.ts` routes `value == 'true' → pb_diacritic_select`
(`pb_accent_marks_gate.ts:15-18`). The diacritic-select question therefore
depends on the accent-marks gate having been answered "true":

```ts
// questions/b/pb_diacritic_select.ts
inputs: [
  { kind: "step",     stepId: "pb_accent_marks_gate" },                       // it ran at all
  { kind: "response", questionId: "pb_accent_marks_gate", answerType: "boolean" }, // == true
],
writes: ["stores[].items[]" as IRPath], // the diacritic store it will populate (illustrative)
```

### 3.2 `pb_non_roman_branch` — gated on derived `ctx` routing

`pb_routing_branch.ts:16` routes `ctx.routing_group == 'non-roman' →
pb_non_roman_branch`. `routing_group` is a derived `SurveyContext` field
(`types.ts:75`) produced upstream from script discovery:

```ts
// questions/b/pb_non_roman_branch.ts
inputs: [
  // routing_group is derived from the script-family answer upstream; name that producer.
  { kind: "response", questionId: "pb_script_family", answerType: "select" },
],
```

This replaces the opaque `ctx.routing_group` index with an explicit edge to the
producing question — which is exactly what the staleness graph (§4) needs.

### 3.3 `language_name_autonym` (Phase A) — an IR-reading question

The Phase-A identity question already touches `KeyboardIR`
(`questions/a/language_name_autonym.ts` is in the `KeyboardIR` grep set). A
question that *reads* the header to validate or pre-fill would declare:

```ts
inputs: [
  { kind: "ir", path: "header.bcp47" as IRPath },  // read existing tag from the IR
],
writes: ["header.name" as IRPath, "header.bcp47" as IRPath],
```

Here all three kinds appear across the three examples: presence (`step`), value
(`response`), and IR lookup (`ir`).

---

## 4. Integration impact

### 4.1 §3.3 — the contract snippet is now stale

`inputs?: IRPath[]` (plan §3.3:312) must become `inputs?: QuestionInput[]`. The
contract major-bump rationale (§3.3:293-300) is unchanged — this is still a
breaking `packages/contracts` change — but the migration of consumers is slightly
larger because `inputs` readers must switch on `kind`.

### 4.2 §3.5 staleness graph — **the load-bearing finding**

§3.5 defines staleness as the transitive closure over **`writes → inputs`** edges
to a fixpoint (plan §3.5:391-397), with a NO-CYCLE acyclicity invariant
(§3.5:398-402) and `joinTarget` rejoin checks. That relation is **IRPath-only**.
Under the union, **only the `ir` kind carries an `IRPath`**; `step` and
`response` carry a **`questionId`**, which is *not* in the `IRPath` space. So:

- **`ir`-kind inputs** join `writes` directly: `prior.writes ∩ this.inputs.ir`.
- **`step`/`response` inputs do NOT join `writes` at all** — a `questionId` and an
  `IRPath` never intersect by type, so these edges are **invisible to the
  fixpoint** as §3.5 is written. Re-answering question X would fail to mark a
  downstream consumer Y stale even though Y's routing/content reads X's response.
  **This is a correctness gap, not a style nit.**

**Proposed fix — the closure runs over the union of two edge relations** over the
same node set (questions/steps):

```
E_ir  = { (p, q) | p.writes ∩ q.inputs(kind="ir").path  ≠ ∅ }   // existing IRPath join
E_qid = { (p, q) | p.definition.id ∈ q.inputs(kind∈{step,response}).questionId }  // NET-NEW
fixpoint over  E_ir ∪ E_qid
```

The NO-CYCLE invariant and the `dashboard/completeness.ts` checks must be computed
over `E_ir ∪ E_qid`, not `E_ir` alone. **§3.5's prose must be updated** or
step/response dependencies leak out of staleness entirely.

### 4.3 §3.4 manifest / `onComplete` reducer

Good fit. The manifest (`steps/manifest.ts`) and its keyed `onComplete` reducer
(§3.4:358-373) are the natural owner of the acyclicity/reachability checks and the
natural *trigger* for staleness recomputation (re-answer or lock-break fires the
reducer → recompute the closure into the net-new `staleness` slice in
`stores/workingCopyStore.ts`, §3.5:413-417). Because `step`-completion inputs ask
*whether a step ran*, they are answered most cheaply from manifest order + the
answer stack — reinforcing that these are a manifest/answer-stack concern, not an
IRPath concern. **Caveat:** the reducer is keyed by *step id* while questions are
keyed by *questionId*; the RFC needs the step↔question id mapping the reducer uses
so `E_qid` edges resolve to manifest step granularity.

### 4.4 Registry + build-time validation

The registry is `Readonly<Record<questionId, QuestionModule>>` merged from
per-phase sub-registries (`registry.ts:25-29`), convention "key MUST match
`definition.id`".

- **`questionId` references (`step`/`response`): not typecheck-enforceable as
  written, but CI-gateable.** `Record<string, …>` keys are `string`, so TS cannot
  prove a referenced id exists. A build-time test iterating
  `Object.keys(questionRegistry)` and asserting every
  `inputs.{step,response}.questionId` is a present key is straightforward — same
  shape as the §7 P2 CI gate. (A stronger typecheck is possible if the registry
  exposes `keyof typeof questionRegistry` and `inputs` is generic over it — larger
  change, flagged as an option below.)
- **`IRPath` references (`ir` kind + all `writes`): typecheck-enforceable by
  design** — exactly the §3.3 Design/Drift ACs (§3.3:336-341). Same mechanism
  covers `ir`-kind inputs and `writes`.

### 4.5 §7 testing

§7.1 already names the per-question assertion: *"declared `inputs` (`IRPath[]`)
are present and well-typed"* (plan §7.1:1011-1014). **That phrasing assumes
`IRPath[]` and is stale under the union.** Per-question tests must branch by kind:

- `ir`-kind: assert the `IRPath` parses and resolves against a `KeyboardIR`
  fixture.
- `step`/`response`: assert the referenced `questionId` resolves in the registry
  (and, ideally, that it is *upstream* per manifest order).

The mirrored test tree (`packages/studio/tests/…`, §7.2) and the P2 "no mirrored
test file ⇒ CI fail" gate (§7.3:1054-1055) are structurally unaffected; only the
input-validation test *body* in §7.1 is rewritten for three kinds. The
`questionId`-existence CI check from §4.4 lands naturally here.

---

## 5. Open questions, risks, alternatives, migration cost

### Open questions
1. **`step` granularity vs `response`.** Is `step`-completion just
   `response`-presence with the value discarded, or a first-class kind? We keep it
   first-class because the staleness graph and the manifest reducer want a cheap
   presence check that never touches answer values — but this is arguably
   collapsible. *Matt's call.*
2. **Should `inputs` be generic over `keyof typeof questionRegistry`** to make
   `questionId` references a compile error (vs a CI gate)? Stronger, but couples
   the contract type to the registry's concrete shape.
3. **`field` on `response`** is reserved for structured answers that do not exist
   yet (answers are flat today). Drop it now, or keep the slot?
4. **Where do derived `ctx` fields live long-term** — promoted into IR (`ir`
   kind) or kept as `response` edges to producing questions? §3.2 example chose
   `response`; the IR-promotion path may be cleaner once `mutate` lands.

### Risks (ranked)
1. **Staleness closure omits `questionId` edges (correctness bug-in-waiting).**
   §3.5 is IRPath-only; `step`/`response` inputs fall out of the fixpoint,
   acyclicity, and `joinTarget` checks. **Fix: union with `E_qid` (§4.2).** This
   is the most important integration finding in this RFC.
2. **Second parallel dependency mechanism.** Nothing binds
   `FlowGotoRule.condition` (33 live usages, `SurveyRunner.tsx:35-73`) to declared
   `inputs`; they will silently drift. **Fix:** add an AC that every
   `ctx.<field>` / upstream-`value` reference in a question's `next` conditions
   must be covered by a declared `inputs` entry (parseable today from the regexes
   at `SurveyRunner.tsx:54,63`). That converts duplication into a checked
   invariant — and gives a concrete **migration path** from condition strings to
   declared `inputs`.
3. **Stale prose.** §3.3:312 (`inputs?: IRPath[]`) and §7.1:1012 ("declared
   inputs (`IRPath[]`)") are written against the wrong shape; left unrevised, the
   P2 test gate and the contract major-bump would target `IRPath[]`. **Fix:**
   revise both to the union and split the §7.1 assertion by kind.

### Migration cost
- `IRPath[] → QuestionInput[]` is a breaking `packages/contracts` change, already
  gated on the §3.3 major bump — no *new* version event, but every `inputs`
  reader gains a `switch (input.kind)`.
- No question declares `inputs` today, so there is **zero existing data to
  migrate** — the cost is entirely forward (authoring + the two CI gates above).
- The condition-string cross-check (risk #2) is the one piece of *back-migration*
  work: a parser over the 33 existing conditions to seed/validate `inputs`.

---

## 6. KM Team Lead verdict

**CONDITIONAL — sound starting point, ship as an RFC for Matt.** The tagged-union
schema and the `writes`-stays-`IRPath[]` asymmetry are well-grounded in the real
contract. The one issue that *must* be resolved before this becomes a decision is
**risk #1**: the §3.5 staleness closure has to gain the `questionId`-keyed edge
relation, or `step`/`response` dependencies silently never trigger staleness. The
condition-string cross-check (risk #2) should land as the migration path. Both are
spec edits for Matt to ratify, not blockers on the schema shape itself.
