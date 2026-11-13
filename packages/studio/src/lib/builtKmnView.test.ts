// Tests for the Code tab's built-view helpers (spec 117 US8, research R15).

import { describe, expect, it } from "vitest";
import { diffIR, parseKmn } from "@keyboard-studio/engine";
import { buildRevealLines, findBuildMismatch, findGeneratedRuleTouches, type KmnStageTexts } from "./builtKmnView.ts";
import type { KmnStage } from "./projectWorkingCopyVfs.ts";

const HEAD = "store(&NAME) 'k'\nbegin Unicode > use(main)\n\ngroup(main) using keys\n";
const BASE = `${HEAD}+ [K_A] > 'a'\n+ [K_B] > 'b'\n`;
// A later step adds a rule after the replay base.
const WITH_LATE = `${HEAD}+ [K_A] > 'a'\n+ [K_B] > 'b'\n+ [K_Z] > 'z'\n`;

const stages = (entries: Array<[KmnStage, string]>): KmnStageTexts => new Map(entries);
const changesFor = (before: string, after: string) => diffIR(parseKmn(before, "k").ir, parseKmn(after, "k").ir);

describe("findGeneratedRuleTouches", () => {
  it("is null when the edit touches only rules the replay base holds", () => {
    const changes = changesFor(WITH_LATE, WITH_LATE.replace("'a'", "'x'"));
    const s = stages([["kmn-edits", BASE], ["mark-guards", BASE], ["context-tolerance", BASE], ["caps", WITH_LATE]]);
    expect(findGeneratedRuleTouches(changes, s, WITH_LATE, "k")).toEqual([]);
  });

  it.each<[KmnStage, string]>([
    ["mark-guards", "mark-guards"],
    ["context-tolerance", "context-tolerance"],
    ["caps", "caps"],
  ])("names %s as the source of a rule that stage made, with its line", (stage, source) => {
    const changes = changesFor(WITH_LATE, WITH_LATE.replace("'z'", "'y'"));
    const entries: Array<[KmnStage, string]> = [["kmn-edits", BASE]];
    const order: KmnStage[] = ["mark-guards", "context-tolerance", "caps"];
    order.forEach((st, i) => entries.push([st, i >= order.indexOf(stage) ? WITH_LATE : BASE]));
    const touches = findGeneratedRuleTouches(changes, stages(entries), WITH_LATE, "k");
    expect(touches).toHaveLength(1);
    expect(touches[0]).toMatchObject({ source, line: 7 });
  });

  it("reports a removal of a generated rule", () => {
    const changes = changesFor(WITH_LATE, `${HEAD}+ [K_A] > 'a'\n+ [K_B] > 'b'\n`);
    const s = stages([["kmn-edits", BASE], ["caps", WITH_LATE]]);
    expect(findGeneratedRuleTouches(changes, s, WITH_LATE, "k")[0]).toMatchObject({ source: "caps" });
  });

  it("does not call a rule generated when only the final text holds it (an earlier Code-tab edit made it)", () => {
    const changes = changesFor(WITH_LATE, WITH_LATE.replace("'z'", "'y'"));
    const s = stages([["kmn-edits", BASE], ["caps", BASE], ["code-edits", WITH_LATE]]);
    expect(findGeneratedRuleTouches(changes, s, WITH_LATE, "k")).toEqual([]);
  });

  it("reports every touched change with its own source, in change order", () => {
    const withTwo = `${HEAD}+ [K_A] > 'a'\n+ [K_B] > 'b'\n+ [K_Z] > 'z'\n+ [K_Y] > 'y'\n`;
    const changes = changesFor(withTwo, withTwo.replace("'z'", "'1'").replace("'y'", "'2'"));
    const s = stages([
      ["kmn-edits", BASE],
      ["mark-guards", `${HEAD}+ [K_A] > 'a'\n+ [K_B] > 'b'\n+ [K_Z] > 'z'\n`],
      ["context-tolerance", `${HEAD}+ [K_A] > 'a'\n+ [K_B] > 'b'\n+ [K_Z] > 'z'\n`],
      ["caps", withTwo],
    ]);
    expect(findGeneratedRuleTouches(changes, s, withTwo, "k").map((x) => x.source)).toEqual(["mark-guards", "caps"]);
  });

  it("is empty without a replay-base text, and for a change that fits nowhere (left to the compile gate)", () => {
    const changes = changesFor(WITH_LATE, WITH_LATE.replace("'z'", "'y'"));
    expect(findGeneratedRuleTouches(changes, stages([]), WITH_LATE, "k")).toEqual([]);
    expect(findGeneratedRuleTouches(changes, stages([["kmn-edits", BASE]]), BASE, "k")).toEqual([]);
  });

  it("treats a store a later step rewrote as late even though the store exists in the base", () => {
    const base = `store(&NAME) 'k'\nstore(&CasedKeys) [K_A]\nbegin Unicode > use(main)\n\ngroup(main) using keys\n+ [K_A] > 'a'\n`;
    const built = base.replace("[K_A]\n", "[K_A K_B]\n");
    const changes = changesFor(built, built.replace("[K_A K_B]", "[K_C]"));
    const s = stages([["kmn-edits", base], ["caps", built]]);
    expect(findGeneratedRuleTouches(changes, s, built, "k")[0]).toMatchObject({ source: "caps", line: 2 });
  });
});

