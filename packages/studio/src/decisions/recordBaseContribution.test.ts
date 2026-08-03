// Tests for recordBaseContribution (specs/055-legible-decision-trail T020,
// FR-030..FR-035, research D-11).
//
// Three properties matter most here, mirroring the module's own header:
//   1. a base-instantiated session records exactly one entry carrying all six
//      BaseContribution fields;
//   2. no instantiated working copy at the instant of the call means NO
//      entry — never a fabricated zero baseline;
//   3. `startingKeyCount` is in the same `nodes + items` unit `toRailNodes`
//      itself produces, derived from injected deps only.

import { describe, expect, it, vi } from "vitest";
import type {
  BaseKeyboard,
  IRGroup,
  IRRule,
  KeyboardIR,
} from "@keyboard-studio/contracts";
import { makeBaseKeyboard } from "@keyboard-studio/contracts";
import { toRailNodes } from "../lib/irToCarveNodes.ts";
import {
  recordBaseContribution,
  type RecordBaseContributionDeps,
} from "./recordBaseContribution.ts";
import type { DecisionEntryInput } from "./decisionLogStore.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function charRule(nodeId: string): IRRule {
  return {
    nodeId,
    context: [{ kind: "char", value: "x" }],
    output: [{ kind: "char", value: "y" }],
  };
}

function group(nodeId: string, rules: IRRule[]): IRGroup {
  return { nodeId, name: "main", usingKeys: true, rules, readonly: false };
}

/** Minimal KeyboardIR fixture — a group of plain char rules, no patterns/stores. */
function makeIr(groups: IRGroup[]): KeyboardIR {
  return {
    origin: "scaffolded",
    header: {
      keyboardId: "",
      name: "",
      bcp47: [],
      copyright: "",
      version: "",
      targets: [],
      storeDirectives: [],
    },
    stores: [],
    groups,
    comments: [],
    raw: [],
    recognizedPatterns: [],
  };
}

function baseKeyboardFixture(): BaseKeyboard {
  return makeBaseKeyboard({
    id: "basic_kbdus",
    path: "release/b/basic_kbdus",
    script: "Latn",
    targets: ["windows", "macosx"],
    displayName: "US English",
    version: "1.0",
  });
}

/** Deps with every getter spied, all defaulting to a base-instantiated session. */
function depsFor(overrides: Partial<RecordBaseContributionDeps> = {}) {
  const append = vi.fn((_input: DecisionEntryInput) => "d1");
  const deps: RecordBaseContributionDeps = {
    append,
    getBaseKeyboard: vi.fn(() => baseKeyboardFixture()),
    getBaseIr: vi.fn(() => makeIr([group("g1", [charRule("n1"), charRule("n2")])])),
    getIrAxes: vi.fn(() => ({ scale: "small" as const, scriptClass: "alphabetic" as const })),
    getInstantiationMode: vi.fn(() => "new-from-base" as const),
    getRemovalCapabilities: vi.fn(() => new Map()),
    ...overrides,
  };
  return { deps, append };
}

// ---------------------------------------------------------------------------
// A base-instantiated session records the base with all six fields
// ---------------------------------------------------------------------------

describe("recordBaseContribution — base-instantiated session", () => {
  it("appends one base-contribution entry carrying all six BaseContribution fields", () => {
    const { deps, append } = depsFor();

    const entryId = recordBaseContribution(deps);

    expect(entryId).toBe("d1");
    expect(append).toHaveBeenCalledTimes(1);
    const input = append.mock.calls[0]![0];
    expect(input.stepId).toBe("choose_base");
    expect(input.payload).toEqual({
      kind: "base-contribution",
      baseId: "basic_kbdus",
      baseDisplayName: "US English",
      startingKeyCount: 2,
      derivedAxes: ["scale", "scriptClass"],
      inheritedMetadata: [
        { field: "script", value: "Latn" },
        { field: "targets", value: "windows, macosx" },
        { field: "version", value: "1.0" },
      ],
      instantiationMode: "new-from-base",
    });
  });

  it("records provenance as base-derived, sourced from the base", () => {
    const { deps, append } = depsFor();

    recordBaseContribution(deps);

    expect(append.mock.calls[0]![0].provenance).toEqual({
      agency: "base-derived",
      source: "base",
    });
  });

  it("records adapt-existing instantiation mode verbatim when that is the track taken", () => {
    const { deps, append } = depsFor({
      getInstantiationMode: vi.fn(() => "adapt-existing" as const),
    });

    recordBaseContribution(deps);

    expect(append.mock.calls[0]![0].payload).toMatchObject({
      instantiationMode: "adapt-existing",
    });
  });
});

