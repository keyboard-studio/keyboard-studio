import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
// index.js is CommonJS (plain-node tool); vitest resolves the interop.
import { CONFIGURED_LOCALES, pruneAllCatalogTrees, pruneUnconfiguredLocales } from "./index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");

describe("pruneUnconfiguredLocales", () => {
  const dirs: string[] = [];

  afterEach(() => {
    while (dirs.length > 0) {
      const dir = dirs.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  function tempTree(): string {
    const dir = mkdtempSync(join(tmpdir(), "i18n-prune-test-"));
    dirs.push(dir);
    return dir;
  }

  function localeDir(tree: string, locale: string): void {
    mkdirSync(join(tree, locale));
    writeFileSync(join(tree, locale, "messages.json"), JSON.stringify({ k: "v" }));
  }

  it("removes an unconfigured locale directory (the #1842 es-ES shape)", () => {
    const tree = tempTree();
    localeDir(tree, "en");
    localeDir(tree, "fr");
    localeDir(tree, "es-ES");

    const pruned = pruneUnconfiguredLocales(tree, ["en", "fr"], "tier-a");

    expect(pruned).toEqual([{ tier: "tier-a", locale: "es-ES" }]);
    expect(existsSync(join(tree, "es-ES"))).toBe(false);
    expect(existsSync(join(tree, "en", "messages.json"))).toBe(true);
    expect(existsSync(join(tree, "fr", "messages.json"))).toBe(true);
  });

  it("is a no-op when every directory is configured", () => {
    const tree = tempTree();
    localeDir(tree, "en");
    localeDir(tree, "fr");

    expect(pruneUnconfiguredLocales(tree, ["en", "fr"], "tier-a")).toEqual([]);
  });

  it("leaves stray files alone — only directories are pruned", () => {
    const tree = tempTree();
    localeDir(tree, "en");
    writeFileSync(join(tree, "es-ES.json"), "{}\n");

    expect(pruneUnconfiguredLocales(tree, ["en", "fr"], "tier-a")).toEqual([]);
    expect(existsSync(join(tree, "es-ES.json"))).toBe(true);
  });

  it("prunes nothing (rather than throwing) when the catalog tree is absent", () => {
    expect(pruneUnconfiguredLocales(join(tempTree(), "no-such-dir"), ["en", "fr"], "tier-b")).toEqual([]);
  });

  it("pruneAllCatalogTrees covers both tiers in one pass", () => {
    const root = tempTree();
    const tierA = join(root, "packages", "studio", "src", "locales");
    const tierB = join(root, "content", "i18n");
    for (const dir of [join(tierA, "en"), join(tierA, "es-ES"), join(tierB, "en"), join(tierB, "es-ES")]) {
      mkdirSync(dir, { recursive: true });
    }

    const pruned = pruneAllCatalogTrees(root);

    expect(pruned).toContainEqual({ tier: "tier-a", locale: "es-ES" });
    expect(pruned).toContainEqual({ tier: "tier-b", locale: "es-ES" });
    expect(pruned).toHaveLength(2);
  });
});

// Drift guard: CONFIGURED_LOCALES is a copied literal (see the header in
// index.js) and must match the three sources in the same commit, or adding a
// locale in one place silently reintroduces the #1842 orphan failure — or
// silently drops a locale the app does support.
describe("CONFIGURED_LOCALES drift guard", () => {
  function linguiLocales(): string[] {
    const src = readFileSync(join(REPO_ROOT, "packages", "studio", "lingui.config.ts"), "utf8");
    const match = src.match(/locales:\s*\[([^\]]*)\]/);
    if (!match) throw new Error("drift guard: could not find locales array in lingui.config.ts");
    return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
  }

  function supportedLocales(): string[] {
    const src = readFileSync(join(REPO_ROOT, "packages", "studio", "src", "lib", "i18n.ts"), "utf8");
    const match = src.match(/SUPPORTED_LOCALES\s*=\s*\{([^}]*)\}/);
    if (!match) throw new Error("drift guard: could not find SUPPORTED_LOCALES in lib/i18n.ts");
    return [...match[1].matchAll(/(\w+)\s*:/g)].map((m) => m[1]).sort();
  }

  function crowdinMappings(): string {
    return readFileSync(join(REPO_ROOT, "crowdin.yml"), "utf8");
  }

  it("matches lingui.config.ts locales", () => {
    expect([...CONFIGURED_LOCALES].sort()).toEqual(linguiLocales());
  });

  it("matches SUPPORTED_LOCALES keys", () => {
    expect([...CONFIGURED_LOCALES].sort()).toEqual(supportedLocales());
  });

  it("has a languages_mapping entry for every configured locale (both tiers)", () => {
    const crowdin = crowdinMappings();
    // Two mapping blocks (Tier A + Tier B) each carry `locale: { en: "en", fr: "fr", … }`.
    const blocks = crowdin.split("languages_mapping:");
    expect(blocks.length).toBe(3);
    for (const locale of CONFIGURED_LOCALES) {
      for (const block of blocks.slice(1)) {
        expect(block).toMatch(new RegExp(`^\\s+${locale}:\\s+"${locale}"\\s*$`, "m"));
      }
    }
  });
});
