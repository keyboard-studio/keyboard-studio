/**
 * Captures the PRE-feature CLDR-only seed corpus as a committed regression
 * floor (spec 044 T030 / obligation T12 / SC-006).
 *
 * Pre-feature, the authoring path fetched `<CLDR>/main/<tag>/characters.json`
 * with the tag VERBATIM (no candidate ladder) and produced a seed when the
 * payload carried `exemplarCharacters` and the tag cleared
 * suggestMissing.ts's confidence gate. That is exactly the set reproduced
 * here from the pinned cldr-misc-full package.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(ROOT, "packages/engine/package.json"));
const cldrMain = path.join(path.dirname(require.resolve("cldr-misc-full/package.json")), "main");

const MACRO = new Set(["ms", "zh", "ar", "fa"]);

/** Verbatim port of the pre-feature failsConfidenceGate (suggestMissing.ts). */
function failsConfidenceGate(bcp47) {
  const i = bcp47.indexOf("-");
  const primary = (i === -1 ? bcp47 : bcp47.slice(0, i)).toLowerCase();
  if (primary === "und") return true;
  if (/^[A-Z][a-z]{3}$/.test(bcp47.slice(0, 4)) && primary.length === 4) return true;
  if (/^q[a-t][a-z]$/.test(primary)) return true;
  if (MACRO.has(primary) && bcp47.indexOf("-") === -1) return true;
  return false;
}

const seeded = [];
for (const dir of fs.readdirSync(cldrMain).sort()) {
  const f = path.join(cldrMain, dir, "characters.json");
  if (!fs.existsSync(f)) continue;
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  const chars = j?.main?.[dir]?.characters;
  if (typeof chars?.exemplarCharacters !== "string") continue;
  // A dozen CLDR locales (la, blt, ha-Arab, kcg, …) ship a literal "[]" main
  // set. Pre-feature these produced no usable seed either — suggestMissing's
  // fifth gate ("empty main exemplar set after filtering") rejected them — so
  // they are not part of the regression floor.
  if (/^\s*\[\s*\]\s*$/.test(chars.exemplarCharacters)) continue;
  if (chars.exemplarCharacters.trim().length === 0) continue;
  if (failsConfidenceGate(dir)) continue;
  seeded.push(dir);
}

const out = {
  _comment:
    "Pre-feature (CLDR-only) seed corpus — the regression floor for spec 044 SC-006. " +
    "Each id is a locale that produced a non-fallback seed BEFORE the SLDR work landed: " +
    "a CLDR main/<id>/characters.json carrying exemplarCharacters, whose tag cleared the " +
    "pre-feature confidence gate. No locale here may lose its seed. Regenerate only when " +
    "the CLDR pin is bumped, and review the diff.",
  cldrVersion: JSON.parse(
    fs.readFileSync(require.resolve("cldr-misc-full/package.json"), "utf8"),
  ).version,
  count: seeded.length,
  locales: seeded,
};

const dest = path.join(
  ROOT,
  "packages/engine/src/character-discovery/__fixtures__/cldr-baseline.json",
);
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + "\n", "utf8");
console.log(`[OK] ${dest} — ${seeded.length} locales`);
