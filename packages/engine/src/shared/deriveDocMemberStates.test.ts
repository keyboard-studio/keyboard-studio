// deriveDocMemberStates — spec 076 US3 (T024): the FR-022 single source of
// truth for member tier + placeholder across the authoring tracks.

import { describe, it, expect } from "vitest";
import { DOC_MEMBER_IDS, type HelpDocsAnswers, type HistoryEntryState } from "@keyboard-studio/contracts";
import {
  deriveDocMemberStates,
  docMemberPath,
  historyEntryShips,
  type DeriveDocMemberStatesInput,
} from "./deriveDocMemberStates.js";

const ANSWERED: HelpDocsAnswers = { description: "Types Hausa with hooked letters.", usageTips: [] };

const BASE_DOCS = {
  welcomeHtmText: "<html><body><p>Base welcome.</p></body></html>",
  helpPhpText: "<?php $pagename = 'Base Keyboard Help'; ?><p>Base help.</p>",
  readmeMdText: "# Base\n\nBase description.\n",
  historyMdText: "## 1.0 (2020-01-01)\n* Initial release.\n",
  hasWelcomeImages: true,
};

const NO_BASE_DOCS = {
  welcomeHtmText: null,
  helpPhpText: null,
  readmeMdText: null,
  historyMdText: null,
  hasWelcomeImages: false,
};

function confirmed(status: HistoryEntryState["status"]): HistoryEntryState {
  return {
    status,
    proposal: { version: "1.0", dateIso: "2026-09-12", bullets: ["Initial release."] },
    editedBullets: status === "edited" ? ["Edited bullet."] : null,
  };
}

function input(overrides: Partial<DeriveDocMemberStatesInput>): DeriveDocMemberStatesInput {
  return {
    instantiationMode: null,
    helpDocs: null,
    historyEntryState: null,
    base: NO_BASE_DOCS,
    keyboardId: "hausa_basic",
    missingInheritedImages: [],
    ...overrides,
  };
}

function byMember(states: ReturnType<typeof deriveDocMemberStates>) {
  return Object.fromEntries(states.map((s) => [s.member, s])) as Record<
    (typeof DOC_MEMBER_IDS)[number],
    (typeof states)[number]
  >;
}

describe("deriveDocMemberStates — shape", () => {
  it("returns exactly six entries in DocMemberId order with the projected paths", () => {
    const states = deriveDocMemberStates(input({}));
    expect(states.map((s) => s.member)).toEqual([...DOC_MEMBER_IDS]);
    expect(states.map((s) => s.path)).toEqual([
      "README.md",
      "HISTORY.md",
      "LICENSE.md",
      "source/readme.htm",
      "source/welcome/welcome.htm",
      "source/help/hausa_basic.php",
    ]);
    expect(docMemberPath("help-php", "other_id")).toBe("source/help/other_id.php");
  });
});

describe("deriveDocMemberStates — net-new (no base documentation)", () => {
  it("marks every prose member derived + placeholder before Phase F; LICENSE is derived and never a placeholder", () => {
    const m = byMember(deriveDocMemberStates(input({ instantiationMode: "new-from-base" })));
    for (const id of ["readme-md", "history-md", "readme-htm", "welcome-htm", "help-php"] as const) {
      expect(m[id].tier).toBe("derived");
      expect(m[id].placeholder).toBe(true);
    }
    expect(m["license-md"]).toMatchObject({ tier: "derived", placeholder: false, fillStepId: "identity" });
    expect(m["help-php"].fillStepId).toBe("help");
  });

  it("flips the description-fed members to authored once the description is answered", () => {
    const m = byMember(deriveDocMemberStates(input({ instantiationMode: "new-from-base", helpDocs: ANSWERED })));
    for (const id of ["readme-md", "readme-htm", "welcome-htm", "help-php"] as const) {
      expect(m[id]).toMatchObject({ tier: "authored", placeholder: false });
    }
    // HISTORY is governed by its own proposal, not by the description.
    expect(m["history-md"]).toMatchObject({ tier: "derived", placeholder: true });
  });

  it("treats a blank description as unanswered", () => {
    const m = byMember(
      deriveDocMemberStates(input({ helpDocs: { description: "   ", usageTips: [] } })),
    );
    expect(m["welcome-htm"]).toMatchObject({ tier: "derived", placeholder: true });
  });
});

