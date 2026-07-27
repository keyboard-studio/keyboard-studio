#!/usr/bin/env node
/**
 * Bakes the offline, deterministic, version-pinned exemplar index that the
 * authoring path reads (spec 044, US3).
 *
 * Inputs — both pinned, neither fetched at authoring time:
 *   node_modules/cldr-misc-full/main/<locale>/characters.json   (npm, lockfile-pinned)
 *   packages/engine/data/sldr/sldr/<letter>/<locale>.xml        (scripts/fetch-sldr.mjs)
 *
 * Output:
 *   packages/engine/src/character-discovery/generated/exemplars.generated.json
 *
 * Determinism is a hard requirement (FR-013 / SC-005): regenerating from the
 * same pins must be BYTE-IDENTICAL. That means explicitly sorted keys, no wall
 * clock (`version.generated` is derived from the two pins, not from Date.now),
 * and no reliance on filesystem iteration order.
 *
 * Exemplar strings are stored RAW and UNPARSED — ~5x smaller than an exploded
 * character array, digraph-preserving, and diffable in review when a pin is
 * bumped. Precedence between the two sources is applied at LOOKUP time, not
 * here, so both sides are retained.
 *
 * Usage:
 *   node scripts/codegen-exemplars.mjs
 *   node scripts/codegen-exemplars.mjs --out <path>   (determinism test hook)
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CLDR_PIN = join(HERE, "cldr-version.json");
const SLDR_PIN = join(HERE, "sldr-version.json");
const SLDR_TREE = join(ROOT, "packages", "engine", "data", "sldr", "sldr");
const OUT_DIR = join(ROOT, "packages", "engine", "src", "character-discovery", "generated");
const DEFAULT_OUT = join(OUT_DIR, "exemplars.generated.json");

/** Contract budget — over this, the index gets gitignored + prebuild-generated. */
const SIZE_BUDGET_BYTES = 2 * 1024 * 1024;

/**
 * The four tiers in scope, mapped to their abbreviated index keys. LDML's
 * `index` tier is deliberately absent: it is titlecased and would duplicate
 * the whole alphabet in uppercase.
 */
const TIER_KEY = { main: "m", auxiliary: "a", punctuation: "p", numbers: "n" };

/** cldr-json flattens `<exemplarCharacters type="x">` to a bare `x` key. */
const CLDR_TIER_FIELD = {
  main: "exemplarCharacters",
  auxiliary: "auxiliary",
  punctuation: "punctuation",
  numbers: "numbers",
};

/** SLDR draft ranks, highest confidence first — mirrors engine exemplarTypes.ts. */
const DRAFT_RANK = [
  "approved",
  "contributed",
  "tentative",
  "unconfirmed",
  "provisional",
  "generated",
  "suspect",
];

/**
 * Exemplar sets that are malformed UPSTREAM and are skipped with a [WARN]
 * rather than failing the whole build. Pinned by exact raw text, so the skip
 * disappears the moment upstream fixes the typo — and any OTHER unparseable
 * set is still fatal (see the contract: a malformed set must never yield a
 * partial inventory).
 *
 * Keep this list at zero entries wherever possible; every entry is a known
 * data defect that should be reported upstream.
 */
const KNOWN_MALFORMED = [
  {
    source: "sldr",
    locale: "vut",
    tier: "main",
    // `\0327` is a mistyped `̧` COMBINING CEDILLA.
    marker: "\\0327",
    upstream: "silnrsi/sldr sldr/v/vut.xml",
  },
];

// ---------------------------------------------------------------------------
// Locale-id canonicalization
// ---------------------------------------------------------------------------

