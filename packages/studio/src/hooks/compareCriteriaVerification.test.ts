// T5.3 verification — spec 084 Phase 5: the Compare "ready" VFS is a
// preview snapshot the compile pipeline may have mutated in place, so
// this test compares the foreign criteria verdicts on a PRISTINE fetched
// VFS against the verdicts on the same VFS after the REAL preview
// mutation, and pins the outcome.
//
// The mutation is useKeyboardArtifact's preview strip: it calls the
// engine's stripDanglingAssetStores(kmnText, vfs) and, when stores were
// stripped, writes the cleaned text back into the SAME VFS with
// vfs.set(kmnPath, cleaned) before compiling (useKeyboardArtifact.ts).
// stripDanglingAssetStores is exported from @keyboard-studio/engine, so
// this test applies the real function and replicates only the hook's
// one-line write-back exactly (same path, same cleaned text).
//
// Fixture design: the .kmn names a VISUALKEYBOARD and a BITMAP whose
// files were NOT fetched (both stripped as dangling), a KMW_HELPFILE
// whose file IS present (stripped unconditionally for preview), and a
// LAYOUTFILE whose touch-layout file IS present (kept — the strip is
// presence-aware, and this pins that too). The package also carries a
// HISTORY.md with an out-of-order entry (a doc finding) and a README —
// so both the doc band and the engine band produce verdicts whose
// stability is checked.
//
// RESULT (pinned below): the per-criterion statuses are EQUAL before
// and after the mutation. That is the expected outcome, and the fixture
// is built to make it a meaningful one: the stripped stores name
// packaging assets (icon, visual keyboard, touch layout, help panel),
// and no criteria-mapped check reads those store lines — the doc checks
// read the .kvks / touch-layout FILES (absent in both runs, so their
// layer ids are the same), the §18 checks read the touch-layout file
// directly by path, and &TARGETS / &COPYRIGHT / &KEYBOARDVERSION are
// never asset stores, so they survive the strip in both runs.

import { describe, expect, it } from "vitest";

import { createVirtualFS } from "@keyboard-studio/contracts";
import type { VirtualFS } from "@keyboard-studio/contracts";
import { stripDanglingAssetStores } from "@keyboard-studio/engine";

import { findKmnPath } from "../lib/findKmnPath.ts";
import { readVfsText } from "../lib/vfsText.ts";
import { judgeForeignKeyboard } from "./useCompareCriteria.ts";

const KEYBOARD_ID = "t53_fixture";
const DISPLAY_NAME = "T53 Fixture";

const KMN = [
  "store(&VERSION) '10.0'",
  "store(&NAME) 'T53 Fixture'",
  "store(&KEYBOARDVERSION) '1.0'",
  "store(&COPYRIGHT) 'Copyright (C) 2024 T53 Holder'",
  "store(&TARGETS) 'windows'",
  `store(&VISUALKEYBOARD) '${KEYBOARD_ID}.kvks'`,
  `store(&BITMAP) '${KEYBOARD_ID}.ico'`,
  `store(&LAYOUTFILE) '${KEYBOARD_ID}.keyman-touch-layout'`,
  "store(&KMW_HELPFILE) 't53_help.htm'",
  "",
  "begin Unicode > use(main)",
  "",
  "group(main) using keys",
  "",
  "+ [K_A] > 'a'",
  "+ [K_B] > 'b'",
  "",
].join("\n");

// Newest version (2.0) below the top entry (1.0): a doc finding in both runs.
const HISTORY_MD = [
  "# T53 Fixture Change History",
  "",
  "## 1.0 (2026-01-01)",
  "",
  "* Initial release.",
  "",
  "## 2.0 (2026-02-01)",
  "",
  "* A newer entry that is not at the top.",
  "",
].join("\n");

const TOUCH_LAYOUT = JSON.stringify({
  phone: {
    layer: [
      {
        id: "default",
        row: [
          { id: 1, key: [{ id: "K_A", text: "a" }] },
          { id: 2, key: [{ id: "K_B", text: "b" }] },
        ],
      },
    ],
  },
});

function pristineVfs(): VirtualFS {
  return createVirtualFS([
    { path: `source/${KEYBOARD_ID}.kmn`, content: KMN, isBinary: false },
    { path: "HISTORY.md", content: HISTORY_MD, isBinary: false },
    { path: "README.md", content: "# T53 Fixture\n", isBinary: false },
    // The KMW_HELPFILE target IS fetched — the strip removes it anyway.
    { path: "source/t53_help.htm", content: "<html></html>\n", isBinary: false },
    // A touch layout file is present in the package, so the §18 checks
    // have something to judge in both runs.
    {
      path: `source/${KEYBOARD_ID}.keyman-touch-layout`,
      content: TOUCH_LAYOUT,
      isBinary: false,
    },
  ]);
}

/**
 * A copy of `vfs` with the preview mutation applied exactly as
 * useKeyboardArtifact applies it: stripDanglingAssetStores over the
 * .kmn text, and vfs.set(kmnPath, cleaned) when anything was stripped.
 * (The touch file above makes LAYOUTFILE *not* dangling for this
 * fixture — it names the file that exists — so the dangling strips here
 * are VISUALKEYBOARD and BITMAP, plus the unconditional KMW_HELPFILE.)
 */
function previewMutatedCopy(vfs: VirtualFS): { vfs: VirtualFS; stripped: string[] } {
  const copy = createVirtualFS(
    vfs.entries().map((e) => ({ path: e.path, content: e.content, isBinary: e.isBinary })),
  );
  const kmnPath = findKmnPath(copy);
  if (kmnPath === undefined) throw new Error("fixture has no .kmn");
  const kmnText = readVfsText(copy, kmnPath) ?? "";
  const { kmn: cleaned, stripped } = stripDanglingAssetStores(kmnText, copy);
  if (stripped.length > 0) copy.set(kmnPath, cleaned);
  return { vfs: copy, stripped };
}

describe("T5.3 preview-mutation verification", () => {
  it("the fixture's preview mutation really strips asset stores (the comparison is not vacuous)", () => {
    const { stripped } = previewMutatedCopy(pristineVfs());
    expect(stripped.sort()).toEqual(["BITMAP", "KMW_HELPFILE", "VISUALKEYBOARD"]);
  });

  it("foreign criteria statuses are EQUAL on the pristine VFS and after the preview mutation", async () => {
    const pristine = pristineVfs();
    const before = await judgeForeignKeyboard(pristine, KEYBOARD_ID, DISPLAY_NAME);

    const { vfs: mutated } = previewMutatedCopy(pristine);
    const after = await judgeForeignKeyboard(mutated, KEYBOARD_ID, DISPLAY_NAME);

    // The pristine fixture is genuinely judged: both a doc-band and an
    // engine-band problem are present, so equality is not two empty runs
    // agreeing about nothing.
    expect(before.counts["not-met"]).toBeGreaterThan(0);
    const historyRow = before.rows.find((row) => row.criterion.id.startsWith("3."));
    expect(historyRow).toBeDefined();

    const beforeStatuses = before.rows.map((row) => [row.criterion.id, row.status]);
    const afterStatuses = after.rows.map((row) => [row.criterion.id, row.status]);
    expect(afterStatuses).toEqual(beforeStatuses);
    expect(after.counts).toEqual(before.counts);
  });
});
