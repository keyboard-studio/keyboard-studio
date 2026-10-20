// ZIP PASS per-case driver — re-runs ONE #2302 case through playwright-cli
// (named session), phases 1–3 as the matrix walk, then phase 4: Output tab →
// emit-download → zips/<case-id>.zip. This pass is ONLY for the artifact; a
// case's matrix status from results.md stands regardless of the outcome here.
// Evidence lands under evidence-zips/<id>/ (kept off the records evidence/).
// Usage: node run-zip.mjs <case-id>
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync, readdirSync, copyFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cases = JSON.parse(readFileSync(path.join(root, "harness/cases.json"), "utf8"));
const id = process.argv[2];
const C = cases.find(c => c.id === id);
if (!C) { console.error("unknown case " + id); process.exit(2); }
const evDir = path.join(root, "evidence-zips", id);
rmSync(evDir, { recursive: true, force: true });
mkdirSync(evDir, { recursive: true });
mkdirSync(path.join(root, "zips"), { recursive: true });
const zipPath = path.join(root, "zips", id + ".zip");
rmSync(zipPath, { force: true });

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
const result = { case: C, pass: "zip", build: "2698f774 (origin/main)", startedAt: new Date().toISOString(), phases: {} };
const BASE = "http://localhost:" + (process.env.WALK_PORT || "5273") + "/";
console.log("[" + id + "] open " + BASE);
let r = cli(["open", BASE], 120000);
writeFileSync(path.join(evDir, "00-open.log"), r.out);
r = cli(["localstorage-set", "ks.visited", "1"], 60000);
r = cli(["goto", BASE], 120000);
writeFileSync(path.join(evDir, "01-goto.log"), r.out);

for (const phase of [1, 2, 3, 4]) {
  const tpl = readFileSync(path.join(root, "scripts", `phase${phase}.template.js`), "utf8");
  const file = path.join(evDir, `phase${phase}.js`);
  writeFileSync(file, tpl.replaceAll("__PARAMS_JSON__", JSON.stringify(C)).replaceAll("__ZIP_PATH__", zipPath));
  const timeout = phase === 3 ? 1500000 : phase === 4 ? 900000 : 900000;
  console.log("[" + id + "] phase " + phase);
  const rr = cli(["run-code", "--filename=" + file], timeout);
  writeFileSync(path.join(evDir, `phase${phase}.log`), rr.out);
  result.phases[phase] = extractJson(rr.out);
  const snap = cli(["snapshot"], 120000);
  writeFileSync(path.join(evDir, `phase${phase}-snapshot.txt`), snap.out);
  if (!rr.ok) { result.driverNote = "phase " + phase + " cli call failed/timeout"; break; }
  if (phase === 1 && (!result.phases[1] || (result.phases[1].errors || []).length)) break;
  if (phase === 3 && (!result.phases[3] || !(result.phases[3].completed || result.phases[3].emptyDiff))) {
    result.driverNote = "gallery did not complete; download not attempted";
    break;
  }
}
result.finishedAt = new Date().toISOString();
// Harvest BEFORE closing the session: playwright-cli daemons clean their
// session downloads dir on close. Candidates: saveAs target, plus the CLI's
// own auto-saved download under .playwright-cli/<session>/downloads/ in any
// worktree that may host the daemon.
if (!existsSync(zipPath)) {
  const since = Date.parse(result.startedAt) - 10000;
  const bases = [root, path.join(os.homedir(), "workspace/ks-2302-walk/tools/testing-profiles-2302")];
  outer: for (const b of bases) {
    const dl = path.join(b, ".playwright-cli", id, "downloads");
    if (!existsSync(dl)) continue;
    for (const f of readdirSync(dl)) {
      const p = path.join(dl, f);
      if (/\.zip$/i.test(f) && statSync(p).mtimeMs >= since) { copyFileSync(p, zipPath); result.harvestedFrom = p; break outer; }
    }
  }
}
// Verify the artifact: exists, non-trivial size, zip magic PK\x03\x04.
let zip = { saved: false };
if (existsSync(zipPath)) {
  const buf = readFileSync(zipPath);
  const magic = buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
  zip = { saved: magic && buf.length > 1000, sizeBytes: buf.length, magicOk: magic, path: "zips/" + id + ".zip" };
  if (!zip.saved) zip.reason = !magic ? "downloaded file is not a zip (bad magic)" : "zip suspiciously small (" + buf.length + " bytes)";
} else {
  const p4 = result.phases[4];
  zip.reason = !p4 ? "phase 4 not reached" : (p4.errors && p4.errors.length ? p4.errors.join("; ").slice(0, 300) : "no file produced");
}
result.zip = zip;
writeFileSync(path.join(evDir, "zip-result.json"), JSON.stringify(result, null, 2));
cli(["close"], 60000);
console.log("[" + id + "] done zip=" + (zip.saved ? "saved " + zip.sizeBytes + "B" : "MISSING " + zip.reason));