/**
 * Canonical locale-directory id: lowercase language, Titlecase script,
 * UPPERCASE region, lowercase variants, hyphen-separated. SLDR names files
 * `ebu_KE.xml`; CLDR names directories `pt-BR`. Both must land on the same key.
 *
 * Variants and private-use (`_x_…`) suffixes are PRESERVED. CLDR ships
 * `be-tarask`, `ca-ES-valencia` and `el-polyton`; SLDR ships 54 alternative
 * orthographies as `<tag>_x_<name>.xml` (and writes the CLDR variants uppercase,
 * `be_TARASK.xml`). Dropping either suffix would collapse each onto its base
 * locale and — because the readers iterate in sorted order — silently overwrite
 * `be`, `ca-ES`, `el` and `noa` with a different orthography's exemplar set.
 * `setUnique` below turns any remaining collision into a build failure.
 *
 * This is the SAME rule the engine's `exemplarLocaleCandidates` applies before
 * probing the index. `exemplarSource.test.ts` asserts every emitted key is
 * self-canonical under that function, so the two cannot drift apart.
 */
export function canonicalLocaleId(raw) {
  const parts = raw
    .trim()
    .replace(/_/g, "-")
    .split("-")
    .filter((p) => p.length > 0);
  if (parts.length === 0) return "";
  const language = parts[0].toLowerCase();
  let script;
  let region;
  const variants = [];
  const privateUse = [];
  let inPrivateUse = false;
  for (const part of parts.slice(1)) {
    if (inPrivateUse) {
      privateUse.push(part.toLowerCase());
    } else if (part.toLowerCase() === "x") {
      inPrivateUse = true;
    } else if (script === undefined && /^[A-Za-z]{4}$/.test(part)) {
      script = part[0].toUpperCase() + part.slice(1).toLowerCase();
    } else if (region === undefined && /^([A-Za-z]{2}|\d{3})$/.test(part)) {
      region = part.toUpperCase();
    } else if (/^([A-Za-z\d]{5,8}|\d[A-Za-z\d]{3})$/.test(part)) {
      variants.push(part.toLowerCase());
    }
  }
  const suffix = privateUse.length === 0 ? [] : ["x", ...privateUse];
  return [language, script, region, ...variants, ...suffix]
    .filter((s) => s !== undefined)
    .join("-");
}

// ---------------------------------------------------------------------------
// CLDR reader (T019)
// ---------------------------------------------------------------------------

/**
 * Reads every `main/<locale>/characters.json` in the pinned cldr-misc-full
 * package, extracting the four tiers as RAW unparsed strings.
 *
 * @returns {Map<string, {m?:string,a?:string,p?:string,n?:string}>}
 */
export function readCldr(cldrMainDir) {
  const out = new Map();
  // Sorted explicitly: readdirSync order is filesystem-dependent, and the
  // emitted key order must not be.
  for (const dir of readdirSync(cldrMainDir).sort()) {
    const file = join(cldrMainDir, dir, "characters.json");
    if (!existsSync(file)) continue;
    const json = JSON.parse(readFileSync(file, "utf8"));
    const localeData = json?.main?.[dir];
    const characters = localeData?.characters;
    if (characters === undefined || characters === null) continue;

    const tiers = {};
    for (const [tier, field] of Object.entries(CLDR_TIER_FIELD)) {
      const raw = characters[field];
      if (typeof raw === "string" && raw.length > 0) tiers[TIER_KEY[tier]] = raw;
    }
    if (tiers.m === undefined) continue; // no usable main set
    setUnique(out, canonicalLocaleId(dir), tiers, "CLDR", dir);
  }
  return out;
}

/**
 * Records `id`, failing loudly if two source locales canonicalize to the same
 * key. A silent overwrite here is how `be-tarask` clobbered `be` before variant
 * subtags were preserved — one locale's alphabet replaced by another's, with no
 * signal anywhere.
 */
function setUnique(map, id, value, sourceLabel, rawId) {
  const existing = map.get(id);
  if (existing !== undefined) {
    throw new Error(
      `${sourceLabel} locale id collision: "${rawId}" canonicalizes to "${id}", ` +
        "which is already taken. Two different orthographies would silently " +
        "overwrite each other — fix canonicalLocaleId before regenerating.",
    );
  }
  map.set(id, value);
}

// ---------------------------------------------------------------------------
// SLDR reader (T018) — normative rules in contracts/exemplar-sourcing.md
// ---------------------------------------------------------------------------

