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
import type { DiffHunk } from "@keyboard-studio/contracts";
import { createSourceSnapshotter, type ProjectedSource } from "./snapshotSource.ts";

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
    if (start < cursor) throw new Error(`hunk at ${String(start)} overlaps the previous one`);
    if (start > src.length) throw new Error(`hunk starts past end of file: ${String(start)}`);
    out.push(...src.slice(cursor, start));
    cursor = start;

    for (const line of hunk.lines) {
      const marker = line.slice(0, 1);
      const text = line.slice(1);
      if (marker === " ") {
        if (src[cursor] !== text) {
          throw new Error(`context mismatch at line ${String(cursor + 1)}: ${JSON.stringify(text)}`);
        }
        out.push(text);
        cursor++;
      } else if (marker === "-") {
        if (src[cursor] !== text) {
          throw new Error(`removal mismatch at line ${String(cursor + 1)}: ${JSON.stringify(text)}`);
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
// Fixtures — a `.kmn` evolving across step boundaries
// ---------------------------------------------------------------------------

const PATH = "source/hausa_std.kmn";

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

/** A snapshotter reading a scripted sequence of boundaries. */
function scriptedSnapshotter(texts: readonly string[]) {
  let index = 0;
  const read = vi.fn(
    (): Promise<ProjectedSource | null> =>
      Promise.resolve(index < texts.length ? { path: PATH, text: texts[index++]! } : null),
  );
  return { snapshotter: createSourceSnapshotter({ readProjectedKmn: read }), read };
}

// ---------------------------------------------------------------------------
// SC-005
// ---------------------------------------------------------------------------

describe("SC-005 — every captured impact re-applies to produce the shipped text", () => {
  it("re-applies across a whole scripted session, boundary by boundary", async () => {
    const { snapshotter } = scriptedSnapshotter(SESSION);

    // The first boundary establishes the baseline and describes no change.
    expect(await snapshotter.captureAtBoundary()).toBeNull();

    for (let i = 1; i < SESSION.length; i++) {
      const impact = await snapshotter.captureAtBoundary();
      if (impact === null) throw new Error(`boundary ${String(i)} captured nothing`);
      if (impact.state !== "captured") {
        throw new Error(`boundary ${String(i)} was ${impact.state}, expected captured`);
      }
      // The path names what shipped. One file today (T027 widens the set).
      expect(impact.files).toHaveLength(1);
      expect(impact.files[0]!.path).toBe(PATH);
      // THE ASSERTION: previous boundary + this entry's hunks === this boundary.
      expect(applyHunks(SESSION[i - 1]!, impact.files[0]!.hunks)).toBe(normalizeEol(SESSION[i]!));
    }
  });

  it("re-applies a single-line replacement exactly", async () => {
    const { snapshotter } = scriptedSnapshotter([B0, B1]);
    await snapshotter.captureAtBoundary();
    const impact = await snapshotter.captureAtBoundary();
    if (impact?.state !== "captured") throw new Error("expected a captured impact");
    expect(applyHunks(B0, impact.files[0]!.hunks)).toBe(normalizeEol(B1));
    expect(impact.magnitude).toEqual({ added: 1, removed: 1 });
  });

  it("re-applies a deletion exactly", async () => {
    const { snapshotter } = scriptedSnapshotter([B1, B2]);
    await snapshotter.captureAtBoundary();
    const impact = await snapshotter.captureAtBoundary();
    if (impact?.state !== "captured") throw new Error("expected a captured impact");
    expect(applyHunks(B1, impact.files[0]!.hunks)).toBe(normalizeEol(B2));
    expect(impact.magnitude).toEqual({ added: 0, removed: 1 });
  });

  it("re-applies an append at end of file exactly", async () => {
    const { snapshotter } = scriptedSnapshotter([B2, B3]);
    await snapshotter.captureAtBoundary();
    const impact = await snapshotter.captureAtBoundary();
    if (impact?.state !== "captured") throw new Error("expected a captured impact");
    expect(applyHunks(B2, impact.files[0]!.hunks)).toBe(normalizeEol(B3));
    expect(impact.magnitude).toEqual({ added: 2, removed: 0 });
  });

  it("re-applies two separate changes in one boundary as separate hunks", async () => {
    const { snapshotter } = scriptedSnapshotter([B3, B4]);
    await snapshotter.captureAtBoundary();
    const impact = await snapshotter.captureAtBoundary();
    if (impact?.state !== "captured") throw new Error("expected a captured impact");
    // A mid-file rewrite and an end-of-file append are far enough apart not to
    // coalesce, so the applier's multi-hunk ordering is genuinely exercised.
    expect(impact.files[0]!.hunks.length).toBeGreaterThan(1);
    expect(applyHunks(B3, impact.files[0]!.hunks)).toBe(normalizeEol(B4));
  });

  it("rejects hunks re-applied to the WRONG baseline", async () => {
    // The oracle has to be able to fail, or the assertions above prove nothing.
    const { snapshotter } = scriptedSnapshotter([B1, B2]);
    await snapshotter.captureAtBoundary();
    const impact = await snapshotter.captureAtBoundary();
    if (impact?.state !== "captured") throw new Error("expected a captured impact");
    expect(() => applyHunks(B3, impact.files[0]!.hunks)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Boundary bookkeeping — the other half of "the audit cannot mis-attribute"
// ---------------------------------------------------------------------------

describe("boundary bookkeeping", () => {
  it("reports `none` — not an empty capture — when a boundary changed nothing", async () => {
    const { snapshotter } = scriptedSnapshotter([B1, B1]);
    await snapshotter.captureAtBoundary();
    expect(await snapshotter.captureAtBoundary()).toEqual({ state: "none" });
  });

  it("captures nothing while there is no working copy to project", async () => {
    const snapshotter = createSourceSnapshotter({
      readProjectedKmn: () => Promise.resolve(null),
    });
    expect(await snapshotter.captureAtBoundary()).toBeNull();
    expect(await snapshotter.captureAtBoundary()).toBeNull();
  });

  it("keeps the baseline when a read fails, so the next diff is not doubled", async () => {
    // A failed projection must not silently roll the baseline forward: the next
    // boundary would then attribute two steps' worth of change to one decision.
    let call = 0;
    const snapshotter = createSourceSnapshotter({
      readProjectedKmn: () => {
        call += 1;
        if (call === 1) return Promise.resolve({ path: PATH, text: B0 });
        if (call === 2) return Promise.reject(new Error("projection failed"));
        return Promise.resolve({ path: PATH, text: B1 });
      },
    });

    expect(await snapshotter.captureAtBoundary()).toBeNull(); // baseline = B0
    expect(await snapshotter.captureAtBoundary()).toBeNull(); // failed read
    const impact = await snapshotter.captureAtBoundary();
    if (impact?.state !== "captured") throw new Error("expected a captured impact");
    // Still measured from B0 — nothing was lost and nothing was double-counted.
    expect(applyHunks(B0, impact.files[0]!.hunks)).toBe(normalizeEol(B1));
  });

  it("re-establishes a baseline after reset() instead of diffing across it", async () => {
    const { snapshotter } = scriptedSnapshotter([B0, B1, B2]);
    await snapshotter.captureAtBoundary();
    snapshotter.reset();
    // First capture after a reset is a baseline again — a re-instantiation is not
    // a decision that changed the previous keyboard into this one.
    expect(await snapshotter.captureAtBoundary()).toBeNull();
    const impact = await snapshotter.captureAtBoundary();
    if (impact?.state !== "captured") throw new Error("expected a captured impact");
    expect(applyHunks(B1, impact.files[0]!.hunks)).toBe(normalizeEol(B2));
  });

  it("reads the projection exactly once per boundary", async () => {
    // The projection is shared with the live preview; capture must not run it a
    // second time per step (FR-008's "adds no projection pass").
    const { snapshotter, read } = scriptedSnapshotter(SESSION);
    await snapshotter.captureAtBoundary();
    await snapshotter.captureAtBoundary();
    await snapshotter.captureAtBoundary();
    expect(read).toHaveBeenCalledTimes(3);
  });
});