describe("findGeneratedRuleTouches header and in-place cases", () => {
  const hdr = (name: string, targets: string) =>
    `store(&NAME) '${name}'\nstore(&TARGETS) '${targets}'\nbegin Unicode > use(main)\n\ngroup(main) using keys\n+ [K_A] > 'a'\n`;

  it("an edit to &NAME the identity step wrote is not generated: it keeps the identity confirm", () => {
    const base = hdr("Old", "any");
    const built = hdr("New", "any");
    const changes = changesFor(built, built.replace("'New'", "'Other'"));
    const s = stages([["kmn-edits", base], ["identity", built], ["targets", built]]);
    expect(findGeneratedRuleTouches(changes, s, built, "k")).toEqual([]);
  });

  it("an edit to &TARGETS is refused with the targets source, whatever the base holds", () => {
    const base = hdr("k", "windows");
    const built = hdr("k", "any");
    const changes = changesFor(built, built.replace("'any'", "'windows'"));
    const s = stages([["kmn-edits", base], ["targets", built]]);
    expect(findGeneratedRuleTouches(changes, s, built, "k")[0]).toMatchObject({ source: "targets", line: 2 });
    // Also when the base already agrees with the built text.
    const s2 = stages([["kmn-edits", built], ["targets", built]]);
    expect(findGeneratedRuleTouches(changes, s2, built, "k")[0]).toMatchObject({ source: "targets" });
  });

  it("a rule the base holds but a generating stage rewrote in place is generated", () => {
    const base = `${HEAD}+ [K_A] > 'a'\n+ [K_B] > 'b'\n`;
    const rewritten = `${HEAD}+ [K_A] > 'a'\n+ [K_B] > 'B'\n`;
    // The author's text still shows the rule as the base had it, e.g. a draft over an older build.
    const changes = changesFor(base, base.replace("'b'", "'x'"));
    const s = stages([["kmn-edits", base], ["caps", rewritten]]);
    expect(findGeneratedRuleTouches(changes, s, base, "k")[0]).toMatchObject({ source: "caps" });
  });
});

describe("findBuildMismatch", () => {
  it("is null when the predicted build is the applied text, formatting aside", () => {
    expect(findBuildMismatch(`${HEAD}+ [K_A] > 'x'\n`, `${HEAD}\n+ [K_A]   >   U+0078\n`, "k")).toBeNull();
  });

  it("names the first differing line of the applied text", () => {
    expect(findBuildMismatch(`${HEAD}+ [K_A] > 'x'\n`, `${HEAD}+ [K_A] > 'x'\n+ [NCAPS K_B] > 'y'\n`, "k")).toBe(6);
  });

  it("ignores header items the identity steps own", () => {
    const a = "store(&NAME) 'a'\nbegin Unicode > use(main)\ngroup(main) using keys\n+ [K_A] > 'x'\n";
    expect(findBuildMismatch(a, a.replace("'a'", "'b'"), "k")).toBeNull();
  });
});

describe("buildRevealLines", () => {
  it("maps working-IR node ids to lines in the shown text by content, nth duplicate to nth duplicate", () => {
    const working = parseKmn(`${HEAD}+ [K_A] > 'a'\n+ [K_B] > 'b'\n+ [K_B] > 'b'\n`, "k").ir;
    const shownText = `${HEAD}+ [K_N] > 'n'\n+ [K_A] > 'a'\n+ [K_B] > 'b'\n+ [K_B] > 'b'\n`;
    const lines = buildRevealLines(working, shownText, "k");
    const [a, b1, b2] = working.groups[0]!.rules;
    expect(lines.get(a!.nodeId)).toBe(6);
    expect(lines.get(b1!.nodeId)).toBe(7);
    expect(lines.get(b2!.nodeId)).toBe(8);
    expect(lines.get(working.groups[0]!.nodeId)).toBe(4);
  });

  it("leaves out a rule the shown text does not hold", () => {
    const working = parseKmn(`${HEAD}+ [K_A] > 'a'\n`, "k").ir;
    expect(buildRevealLines(working, `${HEAD}+ [K_B] > 'b'\n`, "k").has(working.groups[0]!.rules[0]!.nodeId)).toBe(false);
  });
});
