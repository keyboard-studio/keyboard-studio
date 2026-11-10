import { describe, expect, it } from "vitest";
import { parse } from "./parse.js";
import { isKeyboardSource } from "./keyboard-source.js";

// An MSKLC .klc header and layout, as it reads when saved with a .kmn extension.
const KLC_TEXT = [
  'KBD\tXYZ\t"Example Layout"',
  'COPYRIGHT\t"(c) Example"',
  "LOCALENAME\t\"en-US\"",
  "LAYOUT",
  "02\t1\t0\t1\t0021\t-1",
  "10\tQ\t1\tq\tQ\t-1",
  "KEYNAME",
  "01\tEsc",
  "ENDKBD",
].join("\r\n");

describe("isKeyboardSource", () => {
  it("rejects text that parses to no begin statement and no groups", () => {
    const { ir } = parse(KLC_TEXT);
    expect(ir.groups).toHaveLength(0);
    expect(isKeyboardSource(ir)).toBe(false);
  });

  it("accepts a minimal keyboard", () => {
    const { ir } = parse("store(&NAME) 'Kb'\nbegin Unicode > use(main)\ngroup(main) using keys\n+ [K_A] > 'a'\n");
    expect(isKeyboardSource(ir)).toBe(true);
  });

  it("accepts a keyboard that has groups but no begin statement", () => {
    const { ir } = parse("group(main) using keys\n+ [K_A] > 'a'\n");
    expect(isKeyboardSource(ir)).toBe(true);
  });
});
