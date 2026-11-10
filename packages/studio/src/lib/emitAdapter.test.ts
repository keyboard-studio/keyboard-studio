import { describe, expect, it } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { parseKmn, emitKmn } from "@keyboard-studio/engine";
import { writeKmnThroughEmit } from "./emitAdapter.ts";

const SRC =
  "store(&VERSION) '10.0'\r\n\r\nbegin Unicode > use(main)\r\n\r\ngroup(main) using keys\r\n\r\n" +
  "+ 'a' > 'x'   c note\r\n+ 'b' > 'y'\r\n";

function ctx(openMode: { consentedReemit?: boolean } | undefined) {
  const vfs = createVirtualFS();
  vfs.set("source/kb.kmn", SRC, false);
  return { vfs, openMode, warnings: [] as string[], reformatRequired: [] as string[] };
}

describe("writeKmnThroughEmit", () => {
  const ir = parseKmn(SRC, "kb").ir;

  it("copy: a full emit", () => {
    const c = ctx(undefined);
    writeKmnThroughEmit(c, "source/kb.kmn", SRC, ir, ir);
    expect(String(c.vfs.get("source/kb.kmn")?.content)).toBe(emitKmn(ir));
    expect(c.reformatRequired).toEqual([]);
  });

  it("open: an unchanged model keeps the author's bytes", () => {
    const c = ctx({});
    writeKmnThroughEmit(c, "source/kb.kmn", SRC, ir, structuredClone(ir));
    expect(String(c.vfs.get("source/kb.kmn")?.content)).toBe(SRC);
  });

  it("open: an unspliceable change waits for consent, then reformats", () => {
    const next = structuredClone(ir);
    next.groups.find((g) => g.rules.length > 1)!.rules.reverse();
    const waiting = ctx({});
    writeKmnThroughEmit(waiting, "source/kb.kmn", SRC, ir, next);
    expect(waiting.reformatRequired).toEqual(["source/kb.kmn"]);
    expect(String(waiting.vfs.get("source/kb.kmn")?.content)).toBe(SRC);
    const agreed = ctx({ consentedReemit: true });
    writeKmnThroughEmit(agreed, "source/kb.kmn", SRC, ir, next);
    expect(agreed.reformatRequired).toEqual([]);
    expect(agreed.warnings[0]).toContain("reformatted");
  });
});