const CHARACTERS_BLOCK_RE = /<characters>([\s\S]*?)<\/characters>/;
const EXEMPLAR_EL_RE = /<exemplarCharacters\b([^>]*)>([\s\S]*?)<\/exemplarCharacters>/g;
const ATTR_RE = /([\w:-]+)\s*=\s*"([^"]*)"/g;
const FILE_DRAFT_RE = /<sil:identity\b[^>]*\bdraft="([^"]*)"/;

const XML_ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

/**
 * Decodes the XML entities that appear in SLDR exemplar bodies. Must run
 * BEFORE UnicodeSet parsing: `\&amp;` is an escaped literal ampersand, and
 * leaving it encoded would make the parser see a bare `&` and reject the set
 * as an intersection.
 */
export function decodeXmlEntities(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => XML_ENTITIES[m]);
}

function parseAttrs(attrText) {
  const attrs = {};
  ATTR_RE.lastIndex = 0;
  let m;
  while ((m = ATTR_RE.exec(attrText)) !== null) attrs[m[1]] = m[2];
  return attrs;
}

/**
 * Reads one SLDR LDML file's exemplar tiers.
 *
 * Normative rules (research R6):
 *  1. Only `<exemplarCharacters>` under `<characters>` is read.
 *  2. Elements carrying `alt` are SKIPPED — they are alternative proposals, not
 *     the locale's set. Without this, `sldr/e/ebk.xml` yields its punctuation
 *     twice. (Across the pinned corpus this alone removes every duplicate.)
 *  3. On a remaining duplicate `type`, the highest `draft` rank wins; ties break
 *     by document order.
 *  4. Absent `type` means `main`; `index` is ignored.
 *  5. File-level `sil:identity/@draft` is the fallback rank for an element that
 *     carries none.
 *
 * A regex/stream extraction rather than an XML parser dependency: the shape
 * read here is two nested elements with three attributes, and the prebuild
 * chain is otherwise dependency-free.
 *
 * @returns {{tiers: object, draft: string}|null}
 */
export function readSldrFile(xml) {
  const block = CHARACTERS_BLOCK_RE.exec(xml);
  if (block === null) return null;

  const fileDraftMatch = FILE_DRAFT_RE.exec(xml);
  const fileDraft = fileDraftMatch === null ? undefined : fileDraftMatch[1];

  /** tierKey -> { raw, rank } */
  const best = new Map();
  EXEMPLAR_EL_RE.lastIndex = 0;
  let m;
  while ((m = EXEMPLAR_EL_RE.exec(block[1])) !== null) {
    const attrs = parseAttrs(m[1]);
    if (attrs.alt !== undefined) continue; // rule 2
    const tier = attrs.type ?? "main"; // rule 4
    if (tier === "index") continue; // rule 4
    const key = TIER_KEY[tier];
    if (key === undefined) continue; // an LDML tier we do not model

    const draft = attrs.draft ?? fileDraft; // rule 5
    const rankIndex = draft === undefined ? 0 : DRAFT_RANK.indexOf(draft);
    const rank = rankIndex === -1 ? 0 : rankIndex;

    const prior = best.get(key);
    // rule 3 — strictly-better wins, so an equal rank keeps document order.
    if (prior === undefined || rank < prior.rank) {
      best.set(key, { raw: decodeXmlEntities(m[2].trim()), rank, draft });
    }
  }

  if (!best.has("m")) return null;

  const tiers = {};
  for (const tierKey of ["m", "a", "p", "n"]) {
    const entry = best.get(tierKey);
    if (entry !== undefined && entry.raw.length > 0) tiers[tierKey] = entry.raw;
  }
  // The locale's draft status is the MAIN set's — that is what a caller's
  // "how confident is this alphabet?" question is actually about.
  const mainEntry = best.get("m");
  const draft = DRAFT_RANK[mainEntry.rank] ?? "approved";
  return { tiers, draft };
}

