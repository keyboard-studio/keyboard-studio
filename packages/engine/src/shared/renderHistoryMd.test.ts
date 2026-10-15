// Tests for renderHistoryMd (spec 080 T040/T041; spec 102 T006 lineage).
//
// Coverage:
//   1. null entry, no lineage -> byte-identical to the scaffolder's Track-1
//      stub (generateStubs, scaffolder/index.ts).
//   2. null entry, `adapted` lineage -> byte-identical to the pre-102
//      `adaptedFrom` output (today's stageAdaptHistory shape), pinned as
//      literals, for both a fresh and a pre-existing base HISTORY.md (FR-007).
//   3. "proposed" status (shown, not yet decided) renders the same stub as
//      null/dismissed — nothing not yet author-endorsed ships (FR-011).
//   4. "dismissed" status renders the same stub as null.
//   5. "confirmed" entry renders the proposal's bullets at the top under a
//      heading using opts.version + the stored proposal.dateIso.
//   6. "edited" entry renders editedBullets, not the original proposal bullets.
//   7. base text preserved verbatim below the entry, separated by exactly one
//      blank line (criterion 3.4).
//   8. "Adapted from" is injected first on adaptations even when the author's
//      edited bullets don't mention it.
//   9. "Adapted from" is not duplicated when the edited bullets already
//      contain it verbatim.
//   10. Version-change edge case: heading uses opts.version even though the
//       entry's proposal.version was derived for an earlier version; the
//       date and editedBullets are kept from the stored entry.
//   11. HISTORY_INITIAL_RELEASE_BULLET / adaptedFromBullet / createdFromBullet text.
//   12. `created` lineage (Copy, FR-011): undecided -> created-from bullet then
//       "Initial release."; decided -> injected first; a verbatim bullet is
//       not duplicated; history bullets are not Markdown-escaped.

import { describe, it, expect } from "vitest";
import type { HistoryEntryState } from "@keyboard-studio/contracts";
import {
  renderHistoryMd,
  HISTORY_INITIAL_RELEASE_BULLET,
  adaptedFromBullet,
  createdFromBullet,
} from "./renderHistoryMd.js";

function confirmedEntry(bullets: string[], overrides: Partial<HistoryEntryState> = {}): HistoryEntryState {
  return {
    status: "confirmed",
    proposal: { version: "1.1", dateIso: "2026-06-18", bullets },
    editedBullets: null,
    ...overrides,
  };
}

describe("renderHistoryMd — undecided/dismissed stub", () => {
  it("null entry, Track 1: byte-identical to the scaffolder's stub", () => {
    const rendered = renderHistoryMd(null, {
      version: "1.0",
      dateIso: "2026-06-18",
      lineage: null,
      startHistoryText: null,
    });
    expect(rendered).toBe(`## 1.0 (2026-06-18)\n* Initial release.\n`);
  });

  it("null entry, adapted lineage (fresh base HISTORY): exactly the pre-102 adaptedFrom output", () => {
    const expected = "## 1.1 (2026-06-18)\n* Adapted from basic_kbdus v1.0 via keyboard-studio.\n";

    const rendered = renderHistoryMd(null, {
      version: "1.1",
      dateIso: "2026-06-18",
      lineage: { kind: "adapted", id: "basic_kbdus", version: "1.0" },
      startHistoryText: null,
    });
    expect(rendered).toBe(expected);
  });

  it("null entry, adapted lineage (pre-existing base HISTORY): exactly the pre-102 adaptedFrom output", () => {
    const startHistory = "## 1.0 (2025-01-01)\n* Initial release.\n";
    const expected =
      "## 1.1 (2026-06-18)\n* Adapted from basic_kbdus v1.0 via keyboard-studio.\n\n" + startHistory;

    const rendered = renderHistoryMd(null, {
      version: "1.1",
      dateIso: "2026-06-18",
      lineage: { kind: "adapted", id: "basic_kbdus", version: "1.0" },
      startHistoryText: startHistory,
    });
    expect(rendered).toBe(expected);
  });

  it("'proposed' status (shown, not yet decided) renders the same stub as null", () => {
    const entry: HistoryEntryState = {
      status: "proposed",
      proposal: { version: "1.0", dateIso: "2026-06-18", bullets: ["Initial release."] },
      editedBullets: null,
    };
    const opts = { version: "1.0", dateIso: "2026-06-18", lineage: null, startHistoryText: null };
    expect(renderHistoryMd(entry, opts)).toBe(renderHistoryMd(null, opts));
  });

  it("'dismissed' status renders the same stub as null", () => {
    const entry: HistoryEntryState = {
      status: "dismissed",
      proposal: { version: "1.0", dateIso: "2026-06-18", bullets: ["Added 2 characters: a, b"] },
      editedBullets: null,
    };
    const opts = { version: "1.0", dateIso: "2026-06-18", lineage: null, startHistoryText: null };
    expect(renderHistoryMd(entry, opts)).toBe(renderHistoryMd(null, opts));
  });
});