describe("deriveDocMemberStates — Track 1 copy never inherits prose (FR-007)", () => {
  it("reports derived, not inherited, even when base doc slices are populated", () => {
    const m = byMember(deriveDocMemberStates(input({ instantiationMode: "new-from-base", base: BASE_DOCS })));
    for (const id of ["readme-md", "history-md", "welcome-htm", "help-php"] as const) {
      expect(m[id].tier).toBe("derived");
      expect(m[id].placeholder).toBe(true);
    }
  });
});

describe("deriveDocMemberStates — Track 2 adaptation", () => {
  it("reports inherited for every member the base ships, with no placeholder marker", () => {
    const m = byMember(deriveDocMemberStates(input({ instantiationMode: "adapt-existing", base: BASE_DOCS })));
    for (const id of ["readme-md", "welcome-htm", "help-php"] as const) {
      expect(m[id]).toMatchObject({ tier: "inherited", placeholder: false });
    }
    // readme.htm is never fetched from a base.
    expect(m["readme-htm"]).toMatchObject({ tier: "derived", placeholder: true });
  });

  it("HISTORY: inherited tier while the proposal is undecided, but still a placeholder (FR-011)", () => {
    const m = byMember(deriveDocMemberStates(input({ instantiationMode: "adapt-existing", base: BASE_DOCS })));
    expect(m["history-md"]).toMatchObject({ tier: "inherited", placeholder: true });
  });

  it("authored wins over inherited once the description is answered (FR-005 order)", () => {
    const m = byMember(
      deriveDocMemberStates(input({ instantiationMode: "adapt-existing", base: BASE_DOCS, helpDocs: ANSWERED })),
    );
    expect(m["welcome-htm"].tier).toBe("authored");
    expect(m["readme-md"].tier).toBe("authored");
  });

  it("falls back to derived + placeholder for members the base does not ship", () => {
    const m = byMember(
      deriveDocMemberStates(
        input({ instantiationMode: "adapt-existing", base: { ...BASE_DOCS, welcomeHtmText: null, helpPhpText: "" } }),
      ),
    );
    expect(m["welcome-htm"]).toMatchObject({ tier: "derived", placeholder: true });
    expect(m["help-php"]).toMatchObject({ tier: "derived", placeholder: true });
    expect(m["readme-md"]).toMatchObject({ tier: "inherited", placeholder: false });
  });
});

describe("deriveDocMemberStates — HISTORY proposal state (FR-011)", () => {
  it.each(["confirmed", "edited"] as const)("%s entry ships: authored, no placeholder", (status) => {
    const m = byMember(deriveDocMemberStates(input({ historyEntryState: confirmed(status) })));
    expect(m["history-md"]).toMatchObject({ tier: "authored", placeholder: false });
    expect(historyEntryShips(confirmed(status))).toBe(true);
  });

  it.each(["proposed", "dismissed"] as const)("%s entry leaves the stub: placeholder marked", (status) => {
    const m = byMember(deriveDocMemberStates(input({ historyEntryState: confirmed(status) })));
    expect(m["history-md"].placeholder).toBe(true);
    expect(m["history-md"].tier).toBe("derived");
    expect(historyEntryShips(confirmed(status))).toBe(false);
  });

  it("dismissed on an adaptation: inherited base entries still ride below, placeholder still marked", () => {
    const m = byMember(
      deriveDocMemberStates(
        input({ instantiationMode: "adapt-existing", base: BASE_DOCS, historyEntryState: confirmed("dismissed") }),
      ),
    );
    expect(m["history-md"]).toMatchObject({ tier: "inherited", placeholder: true });
  });
});

describe("deriveDocMemberStates — missing inherited images (edge case)", () => {
  it("annotates the welcome row with one warning per missing image and nothing else", () => {
    const states = deriveDocMemberStates(
      input({
        instantiationMode: "adapt-existing",
        base: BASE_DOCS,
        missingInheritedImages: ["desktop_default.png", "phone_shift.png"],
      }),
    );
    const m = byMember(states);
    expect(m["welcome-htm"].warnings).toEqual([
      "missing inherited image: desktop_default.png",
      "missing inherited image: phone_shift.png",
    ]);
    for (const s of states) {
      if (s.member !== "welcome-htm") expect(s.warnings).toEqual([]);
    }
  });
});
