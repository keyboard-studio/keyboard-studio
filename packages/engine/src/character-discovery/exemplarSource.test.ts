/**
 * Contract tests for the single exemplar-sourcing path (spec 044).
 *
 * Every assertion runs against the REAL committed index — the point of the
 * feature is that a specific language gets its actual alphabet, and a mocked
 * index would only re-state whatever the test author believed was in there.
 */

import { beforeAll, describe, it, expect, vi } from "vitest";
import {
  charactersInTier,
  isGatedTag,
  loadExemplarSource,
  sourceExemplars,
} from "./exemplarSource.js";
import { exemplarLocaleCandidates } from "./cldr.js";
import { loadExemplarIndex } from "./exemplarIndex.js";

beforeAll(async () => {
  await loadExemplarSource();
});

// ---------------------------------------------------------------------------
// Obligation T11 / FR-011, SC-004 — nothing touches the network
// ---------------------------------------------------------------------------

describe("offline sourcing (obligation T11, FR-011/SC-004)", () => {
  it("resolves a covered tag with fetch stubbed to throw", () => {
    const boom = vi.fn(() => {
      throw new Error("network access is not allowed during authoring");
    });
    const original = globalThis.fetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = boom;
    try {
      const inv = sourceExemplars("ewo");
      expect(inv).not.toBeNull();
      expect(inv!.characters.length).toBeGreaterThan(0);
      // A whole sourcing run for several languages, still no fetch.
      for (const tag of ["fr", "ebk", "ewo-Latn", "sr-Latn", "zzz"]) sourceExemplars(tag);
      expect(boom).not.toHaveBeenCalled();
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fetch = original;
    }
  });

  it("loadExemplarSource is idempotent", async () => {
    await expect(loadExemplarSource()).resolves.toBeUndefined();
    await expect(loadExemplarSource()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Obligation T4 / FR-002, FR-003, SC-001 — coverage and precedence
// ---------------------------------------------------------------------------

describe("source precedence (obligation T4, FR-002/003, SC-001)", () => {
  it("seeds an SLDR-only language from SLDR", () => {
    // Eastern Bontok: present in SLDR, absent from CLDR. Before this feature it
    // fell through to the whole Latin script.
    const inv = sourceExemplars("ebk");
    expect(inv).not.toBeNull();
    expect(inv!.source).toBe("sldr");
    expect(inv!.resolvedTag).toBe("ebk");
    expect(charactersInTier(inv!, "main")).toContain("ó");
  });

  it("prefers CLDR where both sources cover the tag", () => {
    const inv = sourceExemplars("ewo");
    expect(inv).not.toBeNull();
    expect(inv!.source).toBe("cldr");
    expect(inv!.confidence).toBe("approved");
  });

  it("surfaces the SLDR draft status as confidence rather than filtering on it", () => {
    const inv = sourceExemplars("ebk");
    // ebk.xml carries sil:identity draft="generated". Dropping generated sets
    // would discard most of the coverage this feature exists to deliver.
    expect(inv!.confidence).toBe("generated");
    expect(inv!.characters.length).toBeGreaterThan(0);
  });

  it("resolves ewo-Latn through the candidate ladder to ewo", () => {
    const inv = sourceExemplars("ewo-Latn");
    expect(inv).not.toBeNull();
    expect(inv!.resolvedTag).toBe("ewo");
  });

  it("preserves digraph clusters the source wrote as {..}", () => {
    const inv = sourceExemplars("ewo");
    expect(inv!.digraphs).toContain("dz");
    expect(inv!.digraphs).toContain("kp");
  });
});

// ---------------------------------------------------------------------------
// Obligation T5 / FR-004, SC-007 — per-character attribution
// ---------------------------------------------------------------------------

describe("attribution (obligation T5, FR-004, SC-007)", () => {
  it.each(["ewo", "ebk", "fr", "vi"])("every character of %s carries source + confidence", (tag) => {
    const inv = sourceExemplars(tag);
    expect(inv).not.toBeNull();
    expect(inv!.characters.length).toBeGreaterThan(0);
    for (const c of inv!.characters) {
      expect(c.source).toBe(inv!.source);
      expect(c.confidence).toBe(inv!.confidence);
      expect(["main", "auxiliary", "punctuation", "numbers"]).toContain(c.tier);
      expect(c.char).toBe(c.char.normalize("NFC"));
    }
  });

  it("records a character shared by two tiers at its highest tier only", () => {
    const inv = sourceExemplars("fr");
    const counts = new Map<string, number>();
    for (const c of inv!.characters) counts.set(c.char, (counts.get(c.char) ?? 0) + 1);
    const duplicated = [...counts.entries()].filter(([, n]) => n > 1);
    expect(duplicated).toEqual([]);
  });

  it("does not synthesize uppercase counterparts", () => {
    // The inventory is a faithful record of what the source attested; case
    // derivation belongs to the caller (047's caseCounterpart).
    const inv = sourceExemplars("ewo");
    const main = charactersInTier(inv!, "main");
    expect(main).toContain("ŋ");
    expect(main).not.toContain("Ŋ");
  });

  it("populates all four tiers for a locale that defines them", () => {
    const inv = sourceExemplars("ewo");
    const tiers = new Set(inv!.characters.map((c) => c.tier));
    expect([...tiers].sort()).toEqual(["auxiliary", "main", "numbers", "punctuation"]);
  });
});

// ---------------------------------------------------------------------------
// Obligation T6 / FR-008, research R7 — the confidence gate
// ---------------------------------------------------------------------------

describe("confidence gate (obligation T6, FR-008, research R7)", () => {
  it.each(["und", "Latn", "zh", "ms"])("%s returns null for both sources", (tag) => {
    expect(isGatedTag(tag, "cldr")).toBe(true);
    expect(isGatedTag(tag, "sldr")).toBe(true);
    expect(sourceExemplars(tag)).toBeNull();
  });

  it("gates qaa-qtz for CLDR but allows it when SLDR-backed", () => {
    expect(isGatedTag("qaz", "cldr")).toBe(true);
    expect(isGatedTag("qaz", "sldr")).toBe(false);
    // qaz is in the index on the SLDR side only — private-use tags are how SLDR
    // carries minority languages that have no ISO code yet.
    const inv = sourceExemplars("qaz");
    expect(inv).not.toBeNull();
    expect(inv!.source).toBe("sldr");
  });

  it("lets a narrowed macrolanguage through", () => {
    expect(isGatedTag("zh-Hant", "cldr")).toBe(false);
    expect(isGatedTag("ms-MY", "cldr")).toBe(false);
    expect(sourceExemplars("zh-Hant")).not.toBeNull();
  });

  it("does not gate sw — its members share one orthography", () => {
    expect(isGatedTag("sw", "cldr")).toBe(false);
    expect(sourceExemplars("sw")).not.toBeNull();
  });

  it("gates an empty tag", () => {
    expect(isGatedTag("", "cldr")).toBe(true);
    expect(isGatedTag("   ", "sldr")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Obligation T7 / FR-010 — fall-through
// ---------------------------------------------------------------------------

describe("fall-through for uncovered tags (obligation T7, FR-010)", () => {
  it.each(["zxx", "xyz-Qaai", "nonsense", "x-private", "-", "  "])(
    "%s returns null and does not throw",
    (tag) => {
      expect(() => sourceExemplars(tag)).not.toThrow();
      expect(sourceExemplars(tag)).toBeNull();
    },
  );

  it("does not throw for a non-string argument", () => {
    // Defensive: the studio passes tags straight from working-copy metadata.
    expect(sourceExemplars(undefined as unknown as string)).toBeNull();
    expect(sourceExemplars(null as unknown as string)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Index integrity — the committed artifact matches what the loader assumes
// ---------------------------------------------------------------------------

describe("committed index integrity", () => {
  it("keys are all self-canonical under the shared candidate ladder", async () => {
    const index = await loadExemplarIndex();
    const offenders = Object.keys(index.locales).filter(
      (id) => exemplarLocaleCandidates(id)[0] !== id,
    );
    expect(offenders).toEqual([]);
  });

  it("every stored set parses through the canonical parser", async () => {
    // The codegen validates this at bake time; re-asserting here means a pin
    // bump that slips a bad set past a stale artifact still fails CI.
    const { parseUnicodeSet } = await import("./cldr.js");
    const index = await loadExemplarIndex();
    const failures: string[] = [];
    for (const [id, entry] of Object.entries(index.locales)) {
      for (const [side, tiers] of Object.entries(entry)) {
        for (const [key, raw] of Object.entries(tiers as Record<string, string>)) {
          if (key === "d") continue;
          try {
            parseUnicodeSet(raw);
          } catch (err) {
            failures.push(`${id}.${side}.${key}: ${(err as Error).message}`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("every entry has a main set on at least one side", async () => {
    const index = await loadExemplarIndex();
    const offenders = Object.entries(index.locales)
      .filter(([, e]) => e.c?.m === undefined && e.s?.m === undefined)
      .map(([id]) => id);
    expect(offenders).toEqual([]);
  });

  it("records the pins it was baked from", async () => {
    const index = await loadExemplarIndex();
    expect(index.version.cldr).toBe("48.2.0");
    expect(index.version.sldrCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(index.version.generated).toBe(
      `cldr:${index.version.cldr}+sldr:${index.version.sldrCommit.slice(0, 7)}`,
    );
  });
});
