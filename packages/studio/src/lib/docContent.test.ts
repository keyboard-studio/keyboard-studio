// buildDocContent (spec 095 US2): the derived documentation sections, one
// snapshot per slot per fixture plus the rules the snapshots can't state on
// their own (order, coverage, thresholds, suppression).

import { describe, expect, it } from "vitest";
import { DOC_FORMS, buildProducedSet } from "@keyboard-studio/contracts";
import { buildDocContent, TYPING_GUIDE_SUMMARY_THRESHOLD } from "./docContent.ts";
import {
  COMBINING_FIXTURE,
  DEADKEY_FIXTURE,
  DEADKEY_RIGHT_ALT_FIXTURE,
  DOC_FIXTURES,
  LARGE_FIXTURE,
  NO_TOUCH_FIXTURE,
  RIGHT_ALT_FIXTURE,
  ROTA_FIXTURE,
  TOUCH_FIXTURE,
  type DocFixture,
} from "./docContent.fixtures.ts";

const build = (f: DocFixture, inheritedProse: string | null = null) =>
  buildDocContent({ ir: f.ir, touchLayout: f.touchLayout, inheritedProse });

/** Rows of the typing guide's table, as the code points of their first cell. */
function guideRowChars(html: string): number[] {
  return [...html.matchAll(/<tr><td>([^<]*)<\/td>/g)].map((m) => {
    const cell = (m[1] ?? "").replace(/^◌/, "");
    return cell.codePointAt(0) ?? -1;
  });
}

const mechanismParagraphs = (html: string) => [...html.matchAll(/<p>([^<]*)<\/p>/g)].map((m) => m[1]);

describe("buildDocContent snapshots", () => {
  for (const f of DOC_FIXTURES) {
    it(`${f.id}: one snapshot per slot`, () => {
      const { slots } = build(f);
      for (const [slot, value] of Object.entries(slots)) {
        expect(value).toMatchSnapshot(`${f.id}.${slot}`);
      }
    });
  }
});

describe("typing guide", () => {
  it("covers every produced character outside printable ASCII, in code-point order", () => {
    for (const f of DOC_FIXTURES.filter((x) => x !== LARGE_FIXTURE)) {
      const expected = [...buildProducedSet(f.ir)]
        .map((c) => c.codePointAt(0)!)
        .filter((cp) => cp < 0x20 || cp > 0x7e)
        .sort((a, b) => a - b);
      expect(guideRowChars(build(f).slots.typingGuide), f.id).toEqual(expected);
    }
  });

  it("shows the fewest-step keystrokes", () => {
    const guide = build(DEADKEY_FIXTURE).slots.typingGuide;
    expect(guide).toContain("<kbd>&#39;</kbd> then <kbd>e</kbd>");
    expect(build(RIGHT_ALT_FIXTURE).slots.typingGuide).toContain("<kbd>AltGr + n</kbd>");
  });

  it("breaks a step-count tie by the joined label in code-point order", () => {
    // Two one-step ways to type ŋ: AltGr+N and AltGr+M. "AltGr + m" sorts first.
    const f = { ...RIGHT_ALT_FIXTURE };
    const tied = buildDocContent({
      ir: {
        ...f.ir,
        groups: f.ir.groups.map((g) => ({
          ...g,
          rules: [
            ...g.rules,
            {
              ...g.rules[0]!,
              nodeId: "rule#tie",
              context: [{ kind: "vkey", name: "K_M", modifiers: ["RALT"] }],
            },
          ],
        })),
      },
      touchLayout: null,
      inheritedProse: null,
    });
    const row = /<tr><td>ŋ<\/td>.*?<\/tr>/.exec(tied.slots.typingGuide)?.[0] ?? "";
    expect(row).toContain("<kbd>AltGr + m</kbd>");
    expect(row).not.toContain("AltGr + n");
  });

  it("names every character, and draws combining marks on a dotted circle", () => {
    const guide = build(COMBINING_FIXTURE).slots.typingGuide;
    expect(guide).toContain("<td>◌́</td>");
    expect(guide).toContain("U+0301 COMBINING ACUTE ACCENT");
  });

  it("is the empty string when every produced character is printable ASCII", () => {
    expect(build(NO_TOUCH_FIXTURE).slots.typingGuide).toBe("");
  });

  it(`switches to a grouped summary above ${TYPING_GUIDE_SUMMARY_THRESHOLD} rows`, () => {
    const guide = build(LARGE_FIXTURE).slots.typingGuide;
    expect(guide).not.toContain("<table>");
    expect(guide).toMatch(/210/);
    expect(guide.toLowerCase()).toContain("layout");
  });

  it("stays a table at the threshold", () => {
    const rules = LARGE_FIXTURE.ir.groups[0]!.rules.slice(0, TYPING_GUIDE_SUMMARY_THRESHOLD);
    const ir = { ...LARGE_FIXTURE.ir, groups: [{ ...LARGE_FIXTURE.ir.groups[0]!, rules }] };
    const guide = buildDocContent({ ir, touchLayout: null, inheritedProse: null }).slots.typingGuide;
    expect(guide).toContain("<table>");
    expect(guideRowChars(guide)).toHaveLength(TYPING_GUIDE_SUMMARY_THRESHOLD);
  });
});

