// KPJ pair (spec 084, 1.10b + 2.7) in FOREIGN mode: a catalog keyboard
// judged on the Compare tab gets real verdicts from its own .kpj —
// the pair is not authored-only. The foreign judge shares the authored
// assembly (assembleLintContext), so its <Options><Version> is read
// the same way; an absent .kpj degrades to Not yet checkable with the
// missing file named, never a fabricated verdict.

import { describe, expect, it } from "vitest";

import { createVirtualFS } from "@keyboard-studio/contracts";
import type { VirtualFS } from "@keyboard-studio/contracts";

import { judgeForeignKeyboard } from "./useCompareCriteria.ts";

const KEYBOARD_ID = "kpj_foreign_fixture";
const DISPLAY_NAME = "KPJ Foreign Fixture";

const KMN = [
  "store(&VERSION) '10.0'",
  "store(&NAME) 'KPJ Foreign Fixture'",
  "store(&KEYBOARDVERSION) '1.0'",
  "store(&COPYRIGHT) 'Copyright (C) 2024 Fixture Holder'",
  "store(&TARGETS) 'windows'",
  "",
  "begin Unicode > use(main)",
  "",
  "group(main) using keys",
  "",
  "+ [K_A] > 'a'",
  "",
].join("\n");

function kpj(version: string): string {
  return `<KeymanDeveloperProject><Options><Version>${version}</Version></Options></KeymanDeveloperProject>`;
}

function vfsWithKpj(kpjText?: string): VirtualFS {
  return createVirtualFS([
    { path: `source/${KEYBOARD_ID}.kmn`, content: KMN, isBinary: false },
    { path: "HISTORY.md", content: "# History\n\n## 1.0 (2026-01-01)\n", isBinary: false },
    { path: "README.md", content: "# Fixture\n", isBinary: false },
    ...(kpjText !== undefined
      ? [{ path: `${KEYBOARD_ID}.kpj`, content: kpjText, isBinary: false }]
      : []),
  ]);
}

async function pairStatuses(vfs: VirtualFS) {
  const result = await judgeForeignKeyboard(vfs, KEYBOARD_ID, DISPLAY_NAME);
  const byId = new Map(result.rows.map((r) => [r.criterion.id, r.status]));
  return {
    outdated: byId.get("1.10b-kpj-format-adapted"),
    bumped: byId.get("2.7-kpj-version-not-bumped"),
  };
}

describe("KPJ pair — foreign (Compare) verdicts", () => {
  it("an older .kpj format is Not met on 1.10b and Met on 2.7", async () => {
    const s = await pairStatuses(vfsWithKpj(kpj("1.0")));
    expect(s.outdated).toBe("not-met");
    expect(s.bumped).toBe("met");
  });

  it("a bumped .kpj format is Met on 1.10b and Not met on 2.7", async () => {
    const s = await pairStatuses(vfsWithKpj(kpj("3.0")));
    expect(s.outdated).toBe("met");
    expect(s.bumped).toBe("not-met");
  });

  it("the current format (2.0) is Met on both", async () => {
    const s = await pairStatuses(vfsWithKpj(kpj("2.0")));
    expect(s.outdated).toBe("met");
    expect(s.bumped).toBe("met");
  });

  it("no .kpj at all leaves both Not yet checkable", async () => {
    const s = await pairStatuses(vfsWithKpj(undefined));
    expect(s.outdated).toBe("not-yet-checkable");
    expect(s.bumped).toBe("not-yet-checkable");
  });
});