// ---------------------------------------------------------------------------
// No instantiated working copy -> NO entry, never a fabricated zero (D-11)
// ---------------------------------------------------------------------------

describe("recordBaseContribution — no instantiated working copy", () => {
  it("writes no entry when no base has been chosen yet", () => {
    const { deps, append } = depsFor({ getBaseKeyboard: vi.fn(() => null) });

    const entryId = recordBaseContribution(deps);

    expect(entryId).toBeNull();
    expect(append).not.toHaveBeenCalled();
  });

  it("writes no entry when the base IR has not been instantiated yet", () => {
    const { deps, append } = depsFor({ getBaseIr: vi.fn(() => null) });

    const entryId = recordBaseContribution(deps);

    expect(entryId).toBeNull();
    expect(append).not.toHaveBeenCalled();
  });

  it("writes no entry when instantiationMode is still the pre-instantiation null", () => {
    const { deps, append } = depsFor({ getInstantiationMode: vi.fn(() => null) });

    const entryId = recordBaseContribution(deps);

    expect(entryId).toBeNull();
    expect(append).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// FR-034 — startingKeyCount is in the same unit toRailNodes itself produces
// ---------------------------------------------------------------------------

describe("recordBaseContribution — startingKeyCount unit match (FR-034)", () => {
  it("matches the glyph total toRailNodes produces for a three-rule fixture", () => {
    const ir = makeIr([group("g1", [charRule("n1"), charRule("n2"), charRule("n3")])]);
    const capabilities = new Map();
    const expected = toRailNodes(ir, capabilities).reduce(
      (sum, node) => sum + (node.glyphs?.length ?? 0),
      0,
    );
    expect(expected).toBe(3); // sanity: the fixture really does yield 3, not a coincidental match

    const { deps, append } = depsFor({
      getBaseIr: vi.fn(() => ir),
      getRemovalCapabilities: vi.fn(() => capabilities),
    });

    recordBaseContribution(deps);

    const payload = append.mock.calls[0]![0].payload as { startingKeyCount?: number };
    expect(payload.startingKeyCount).toBe(expected);
  });

  it("reports 0, not undefined, for a genuinely empty starting layout", () => {
    const { deps, append } = depsFor({ getBaseIr: vi.fn(() => makeIr([])) });

    recordBaseContribution(deps);

    const payload = append.mock.calls[0]![0].payload as { startingKeyCount?: number };
    expect(payload.startingKeyCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// FR-035 — only the injected deps are consulted, never a re-read of the base
// ---------------------------------------------------------------------------

describe("recordBaseContribution — reads only the injected deps (FR-035)", () => {
  it("consults each injected getter exactly once and nothing else", () => {
    const { deps } = depsFor();

    recordBaseContribution(deps);

    expect(deps.getBaseKeyboard).toHaveBeenCalledTimes(1);
    expect(deps.getBaseIr).toHaveBeenCalledTimes(1);
    expect(deps.getIrAxes).toHaveBeenCalledTimes(1);
    expect(deps.getInstantiationMode).toHaveBeenCalledTimes(1);
    expect(deps.getRemovalCapabilities).toHaveBeenCalledTimes(1);
  });

  it("does not call getIrAxes/getRemovalCapabilities when there is no instantiated working copy", () => {
    // Short-circuiting on the absence check means these two getters — which
    // are only meaningful once instantiated — are never reached at all.
    const { deps } = depsFor({ getBaseKeyboard: vi.fn(() => null) });

    recordBaseContribution(deps);

    expect(deps.getIrAxes).not.toHaveBeenCalled();
    expect(deps.getRemovalCapabilities).not.toHaveBeenCalled();
  });
});
