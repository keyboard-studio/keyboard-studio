#!/usr/bin/env node
// crowdin-diagnose — read-only answer to "why does the download return English?"
//
// WHY THIS EXISTS
// ---------------
// The scheduled Crowdin download has never once succeeded in producing usable
// translations. It force-pushes a branch whose French catalogs are 100%
// identical to the English source, and the only thing that has stopped it from
// opening a revert PR is an unrelated GitHub permissions error. The collapse
// guard (utilities/i18n-collapse-guard) now blocks that PR at CI, but blocking
// the symptom is not fixing the cause.
//
// The cause cannot be determined from a local checkout: the Crowdin credentials
// exist only as CI secrets, so nobody has ever looked at what the project
// actually contains. This script is the "look at it" step, packaged so that
// whoever holds the credentials can answer the question in one command instead
// of hand-writing API calls.
//
// STRICTLY READ-ONLY
// ------------------
// Every request goes through get() below, which hardcodes GET. There is no
// upload, no mutation, no branch creation, nothing that can alter the project.
// Safe to run against production. That matters because the leading fix
// candidates are mutually exclusive -- seeding when the real cause is a branch
// mismatch would make the mess worse -- so the diagnosis must not itself write.
//
// WHAT IT DISTINGUISHES
// ---------------------
// H1  nothing was ever uploaded            -> seed the project
// H2  translations exist but unapproved,
//     and the export is approved-only      -> Crowdin export setting, or approve
// H3  translations live under a Crowdin
//     BRANCH the download never reads      -> align branch usage, do NOT seed
// H4  translations exist and are approved  -> the project is fine; the download
//                                             config or file mapping is at fault
// H4' translations exist but unapproved,   -> also fine; same downstream fault.
//     and the export does NOT gate on         Distinct id from H4 because the
//     approval                                evidence differs (this is the
//                                             shape a fresh seed produces)
//
// H1 is already FALSIFIED for Tier A: upload run 29940588381 (2026-07-22)
// ran with upload_translations: true and succeeded, logging an accepted
// fr/messages.json. So if this reports H1 anyway, the seed matched nothing --
// which is its own finding, not a reason to re-run the seed.
//
// H3 had live supporting evidence when this script was written: package.json's
// crowdin:upload / crowdin:download both passed `-b main` (a CROWDIN branch, not
// a git branch), while .github/workflows/crowdin-*.yml pass no branch at all and
// therefore address the project root -- two different namespaces. Those flags
// have since been removed, so the split is closed for the paths in this repo.
// H3 stays because the reverse mistake is still reachable (a crowdin_branch_name
// added to a workflow, or a hand-run `-b` flag), and this script reports which
// namespace actually holds the strings either way.
//
// USAGE
// -----
//   CROWDIN_PROJECT_ID=<numeric id> CROWDIN_PERSONAL_TOKEN=<token> \
//     node utilities/crowdin-diagnose/index.js [--json] [--locale fr]
//
// The env var names are deliberately the same two crowdin.yml already declares,
// so the CI secrets work unchanged. A read-only personal token is sufficient.
//
// Exit codes: 0 = the diagnostic ran (whatever the verdict), 2 = it could not
// run (missing credentials, API error). A verdict is never an error exit -- the
// finding is the output, not the status.

"use strict";

const http = require("node:http");
const https = require("node:https");
const { URL } = require("node:url");
const { httpGetRaw } = require("../../scripts/lib/http-get.cjs");

const BASE_URL = process.env.CROWDIN_BASE_URL || "https://api.crowdin.com";
const PROJECT_ID = process.env.CROWDIN_PROJECT_ID;
const TOKEN = process.env.CROWDIN_PERSONAL_TOKEN;

/** Locale to focus on. The repo ships exactly one real target locale today. */
const DEFAULT_LOCALE = "fr";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const localeArg = args.indexOf("--locale");
const LOCALE = localeArg !== -1 ? args[localeArg + 1] : DEFAULT_LOCALE;

/** The catalogs crowdin.yml maps, by their Crowdin-side path. Used to report
 *  where each one lives (root vs branch) rather than guessing. */
const EXPECTED_FILES = [
  "messages.json",
  "criteria.json",
  "flowQuestions.json",
  "patterns.json",
  "adaptationQuestions.json",
];

/**
 * The only request primitive. GET is hardcoded: this script must not be able to
 * mutate the project even by a later editing mistake. It goes through
 * httpGetRaw (scripts/lib/http-get.cjs), whose signature has no `method`
 * field at all -- there is no argument through which a call site here could
 * smuggle a non-GET verb, by accident or otherwise.
 *
 * Uses node:http(s) rather than global fetch deliberately. fetch (undici) holds
 * its sockets open with keep-alive after the response, and on Windows exiting
 * while those handles are live aborts the process with a libuv assertion
 * (`!(handle->flags & UV_HANDLE_CLOSING)`, src\win\async.c) — AFTER the report
 * has already printed, so a correct run looks like a crashed one. An explicit
 * agent with keepAlive:false has no lingering handle and exits cleanly. Caught
 * by selftest.js, which is why it exists.
 */
