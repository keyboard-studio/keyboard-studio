// oskCodeLint tests — XML well-formedness detection for the Code tab.

import { describe, expect, it } from "vitest";
import { findXmlError, lintOskCodeText } from "./oskCodeLint.ts";

describe("findXmlError", () => {
  it("accepts well-formed XML", () => {
    expect(
      findXmlError('<?xml version="1.0"?>\n<visualkeyboard><header/></visualkeyboard>'),
    ).toBeNull();
  });

  it("accepts the emitter's output shape", () => {
    const xml = [
      '<?xml version="1.0" encoding="utf-8"?>',
      "<visualkeyboard>",
      "  <header>",
      '    <version>10.0</version>',
      "    <flags>",
      "      <key102/>",
      "    </flags>",
      "  </header>",
      '  <encoding name="unicode" fontname="Arial">',
      '    <layer shift="">',
      '      <key vkey="K_A" chars="a">a</key>',
      "    </layer>",
      "  </encoding>",
      "</visualkeyboard>",
      "",
    ].join("\n");
    expect(findXmlError(xml)).toBeNull();
  });

  it("detects mismatched tags", () => {
    const err = findXmlError("<visualkeyboard><header></visualkeyboard>");
    expect(err).not.toBeNull();
    expect(err?.message).toMatch(/mismatched/i);
  });

  it("detects unclosed tags", () => {
    const err = findXmlError("<visualkeyboard><header>");
    expect(err).not.toBeNull();
    expect(err?.message).toMatch(/unclosed/i);
  });

  it("detects stray closing tags", () => {
    const err = findXmlError("<visualkeyboard></header></visualkeyboard>");
    expect(err).not.toBeNull();
  });

  it("ignores comments and CDATA", () => {
    expect(
      findXmlError("<a><!-- <b> --><![CDATA[<c>]]></a>"),
    ).toBeNull();
  });
});

describe("lintOskCodeText", () => {
  it("passes well-formed XML with no markers", () => {
    const result = lintOskCodeText("<visualkeyboard/>");
    expect(result.parsed).toBe(true);
    expect(result.markers).toHaveLength(0);
  });

  it("reports malformed XML as an error marker", () => {
    const result = lintOskCodeText("<visualkeyboard><header>");
    expect(result.parsed).toBe(false);
    expect(result.markers).toHaveLength(1);
    expect(result.markers[0]?.severity).toBe("error");
    expect(result.markers[0]?.code).toBe("XML_SYNTAX");
  });
});
