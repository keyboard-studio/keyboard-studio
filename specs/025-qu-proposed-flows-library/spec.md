# Feature Specification: Proposed-flow Library section on the Flow Map

**Feature branch:** `km/qu-025-proposed-flows-library`
**Stage:** 2 of the Unified Survey Architecture refactor (master plan, decision D6).
**Governing decision:** [docs/adr/0001-flow-map-derived-from-one-source.md](../../docs/adr/0001-flow-map-derived-from-one-source.md)
— "Reserve / library is shown separately, never mixed into live flow."

> ## Relationship to spec 022 (supersede / absorb)
>
> This spec **supersedes and absorbs the demotion mechanics of
> [spec 022](../022-qu-library-demote/spec.md)** by re-expressing the demoted Phase A as a
> **rendered proposed-flow** rather than leaving it as a flat reserve list. Spec 022's
> demotion is **already merged to `main`** (commit `ab9505f`, PR #928) and spec 024
> (PR #965) already carries `phase_a_identity` in `steps/flowSources.ts` with
> `status:"proposed"`, unreferenced by any manifest step. Stage 2 does **not** redo the
> demotion — it builds the ordered Library graph on top of it.
>
> The spec-022 guardrails remain green **unmodified**:
> - `survey/questions/noDeleteGuardrail.test.ts` — the 30 Phase A ids stay registered +
>   on-disk + test-covered (no-delete CI guardrail).
> - `dashboard/phaseADemoteReserve.test.ts` — the identity-lite drill-down still emits
>   every demoted Phase A module as a `library-not-in-flow` reserve node.
>
> The `pb_*` battery is **out of scope** (spec-022 amendment): it stays live/reachable off
> the IntroChooser gate. This spec touches **only** the proposed Phase A flow.

---

## 1. Problem

The demoted 30-question Phase A battery (15 identity + 15 `provenance_*`) currently
appears on the Flow Map only as a **flat reserve list** inside the identity-lite
drill-down — every module a single `library-not-in-flow` node with no outgoing edges, so
its intended sequence and branching are invisible. The battery is a real, coherent flow
(the pre-demotion Phase A ordering); collapsing it to a flat list loses that structure and
makes it hard to judge for eventual promotion.

The catalogue already models this content as a **proposed flow** (`flowSources`
`status:"proposed"`), and the ADR mandates a "clearly-separated section" for reserve /
library content. What is missing is the rendering: proposed flows as **ordered graphs** in
a distinct Library section, excluded from the live rendered↔runtime bijection.

## 2. Goal

Proposed flows (today just `phase_a_identity`) render as **ordered graphs** in a distinct
**Library** section of the Flow Map, preserving the YAML ordering/routing visually. The
demoted battery keeps its intended sequence instead of collapsing to a flat reserve list.

**Parity contract:** the live survey is untouched; live Flow Map sections are
byte-identical **except** the new Library section.

## 3. Data shape (D6)

- **Location:** `content/flows/proposed/phase_a_identity.modular.yaml` (human convention)
  **and** a `status: proposed` header field in the thin YAML (machine truth). Both —
  belt-and-suspenders per ADR-0001 "no second list to drift."
- `parseThinYaml` gains an **optional** `status` field, default `"live"`.
- The `flowSources` entry already carries `status:"proposed"`. A **completeness test**
  asserts YAML `status` == `flowSources` status for **every** entry — this binding is the
  enforcement that keeps the two representations from diverging.

## 4. Map derivation (Library section)

- Proposed flows render as **ordered graphs** via the existing `buildGraphFromQuestions`
  with `questionKind:"proposed"` (new `NodeKind`) and region `"library"` (new
  `NodeRegion`). The YAML ordering/routing is preserved visually.
- **Flat reserve** (Library section): a question is flat reserve iff it is in **no flow at
  all** — neither a live flow nor a proposed flow. Questions that appear only in a proposed
  flow render **inside** the proposed graph, not as flat reserve.
- **"also live" badge:** a question appearing in **both** a live flow and a proposed flow
  is flagged with an "also live" badge in the proposed graph. This is a **WARN**, not a
  failure.

### 4a. Scope note — the per-drill-down reserve rendering is unchanged

The existing per-flow `computeReserveNodes` / `buildModularFlowGraph` behavior is **not**
altered. The identity-lite live drill-down continues to emit the 30 demoted Phase A
modules as `library-not-in-flow` reserve nodes (spec-022 `phaseADemoteReserve.test.ts`
locks this, and the byte-identical-live-map parity contract requires it). The
"reserve = in no flow at all" rule of D6 is therefore realized as a **dedicated global
Library-reserve computation** for the new Library section — not by re-defining the per-flow
reserve function, which would break both that guardrail and the parity contract. This is
the one deliberate deviation from the master-plan wording ("generalize
`computeReserveNodes`"); the D6 *behavior* is fully realized, the *means* differs for
non-regression.

## 5. Guardrail treatment

- Proposed-flow node ids are **excluded from the rendered↔runtime bijection** (like reserve
  today). `collectRenderedNodeIds` never traverses the proposed graphs, so they are
  excluded by construction; this is documented explicitly.
- **Dual-reference** (a question in both a live and a proposed flow) is a **WARN** — the
  guardrail computes and reports it but does not fail.
- **HARD FAILURE** only if a manifest `flowRef` targets a `status:"proposed"` entry
  (promotion must be explicit). This is enforced by the D2c check in
  `steps/flowSources.test.ts` and re-asserted in the Stage-2 guardrail.
- The spec-022 **no-delete** CI assertion stays.

## 6. Promotion (mechanical, documented in `content/flows/README.md`)

1. `git mv` the YAML out of `proposed/` and delete its `status:` line.
2. Flip the `flowSources` entry to `"live"`.
3. Add `flowRefs:["<id>"]` to a manifest step (for a new step, also give it a component).
4. Completeness (D2b/D2c) + drift guardrail then enforce it as live.

Demotion is the reverse; the no-delete guardrail keeps registry membership either way.

## Functional requirements

- **FR-001** Proposed flows render as ordered graphs (`questionKind:"proposed"`,
  region `"library"`) preserving YAML ordering/routing.
- **FR-002** The proposed YAML lives under `content/flows/proposed/` **and** carries a
  `status: proposed` header; `parseThinYaml` reads `status` (default `"live"`).
- **FR-003** A completeness test asserts YAML `status` == `flowSources` status for every
  entry.
- **FR-004** Library flat reserve = questions in no flow at all; only-in-proposed questions
  render inside the proposed graph.
- **FR-005** A question in both a live and a proposed flow is flagged "also live" (WARN).
- **FR-006** Proposed-flow node ids are excluded from the rendered↔runtime bijection.
- **FR-007** A manifest `flowRef` targeting a `status:"proposed"` entry is a HARD FAILURE.
- **FR-008** The live survey and all live map sections are byte-identical except the new
  Library section (parity contract); spec-022 guardrails stay green unmodified.

## Success criteria

- **SC-001** The Library section renders `phase_a_identity` as one ordered graph of 30
  question nodes (15 `questions` + 15 `provenance_questions`) with its authored edges.
- **SC-002** `dashboard/driftGuardrail.test.ts`, `phaseADemoteReserve.test.ts`,
  `noDeleteGuardrail.test.ts`, `flowSources.test.ts`, `flow-parity.test.ts`,
  `completeness.test.ts`, `manifestProjection.test.ts` stay green.
- **SC-003** Typecheck, the studio vitest suite (baseline 4 pre-existing failures only),
  and `pnpm depcruise` are green.

## Out of scope

Promoting `phase_a_identity` to live; the per-character loop primitive; `pb_*`
membership; any change to the live survey render path; Stages 3–6 (specs 026–028).
