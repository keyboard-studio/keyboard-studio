import { describe, it, expect, beforeAll } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPatterns, getPatterns, getById } from "./index.js";

const FIXTURE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

describe("pattern-library loader", () => {
  beforeAll(async () => {
    await loadPatterns(FIXTURE_DIR);
  });

  it("loads the valid pattern", () => {
    const patterns = getPatterns();
    expect(patterns.some(p => p.id === "test_valid_pattern")).toBe(true);
  });

  it("skips the invalid pattern", () => {
    const patterns = getPatterns();
    expect(patterns.some(p => p.id === "test_invalid_pattern")).toBe(false);
  });

  it("includes the borderline pattern despite demo errors", () => {
    const patterns = getPatterns();
    expect(patterns.some(p => p.id === "test_borderline_pattern")).toBe(true);
  });

  it("filter by group_visibility=all", () => {
    const patterns = getPatterns({ group_visibility: "all" });
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.every(p => p.group_visibility === "all")).toBe(true);
  });

  it("filter by category", () => {
    const patterns = getPatterns({ category: "substitute" });
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.every(p => p.category === "substitute")).toBe(true);
  });

  it("filter by priority=1", () => {
    const patterns = getPatterns({ priority: 1 });
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.every(p => p.priority === 1)).toBe(true);
  });

  it("getById returns the correct pattern", () => {
    const p = getById("test_valid_pattern");
    expect(p).toBeDefined();
    expect(p?.id).toBe("test_valid_pattern");
  });

  it("getById returns undefined for unknown id", () => {
    expect(getById("nonexistent")).toBeUndefined();
  });
});
