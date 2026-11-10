import { describe, it, expect } from "vitest";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";
import { openSplice } from "./openSplice.js";

const SRC =
  `store(&VERSION) '10.0'\r\n` +
  `store(&NAME) 'Test'\r\n` +
  `\r\n` +
  `begin Unicode > use(main)\r\n` +
  `\r\n` +
  `group(main) using keys\r\n` +
  `\r\n` +
  `+ 'a' > 'x'   c author comment\r\n` +
  `+ 'b' > 'y'\r\n`;

function ir(): KeyboardIR {
  return parse(SRC, "test").ir;
}

describe("openSplice", () => {
  it("changes only the edited rule and keeps the rest byte-identical", () => {
    const cur = ir();
    const next = structuredClone(cur);
    const rule = next.groups[0]!.rules[1]!;
    rule.output = [{ kind: "char", value: "z" }];
    const r = openSplice({ currentText: SRC, currentIr: cur, nextIr: next });
    expect(r.kind).toBe("spliced");
    if (r.kind !== "spliced") return;
    expect(r.text).toContain("+ 'a' > 'x'   c author comment\r\n");
    expect(r.text).toContain("U+007A");
    expect(r.text).not.toContain("> 'y'");
  });

  it("returns the text unchanged when nothing changed", () => {
    const cur = ir();
    const r = openSplice({ currentText: SRC, currentIr: cur, nextIr: structuredClone(cur) });
    expect(r).toEqual({ kind: "spliced", text: SRC });
  });

  it("asks for consent when a reorder cannot be spliced, and reformats only with it", () => {
    const cur = ir();
    const next = structuredClone(cur);
    next.groups[0]!.rules.reverse();
    const no = openSplice({ currentText: SRC, currentIr: cur, nextIr: next });
    expect(no.kind).toBe("needs-consent");
    const yes = openSplice({ currentText: SRC, currentIr: cur, nextIr: next, consentedReemit: true });
    expect(yes.kind).toBe("reformatted");
  });
});
