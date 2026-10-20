// Compile evidence/*/case-result.json into results.json + results.md.
// Status rules (lead-defined, applied mechanically):
//  PASS    — walk reached mechanisms-gallery completion (or empty-diff exit);
//            profile input-order + output-form both selectable and selected;
//            backspace behaviour wanted == the behaviour the chosen form's S4
//            preview shows (on-diagonal cases).
//  FAIL    — walk completed but a profile ask was not exercisable: chiefly
//            off-diagonal backspace (no independent backspace choice exists;
//            S4 preview for the chosen form shows the OTHER behaviour), or a
//            required selection was not offered/selectable.
//  BLOCKED — walk did not reach gallery completion; furthest step recorded.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cases = JSON.parse(readFileSync(path.join(root, "harness/cases.json"), "utf8"));

function furthest(r) {
  if (!r || !r.phases) return "not-attempted";
  const p1 = r.phases["1"], p2 = r.phases["2"], p3 = r.phases["3"];
  if (p3 && (p3.completed || p3.emptyDiff)) return "mechanisms-complete";
  if (p3 && p3.chars && p3.chars.length) return "mechanisms-stuck-at-" + (p3.stuckAt || "?");
  if (p3) return "mechanisms-open";
  if (p2 && p2.rules === "continued") return "rules";
  if (p2 && p2.carve) return "carve";
  if (p2 && p2.sawMarks) return "marks-series";
  if (p2) return "post-alphabet";
  if (p1 && !(p1.errors || []).length) return "alphabet";
  if (p1) return "phase1-failed:" + (p1.failedAt || "?");
  return "open";
}

const rows = [];
for (const c of cases) {
  const f = path.join(root, "evidence", c.id, "case-result.json");
  if (!existsSync(f)) { rows.push({ id: c.id, status: "NOT-ATTEMPTED", furthest: "not-attempted", c }); continue; }
  const r = JSON.parse(readFileSync(f, "utf8"));
  const p1 = r.phases["1"], p2 = r.phases["2"], p3 = r.phases["3"];
  const of = p2 && p2.stations ? p2.stations.find(s => s.station === "output-form") : null;
  const tr = p2 && p2.stations ? p2.stations.find(s => s.station === "treatment") : null;
  const suggChars = p3 && p3.chars ? p3.chars.filter(x => x.suggestion) : [];
  const dispChars = p3 && p3.chars ? p3.chars.filter(x => x.displacement) : [];
  const ev = {
    furthest: furthest(r),
    inputOrderSelected: tr ? tr.selectedOrder : null,
    inputOrderClicked: tr ? tr.inputOrderClicked : null,
    proposalForm: of ? of.proposalForm : null,
    selectedForm: of ? of.selectedForm : null,
    backspacePreviews: of ? of.previews : null,
    independentBackspaceControls: of ? of.otherControls : null,
    convenienceOffered: p2 ? (p2.convenienceOffered || null) : null,
    convenience: p2 ? p2.convenience : null,
    galleryChars: p3 ? (p3.chars || []).length : 0,
    suggestionsSeen: suggChars.length,
    firstRationale: suggChars.length && suggChars[0].rationales && suggChars[0].rationales[0] ? suggChars[0].rationales[0] : (suggChars.length ? suggChars[0].suggestion : null),
    displacements: dispChars.map(x => ({ char: x.char, action: x.displacement.action, text: x.displacement.text })),
    overwrite: p3 ? p3.overwrite : null,
    emptyDiff: p3 ? p3.emptyDiff : null,
    errors: [
      ...((p1 && p1.errors) || []), ...((p2 && p2.errors) || []), ...((p3 && p3.errors) || []),
    ],
  };
  let status, reason = "";
  const walked = ev.furthest === "mechanisms-complete";
  if (!walked) { status = "BLOCKED"; reason = "furthest=" + ev.furthest + (ev.errors.length ? "; errors: " + ev.errors[0] : ""); }
  else if (!c.backspaceOnDiagonal) { status = "FAIL"; reason = "off-diagonal backspace: no independent backspace choice at S4 (otherControls=" + JSON.stringify(ev.independentBackspaceControls) + "); preview for chosen form shows the form-determined behaviour only"; }
  else if (ev.selectedForm !== c.outputForm) { status = "FAIL"; reason = "output form not selected: got " + ev.selectedForm; }
  else if (!ev.inputOrderClicked) { status = "FAIL"; reason = "input order option not clickable"; }
  else { status = "PASS"; }
  rows.push({ id: c.id, status, reason, ev, c });
}

writeFileSync(path.join(root, "results.json"), JSON.stringify(rows.map(({ id, status, reason, ev, c }) => ({ id, profile: c.profile, backspace: c.backspace, base: c.base, lang: c.lang, status, reason, ...ev })), null, 2));

const counts = {};
for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;
let md = "# #2302 Playwright-CLI walk — results\n\n";
md += "Driver: playwright-cli (named session per case) + run-code phase snippets; dev server from ks-2302-walk @ d273b398 (PR #2303 build). ";
md += "Status counts: " + Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(" · ") + " of " + rows.length + ".\n\n";
md += "| Case | Profile | Backspace | Base | Status | Furthest | Evidence |\n|---|---|---|---|---|---|---|\n";
for (const r of rows) {
  md += `| ${r.id} | P${r.c.profile} (${r.c.inputOrder}/${r.c.outputForm === "ready-made" ? "NFC" : "NFD"}) | ${r.c.backspace}${r.c.backspaceOnDiagonal ? "" : " (off-diag)"} | ${r.c.base} | ${r.status} | ${r.ev ? r.ev.furthest : "not-attempted"} | [evidence/${r.id}/](evidence/${r.id}/) |\n`;
}
md += "\nPer-case detail lives in `results.json` and each case's `evidence/<id>/case-result.json` (phase JSON + CLI snapshots + logs).\n";
writeFileSync(path.join(root, "results.md"), md);
console.log(JSON.stringify(counts));
