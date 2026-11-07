// projectWorkingCopyVfs step 2.2 (spec 113): the `kmn-edits` log is replayed into the projected
// .kmn, which both the preview compile and the download read. Only when the log has entries, so
// a keyboard with no edits keeps a byte-identical artifact. It runs after the deadkey ops
// (step 1.8) and the assignments (step 2), and before layer propagation (2.5) and context
// tolerance (2.7), so a tolerance batch anchored on a rule an entry removed is skipped.

import { describe, expect, it } from "vitest";
import { createVirtualFS, makePattern } from "@keyboard-studio/contracts";
import type { KmnEdit, KmnEditsValue, MechanismAssignment, Pattern } from "@keyboard-studio/contracts";
import { parseKmn, type ContextToleranceOverlay } from "@keyboard-studio/engine";
import type { DeadkeyOperation } from "./deadkeyOps.ts";

import { projectWorkingCopyVfs } from "./projectWorkingCopyVfs.ts";

const KMN = [
  "store(&NAME) 'Projected'",
  "store(&VERSION) '14.0'",
  "begin Unicode > use(main)",
  "group(main) using keys",
  "+ [K_A] > 'a'",
  "+ [K_E] > 'e'",
  "",
].join("\n");

const entry = (e: Omit<Extract<KmnEdit, { op: "set-key" }>, "seq" | "at">, seq = 1): KmnEdit => ({
  ...e,
  seq,
  at: 0,
});

const SET_A: KmnEdit = entry({ op: "set-key", vkey: "K_A", layer: [], output: { kind: "text", text: "\u014b" } });

const SWAP: Pattern = makePattern({
  id: "simple_swap",
  title: "simple_swap",
  description: "simple_swap",
  category: "desktop",
  appliesTo: [],
  questions: [{ id: "kmnRules", prompt: "kmnRules", answerType: "text" as const }],
  kmnFragment: "{{kmnRules}}\n",
  tests: [],
  validatedForFamilies: [],
  sourceKeyboards: [],
  reviewedBy: "",
  reviewDate: "2026-10-29",
});

const swapAssignment = (kmnRules: string): MechanismAssignment => ({
  scope: "individual",
  target: "x",
  modality: "physical",
  mechanisms: [{ patternId: "simple_swap", strategyId: "S-01", slotValues: { kmnRules } }],
  source: "user",
});

function project(opts: {
  assignments?: MechanismAssignment[];
  kmnEdits?: KmnEditsValue;
  deadkeyOps?: readonly DeadkeyOperation[];
  contextToleranceOverlay?: ContextToleranceOverlay | null;
}) {
  const vfs = createVirtualFS();
  vfs.set("source/projected.kmn", KMN, false);
  const result = projectWorkingCopyVfs({
    vfs,
    keyboardId: "projected",
    startIr: parseKmn(KMN, "projected").ir,
    deletedNodeIds: new Set(),
    assignments: [],
    getPattern: (id) => (id === SWAP.id ? SWAP : undefined),
    identity: null,
    ...opts,
  });
  const file = vfs.get("source/projected.kmn");
  return { kmn: typeof file?.content === "string" ? file.content : "", warnings: result.warnings };
}

describe("projectWorkingCopyVfs step 2.2 (kmn-edits)", () => {
  it("with no entries the artifact is byte-identical to today's", () => {
    const none = project({});
    expect(project({ kmnEdits: { entries: [] } }).kmn).toBe(none.kmn);
    expect(none.kmn).toContain("+ [K_A] > 'a'");
  });

  it("a set-key entry appears in the emitted .kmn", () => {
    const { kmn, warnings } = project({ kmnEdits: { entries: [SET_A] } });
    expect(warnings).toEqual([]);
    expect(kmn).toContain("U+014B");
    expect(kmn).not.toContain("+ [K_A] > U+0061");
    expect(kmn).toContain("[K_E]");
  });

  it("replays after the deadkey ops: an entry on the trigger key wins over the deadkey trigger", () => {
    const ops: DeadkeyOperation[] = [{ kind: "define", triggerKey: "e", id: 0x3001, accentChar: "\u0301" }];
    const without = project({ deadkeyOps: ops });
    expect(without.kmn).toContain("dk(3001)");
    const edit = entry({ op: "set-key", vkey: "K_E", layer: [], output: { kind: "text", text: "z" } });
    const { kmn } = project({ deadkeyOps: ops, kmnEdits: { entries: [edit] } });
    expect(kmn).toContain("U+007A");
    // The edit removed the context-free rule on K_E, which was the deadkey trigger.
    expect(kmn).not.toMatch(/\+ \[K_E\] > dk\(3001\)/);
  });

  it("replays after the assignments: an entry on a key an assignment wrote wins", () => {
    const assignments = [swapAssignment("+ [K_A] > U+0101")];
    const without = project({ assignments });
    expect(without.kmn).toContain("+ [K_A] > U+0101");
    const { kmn } = project({ assignments, kmnEdits: { entries: [SET_A] } });
    expect(kmn).toContain("+ [K_A] > U+014B");
    expect(kmn).not.toContain("U+0101");
  });

  it("a context-tolerance batch anchored on a rule an entry removed is skipped with a warning", () => {
    const anchor = "+ [K_A] > U+0061";
    const overlay: ContextToleranceOverlay = {
      batches: [
        {
          siteKey: "site-1",
          groupName: "main",
          beforeRuleText: anchor,
          comment: "tolerance",
          rules: [
            {
              nodeId: "tol_r1_0",
              context: [{ kind: "char", value: "x" }, { kind: "raw", text: "+" }, { kind: "vkey", name: "K_A", modifiers: [] }],
              output: [{ kind: "char", value: "y" }],
            },
          ],
        },
      ],
    };
    const intact = project({ contextToleranceOverlay: overlay });
    expect(intact.warnings).toEqual([]);
    expect(intact.kmn).toContain("tolerance");

    const edited = project({ contextToleranceOverlay: overlay, kmnEdits: { entries: [SET_A] } });
    expect(edited.kmn).not.toContain("tolerance");
    expect(edited.warnings.some((w) => w.includes("context-tolerance rules skipped"))).toBe(true);
  });
});
