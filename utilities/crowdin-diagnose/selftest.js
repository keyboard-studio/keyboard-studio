#!/usr/bin/env node
// Self-test for crowdin-diagnose, against a local mock of the Crowdin API.
//
// WHY THIS EXISTS
// ---------------
// The diagnostic's whole value is naming the RIGHT hypothesis, because the
// candidate fixes are mutually exclusive: seeding the project is correct for H1
// and actively harmful for H2/H3 (it would overwrite real translator work, or
// write English into the root while the translations sit in a branch). A script
// that confidently reports the wrong one is worse than no script.
//
// The real project cannot be used to test that -- the credentials are CI-only,
// and the point of the diagnostic is that nobody has looked at the project yet.
// So this drives the real script end-to-end against a mock API that serves each
// hypothesis in turn, exercising the actual pagination, unwrapping, locale
// matching, and verdict logic rather than re-implementing them.
//
// Plain node, no test framework: this directory has no vitest root and adding
// one would need CI wiring for a utility that runs by hand.
//
//   node utilities/crowdin-diagnose/selftest.js
//
// Exit 0 = every scenario produced its expected verdict.

"use strict";

const http = require("node:http");
const { execFile } = require("node:child_process");
const path = require("node:path");

const SCRIPT = path.join(__dirname, "index.js");

/**
 * Read-only violations, counted at module scope.
 *
 * The mock's request handler runs in a different scope from run()'s `failures`
 * counter, so an earlier version set process.exitCode there and nothing else.
 * The exit code was right, but the final summary still printed "all N scenarios
 * produced the expected verdict" directly beneath the [FAIL] line — a summary
 * contradicting its own output, in a tool whose only job is to be trustworthy
 * when read by hand. Counted here so the summary can never disagree.
 */
let readOnlyViolations = 0;

/** Crowdin's collection envelope: { data: [{ data: row }], pagination }. */
const collection = (rows) => ({
  data: rows.map((r) => ({ data: r })),
  pagination: { offset: 0, limit: 500 },
});
const resource = (obj) => ({ data: obj });

const progressRow = (languageId, total, translated, approved) => ({
  languageId,
  phrases: { total, translated, approved },
  words: { total, translated, approved },
});

/**
 * One scenario = the four endpoint responses the script reads, plus the verdict
 * id it must produce.
 */
const SCENARIOS = [
  {
    name: "H3 branch mismatch — root empty, branch holds the strings",
    expect: "H3_BRANCH_MISMATCH",
    project: { name: "kbs", sourceLanguageId: "en", targetLanguageIds: ["fr"] },
    rootProgress: [progressRow("fr", 1000, 0, 0)],
    branches: [{ id: 42, name: "main" }],
    branchProgress: { 42: [progressRow("fr", 1000, 930, 930)] },
  },
  {
    name: "H1 nothing uploaded — root and branches all empty",
    expect: "H1_NOTHING_UPLOADED",
    project: { name: "kbs", sourceLanguageId: "en", targetLanguageIds: ["fr"] },
    rootProgress: [progressRow("fr", 1000, 0, 0)],
    branches: [],
    branchProgress: {},
  },
  {
    name: "H2 approved-only export — translated >> approved, setting ON",
    expect: "H2_APPROVED_ONLY_EXPORT",
    project: {
      name: "kbs",
      sourceLanguageId: "en",
      targetLanguageIds: ["fr"],
      exportApprovedOnly: true,
    },
    rootProgress: [progressRow("fr", 1000, 930, 0)],
    branches: [],
    branchProgress: {},
  },
  {
    name: "H2 unconfirmed — translated >> approved, setting not exposed",
    expect: "H2_UNAPPROVED_UNCONFIRMED",
    project: { name: "kbs", sourceLanguageId: "en", targetLanguageIds: ["fr"] },
    rootProgress: [progressRow("fr", 1000, 930, 100)],
    branches: [],
    branchProgress: {},
  },
  {
    // The freshly-seeded shape, and the regression this scenario exists for.
    // Seeding leaves auto_approve_imported off, so a healthy just-seeded project
    // reports translated >> approved with approved at zero. That is only a
    // finding if approval gates the export -- here the project says it does not.
    // The unapproved branch above used to fire on `unapproved > 0` alone, so
    // this state reported H2_UNAPPROVED_UNCONFIRMED ("setting could not be
    // read", "Do NOT seed") about a project that had just been seeded
    // correctly and whose setting had in fact been read. Distinguishing null
    // from false is the whole point; a scenario that omits the field cannot
    // catch it, which is why the one above did not.
    name: "H4 healthy — unapproved, but project does not export approved-only",
    expect: "H4_PROJECT_LOOKS_HEALTHY",
    project: {
      name: "kbs",
      sourceLanguageId: "en",
      targetLanguageIds: ["fr"],
      exportApprovedOnly: false,
    },
    rootProgress: [progressRow("fr", 1168, 1104, 0)],
    branches: [],
    branchProgress: {},
  },
  {
    name: "H4 healthy — translated and approved at the root",
    expect: "H4_PROJECT_LOOKS_HEALTHY",
    project: { name: "kbs", sourceLanguageId: "en", targetLanguageIds: ["fr"] },
    rootProgress: [progressRow("fr", 1000, 930, 930)],
    branches: [],
    branchProgress: {},
  },
  {
    name: "locale is not a target language at all",
    expect: "NO_TARGET_LANGUAGE",
    project: { name: "kbs", sourceLanguageId: "en", targetLanguageIds: ["de"] },
    rootProgress: [],
    branches: [],
    branchProgress: {},
  },
  {
    name: "region-qualified target (fr-FR) still answers for fr",
    expect: "H4_PROJECT_LOOKS_HEALTHY",
    project: { name: "kbs", sourceLanguageId: "en", targetLanguageIds: ["fr-FR"] },
    rootProgress: [progressRow("fr-FR", 1000, 930, 930)],
    branches: [],
    branchProgress: {},
  },
];

