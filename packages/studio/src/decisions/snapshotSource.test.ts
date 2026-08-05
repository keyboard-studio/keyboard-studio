// SC-005: the audit and the artifact never disagree (specs/053-decision-audit
// T047; FR-008, FR-009).
//
// The claim under test is stronger than "a diff was recorded". It is that each
// captured impact, RE-APPLIED to the previous boundary's `.kmn` text, reproduces
// exactly the text that shipped at this boundary. So the test carries its own
// unified-diff applier (`applyHunks` below) and uses it as the oracle: hunks that
// described the change loosely — wrong line numbers, stale context, a dropped
// removal — cannot survive re-application, because the applier verifies every
// context and removal line against the source before consuming it.
//
// The applier is deliberately NOT the differ run backwards, and deliberately not
// imported from anywhere: an oracle that shared code with the thing it checks
// would agree with it by construction.
//
// ONE NORMALISATION IS EXPECTED AND CORRECT. `diffLines` splits on `/\r?\n/`, so
// hunk text is line-ending-normalised (see its header — the emitted `.kmn` itself
// is untouched). Re-application therefore reproduces the shipped text up to line
// endings, and the assertions normalise both sides the same way rather than
// pretending the differ preserves `\r`.

import { describe, expect, it, vi } from "vitest";
import { DecisionImpactSchema, createVirtualFS } from "@keyboard-studio/contracts";
// spec 059 US4-3 / SC-007: the boundary account and the counterfactual account of
// the same descriptor must not contradict each other, so both are exercised here.
import { resolveIdentityCounterfactual } from "./counterfactualProjection.ts";
import type { DiffHunk, VirtualFSEntry } from "@keyboard-studio/contracts";
import {
  createSourceSnapshotter,
  type ProjectedSource,
} from "./snapshotSource.ts";

// ---------------------------------------------------------------------------
// The oracle
// ---------------------------------------------------------------------------

function normalizeEol(text: string): string {
  return text.split(/\r?\n/).join("\n");
}

/**
 * Apply unified hunks to `before`, verifying as it goes.
 *
 * Throws on any inconsistency — a context or removal line that does not match the
 * source, hunks out of order, or a hunk that reaches past the end of the file. A
 * throw is a failed SC-005, not a broken test helper.
 */
