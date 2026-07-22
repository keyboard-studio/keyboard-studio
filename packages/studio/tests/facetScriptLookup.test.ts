// Tests for scripts/facet-script-lookup.mjs — the shared script-facet join
// used by both catalog producers (localKeyboards Vite plugin and
// build-keyboards-index.mjs). Guards the fix for every base keyboard being
// catalogued as "Latn": scripts must come from the committed facet index,
// with declared-BCP47-tag fallback.

import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  loadFacetScripts,
  resolveKeyboardScript,
  scriptFromDeclaredTags,
} from "../scripts/facet-script-lookup.mjs";

// vitest rewrites import.meta.url to a non-file scheme under jsdom, so anchor
// on the package cwd (vitest runs from packages/studio) instead.
const COMMITTED_INDEX = path.resolve(
  process.cwd(),
  "..",
  "..",
  "docs",
  "keyboard-facet-index.json",
);

describe("loadFacetScripts", () => {
  it("loads real per-keyboard scripts from the committed facet index", () => {
    const map = loadFacetScripts(COMMITTED_INDEX);
    // The committed index classifies ~900 keyboards; well over half are
    // non-Latin. If this collapses, the picker regresses to all-Latn again.
    expect(map.size).toBeGreaterThan(800);
    const distinct = new Set(map.values());
    expect(distinct.size).toBeGreaterThan(50);
    expect(map.get("adiga_danef")).toBe("Latn");
  });

  it("skips non-script facet values such as 'undetermined'", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "facet-script-"));
    const file = path.join(dir, "index.json");
    fs.writeFileSync(
      file,
      JSON.stringify({
        keyboards: {
          a: { facets: { script: { value: "Arab" } } },
          b: { facets: { script: { value: "undetermined" } } },
          c: { facets: {} },
        },
      }),
      "utf8",
    );
    try {
      const map = loadFacetScripts(file);
      expect(map.get("a")).toBe("Arab");
      expect(map.has("b")).toBe(false);
      expect(map.has("c")).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns an empty map for a missing or unparseable file", () => {
    expect(
      loadFacetScripts(path.join(os.tmpdir(), "no-such-index.json")).size,
    ).toBe(0);
  });
});

describe("scriptFromDeclaredTags", () => {
  it("finds the first four-letter script subtag and Title-cases it", () => {
    expect(scriptFromDeclaredTags(["hi-deva"])).toBe("Deva");
    expect(scriptFromDeclaredTags(["km", "hi-Deva"])).toBe("Deva");
  });

  it("returns null when no tag declares a script subtag", () => {
    expect(scriptFromDeclaredTags(["en", "fr-FR"])).toBeNull();
    expect(scriptFromDeclaredTags([])).toBeNull();
  });

  it("does not mistake the primary language subtag for a script", () => {
    // "aiku" would match a bare 4-letter regex if the primary subtag were
    // considered; only subtags AFTER the language are script candidates.
    expect(scriptFromDeclaredTags(["aiku"])).toBeNull();
  });
});

describe("resolveKeyboardScript", () => {
  const facets = new Map([["kb_facet", "Mymr"]]);

  it("prefers the facet-index script", () => {
    expect(resolveKeyboardScript("kb_facet", ["my-Latn"], facets)).toBe("Mymr");
  });

  it("falls back to declared tags when the facet is absent", () => {
    expect(resolveKeyboardScript("kb_other", ["ar-Arab"], facets)).toBe("Arab");
  });

  it("defaults to Latn when neither source knows the script", () => {
    expect(resolveKeyboardScript("kb_unknown", ["en"], facets)).toBe("Latn");
  });
});