async function get(pathAndQuery) {
  const url = new URL(`${BASE_URL}/api/v2${pathAndQuery}`);
  const mod = url.protocol === "http:" ? http : https;
  const agent = new mod.Agent({ keepAlive: false });

  let res;
  try {
    res = await httpGetRaw(url.toString(), {
      agent,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: "application/json",
        Connection: "close",
      },
    });
  } catch (err) {
    agent.destroy();
    throw new Error(`GET ${pathAndQuery} -> ${err.message}`);
  }
  agent.destroy();

  if (res.statusCode < 200 || res.statusCode >= 300) {
    // Never echo the token; the path and status are enough to diagnose.
    throw new Error(
      `GET ${pathAndQuery} -> ${res.statusCode} ${res.statusMessage || ""}` +
        (res.body ? ` :: ${res.body.slice(0, 300)}` : ""),
    );
  }
  try {
    return JSON.parse(res.body);
  } catch {
    throw new Error(`GET ${pathAndQuery} -> unparseable JSON response`);
  }
}

/** Crowdin wraps every resource as { data: ... }, and collections as
 *  { data: [{ data: ... }], pagination }. Flatten both shapes. */
function unwrap(payload) {
  const d = payload && payload.data;
  if (Array.isArray(d)) return d.map((row) => (row && row.data !== undefined ? row.data : row));
  return d;
}

/** Walk one page-set of a collection endpoint (500 is the documented max). */
async function getAll(pathBase) {
  const out = [];
  let offset = 0;
  for (;;) {
    const sep = pathBase.includes("?") ? "&" : "?";
    const page = unwrap(await get(`${pathBase}${sep}limit=500&offset=${offset}`));
    if (!Array.isArray(page) || page.length === 0) break;
    out.push(...page);
    if (page.length < 500) break;
    offset += 500;
  }
  return out;
}

/** Progress rows for a locale, keyed by the scope they were read from. */
function pickLocale(rows, locale) {
  if (!Array.isArray(rows)) return null;
  const lower = String(locale).toLowerCase();
  return (
    rows.find((r) => String(r.languageId || "").toLowerCase() === lower) ||
    // A region-qualified target (fr-FR) still answers a query for `fr`.
    rows.find((r) => String(r.languageId || "").toLowerCase().startsWith(lower + "-")) ||
    null
  );
}

function phraseCounts(row) {
  const p = (row && row.phrases) || {};
  return {
    total: p.total ?? 0,
    translated: p.translated ?? 0,
    approved: p.approved ?? 0,
  };
}

/**
 * Which hypothesis the evidence supports. Kept separate from the reporting so
 * the reasoning is inspectable and testable rather than tangled in prints.
 */
