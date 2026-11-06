import { describe, expect, it } from "vitest";

import {
  activeRemovalWarnings,
  dismissRemovalWarning,
  warningsForRemoval,
} from "./removalWarning.ts";

const needed = new Map<string, string[]>([
  ["é", ["fr", "fr-CA"]],
  ["ɔ", ["bkm"]],
]);

describe("warningsForRemoval", () => {
  it("maps a needed character to every listed language that needs it", () => {
    expect(warningsForRemoval(["é"], needed)).toEqual([
      { char: "é", languages: ["fr", "fr-CA"] },
    ]);
  });

  it("matches composed and decomposed forms as the same character", () => {
    const decomposed = "é";
    expect(warningsForRemoval([decomposed], needed)).toEqual([
      { char: "é", languages: ["fr", "fr-CA"] },
    ]);
  });

  it("gives no warning for a character no language needs", () => {
    expect(warningsForRemoval(["z", "q"], needed)).toEqual([]);
  });

  it("warns once per distinct character, in removal order", () => {
    const w = warningsForRemoval(["ɔ", "é", "é"], needed);
    expect(w.map((x) => x.char)).toEqual(["ɔ", "é"]);
  });
});

describe("dismissal", () => {
  const warnings = warningsForRemoval(["é", "ɔ"], needed);

  it("hides a dismissed warning and keeps the others", () => {
    const dismissed = dismissRemovalWarning(new Set(), "é");
    expect(activeRemovalWarnings(warnings, dismissed).map((w) => w.char)).toEqual(["ɔ"]);
  });

  it("does not mutate the input set and never removes the character", () => {
    const before = new Set<string>();
    const after = dismissRemovalWarning(before, "é");
    expect(before.size).toBe(0);
    expect(after.has("é")).toBe(true);
    // Dismissal only hides the notice; the warning list itself is unchanged.
    expect(warnings).toHaveLength(2);
  });
});
