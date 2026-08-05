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
//   • target locales, additionally: the values must not have COLLAPSED into
//     the English source. Key-set parity is blind to this, because a Crowdin
//     export of an untranslated project returns source text under every
//     original key — same keys, no translations left. See
//     utilities/i18n-collapse-guard.
//   • target locales, additionally: the values must not have REGRESSED against
//     their own previously-committed state (baseline). Neither of the checks
//     above can see a catalog that kept its keys and went from translated to
//     EMPTY — the shape a Crowdin download produces from a locale with no
//     translations once untranslated strings export as empty rather than
//     source text (#1489). See utilities/i18n-collapse-guard/git-baseline.js.
//
// Fix when it fails:  pnpm --filter @keyboard-studio/studio messages:extract
//
// It also gates KEY ORDER, on every locale: the committed catalogs must be in
// message-id order (see utilities/i18n-catalog-sort for why — it is a merge-
// conflict measure, and that module owns the comparator). Order is deliberately
// NOT part of the drift comparison above, which stays order-independent: drift
// is about which strings exist, order is about how the file merges. They are
// separate failures with separate fixes, so they are reported separately.
// Fix when order fails:  pnpm run i18n-catalog-sort

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { checkEnglishCollapse, checkBaselineRegression } = require("../i18n-collapse-guard/index.js");
const { resolveBaselineRef, readCatalogAtRef } = require("../i18n-collapse-guard/git-baseline.js");
const { checkCatalogDir } = require("../i18n-catalog-sort/index.js");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const STUDIO_DIR = path.join(REPO_ROOT, "packages", "studio");
const COMMITTED_DIR = path.join(STUDIO_DIR, "src", "locales");
const SOURCE_LOCALE = "en";
const CATALOG_FILE = "messages.json";

const problems = [];
// `warnings` means "the English moved, re-run messages:extract" — the print
// block at the bottom prints exactly that remediation. `notes` is a separate
// channel for "the collapse guard could not check this catalog", which is not
// staleness and has no remediation. One array for both would print the extract
// instruction at someone whose only signal needs no action.
const warnings = [];
const notes = [];
// Key order is its own failure channel for the same reason: an unsorted catalog
// is not stale, and `messages:extract` is the wrong instruction to print at it
// (it would work, but it rewrites the whole catalog to fix a pure reordering).
const orderProblems = [];

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

// Key order is read straight off the committed tree, deliberately before (and
// independently of) the fresh extraction: it needs no comparison baseline, so it
// still reports if `lingui extract` is broken or unavailable.
orderProblems.push(...checkCatalogDir(COMMITTED_DIR));

// Resolved once per run (may do a single network fetch) — see
// git-baseline.js. null means no baseline could be found (offline, no origin
// remote, shallow single-commit clone); every per-locale check below degrades
// to a no-op in that case rather than failing the whole lint run over it.
const baselineRef = resolveBaselineRef(REPO_ROOT);
if (!baselineRef) {
  notes.push(
    "[baseline] could not resolve a git ref to compare catalogs against their previous " +
      "committed state (offline / no 'origin' remote / shallow clone) — the regression guard " +
      "did not run this time. No action needed unless this persists in CI.",
  );
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "i18n-catalog-check-"));
let freshLocales = [];
let extractionProducedNothing = false;
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

  // No locale dirs at all means the extraction itself produced nothing — the
  // catalogs are not the problem, the tool is. Bail with that diagnosis rather
  // than falling through and reporting every committed locale as an "orphan",
  // which reads as catalog drift and sends you editing files that are fine.
  // Seen for real: @lingui/cli >= 6.5 guards its extract entry point with
  // `import.meta.main`, which only exists from Node 22.19.0 — on an older Node
  // the CLI exits 0 having written nothing, so execFileSync never throws.
  extractionProducedNothing = freshLocales.length === 0;

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

      // Key-set parity above cannot see a catalog whose keys all survived but
      // whose VALUES were all replaced by English — the exact shape a Crowdin
      // export takes when the project holds no translations for this locale.
      const committedSource = readCatalog(
        path.join(COMMITTED_DIR, SOURCE_LOCALE, CATALOG_FILE),
      );
      if (committedSource !== null) {
        const collapse = checkEnglishCollapse({
          en: committedSource,
          target: committed,
          locale,
          catalog: CATALOG_FILE,
        });
        if (collapse.problem) problems.push(collapse.problem);
        // A catalog too small to check is reported rather than passing silently
        // — see i18n-collapse-guard's "a skip is reported" note. It goes to
        // `notes`, not `warnings`: nothing is stale, so the extract remediation
        // does not apply.
        if (collapse.note) notes.push(collapse.note);
      }

      // Neither key-set parity nor the English-collapse check above can see a
      // catalog that kept its keys and went from translated to EMPTY (#1489) —
      // that needs a comparison against this same locale's own prior state,
      // which committedSource (English) can never provide.
      if (baselineRef) {
        const baseline = readCatalogAtRef(
          baselineRef,
          path.join(COMMITTED_DIR, locale, CATALOG_FILE),
          REPO_ROOT,
        );
        // baseline === null means the file didn't exist at that ref (a
        // brand-new locale) — nothing to regress from, and not worth a note.
        if (baseline !== null) {
          const regression = checkBaselineRegression({
            baseline,
            target: committed,
            locale,
            catalog: CATALOG_FILE,
            baselineLabel: baselineRef,
          });
          if (regression.problem) problems.push(regression.problem);
          if (regression.note) notes.push(regression.note);
        }
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
    if (freshLocales.length > 0 && !freshLocales.includes(locale)) {
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

// Separate header, and no remediation line: a note means a check was declined
// for being unmeasurable, not that anything is out of date. Printing the
// extract instruction here would send someone to fix a non-problem.
if (notes.length > 0) {
  console.warn("[NOTE] i18n-catalog-lint: collapse guard did not cover every catalog.");
  for (const n of notes) console.warn("  - " + n);
}

if (extractionProducedNothing) {
  console.error(
    "[ERROR] i18n-catalog-lint: the fresh extraction produced no catalogs — " +
      "`lingui extract` wrote nothing, so there is nothing to compare against.",
  );
  console.error(
    `  - running node ${process.version}; @lingui/cli requires >= 22.19.0 and ` +
      "exits 0 without writing on older versions.",
  );
  console.error(
    "\nFix: switch to the Node version pinned in .nvmrc, then re-run. Your committed catalogs are probably fine — do not regenerate them on this diagnosis.",
  );
  process.exit(1);
}

if (problems.length > 0) {
  console.error("[ERROR] i18n-catalog-lint: message catalogs are out of sync.");
  for (const p of problems) console.error("  - " + p);
  console.error(
    "\nFix: pnpm --filter @keyboard-studio/studio messages:extract, then commit the updated catalogs.",
  );
}

// Its own block with its own remediation, and reported even when the drift
// checks above already failed — the two are independent, and hiding the order
// failure behind a drift failure would make it reappear on the next run.
if (orderProblems.length > 0) {
  console.error("[ERROR] i18n-catalog-lint: message catalogs are not in message-id order.");
  for (const p of orderProblems) console.error("  - " + p);
  console.error(
    "\nFix: pnpm run i18n-catalog-sort (message-id order keeps concurrent branches out of the same hunk).",
  );
}

if (problems.length > 0 || orderProblems.length > 0) process.exit(1);

console.log("[OK] i18n-catalog-lint: message catalogs are in sync and in message-id order.");
