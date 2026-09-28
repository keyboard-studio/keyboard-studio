// packInstall.test.ts — studio seam for rule-pack install/uninstall
// (spec 082 FR-015: through the spine).
//
// The engine owns the install semantics (see
// packages/engine/src/rulePacks/install.test.ts); these tests cover the
// studio wiring: install writes into the working IR through the
// overlay-preserving setWorkingIR seam, uninstall removes exactly the
// installed rules, and the working IR stays well-formed for the rule list.

import { beforeEach, describe, expect, it } from "vitest";
import type { KeyboardIR, RulePack } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import {
  applyPackInstall,
  applyPackUninstall,
  isPackInstalledInWorkingCopy,
} from "./packInstall.ts";
import { RulePackInstallError } from "@keyboard-studio/engine/rulePacks";

function makePack(): RulePack {
  return {
    packVersion: "1.0",
    id: "test-pack",
    name: "Test pack",
    description: "A minimal pack for seam testing.",
    scriptKey: "Latn",
    behaviours: [
      {
        kind: "block",
        id: "test_block",
        parameters: { guardStore: "diablock", guardedContextChars: ["5", " "] },
        provenance: {
          sourceKeyboardId: "test_keyboard",
          sourceKeyboardName: "Test Keyboard",
          copyright: "© Test",
          license: "MIT",
        },
        rules: ["any(diablock) + [K_QUOTE] > context"],
        demoPairs: [{ input: "type 5 then grave", expectedOutput: "5" }],
      },
    ],
  };
}

function seedIr(): void {
  const ir = {
    origin: "scaffolded",
    header: {
      keyboardId: "t",
      name: "t",
      bcp47: [],
      copyright: "",
      version: "1.0",
      targets: [],
      storeDirectives: [],
    },
    stores: [],
    groups: [
      {
        nodeId: "g1",
        name: "main",
        usingKeys: true,
        rules: [
          {
            nodeId: "r1",
            context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
            output: [{ kind: "char", value: "a" }],
          },
        ],
        readonly: false,
      },
    ],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  } as unknown as KeyboardIR;
  useWorkingCopyStore.getState().setIR(ir);
}

function workingRules() {
  return useWorkingCopyStore.getState().ir?.groups.flatMap((g) => g.rules) ?? [];
}

beforeEach(() => {
  seedIr();
});

describe("packInstall studio seam", () => {
  it("installs the pack's rules into the working IR as behaviour-owned rules", () => {
    const result = applyPackInstall(makePack());

    expect(result.packId).toBe("test-pack");
    expect(result.installedRuleNodeIds).toHaveLength(1);
    const rules = workingRules();
    expect(rules).toHaveLength(2);
    const installed = rules.find((r) => r.ownedByBehaviour !== undefined);
    expect(installed?.ownedByBehaviour).toBe("test-pack/test_block");
    // The pre-existing rule is untouched and still first (076: after bindings).
    expect(rules[0]?.nodeId).toBe("r1");
    expect(isPackInstalledInWorkingCopy("test-pack")).toBe(true);
  });

  it("synthesizes the guard store when the working IR lacks it", () => {
    applyPackInstall(makePack());
    const stores = useWorkingCopyStore.getState().ir?.stores ?? [];
    const diablock = stores.find((s) => s.name === "diablock");
    expect(diablock).toBeDefined();
    expect(diablock?.ownedByBehaviour).toBe("test-pack/test_block");
  });

  it("uninstall removes exactly the installed rules and stores", () => {
    applyPackInstall(makePack());
    expect(workingRules()).toHaveLength(2);

    const result = applyPackUninstall("test-pack");

    expect(result.removedRuleNodeIds).toHaveLength(1);
    const rules = workingRules();
    expect(rules).toHaveLength(1);
    expect(rules[0]?.nodeId).toBe("r1");
    expect(
      (useWorkingCopyStore.getState().ir?.stores ?? []).some((s) => s.name === "diablock"),
    ).toBe(false);
    expect(isPackInstalledInWorkingCopy("test-pack")).toBe(false);
  });

  it("refuses a second install without an uninstall", () => {
    applyPackInstall(makePack());
    expect(() => applyPackInstall(makePack())).toThrow(RulePackInstallError);
    // The working IR still holds exactly one installed rule.
    expect(
      workingRules().filter((r) => r.ownedByBehaviour !== undefined),
    ).toHaveLength(1);
  });

  it("throws when there is no working IR", () => {
    useWorkingCopyStore.getState().clearIR();
    expect(() => applyPackInstall(makePack())).toThrow(RulePackInstallError);
  });
});
