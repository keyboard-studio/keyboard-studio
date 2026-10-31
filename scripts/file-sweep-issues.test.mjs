// Run: node --test scripts/file-sweep-issues.test.mjs
// `gh` is always a stub here; the real CLI is never called.

import assert from "node:assert/strict";
import { test } from "node:test";
import { failureKey, failuresByKey, fileIssues, issueTitle, mergeReports, reproduceCommand } from "./file-sweep-issues.mjs";

const fail = (over = {}) => ({
  caseId: "sweep-kb1-p1-whole",
  base: "kb1",
  profile: 1,
  backspace: "whole",
  status: "failed",
  gate: "G2",
  decisionPoint: "output",
  detail: "boom",
  ...over,
});
const report = (cases, shard = "1of1") => ({ tier: "latin", shard, summary: {}, cases });

function stubGh(listResult) {
  const calls = [];
  const gh = (args) => {
    calls.push(args);
    return args[1] === "list" ? JSON.stringify(listResult) : "";
  };
  return { gh, calls };
}

test("key format", () => {
  assert.equal(failureKey(fail()), "[headless-sweep] kb1 p1-whole G2 @ output");
});

test("merge sorts cases and counts statuses across shards", () => {
  const m = mergeReports([
    report([fail({ caseId: "b" }), { caseId: "c", status: "skipped", skipReason: "missing" }], "2of2"),
    report([{ caseId: "a", status: "ok" }], "1of2"),
  ]);
  assert.deepEqual(m.cases.map((c) => c.caseId), ["a", "b", "c"]);
  assert.deepEqual(m.summary.cases, { completed: 1, skipped: 1, failed: 1 });
  assert.deepEqual(m.summary.byGate, { G2: ["b"] });
  assert.deepEqual(m.shards, ["1of2", "2of2"]);
});

test("known-gap and skipped cases are never filed", () => {
  const m = mergeReports([report([fail({ status: "known-gap", owner: "US6" }), { caseId: "s", status: "skipped", skipReason: "missing" }])]);
  assert.equal(failuresByKey(m).size, 0);
  const { gh, calls } = stubGh([]);
  assert.deepEqual(fileIssues(m, { gh }), []);
  assert.equal(calls.length, 0);
});

test("too-large skips are merged under skips and never filed", () => {
  const big = (caseId) => ({ caseId, status: "skipped", skipReason: "too-large" });
  const m = mergeReports([report([big("sweep-huge-p1-whole"), big("sweep-huge-p1-unwrap")], "1of2"), report([big("sweep-huge2-p1-whole")], "2of2")]);
  assert.deepEqual(m.summary.cases, { completed: 0, skipped: 3, failed: 0 });
  assert.equal(m.summary.skips["too-large"].length, 3);
  assert.equal(failuresByKey(m).size, 0);
  const { gh, calls } = stubGh([]);
  assert.deepEqual(fileIssues(m, { gh }), []);
  assert.equal(calls.length, 0);
});

test("same key across profiles collapses to one filing", () => {
  const m = mergeReports([report([fail(), fail({ caseId: "sweep-kb1-p1-whole-dup" })])]);
  assert.equal(failuresByKey(m).size, 1);
});

test("a new failure files one labelled bug issue with the reproduce command", () => {
  const m = mergeReports([report([fail()])]);
  const { gh, calls } = stubGh([]);
  const res = fileIssues(m, { gh, runUrl: "https://example.test/run/1", date: "2026-01-01" });
  assert.deepEqual(res, [{ key: failureKey(fail()), action: "create" }]);
  const create = calls.find((a) => a[1] === "create");
  assert.ok(create);
  assert.ok(create.includes("headless-sweep"));
  const title = create[create.indexOf("--title") + 1];
  assert.match(title, /^bug\(engine\): /);
  assert.ok(title.includes(failureKey(fail())));
  const body = create[create.indexOf("--body") + 1];
  assert.match(body, /KS_AUTHOR_ONLY=sweep-kb1-p1-whole/);
  assert.match(body, /https:\/\/example.test\/run\/1/);
});

test("a rerun comments on the open issue instead of duplicating", () => {
  const m = mergeReports([report([fail()])]);
  const { gh, calls } = stubGh([{ number: 42, title: `bug(engine): headless sweep [${failureKey(fail())}]` }]);
  const res = fileIssues(m, { gh, runUrl: "u", date: "2026-01-02" });
  assert.deepEqual(res, [{ key: failureKey(fail()), action: "comment", issue: 42 }]);
  assert.equal(calls.filter((a) => a[1] === "create").length, 0);
  assert.equal(calls.find((a) => a[1] === "comment")[2], "42");
});

test("an open issue with a different key does not match", () => {
  const m = mergeReports([report([fail()])]);
  const { gh } = stubGh([{ number: 7, title: "[headless-sweep] kb1 p1-whole G3 @ output" }]);
  assert.equal(fileIssues(m, { gh })[0].action, "create");
});

test("walk failures use the studio area", () => {
  assert.match(issueTitle(fail({ gate: "proposal-threw", decisionPoint: "carve" })), /^bug\(studio\): /);
});

test("an in-progress entry left by a killed shard merges as a hung failure and is filed", () => {
  const hung = { caseId: "sweep-kb1-p1-whole", base: "kb1", profile: 1, backspace: "whole", status: "in-progress", gate: "hung", decisionPoint: "attribution", detail: "killed" };
  const m = mergeReports([report([hung, { caseId: "a", status: "ok" }])]);
  const c = m.cases.find((x) => x.caseId === hung.caseId);
  assert.equal(c.status, "failed");
  assert.equal(c.gate, "hung");
  assert.deepEqual(m.summary.cases, { completed: 1, skipped: 0, failed: 1 });
  assert.deepEqual(m.summary.byGate, { hung: [hung.caseId] });
  assert.deepEqual(m.summary.byFirstFailingStep, { attribution: [hung.caseId] });
  assert.equal(failureKey(c), "[headless-sweep] kb1 p1-whole hung @ attribution");

  const { gh, calls } = stubGh([]);
  const res = fileIssues(m, { gh, runUrl: "u", date: "2026-01-01" });
  assert.deepEqual(res, [{ key: "[headless-sweep] kb1 p1-whole hung @ attribution", action: "create" }]);
  const create = calls.find((a) => a[1] === "create");
  const body = create[create.indexOf("--body") + 1];
  assert.ok(body.includes(reproduceCommand("latin", hung.caseId)));
  assert.match(body, /KS_AUTHOR_TRACE=1/);
});

test("an in-progress entry with no recorded step still keys as hung @ unknown", () => {
  const m = mergeReports([report([{ caseId: "x", base: "kb2", profile: 1, backspace: "whole", status: "in-progress" }])]);
  assert.equal(failureKey(m.cases[0]), "[headless-sweep] kb2 p1-whole hung @ unknown");
});
