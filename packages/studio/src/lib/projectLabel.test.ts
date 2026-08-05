// projectLabel.test — spec 057 T014 (FR-041).

import { describe, it, expect } from "vitest";
import { deriveProjectLabel } from "./projectLabel.ts";

describe("deriveProjectLabel precedence", () => {
  it("tier 1: the scaffold spec's display name wins over everything", () => {
    expect(
      deriveProjectLabel({
        scaffoldSpec: { displayName: "My Ewondo" },
        identity: { displayName: "Ewondo (patch)" },
        baseKeyboard: { displayName: "French Basic" },
      }),
    ).toBe("My Ewondo");
  });

  it("tier 2: the working-copy identity patch when there is no scaffold spec", () => {
    expect(
      deriveProjectLabel({
        identity: { displayName: "Ewondo (patch)" },
        baseKeyboard: { displayName: "French Basic" },
      }),
    ).toBe("Ewondo (patch)");
  });

  it("tier 3: the base keyboard when neither of the first two is set", () => {
    expect(deriveProjectLabel({ baseKeyboard: { displayName: "French Basic" } })).toBe(
      "French Basic",
    );
  });

  it("tier 4: null when there is nothing to name", () => {
    expect(deriveProjectLabel({})).toBeNull();
    expect(
      deriveProjectLabel({ scaffoldSpec: null, identity: null, baseKeyboard: null }),
    ).toBeNull();
  });
});

describe("blank-string skips", () => {
  it("falls through an empty scaffold display name", () => {
    expect(
      deriveProjectLabel({
        scaffoldSpec: { displayName: "" },
        identity: { displayName: "Ewondo (patch)" },
      }),
    ).toBe("Ewondo (patch)");
  });

  it("falls through a whitespace-only identity display name", () => {
    expect(
      deriveProjectLabel({
        identity: { displayName: "   " },
        baseKeyboard: { displayName: "French Basic" },
      }),
    ).toBe("French Basic");
  });

  it("falls through a null display name at any tier", () => {
    expect(
      deriveProjectLabel({
        scaffoldSpec: { displayName: null },
        identity: { displayName: null },
        baseKeyboard: { displayName: "French Basic" },
      }),
    ).toBe("French Basic");
  });

  it("trims the value it returns", () => {
    expect(deriveProjectLabel({ scaffoldSpec: { displayName: "  My Ewondo  " } })).toBe(
      "My Ewondo",
    );
  });
});

describe("the case that distinguished the two shipped engines", () => {
  // `draftAutosave.deriveLabel` read `survey.identityResult.english` FIRST,
  // so it disagreed with `draftPersistence.saveDraft` exactly here: an
  // identity answer that differs from the name the author typed at
  // project_name. FR-041 (and spec 047) say the project's NAME wins; the
  // identity answer is a fact about the language, not a name for the project.
  // This case had zero coverage before this spec.
  it("prefers the scaffold spec over an identity answer that disagrees with it", () => {
    expect(
      deriveProjectLabel({
        scaffoldSpec: { displayName: "Woods Cree Phonetic" },
        identity: { displayName: "Cree" },
      }),
    ).toBe("Woods Cree Phonetic");
  });

  it("prefers the identity PATCH over the base keyboard on the adapt track", () => {
    // Track 2 sets no scaffoldSpec; the patch carries the adapted keyboard's
    // own name, which is the right label for the card and the footer alike.
    expect(
      deriveProjectLabel({
        scaffoldSpec: null,
        identity: { displayName: "Cree (Woods)" },
        baseKeyboard: { displayName: "bj_cree_woods" },
      }),
    ).toBe("Cree (Woods)");
  });
});