describe("renderHistoryMd — confirmed/edited entry", () => {
  it("confirmed entry renders the proposal bullets under a heading with opts.version + stored dateIso", () => {
    const entry = confirmedEntry(["Added 2 characters: é, è"]);
    const rendered = renderHistoryMd(entry, {
      version: "1.1",
      dateIso: "2099-01-01", // must be ignored in favor of entry.proposal.dateIso
      lineage: null,
      startHistoryText: null,
    });
    expect(rendered).toBe(`## 1.1 (2026-06-18)\n* Added 2 characters: é, è\n`);
  });

  it("edited entry renders editedBullets, not the original proposal bullets", () => {
    const entry = confirmedEntry(["Added 2 characters: é, è"], {
      status: "edited",
      editedBullets: ["Added accented vowels for French."],
    });
    const rendered = renderHistoryMd(entry, {
      version: "1.1",
      dateIso: "2026-06-18",
      lineage: null,
      startHistoryText: null,
    });
    expect(rendered).toBe(`## 1.1 (2026-06-18)\n* Added accented vowels for French.\n`);
  });

  it("preserves base text verbatim below the entry, separated by exactly one blank line", () => {
    const entry = confirmedEntry(["Added 2 characters: é, è"]);
    const startHistoryText = "## 1.0 (2025-01-01)\n* Initial release.\n";
    const rendered = renderHistoryMd(entry, {
      version: "1.1",
      dateIso: "2026-06-18",
      lineage: null,
      startHistoryText,
    });
    expect(rendered).toBe(
      `## 1.1 (2026-06-18)\n* Added 2 characters: é, è\n\n## 1.0 (2025-01-01)\n* Initial release.\n`,
    );
  });

  it("inserts the new entry AFTER a preamble title in the base text", () => {
    const entry = confirmedEntry(["Added shift layer."]);
    const startHistoryText = "# Change History\n\n## 1.0 (2025-01-01)\n* Initial release.\n";
    const rendered = renderHistoryMd(entry, {
      version: "1.1",
      dateIso: "2026-06-18",
      lineage: null,
      startHistoryText,
    });
    expect(rendered).toBe(
      "# Change History\n\n## 1.1 (2026-06-18)\n* Added shift layer.\n\n## 1.0 (2025-01-01)\n* Initial release.\n",
    );
  });

  it("keeps a leading Change History title above the new ATX entry (preamble-aware insert)", () => {
    const entry = confirmedEntry(["Adapted from basic_kbdfr v1.3 via keyboard-studio."]);
    const startHistoryText =
      "# French Basic Change History\n\n1.0 (2020-01-01)\n---------------\n* Initial release.\n";
    const rendered = renderHistoryMd(entry, {
      version: "1.1",
      dateIso: "2026-06-18",
      lineage: null,
      startHistoryText,
    });
    expect(rendered).toBe(
      `# French Basic Change History\n\n## 1.1 (2026-06-18)\n* Adapted from basic_kbdfr v1.3 via keyboard-studio.\n\n1.0 (2020-01-01)\n---------------\n* Initial release.\n`,
    );
  });

  it("injects 'Adapted from' first even when the author's edited bullets omit it", () => {
    const entry = confirmedEntry([], {
      status: "edited",
      editedBullets: ["Reworked the layout for touch."],
    });
    const rendered = renderHistoryMd(entry, {
      version: "1.1",
      dateIso: "2026-06-18",
      lineage: { kind: "adapted", id: "basic_kbdfr", version: "1.3" },
      startHistoryText: null,
    });
    expect(rendered).toBe(
      `## 1.1 (2026-06-18)\n* Adapted from basic_kbdfr v1.3 via keyboard-studio.\n* Reworked the layout for touch.\n`,
    );
  });

  it("does not duplicate 'Adapted from' when the edited bullets already contain it verbatim", () => {
    const entry = confirmedEntry([], {
      status: "edited",
      editedBullets: [
        "Adapted from basic_kbdfr v1.3 via keyboard-studio.",
        "Reworked the layout for touch.",
      ],
    });
    const rendered = renderHistoryMd(entry, {
      version: "1.1",
      dateIso: "2026-06-18",
      lineage: { kind: "adapted", id: "basic_kbdfr", version: "1.3" },
      startHistoryText: null,
    });
    expect(rendered).toBe(
      `## 1.1 (2026-06-18)\n* Adapted from basic_kbdfr v1.3 via keyboard-studio.\n* Reworked the layout for touch.\n`,
    );
  });

  it("version-change edge case: heading re-derives from opts.version; date and editedBullets are kept", () => {
    // The proposal was built for "1.1"; the author has since bumped the
    // keyboard to "1.2" without revisiting the HISTORY screen.
    const entry = confirmedEntry(["Added 2 characters: é, è"], {
      status: "edited",
      editedBullets: ["Added the acute and grave accented vowels."],
    });
    const rendered = renderHistoryMd(entry, {
      version: "1.2",
      dateIso: "2099-01-01",
      lineage: null,
      startHistoryText: null,
    });
    expect(rendered).toBe(
      `## 1.2 (2026-06-18)\n* Added the acute and grave accented vowels.\n`,
    );
  });
});

