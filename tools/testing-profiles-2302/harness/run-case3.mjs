// ROUND 3 per-case driver (round-3 evidence; round-1 files under ../round1/, round-2 under ../round2/). Drives ONE #2302 case through playwright-cli (named session),
// phase by phase, saving raw CLI output + parsed phase JSON under evidence/<id>/.
// Usage: node run-case.mjs <case-id>
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cases = JSON.parse(readFileSync(path.join(root, "harness/cases.json"), "utf8"));
const id = process.argv[2];
const C = cases.find(c => c.id === id);
if (!C) { console.error("unknown case " + id); process.exit(2); }
const evDir = path.join(root, "evidence", id);
rmSync(evDir, { recursive: true, force: true });
mkdirSync(evDir, { recursive: true });

function cli(args, timeoutMs) {
  try {
    const out = execFileSync("npm", ["exec", "-y", "--package=@playwright/cli", "--", "playwright-cli", "-s=" + id, ...args],
      { cwd: root, timeout: timeoutMs, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: (e.stdout || "") + "\n[stderr]\n" + (e.stderr || "") + "\n[driver] " + String(e.message).slice(0, 300) };
  }
}
function extractJson(raw) {
  const i = raw.indexOf("WALKJSON:");
  if (i < 0) return null;
  const tok = raw.slice(i + 9).split(/[\s"\\]/)[0];
  try { return JSON.parse(decodeURIComponent(tok)); } catch { return null; }
}
const result = { case: C, round: 3, build: "2698f774 (origin/main — #2300 + #2312 + #2316, dev promoted)", startedAt: new Date().toISOString(), phases: {} };
const BASE = "http://localhost:" + (process.env.WALK_PORT || "5273") + "/";
console.log("[" + id + "] open " + BASE);
let r = cli(["open", BASE], 120000);
writeFileSync(path.join(evDir, "00-open.log"), r.out);
r = cli(["localstorage-set", "ks.visited", "1"], 60000);
r = cli(["goto", BASE], 120000);
writeFileSync(path.join(evDir, "01-goto.log"), r.out);

for (const phase of [1, 2, 3]) {
  const tpl = readFileSync(path.join(root, "scripts", `phase${phase}.template.js`), "utf8");
  const file = path.join(evDir, `phase${phase}.js`);
  writeFileSync(file, tpl.replace("__PARAMS_JSON__", JSON.stringify(C)));
  const timeout = phase === 3 ? 1500000 : 900000;
  console.log("[" + id + "] phase " + phase);
  const rr = cli(["run-code", "--filename=" + file], timeout);
  writeFileSync(path.join(evDir, `phase${phase}.log`), rr.out);
  result.phases[phase] = extractJson(rr.out);
  const snap = cli(["snapshot"], 120000);
  writeFileSync(path.join(evDir, `phase${phase}-snapshot.txt`), snap.out);
  if (!rr.ok) { result.driverNote = "phase " + phase + " cli call failed/timeout"; break; }
  if (phase === 1 && (!result.phases[1] || (result.phases[1].errors || []).length)) break;
}
result.finishedAt = new Date().toISOString();
writeFileSync(path.join(evDir, "case-result.json"), JSON.stringify(result, null, 2));
cli(["close"], 60000);
console.log("[" + id + "] done");
