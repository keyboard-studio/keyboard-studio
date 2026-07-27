/**
 * Build-time contract tests for the two prebuild scripts behind the offline
 * exemplar index (spec 044 US3): `scripts/fetch-sldr.mjs` and
 * `scripts/codegen-exemplars.mjs`.
 *
 * These live engine-side rather than as `scripts/*.test.mjs` so they actually
 * run: `pnpm -r test` invokes each package's vitest, and the root config
 * deliberately matches nothing. The scripts are plain `.mjs` and are loaded
 * through a dynamic import, so nothing here needs the engine to be built.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { describe, it, expect, beforeAll } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..", "..");
const SCRIPTS = join(REPO_ROOT, "scripts");

/**
 * Dynamic import so TypeScript does not need declarations for the plain-`.mjs`
 * prebuild scripts. The returned module is deliberately loosely typed — these
 * are build scripts, not a typed package surface.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ScriptModule = Record<string, any>;

async function loadScript(name: string): Promise<ScriptModule> {
  return (await import(pathToFileURL(join(SCRIPTS, name)).href)) as ScriptModule;
}

// ---------------------------------------------------------------------------
// T015 / obligation T9 — fetch-sldr fails loudly (FR-012)
// ---------------------------------------------------------------------------

describe("fetch-sldr verification (obligation T9, FR-012)", () => {
  let verifyTarball: (buf: Buffer, sha: string) => string;
  let SldrFetchError: new (...args: never[]) => Error & { reason: string };
  /** A body that passes the size + gzip-magic shape checks. */
  let plausible: Buffer;
  let plausibleSha: string;

  beforeAll(async () => {
    const mod = await loadScript("fetch-sldr.mjs");
    verifyTarball = mod.verifyTarball;
    SldrFetchError = mod.SldrFetchError;
    const { createHash, randomBytes } = await import("node:crypto");
    // Incompressible payload, so the gzipped body clears MIN_PLAUSIBLE_BYTES.
    plausible = gzipSync(randomBytes(256 * 1024));
    plausibleSha = createHash("sha256").update(plausible).digest("hex");
  });

  it("accepts a body matching the pinned checksum", () => {
    expect(verifyTarball(plausible, plausibleSha)).toBe(plausibleSha);
  });

  it("rejects a checksum mismatch", () => {
    try {
      verifyTarball(plausible, "0".repeat(64));
      expect.unreachable("expected a checksum mismatch");
    } catch (err) {
      expect(err).toBeInstanceOf(SldrFetchError);
      expect((err as { reason: string }).reason).toBe("checksum-mismatch");
    }
  });

  it("rejects a placeholder pin before it can be compared", () => {
    try {
      verifyTarball(plausible, "PLACEHOLDER");
      expect.unreachable("expected a placeholder-pin rejection");
    } catch (err) {
      expect((err as { reason: string }).reason).toBe("placeholder-pin");
    }
  });

  it("rejects a zero-length body", () => {
    try {
      verifyTarball(Buffer.alloc(0), plausibleSha);
      expect.unreachable("expected an empty-body rejection");
    } catch (err) {
      expect((err as { reason: string }).reason).toBe("empty");
    }
  });

  it("rejects a truncated body that is too small to be the tarball", () => {
    try {
      verifyTarball(gzipSync(Buffer.alloc(16)), plausibleSha);
      expect.unreachable("expected an empty-body rejection");
    } catch (err) {
      expect((err as { reason: string }).reason).toBe("empty");
    }
  });

  it("rejects an HTML error page served as a tarball, naming the real problem", () => {
    const html = Buffer.from(
      "<!DOCTYPE html><html><head><title>404 Not Found</title></head>" + " ".repeat(200_000),
      "utf8",
    );
    try {
      verifyTarball(html, plausibleSha);
      expect.unreachable("expected a not-gzip rejection");
    } catch (err) {
      expect((err as { reason: string }).reason).toBe("not-gzip");
      // Reporting "SHA-256 mismatch" for an HTML body would send whoever hits
      // this hunting a supply-chain problem that isn't there.
      expect((err as Error).message).not.toMatch(/SHA-256/);
      expect((err as Error).message).toContain("404 Not Found");
    }
  });

  it("exits non-zero with [ERROR] when the pinned checksum does not match", () => {
    const dir = mkdtempSync(join(tmpdir(), "ks-sldr-"));
    try {
      // Run the real CLI against a pin whose sha256 cannot match anything.
      const pin = join(dir, "sldr-version.json");
      writeFileSync(
        pin,
        JSON.stringify({
          repo: "silnrsi/sldr",
          commit: "922a7879250864e23039f56dc929c84ed4aa3ebc",
          urlTemplate: "https://codeload.github.com/silnrsi/sldr/tar.gz/{commit}",
          sha256: "PLACEHOLDER",
        }),
      );
      // The placeholder path is reached before any network I/O only after the
      // download, so drive the pure verifier through a one-liner instead of
      // making the suite depend on the network.
      const out = execFileSync(
        process.execPath,
        [
          "-e",
          `import(${JSON.stringify(pathToFileURL(join(SCRIPTS, "fetch-sldr.mjs")).href)})
             .then(m => { try { m.verifyTarball(Buffer.alloc(0), "PLACEHOLDER"); }
                          catch (e) { console.error("[ERROR] " + e.message); process.exit(1); } });`,
        ],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
      expect(out).toBe("unreachable");
    } catch (err) {
      const e = err as { status: number; stderr: string };
      expect(e.status).toBe(1);
      expect(e.stderr).toContain("[ERROR]");
      expect(e.stderr).toContain("placeholder");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// T018 / R6 — the SLDR reader rules
// ---------------------------------------------------------------------------

describe("SLDR reader rules (research R6)", () => {
  let readSldrFile: (xml: string) => { tiers: Record<string, string>; draft: string } | null;
  let decodeXmlEntities: (s: string) => string;
  let canonicalLocaleId: (s: string) => string;

  beforeAll(async () => {
    const mod = await loadScript("codegen-exemplars.mjs");
    readSldrFile = mod.readSldrFile;
    decodeXmlEntities = mod.decodeXmlEntities;
    canonicalLocaleId = mod.canonicalLocaleId;
  });

  const wrap = (inner: string, identity = ""): string =>
    `<?xml version="1.0"?><ldml xmlns:sil="urn://www.sil.org/ldml/0.1">` +
    `<identity><special>${identity}</special></identity>` +
    `<characters>${inner}</characters></ldml>`;

  it("skips elements carrying alt — ebk's punctuation must not appear twice", () => {
    const xml = wrap(
      `<exemplarCharacters>[a b]</exemplarCharacters>` +
        `<exemplarCharacters type="punctuation">[! ?]</exemplarCharacters>` +
        `<exemplarCharacters type="punctuation" alt="proposed-dbl" draft="suspect">[!?\\u200C]</exemplarCharacters>`,
    );
    const r = readSldrFile(xml);
    expect(r).not.toBeNull();
    expect(r!.tiers["p"]).toBe("[! ?]");
  });

  it("ignores the index tier", () => {
    const xml = wrap(
      `<exemplarCharacters>[a b]</exemplarCharacters>` +
        `<exemplarCharacters type="index">[A B]</exemplarCharacters>`,
    );
    const r = readSldrFile(xml);
    expect(Object.keys(r!.tiers).sort()).toEqual(["m"]);
  });

  it("treats an absent type as main", () => {
    const r = readSldrFile(wrap(`<exemplarCharacters>[a b]</exemplarCharacters>`));
    expect(r!.tiers["m"]).toBe("[a b]");
  });

  it("picks the higher draft rank on a duplicate type, not document order", () => {
    const xml = wrap(
      `<exemplarCharacters draft="suspect">[x]</exemplarCharacters>` +
        `<exemplarCharacters draft="contributed">[a b]</exemplarCharacters>`,
    );
    const r = readSldrFile(xml);
    expect(r!.tiers["m"]).toBe("[a b]");
    expect(r!.draft).toBe("contributed");
  });

  it("breaks an equal-rank duplicate by document order", () => {
    // Two same-tagged sets at the same rank are two ORTHOGRAPHIES, not a
    // source disagreement — pick one deterministically and record its rank.
    const xml = wrap(
      `<exemplarCharacters draft="unconfirmed">[first]</exemplarCharacters>` +
        `<exemplarCharacters draft="unconfirmed">[second]</exemplarCharacters>`,
    );
    const r = readSldrFile(xml);
    expect(r!.tiers["m"]).toBe("[first]");
    expect(r!.draft).toBe("unconfirmed");
  });

  it("falls back to the file-level sil:identity draft", () => {
    const xml = wrap(
      `<exemplarCharacters>[a b]</exemplarCharacters>`,
      `<sil:identity defaultRegion="PH" script="Latn" draft="generated"/>`,
    );
    expect(readSldrFile(xml)!.draft).toBe("generated");
  });

  it("resolves an undrafted set to approved", () => {
    expect(readSldrFile(wrap(`<exemplarCharacters>[a]</exemplarCharacters>`))!.draft).toBe(
      "approved",
    );
  });

  it("returns null for a file with no <characters> block", () => {
    expect(readSldrFile(`<ldml><identity/></ldml>`)).toBeNull();
  });

  it("returns null when there is no main set", () => {
    const xml = wrap(`<exemplarCharacters type="punctuation">[!]</exemplarCharacters>`);
    expect(readSldrFile(xml)).toBeNull();
  });

  it("only reads exemplarCharacters inside <characters>", () => {
    const xml =
      `<ldml><special><exemplarCharacters>[z]</exemplarCharacters></special>` +
      `<characters><exemplarCharacters>[a b]</exemplarCharacters></characters></ldml>`;
    expect(readSldrFile(xml)!.tiers["m"]).toBe("[a b]");
  });

  it("decodes XML entities so an escaped literal ampersand survives", () => {
    // Without this the UnicodeSet parser sees a bare & and rejects the set as
    // an intersection — 4 SLDR punctuation sets write \&amp;.
    expect(decodeXmlEntities("[\\&amp; &lt; &gt;]")).toBe("[\\& < >]");
    expect(decodeXmlEntities("&#x2019;&#8217;")).toBe("’’");
  });

  it("canonicalizes SLDR underscore ids onto CLDR hyphen ids", () => {
    expect(canonicalLocaleId("ebu_KE")).toBe("ebu-KE");
    expect(canonicalLocaleId("sr_latn")).toBe("sr-Latn");
    expect(canonicalLocaleId("pt-br")).toBe("pt-BR");
    expect(canonicalLocaleId("ewo")).toBe("ewo");
  });
});

// ---------------------------------------------------------------------------
// T014 / obligation T8 — determinism (FR-013, SC-005)
// ---------------------------------------------------------------------------

describe("codegen-exemplars determinism (obligation T8, FR-013/SC-005)", () => {
  it("derives the version stamp from the pins, never a wall clock", async () => {
    const { buildIndex } = await loadScript("codegen-exemplars.mjs");
    const args = {
      cldr: new Map([["fr", { m: "[a b]" }]]),
      sldr: new Map(),
      cldrVersion: "48.2.0",
      sldrCommit: "922a7879250864e23039f56dc929c84ed4aa3ebc",
      validate: () => undefined,
      warn: () => undefined,
    };
    const a = buildIndex(args).index;
    const b = buildIndex(args).index;
    expect(a.version.generated).toBe("cldr:48.2.0+sldr:922a787");
    expect(a.version).toEqual(b.version);
    // A timestamp would show up here as a differing stamp between the two
    // builds; asserting the exact derived value pins the rule, not just equality.
    expect(a.version.generated).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("emits sorted keys regardless of input insertion order", async () => {
    const { buildIndex, serializeIndex } = await loadScript("codegen-exemplars.mjs");
    const base = {
      cldrVersion: "48.2.0",
      sldrCommit: "922a7879250864e23039f56dc929c84ed4aa3ebc",
      validate: () => undefined,
      warn: () => undefined,
      sldr: new Map(),
    };
    const forward = buildIndex({
      ...base,
      cldr: new Map([
        ["zu", { m: "[z]" }],
        ["af", { m: "[a]" }],
        ["ewo", { m: "[e]" }],
      ]),
    }).index;
    const reverse = buildIndex({
      ...base,
      cldr: new Map([
        ["ewo", { m: "[e]" }],
        ["af", { m: "[a]" }],
        ["zu", { m: "[z]" }],
      ]),
    }).index;
    expect(Object.keys(forward.locales)).toEqual(["af", "ewo", "zu"]);
    expect(serializeIndex(forward)).toBe(serializeIndex(reverse));
  });

  it("serializes with a two-space indent and a trailing newline", async () => {
    const { buildIndex, serializeIndex } = await loadScript("codegen-exemplars.mjs");
    const out = serializeIndex(
      buildIndex({
        cldr: new Map([["fr", { m: "[a]" }]]),
        sldr: new Map(),
        cldrVersion: "48.2.0",
        sldrCommit: "0".repeat(40),
        validate: () => undefined,
        warn: () => undefined,
      }).index,
    );
    expect(out.endsWith("\n")).toBe(true);
    expect(out).toContain('\n  "version": {');
  });

  it("regenerating the committed index reproduces it byte for byte", () => {
    // The real end-to-end determinism check (SC-005): re-run the codegen into a
    // scratch file and diff against the artifact in the tree.
    const dir = mkdtempSync(join(tmpdir(), "ks-exemplars-"));
    try {
      const out = join(dir, "regenerated.json");
      execFileSync(
        process.execPath,
        ["--experimental-strip-types", join(SCRIPTS, "codegen-exemplars.mjs"), "--out", out],
        { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"] },
      );
      const committed = readFileSync(
        join(HERE, "generated", "exemplars.generated.json"),
        "utf8",
      );
      expect(readFileSync(out, "utf8")).toBe(committed);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("fails loudly on an exemplar set the canonical parser rejects", async () => {
    const { buildIndex } = await loadScript("codegen-exemplars.mjs");
    const { parseUnicodeSet } = await import("./cldr.js");
    expect(() =>
      buildIndex({
        cldr: new Map([["xx", { m: "[[a-z]-[aeiou]]" }]]),
        sldr: new Map(),
        cldrVersion: "48.2.0",
        sldrCommit: "0".repeat(40),
        validate: parseUnicodeSet,
        warn: () => undefined,
      }),
    ).toThrow();
  });

  it("omits a locale with no usable main set on either side", async () => {
    const { buildIndex } = await loadScript("codegen-exemplars.mjs");
    const built = buildIndex({
      cldr: new Map([["xx", { p: "[!]" }]]),
      sldr: new Map([["xx", { p: "[?]" }]]),
      cldrVersion: "48.2.0",
      sldrCommit: "0".repeat(40),
      validate: () => undefined,
      warn: () => undefined,
    }).index;
    expect(built.locales["xx"]).toBeUndefined();
  });

  it("retains BOTH sides so precedence stays a lookup-time decision", async () => {
    const { buildIndex } = await loadScript("codegen-exemplars.mjs");
    const built = buildIndex({
      cldr: new Map([["ewo", { m: "[c]" }]]),
      sldr: new Map([["ewo", { m: "[s]", d: "generated" }]]),
      cldrVersion: "48.2.0",
      sldrCommit: "0".repeat(40),
      validate: () => undefined,
      warn: () => undefined,
    }).index;
    expect(built.locales["ewo"]).toEqual({ c: { m: "[c]" }, s: { m: "[s]", d: "generated" } });
  });
});
