import { describe, it, expect } from "vitest";
import { parse } from "../codec/parse.js";
import { emit as emitKmn } from "../codec/emit.js";
import { emit } from "./emit.js";

const SRC =
  `store(&VERSION) '10.0'
` +
  `
` +
  `begin Unicode > use(main)
` +
  `
` +
  `group(main) using keys
` +
  `
` +
  `+ 'a' > 'x'   c note
` +
  `+ 'b' > 'y'
`;

describe("emit", () => {
  const ir = parse(SRC, "test").ir;
  const state = { currentText: SRC, currentIr: ir, ir };

  it("unedited copies the text byte for byte", () => {
    expect(emit(state, { kind: "unedited" })).toEqual({ ok: true, text: SRC });
  });

  it("copy emits the model in full", () => {
    expect(emit(state, { kind: "copy" })).toEqual({ ok: true, text: emitKmn(ir) });
  });

  it("open with no change keeps the author's text", () => {
    expect(emit(state, { kind: "open" })).toEqual({ ok: true, text: SRC });
  });

  it("open surfaces needs-consent for an unspliceable change", () => {
    const next = structuredClone(ir);
    next.groups.find((g) => g.rules.length > 1)!.rules.reverse();
    const r = emit({ ...state, ir: next }, { kind: "open" });
    expect(r.ok).toBe(false);
    const c = emit({ ...state, ir: next }, { kind: "open", consentedReemit: true });
    expect(c.ok && c.reformatted !== undefined).toBe(true);
  });
});
