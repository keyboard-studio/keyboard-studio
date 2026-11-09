// Spec 111 (Open walk): the walk's order is not pinned here. It follows from what
// each screen's modules require and provide (decisions/deriveScreens.ts); these
// tests check the properties that makes true: every step comes after the steps that
// provide what it requires, a gated step appears exactly when its decision says so,
// Open never shows a Copy-only step, and each walk ends where it should.

import { describe, expect, it } from "vitest";
import { advance, type AdvanceContext } from "./advance.ts";
import { screenGates } from "./manifest.ts";
import {
  decisionModules,
  declaredScreenGates,
  openHiddenScreens,
  openMenuScreens,
  openScreenGates,
} from "../survey/questions/registry.ts";
import { deriveScreens } from "../decisions/deriveScreens.ts";
import type { DecisionSet } from "../decisions/decisionTypes.ts";
import type { OpenIssueKind } from "../decisions/openIssues.ts";

type Track = "copy" | "adapt";

function decisionsFor(track: Track | null, issues?: readonly OpenIssueKind[], basic = false): DecisionSet {
  if (track === null) return {};
  return {
    "authoring-track": { id: "authoring-track", value: track, provenance: "asked", step: "t" },
    ...(issues !== undefined
      ? { "open-issues": { id: "open-issues", value: issues, provenance: "derived", step: "open" } }
      : {}),
    ...(track === "adapt"
      ? { "open-basic-keyboard": { id: "open-basic-keyboard", value: basic, provenance: "derived", step: "open" } }
      : {}),
  } as unknown as DecisionSet;
}

function ctx(track: Track | null, issues?: readonly OpenIssueKind[], basic = false): AdvanceContext {
  return {
    decisions: decisionsFor(track, issues, basic),
    selectedTrack: track,
    identitySupported: true,
    touchSeedSource: null,
    allCharactersImplemented: true,
  };
}

/** Drive advance() from `start` to the done terminal; every step visited, and where the walk hands over. */
function walk(
  start: Parameters<typeof advance>[0],
  c: AdvanceContext,
): { steps: string[]; navigate: string | undefined } {
  const steps: string[] = [start];
  let current = start;
  for (let guard = 0; guard < 40; guard++) {
    const outcome = advance(current, undefined, c);
    steps.push(outcome.next);
    if (outcome.next === "done") return { steps, navigate: outcome.navigate };
    current = outcome.next;
  }
  throw new Error("walk did not terminate");
}

// --- what each screen needs, read from the modules (the same source the order derives from) ---

const screens = deriveScreens(decisionModules, declaredScreenGates);
const screenOfDecision = new Map<string, string>();
for (const s of screens) for (const d of s.decisionIds) screenOfDecision.set(d, s.id);
const moduleById = new Map(decisionModules.map((m) => [m.definition.id, m] as const));

/** The screens whose decisions `screenId`'s modules require (data or order-only), excluding itself. */
function providersOf(screenId: string): string[] {
  const screen = screens.find((s) => s.id === screenId);
  if (screen === undefined) return [];
  const out = new Set<string>();
  for (const moduleId of screen.moduleIds) {
    const m = moduleById.get(moduleId);
    // A module that names another screen's step as its group is an intra-step member
    // (caps handling on the layout screen); its needs are not the screen's.
    if (screen.kind === "custom" && m?.group !== undefined) continue;
    for (const d of [...(m?.requires ?? []), ...(m?.screenRequires ?? [])]) {
      const provider = screenOfDecision.get(d);
      if (provider !== undefined && provider !== screenId) out.add(provider);
    }
  }
  return [...out];
}

/** Every visited step comes after each of its providers that was visited too. */
function expectDependencyOrder(steps: readonly string[]): void {
  for (const [i, id] of steps.entries()) {
    for (const provider of providersOf(id)) {
      const at = steps.indexOf(provider);
      if (at !== -1) expect(at, `${provider} (needed by ${id}) must come before it`).toBeLessThan(i);
    }
  }
}

const OPEN_PAGES = ["open_languages", "open_missing_letters", "open_upgrades"] as const;
const WALKED_ON_OPEN_BY_GATE = [...OPEN_PAGES, "mechanisms", "help", "html"] as const;
const COPY_ONLY = ["project_name", ...openHiddenScreens] as const;

