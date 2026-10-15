import { describe, expect, it } from "vitest";
import { DocFormParseError, parseDocForm, renderDocForm } from "./renderDocForm.js";

describe("renderDocForm", () => {
  it("inserts a slot value as given", () => {
    expect(renderDocForm("Hello {{displayName}}!", { displayName: "&lt;X&gt;" })).toBe("Hello &lt;X&gt;!");
  });

  it("renders an absent slot as an empty string", () => {
    expect(renderDocForm("[{{credits}}]", {})).toBe("[]");
  });

  it("keeps a block whose slot is non-empty, without its markers", () => {
    expect(renderDocForm("a {{#credits}}<h2>C</h2>{{credits}}{{/credits}} b", { credits: "x" })).toBe("a <h2>C</h2>x b");
  });

  it("drops an empty or whitespace-only block and the newline after it", () => {
    const form = "top\n{{#credits}}<h2>Credits</h2>{{credits}}{{/credits}}\nbottom";
    expect(renderDocForm(form, { credits: "" })).toBe("top\nbottom");
    expect(renderDocForm(form, { credits: "  \n" })).toBe("top\nbottom");
    expect(renderDocForm(form, {})).toBe("top\nbottom");
  });

  it("removes block tags that stand alone on their line, kept or dropped", () => {
    const form = "# T\n{{#usageTips}}\n## Tips\n{{usageTips}}\n{{/usageTips}}\nend\n";
    expect(renderDocForm(form, { usageTips: "- a" })).toBe("# T\n## Tips\n- a\nend\n");
    expect(renderDocForm(form, { usageTips: "" })).toBe("# T\nend\n");
  });

  it("is deterministic", () => {
    const form = "{{#a}}x{{a}}{{/a}}{{b}}";
    const slots = { a: "1", b: "2" } as never;
    expect(renderDocForm(form, slots)).toBe(renderDocForm(form, slots));
  });
});

describe("parseDocForm", () => {
  it("returns every referenced slot id once, in first-use order", () => {
    expect(parseDocForm("{{#credits}}{{credits}} {{displayName}}{{/credits}}{{displayName}}")).toEqual([
      "credits",
      "displayName",
    ]);
  });

  it("names an unbalanced block", () => {
    expect(() => parseDocForm("{{#usageTips}} x")).toThrow(/unbalanced block \{\{#usageTips\}\}/);
    expect(() => parseDocForm("x {{/usageTips}}")).toThrow(/unbalanced block \{\{\/usageTips\}\}/);
    expect(() => parseDocForm("{{#a}}{{#b}}{{/a}}{{/b}}")).toThrow(DocFormParseError);
  });

  it("names a nested block of the same id", () => {
    expect(() => parseDocForm("{{#a}}{{#a}}{{/a}}{{/a}}")).toThrow(/nested block \{\{#a\}\}/);
  });

  it("names an unknown construct", () => {
    expect(() => parseDocForm("{{> partial}}")).toThrow(/unknown construct \{\{> partial\}\}/);
    expect(() => parseDocForm("{{^inverted}}{{/inverted}}")).toThrow(/unknown construct/);
    expect(() => parseDocForm("{{ unclosed")).toThrow(/unknown construct/);
  });

  it("carries the form id when the caller supplies one", () => {
    try {
      parseDocForm("{{#a}}", "body");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(DocFormParseError);
      expect((err as DocFormParseError).formId).toBe("body");
      expect((err as DocFormParseError).message).toMatch(/^form "body": unbalanced block/);
    }
  });
});
