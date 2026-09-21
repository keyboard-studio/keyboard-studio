// invisibleCandidatesFor — SC-005 completeness: every offered invisible has a
// name, a U+ notation and a need statement (spec 075 FR-013/FR-015).

import { describe, expect, it } from "vitest";
import { i18n } from "../../test/renderWithI18n.tsx";
import {
  BIDI_CONTROL_CODE_POINTS,
  FIXED_INVISIBLE_CODE_POINTS,
  NEED_STATEMENTS,
  invisibleCandidatesFor,
  needStatementFor,
} from "./invisibleCandidates.ts";

const DIRECTIONS = ["rtl", "ltr", "unknown"] as const;
const FIXED_FIVE = [0x200d, 0x200c, 0x200b, 0x00ad, 0x2060];

describe("invisibleCandidatesFor — SC-005 completeness", () => {
  for (const direction of DIRECTIONS) {
    it(`direction ${direction}: every candidate has a non-empty label, a U+XXXX notation and a resolvable need statement`, () => {
      const candidates = invisibleCandidatesFor({ direction, carriedOver: [] });
      expect(candidates.length).toBeGreaterThan(0);
      for (const c of candidates) {
        expect(c.label.length, `label for ${c.notation}`).toBeGreaterThan(0);
        expect(c.notation).toMatch(/^U\+[0-9A-F]{4,6}$/);
        expect(c.needStatementId).toMatch(/^survey\.invisibles\.need\.u[0-9a-f]{4,6}$/);
        const descriptor = needStatementFor(c.codePoint);
        expect(descriptor.id).toBe(c.needStatementId);
        // Renders to a non-empty string through the test catalog (the default
        // message when the catalog has no translation yet).
        expect(i18n._(descriptor).length).toBeGreaterThan(20);
      }
    });
  }

  it("every candidate label is a real name, not the FORMAT CHARACTER fallback", () => {
    const candidates = invisibleCandidatesFor({ direction: "rtl", carriedOver: [] });
    for (const c of candidates) {
      expect(c.label, c.notation).not.toMatch(/^FORMAT CHARACTER/);
    }
    expect(candidates.find((c) => c.codePoint === 0x2060)?.label).toBe("WORD JOINER");
  });

  it("the fixed five are always present, first, with relevance always", () => {
    for (const direction of DIRECTIONS) {
      const candidates = invisibleCandidatesFor({ direction, carriedOver: [] });
      expect(candidates.slice(0, 5).map((c) => c.codePoint)).toEqual(FIXED_FIVE);
      expect(candidates.slice(0, 5).every((c) => c.relevance === "always")).toBe(true);
    }
    expect([...FIXED_INVISIBLE_CODE_POINTS]).toEqual(FIXED_FIVE);
  });

  it("every isBidiControlCodePoint code point is offered; those outside the fixed five carry relevance rtl", () => {
    const candidates = invisibleCandidatesFor({ direction: "rtl", carriedOver: [] });
    for (const cp of BIDI_CONTROL_CODE_POINTS) {
      const c = candidates.find((x) => x.codePoint === cp);
      expect(c, `U+${cp.toString(16)}`).toBeDefined();
      expect(c!.relevance).toBe(FIXED_FIVE.includes(cp) ? "always" : "rtl");
    }
    // The allowlist is the predicate's whole range, listed once each.
    expect(BIDI_CONTROL_CODE_POINTS).toEqual([
      0x200b, 0x200c, 0x200d, 0x200e, 0x200f,
      0x202a, 0x202b, 0x202c, 0x202d, 0x202e,
      0x2066, 0x2067, 0x2068, 0x2069,
      0x061c, 0xfeff,
    ]);
    // Every bidi control has an authored need statement, not the fallback.
    for (const cp of BIDI_CONTROL_CODE_POINTS) expect(NEED_STATEMENTS[cp], `U+${cp.toString(16)}`).toBeDefined();
  });

  it("the bidi group is offered regardless of direction — direction only affects how the step shows it", () => {
    const rtl = invisibleCandidatesFor({ direction: "rtl", carriedOver: [] }).map((c) => c.codePoint);
    const ltr = invisibleCandidatesFor({ direction: "ltr", carriedOver: [] }).map((c) => c.codePoint);
    const unknown = invisibleCandidatesFor({ direction: "unknown", carriedOver: [] }).map((c) => c.codePoint);
    expect(ltr).toEqual(rtl);
    expect(unknown).toEqual(rtl);
  });

  it("a carried-over format character appears once, with relevance carried-over, and non-format carry-overs are ignored", () => {
    // U+2061 FUNCTION APPLICATION is Cf but in neither list.
    const candidates = invisibleCandidatesFor({
      direction: "ltr",
      carriedOver: ["⁡", "⁡", "a", ""],
    });
    const carried = candidates.filter((c) => c.relevance === "carried-over");
    expect(carried.map((c) => c.notation)).toEqual(["U+2061"]);
    expect(carried[0]!.label.length).toBeGreaterThan(0);
    expect(carried[0]!.needStatementId).toBe("survey.invisibles.need.u2061");
    // No authored statement: the carried-over fallback resolves, non-empty.
    expect(i18n._(needStatementFor(0x2061)).length).toBeGreaterThan(20);
    expect(candidates.some((c) => c.codePoint === 0x61)).toBe(false);
  });

  it("a carried-over character that is already a fixed or bidi candidate keeps its original relevance and appears once", () => {
    const candidates = invisibleCandidatesFor({ direction: "ltr", carriedOver: ["‌", "‎"] });
    expect(candidates.filter((c) => c.codePoint === 0x200c)).toHaveLength(1);
    expect(candidates.find((c) => c.codePoint === 0x200c)?.relevance).toBe("always");
    expect(candidates.filter((c) => c.codePoint === 0x200e)).toHaveLength(1);
    expect(candidates.find((c) => c.codePoint === 0x200e)?.relevance).toBe("rtl");
  });
});
