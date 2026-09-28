// Tests for rule-pack install/uninstall (spec 082 Track B, FR-015).
//
// FR-015 (resolved 2026-09-28): pack installation goes through the
// KeyboardIR spine — Behaviour records in, compiled rules out. These tests
// install the seed pack on the Cameroon fixture keyboard and assert:
//   (a) installed rules are IR-owned Behaviour records — typed IR rules
//       (recompilable through the normal IR→KMN emit, removable, and
//       stamped for demo-pane traceability);
//   (b) the legacy text-level `kmnFragment` injection path is not hit —
//       install adds no raw KMN fragments and every installed rule is a
//       typed IR rule, never a stashed text blob;
//   (c) uninstall removes exactly the installed rules and nothing else.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  installPack,
  uninstallPack,
  isPackInstalled,
  RulePackInstallError,
  importPack,
} from "./index.js";
import { parse } from "../codec/parse.js";
import { emit } from "../codec/emit.js";
import type { KeyboardIR, RulePack } from "@keyboard-studio/contracts";

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED_PACK_PATH = resolve(HERE, "seedPacks", "cameroon-diacritic-blocking.pack.json");
const FIXTURE_PATH = resolve(HERE, "..", "kmAssist", "__fixtures__", "sil_cameroon_qwerty.kmn");

function loadPack(): RulePack {
  return importPack(readFileSync(SEED_PACK_PATH, "utf8"));
}

function loadFixtureIr(): KeyboardIR {
  return parse(readFileSync(FIXTURE_PATH, "utf8"), "sil_cameroon_qwerty").ir;
}

function mainGroup(ir: KeyboardIR) {
  const group = ir.groups.find((g) => g.name === "main");
  if (group === undefined) throw new Error("fixture has no main group");
  return group;
}

describe("installPack (FR-015: through the spine)", () => {
  it("installs the seed pack's 36 rules as IR-owned Behaviour records", () => {
    const pack = loadPack();
    const before = loadFixtureIr();
    const mainBefore = mainGroup(before).rules.length;

    const result = installPack(before, pack);

    expect(result.packId).toBe("cameroon-diacritic-blocking");
    expect(result.installedRuleNodeIds).toHaveLength(36);
    // The Cameroon fixture already defines diablock, so no store is synthesized.
    expect(result.installedStoreNodeIds).toHaveLength(0);

    const mainAfter = mainGroup(result.ir);
    expect(mainAfter.rules.length).toBe(mainBefore + 36);
    // 076: guards and blocks sit after real bindings.
    const installed = mainAfter.rules.slice(mainBefore);
    for (const rule of installed) {
      expect(rule.ownedByBehaviour).toBe(
        "cameroon-diacritic-blocking/cameroon_diacritic_blocking",
      );
      // Typed IR rules — structured context/output, never a text blob.
      expect(Array.isArray(rule.context)).toBe(true);
      expect(Array.isArray(rule.output)).toBe(true);
      expect(rule.ownedByPattern).toBeUndefined();
    }
    // Input IR is never mutated.
    expect(mainGroup(before).rules.length).toBe(mainBefore);
    expect(isPackInstalled(result.ir, pack.id)).toBe(true);
    expect(isPackInstalled(before, pack.id)).toBe(false);
  });

  it("is recompilable: the installed rules flow through the normal IR→KMN emit", () => {
    const pack = loadPack();
    const before = loadFixtureIr();
    const mainBeforeCount = mainGroup(before).rules.length;
    const { ir } = installPack(before, pack);

    const kmn = emit(ir);
    // Every installed rule text appears in the emitted KMN as a normal rule.
    for (const text of pack.behaviours[0]!.rules) {
      expect(kmn).toContain(text);
    }
    // The emitted KMN re-parses to the same typed rules (emit→parse round-trip
    // is stable), so the installed rules are ordinary IR citizens. The
    // `ownedByBehaviour` stamp itself is working-IR metadata — like
    // `ownedByPattern`, it is set by the recognizer/installer, not carried in
    // .kmn text — and it survives on the installed IR (asserted above).
    const reparsed = parse(kmn, "recompiled").ir;
    expect(mainGroup(reparsed).rules.length).toBe(mainBeforeCount + 36);
    const kmn2 = emit(reparsed);
    for (const text of pack.behaviours[0]!.rules) {
      expect(kmn2).toContain(text);
    }
  });

  it("never touches the text-injection path: no kmnFragment-style raw fragments are produced", () => {
    const pack = loadPack();
    const before = loadFixtureIr();
    const rawBefore = before.raw.length;

    const { ir } = installPack(before, pack);

    // The legacy path's product is raw text spliced past the IR; install adds
    // zero RawKmnFragments — everything it adds is a typed IR node.
    expect(ir.raw.length).toBe(rawBefore);
    const installedRules = ir.groups.flatMap((g) => g.rules).filter(
      (r) => r.ownedByBehaviour?.startsWith(`${pack.id}/`) === true,
    );
    expect(installedRules).toHaveLength(36);
    for (const rule of installedRules) {
      // A text-injected rule would arrive as an unparsed blob; these are
      // fully typed (the `any(diablock)` guard parses to a store ref…).
      const guard = rule.context.find((el) => el.kind === "any");
      expect(guard).toMatchObject({ kind: "any", storeRef: "diablock" });
      // …and scaffold line numbers are stripped so they cannot corrupt the
      // demo pane's `// Line N` fired-rule mapping.
      expect(rule.sourceLine).toBeUndefined();
    }
  });

  it("synthesizes a missing guard store from the behaviour's structured parameters", () => {
    const pack = loadPack();
    const withoutDiablock: KeyboardIR = {
      ...loadFixtureIr(),
      stores: loadFixtureIr().stores.filter((s) => s.name !== "diablock"),
    };
    expect(withoutDiablock.stores.some((s) => s.name === "diablock")).toBe(false);

    const result = installPack(withoutDiablock, pack);

    expect(result.installedStoreNodeIds).toHaveLength(1);
    const store = result.ir.stores.find((s) => s.name === "diablock");
    expect(store).toBeDefined();
    expect(store!.ownedByBehaviour).toBe(
      "cameroon-diacritic-blocking/cameroon_diacritic_blocking",
    );
    expect(store!.isSystem).toBe(false);
    // The structured chars from parameters become typed char items.
    expect(store!.items.length).toBeGreaterThan(0);
    expect(store!.items.every((item) => item.kind === "char")).toBe(true);
    // And the emitted KMN defines the store the installed rules reference.
    expect(emit(result.ir)).toContain("store(diablock)");
  });

  it("refuses to install the same pack twice", () => {
    const pack = loadPack();
    const { ir } = installPack(loadFixtureIr(), pack);
    expect(() => installPack(ir, pack)).toThrow(RulePackInstallError);
    expect(() => installPack(ir, pack)).toThrow(/already installed/);
  });

  it("rejects an invalid pack and an unparsable rule text", () => {
    const pack = loadPack();
    expect(() =>
      installPack(loadFixtureIr(), { ...pack, id: "BAD ID" } as RulePack),
    ).toThrow(RulePackInstallError);
    const badRulePack: RulePack = {
      ...pack,
      id: "bad-rule-pack",
      behaviours: [
        {
          ...pack.behaviours[0]!,
          id: "bad_rule",
          rules: ["this is not a kmn rule +++ (((("],
        },
      ],
    };
    expect(() => installPack(loadFixtureIr(), badRulePack)).toThrow(RulePackInstallError);
  });
});

