import { describe, expect, it } from "vitest";
import { createVirtualFS, type LintFinding } from "@keyboard-studio/contracts";

import { deriveOpenHelpGaps } from "./openHelpGaps.ts";
import { docRegenerationFix } from "./docRegenerationFix.ts";
import { openScreenGates } from "../survey/questions/registry.ts";
import type { DecisionSet } from "../decisions/decisionTypes.ts";

function fullVfs() {
  const vfs = createVirtualFS();
  for (const p of [
    "README.md",
    "HISTORY.md",
    "source/readme.htm",
    "source/welcome/welcome.htm",
    "source/help/kb_x.php",
  ])
    vfs.set(p, "x");
  return vfs;
}

const finding = (file: string): LintFinding =>
  ({ code: "doc-x", severity: "warning", message: "m", location: { file } }) as unknown as LintFinding;

describe("deriveOpenHelpGaps", () => {
  it("is empty when every help document is present and passing", () => {
    expect(deriveOpenHelpGaps({ vfs: fullVfs(), keyboardId: "kb_x", baselineFindings: [] }).size).toBe(0);
  });

  it("names a missing document and only that one", () => {
    const vfs = fullVfs();
    vfs.delete("source/help/kb_x.php");
    expect([...deriveOpenHelpGaps({ vfs, keyboardId: "kb_x", baselineFindings: [] })]).toEqual(["help-php"]);
  });

  it("names a document that fails its criteria at the baseline", () => {
    const gaps = deriveOpenHelpGaps({
      vfs: fullVfs(),
      keyboardId: "kb_x",
      baselineFindings: [finding("source/welcome/welcome.htm")],
    });
    expect([...gaps]).toEqual(["welcome-htm"]);
  });

  it("ignores LICENSE.md, which the identity step fills", () => {
    const gaps = deriveOpenHelpGaps({ vfs: fullVfs(), keyboardId: "kb_x", baselineFindings: [finding("LICENSE.md")] });
    expect(gaps.size).toBe(0);
  });
});

describe("help step gate on Open", () => {
  const open = (issues?: string[]) =>
    ({
      "authoring-track": { value: "adapt" },
      ...(issues !== undefined ? { "open-issues": { value: issues } } : {}),
    }) as unknown as DecisionSet;
  const copy = { "authoring-track": { value: "copy" } } as unknown as DecisionSet;
  const gate = openScreenGates.get("help")!;

  it("skips the help step when the baseline found no documentation problem", () => {
    expect(gate(open([]))).toBe(false);
    expect(gate(open(["upgrades"]))).toBe(false);
  });

  it("asks when the baseline recorded a documentation problem", () => {
    expect(gate(open(["docs"]))).toBe(true);
  });

  it("skips the help step until the baseline is recorded", () => {
    expect(gate(open())).toBe(false);
  });

  it("never changes Copy", () => {
    expect(gate(copy)).toBe(true);
  });
});

describe("docRegenerationFix", () => {
  const start = "<!-- ks:generated:start -->";
  const end = "<!-- ks:generated:end -->";

  it("replaces only between the markers", () => {
    const current = `<body>hand written\n${start}\nold\n${end}\nmore hand written</body>`;
    const fix = docRegenerationFix({ member: "help-php", path: "source/help/kb_x.php", current, generated: "new" });
    expect(fix?.preview[0]?.after).toBe(`<body>hand written\n${start}\nnew\n${end}\nmore hand written</body>`);
    expect(fix?.preview[0]?.before).toBe(current);
    expect(fix?.kind).toBe("docs");
  });

  it("appends a marked block when there are no markers", () => {
    const fix = docRegenerationFix({
      member: "help-php",
      path: "source/help/kb_x.php",
      current: "<body>mine</body>",
      generated: "gen",
    });
    expect(fix?.preview[0]?.after).toBe(`<body>mine${start}\ngen\n${end}\n</body>`);
  });

  it("appends at the end of a plain-text document", () => {
    const fix = docRegenerationFix({ member: "readme-md", path: "README.md", current: "# Mine\n", generated: "gen" });
    expect(fix?.preview[0]?.after).toBe(`# Mine\n${start}\ngen\n${end}\n`);
  });

  it("offers nothing when regeneration would change nothing", () => {
    const current = `${start}\ngen\n${end}`;
    expect(docRegenerationFix({ member: "readme-md", path: "README.md", current, generated: "gen" })).toBeNull();
  });
});
