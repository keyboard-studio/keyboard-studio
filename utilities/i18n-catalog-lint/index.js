#!/usr/bin/env node
// i18n-catalog-lint — the message-catalog drift gate (spec 045 P1, FR-006).
//
// Fails if the committed Lingui catalogs are out of sync with the <Trans>/t()
// calls in the studio source — i.e. someone changed a UI string but did not
// re-run `messages:extract`. This is what recovers the drift signal that stable
// explicit ids would otherwise hide: an edited English source string changes
// the *value* under an unchanged id, and that MUST land in en/messages.json.
//
// Read-only: it extracts a FRESH catalog into a temp dir (via the config's
// LINGUI_CATALOG_CHECK_DIR override) and compares — it never writes to the
// committed catalogs, so it is safe to run locally and inside `pnpm lint`.
//
// Drift definition:
//   • source locale (en): fresh vs committed must be equal (keys AND values,
//     key order ignored) — catches added/removed strings and edited English.
//     Added/removed ids are hard errors — the catalog is structurally missing
//     entries a t()/<Trans> call in source now requires. Edited English under
//     an existing id is only a WARNING: the id and its (now-stale) target
//     translations still exist, so nothing is broken — a translator just
//     needs to catch up, which shouldn't block CI/build.
//   • target locales (fr, …): the KEY SET must match (values legitimately
//     differ — those are translations) — catches strings not propagated.
//
// Fix when it fails:  pnpm --filter @keyboard-studio/studio messages:extract

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const STUDIO_DIR = path.join(REPO_ROOT, "packages", "studio");
const COMMITTED_DIR = path.join(STUDIO_DIR, "src", "locales");
const SOURCE_LOCALE = "en";
const CATALOG_FILE = "messages.json";

const problems = [];
const warnings = [];

function readCatalog(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

// Key-order-independent serialization, so a harmless formatter reordering is
// not mistaken for drift — only real key/value differences count.
function canonical(obj) {
  const out = {};
  for (const k of Object.keys(obj).sort()) out[k] = obj[k];
  return JSON.stringify(out);
}

function keySet(obj) {
  return Object.keys(obj).sort();
}

// Resolve the Lingui CLI's JS entry so we can run it with `node` directly —
// avoids the Windows `.cmd`-shim spawn EINVAL and needs no shell. pnpm may
// hoist the package to the workspace root, so check both locations.
function resolveLinguiBin() {
  const candidates = [
    path.join(STUDIO_DIR, "node_modules", "@lingui", "cli", "dist", "lingui.js"),
    path.join(REPO_ROOT, "node_modules", "@lingui", "cli", "dist", "lingui.js"),
  ];
  const found = candidates.find((c) => fs.existsSync(c));
  if (!found) {
    throw new Error(
      "i18n-catalog-lint: cannot locate @lingui/cli — run `pnpm install`.",
    );
  }
  return found;
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "i18n-catalog-check-"));
let freshLocales = [];
try {
  // Fresh extraction into the temp dir. --overwrite forces source-locale values
  // to match the current messages, so edited English is reflected in en's fresh
  // catalog.
  execFileSync(process.execPath, [resolveLinguiBin(), "extract", "--overwrite"], {
    cwd: STUDIO_DIR,
    stdio: "pipe",
    env: { ...process.env, LINGUI_CATALOG_CHECK_DIR: tmpRoot },
  });

  // The fresh extraction created one dir per configured locale.
  freshLocales = fs
    .readdirSync(tmpRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const locale of freshLocales) {
    const fresh = readCatalog(path.join(tmpRoot, locale, CATALOG_FILE));
    const committed = readCatalog(
      path.join(COMMITTED_DIR, locale, CATALOG_FILE),
    );
    if (fresh === null) continue; // extraction just created it; defensive
    if (committed === null) {
      problems.push(`[${locale}] committed catalog is missing entirely.`);
      continue;
    }

    if (locale === SOURCE_LOCALE) {
      if (canonical(fresh) !== canonical(committed)) {
        const added = keySet(fresh).filter((k) => !(k in committed));
        const removed = keySet(committed).filter((k) => !(k in fresh));
        const changed = keySet(fresh).filter(
          (k) => k in committed && committed[k] !== fresh[k],
        );

        if (added.length || removed.length) {
          problems.push(
            `[${locale}] source catalog out of date` +
              (added.length ? ` — added: ${added.join(", ")}` : "") +
              (removed.length ? ` — removed: ${removed.join(", ")}` : ""),
          );
        }
        if (changed.length) {
          warnings.push(
            `[${locale}] English changed (translations may now be stale, not blocking): ${changed.join(", ")}`,
          );
        }
      }
    } else {
      const missing = keySet(fresh).filter((k) => !(k in committed));
      const extra = keySet(committed).filter((k) => !(k in fresh));
      if (missing.length || extra.length) {
        problems.push(
          `[${locale}] key set out of sync` +
            (missing.length ? ` — missing: ${missing.join(", ")}` : "") +
            (extra.length ? ` — stale/extra: ${extra.join(", ")}` : ""),
        );
      }
    }
  }

  // A committed locale the config no longer produces is an orphan file.
  const committedLocales = fs.existsSync(COMMITTED_DIR)
    ? fs
        .readdirSync(COMMITTED_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
    : [];
  for (const locale of committedLocales) {
    if (!freshLocales.includes(locale)) {
      problems.push(
        `[${locale}] committed catalog is not a configured locale (orphan).`,
      );
    }
  }
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

if (warnings.length > 0) {
  console.warn("[WARN] i18n-catalog-lint: English source text changed under existing ids.");
  for (const w of warnings) console.warn("  - " + w);
  console.warn(
    "\nRun pnpm --filter @keyboard-studio/studio messages:extract to pick these up (not required to pass).",
  );
}

if (problems.length > 0) {
  console.error("[ERROR] i18n-catalog-lint: message catalogs are out of sync.");
  for (const p of problems) console.error("  - " + p);
  console.error(
    "\nFix: pnpm --filter @keyboard-studio/studio messages:extract, then commit the updated catalogs.",
  );
  process.exit(1);
}

console.log("[OK] i18n-catalog-lint: message catalogs are in sync.");
