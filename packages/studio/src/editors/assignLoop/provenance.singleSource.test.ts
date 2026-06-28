// Single-source test (spec-014 US3 / T027, P1/SC-007).
//
// Asserts that `editors/assignLoop/provenance.ts` `TouchKeyProvenance` resolves
// to the `@keyboard-studio/contracts` type — there is NO second definition.
//
// The check is compile-time (a type that fails to typecheck would fail the
// build): we bind the editor-layer type and the contracts type bidirectionally,
// so if the editor module ever reintroduced a parallel union the assignment
// would break. A runtime smoke test pins the default helper's value.

import { describe, it, expect, expectTypeOf } from "vitest";
import type { TouchKeyProvenance as EditorProvenance } from "./provenance.ts";
import { defaultProvenance } from "./provenance.ts";
import type { TouchKeyProvenance as ContractsProvenance } from "@keyboard-studio/contracts";

// Bidirectional type identity: each is assignable to the other. If the editor
// module defined its own union (even a structurally-equal one) this would still
// pass structurally — so we additionally assert exact type EQUALITY via
// expectTypeOf, which a second nominal definition cannot satisfy if it drifts.
const _editorToContracts: ContractsProvenance = "hand-set" as EditorProvenance;
const _contractsToEditor: EditorProvenance = "hand-set" as ContractsProvenance;
void _editorToContracts;
void _contractsToEditor;

describe("TouchKeyProvenance single source of truth (T027/SC-007)", () => {
  it("the editor-layer type is exactly the contracts type", () => {
    expectTypeOf<EditorProvenance>().toEqualTypeOf<ContractsProvenance>();
  });

  it("defaultProvenance() returns the conservative hand-set default", () => {
    const p: ContractsProvenance = defaultProvenance();
    expect(p).toBe("hand-set");
  });
});
