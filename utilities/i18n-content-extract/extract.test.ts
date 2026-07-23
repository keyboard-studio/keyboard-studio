import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  extractAdaptationQuestionStrings,
  extractCriteriaStrings,
  extractPatternStrings,
  slugifyIdSegment,
} from "./extract.js";

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "i18n-content-extract-test-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("slugifyIdSegment", () => {
  it("replaces literal dots so the catalog key stays undecomposed", () => {
    expect(slugifyIdSegment("4.3-copyright-holder-is-authorized")).toBe(
      "4_3-copyright-holder-is-authorized",
    );
  });

  it("leaves dot-free ids untouched", () => {
    expect(slugifyIdSegment("multi_char_sequence")).toBe("multi_char_sequence");
  });
});

describe("extractPatternStrings", () => {
  it("extracts prose and excludes control fields", () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, "sample.yaml"),
      `
id: sample_pattern
title: "Sample title"
description: "Sample description"
category: desktop
appliesTo: [desktop]
strategyId: S-01
kmnFragment: |
  store(x) '{{slotValue}}'
tests: []
validatedForFamilies: []
sourceKeyboards: []
reviewedBy: "reviewer"
reviewDate: "2026-01-01"
questions:
  - id: q1
    prompt: "Sample prompt"
    answerType: char-single
    default: "n"
    options:
      - value: opt1
        label: "Option one"
`,
    );

    const strings = extractPatternStrings(dir);

    expect(strings["content.pattern.sample_pattern.title"]).toBe("Sample title");
    expect(strings["content.pattern.sample_pattern.description"]).toBe(
      "Sample description",
    );
    expect(strings["content.pattern.sample_pattern.question.q1.prompt"]).toBe(
      "Sample prompt",
    );
    expect(
      strings["content.pattern.sample_pattern.question.q1.option.opt1.label"],
    ).toBe("Option one");

    // Control fields never appear as extracted values.
    const values = Object.values(strings);
    expect(values).not.toContain("desktop");
    expect(values).not.toContain("S-01");
    expect(values).not.toContain("char-single");
    expect(values.join("\n")).not.toContain("{{slotValue}}");
    expect(Object.keys(strings)).toHaveLength(4);
  });

  it("slugifies a dotted pattern id in the generated key", () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, "sample.yaml"),
      `
id: "1.2-dotted-id"
title: "Dotted"
description: "Dotted description"
category: desktop
appliesTo: [desktop]
kmnFragment: ""
tests: []
validatedForFamilies: []
sourceKeyboards: []
reviewedBy: "reviewer"
reviewDate: "2026-01-01"
questions: []
`,
    );

    const strings = extractPatternStrings(dir);
    expect(strings["content.pattern.1_2-dotted-id.title"]).toBe("Dotted");
    expect(Object.keys(strings).some((k) => k.includes("1.2-dotted-id"))).toBe(
      false,
    );
  });

  it("recurses into category subdirectories", () => {
    const dir = tempDir();
    const sub = join(dir, "desktop-input");
    mkdirSync(sub);
    writeFileSync(
      join(sub, "nested.yaml"),
      `
id: nested_pattern
title: "Nested title"
description: "Nested description"
category: desktop
appliesTo: [desktop]
kmnFragment: ""
tests: []
validatedForFamilies: []
sourceKeyboards: []
reviewedBy: "reviewer"
reviewDate: "2026-01-01"
questions: []
`,
    );

    const strings = extractPatternStrings(dir);
    expect(strings["content.pattern.nested_pattern.title"]).toBe("Nested title");
  });

  it("skips a file that fails schema validation rather than throwing", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "broken.yaml"), "not: a-valid-pattern\n");
    expect(() => extractPatternStrings(dir)).not.toThrow();
    expect(extractPatternStrings(dir)).toEqual({});
  });

  it("skips a file with invalid YAML syntax (not just schema-invalid) without losing sibling files", () => {
    const dir = tempDir();
    // Unterminated quote — a YAML *parse* error, distinct from a
    // schema-validation failure; must not take down the whole batch.
    writeFileSync(join(dir, "malformed.yaml"), 'id: bad\ntitle: "unterminated\ndescription: x\n');
    writeFileSync(
      join(dir, "valid.yaml"),
      `
id: valid_pattern
title: "Valid title"
description: "Valid description"
category: desktop
appliesTo: [desktop]
kmnFragment: ""
tests: []
validatedForFamilies: []
sourceKeyboards: []
reviewedBy: "reviewer"
reviewDate: "2026-01-01"
questions: []
`,
    );

    let strings: Record<string, string> = {};
    expect(() => {
      strings = extractPatternStrings(dir);
    }).not.toThrow();
    expect(strings["content.pattern.valid_pattern.title"]).toBe("Valid title");
  });

  it("keeps the first occurrence and skips a later file with a duplicate pattern id", () => {
    const dir = tempDir();
    const body = (title: string) => `
id: dup_pattern
title: "${title}"
description: "Description"
category: desktop
appliesTo: [desktop]
kmnFragment: ""
tests: []
validatedForFamilies: []
sourceKeyboards: []
reviewedBy: "reviewer"
reviewDate: "2026-01-01"
questions: []
`;
    writeFileSync(join(dir, "a-first.yaml"), body("First"));
    writeFileSync(join(dir, "b-second.yaml"), body("Second"));

    const strings = extractPatternStrings(dir);
    expect(strings["content.pattern.dup_pattern.title"]).toBe("First");
    expect(Object.keys(strings)).toHaveLength(2);
  });

  it("preserves multiline/unicode prose exactly", () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, "unicode.yaml"),
      `
id: unicode_pattern
title: "Tap-and-add accent"
description: >
  Type the base letter, then a combining mark: aeiouAEIOU -> áéíóúÁÉÍÓÚ.
  Preserve exactly: U+0301 for combining acute.
category: desktop
appliesTo: [desktop]
kmnFragment: ""
tests: []
validatedForFamilies: []
sourceKeyboards: []
reviewedBy: "reviewer"
reviewDate: "2026-01-01"
questions: []
`,
    );

    const strings = extractPatternStrings(dir);
    const description = strings["content.pattern.unicode_pattern.description"];
    expect(description).toContain("áéíóúÁÉÍÓÚ");
    expect(description).toContain("U+0301");
  });
});

