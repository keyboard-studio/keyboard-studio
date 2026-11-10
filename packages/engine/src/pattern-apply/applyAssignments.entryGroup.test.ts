// Bare pattern rules belong to the keyboard's entry group (the one named by the
// `begin Unicode > use(...)` line), not to a group that happens to be named
// "main". Rules aimed at a group the starting keyboard lacks are kept, not lost.

import { describe, it, expect, beforeAll } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { MechanismAssignment, Pattern } from "@keyboard-studio/contracts";
import { loadPatterns, getById } from "../pattern-library/index.js";
import { applyAssignments } from "./applyAssignments.js";

const CONTENT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../content/patterns");

beforeAll(async () => {
  await loadPatterns(CONTENT_DIR);
});

const resolver = (id: string): Pattern | undefined => getById(id);

const s08: MechanismAssignment = {
  scope: "individual",
  target: "ŋ",
  modality: "physical",
  mechanisms: [
    {
      patternId: "modifier_as_layer_switch",
      strategyId: "S-08",
      slotValues: { altgrKeyList: "K_N", altgrOutputList: "ŋ" },
    },
  ],
  source: "user",
};

function bodyOf(kmn: string, group: string): string {
  const lines = kmn.split("\n");
  const start = lines.findIndex((l) => l.trim().toLowerCase().startsWith(`group(${group})`));
  if (start === -1) return "";
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*group\s*\(/i.test(lines[i]!)) break;
    out.push(lines[i]!);
  }
  return out.join("\n");
}

describe("bare pattern rules target the entry group", () => {
  it("places the rules in the group the begin line enters, not in group(main)", () => {
    const base =
      "store(&VERSION) '10.0'\n" +
      "store(&NAME) 'Test'\n" +
      "begin Unicode > use(core)\n\n" +
      "group(core) using keys\n\n" +
      "+ [K_Q] > 'q'\n";
    const { kmn } = applyAssignments([s08], resolver, base);
    expect(kmn).not.toMatch(/group\(main\)/i);
    expect(bodyOf(kmn, "core")).toContain("any(altgrKeys)");
    expect(bodyOf(kmn, "core")).toContain("K_Q");
  });

  it("still uses group(main) when that is the entry group", () => {
    const base =
      "store(&VERSION) '10.0'\n" +
      "begin Unicode > use(main)\n\n" +
      "group(main) using keys\n\n" +
      "+ [K_Q] > 'q'\n";
    const { kmn } = applyAssignments([s08], resolver, base);
    expect(bodyOf(kmn, "main")).toContain("any(altgrKeys)");
  });
});
