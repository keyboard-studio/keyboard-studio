// Tests for the identity counterfactual (spec 057 T027).
//
// The `project` dependency is injected, so these tests drive it with hand-built
// projections — that is the point of the seam. What they pin is the DIFFING
// discipline: which side is which, what is excluded, and the difference between
// "changed nothing" and "cannot be resolved".

import { describe, it, expect, vi } from "vitest";
import type { DecisionEntry, DecisionRecord, VirtualFS } from "@keyboard-studio/contracts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import {
  resolveIdentityCounterfactual,
  coDecisionEntryIds,
  outputFieldForEntry,
} from "./counterfactualProjection.ts";
import type { ProjectForOutputOptions } from "../lib/serializeWorkingCopy.ts";

// ---------------------------------------------------------------------------
// Projection doubles
// ---------------------------------------------------------------------------

/** A descriptor whose declared language tracks the overlay's `bcp47`. */
function descriptorFor(tag: string | undefined): string {
  const effective = tag === undefined || tag === "" ? "und" : tag;
  return (
    '<?xml version="1.0" encoding="utf-8"?>\n' +
    "<Package>\n" +
    "  <Keyboards>\n    <Keyboard>\n      <Languages>\n" +
    `        <Language ID="${effective}">${effective}</Language>\n` +
    "      </Languages>\n    </Keyboard>\n  </Keyboards>\n" +
    "</Package>\n"
  );
}

/**
 * A `project` double that renders the descriptor from the override and holds
 * everything else constant — the shape of the real projection for this comparison.
 */
function projectorDeclaringLanguage(extra?: (vfs: VirtualFS) => void) {
  return vi.fn(async (opts?: ProjectForOutputOptions) => {
    const tag = opts?.identityOverride?.bcp47;
    const vfs = createVirtualFS([
      { path: "source/kb.kmn", content: "c stable\n", isBinary: false },
      { path: "source/kb.kps", content: descriptorFor(tag), isBinary: false },
    ]);
    extra?.(vfs);
    return { vfs, keyboardId: "kb", displayName: "KB", version: "1.0", warnings: [] };
  });
}

// ---------------------------------------------------------------------------
// The comparison
// ---------------------------------------------------------------------------

describe("resolveIdentityCounterfactual — what changed (FR-009, FR-010)", () => {
  it("names the package descriptor as the changed file, and nothing else", async () => {
    const project = projectorDeclaringLanguage();
    const impact = await resolveIdentityCounterfactual("bcp47", "bm-Latn", undefined, {
      project,
    });

    expect(impact).not.toBeNull();
    expect(impact!.state).toBe("captured");
    if (impact!.state !== "captured") return;
    expect(impact!.files.map((f) => f.path)).toEqual(["source/kb.kps"]);
    expect(impact!.magnitude.added).toBeGreaterThan(0);
  });

  it("projects exactly twice, differing in exactly one overlay field", async () => {
    const project = projectorDeclaringLanguage();
    await resolveIdentityCounterfactual("bcp47", "bm-Latn", undefined, { project });

    expect(project).toHaveBeenCalledTimes(2);
    const overrides = project.mock.calls.map(([opts]) => opts?.identityOverride);
    // One call carries the recorded value, one the alternative — and each override
    // touches only `bcp47`.
    expect(overrides).toEqual(
      expect.arrayContaining([{ bcp47: "bm-Latn" }, { bcp47: undefined }]),
    );
    for (const override of overrides) {
      expect(Object.keys(override ?? {})).toEqual(["bcp47"]);
    }
  });

  it("reports the recorded value as the AFTER side, so the change reads forwards", async () => {
    const project = projectorDeclaringLanguage();
    const impact = await resolveIdentityCounterfactual("bcp47", "bm-Latn", "fr", { project });
    expect(impact!.state).toBe("captured");
    if (impact!.state !== "captured") return;
    const lines = impact!.files[0]!.hunks.flatMap((h) => h.lines);
    // The author's tag is what got ADDED; the alternative is what got removed. The
    // direction matters: a reversed diff would tell the author their decision
    // removed their own language.
    expect(lines.some((l) => l.startsWith("+") && l.includes("bm-Latn"))).toBe(true);
    expect(lines.some((l) => l.startsWith("-") && l.includes('ID="fr"'))).toBe(true);
    expect(lines.some((l) => l.startsWith("+") && l.includes('ID="fr"'))).toBe(false);
  });
});

