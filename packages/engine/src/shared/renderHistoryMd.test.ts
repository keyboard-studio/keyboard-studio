// Tests for renderHistoryMd (spec 076 T040/T041).
//
// Coverage:
//   1. null entry, Track 1 (no adaptedFrom) -> byte-identical to the
//      scaffolder's Track-1 stub (generateStubs, scaffolder/index.ts).
//   2. null entry, Track 2 (adaptedFrom set) -> byte-identical to today's
//      stageAdaptHistory output (output/adapt-staging.ts), for both a fresh
//      and a pre-existing base HISTORY.md.
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
//   11. HISTORY_INITIAL_RELEASE_BULLET / adaptedFromBullet text.

import { describe, it, expect } from "vitest";
import { createVirtualFS, type HistoryEntryState } from "@keyboard-studio/contracts";
import {
  renderHistoryMd,
  HISTORY_INITIAL_RELEASE_BULLET,
  adaptedFromBullet,
} from "./renderHistoryMd.js";
import { stageAdaptHistory } from "../output/adapt-staging.js";

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
      adaptedFrom: null,
      baseHistoryText: null,
    });
    expect(rendered).toBe(`## 1.0 (2026-06-18)\n* Initial release.\n`);
  });

  it("null entry, Track 2 (fresh base HISTORY): byte-identical to stageAdaptHistory", () => {
    const vfs = createVirtualFS();
    stageAdaptHistory(vfs, "my_kbd", "basic_kbdus", "1.0", "1.1", "2026-06-18");
    const expected = vfs.get("HISTORY.md")!.content as string;

    const rendered = renderHistoryMd(null, {
      version: "1.1",
      dateIso: "2026-06-18",
      adaptedFrom: { id: "basic_kbdus", version: "1.0" },
      baseHistoryText: null,
    });
    expect(rendered).toBe(expected);
  });

  it("null entry, Track 2 (pre-existing base HISTORY): byte-identical to stageAdaptHistory", () => {
    const baseHistory = "## 1.0 (2025-01-01)\n* Initial release.\n";
    const vfs = createVirtualFS([{ path: "HISTORY.md", content: baseHistory, isBinary: false }]);
    stageAdaptHistory(vfs, "my_kbd", "basic_kbdus", "1.0", "1.1", "2026-06-18");
    const expected = vfs.get("HISTORY.md")!.content as string;

    const rendered = renderHistoryMd(null, {
      version: "1.1",
      dateIso: "2026-06-18",
      adaptedFrom: { id: "basic_kbdus", version: "1.0" },
      baseHistoryText: baseHistory,
    });
    expect(rendered).toBe(expected);
  });

  it("'proposed' status (shown, not yet decided) renders the same stub as null", () => {
    const entry: HistoryEntryState = {
      status: "proposed",
      proposal: { version: "1.0", dateIso: "2026-06-18", bullets: ["Initial release."] },
      editedBullets: null,
    };
    const opts = { version: "1.0", dateIso: "2026-06-18", adaptedFrom: null, baseHistoryText: null };
    expect(renderHistoryMd(entry, opts)).toBe(renderHistoryMd(null, opts));
  });

  it("'dismissed' status renders the same stub as null", () => {
    const entry: HistoryEntryState = {
      status: "dismissed",
      proposal: { version: "1.0", dateIso: "2026-06-18", bullets: ["Added 2 characters: a, b"] },
      editedBullets: null,
    };
    const opts = { version: "1.0", dateIso: "2026-06-18", adaptedFrom: null, baseHistoryText: null };
    expect(renderHistoryMd(entry, opts)).toBe(renderHistoryMd(null, opts));
  });
});

describe("renderHistoryMd — confirmed/edited entry", () => {
  it("confirmed entry renders the proposal bullets under a heading with opts.version + stored dateIso", () => {
    const entry = confirmedEntry(["Added 2 characters: é, è"]);
    const rendered = renderHistoryMd(entry, {
      version: "1.1",
      dateIso: "2099-01-01", // must be ignored in favor of entry.proposal.dateIso
      adaptedFrom: null,
      baseHistoryText: null,
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
      adaptedFrom: null,
      baseHistoryText: null,
    });
    expect(rendered).toBe(`## 1.1 (2026-06-18)\n* Added accented vowels for French.\n`);
  });

  it("preserves base text verbatim below the entry, separated by exactly one blank line", () => {
    const entry = confirmedEntry(["Added 2 characters: é, è"]);
    const baseHistoryText = "## 1.0 (2025-01-01)\n* Initial release.\n";
    const rendered = renderHistoryMd(entry, {
      version: "1.1",
      dateIso: "2026-06-18",
      adaptedFrom: null,
      baseHistoryText,
    });
    expect(rendered).toBe(
      `## 1.1 (2026-06-18)\n* Added 2 characters: é, è\n\n## 1.0 (2025-01-01)\n* Initial release.\n`,
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
      adaptedFrom: { id: "basic_kbdfr", version: "1.3" },
      baseHistoryText: null,
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
      adaptedFrom: { id: "basic_kbdfr", version: "1.3" },
      baseHistoryText: null,
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
      adaptedFrom: null,
      baseHistoryText: null,
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
});
