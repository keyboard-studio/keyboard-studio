// The OSK stylesheet step adds a store line to the .kmn before the carve. The
// Open-mode splice must cut the carved rule by its current line, not by the
// line it had when the keyboard was first parsed.

import { describe, expect, it } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { projectWorkingCopyVfs } from "./projectWorkingCopyVfs.ts";
import { withCurrentSpans } from "./openMode.ts";

const ID = "tiny";
const KMN = [
  "c a hand-written comment",
  "store(&NAME) 'Tiny'",
  "store(&VERSION) '10.0'",
  "begin Unicode > use(main)",
  "group(main) using keys",
  "+ [K_A] > 'a'",
  "+ [K_B] > 'b'",
  "+ [K_C] > 'c'",
  "",
].join("\r\n");

describe("Open mode: spans after the stylesheet step", () => {
  it("withCurrentSpans moves each span to the line the text now has", () => {
    const startIr = parseKmn(KMN, ID).ir;
    const shifted = "store(&KMW_EMBEDCSS) 'x.css'\r\n" + KMN;
    const ir = withCurrentSpans(startIr, shifted, ID);
    const rule = ir.groups.find((g) => !g.readonly)!.rules[0]!;
    expect(rule.sourceLine).toBe(startIr.groups.find((g) => !g.readonly)!.rules[0]!.sourceLine! + 1);
  });

  it("carves the right rule when a stylesheet line was added above it", () => {
    const vfs = createVirtualFS();
    vfs.set(`source/${ID}.kmn`, KMN, false);
    const startIr = parseKmn(KMN, ID).ir;
    const rule = startIr.groups.find((g) => !g.readonly)!.rules[1]!;
    projectWorkingCopyVfs({
      vfs,
      keyboardId: ID,
      startIr,
      deletedNodeIds: new Set([rule.nodeId]),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
      customCss: ".kmw-key { color: red; }",
      openMode: { kps: { nameEdited: false } },
    });
    const text = vfs.get(`source/${ID}.kmn`)!.content as string;
    expect(text).not.toContain("[K_B]");
    expect(text).toContain("+ [K_A] > 'a'\r\n");
    expect(text).toContain("+ [K_C] > 'c'\r\n");
    expect(text).toContain("c a hand-written comment");
  });
});