describe("resolveIdentityCounterfactual — changed nothing vs. cannot resolve", () => {
  // The spec's Edge Case: an author whose language happens to match the base's. The
  // decision genuinely changed nothing about the declared language, and the trail
  // must say that in words rather than fabricate a change or render a blank diff.
  it("returns {state:'none'} when the two projections are identical", async () => {
    // A projector that ignores the override entirely: the artifact does not depend
    // on this field at all.
    const project = vi.fn(async () => ({
      vfs: createVirtualFS([
        { path: "source/kb.kps", content: descriptorFor("fr"), isBinary: false },
      ]),
      keyboardId: "kb",
      displayName: "KB",
      version: "1.0",
      warnings: [],
    }));
    const impact = await resolveIdentityCounterfactual("bcp47", "fr", undefined, { project });
    expect(impact).toEqual({ state: "none" });
  });

  it("never returns an empty 'captured'", async () => {
    const project = vi.fn(async () => ({
      vfs: createVirtualFS([{ path: "a.txt", content: "same", isBinary: false }]),
      keyboardId: "kb",
      displayName: "KB",
      version: "1.0",
      warnings: [],
    }));
    const impact = await resolveIdentityCounterfactual("bcp47", "x", "y", { project });
    expect(impact).not.toBeNull();
    expect(impact!.state).not.toBe("captured");
  });

  it("short-circuits to 'none' without projecting when the values are equal", async () => {
    const project = projectorDeclaringLanguage();
    const impact = await resolveIdentityCounterfactual("bcp47", "bm", "bm", { project });
    expect(impact).toEqual({ state: "none" });
    expect(project).not.toHaveBeenCalled();
  });

  // FR-012's precondition: null means "the caller must report a reason", NOT
  // "changed nothing". Conflating the two is the whole defect this feature removes.
  it("returns null when there is no working copy to project", async () => {
    const project = vi.fn(async () => null);
    const impact = await resolveIdentityCounterfactual("bcp47", "bm", undefined, { project });
    expect(impact).toBeNull();
  });

  it("returns null when only ONE side fails to project", async () => {
    let call = 0;
    const project = vi.fn(async () => {
      call += 1;
      if (call === 1) return null;
      return {
        vfs: createVirtualFS([{ path: "a.txt", content: "x", isBinary: false }]),
        keyboardId: "kb",
        displayName: "KB",
        version: "1.0",
        warnings: [],
      };
    });
    expect(await resolveIdentityCounterfactual("bcp47", "bm", undefined, { project })).toBeNull();
  });
});

describe("resolveIdentityCounterfactual — volatile content (FR-013)", () => {
  // The date stamp `stageAdaptHistory` writes changes independently of any decision.
  // Normalizing only one side would attribute a midnight crossing to an identity
  // answer; normalizing neither would do the same whenever the two projections
  // straddle one.
  it("shows no spurious change when HISTORY.md's date stamp differs between sides", async () => {
    let call = 0;
    const project = vi.fn(async (opts?: ProjectForOutputOptions) => {
      call += 1;
      const stamp = call === 1 ? "2026-08-03" : "2026-08-04";
      const vfs = createVirtualFS([
        {
          path: "HISTORY.md",
          content: `## 1.1 (${stamp})\n* Adapted.\n`,
          isBinary: false,
        },
        {
          path: "source/kb.kps",
          content: descriptorFor(opts?.identityOverride?.bcp47),
          isBinary: false,
        },
      ]);
      return { vfs, keyboardId: "kb", displayName: "KB", version: "1.0", warnings: [] };
    });

    const impact = await resolveIdentityCounterfactual("bcp47", "bm-Latn", undefined, {
      project,
    });
    expect(impact!.state).toBe("captured");
    if (impact!.state !== "captured") return;
    // The descriptor changed; HISTORY.md must NOT appear.
    expect(impact!.files.map((f) => f.path)).toEqual(["source/kb.kps"]);
  });

  it("still reports a genuine HISTORY.md edit that is not the date heading", async () => {
    let call = 0;
    const project = vi.fn(async () => {
      call += 1;
      const body = call === 1 ? "* Adapted.\n" : "* Adapted, and something else.\n";
      return {
        vfs: createVirtualFS([
          { path: "HISTORY.md", content: `## 1.1 (2026-08-03)\n${body}`, isBinary: false },
        ]),
        keyboardId: "kb",
        displayName: "KB",
        version: "1.0",
        warnings: [],
      };
    });
    const impact = await resolveIdentityCounterfactual("bcp47", "bm", undefined, { project });
    expect(impact!.state).toBe("captured");
    if (impact!.state !== "captured") return;
    expect(impact!.files.map((f) => f.path)).toEqual(["HISTORY.md"]);
  });

  it("never diffs a binary entry, even when its bytes differ", async () => {
    let call = 0;
    const project = vi.fn(async (opts?: ProjectForOutputOptions) => {
      call += 1;
      const vfs = createVirtualFS([
        { path: "source/kb.kps", content: descriptorFor(opts?.identityOverride?.bcp47), isBinary: false },
      ]);
      vfs.set("source/kb.ico", new Uint8Array([call]), true);
      return { vfs, keyboardId: "kb", displayName: "KB", version: "1.0", warnings: [] };
    });
    const impact = await resolveIdentityCounterfactual("bcp47", "bm-Latn", undefined, { project });
    expect(impact!.state).toBe("captured");
    if (impact!.state !== "captured") return;
    expect(impact!.files.map((f) => f.path)).toEqual(["source/kb.kps"]);
  });

  it("sorts changed files by path rather than by VFS iteration order", async () => {
    let call = 0;
    const project = vi.fn(async () => {
      call += 1;
      const suffix = String(call);
      return {
        vfs: createVirtualFS([
          { path: "z.txt", content: `z${suffix}`, isBinary: false },
          { path: "a.txt", content: `a${suffix}`, isBinary: false },
          { path: "m.txt", content: `m${suffix}`, isBinary: false },
        ]),
        keyboardId: "kb",
        displayName: "KB",
        version: "1.0",
        warnings: [],
      };
    });
    const impact = await resolveIdentityCounterfactual("bcp47", "bm", undefined, { project });
    expect(impact!.state).toBe("captured");
    if (impact!.state !== "captured") return;
    expect(impact!.files.map((f) => f.path)).toEqual(["a.txt", "m.txt", "z.txt"]);
  });
});