function serve(scenario) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const p = url.pathname;
    let body;

    if (/^\/api\/v2\/projects\/\d+$/.test(p)) {
      body = resource(scenario.project);
    } else if (/^\/api\/v2\/projects\/\d+\/languages\/progress$/.test(p)) {
      body = collection(scenario.rootProgress);
    } else if (/^\/api\/v2\/projects\/\d+\/branches$/.test(p)) {
      body = collection(scenario.branches);
    } else if (/^\/api\/v2\/projects\/\d+\/branches\/(\d+)\/languages\/progress$/.test(p)) {
      const id = p.match(/branches\/(\d+)\//)[1];
      body = collection(scenario.branchProgress[id] || []);
    } else if (/^\/api\/v2\/projects\/\d+\/files$/.test(p)) {
      body = collection([
        { name: "messages.json", path: "/packages/studio/src/locales/en/messages.json", branchId: null },
      ]);
    } else {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "not mocked: " + p } }));
      return;
    }

    // Assert read-only: any non-GET reaching the mock is a defect in the script.
    if (req.method !== "GET") {
      console.error(`[FAIL] script issued a ${req.method} to ${p} — must be read-only`);
      readOnlyViolations++;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
}

/**
 * Close a mock server without hanging.
 *
 * `server.close(cb)` waits for every open connection to end, and Node's global
 * fetch (undici) keeps its sockets alive after the response — so the callback
 * never fires and the whole self-test stalls with no output. closeAllConnections
 * drops those idle sockets first. The child process is already gone by this
 * point, so nothing in flight is being cut off.
 */
/**
 * Run the diagnostic against the mock, ASYNCHRONOUSLY.
 *
 * execFileSync would deadlock: it blocks this process's event loop, and this
 * process is also the mock HTTP server, so the request could never be answered
 * and the child would hang until killed. Async execFile keeps the loop turning
 * so the server can serve.
 */
function runScript(port) {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [SCRIPT, "--json"],
      {
        encoding: "utf8",
        timeout: 20000,
        env: {
          ...process.env,
          CROWDIN_BASE_URL: `http://127.0.0.1:${port}`,
          CROWDIN_PROJECT_ID: "12345",
          CROWDIN_PERSONAL_TOKEN: "mock-token-not-a-secret",
        },
      },
      (err, stdout, stderr) => {
        if (err) {
          err.stderr = stderr;
          reject(err);
          return;
        }
        resolve(stdout);
      },
    );
  });
}

function shutdown(server) {
  return new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}

async function run() {
  let failures = 0;

  for (const scenario of SCENARIOS) {
    const server = serve(scenario);
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address();

    let out = "";
    try {
      out = await runScript(port);
    } catch (err) {
      // Surface the child's stderr — without it a failure here says only
      // "exited non-zero", which is useless for diagnosing the diagnostic.
      const stderr = (err.stderr || "").toString().trim();
      console.error(`[FAIL] ${scenario.name}`);
      console.error(`         script exited ${err.status}`);
      if (stderr) console.error(stderr.split("\n").map((l) => "         " + l).join("\n"));
      failures++;
      await shutdown(server);
      continue;
    }
    await shutdown(server);

    let got;
    try {
      got = JSON.parse(out).verdict.id;
    } catch {
      console.error(`[FAIL] ${scenario.name}\n  unparseable --json output`);
      failures++;
      continue;
    }

    if (got === scenario.expect) {
      console.log(`[OK]   ${scenario.name}`);
      console.log(`         -> ${got}`);
    } else {
      console.error(`[FAIL] ${scenario.name}`);
      console.error(`         expected ${scenario.expect}, got ${got}`);
      failures++;
    }
  }

  console.log("");
  // Both failure classes gate the summary. A read-only violation is reported on
  // its own line rather than folded into the scenario count, because it means
  // something categorically worse than a wrong verdict: the diagnostic is not
  // read-only, which is the property that makes it safe to hand to someone.
  if (readOnlyViolations > 0) {
    console.error(
      `[ERROR] ${readOnlyViolations} read-only violation(s): the diagnostic issued a ` +
        `non-GET request. It must never be able to mutate the Crowdin project.`,
    );
  }
  if (failures > 0) {
    console.error(`[ERROR] ${failures} of ${SCENARIOS.length} scenarios failed.`);
  }
  if (failures > 0 || readOnlyViolations > 0) return 1;

  console.log(
    `[OK] all ${SCENARIOS.length} scenarios produced the expected verdict, ` +
      `and every request was a GET.`,
  );
  return 0;
}

run().then((code) => process.exit(code));
