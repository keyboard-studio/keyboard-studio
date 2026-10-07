// deriveScreens — unit tests (spec 091 T006).
//
// The derivation is pure, so most cases run over synthetic module lists;
// the frozen-trail and frozen-order cases run over the live registry list
// (decisionModules) and pin today's wizard against the pre-091 baseline
// it replaces (the frozen literals in steps/stepOrder.parity.test.ts).

import { describe, it, expect } from "vitest";
import type { QuestionModule } from "../survey/types.ts";
import type { DecisionId, DecisionSet } from "./decisionTypes.ts";
import { decisionModules, declaredScreenGates } from "../survey/questions/registry.ts";
import { deriveScreens } from "./deriveScreens.ts";

type Gate = (decisions: DecisionSet) => boolean;

function questionModule(
  id: string,
  opts: {
    provides?: DecisionId[];
    requires?: readonly DecisionId[];
    group?: string;
    next?: string | readonly object[];
  } = {},
): QuestionModule {
  const { next, ...rest } = opts;
  return {
    definition: { id, type: "text", ...(next !== undefined ? { next } : {}) },
    fixtures: { valid: [{ value: "x" }], invalid: [] },
    inputs: [],
    writes: [],
    ...rest,
  };
}

function customModule(
  id: string,
  opts: {
    provides?: DecisionId[];
    requires?: readonly DecisionId[];
    screen?: string;
  } = {},
): QuestionModule {
  return {
    definition: { id, type: "notice" },
    fixtures: { valid: [{ value: "x" }], invalid: [] },
    inputs: [],
    writes: [],
    renderer: () => null,
    ...opts,
  };
}

const decision = (id: DecisionId, value: unknown): DecisionSet => ({
  [id]: { id, value, provenance: "asked" },
});

describe("deriveScreens — screen formation", () => {
  it("a custom module forms a singleton screen keyed by its declared screen", () => {
    const screens = deriveScreens([
      customModule("picker", { provides: ["base-keyboard"], screen: "choose_base" }),
    ]);
    expect(screens).toHaveLength(1);
    expect(screens[0]).toMatchObject({
      id: "choose_base",
      kind: "custom",
      decisionIds: ["base-keyboard"],
      moduleIds: ["picker"],
      spine: true,
    });
    expect(screens[0]!.group).toBeUndefined();
    expect(screens[0]!.gatedBy).toBeUndefined();
  });

  it("consecutive question modules sharing a group merge into one screen", () => {
    const screens = deriveScreens([
      questionModule("q_name", { provides: ["language-name"], group: "identity" }),
      questionModule("q_code", {
        provides: ["language-code"],
        requires: ["language-name"],
        group: "identity",
      }),
    ]);
    expect(screens).toHaveLength(1);
    expect(screens[0]).toMatchObject({
      id: "identity",
      kind: "question",
      group: "identity",
      decisionIds: ["language-name", "language-code"],
      moduleIds: ["q_name", "q_code"],
    });
  });

  it("an intervening singleton splits a run, and the split run repeats the group label", () => {
    const screens = deriveScreens([
      questionModule("q_name", { provides: ["language-name"], group: "identity" }),
      customModule("picker", {
        provides: ["base-keyboard"],
        requires: ["language-name"],
        screen: "choose_base",
      }),
      questionModule("q_author", {
        provides: ["author-name"],
        requires: ["base-keyboard"],
        group: "identity",
      }),
    ]);
    expect(screens.map((s) => s.id)).toEqual(["identity", "choose_base", "identity"]);
    expect(screens[0]!.group).toBe("identity");
    expect(screens[2]!.group).toBe("identity");
    expect(screens[2]!.decisionIds).toEqual(["author-name"]);
  });

  it("a group change splits the run (group disagreement)", () => {
    const screens = deriveScreens([
      questionModule("q_name", { provides: ["language-name"], group: "identity" }),
      questionModule("q_track", {
        provides: ["authoring-track"],
        requires: ["language-name"],
        group: "track",
      }),
    ]);
    expect(screens.map((s) => s.id)).toEqual(["identity", "track"]);
    expect(screens.every((s) => s.kind === "question")).toBe(true);
  });

  it("a question module whose group names a singleton is intra-step to it", () => {
    const screens = deriveScreens([
      questionModule("q_probe", { provides: ["text-sample"], group: "characters" }),
      customModule("inventory", { provides: ["character-inventory"], screen: "characters" }),
    ]);
    expect(screens).toHaveLength(1);
    expect(screens[0]!.id).toBe("characters");
    expect(screens[0]!.kind).toBe("custom");
    expect(screens[0]!.decisionIds).toContain("text-sample");
    expect(screens[0]!.decisionIds).toContain("character-inventory");
    expect(screens[0]!.moduleIds).toContain("q_probe");
  });

  it("orders screens by the modules' requires edges, not declaration order", () => {
    const screens = deriveScreens([
      questionModule("q_track", {
        provides: ["authoring-track"],
        requires: ["base-keyboard"],
        group: "track",
      }),
      customModule("picker", { provides: ["base-keyboard"], screen: "choose_base" }),
    ]);
    expect(screens.map((s) => s.id)).toEqual(["choose_base", "track"]);
  });
});

