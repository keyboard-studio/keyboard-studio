// Compile ROUND 2 evidence into results.json + results.md, keeping round-1
// statuses visible alongside (round-1 detail preserved under round1/).
// Round-2 status rules (lead-defined, applied mechanically):
//  PASS    — walk reached mechanisms-gallery completion; input order +
//            output form selected as the case requires; the backspace
//            question rendered at S4; its proposal followed the chosen
//            composition (NFD→peel, NFC→whole-stack); the recorded
//            backspace answer after any override == the case's target and
//            stuck; the station preview matched the backspace answer.
//  FAIL    — walk completed but any of those backspace/profile checks failed.
//  BLOCKED — walk did not reach gallery completion; furthest step recorded.
//            Cases with a harness/round2-overrides.json entry and no round-2
//            evidence are BLOCKED with the override's reason (blocked-by-same).
//  NOT-ATTEMPTED — no round-2 evidence and no override.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cases = JSON.parse(readFileSync(path.join(root, "harness/cases.json"), "utf8"));
const r1 = JSON.parse(readFileSync(path.join(root, "round1/results.json"), "utf8"));
const r1ById = Object.fromEntries(r1.map(r => [r.id, r]));
const overrides = existsSync(path.join(root, "harness/round2-overrides.json"))
  ? JSON.parse(readFileSync(path.join(root, "harness/round2-overrides.json"), "utf8")) : {};

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
  const r1row = r1ById[c.id] || { status: "?", furthest: "?" };
  const f = path.join(root, "evidence", c.id, "case-result.json");
  let r2 = null;
  if (existsSync(f)) {
    const parsed = JSON.parse(readFileSync(f, "utf8"));
    if (parsed.round === 2) r2 = parsed; // round-1 files lack the marker
  }
  if (!r2) {
    const ov = overrides[c.id];
    rows.push({
      id: c.id, profile: c.profile, backspace: c.backspace, base: c.base, lang: c.lang,
      round1: { status: r1row.status, furthest: r1row.furthest },
      round2: ov
        ? { status: "BLOCKED", reason: ov.reason, furthest: ov.furthest || "not-attempted" }
        : { status: "NOT-ATTEMPTED", reason: "", furthest: "not-attempted" },
    });
    continue;
  }
  const p1 = r2.phases["1"], p2 = r2.phases["2"], p3 = r2.phases["3"];
  const of = p2 && p2.stations ? p2.stations.find(s => s.station === "output-form") : null;
  const tr = p2 && p2.stations ? p2.stations.find(s => s.station === "treatment") : null;
  const bk = of ? of.backspace : null;
  const ev = {
    furthest: furthest(r2),
    inputOrderSelected: tr ? tr.selectedOrder : null,
    inputOrderClicked: tr ? tr.inputOrderClicked : null,
    proposalForm: of ? of.proposalForm : null,
    selectedForm: of ? of.selectedForm : null,
    backspace: bk ? {
      present: bk.present, heading: bk.heading, recommended: bk.recommended,
      expectedRecommended: bk.expectedRecommended, proposalFollowsForm: bk.proposalFollowsForm,
      defaultChecked: bk.checkedAfterForm, defaultFollowsProposal: bk.defaultCheckedFollowsProposal,
      target: bk.target, clicked: bk.clicked, checkedAfter: bk.checkedAfter, checkedSticky: bk.checkedSticky,
      previewText: bk.previewText, previewPresses: bk.previewPresses, previewMatchesAnswer: bk.previewMatchesAnswer,
    } : null,
    rulesMentionsBackspace: p2 ? p2.rulesMentionsBackspace : null,
    rulesBkspHits: p2 ? (p2.rulesBkspHits || []) : [],
    galleryChars: p3 ? (p3.chars || []).length : 0,
    overwrite: p3 ? p3.overwrite : null,
    errors: [...((p1 && p1.errors) || []), ...((p2 && p2.errors) || []), ...((p3 && p3.errors) || [])],
  };
  let status, reason = "";
  const walked = ev.furthest === "mechanisms-complete";
  const wantBk = c.backspace === "whole" ? "whole-stack" : "peel";
  if (!walked) {
    status = "BLOCKED";
    reason = "furthest=" + ev.furthest + (ev.errors.length ? "; errors: " + ev.errors[0] : "");
  } else if (!bk || !bk.present) { status = "FAIL"; reason = "backspace question not rendered at S4"; }
  else if (ev.selectedForm !== c.outputForm) { status = "FAIL"; reason = "output form not selected: got " + ev.selectedForm; }
  else if (!ev.inputOrderClicked) { status = "FAIL"; reason = "input order option not clickable"; }
  else if (!bk.proposalFollowsForm) { status = "FAIL"; reason = "backspace proposal did not follow composition: recommended=" + bk.recommended + ", expected " + bk.expectedRecommended + " for " + c.outputForm; }
  else if (bk.checkedAfter !== wantBk || bk.checkedSticky !== wantBk) { status = "FAIL"; reason = "backspace answer did not stick: target=" + wantBk + ", after=" + bk.checkedAfter + ", sticky=" + bk.checkedSticky; }
  else if (bk.previewMatchesAnswer === false) { status = "FAIL"; reason = "preview did not match backspace answer: answer=" + bk.checkedAfter + ", presses=" + bk.previewPresses + ", preview=" + JSON.stringify(bk.previewText); }
  else { status = "PASS"; if (bk.previewMatchesAnswer === null) reason = "preview not observable (no preview pair)"; }
  rows.push({
    id: c.id, profile: c.profile, backspace: c.backspace, base: c.base, lang: c.lang,
    round1: { status: r1row.status, furthest: r1row.furthest },
    round2: { status, reason, ...ev },
  });
}

