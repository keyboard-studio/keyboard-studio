// Unit tests for pure extraction helpers exported from PhaseA.tsx:
//   extractIdentity, extractProvenance

import { describe, it, expect } from "vitest";
import { extractIdentity, extractProvenance } from "./PhaseA.tsx";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Answer = { questionId: string; answerType: "text" | "select"; value: string };

// Build a minimal SurveyPhaseResult-shaped object without importing contracts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeResult(answers: Answer[]): any {
  return { phase: "A" as const, answers };
}

function a(questionId: string, value: string): Answer {
  return { questionId, answerType: "select", value };
}

// Minimum required answers for extractIdentity to return a non-undefined result.
function identityBase(overrides: Partial<Record<string, string>> = {}): Answer[] {
  const defaults: Record<string, string> = {
    language_name_english: "French",
    pa_copyright_holder: "SIL International",
    layout_family: "qwerty",
    iso_code: "fr",
    ...overrides,
  };
  return Object.entries(defaults).map(([k, v]) => a(k, v));
}

// ---------------------------------------------------------------------------
// extractIdentity — required fields
// ---------------------------------------------------------------------------

describe("extractIdentity — required fields", () => {
  it("returns undefined when language_name_english is missing", () => {
    const result = makeResult([a("pa_copyright_holder", "SIL International")]);
    expect(extractIdentity(result)).toBeUndefined();
  });

  it("returns undefined when pa_copyright_holder is missing", () => {
    const result = makeResult([a("language_name_english", "French")]);
    expect(extractIdentity(result)).toBeUndefined();
  });

  it("returns undefined when iso_code is blank (would produce unsubmittable 'und' tag)", () => {
    const result = makeResult(identityBase({ iso_code: "" }));
    expect(extractIdentity(result)).toBeUndefined();
  });

  it("returns an object when all required fields are present", () => {
    const result = makeResult(identityBase());
    expect(extractIdentity(result)).not.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// extractIdentity — routingGroup derivation
// ---------------------------------------------------------------------------

describe("extractIdentity — routingGroup", () => {
  it("maps 'azerty' layout to routingGroup 'azerty'", () => {
    const result = makeResult(identityBase({ layout_family: "azerty" }));
    expect(extractIdentity(result)?.routingGroup).toBe("azerty");
  });

  it("maps 'non-roman' layout to routingGroup 'non-roman'", () => {
    const result = makeResult(identityBase({ layout_family: "non-roman" }));
    expect(extractIdentity(result)?.routingGroup).toBe("non-roman");
  });

  it("maps 'qwerty' layout to routingGroup 'qwerty-qwertz'", () => {
    const result = makeResult(identityBase({ layout_family: "qwerty" }));
    expect(extractIdentity(result)?.routingGroup).toBe("qwerty-qwertz");
  });

  it("maps 'qwertz' layout to routingGroup 'qwerty-qwertz'", () => {
    const result = makeResult(identityBase({ layout_family: "qwertz" }));
    expect(extractIdentity(result)?.routingGroup).toBe("qwerty-qwertz");
  });

  it("maps unknown layout to routingGroup 'qwerty-qwertz' (catch-all)", () => {
    const result = makeResult(identityBase({ layout_family: "dvorak" }));
    expect(extractIdentity(result)?.routingGroup).toBe("qwerty-qwertz");
  });
});

// ---------------------------------------------------------------------------
// extractIdentity — bcp47Tag
// ---------------------------------------------------------------------------

describe("extractIdentity — bcp47Tag", () => {
  it("uses iso_code when present", () => {
    const result = makeResult(identityBase({ iso_code: "fr" }));
    expect(extractIdentity(result)?.bcp47Tag).toBe("fr");
  });

  it("composes language + script subtags when primary_script is present", () => {
    const result = makeResult([
      ...identityBase({ iso_code: "sr" }),
      a("primary_script", "Cyrl"),
    ]);
    expect(extractIdentity(result)?.bcp47Tag).toBe("sr-Cyrl");
  });

  it("does not append the 'Other' script sentinel", () => {
    const result = makeResult([
      ...identityBase({ iso_code: "xyz" }),
      a("primary_script", "Other"),
    ]);
    expect(extractIdentity(result)?.bcp47Tag).toBe("xyz");
  });
});

// ---------------------------------------------------------------------------
// extractIdentity — displayName
// ---------------------------------------------------------------------------

describe("extractIdentity — displayName", () => {
  it("uses only the English name when autonym is absent", () => {
    const result = makeResult(identityBase({ language_name_english: "French" }));
    expect(extractIdentity(result)?.displayName).toBe("French");
  });

  it("combines autonym and English name when autonym is present", () => {
    const result = makeResult([
      ...identityBase({ language_name_english: "French" }),
      a("language_name_autonym", "Français"),
    ]);
    expect(extractIdentity(result)?.displayName).toBe("Français (French)");
  });
});

// ---------------------------------------------------------------------------
// extractIdentity — scriptFamily
// ---------------------------------------------------------------------------

describe("extractIdentity — scriptFamily", () => {
  it("attaches scriptFamily for valid non-roman script family", () => {
    const result = makeResult([
      ...identityBase({ layout_family: "non-roman" }),
      a("script_family", "indic"),
    ]);
    const identity = extractIdentity(result);
    expect(identity?.scriptFamily).toBe("indic");
  });

  it("does not attach scriptFamily when routingGroup is not non-roman", () => {
    const result = makeResult([
      ...identityBase({ layout_family: "qwerty" }),
      a("script_family", "indic"),
    ]);
    const identity = extractIdentity(result);
    expect(identity?.scriptFamily).toBeUndefined();
  });

  it("does not attach scriptFamily for an unknown family value", () => {
    const result = makeResult([
      ...identityBase({ layout_family: "non-roman" }),
      a("script_family", "logographic"),
    ]);
    const identity = extractIdentity(result);
    expect(identity?.scriptFamily).toBeUndefined();
  });

  it("attaches scriptFamily 'rtl' for non-roman layout", () => {
    const result = makeResult([
      ...identityBase({ layout_family: "non-roman" }),
      a("script_family", "rtl"),
    ]);
    expect(extractIdentity(result)?.scriptFamily).toBe("rtl");
  });
});

// ---------------------------------------------------------------------------
// extractProvenance
// ---------------------------------------------------------------------------

describe("extractProvenance — empty result", () => {
  it("returns an empty object when no provenance answers are present", () => {
    const result = makeResult(identityBase());
    const prov = extractProvenance(result);
    expect(prov).toEqual({});
  });
});

describe("extractProvenance — requester block", () => {
  it("populates requester.name when present", () => {
    const result = makeResult([
      ...identityBase(),
      a("provenance_requester_name", "John"),
    ]);
    expect(extractProvenance(result).requester?.name).toBe("John");
  });

  it("populates requester.contact when present", () => {
    const result = makeResult([
      ...identityBase(),
      a("provenance_requester_contact", "john@example.com"),
    ]);
    expect(extractProvenance(result).requester?.contact).toBe("john@example.com");
  });

  it("does not include requester block when no requester fields are answered", () => {
    const result = makeResult(identityBase());
    expect(extractProvenance(result).requester).toBeUndefined();
  });
});

describe("extractProvenance — localizedName", () => {
  it("populates localizedName from language_name_autonym", () => {
    const result = makeResult([
      ...identityBase(),
      a("language_name_autonym", "Français"),
    ]);
    expect(extractProvenance(result).localizedName).toBe("Français");
  });
});

describe("extractProvenance — optional scalar fields", () => {
  it("populates speakerCount when present", () => {
    const result = makeResult([
      ...identityBase(),
      a("provenance_speaker_count", "1000000"),
    ]);
    expect(extractProvenance(result).speakerCount).toBe("1000000");
  });

  it("does not set speakerCount when absent", () => {
    const result = makeResult(identityBase());
    expect(extractProvenance(result).speakerCount).toBeUndefined();
  });
});