describe("gates", () => {
  it("hide every Open-hidden screen on Open and show it otherwise", () => {
    const open = decisionsFor("adapt");
    for (const id of openHiddenScreens) {
      const gate = openScreenGates.get(id)!;
      expect(gate(open), id).toBe(false);
      expect(gate(decisionsFor("copy")), id).toBe(true);
      expect(gate(decisionsFor(null)), id).toBe(true);
    }
  });

  it("menu screens are all hidden-on-Open screens, and walked screens are not menu entries", () => {
    for (const id of openMenuScreens) expect(openHiddenScreens.has(id), id).toBe(true);
    for (const id of ["mechanisms", "touch"]) expect(openMenuScreens.includes(id), id).toBe(false);
  });

  it("Letters: always for a non-basic keyboard, only with missing letters for a basic one, never on Copy", () => {
    const gate = screenGates.get("open_missing_letters")!;
    expect(gate(decisionsFor("adapt", []))).toBe(true);
    expect(gate(decisionsFor("adapt"))).toBe(true);
    expect(gate(decisionsFor("adapt", [], true))).toBe(false);
    expect(gate(decisionsFor("adapt", ["upgrades", "docs"], true))).toBe(false);
    expect(gate(decisionsFor("adapt", ["missing-letters"], true))).toBe(true);
    expect(gate(decisionsFor("copy", ["missing-letters"]))).toBe(false);
  });

  it("Upgrades, help and the welcome page follow the recorded problem kind and stay off until it is recorded", () => {
    const upgrades = screenGates.get("open_upgrades")!;
    const help = screenGates.get("help")!;
    expect(upgrades(decisionsFor("adapt", ["upgrades"]))).toBe(true);
    expect(upgrades(decisionsFor("adapt", ["missing-letters", "docs"]))).toBe(false);
    expect(upgrades(decisionsFor("adapt"))).toBe(false);
    expect(upgrades(decisionsFor("copy", ["upgrades"]))).toBe(false);
    expect(help(decisionsFor("adapt", ["docs"]))).toBe(true);
    expect(help(decisionsFor("adapt", ["upgrades"]))).toBe(false);
    expect(help(decisionsFor("adapt"))).toBe(false);
    expect(help(decisionsFor("copy"))).toBe(true);
  });

  it("Mechanisms: walked on Open unless the keyboard is basic; Copy always walks it", () => {
    const gate = screenGates.get("mechanisms")!;
    expect(gate(decisionsFor("adapt", [], false))).toBe(true);
    expect(gate(decisionsFor("adapt", [], true))).toBe(false);
    expect(gate(decisionsFor("copy"))).toBe(true);
    expect(gate(decisionsFor(null))).toBe(true);
  });

  it("the language list is an Open page", () => {
    const gate = screenGates.get("open_languages")!;
    expect(gate(decisionsFor("adapt"))).toBe(true);
    expect(gate(decisionsFor("copy"))).toBe(false);
  });
});

describe("declared dependencies", () => {
  it("the Open pages are ordered by what they require: Languages, then Letters, then Upgrades, then Mechanisms", () => {
    const order = screens.map((s) => s.id);
    const before = (a: string, b: string) => expect(order.indexOf(a), `${a} before ${b}`).toBeLessThan(order.indexOf(b));
    expect(providersOf("open_missing_letters")).toContain("open_languages");
    expect(providersOf("open_upgrades")).toContain("open_missing_letters");
    expect(providersOf("mechanisms")).toContain("open_upgrades");
    before("open_languages", "open_missing_letters");
    before("open_missing_letters", "open_upgrades");
    before("open_upgrades", "mechanisms");
  });
});

/** The Open problem-kind and basic-keyboard combinations the walk must handle. */
const OPEN_CASES: ReadonlyArray<{ issues: readonly OpenIssueKind[] | undefined; basic: boolean }> = [
  { issues: undefined, basic: false },
  { issues: [], basic: false },
  { issues: ["missing-letters"], basic: false },
  { issues: ["upgrades"], basic: false },
  { issues: ["docs"], basic: false },
  { issues: ["missing-letters", "upgrades", "docs"], basic: false },
  { issues: [], basic: true },
  { issues: ["missing-letters"], basic: true },
  { issues: ["upgrades", "docs"], basic: true },
  { issues: ["missing-letters", "upgrades", "docs"], basic: true },
];

describe.each(OPEN_CASES)("the Open walk (issues $issues, basic $basic)", ({ issues, basic }) => {
  const c = ctx("adapt", issues, basic);
  const { steps, navigate } = walk("attribution", c);

  it("every step comes after the steps that provide what it requires", () => {
    expectDependencyOrder(steps);
  });

  it("each gated step appears exactly when its decision says so", () => {
    for (const id of WALKED_ON_OPEN_BY_GATE) {
      const gate = screenGates.get(id)!;
      expect(steps.includes(id), id).toBe(gate(c.decisions));
    }
  });

  it("never shows a Copy-only step", () => {
    for (const id of COPY_ONLY) expect(steps, id).not.toContain(id);
  });

  it("starts with the language list, always reaches the OSK and Touch, and ends at Review", () => {
    expect(steps[1]).toBe("open_languages");
    expect(steps).toContain("osk");
    expect(steps).toContain("touch");
    expect(steps.at(-1)).toBe("done");
    expect(navigate).toBe("criteria");
  });
});

describe("the Copy walk", () => {
  const c = ctx("copy");
  const { steps, navigate } = walk("identity", c);

  it("every step comes after the steps that provide what it requires", () => {
    expectDependencyOrder(steps);
  });

  it("walks project_name (its gate passes) and none of Open's pages", () => {
    expect(steps).toContain("project_name");
    for (const id of OPEN_PAGES) expect(steps, id).not.toContain(id);
  });

  it("walks every screen whose gate passes for Copy, and no other", () => {
    for (const s of screens) {
      if (s.id === "touch_seed_source") continue; // a fork the walk takes only while unrecorded
      const gate = screenGates.get(s.id);
      const applies = gate === undefined || gate(c.decisions);
      expect(steps.includes(s.id), s.id).toBe(applies);
    }
  });

  it("ends at Output", () => {
    expect(steps.at(-1)).toBe("done");
    expect(navigate).toBe("output");
  });

  it("help holds Copy on unfinished letters, but not Open", () => {
    expect(advance("help", undefined, { ...ctx("copy"), allCharactersImplemented: false }).next).toBe("help");
    expect(advance("help", undefined, { ...ctx("adapt", ["docs"]), allCharactersImplemented: false }).next).not.toBe("help");
  });
});