describe("renderHistoryMd — exported bullet-text helpers", () => {
  it("HISTORY_INITIAL_RELEASE_BULLET matches the stub's bullet text", () => {
    expect(HISTORY_INITIAL_RELEASE_BULLET).toBe("Initial release.");
  });

  it("adaptedFromBullet matches the criterion 19.2 / stageAdaptHistory text", () => {
    expect(adaptedFromBullet("basic_kbdfr", "1.3")).toBe(
      "Adapted from basic_kbdfr v1.3 via keyboard-studio.",
    );
  });

  it("createdFromBullet matches the FR-011 text", () => {
    expect(createdFromBullet("basic_kbdfr", "2.3")).toBe(
      "Created from basic_kbdfr v2.3 via keyboard-studio.",
    );
  });
});

describe("renderHistoryMd — created lineage (Copy, spec 102 FR-011)", () => {
  const lineage = { kind: "created", id: "basic_kbdfr", version: "2.3" } as const;

  it("no decided entry: the created-from bullet, then 'Initial release.'", () => {
    const rendered = renderHistoryMd(null, {
      version: "1.0",
      dateIso: "2026-06-18",
      lineage,
      startHistoryText: null,
    });
    expect(rendered).toBe(
      "## 1.0 (2026-06-18)\n* Created from basic_kbdfr v2.3 via keyboard-studio.\n* Initial release.\n",
    );
  });

  it("'proposed' and 'dismissed' entries render the same created stub as null", () => {
    const opts = { version: "1.0", dateIso: "2026-06-18", lineage, startHistoryText: null };
    for (const status of ["proposed", "dismissed"] as const) {
      const entry: HistoryEntryState = {
        status,
        proposal: { version: "1.0", dateIso: "2026-06-18", bullets: ["Added 2 characters: a, b"] },
        editedBullets: null,
      };
      expect(renderHistoryMd(entry, opts)).toBe(renderHistoryMd(null, opts));
    }
  });

  it("decided entry: the created-from bullet is injected first", () => {
    const entry = confirmedEntry(["Added 2 characters: é, è"]);
    const rendered = renderHistoryMd(entry, {
      version: "1.0",
      dateIso: "2099-01-01",
      lineage,
      startHistoryText: null,
    });
    expect(rendered).toBe(
      "## 1.0 (2026-06-18)\n* Created from basic_kbdfr v2.3 via keyboard-studio.\n* Added 2 characters: é, è\n",
    );
  });

  it("does not duplicate the created-from bullet when the edited bullets already contain it verbatim", () => {
    const entry = confirmedEntry([], {
      status: "edited",
      editedBullets: ["Reworked the layout.", "Created from basic_kbdfr v2.3 via keyboard-studio."],
    });
    const rendered = renderHistoryMd(entry, {
      version: "1.0",
      dateIso: "2026-06-18",
      lineage,
      startHistoryText: null,
    });
    expect(rendered).toBe(
      "## 1.0 (2026-06-18)\n* Reworked the layout.\n* Created from basic_kbdfr v2.3 via keyboard-studio.\n",
    );
  });

  it("history bullets are inserted verbatim, not Markdown-escaped", () => {
    const entry = confirmedEntry(["Added *bold* and my_kbd <tags>"]);
    const rendered = renderHistoryMd(entry, {
      version: "1.0",
      dateIso: "2026-06-18",
      lineage: { kind: "created", id: "my_kbd", version: "1.0" },
      startHistoryText: null,
    });
    expect(rendered).toBe(
      "## 1.0 (2026-06-18)\n* Created from my_kbd v1.0 via keyboard-studio.\n* Added *bold* and my_kbd <tags>\n",
    );
  });
});