function applyHunks(before: string, hunks: readonly DiffHunk[]): string {
  const src = before.split(/\r?\n/);
  const out: string[] = [];
  let cursor = 0;

  for (const hunk of hunks) {
    // 1-based, except that a side contributing no lines reports the line it
    // follows — the convention groupIntoHunks() emits.
    const start = hunk.oldLines > 0 ? hunk.oldStart - 1 : hunk.oldStart;
    if (start < cursor)
      throw new Error(`hunk at ${String(start)} overlaps the previous one`);
    if (start > src.length)
      throw new Error(`hunk starts past end of file: ${String(start)}`);
    out.push(...src.slice(cursor, start));
    cursor = start;

    for (const line of hunk.lines) {
      const marker = line.slice(0, 1);
      const text = line.slice(1);
      if (marker === " ") {
        if (src[cursor] !== text) {
          throw new Error(
            `context mismatch at line ${String(cursor + 1)}: ${JSON.stringify(text)}`,
          );
        }
        out.push(text);
        cursor++;
      } else if (marker === "-") {
        if (src[cursor] !== text) {
          throw new Error(
            `removal mismatch at line ${String(cursor + 1)}: ${JSON.stringify(text)}`,
          );
        }
        cursor++;
      } else if (marker === "+") {
        out.push(text);
      } else {
        throw new Error(`unrecognised diff marker ${JSON.stringify(marker)}`);
      }
    }
  }

  out.push(...src.slice(cursor));
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Fixtures — a projected package evolving across step boundaries
// ---------------------------------------------------------------------------
//
// A boundary is what the projection held at that moment: a set of
// `VirtualFSEntry`s, text and binary alike. The snapshotter derives its own
// compared path set from that (FR-016), so the fixtures never name a path the
// module is expected to know about — several of them deliberately use paths no
// production code mentions.

const PATH = "source/hausa_std.kmn";
const KPS_PATH = "source/hausa_std.kps";
const HISTORY_PATH = "HISTORY.md";
const FONT_PATH = "fonts/hausa.ttf";

/** One boundary's projected entries. */
type Boundary = readonly VirtualFSEntry[];

function textEntry(path: string, content: string): VirtualFSEntry {
  return { path, content, isBinary: false };
}

function binaryEntry(path: string, bytes: readonly number[]): VirtualFSEntry {
  return { path, content: Uint8Array.from(bytes), isBinary: true };
}

/** Boundary 0: as instantiated from the base. */
const B0 = [
  "store(&VERSION) '10.0'",
  "store(&NAME) 'Hausa'",
  "store(&KEYBOARDVERSION) '1.0'",
  "",
  "begin Unicode > use(main)",
  "",
  "group(main) using keys",
  "",
  "+ [K_A] > 'a'",
  "+ [K_B] > 'b'",
  "+ [K_C] > 'c'",
].join("\n");

/** Boundary 1: the identity step renamed the keyboard. */
const B1 = B0.replace("store(&NAME) 'Hausa'", "store(&NAME) 'Hausa Standard'");

/** Boundary 2: a carve removed one rule. */
const B2 = B1.replace("+ [K_B] > 'b'\n", "");

/** Boundary 3: the mechanisms step added two rules at the end. */
const B3 = [B2, "+ [K_D] > 'ɗ'", "+ [RALT K_B] > 'ɓ'"].join("\n");

/**
 * Boundary 4: two changes far enough apart to stay separate hunks — a header
 * rewrite near the top and an append at the end. Their 3-line context windows do
 * not touch, so this boundary exercises multi-hunk ordering.
 */
const B4 =
  B3.replace("store(&KEYBOARDVERSION) '1.0'", "store(&KEYBOARDVERSION) '1.1'") +
  "\n+ [RALT K_S] > 'ʃ'";

const SESSION: readonly string[] = [B0, B1, B2, B3, B4];

/** The package metadata file — the file 053's single-`.kmn` comparison missed. */
const KPS_V1 = [
  '<?xml version="1.0" encoding="utf-8"?>',
  "<Package>",
  "  <Info>",
  "    <Name>Hausa</Name>",
  "    <Version>1.0</Version>",
  "  </Info>",
  "</Package>",
].join("\n");

/** The identity step renamed the package — a metadata-only decision. */
const KPS_RENAMED = KPS_V1.replace(
  "<Name>Hausa</Name>",
  "<Name>Hausa Standard</Name>",
);

/**
 * `HISTORY.md` exactly as `stageAdaptHistory` stages it: `## <version> (<date>)`
 * followed by the adapt bullet, with the base's own history preserved below.
 */
const HISTORY_AUG_02 = [
  "## 1.1 (2026-08-02)",
  "* Adapted from hausa v1.0 via keyboard-studio.",
  "",
  "## 1.0 (2025-01-09)",
  "* Initial release.",
].join("\n");

/** The identical projection, re-run one second after local midnight (FR-017a). */
const HISTORY_AUG_03 = HISTORY_AUG_02.replace("(2026-08-02)", "(2026-08-03)");

/** A genuine content edit — a changelog bullet the author actually added. */
const HISTORY_EDITED = HISTORY_AUG_02.replace(
  "* Adapted from hausa v1.0 via keyboard-studio.",
  "* Adapted from hausa v1.0 via keyboard-studio.\n* Added the right-alt layer.",
);

/** A genuine heading change on the same day — the version moved, not the date. */
const HISTORY_VERSION_BUMPED = HISTORY_AUG_02.replace("## 1.1 (", "## 1.2 (");

/** A snapshotter reading a scripted sequence of projected boundaries. */
function scriptedSnapshotter(boundaries: readonly Boundary[]) {
  let index = 0;
  const read = vi.fn(
    (): Promise<ProjectedSource | null> =>
      Promise.resolve(
        index < boundaries.length ? { entries: boundaries[index++]! } : null,
      ),
  );
  return {
    snapshotter: createSourceSnapshotter({ readProjectedFiles: read }),
    read,
  };
}

/** Boundaries carrying the rule source alone — the shape 053's tests assumed. */
function kmnOnly(texts: readonly string[]): readonly Boundary[] {
  return texts.map((source) => [textEntry(PATH, source)]);
}

/**
 * Capture across a `before` -> `after` boundary pair: the first read establishes
 * the baseline, the second is the one under test.
 */
async function captureAcross(before: Boundary, after: Boundary) {
  const { snapshotter } = scriptedSnapshotter([before, after]);
  await snapshotter.captureAtBoundary();
  return snapshotter.captureAtBoundary();
}

/** The captured impact of a boundary pair, or a thrown failure if it was not captured. */
async function capturedAcross(before: Boundary, after: Boundary) {
  const impact = await captureAcross(before, after);
  if (impact?.state !== "captured") {
    throw new Error(
      `expected a captured impact, got ${impact === null ? "null" : impact.state}`,
    );
  }
  return impact;
}

// ---------------------------------------------------------------------------
// SC-005
// ---------------------------------------------------------------------------

describe("SC-005 — every captured impact re-applies to produce the shipped text", () => {
  it("re-applies across a whole scripted session, boundary by boundary", async () => {
    const { snapshotter } = scriptedSnapshotter(kmnOnly(SESSION));

    // The first boundary establishes the baseline and describes no change.
    expect(await snapshotter.captureAtBoundary()).toBeNull();

    for (let i = 1; i < SESSION.length; i++) {
      const impact = await snapshotter.captureAtBoundary();
      if (impact === null)
        throw new Error(`boundary ${String(i)} captured nothing`);
      if (impact.state !== "captured") {
        throw new Error(
          `boundary ${String(i)} was ${impact.state}, expected captured`,
        );
      }
      // The path names what shipped. These boundaries project one file, so the
      // widened set (FR-016) still resolves to exactly that file.
      expect(impact.files).toHaveLength(1);
      expect(impact.files[0]!.path).toBe(PATH);
      // THE ASSERTION: previous boundary + this entry's hunks === this boundary.
      expect(applyHunks(SESSION[i - 1]!, impact.files[0]!.hunks)).toBe(
        normalizeEol(SESSION[i]!),
      );
    }
  });

  it("re-applies a single-line replacement exactly", async () => {
    const { snapshotter } = scriptedSnapshotter(kmnOnly([B0, B1]));
    await snapshotter.captureAtBoundary();
    const impact = await snapshotter.captureAtBoundary();
    if (impact?.state !== "captured")
      throw new Error("expected a captured impact");
    expect(applyHunks(B0, impact.files[0]!.hunks)).toBe(normalizeEol(B1));
    expect(impact.magnitude).toEqual({ added: 1, removed: 1 });
  });

  it("re-applies a deletion exactly", async () => {
    const { snapshotter } = scriptedSnapshotter(kmnOnly([B1, B2]));
    await snapshotter.captureAtBoundary();
    const impact = await snapshotter.captureAtBoundary();
    if (impact?.state !== "captured")
      throw new Error("expected a captured impact");
    expect(applyHunks(B1, impact.files[0]!.hunks)).toBe(normalizeEol(B2));
    expect(impact.magnitude).toEqual({ added: 0, removed: 1 });
  });

  it("re-applies an append at end of file exactly", async () => {
    const { snapshotter } = scriptedSnapshotter(kmnOnly([B2, B3]));
    await snapshotter.captureAtBoundary();
    const impact = await snapshotter.captureAtBoundary();
    if (impact?.state !== "captured")
      throw new Error("expected a captured impact");
    expect(applyHunks(B2, impact.files[0]!.hunks)).toBe(normalizeEol(B3));
    expect(impact.magnitude).toEqual({ added: 2, removed: 0 });
  });

  it("re-applies two separate changes in one boundary as separate hunks", async () => {
    const { snapshotter } = scriptedSnapshotter(kmnOnly([B3, B4]));
    await snapshotter.captureAtBoundary();
    const impact = await snapshotter.captureAtBoundary();
    if (impact?.state !== "captured")
      throw new Error("expected a captured impact");
    // A mid-file rewrite and an end-of-file append are far enough apart not to
    // coalesce, so the applier's multi-hunk ordering is genuinely exercised.
    expect(impact.files[0]!.hunks.length).toBeGreaterThan(1);
    expect(applyHunks(B3, impact.files[0]!.hunks)).toBe(normalizeEol(B4));
  });

  it("rejects hunks re-applied to the WRONG baseline", async () => {
    // The oracle has to be able to fail, or the assertions above prove nothing.
    const { snapshotter } = scriptedSnapshotter(kmnOnly([B1, B2]));
    await snapshotter.captureAtBoundary();
    const impact = await snapshotter.captureAtBoundary();
    if (impact?.state !== "captured")
      throw new Error("expected a captured impact");
    expect(() => applyHunks(B3, impact.files[0]!.hunks)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Boundary bookkeeping — the other half of "the audit cannot mis-attribute"
// ---------------------------------------------------------------------------

describe("boundary bookkeeping", () => {
  it("reports `none` — not an empty capture — when a boundary changed nothing", async () => {
    const { snapshotter } = scriptedSnapshotter(kmnOnly([B1, B1]));
    await snapshotter.captureAtBoundary();
    expect(await snapshotter.captureAtBoundary()).toEqual({ state: "none" });
  });

  it("captures nothing while there is no working copy to project", async () => {
    const snapshotter = createSourceSnapshotter({
      readProjectedFiles: () => Promise.resolve(null),
    });
    expect(await snapshotter.captureAtBoundary()).toBeNull();
    expect(await snapshotter.captureAtBoundary()).toBeNull();
  });

  it("keeps the baseline when a read fails, so the next diff is not doubled", async () => {
    // A failed projection must not silently roll the baseline forward: the next
    // boundary would then attribute two steps' worth of change to one decision.
    let call = 0;
    const snapshotter = createSourceSnapshotter({
      readProjectedFiles: (): Promise<ProjectedSource | null> => {
        call += 1;
        if (call === 1)
          return Promise.resolve({ entries: [textEntry(PATH, B0)] });
        if (call === 2) return Promise.reject(new Error("projection failed"));
        return Promise.resolve({ entries: [textEntry(PATH, B1)] });
      },
    });

    expect(await snapshotter.captureAtBoundary()).toBeNull(); // baseline = B0
    expect(await snapshotter.captureAtBoundary()).toBeNull(); // failed read
    const impact = await snapshotter.captureAtBoundary();
    if (impact?.state !== "captured")
      throw new Error("expected a captured impact");
    // Still measured from B0 — nothing was lost and nothing was double-counted.
    expect(applyHunks(B0, impact.files[0]!.hunks)).toBe(normalizeEol(B1));
  });

  it("re-establishes a baseline after reset() instead of diffing across it", async () => {
    const { snapshotter } = scriptedSnapshotter(kmnOnly([B0, B1, B2]));
    await snapshotter.captureAtBoundary();
    snapshotter.reset();
    // First capture after a reset is a baseline again — a re-instantiation is not
    // a decision that changed the previous keyboard into this one.
    expect(await snapshotter.captureAtBoundary()).toBeNull();
    const impact = await snapshotter.captureAtBoundary();
    if (impact?.state !== "captured")
      throw new Error("expected a captured impact");
    expect(applyHunks(B1, impact.files[0]!.hunks)).toBe(normalizeEol(B2));
  });

  it("reads the projection exactly once per boundary", async () => {
    // The projection is shared with the live preview; capture must not run it a
    // second time per step (FR-008's "adds no projection pass").
    const { snapshotter, read } = scriptedSnapshotter(kmnOnly(SESSION));
    await snapshotter.captureAtBoundary();
    await snapshotter.captureAtBoundary();
    await snapshotter.captureAtBoundary();
    expect(read).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// FR-016 / FR-017 — the compared set is whatever the projection emitted
// ---------------------------------------------------------------------------
//
// The defect these were written against: a decision that touched only the
// `.kps` reported "no isolable change", because the comparison only ever looked
// at the `.kmn`. The fix is not "also look at the `.kps`" — a named list is how
// the metadata file was missed in the first place — but "look at every text
// entry the projection holds", enumerated at read time.

describe("FR-016/FR-017 — every text file the projection produced is compared", () => {
  it("names the `.kps` when a decision changed only package metadata", async () => {
    const impact = await capturedAcross(
      [textEntry(PATH, B1), textEntry(KPS_PATH, KPS_V1)],
      [textEntry(PATH, B1), textEntry(KPS_PATH, KPS_RENAMED)],
    );
    // The rule source is untouched, so it must NOT appear; the metadata file must.
    expect(impact.files.map((file) => file.path)).toEqual([KPS_PATH]);
    expect(applyHunks(KPS_V1, impact.files[0]!.hunks)).toBe(
      normalizeEol(KPS_RENAMED),
    );
    expect(impact.magnitude).toEqual({ added: 1, removed: 1 });
  });

  it("compares a file the projection newly emits, with no list to add it to", async () => {
    // A path no production module mentions: if the compared set came from a
    // maintained list, this file could not be on it, and the change would be lost.
    const novelPath = "meta/hausa_std.provenance.json";
    const novelText = ["{", '  "derivedFrom": "hausa"', "}"].join("\n");

    const impact = await capturedAcross(
      [textEntry(PATH, B1)],
      [textEntry(PATH, B1), textEntry(novelPath, novelText)],
    );

    expect(impact.files.map((file) => file.path)).toEqual([novelPath]);
    const added = impact.files[0]!.hunks.flatMap((hunk) =>
      hunk.lines
        .filter((line) => line.startsWith("+"))
        .map((line) => line.slice(1)),
    );
    expect(added).toEqual(["{", '  "derivedFrom": "hausa"', "}"]);
  });

  it("compares a file the projection stops emitting, rather than skipping it", async () => {
    const impact = await capturedAcross(
      [textEntry(PATH, B1), textEntry(KPS_PATH, KPS_V1)],
      [textEntry(PATH, B1)],
    );
    expect(impact.files.map((file) => file.path)).toEqual([KPS_PATH]);
    const removed = impact.files[0]!.hunks.flatMap((hunk) =>
      hunk.lines
        .filter((line) => line.startsWith("-"))
        .map((line) => line.slice(1)),
    );
    expect(removed).toContain("<Package>");
    expect(removed).toContain("    <Name>Hausa</Name>");
  });

  it("sorts the changed files by path, whatever order the projection listed them", async () => {
    // `VirtualFS.entries()` documents its order as unspecified, so the rendered
    // order must not inherit it. These entries arrive in reverse sorted order.
    const impact = await capturedAcross(
      [textEntry(KPS_PATH, KPS_V1), textEntry(PATH, B1)],
      [textEntry(KPS_PATH, KPS_RENAMED), textEntry(PATH, B3)],
    );
    expect(impact.files.map((file) => file.path)).toEqual([PATH, KPS_PATH]);
  });
});

// ---------------------------------------------------------------------------
// Binaries are never diffed
// ---------------------------------------------------------------------------

describe("binary entries", () => {
  it("never reports a binary file, even when its bytes changed", async () => {
    const impact = await capturedAcross(
      [textEntry(PATH, B1), binaryEntry(FONT_PATH, [0x00, 0x01, 0x00, 0x00])],
      [textEntry(PATH, B2), binaryEntry(FONT_PATH, [0x4f, 0x54, 0x54, 0x4f])],
    );
    // The font's bytes changed across the boundary and are still absent.
    expect(impact.files.map((file) => file.path)).toEqual([PATH]);
  });

  it("reports `none` when the only thing that changed was a binary", async () => {
    // Skipping means skipping: a changed font is not a decision's attributed
    // change, so this boundary changed nothing at all.
    const impact = await captureAcross(
      [textEntry(PATH, B1), binaryEntry(FONT_PATH, [0x00, 0x01, 0x00, 0x00])],
      [textEntry(PATH, B1), binaryEntry(FONT_PATH, [0x4f, 0x54, 0x54, 0x4f])],
    );
    expect(impact).toEqual({ state: "none" });
  });

  it("still compares the text files sharing a boundary with a binary", async () => {
    // Guards the opposite failure: skipping binaries must not skip the boundary.
    const impact = await capturedAcross(
      [binaryEntry(FONT_PATH, [0x00]), textEntry(KPS_PATH, KPS_V1)],
      [binaryEntry(FONT_PATH, [0x00]), textEntry(KPS_PATH, KPS_RENAMED)],
    );
    expect(impact.files.map((file) => file.path)).toEqual([KPS_PATH]);
  });
});

// ---------------------------------------------------------------------------
// Zero changed files is `{ state: "none" }`, never an empty capture
// ---------------------------------------------------------------------------

describe("zero changed files", () => {
  it("reports `none` across a multi-file boundary where nothing moved", async () => {
    const unchanged: Boundary = [
      textEntry(PATH, B1),
      textEntry(KPS_PATH, KPS_V1),
      textEntry(HISTORY_PATH, HISTORY_AUG_02),
    ];
    const impact = await captureAcross(unchanged, [...unchanged]);
    expect(impact).toEqual({ state: "none" });
    // Stated the other way round, because this is the boundary that matters:
    // `"captured"` with an empty `files` is not a valid record.
    expect(impact).not.toHaveProperty("files");
  });

  it("emits a record the contract schema accepts — `files` is `.min(1)`", async () => {
    // `DecisionImpactSchema` rejects `{ state: "captured", files: [] }`, so a
    // regression that returned an empty capture here fails this parse.
    const nothingChanged = await captureAcross(
      kmnOnly([B1])[0]!,
      kmnOnly([B1])[0]!,
    );
    expect(DecisionImpactSchema.safeParse(nothingChanged).success).toBe(true);

    const somethingChanged = await captureAcross(
      kmnOnly([B1])[0]!,
      kmnOnly([B2])[0]!,
    );
    expect(DecisionImpactSchema.safeParse(somethingChanged).success).toBe(true);
    expect(
      DecisionImpactSchema.safeParse({
        state: "captured",
        files: [],
        magnitude: { added: 0, removed: 0 },
      }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The aggregate magnitude is the sum over `files`
// ---------------------------------------------------------------------------

describe("aggregate magnitude", () => {
  it("equals the sum over the changed files", async () => {
    const impact = await capturedAcross(
      [
        textEntry(PATH, B1),
        textEntry(KPS_PATH, KPS_V1),
        textEntry(HISTORY_PATH, HISTORY_AUG_02),
      ],
      [
        textEntry(PATH, B3),
        textEntry(KPS_PATH, KPS_RENAMED),
        textEntry(HISTORY_PATH, HISTORY_AUG_02),
      ],
    );

    // Two changed files, so the sum is a real sum and not a pass-through.
    expect(impact.files).toHaveLength(2);
    for (const file of impact.files) {
      expect(file.magnitude.added + file.magnitude.removed).toBeGreaterThan(0);
    }

    const summed = impact.files.reduce(
      (total, file) => ({
        added: total.added + file.magnitude.added,
        removed: total.removed + file.magnitude.removed,
      }),
      { added: 0, removed: 0 },
    );
    expect(impact.magnitude).toEqual(summed);
    // Spelled out, so a change that broke both sides identically still fails:
    // `.kmn` loses one rule and gains two, `.kps` swaps its name line.
    expect(impact.magnitude).toEqual({ added: 3, removed: 2 });
  });
});

// ---------------------------------------------------------------------------
// FR-017a — volatile content is held stable, genuine content is not
// ---------------------------------------------------------------------------
//
// The rejected alternative was excluding `HISTORY.md` from the comparison
// altogether. It would pass the midnight case below and silently lose every
// real history edit — which is why the second half of this block exists.

describe("FR-017a — the HISTORY.md date stamp", () => {
  it("produces no hunk when only the staged date rolled past midnight", async () => {
    const impact = await captureAcross(
      [textEntry(PATH, B1), textEntry(HISTORY_PATH, HISTORY_AUG_02)],
      [textEntry(PATH, B1), textEntry(HISTORY_PATH, HISTORY_AUG_03)],
    );
    // Same version, same bullets, next day's stamp: nothing a decision caused.
    expect(impact).toEqual({ state: "none" });
  });

  it("keeps HISTORY.md out of a boundary that changed something else", async () => {
    const impact = await capturedAcross(
      [textEntry(PATH, B1), textEntry(HISTORY_PATH, HISTORY_AUG_02)],
      [textEntry(PATH, B2), textEntry(HISTORY_PATH, HISTORY_AUG_03)],
    );
    expect(impact.files.map((file) => file.path)).toEqual([PATH]);
  });

  it("still surfaces a genuine HISTORY.md content edit", async () => {
    const impact = await capturedAcross(
      [textEntry(HISTORY_PATH, HISTORY_AUG_02)],
      [textEntry(HISTORY_PATH, HISTORY_EDITED)],
    );
    expect(impact.files.map((file) => file.path)).toEqual([HISTORY_PATH]);
    const added = impact.files[0]!.hunks.flatMap((hunk) =>
      hunk.lines
        .filter((line) => line.startsWith("+"))
        .map((line) => line.slice(1)),
    );
    expect(added).toEqual(["* Added the right-alt layer."]);
  });

  it("still surfaces a genuine HISTORY.md edit made on the same day as a date roll", async () => {
    // The hard case for a date-only normalizer: the stamp moved AND a bullet was
    // added. Only the bullet may be attributed.
    const impact = await capturedAcross(
      [textEntry(HISTORY_PATH, HISTORY_AUG_02)],
      [
        textEntry(
          HISTORY_PATH,
          HISTORY_EDITED.replace("(2026-08-02)", "(2026-08-03)"),
        ),
      ],
    );
    expect(impact.files.map((file) => file.path)).toEqual([HISTORY_PATH]);
    expect(impact.magnitude).toEqual({ added: 1, removed: 0 });
  });

  it("still surfaces a version bump inside the stamped heading", async () => {
    // Only the date token is neutralised, not the whole heading line — the
    // version moved and that is a genuine change.
    const impact = await capturedAcross(
      [textEntry(HISTORY_PATH, HISTORY_AUG_02)],
      [textEntry(HISTORY_PATH, HISTORY_VERSION_BUMPED)],
    );
    expect(impact.files.map((file) => file.path)).toEqual([HISTORY_PATH]);
    const added = impact.files[0]!.hunks.flatMap((hunk) =>
      hunk.lines
        .filter((line) => line.startsWith("+"))
        .map((line) => line.slice(1)),
    );
    // The hunk carries the NORMALIZED line, so the neutralised date reaches the
    // record as its placeholder. That is what "held stable across the
    // comparison" costs: the version bump is legible, the stamp is not the
    // shipped one, and a `HISTORY.md` hunk is therefore the one hunk that does
    // not re-apply to the shipped text (SC-005's oracle above is deliberately
    // never pointed at this file). Asserted rather than glossed, so a later
    // decision to re-hydrate the real stamp has to come here and say so.
    expect(added).toEqual(["## 1.2 (0000-00-00)"]);
  });

  it("normalizes the stamp only in HISTORY.md, not in a file that looks like it", async () => {
    // The normalizer keys on the path. A heading of the same shape elsewhere is
    // ordinary content, and a date change in it is a real change.
    const readmePath = "README.md";
    const impact = await capturedAcross(
      [textEntry(readmePath, HISTORY_AUG_02)],
      [textEntry(readmePath, HISTORY_AUG_03)],
    );
    expect(impact.files.map((file) => file.path)).toEqual([readmePath]);
    expect(impact.magnitude).toEqual({ added: 1, removed: 1 });
  });
});

// ---------------------------------------------------------------------------
// US4 (spec 059 T037) — revising the language keeps both answers on the record
// ---------------------------------------------------------------------------
//
// Two mechanisms now describe the same descriptor: the boundary capture (this
// module) and the counterfactual (counterfactualProjection.ts). US4-3 / SC-007
// require them not to contradict each other. They cannot be made byte-identical —
// they answer different questions ("what changed at this boundary?" vs. "what would
// be different if this answer were absent?") — but they must agree on WHICH FILE
// changed and on the direction of the change, which is what an author reads.

describe("US4 — a post-instantiation language revision (spec 059)", () => {
  /**
   * The descriptor as spec 059's writer emits it — with a `<Languages>` block, which
   * `KPS_V1` above predates (053's fixture only needed `<Info><Name>`).
   */
  function descriptorDeclaring(tag: string): string {
    return [
      '<?xml version="1.0" encoding="utf-8"?>',
      "<Package>",
      "  <Info>",
      "    <Name>Hausa</Name>",
      "    <Version>1.0</Version>",
      "  </Info>",
      "  <Keyboards>",
      "    <Keyboard>",
      "      <Languages>",
      `        <Language ID="${tag}">Hausa</Language>`,
      "      </Languages>",
      "    </Keyboard>",
      "  </Keyboards>",
      "</Package>",
    ].join("\n");
  }

  /** The descriptor before and after the author revises their language code. */
  const KPS_LANG_HA = descriptorDeclaring("ha");
  const KPS_LANG_HA_LATN = descriptorDeclaring("ha-Latn");
  /** What the base's descriptor declared before the author answered at all. */
  const KPS_LANG_BASE = descriptorDeclaring("fr");

  it("has a language line to revise in the first place", () => {
    // Guards the three constants above: fixtures that did not actually differ in
    // their declared language would make every assertion below vacuously true.
    expect(KPS_LANG_HA).toContain('<Language ID="ha">Hausa</Language>');
    expect(KPS_LANG_HA_LATN).toContain('<Language ID="ha-Latn">Hausa</Language>');
    expect(KPS_LANG_HA_LATN).not.toBe(KPS_LANG_HA);
    expect(KPS_LANG_BASE).not.toBe(KPS_LANG_HA);
  });

  // US4-1: an ordinary boundary capture. The revision needs no special mechanism —
  // by the time it happens a working copy exists, which is the only thing the
  // identity stage originally lacked.
  it("is captured at the stage boundary like any other post-instantiation change", async () => {
    const impact = await capturedAcross(
      [textEntry(PATH, B1), textEntry(KPS_PATH, KPS_LANG_HA)],
      [textEntry(PATH, B1), textEntry(KPS_PATH, KPS_LANG_HA_LATN)],
    );
    expect(impact.files.map((file) => file.path)).toEqual([KPS_PATH]);
    expect(impact.magnitude).toEqual({ added: 1, removed: 1 });
  });

  it("attributes the change to the descriptor and to nothing else", async () => {
    const impact = await capturedAcross(
      [
        textEntry(PATH, B1),
        textEntry(KPS_PATH, KPS_LANG_HA),
        textEntry(HISTORY_PATH, HISTORY_AUG_02),
      ],
      [
        textEntry(PATH, B1),
        textEntry(KPS_PATH, KPS_LANG_HA_LATN),
        textEntry(HISTORY_PATH, HISTORY_AUG_02),
      ],
    );
    // The `.kmn` is untouched: the codec does not serialize the descriptor's
    // language, which is why the pre-057 `.kmn`-only comparison found nothing.
    expect(impact.files.map((file) => file.path)).toEqual([KPS_PATH]);
  });

  it("re-applies to produce the revised descriptor exactly (SC-005)", async () => {
    const impact = await capturedAcross(
      [textEntry(PATH, B1), textEntry(KPS_PATH, KPS_LANG_HA)],
      [textEntry(PATH, B1), textEntry(KPS_PATH, KPS_LANG_HA_LATN)],
    );
    const file = impact.files.find((f) => f.path === KPS_PATH)!;
    expect(normalizeEol(applyHunks(KPS_LANG_HA, file.hunks))).toBe(
      normalizeEol(KPS_LANG_HA_LATN),
    );
  });

  // US4-3 / SC-007: the two accounts of the same descriptor agree. The boundary
  // capture compares "before the revision" with "after"; the counterfactual compares
  // "with the answer" against "without it". Different questions, same file, same
  // direction — an author reading both must not find them contradicting.
  it("agrees with the counterfactual account of the same descriptor", async () => {
    const boundary = await capturedAcross(
      [textEntry(PATH, B1), textEntry(KPS_PATH, KPS_LANG_HA)],
      [textEntry(PATH, B1), textEntry(KPS_PATH, KPS_LANG_HA_LATN)],
    );

    const counterfactual = await resolveIdentityCounterfactual("bcp47", "ha-Latn", "ha", {
      project: vi.fn(async (opts) => ({
        vfs: createVirtualFS([
          { path: PATH, content: B1, isBinary: false },
          {
            path: KPS_PATH,
            content:
              opts?.identityOverride?.bcp47 === "ha-Latn" ? KPS_LANG_HA_LATN : KPS_LANG_HA,
            isBinary: false,
          },
        ]),
        keyboardId: "hausa_std",
        displayName: "Hausa",
        version: "1.0",
        warnings: [],
      })),
    });

    expect(counterfactual?.state).toBe("captured");
    if (counterfactual?.state !== "captured") return;

    // Same file named by both.
    expect(counterfactual.files.map((f) => f.path)).toEqual(boundary.files.map((f) => f.path));
    // Same direction: `ha-Latn` is the added side in both accounts, `ha` the removed
    // side. A reversed counterfactual would tell the author their revision undid
    // itself.
    for (const account of [boundary, counterfactual]) {
      const lines = account.files
        .find((f) => f.path === KPS_PATH)!
        .hunks.flatMap((h) => h.lines);
      expect(lines.some((l) => l.startsWith("+") && l.includes('ID="ha-Latn"'))).toBe(true);
      expect(lines.some((l) => l.startsWith("-") && l.includes('ID="ha"'))).toBe(true);
    }
    // Same magnitude: one line replaced, on both accounts.
    expect(counterfactual.magnitude).toEqual(boundary.magnitude);
  });

  // US4-2: the superseded original stays on the record. That is the decision log's
  // own supersede semantics (053 FR-015) — this test pins that a revision does not
  // make the FIRST answer's captured change disappear, because each boundary keeps
  // its own capture.
  it("leaves the original answer's capture intact rather than rewriting it", async () => {
    const { snapshotter } = scriptedSnapshotter([
      // Instantiation baseline: the base's language.
      [textEntry(PATH, B1), textEntry(KPS_PATH, KPS_LANG_BASE)],
      // The author's first answer.
      [textEntry(PATH, B1), textEntry(KPS_PATH, KPS_LANG_HA)],
      // Their revision.
      [textEntry(PATH, B1), textEntry(KPS_PATH, KPS_LANG_HA_LATN)],
    ]);

    expect(await snapshotter.captureAtBoundary()).toBeNull(); // baseline only
    const first = await snapshotter.captureAtBoundary();
    const revision = await snapshotter.captureAtBoundary();

    // Two captures, each describing its own step, neither overwriting the other.
    expect(first?.state).toBe("captured");
    expect(revision?.state).toBe("captured");
    if (first?.state !== "captured" || revision?.state !== "captured") return;
    const firstLines = first.files[0]!.hunks.flatMap((h) => h.lines);
    const revisionLines = revision.files[0]!.hunks.flatMap((h) => h.lines);
    expect(firstLines.some((l) => l.startsWith("+") && l.includes('ID="ha"'))).toBe(true);
    expect(revisionLines.some((l) => l.startsWith("+") && l.includes('ID="ha-Latn"'))).toBe(true);
    // The revision's capture describes only the revision — it does not re-narrate
    // the first answer as though it had just happened.
    expect(revisionLines.some((l) => l.includes('ID="fr"'))).toBe(false);
  });
});
