// pf_body_parity — issue #2530: the welcome/help body-parity choice as a
// Phase F flow question.
//
// Covers the module shape (radio, required, three options, routes on to
// pf_font_guidance), the migration extract (legacy slice → new answer),
// the welcome lookup default (live only), and the apply (writes the
// doc-fix-proposals slice, preserving the sibling proposals).

import { describe, it, expect } from "vitest";
import type { ExtractContext } from "../../../decisions/extractContext.ts";
import type { Decision, DecisionId, DecisionSet } from "../../../decisions/decisionTypes.ts";
import type { ApplyContext } from "../../types.ts";
import { assertPatchChannelsAuthorized } from "../../../steps/applyAuthorization.ts";
import mod, {
  apply,
  definition,
  isBodyParityOption,
  validate,
} from "./pf_body_parity.ts";

function decisions(values: Partial<Record<DecisionId, unknown>>): DecisionSet {
  const set: Partial<Record<DecisionId, Decision<unknown>>> = {};
  for (const [id, value] of Object.entries(values)) {
    set[id as DecisionId] = { id: id as DecisionId, value, provenance: "asked" };
  }
  return set;
}

function extractCtx(phaseF?: ExtractContext["phaseF"]): ExtractContext {
  return { ir: null, catalog: null, ...(phaseF !== undefined ? { phaseF } : {}) };
}

function applyCtx(
  decisionValue: unknown,
  currentDocFixProposals: ApplyContext["currentDocFixProposals"],
): ApplyContext {
  return {
    ir: null,
    writes: [],
    decisions:
      decisionValue === undefined
        ? decisions({})
        : decisions({ "help-body-parity": decisionValue }),
    currentHistoryEntryState: null,
    currentDocFixProposals,
  };
}

describe("pf_body_parity — module shape", () => {
  it("is a required radio question with the three options, routing on to the font note", () => {
    expect(definition.id).toBe("pf_body_parity");
    expect(definition.type).toBe("radio");
    expect(definition.required).toBe(true);
    expect(definition.options?.map((o) => o.value)).toEqual([
      "welcome",
      "help",
      "keep-different",
    ]);
    expect(definition.next).toBe("pf_font_guidance");
    expect(mod.provides).toEqual(["help-body-parity"]);
    expect(mod.inputs).toEqual([]);
    expect(mod.writes).toEqual([]);
  });

  it("validates the three options and rejects blanks and the legacy value", () => {
    expect(validate("welcome")).toEqual({ ok: true });
    expect(validate("help")).toEqual({ ok: true });
    expect(validate("keep-different")).toEqual({ ok: true });
    expect(validate("")).toEqual({
      ok: false,
      code: "required",
      message: "Please choose which text both pages should carry.",
    });
    expect(validate(undefined)).toMatchObject({ ok: false, code: "required" });
    expect(validate("declined")).toMatchObject({ ok: false, code: "invalid_option" });
  });

  it("narrows raw strings to options", () => {
    expect(isBodyParityOption("welcome")).toBe(true);
    expect(isBodyParityOption("declined")).toBe(false);
  });
});

describe("pf_body_parity — migration extract + lookup default", () => {
  it("extracts a persisted legacy answer from the wiring's proposal", () => {
    expect(mod.extract?.(extractCtx({ bodyParityProposal: "keep-different" }))).toBe(
      "keep-different",
    );
    expect(mod.extract?.(extractCtx({ bodyParityProposal: "welcome" }))).toBe("welcome");
    expect(mod.extract?.(extractCtx({}))).toBeUndefined();
    expect(mod.extract?.(extractCtx())).toBeUndefined();
  });

  it("defaults to the welcome page's text, but only when the finding is live", () => {
    expect(mod.lookupDefault?.(extractCtx({ bodyParityLive: true }))).toEqual({
      value: "welcome",
    });
    expect(mod.lookupDefault?.(extractCtx({ bodyParityLive: false }))).toBeUndefined();
    expect(mod.lookupDefault?.(extractCtx({}))).toBeUndefined();
    expect(mod.lookupDefault?.(extractCtx())).toBeUndefined();
  });
});

describe("pf_body_parity — apply", () => {
  it("writes the chosen canonical side, preserving the sibling proposals", () => {
    expect(apply("welcome", applyCtx("welcome", { pagename: "accepted" }))).toEqual({
      docFixProposals: { pagename: "accepted", bodySync: "welcome" },
    });
    expect(apply("help", applyCtx("help", null))).toEqual({
      docFixProposals: { bodySync: "help" },
    });
  });

  it("writes a decline for keep-different", () => {
    expect(apply("keep-different", applyCtx("keep-different", { imageWidth: "declined" }))).toEqual({
      docFixProposals: { imageWidth: "declined", bodySync: "declined" },
    });
  });

  it("writes nothing when the recorded answer already matches the slice", () => {
    expect(apply("welcome", applyCtx("welcome", { bodySync: "welcome" }))).toEqual({});
  });

  it("writes nothing with no recorded answer and no fallback value", () => {
    expect(apply(undefined, applyCtx(undefined, null))).toEqual({});
  });

  it("falls back to the value argument when no decision is recorded yet", () => {
    expect(apply("help", applyCtx(undefined, null))).toEqual({
      docFixProposals: { bodySync: "help" },
    });
  });

  it("writes nothing for an unknown answer value", () => {
    expect(apply("declined", applyCtx("declined", null))).toEqual({});
  });

  it("the docFixProposals patch is authorized for this module", () => {
    const patch = apply("welcome", applyCtx("welcome", null));
    expect(assertPatchChannelsAuthorized("pf_body_parity", mod, patch)).toBe(true);
  });
});