describe("deriveScreens — gates and trails", () => {
  const copyGate: Gate = (d) => d["authoring-track"]?.value === "copy";

  it("a screen with a declared gate carries it (Delta P6: composition-layer declaration)", () => {
    const screens = deriveScreens(
      [
        questionModule("q_track", { provides: ["authoring-track"], group: "track" }),
        questionModule("q_pname", {
          provides: ["project-display-name"],
          requires: ["authoring-track"],
          group: "project_name",
        }),
        questionModule("q_pid", {
          provides: ["project-keyboard-id"],
          requires: ["project-display-name"],
          group: "project_name",
        }),
        customModule("inventory", {
          provides: ["character-inventory"],
          requires: ["project-keyboard-id"],
          screen: "characters",
        }),
      ],
      new Map([["project_name", copyGate]]),
    );
    const projectName = screens.find((s) => s.id === "project_name")!;
    expect(projectName.gatedBy).toBeDefined();
    expect(projectName.gatedBy!(decision("authoring-track", "copy"))).toBe(true);
    expect(projectName.gatedBy!(decision("authoring-track", "adapt"))).toBe(false);
    expect(projectName.gatedBy!({})).toBe(false);
    // A gated screen is a side trail rejoining at the next ungated screen.
    expect(projectName.spine).toBe(false);
    expect(projectName.joinTarget).toBe("characters");
  });

  it("a partially gated screen has no screen gate (it is walked; per-question gating applies inside)", () => {
    // q_pname is routing-gated (reached only on the copy branch); q_note
    // has no inbound routing at all — so the screen is only partially
    // gated and carries no screen gate. (A default-branch target would NOT
    // serve here: the default branch's gate is the negation of the earlier
    // conditions, so such a member is gated too.)
    const screens = deriveScreens([
      questionModule("q_track", {
        provides: ["authoring-track"],
        group: "track",
        next: [{ condition: "value == 'copy'", goto: "q_pname" }],
      }),
      questionModule("q_pname", {
        provides: ["project-display-name"],
        requires: ["authoring-track"],
        group: "project_name",
      }),
      questionModule("q_note", {
        provides: ["project-keyboard-id"],
        requires: ["project-display-name"],
        group: "project_name",
      }),
    ]);
    const projectName = screens.find((s) => s.id === "project_name")!;
    expect(projectName.gatedBy).toBeUndefined();
    expect(projectName.spine).toBe(true);
  });

  it("the screen gate passes when ANY member gate passes", () => {
    // q_a and q_b are routing-gated by complementary branches of q_pred's
    // conditional `next` over language-name; q_tail is a non-provider
    // member reached on the default branch.
    const screens = deriveScreens([
      questionModule("q_pred", {
        provides: ["language-name"],
        group: "h",
        next: [
          { condition: "value == 'a'", goto: "q_a" },
          { condition: "value == 'b'", goto: "q_b" },
          { default: true, goto: "q_tail" },
        ],
      }),
      questionModule("q_a", {
        provides: ["language-autonym"],
        requires: ["language-name"],
        group: "g",
      }),
      questionModule("q_b", {
        provides: ["language-code"],
        requires: ["language-name"],
        group: "g",
      }),
      questionModule("q_tail", { group: "g" }),
    ]);
    const g = screens.find((s) => s.id === "g")!;
    expect(g.gatedBy).toBeDefined();
    expect(g.gatedBy!(decision("language-name", "a"))).toBe(true);
    expect(g.gatedBy!(decision("language-name", "b"))).toBe(true);
    expect(g.gatedBy!(decision("language-name", "c"))).toBe(false);
  });
});

describe("deriveScreens — validation (fail-fast named errors)", () => {
  it("a custom module with no screen key throws", () => {
    expect(() =>
      deriveScreens([customModule("picker", { provides: ["base-keyboard"] })]),
    ).toThrow(/deriveScreens: custom module "picker" declares no screen key/);
  });

  it("two custom modules claiming one screen key throws", () => {
    expect(() =>
      deriveScreens([
        customModule("a", { provides: ["base-keyboard"], screen: "choose_base" }),
        customModule("b", { provides: ["windows-layout"], screen: "choose_base" }),
      ]),
    ).toThrow(/deriveScreens: screen "choose_base" is claimed by two custom modules/);
  });

  it("a question module with no group throws", () => {
    expect(() =>
      deriveScreens([questionModule("q_name", { provides: ["language-name"] })]),
    ).toThrow(/deriveScreens: question module "q_name" declares no group/);
  });

  it("an unresolved requires is the sort's error, inherited unchanged", () => {
    expect(() =>
      deriveScreens([
        questionModule("q_track", {
          provides: ["authoring-track"],
          requires: ["base-keyboard"],
          group: "track",
        }),
      ]),
    ).toThrow(/unresolved decision: "base-keyboard" required by "q_track"/);
  });
});

