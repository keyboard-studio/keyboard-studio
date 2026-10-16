import { describe, expect, it } from "vitest";
import type {
  ContextElement,
  IRGroup,
  IRRule,
  KeyboardIR,
  OutputElement,
} from "@keyboard-studio/contracts";
import {
  DEADKEY_TROUBLESHOOTING_LINE,
  MARK_ORDER_TROUBLESHOOTING_LINE,
  emitsCombiningMark,
  hasUserFacingDeadkey,
  proposeTroubleshooting,
} from "./troubleshootingProposal.ts";

let seq = 0;
function rule(context: ContextElement[], output: OutputElement[]): IRRule {
  seq += 1;
  return { nodeId: `rule-${seq}`, context, output };
}

function group(usingKeys: boolean, rules: IRRule[]): IRGroup {
  seq += 1;
  return { nodeId: `group-${seq}`, name: `g${seq}`, usingKeys, rules, readonly: false };
}

function ir(groups: IRGroup[]): KeyboardIR {
  return {
    origin: "imported",
    header: {
      keyboardId: "test_kbd",
      name: "Test",
      bcp47: [],
      copyright: "",
      version: "1.0",
      targets: [],
      storeDirectives: [],
    },
    stores: [],
    groups,
    comments: [],
    raw: [],
    recognizedPatterns: [],
  };
}

const vkey = (name: string): ContextElement => ({ kind: "vkey", name, modifiers: [] });
const dk = (id: number): OutputElement & ContextElement => ({ kind: "deadkey", id });
const ch = (value: string): OutputElement => ({ kind: "char", value });

/** A genuine user-facing deadkey: ´ key types nothing, then fans out. */
const deadkeyIr = ir([
  group(true, [
    rule([vkey("K_QUOTE")], [dk(1)]),
    rule([dk(1), vkey("K_A")], [ch("á")]),
    rule([dk(1), vkey("K_E")], [ch("é")]),
  ]),
]);

describe("hasUserFacingDeadkey", () => {
  it("fires for a solely-deadkey keystroke with fan-out", () => {
    expect(hasUserFacingDeadkey(deadkeyIr)).toBe(true);
  });

  it("does not fire for internal dk() state after visible output (korean_rr shape)", () => {
    const internal = ir([
      group(true, [
        // Visible jamo output PLUS a deadkey state marker — the user
        // pressed a key and characters appeared.
        rule([vkey("K_G")], [ch("ᄀ"), dk(7)]),
        rule([dk(7), vkey("K_A")], [ch("가")]),
      ]),
    ]);
    expect(hasUserFacingDeadkey(internal)).toBe(false);
  });

  it("does not fire when no rule consumes the deadkey", () => {
    const orphan = ir([group(true, [rule([vkey("K_QUOTE")], [dk(1)])])]);
    expect(hasUserFacingDeadkey(orphan)).toBe(false);
  });

  it("does not fire for solely-deadkey output outside a using-keys group", () => {
    const notKeys = ir([
      group(false, [
        rule([vkey("K_QUOTE")], [dk(1)]),
        rule([dk(1), vkey("K_A")], [ch("á")]),
      ]),
    ]);
    expect(hasUserFacingDeadkey(notKeys)).toBe(false);
  });
});

describe("emitsCombiningMark", () => {
  it("sees a directly emitted combining mark", () => {
    const marked = ir([group(true, [rule([vkey("K_A")], [ch("a"), ch("́")])])]);
    expect(emitsCombiningMark(marked)).toBe(true);
  });

  it("is false when outputs carry no marks", () => {
    expect(emitsCombiningMark(deadkeyIr)).toBe(false);
  });
});

describe("proposeTroubleshooting", () => {
  it("offers the deadkey line for a user-facing deadkey keyboard", () => {
    expect(proposeTroubleshooting({ ir: deadkeyIr })).toBe(DEADKEY_TROUBLESHOOTING_LINE);
  });

  it("offers the mark-ordering line only under the postfix gate", () => {
    const marked = ir([group(true, [rule([vkey("K_A")], [ch("a"), ch("́")])])]);
    expect(proposeTroubleshooting({ ir: marked, markInputOrder: "postfix" })).toBe(
      MARK_ORDER_TROUBLESHOOTING_LINE,
    );
    // Prefix keyboards type the mark first — the postfix line would be
    // confidently wrong, so nothing is offered for order.
    expect(proposeTroubleshooting({ ir: marked, markInputOrder: "prefix" })).toBeUndefined();
    expect(proposeTroubleshooting({ ir: marked })).toBeUndefined();
  });

  it("offers no mark line when a postfix keyboard emits no marks", () => {
    expect(
      proposeTroubleshooting({ ir: deadkeyIr, markInputOrder: "postfix" }),
    ).toBe(DEADKEY_TROUBLESHOOTING_LINE);
  });

  it("joins both lines, deadkey first, one per line", () => {
    const both = ir([
      group(true, [
        rule([vkey("K_QUOTE")], [dk(1)]),
        rule([dk(1), vkey("K_A")], [ch("á")]),
        rule([vkey("K_X")], [ch("x"), ch("̧")]),
      ]),
    ]);
    expect(proposeTroubleshooting({ ir: both, markInputOrder: "postfix" })).toBe(
      `${DEADKEY_TROUBLESHOOTING_LINE}\n${MARK_ORDER_TROUBLESHOOTING_LINE}`,
    );
  });

  it("is undefined for a null IR and for a keyboard with neither mechanism", () => {
    expect(proposeTroubleshooting({ ir: null })).toBeUndefined();
    const plain = ir([group(true, [rule([vkey("K_A")], [ch("a")])])]);
    expect(proposeTroubleshooting({ ir: plain, markInputOrder: "postfix" })).toBeUndefined();
  });

  it("AC4: template lines carry no generic Keyman boilerplate", () => {
    for (const line of [DEADKEY_TROUBLESHOOTING_LINE, MARK_ORDER_TROUBLESHOOTING_LINE]) {
      expect(line).not.toMatch(/font|install|square box|troubleshooting guide/i);
    }
  });
});