describe("mechanisms", () => {
  const p = DOC_FORMS.mechanisms;

  it("gives one paragraph per detected mechanism, in the fixed order", () => {
    expect(mechanismParagraphs(build(DEADKEY_RIGHT_ALT_FIXTURE).slots.mechanisms)).toEqual([
      p.deadkeys,
      p.rightAlt,
    ].map((s) => s.replace(/'/g, "&#39;")));
    expect(mechanismParagraphs(build(ROTA_FIXTURE).slots.mechanisms)).toHaveLength(1);
    expect(build(ROTA_FIXTURE).slots.mechanisms).toContain("pressed again");
    expect(build(COMBINING_FIXTURE).slots.mechanisms).toContain("after the letter");
  });

  it("detects no mechanism on a plain keyboard", () => {
    expect(build(NO_TOUCH_FIXTURE).slots.mechanisms).toBe("");
  });

  it("does not take right-Alt or a deadkey for repeat-to-cycle", () => {
    const html = build(DEADKEY_RIGHT_ALT_FIXTURE).slots.mechanisms;
    expect(html).not.toContain("pressed again");
  });
});

describe("touch notes", () => {
  it("lists long-press and flick characters", () => {
    const notes = build(TOUCH_FIXTURE).slots.touchNotes;
    expect(notes).toContain("ŋ");
    expect(notes).toContain("U+014B LATIN SMALL LETTER ENG");
    expect(notes).toContain("ɛ");
    expect(notes.toLowerCase()).toContain("long-press");
    expect(notes.toLowerCase()).toContain("flick");
  });

  it("is empty with no touch layout", () => {
    expect(build(NO_TOUCH_FIXTURE).slots.touchNotes).toBe("");
    expect(build(RIGHT_ALT_FIXTURE).slots.touchNotes).toBe("");
  });
});

describe("character inventory", () => {
  it("groups as letters, marks, punctuation and symbols, and digits", () => {
    const inv = build(NO_TOUCH_FIXTURE).slots.characterInventory;
    expect(inv.indexOf("Letters")).toBeGreaterThanOrEqual(0);
    expect(inv.indexOf("Digits")).toBeGreaterThan(inv.indexOf("Letters"));
    expect(inv).toContain("U+0061 LATIN SMALL LETTER A");
    expect(inv).toContain("U+0031 DIGIT ONE");
    const marks = build(COMBINING_FIXTURE).slots.characterInventory;
    expect(marks).toContain("Marks");
    expect(marks).toContain("◌̀");
  });

  it("shows U+XXXX for a character with no Unicode name", () => {
    const f = buildDocContent({
      ir: {
        ...RIGHT_ALT_FIXTURE.ir,
        groups: RIGHT_ALT_FIXTURE.ir.groups.map((g) => ({
          ...g,
          rules: [{ ...g.rules[0]!, output: [{ kind: "char", value: "" }] }],
        })),
      },
      touchLayout: null,
      inheritedProse: null,
    });
    expect(f.slots.characterInventory).toContain("U+E000");
  });
});

describe("determinism", () => {
  it("gives identical output for two calls", () => {
    for (const f of DOC_FIXTURES) expect(build(f)).toEqual(build(f));
  });
});

describe("typing guide suppression", () => {
  // DEADKEY_FIXTURE's guide holds é and á.
  it("suppresses the guide when one table holds at least half its characters", () => {
    const prose = "<html><body><p>Intro é á</p><table><tr><td>é</td><td>' e</td></tr></table></body></html>";
    const result = build(DEADKEY_FIXTURE, prose);
    expect(result.typingGuideSuppressed).toBe(true);
    expect(result.slots.typingGuide).toBe("");
    expect(result.slots.characterInventory).toBe(build(DEADKEY_FIXTURE).slots.characterInventory);
    expect(result.slots.mechanisms).toBe(build(DEADKEY_FIXTURE).slots.mechanisms);
  });

  it("counts a Markdown list as one list", () => {
    const prose = "Intro\n\n- &eacute; is typed with ' e\n- &#xE1; is typed with ' a\n";
    expect(build(DEADKEY_FIXTURE, prose).typingGuideSuppressed).toBe(true);
  });

  it("does not suppress below half, or when the characters are only in running prose", () => {
    const rota = ROTA_FIXTURE; // ɔ ɛ
    expect(build(rota, "<p>ɛ ɔ</p><ul><li>nothing</li></ul>").typingGuideSuppressed).toBe(false);
    const big = build(RIGHT_ALT_FIXTURE, "<ul><li>a</li></ul>");
    expect(big.typingGuideSuppressed).toBe(false);
  });

  it("suppresses at exactly half", () => {
    expect(build(ROTA_FIXTURE, "<ul><li>ɛ</li></ul>").typingGuideSuppressed).toBe(true);
  });

  it("is never set on Track 1 (no inherited prose)", () => {
    expect(build(DEADKEY_FIXTURE, null).typingGuideSuppressed).toBe(false);
  });
});