/** Reads the whole extracted SLDR tree. @returns {Map<string, object>} */
export function readSldr(treeDir) {
  const out = new Map();
  if (!existsSync(treeDir)) return out;
  for (const letter of readdirSync(treeDir).sort()) {
    const letterDir = join(treeDir, letter);
    for (const file of readdirSync(letterDir).sort()) {
      if (!file.endsWith(".xml")) continue;
      const parsed = readSldrFile(readFileSync(join(letterDir, file), "utf8"));
      if (parsed === null) continue;
      const rawId = file.slice(0, -4);
      setUnique(
        out,
        canonicalLocaleId(rawId),
        { ...parsed.tiers, d: parsed.draft },
        "SLDR",
        rawId,
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Emission (T020)
// ---------------------------------------------------------------------------

/**
 * Builds the index object. Pure: same inputs -> same object, and
 * JSON.stringify over explicitly-sorted keys -> same bytes.
 *
 * `validate` is the canonical `parseUnicodeSet`; every stored set must parse
 * through it here so a malformed set fails the BUILD rather than silently
 * yielding a partial inventory at authoring time.
 */
export function buildIndex({ cldr, sldr, cldrVersion, sldrCommit, validate, warn }) {
  const locales = {};
  const allIds = [...new Set([...cldr.keys(), ...sldr.keys()])].sort();

  let skipped = 0;
  for (const id of allIds) {
    const entry = {};
    for (const [side, map] of [
      ["c", cldr],
      ["s", sldr],
    ]) {
      const tiers = map.get(id);
      if (tiers === undefined) continue;
      const kept = {};
      for (const key of ["m", "a", "p", "n"]) {
        const raw = tiers[key];
        if (typeof raw !== "string") continue;
        const known = KNOWN_MALFORMED.find(
          (k) =>
            (k.source === "cldr" ? "c" : "s") === side &&
            k.locale === id &&
            TIER_KEY[k.tier] === key &&
            raw.includes(k.marker),
        );
        if (known !== undefined) {
          warn(
            `skipping malformed ${side === "c" ? "CLDR" : "SLDR"} ${id}/${known.tier} ` +
              `(${known.marker} — upstream defect in ${known.upstream})`,
          );
          skipped++;
          continue;
        }
        // Fails loudly on anything else that will not parse.
        const parsed = validate(raw);
        // CLDR ships a dozen placeholder locales (la, blt, ha-Arab, kcg, …)
        // whose main set is a literal "[]". An empty set is not coverage:
        // storing it would make the CLDR side win precedence over a real SLDR
        // alphabet and hand the caller an inventory with no letters in it.
        if (parsed?.used !== undefined && parsed.used.size === 0) continue;
        kept[key] = raw;
      }
      if (kept.m === undefined) continue; // no usable main set on this side
      if (side === "s" && typeof tiers.d === "string") kept.d = tiers.d;
      entry[side] = kept;
    }
    // A locale with no usable main set in EITHER source is omitted entirely.
    if (entry.c === undefined && entry.s === undefined) continue;
    locales[id] = entry;
  }

  return {
    index: {
      version: {
        cldr: cldrVersion,
        sldrCommit,
        // Input-derived, never a wall clock — a timestamp here would break the
        // byte-identity requirement (SC-005) on every regeneration.
        generated: `cldr:${cldrVersion}+sldr:${sldrCommit.slice(0, 7)}`,
      },
      locales,
    },
    skipped,
  };
}

/**
 * Serializes with sorted keys at every level, two-space indent, trailing
 * newline. JSON.stringify preserves insertion order for string keys, so the
 * sort has to happen on the way in — which buildIndex already does for
 * `locales`; this re-sorts defensively so the guarantee does not depend on
 * a caller.
 */
export function serializeIndex(index) {
  const sortedLocales = {};
  for (const id of Object.keys(index.locales).sort()) sortedLocales[id] = index.locales[id];
  return JSON.stringify({ version: index.version, locales: sortedLocales }, null, 2) + "\n";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf("--out");
  const outFile = outIdx === -1 ? DEFAULT_OUT : resolve(argv[outIdx + 1]);

  const cldrPin = JSON.parse(readFileSync(CLDR_PIN, "utf8"));
  const sldrPin = JSON.parse(readFileSync(SLDR_PIN, "utf8"));

  // The parser is the engine's canonical one — importing the compiled module
  // rather than re-implementing it is the whole point of FR-015.
  const { parseUnicodeSet } = await loadCanonicalParser();

  const require = createRequire(
    pathToFileURL(join(ROOT, "packages", "engine", "package.json")).href,
  );
  const cldrPkgJson = require.resolve("cldr-misc-full/package.json");
  const installedVersion = JSON.parse(readFileSync(cldrPkgJson, "utf8")).version;
  if (installedVersion !== cldrPin.version) {
    fail(
      `installed cldr-misc-full is ${installedVersion} but scripts/cldr-version.json pins ` +
        `${cldrPin.version}. Run pnpm install, or bump the pin deliberately.`,
    );
  }
  const cldrMainDir = join(dirname(cldrPkgJson), "main");

  console.log(`[OK] reading CLDR ${cldrPin.version} from ${rel(cldrMainDir)}`);
  const cldr = readCldr(cldrMainDir);
  console.log(`[OK] ${cldr.size} CLDR locales with a main exemplar set`);

  if (!existsSync(SLDR_TREE)) {
    fail(`${rel(SLDR_TREE)} not found — run \`pnpm run fetch-sldr\` first.`);
  }
  console.log(`[OK] reading SLDR @ ${sldrPin.commit.slice(0, 12)} from ${rel(SLDR_TREE)}`);
  const sldr = readSldr(SLDR_TREE);
  console.log(`[OK] ${sldr.size} SLDR locales with a main exemplar set`);

  let built;
  try {
    built = buildIndex({
      cldr,
      sldr,
      cldrVersion: cldrPin.version,
      sldrCommit: sldrPin.commit,
      validate: parseUnicodeSet,
      warn: (msg) => console.warn(`[WARN] ${msg}`),
    });
  } catch (err) {
    fail(`unparseable exemplar set: ${err.message}`);
  }

  const content = serializeIndex(built.index);
  const bytes = Buffer.byteLength(content, "utf8");
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, content, "utf8");

  const localeCount = Object.keys(built.index.locales).length;
  const both = Object.values(built.index.locales).filter(
    (e) => e.c !== undefined && e.s !== undefined,
  ).length;
  const sldrOnly = Object.values(built.index.locales).filter((e) => e.c === undefined).length;

  console.log(
    `[OK] ${rel(outFile)} — ${localeCount} locales ` +
      `(${both} in both sources, ${sldrOnly} SLDR-only), ${bytes} bytes`,
  );
  if (built.skipped > 0) {
    console.warn(`[WARN] ${built.skipped} upstream-malformed tier(s) skipped (listed above)`);
  }
  if (bytes > SIZE_BUDGET_BYTES) {
    console.warn(
      `[WARN] index is ${bytes} bytes, over the ${SIZE_BUDGET_BYTES}-byte contract budget — ` +
        "gitignore it and regenerate at prebuild, like charnames.generated.json.",
    );
  }
}

/**
 * Loads the engine's canonical `parseUnicodeSet` — the one in
 * `packages/engine/src/character-discovery/cldr.ts`, not a second copy.
 *
 * Imported from SOURCE, via Node's type stripping (the root script passes
 * `--experimental-strip-types`; it is on by default from Node 22.18). Importing
 * the *compiled* module instead would be circular: the engine build consumes
 * this codegen's output, and prebuild runs before any build, so `dist/` does
 * not exist on a clean checkout.
 *
 * This works because `cldr.ts` imports nothing — type stripping erases
 * annotations but does not rewrite module specifiers, so a `.js`-suffixed
 * relative import there would break this loader. Keep it dependency-free.
 */
async function loadCanonicalParser() {
  const source = join(ROOT, "packages", "engine", "src", "character-discovery", "cldr.ts");
  if (!existsSync(source)) fail(`${rel(source)} not found`);
  try {
    return await import(pathToFileURL(source).href);
  } catch (err) {
    fail(
      `could not load the canonical parser from ${rel(source)}: ${err.message}\n` +
        "        This codegen must run under Node type stripping — invoke it via " +
        "`pnpm run codegen-exemplars`, which passes --experimental-strip-types.",
    );
  }
}

function rel(p) {
  return p.startsWith(ROOT) ? p.slice(ROOT.length + 1).replace(/\\/g, "/") : p;
}

function fail(msg) {
  console.error(`[ERROR] ${msg}`);
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
