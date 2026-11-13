// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import * as caps from "@keyboard-studio/engine/caps";

import { CASEDKEYS_MISSING, offerUpgrades, upgradePairFor } from "./upgradePairs.ts";

const FIXTURE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../engine/src/caps/__fixtures__/upstream_basic_kbdus/basic_kbdus.kmn",
);
const kmnText = readFileSync(FIXTURE, "utf8");
const FILE = "source/basic_kbdus.kmn";
const input = {
  file: FILE,
  kmnText,
  keyboardId: "basic_kbdus",
  bcp47: "en",
  caps,
  readText: (path: string) => (path === FILE ? kmnText : undefined),
  paths: [FILE],
};

describe("upgradePairs registry", () => {
  it("registers the &CasedKeys pair and nothing for unknown rules", () => {
    expect(upgradePairFor(CASEDKEYS_MISSING)).toBeDefined();
    expect(upgradePairFor("KM_LINT_NOPE")).toBeUndefined();
  });

  it("offers nothing when the rule is not failing", async () => {
    expect(await offerUpgrades([], input)).toEqual([]);
  });
});

describe("&CasedKeys upgrade on the upstream basic_kbdus fixture (SC-007)", () => {
  it("offers the fix; the diff touches only the store and the CAPS rules", async () => {
    const [offer] = await offerUpgrades([CASEDKEYS_MISSING], input);
    expect(offer).toBeDefined();
    expect(offer!.fix.kind).toBe("upgrade");
    expect(offer!.fix.status).toBe("pending");
    expect(offer!.file).toBe(FILE);
    const after = offer!.afterText;
    expect(after).toMatch(/store\(&CasedKeys\)/i);

    const before = kmnText.split(/\r?\n/);
    const afterLines = after.split(/\r?\n/);
    const beforeSet = new Set(before);
    const afterSet = new Set(afterLines);
    const removed = before.filter((l) => !afterSet.has(l) && l.trim() !== "");
    const added = afterLines.filter((l) => !beforeSet.has(l) && l.trim() !== "");
    // Removed lines are all per-key caps rules (or the old version line).
    for (const l of removed) expect(l).toMatch(/CAPS|&VERSION|&version/i);
    // Added lines are the store, the raised version, and the plain per-key rules
    // that replace each NCAPS/CAPS quartet.
    for (const l of added) expect(l).toMatch(/CasedKeys|&VERSION|&version|^\+ \[(SHIFT )?K_[A-Z]\] > U\+/i);
    expect(removed.length).toBeGreaterThan(0);
  });
});

describe("raw-Ctrl pair (spec 114)", () => {
  const EWE = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../keyboards/release/e/ewe/source/ewe.kmn");

  it("registers KM_LINT_RAW_CTRL", () => {
    expect(upgradePairFor("KM_LINT_RAW_CTRL")).toBeDefined();
  });

  it.skipIf(!existsSync(EWE))("offers the fix on ewe with inventory additions, via the registry", async () => {
    const ewe = readFileSync(EWE, "utf8");
    const [offer] = await offerUpgrades(["KM_LINT_RAW_CTRL"], {
      file: "source/ewe.kmn",
      kmnText: ewe,
      keyboardId: "ewe",
      caps,
      readText: (p) => (p === "source/ewe.kmn" ? ewe : undefined),
      paths: ["source/ewe.kmn"],
    });
    expect(offer).toBeDefined();
    expect(offer!.fix.id).toBe("upgrade:KM_LINT_RAW_CTRL:source/ewe.kmn");
    expect(offer!.inventoryAdditions?.length ?? 0).toBeGreaterThan(0);
  });

  it("offers nothing when the rule is not failing", async () => {
    expect(await offerUpgrades([], input)).toEqual([]);
  });
});

describe("upgrades never insert a rule (so the mid-group insert anchors do not reach them)", () => {
  it("the &CasedKeys upgrade's IR diff has no rule insert; every insert anchors on the last store", async () => {
    const { parseKmn, diffIrToKmnEdits } = await import("@keyboard-studio/engine");
    const startIr = parseKmn(kmnText, "basic_kbdus").ir;
    const upgraded = caps.upgradeToCasedKeys(startIr, { bcp47: "en" });
    const inserts = diffIrToKmnEdits(startIr, upgraded.ir).filter((e) => e.kind === "insert");
    for (const e of inserts) {
      expect(e.kind === "insert" && e.anchor.after).toBe("last-store");
    }
  });
});
