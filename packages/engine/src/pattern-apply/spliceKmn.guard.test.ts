// The store-editing guard confirms with the real parser (spec 111 Open). A
// parser that reads the edited line differently from the emitted one rejects
// it, and the emitted text is used instead. The parser is wrapped so that it
// misreads exactly the edited (spelling-preserving) line.

import { describe, it, expect, vi } from "vitest";

vi.mock("../codec/parse.js", async (orig) => {
  const actual = await orig<typeof import("../codec/parse.js")>();
  return {
    ...actual,
    parse: (text: string, id: string) => {
      const r = actual.parse(text, id);
      if (text.startsWith("store(x) U+0042 U+0043")) {
        for (const s of r.ir.stores) s.items = [...s.items].reverse();
      }
      return r;
    },
  };
});

import { parse as realParse } from "../codec/parse.js";
import { emitStore } from "../codec/emit.js";
import { projectKmnText } from "./spliceKmn.js";

describe("store guard", () => {
  it("falls back to the emitted line when the parser reads the edited line differently", () => {
    const text = `store(x) U+0041 U+0042 U+0043\nbegin Unicode > use(main)\ngroup(main) using keys\n+ [K_A] > 'a'\n`;
    const ir = realParse(text, "t").ir;
    const next = structuredClone(ir);
    const s = next.stores.find((q) => q.name === "x")!;
    s.items = s.items.slice(1);
    const r = projectKmnText(text, ir, next);
    expect(r.ok && r.text.split("\n")[0]).toBe(emitStore(s));
  });
});