// ---------------------------------------------------------------------------
// Joint attribution (FR-014)
// ---------------------------------------------------------------------------

function answerEntry(entryId: string, questionId: string, stepId = "identity"): DecisionEntry {
  return {
    entryId,
    stepId,
    sequence: 1,
    at: "2026-08-03T00:00:00.000Z",
    agency: "author-chosen",
    payload: { kind: "survey-answer", questionId, answerType: "select", value: "x" },
  } as DecisionEntry;
}

function recordOf(entries: DecisionEntry[]): DecisionRecord {
  return { keyboardId: "kb", entries } as DecisionRecord;
}

describe("output-reach lookup and co-decisions (FR-014)", () => {
  it("reads the declared overlay field off the question module", () => {
    expect(outputFieldForEntry(answerEntry("d1", "il_language_code"))).toBe("bcp47");
    expect(outputFieldForEntry(answerEntry("d2", "il_language_english"))).toBe("languageName");
    // Declared `outputs: []` — collected for other purposes, reaches no artifact.
    expect(outputFieldForEntry(answerEntry("d3", "il_language_autonym"))).toBeUndefined();
  });

  it("returns undefined for a question that declares no output reach", () => {
    expect(outputFieldForEntry(answerEntry("d1", "il_target_script"))).toBe("bcp47");
    expect(outputFieldForEntry(answerEntry("d4", "no_such_question"))).toBeUndefined();
  });

  // The three questions that compose one BCP47 tag are the case this exists for: a
  // change to the tag belongs to all three, and none may claim it alone.
  it("names the other live decisions feeding the same overlay field", () => {
    const code = answerEntry("d-code", "il_language_code");
    const region = answerEntry("d-region", "il_language_region");
    const script = answerEntry("d-script", "il_target_script");
    const record = recordOf([code, region, script]);

    expect(coDecisionEntryIds(code, record, "bcp47").sort()).toEqual(["d-region", "d-script"]);
    // Never names itself.
    expect(coDecisionEntryIds(code, record, "bcp47")).not.toContain("d-code");
  });

  it("excludes a decision that feeds a DIFFERENT overlay field", () => {
    const code = answerEntry("d-code", "il_language_code");
    const english = answerEntry("d-english", "il_language_english");
    const record = recordOf([code, english]);
    expect(coDecisionEntryIds(code, record, "bcp47")).toEqual([]);
  });

  it("excludes a decision from a different step", () => {
    const code = answerEntry("d-code", "il_language_code");
    const elsewhere = answerEntry("d-else", "il_target_script", "some_other_step");
    expect(coDecisionEntryIds(code, recordOf([code, elsewhere]), "bcp47")).toEqual([]);
  });

  // A revision supersedes: the co-decisions of the answer that CURRENTLY stands are
  // the answers that currently stand, not the ones they replaced (US4).
  it("names only the LIVE answer when a co-decision was revised", () => {
    const code = answerEntry("d-code", "il_language_code");
    const scriptOld = answerEntry("d-script-1", "il_target_script");
    const scriptNew = answerEntry("d-script-2", "il_target_script");
    const shared = coDecisionEntryIds(code, recordOf([code, scriptOld, scriptNew]), "bcp47");
    expect(shared).toEqual(["d-script-2"]);
  });

  it("carries the co-decisions into the resolved impact's sharedWith", async () => {
    const project = projectorDeclaringLanguage();
    const impact = await resolveIdentityCounterfactual(
      "bcp47",
      "bm-Latn",
      undefined,
      { project },
      ["d-region", "d-script"],
    );
    expect(impact!.state).toBe("captured");
    if (impact!.state !== "captured") return;
    expect(impact!.sharedWith).toEqual(["d-region", "d-script"]);
  });

  it("omits sharedWith entirely when the entry has no co-decisions", async () => {
    const project = projectorDeclaringLanguage();
    const impact = await resolveIdentityCounterfactual("bcp47", "bm-Latn", undefined, {
      project,
    });
    expect(impact!.state).toBe("captured");
    if (impact!.state !== "captured") return;
    // Absent, not an empty array — absent is how the contract says "this entry
    // claims the change outright".
    expect(impact!.sharedWith).toBeUndefined();
  });
});
