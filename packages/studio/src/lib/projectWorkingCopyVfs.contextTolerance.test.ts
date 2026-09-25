// projectWorkingCopyVfs step 2.7 (spec 078): the applied context-tolerance fix
// is replayed into the projected .kmn, which both the preview compile and the
// download (serializeWorkingCopy) read, and a batch whose anchor is gone is
// skipped with a warning rather than placed elsewhere.

import { describe, expect, it } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { parseKmn, type ContextToleranceOverlay } from "@keyboard-studio/engine";

import { projectWorkingCopyVfs } from "./projectWorkingCopyVfs.ts";

const KMN = [
  "store(&NAME) 'Projected'",
  "store(&VERSION) '14.0'",
  "begin Unicode > use(main)",
  "group(main) using keys",
  "U+00E0 + ']' > U+00E2",
  "+ ']' > U+00B4",
  "",
].join("\n");

const COMMENT = "Accept the accent typed as a separate character (decomposed text) as well as the joined form.";

function overlay(beforeRuleText: string | null): ContextToleranceOverlay {
  return {
    batches: [
      {
        siteKey: "site-1",
        groupName: "main",
        beforeRuleText,
        comment: COMMENT,
        rules: [
          {
            nodeId: "decomposed_accent_r1_0",
            context: [
              { kind: "char", value: "a" },
              { kind: "char", value: "̀" },
              { kind: "raw", text: "+" },
              { kind: "char", value: "]" },
            ],
            output: [{ kind: "char", value: "â" }],
          },
        ],
      },
    ],
  };
}

function project(contextToleranceOverlay: ContextToleranceOverlay | null) {
  const vfs = createVirtualFS();
  vfs.set("source/projected.kmn", KMN, false);
  const result = projectWorkingCopyVfs({
    vfs,
    keyboardId: "projected",
    baseIr: parseKmn(KMN, "projected").ir,
    deletedNodeIds: new Set(),
    assignments: [],
    getPattern: () => undefined,
    identity: null,
    contextToleranceOverlay,
  });
  const entry = vfs.get("source/projected.kmn");
  return { kmn: typeof entry?.content === "string" ? entry.content : "", warnings: result.warnings };
}

describe("projectWorkingCopyVfs — context-tolerance replay (spec 078)", () => {
  it("inserts the accepted rules, with their comment, before their anchor rule", () => {
    // Anchors are compared in the emitter's own spelling of the rule.
    const { kmn, warnings } = project(overlay("+ U+005D > U+00B4"));
    expect(warnings).toEqual([]);
    expect(kmn).toContain(COMMENT);
    const lines = kmn.split(/\r?\n/);
    const added = lines.findIndex((l) => l.includes("U+0300") && l.includes("+"));
    const fallback = lines.findIndex((l) => l.trim() === "+ U+005D > U+00B4");
    expect(added).toBeGreaterThan(-1);
    expect(added).toBeLessThan(fallback);
  });

  it("leaves the .kmn alone with no overlay", () => {
    expect(project(null).kmn).not.toContain(COMMENT);
  });

  it("skips a batch whose anchor rule is gone, with a warning", () => {
    const { kmn, warnings } = project(overlay("+ 'x' > 'y'"));
    expect(kmn).not.toContain(COMMENT);
    expect(warnings.some((w) => w.includes("context-tolerance rules skipped"))).toBe(true);
  });
});