function verdict({ localeIsTarget, root, branches, exportApprovedOnly }) {
  if (!localeIsTarget) {
    return {
      id: "NO_TARGET_LANGUAGE",
      headline: `'${LOCALE}' is not a target language of this Crowdin project.`,
      fix:
        `Add ${LOCALE} as a target language in the Crowdin project settings. Until then ` +
        `every download for it necessarily returns source text, because the project has ` +
        `nowhere to store a translation.`,
    };
  }

  const branchesWithStrings = branches.filter((b) => b.counts.translated > 0);
  const rootHas = root.translated > 0;

  if (!rootHas && branchesWithStrings.length > 0) {
    const names = branchesWithStrings.map((b) => `${b.name} (${b.counts.translated})`).join(", ");
    return {
      id: "H3_BRANCH_MISMATCH",
      headline: `Translations exist, but only under Crowdin branch(es): ${names}. The project root has none.`,
      fix:
        `Do NOT seed. The workflows read the project ROOT -- they pass no branch -- so any ` +
        `path that addresses a Crowdin BRANCH instead puts the strings somewhere the ` +
        `automation never looks. Check for a '-b <name>' flag on a local CLI run and for ` +
        `crowdin_branch_name in either workflow, and align the two on one namespace. ` +
        `Seeding now would write English-derived catalogs into the root while the real ` +
        `translations sit in the branch.`,
    };
  }

  if (!rootHas && branchesWithStrings.length === 0) {
    return {
      id: "H1_NOTHING_UPLOADED",
      headline: `The project holds ZERO translated phrases for '${LOCALE}', at the root or in any branch.`,
      fix:
        `Note this CONTRADICTS the successful seed run (29940588381, 2026-07-22, ` +
        `upload_translations: true, log shows fr/messages.json accepted). If the project is ` +
        `genuinely empty, that upload matched no source strings -- e.g. it was uploaded ` +
        `against a different file mapping, or the source file had been replaced so no string ` +
        `ids lined up. Investigate why the upload did not stick BEFORE re-running the seed; ` +
        `a second identical run would fail the same silent way.`,
    };
  }

  const unapproved = root.translated - root.approved;
  if (unapproved > 0 && exportApprovedOnly === true) {
    return {
      id: "H2_APPROVED_ONLY_EXPORT",
      headline:
        `${root.translated} phrases translated but only ${root.approved} approved, and the ` +
        `project exports approved-only.`,
      fix:
        `Do NOT seed -- the translations are real and seeding could overwrite them. Either ` +
        `turn off approved-only export in the Crowdin project settings, or approve the ` +
        `existing strings. The download action does not set export_only_approved (default ` +
        `false), so this is a project-level setting overriding it.`,
    };
  }

  // Only when the setting could not be READ. If the project reported it as
  // false we know approval does not gate the export, so unapproved strings are
  // not a finding at all and this must fall through to H4_UNAPPROVED_BUT_EXPORTS
  // below.
  if (unapproved > 0 && exportApprovedOnly === null) {
    return {
      id: "H2_UNAPPROVED_UNCONFIRMED",
      headline:
        `${root.translated} phrases translated, ${root.approved} approved (${unapproved} ` +
        `unapproved). Project approved-only export setting could not be read.`,
      fix:
        `Do NOT seed. Check "Export only approved translations" in the Crowdin project ` +
        `settings by hand. If it is ON, that explains the all-English download and the fix ` +
        `is that setting (or approving the strings). If it is OFF, this is really ` +
        `H4_UNAPPROVED_BUT_EXPORTS -- the project is fine and the fault is downstream.`,
    };
  }

  // Reaching here with unapproved > 0 means exportApprovedOnly is explicitly
  // false: the strings are translated, they are not approved, and approval is
  // not what the export keys on. Say so rather than printing a bare
  // "N translated and 0 approved", which reads like a problem when it is not --
  // a freshly seeded project sits in exactly this state, because the seeding
  // path leaves auto_approve_imported off on purpose.
  //
  // Distinct id from the terminal H4 below, deliberately, for the same reason
  // H2 is split into H2_APPROVED_ONLY_EXPORT and H2_UNAPPROVED_UNCONFIRMED: one
  // id per distinct evidentiary state, not per conclusion. `id` is this tool's
  // machine contract -- selftest.js asserts on it alone, and --json consumers
  // have nothing else stable to key on -- so collapsing two distinguishable
  // states into one id would discard the distinction for every consumer that
  // does not parse prose.
  if (unapproved > 0) {
    return {
      id: "H4_UNAPPROVED_BUT_EXPORTS",
      headline:
        `${root.translated} phrases translated, ${root.approved} approved (${unapproved} ` +
        `unapproved) -- but the project does NOT export approved-only, so the unapproved ` +
        `ones still export. The project is NOT the problem.`,
      fix:
        `Nothing to fix in the project. If a download still returns source text, the fault ` +
        `is on the download side -- the file mapping in crowdin.yml, the languages_mapping, ` +
        `or skip_untranslated_strings. Compare the file inventory above against crowdin.yml's ` +
        `translation paths.`,
    };
  }

  return {
    id: "H4_PROJECT_LOOKS_HEALTHY",
    headline:
      `${root.translated} phrases translated and ${root.approved} approved at the project ` +
      `root -- the project is NOT the problem.`,
    fix:
      `The fault is on the download side: the file mapping in crowdin.yml, the ` +
      `languages_mapping, or the branch the action reads. Compare the file inventory above ` +
      `against crowdin.yml's translation paths, and check whether the action is reading a ` +
      `branch while these strings sit at the root.`,
  };
}