writeFileSync(path.join(root, "results.json"), JSON.stringify(rows, null, 2));

const counts = {};
for (const r of rows) counts[r.round2.status] = (counts[r.round2.status] || 0) + 1;
let md = "# #2302 Playwright-CLI walk — results\n\n";
md += "Round 2 driver: playwright-cli (named session per case) + run-code phase snippets; dev server from ks-2302-walk2 @ ed251e1b (origin/main, PR #2312 merged — backspace as its own axis). Round 1 ran against ks-2302-walk @ d273b398 (PR #2303 build); round-1 detail is preserved under `round1/` and in git history.\n\n";
md += "Round-2 status counts: " + Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(" · ") + " of " + rows.length + ". (Round 1: PASS 2 · FAIL 0 · BLOCKED 18 · NOT-ATTEMPTED 12.)\n\n";
md += "| Case | Profile | Backspace | Base | Round 1 | Round 2 | Furthest (R2) | Backspace (R2) | Evidence |\n|---|---|---|---|---|---|---|---|---|\n";
for (const r of rows) {
  const b = r.round2.backspace;
  const bkCell = b && b.present
    ? `proposed ${b.recommended}${b.proposalFollowsForm ? " ✓" : " ✗"}, answered ${b.checkedAfter}${b.clicked ? " (override)" : ""}, preview ${b.previewMatchesAnswer === null ? "n/o" : (b.previewMatchesAnswer ? "✓" : "✗")}`
    : (r.round2.status === "NOT-ATTEMPTED" || !b ? "—" : "not rendered");
  const c = cases.find(x => x.id === r.id);
  md += `| ${r.id} | P${r.profile} (${c.inputOrder}/${c.outputForm === "ready-made" ? "NFC" : "NFD"}) | ${r.backspace}${c.backspaceOnDiagonal ? "" : " (off-diag)"} | ${r.base} | ${r.round1.status} | ${r.round2.status} | ${r.round2.furthest} | ${bkCell} | [evidence/${r.id}/](evidence/${r.id}/) |\n`;
}
md += "\nPer-case detail lives in `results.json` and each case's `evidence/<id>/case-result.json` (round 2; phase JSON + CLI snapshots + logs). Round-1 per-case results are under `round1/evidence/`.\n";
writeFileSync(path.join(root, "results.md"), md);
console.log(JSON.stringify(counts));