describe("deriveScreens — the live registry list (frozen baseline)", () => {
  const screens = deriveScreens(decisionModules, declaredScreenGates);

  it("derives the frozen screen sequence", () => {
    expect(screens.map((s) => s.id)).toEqual([
      "identity",
      "layout",
      "choose_base",
      "track",
      "project_name",
      "characters",
      "marks",
      "punctuation",
      "invisibles",
      "convenience",
      "carve",
      "deadkeys",
      "rules",
      "mechanisms",
      "touch_seed_source",
      "touch",
      "help",
    ]);
  });

  it("frozen trail: project_name is a gated side trail joining characters", () => {
    const projectName = screens.find((s) => s.id === "project_name")!;
    expect(projectName.kind).toBe("question");
    expect(projectName.spine).toBe(false);
    expect(projectName.joinTarget).toBe("characters");
    expect(projectName.gatedBy).toBeDefined();
    expect(projectName.gatedBy!(decision("authoring-track", "copy"))).toBe(true);
    expect(projectName.gatedBy!(decision("authoring-track", "adapt"))).toBe(false);
  });

  it("frozen trail: touch_seed_source is a gated side trail joining touch", () => {
    const seed = screens.find((s) => s.id === "touch_seed_source")!;
    expect(seed.spine).toBe(false);
    expect(seed.joinTarget).toBe("touch");
    expect(seed.gatedBy).toBeDefined();
    expect(seed.gatedBy!({})).toBe(true);
    expect(seed.gatedBy!(decision("touch-seed-source", "base"))).toBe(false);
  });

  it("the characters screen carries its intra-step flow as members", () => {
    const characters = screens.find((s) => s.id === "characters")!;
    expect(characters.kind).toBe("custom");
    expect(characters.moduleIds).toContain("characterInventory");
    expect(characters.decisionIds).toContain("character-inventory");
    expect(characters.decisionIds).toContain("text-sample");
  });

  it("every other screen is an ungated spine screen", () => {
    for (const s of screens) {
      if (s.id === "project_name" || s.id === "touch_seed_source") continue;
      expect(s.spine, s.id).toBe(true);
      expect(s.gatedBy, s.id).toBeUndefined();
      expect(s.joinTarget, s.id).toBeUndefined();
    }
  });
});

describe("US1 one-edit (SC-001, pure level) — T009", () => {
  // The edit: il_language_autonym gains requires: ["base-keyboard"] in a test
  // registry, and its `next` is re-pointed (null) — under 087 sort semantics
  // the stale `next: "il_language_code"` would close a routing cycle through
  // the new requires chain (see the Delta P5 case below). Nothing else
  // changes; the screens re-derive from the declarations alone.
  const editedModules = decisionModules.map((m) =>
    m.definition.id === "il_language_autonym"
      ? {
          ...m,
          requires: [...(m.requires ?? []), "base-keyboard" as DecisionId],
          definition: { ...m.definition, next: null },
        }
      : m,
  );

  it("Delta P5 (open): the requires-only edit trips the sort's named cycle error", () => {
    // The requires edge alone — autonym's `next` still points at
    // il_language_code, whose decision the autonym now transitively requires
    // via base-keyboard — closes a cycle the sort names (as a dependency
    // cycle over the routing chain) under 087 semantics. An earlier
    // 091 revision dropped such routing edges in the sort; that made SC-002's
    // injected routing faults silent, so it was reverted (plan.md, Delta P5).
    const requiresOnly = decisionModules.map((m) =>
      m.definition.id === "il_language_autonym"
        ? { ...m, requires: [...(m.requires ?? []), "base-keyboard" as DecisionId] }
        : m,
    );
    expect(() => deriveScreens(requiresOnly)).toThrowError(/cycle/);
  });

  it("baseline: the autonym sits in the single identity screen", () => {
    const identityScreens = deriveScreens(decisionModules).filter((s) => s.id === "identity");
    expect(identityScreens).toHaveLength(1);
    expect(identityScreens[0]!.moduleIds).toContain("il_language_autonym");
  });

  it("the edit moves the autonym after choose_base, in a second identity-labelled screen", () => {
    const screens = deriveScreens(editedModules);
    const ids = screens.map((s) => s.id);
    const identityIdx = ids.flatMap((id, i) => (id === "identity" ? [i] : []));
    expect(identityIdx).toHaveLength(2);
    // choose_base sits between the two identity screens.
    expect(ids.indexOf("choose_base")).toBeGreaterThan(identityIdx[0]!);
    expect(ids.indexOf("choose_base")).toBeLessThan(identityIdx[1]!);
    const [first, second] = identityIdx.map((i) => screens[i]!);
    expect(first!.group).toBe("identity");
    expect(second!.group).toBe("identity");
    expect(first!.moduleIds).not.toContain("il_language_autonym");
    expect(second!.moduleIds).toContain("il_language_autonym");
    expect(second!.decisionIds).toContain("language-autonym");
    // Nothing else moved: the remaining sequence is the baseline sequence.
    expect(ids.filter((id) => id !== "identity")).toEqual(
      deriveScreens(decisionModules)
        .map((s) => s.id)
        .filter((id) => id !== "identity"),
    );
  });
});