describe("extractAdaptationQuestionStrings", () => {
  it("extracts provenanceLabel and excludes elicits + control fields", () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, "q_sample.yaml"),
      `
id: q_sample
family: script-alignment
elicits: >
  A dev-facing gloss of what this question teases out.
firingCondition: "target == Latn"
provenanceLabel: "the base keyboard's script"
scope: session
renders: true
`,
    );

    const strings = extractAdaptationQuestionStrings(dir);
    expect(strings).toEqual({
      "content.adaptationQuestion.q_sample.provenanceLabel":
        "the base keyboard's script",
    });
  });

  it("skips a record missing provenanceLabel", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "q_no_label.yaml"), "id: q_no_label\nfamily: script-alignment\n");
    expect(extractAdaptationQuestionStrings(dir)).toEqual({});
  });

  it("skips a record with an empty provenanceLabel", () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, "q_empty_label.yaml"),
      'id: q_empty_label\nfamily: script-alignment\nprovenanceLabel: "   "\n',
    );
    expect(extractAdaptationQuestionStrings(dir)).toEqual({});
  });

  it("skips a file with invalid YAML syntax without losing sibling files", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "malformed.yaml"), 'id: bad\nprovenanceLabel: "unterminated\n');
    writeFileSync(
      join(dir, "valid.yaml"),
      'id: q_valid\nprovenanceLabel: "A valid label"\n',
    );

    let strings: Record<string, string> = {};
    expect(() => {
      strings = extractAdaptationQuestionStrings(dir);
    }).not.toThrow();
    expect(strings["content.adaptationQuestion.q_valid.provenanceLabel"]).toBe(
      "A valid label",
    );
  });

  it("keeps the first occurrence and skips a later file with a duplicate id", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "a-first.yaml"), 'id: dup_q\nprovenanceLabel: "First"\n');
    writeFileSync(join(dir, "b-second.yaml"), 'id: dup_q\nprovenanceLabel: "Second"\n');

    const strings = extractAdaptationQuestionStrings(dir);
    expect(strings["content.adaptationQuestion.dup_q.provenanceLabel"]).toBe(
      "First",
    );
    expect(Object.keys(strings)).toHaveLength(1);
  });
});

describe("extractCriteriaStrings", () => {
  it("extracts description for every band and checklistText only for red-checklist", () => {
    const strings = extractCriteriaStrings();
    const keys = Object.keys(strings);

    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((k) => k.startsWith("content.criteria."))).toBe(true);

    const checklistKeys = keys.filter((k) => k.endsWith(".checklistText"));
    const descriptionKeys = keys.filter((k) => k.endsWith(".description"));
    // Every criterion contributes a description; only red-checklist band rows
    // additionally contribute a checklistText — so checklist count must be
    // strictly less than the description count (some rows are not that band).
    expect(checklistKeys.length).toBeLessThan(descriptionKeys.length);
    expect(checklistKeys.length).toBeGreaterThan(0);
  });

  it("slugifies dotted criterion ids", () => {
    const strings = extractCriteriaStrings();
    const anyDottedKeyLeaked = Object.keys(strings).some((k) => {
      // A properly-slugified key has no dot inside the id segment itself —
      // only the fixed `content.criteria.<id>.<field>` separators.
      const segments = k.split(".");
      return segments.length !== 4;
    });
    expect(anyDottedKeyLeaked).toBe(false);
  });
});