async function main() {
  if (!PROJECT_ID || !TOKEN) {
    console.error("[ERROR] crowdin-diagnose needs credentials, which are CI-only secrets.");
    console.error("");
    console.error("  CROWDIN_PROJECT_ID=<numeric project id>");
    console.error("  CROWDIN_PERSONAL_TOKEN=<read-only personal token is enough>");
    console.error("");
    console.error("Both names match crowdin.yml, so the existing CI secrets work as-is.");
    console.error("A placeholder value will fail here rather than silently report nonsense.");
    return 2;
  }
  if (!/^\d+$/.test(String(PROJECT_ID))) {
    console.error(
      `[ERROR] CROWDIN_PROJECT_ID must be the NUMERIC project id, got '${PROJECT_ID}'. ` +
        `The URL slug is not the id.`,
    );
    return 2;
  }

  const report = { projectId: Number(PROJECT_ID), locale: LOCALE };

  const project = unwrap(await get(`/projects/${PROJECT_ID}`));
  report.project = {
    name: project.name,
    sourceLanguageId: project.sourceLanguageId,
    targetLanguageIds: project.targetLanguageIds || [],
  };
  // The export-settings field name has varied across Crowdin editions, so read
  // it defensively and report what was actually found rather than assuming.
  const exportKeys = Object.keys(project).filter((k) =>
    /export|approve|untranslated/i.test(k),
  );
  report.exportSettings = Object.fromEntries(exportKeys.map((k) => [k, project[k]]));
  const exportApprovedOnly =
    typeof project.exportApprovedOnly === "boolean" ? project.exportApprovedOnly : null;

  const localeIsTarget = (project.targetLanguageIds || []).some(
    (id) =>
      String(id).toLowerCase() === LOCALE.toLowerCase() ||
      String(id).toLowerCase().startsWith(LOCALE.toLowerCase() + "-"),
  );
  report.localeIsTarget = localeIsTarget;

  // Root-scope progress.
  const rootRows = await getAll(`/projects/${PROJECT_ID}/languages/progress`);
  report.rootProgress = phraseCounts(pickLocale(rootRows, LOCALE));

  // Branch-scope progress -- the H3 discriminator.
  const branchList = await getAll(`/projects/${PROJECT_ID}/branches`);
  report.branches = [];
  for (const b of branchList) {
    let counts = { total: 0, translated: 0, approved: 0 };
    let error = null;
    try {
      const rows = await getAll(`/projects/${PROJECT_ID}/branches/${b.id}/languages/progress`);
      counts = phraseCounts(pickLocale(rows, LOCALE));
    } catch (err) {
      error = err.message;
    }
    report.branches.push({ id: b.id, name: b.name, counts, error });
  }

  // File inventory: which catalogs exist, and at the root or under a branch.
  const files = await getAll(`/projects/${PROJECT_ID}/files?recursion=true`);
  report.files = files.map((f) => ({
    name: f.name,
    path: f.path,
    branchId: f.branchId ?? null,
    expected: EXPECTED_FILES.includes(f.name),
  }));

  report.verdict = verdict({
    localeIsTarget,
    root: report.rootProgress,
    branches: report.branches,
    exportApprovedOnly,
  });

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }

  const L = (s) => console.log(s);
  L(`[CROWDIN] project ${report.projectId} — ${report.project.name || "(unnamed)"}`);
  L(`  source language: ${report.project.sourceLanguageId}`);
  L(`  target languages: ${report.project.targetLanguageIds.join(", ") || "(none)"}`);
  L(`  '${LOCALE}' is a target: ${localeIsTarget ? "[OK] yes" : "[ERROR] no"}`);
  L("");
  L(`[PROGRESS] '${LOCALE}' at the project ROOT (what the workflows read)`);
  L(
    `  phrases: total=${report.rootProgress.total} translated=${report.rootProgress.translated} ` +
      `approved=${report.rootProgress.approved}`,
  );
  L("");
  L(`[BRANCHES] ${report.branches.length} Crowdin branch(es)`);
  if (report.branches.length === 0) {
    L("  (none — every string lives at the project root)");
  }
  for (const b of report.branches) {
    if (b.error) {
      L(`  [WARN] ${b.name} (id ${b.id}): progress unreadable — ${b.error}`);
      continue;
    }
    L(
      `  ${b.name} (id ${b.id}): translated=${b.counts.translated} ` +
        `approved=${b.counts.approved} of ${b.counts.total}`,
    );
  }
  L("");
  L(`[FILES] ${report.files.length} file(s) in the project`);
  for (const f of report.files) {
    const where = f.branchId === null ? "root" : `branch:${f.branchId}`;
    L(`  ${f.expected ? "[OK]      " : "[UNKNOWN] "}${f.path || f.name}  (${where})`);
  }
  const missing = EXPECTED_FILES.filter((n) => !report.files.some((f) => f.name === n));
  if (missing.length) {
    L(`  [WARN] crowdin.yml maps these but the project has no such file: ${missing.join(", ")}`);
  }
  L("");
  L(`[EXPORT SETTINGS] fields matching export/approve/untranslated on the project object`);
  if (Object.keys(report.exportSettings).length === 0) {
    L("  (none exposed by this API/edition — check the setting in the Crowdin UI by hand)");
  }
  for (const [k, v] of Object.entries(report.exportSettings)) {
    L(`  ${k} = ${JSON.stringify(v)}`);
  }
  L("");
  L(`[VERDICT] ${report.verdict.id}`);
  L(`  ${report.verdict.headline}`);
  L("");
  L(`  ${report.verdict.fix}`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`[ERROR] crowdin-diagnose could not complete: ${err.message}`);
    console.error("");
    console.error("Nothing was written — this script only ever issues GET requests.");
    process.exit(2);
  });
