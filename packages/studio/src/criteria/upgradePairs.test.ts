// @vitest-environment node
import { readFileSync } from "node:fs";
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
const input = {
  file: "source/basic_kbdus.kmn",
  kmnText,
  keyboardId: "basic_kbdus",
  bcp47: "en",
  caps,
  readText: (p: string) => (p === "source/basic_kbdus.kmn" ? kmnText : undefined),
  paths: ["source/basic_kbdus.kmn"],
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
    expect(offer!.file).toBe("source/basic_kbdus.kmn");
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
