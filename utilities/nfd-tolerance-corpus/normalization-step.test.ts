// Hermetic checks for the normalization-step harness mode: record format,
// freshness, incremental carry-forward, and the verify outcomes. Runs over the
// vendored __fixtures__, so no corpus checkout is needed.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_DEPS,
  GENERATOR_VERSION,
  RECORD_FORMAT,
  comparableForm,
  isFresh,
  mergeRecords,
  serializeRecord,
  sourceHashOf,
  staleKeyboards,
  verifyKeyboard,
  type KeyboardRecord,
  type VerificationRecord,
} from "./normalization-step.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string => readFileSync(resolve(HERE, "__fixtures__", name), "utf8");

const verifiedEntry = (sourceHash: string): KeyboardRecord => ({
  sourceHash,
  outcome: "verified",
  ruleCount: 3,
  typed: { sequences: 10, differ: 0 },
  pasted: { probes: 4, exact: 4, nfcEqual: 0, fail: 0 },
  compileDiagnostics: { before: 0, after: 0 },
});

const record = (keyboards: Record<string, KeyboardRecord>, generatorVersion = GENERATOR_VERSION): VerificationRecord => ({
  manifest: { format: RECORD_FORMAT, corpusCommit: "abc", generatorVersion, generatedAt: "2026-01-01T00:00:00.000Z" },
  keyboards,
});

describe("record format", () => {
  it("is context-normalization-verification/1 with keys sorted at every level", () => {
    const text = serializeRecord(record({ zeta: verifiedEntry("h2"), alpha: verifiedEntry("h1") }));
    const parsed = JSON.parse(text) as VerificationRecord;
    expect(parsed.manifest.format).toBe("context-normalization-verification/1");
    expect(Object.keys(parsed)).toEqual(["keyboards", "manifest"]);
    expect(Object.keys(parsed.keyboards)).toEqual(["alpha", "zeta"]);
    expect(Object.keys(parsed.keyboards.alpha!)).toEqual(Object.keys(parsed.keyboards.alpha!).slice().sort());
    expect(Object.keys(parsed.manifest)).toEqual(["corpusCommit", "format", "generatedAt", "generatorVersion"]);
    expect(text.endsWith("\n")).toBe(true);
  });

  it("serializes identically regardless of insertion order", () => {
    const a = serializeRecord(record({ a: verifiedEntry("1"), b: verifiedEntry("2") }));
    const b = serializeRecord(record({ b: verifiedEntry("2"), a: verifiedEntry("1") }));
    expect(a).toBe(b);
  });
});

describe("freshness", () => {
  const rec = record({ k: verifiedEntry("hash-1") });

  it("ignores generatedAt", () => {
    const later = { ...rec, manifest: { ...rec.manifest, generatedAt: "2030-05-05T05:05:05.000Z" } };
    expect(comparableForm(later)).toBe(comparableForm(rec));
  });

  it("is fresh when sourceHash and generator version match", () => {
    expect(isFresh(rec, "k", "hash-1")).toBe(true);
  });

  it("is stale when the sourceHash changed", () => {
    expect(isFresh(rec, "k", "hash-2")).toBe(false);
    expect(staleKeyboards(rec, new Map([["k", "hash-2"]]))).toEqual(["k"]);
  });

  it("is stale when the generator version changed", () => {
    expect(isFresh(rec, "k", "hash-1", "next-version")).toBe(false);
    expect(isFresh(record({ k: verifiedEntry("hash-1") }, "old-version"), "k", "hash-1")).toBe(false);
  });

  it("treats a missing keyboard or missing record as stale", () => {
    expect(staleKeyboards(rec, new Map([["other", "x"]]))).toEqual(["other"]);
    expect(staleKeyboards(undefined, new Map([["k", "hash-1"]]))).toEqual(["k"]);
  });

  it("hashes the touch layout into the source hash", () => {
    expect(sourceHashOf("kmn")).not.toBe(sourceHashOf("kmn", "layout"));
    expect(sourceHashOf("kmn", "layout")).toBe(sourceHashOf("kmn", "layout"));
  });
});

describe("--incremental carry-forward", () => {
  const previous = record({ keep: verifiedEntry("same"), redo: verifiedEntry("old") });

  it("carries fresh records forward byte-for-byte and replaces only the re-simulated one", () => {
    const merged = mergeRecords(previous, { redo: verifiedEntry("new") }, "abc", () => "2031-01-01T00:00:00.000Z");
    const before = JSON.parse(serializeRecord(previous)) as VerificationRecord;
    const after = JSON.parse(serializeRecord(merged)) as VerificationRecord;
    expect(JSON.stringify(after.keyboards.keep)).toBe(JSON.stringify(before.keyboards.keep));
    expect(after.keyboards.redo!.sourceHash).toBe("new");
    expect(merged.manifest.generatedAt).toBe("2031-01-01T00:00:00.000Z");
  });

  it("returns the previous record unchanged (same bytes) when nothing was re-simulated", () => {
    const merged = mergeRecords(previous, {}, "abc", () => "2031-01-01T00:00:00.000Z");
    expect(serializeRecord(merged)).toBe(serializeRecord(previous));
  });
});

describe("verifyKeyboard", () => {
  const text = fixture("sil_kcho.pre-fix.kmn");
  const hash = sourceHashOf(text);

  it("records a refusal without compiling", async () => {
    const compileText = vi.fn(DEFAULT_DEPS.compileText);
    const result = await verifyKeyboard({ id: "sil_kcho", path: "x", text }, hash, {
      ...DEFAULT_DEPS,
      propose: async () => ({ kind: "refused", reason: "no-alternates" }),
      compileText,
    });
    expect(result).toEqual({ sourceHash: hash, outcome: "refused", reason: "no-alternates" });
    expect(compileText).not.toHaveBeenCalled();
  });

  it("verifies a faithful step: no typed difference, equal diagnostics", async () => {
    const result = await verifyKeyboard({ id: "sil_kcho", path: "x", text }, hash);
    expect(result.outcome).toBe("verified");
    expect(result.typed?.differ).toBe(0);
    expect(result.pasted?.fail).toBe(0);
    expect(result.compileDiagnostics?.before).toBe(result.compileDiagnostics?.after);
  });

  it("marks any typed difference as regressed", async () => {
    let calls = 0;
    const result = await verifyKeyboard({ id: "sil_kcho", path: "x", text }, hash, {
      ...DEFAULT_DEPS,
      // sil_kcho proposes a real step; its stepped build is then sabotaged so one
      // key types a different character.
      compileText: (id, kmn) => {
        calls += 1;
        const sabotaged = calls === 2 ? kmn.replace(/(\[RALT K_Q\]\s*>\s*)U\+0071/i, "$1U+007A") : kmn;
        return DEFAULT_DEPS.compileText(id, sabotaged);
      },
    });
    expect(calls).toBe(2);
    expect(result.outcome).toBe("regressed");
    expect(result.typed?.differ).toBeGreaterThan(0);
  });
});
