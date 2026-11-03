import { describe, it, expect } from "vitest";
import { parse } from "../codec/parse.js";
import { emit } from "../codec/emit.js";
import { writeCasedKeysStore, removeCasedKeysStore } from "./casedKeysStore.js";

const kmn = (extra: string, version: string | null = "'10.0'") =>
  `${version === null ? "" : `store(&VERSION) ${version}\n`}store(&NAME) 'x'\n${extra}begin Unicode > use(main)\ngroup(main) using keys\n+ [K_A] > 'a'\n`;

describe("casedKeysStore", () => {
  it("inserts a store and raises &VERSION from a lower value", () => {
    const { ir } = parse(kmn(""), "x");
    const r = writeCasedKeysStore(ir, ["K_A", "K_B"]);
    expect(r.versionRaised).toEqual({ from: "10.0", to: "14.0" });
    const out = emit(ir);
    expect(out).toContain("store(&CasedKeys) [K_A] [K_B]");
    expect(out).toContain("store(&VERSION) '14.0'");
  });

  it("replaces an existing store in place", () => {
    const { ir } = parse(kmn("store(&CasedKeys) [K_Q]\n", "'14.0'"), "x");
    const r = writeCasedKeysStore(ir, ["K_A"]);
    expect(r.versionRaised).toBeNull();
    const out = emit(ir);
    expect(out.match(/&CasedKeys/gi)?.length).toBe(1);
    expect(out).toContain("store(&CasedKeys) [K_A]");
  });

  it("does not lower a higher version", () => {
    const { ir } = parse(kmn("", "'15.0'"), "x");
    expect(writeCasedKeysStore(ir, ["K_A"]).versionRaised).toBeNull();
    expect(emit(ir)).toContain("'15.0'");
  });

  it("adds &VERSION when absent", () => {
    const { ir } = parse(kmn("", null), "x");
    const r = writeCasedKeysStore(ir, ["K_A"]);
    expect(r.versionRaised).toEqual({ from: null, to: "14.0" });
    expect(emit(ir)).toContain("store(&VERSION) '14.0'");
  });

  it("collapses a complete A-Z floor to a range", () => {
    const { ir } = parse(kmn(""), "x");
    const az = Array.from({ length: 26 }, (_, i) => `K_${String.fromCharCode(65 + i)}`);
    writeCasedKeysStore(ir, [...az, "K_1"]);
    expect(emit(ir)).toContain("store(&CasedKeys) [K_A]..[K_Z] [K_1]");
  });

  it("removes the store", () => {
    const { ir } = parse(kmn("store(&CasedKeys) [K_A]\n", "'14.0'"), "x");
    removeCasedKeysStore(ir);
    expect(emit(ir)).not.toMatch(/CasedKeys/i);
  });
});