describe("uninstallPack", () => {
  it("removes exactly the installed rules and nothing else", () => {
    const pack = loadPack();
    const before = loadFixtureIr();
    const beforeJson = JSON.stringify(before);

    const installed = installPack(before, pack);
    // A decoy rule added after install, plus a decoy store, must survive.
    const main = mainGroup(installed.ir);
    const decoyRuleNodeId = "decoy-rule-1";
    const withDecoy: KeyboardIR = {
      ...installed.ir,
      groups: installed.ir.groups.map((g) =>
        g.name === "main"
          ? {
              ...g,
              rules: [
                ...g.rules,
                {
                  nodeId: decoyRuleNodeId,
                  context: [{ kind: "vkey", name: "K_X", modifiers: [] }],
                  output: [{ kind: "char", value: "x" }],
                },
              ],
            }
          : g,
      ),
    };
    expect(mainGroup(withDecoy).rules.length).toBe(main.rules.length + 1);

    const result = uninstallPack(withDecoy, pack.id);

    expect(result.removedRuleNodeIds).toHaveLength(36);
    expect(result.removedStoreNodeIds).toHaveLength(0);
    const remaining = mainGroup(result.ir).rules;
    // The decoy survives; every installed rule is gone.
    expect(remaining.some((r) => r.nodeId === decoyRuleNodeId)).toBe(true);
    expect(
      remaining.some((r) => r.ownedByBehaviour?.startsWith(`${pack.id}/`) === true),
    ).toBe(false);
    expect(isPackInstalled(result.ir, pack.id)).toBe(false);
    // Uninstall is the exact inverse of install on the untouched fixture.
    const clean = uninstallPack(installed.ir, pack.id);
    expect(JSON.stringify(clean.ir)).toBe(beforeJson);
  });

  it("removes a synthesized guard store but never a pre-existing same-named store", () => {
    const pack = loadPack();
    // Fixture HAS diablock: install synthesizes nothing; uninstall must keep it.
    const withStore = installPack(loadFixtureIr(), pack);
    const uninstalled = uninstallPack(withStore.ir, pack.id);
    const diablock = uninstalled.ir.stores.find((s) => s.name === "diablock");
    expect(diablock).toBeDefined();
    expect(diablock!.ownedByBehaviour).toBeUndefined();

    // Without diablock: install synthesizes one; uninstall removes exactly it.
    const bare = {
      ...loadFixtureIr(),
      stores: loadFixtureIr().stores.filter((s) => s.name !== "diablock"),
    };
    const installedBare = installPack(bare, pack);
    expect(installedBare.installedStoreNodeIds).toHaveLength(1);
    const uninstalledBare = uninstallPack(installedBare.ir, pack.id);
    expect(uninstalledBare.removedStoreNodeIds).toEqual(
      installedBare.installedStoreNodeIds,
    );
    expect(uninstalledBare.ir.stores.some((s) => s.name === "diablock")).toBe(false);
    expect(uninstalledBare.ir.stores).toHaveLength(bare.stores.length);
  });

  it("uninstalling a pack that was never installed removes nothing", () => {
    const before = loadFixtureIr();
    const result = uninstallPack(before, "no-such-pack");
    expect(result.removedRuleNodeIds).toHaveLength(0);
    expect(result.removedStoreNodeIds).toHaveLength(0);
    expect(JSON.stringify(result.ir)).toBe(JSON.stringify(before));
  });

  it("does not mistake a pack-id prefix for another pack", () => {
    const pack = loadPack();
    const { ir } = installPack(loadFixtureIr(), pack);
    // "cameroon-diacritic-blocking-extra" shares a string prefix but the
    // ownership marker is slash-delimited, so it must not match.
    const result = uninstallPack(ir, "cameroon-diacritic-blocking-extra");
    expect(result.removedRuleNodeIds).toHaveLength(0);
    expect(isPackInstalled(result.ir, pack.id)).toBe(true);
  });
});
