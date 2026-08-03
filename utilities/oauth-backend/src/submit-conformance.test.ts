/**
 * SC-006 shared-core conformance suite for FR-001 (identity) and FR-004 (path
 * authority) on the managed-PR submission pipeline.
 *
 * WHAT THIS SUITE GUARANTEES
 * --------------------------
 * "Both deployments (serverless and standalone) pass one shared conformance
 * suite for FR-001 and FR-004, so divergence is detectable by test rather
 * than by review" (spec 054 SC-006). Every other suite in this feature tests
 * one surface at a time: `submit-paths.test.ts` tests the pure path-authority
 * module in isolation; `github-pipeline.test.ts` tests the pipeline's own
 * behaviour (attribution, error mapping, path prefixing) case by case;
 * `api/submit/managed-pr.test.ts` and `server.test.ts` test each HTTP edge's
 * own glue (method guard, config gate, body-schema validation). None of those
 * proves the two DEPLOYMENTS agree with each other -- they each prove one
 * layer is internally correct.
 *
 * This file is the one artifact that proves the two deployments cannot drift
 * apart on FR-001/FR-004, by driving `submitManagedPR` (github-pipeline.ts)
 * directly -- the shared core both HTTP edges call after their own method /
 * config / body-schema handling.
 *
 * WHY DRIVING THE CORE IS SUFFICIENT (D-10)
 * ------------------------------------------
 * Per `contracts/core-api.md`'s "What each HTTP edge is reduced to" table,
 * after this feature neither edge contains any control logic of its own:
 *
 *   | Edge                          | Its remaining job                                    |
 *   |--------------------------------|------------------------------------------------------|
 *   | api/submit/managed-pr.ts       | read the Authorization header, call submitManagedPR, |
 *   |                                | map the result to a Response                          |
 *   | server.ts /submit/managed-pr   | same, via authHeaderOf(req)                           |
 *
 * "Neither edge parses a bearer token, validates a path, derives a prefix, or
 * checks a quota." Because FR-001 (identity gate) and FR-004 (path authority)
 * are BOTH implemented exactly once, inside `submitManagedPR`, exercising
 * that one function with a given input *is* exercising both edges: there is
 * no code path by which one edge could accept what the other rejects, because
 * there is no second implementation to diverge. This is decision D-10 in
 * research.md, and the reason this suite drives the core function directly
 * rather than spinning up two servers and diffing their responses.
 *
 * `method -> config gate -> body schema` happen once PER EDGE, before either
 * edge calls into this shared core (see the "Ordering guarantee" block in
 * `contracts/http-api.md`). Those three steps are edge-local by design (a
 * malformed JSON body or a non-POST method never reaches the core) and are
 * already covered, per edge, by `api/submit/managed-pr.test.ts` and
 * `server.test.ts` (each asserts its own 405 / 503 / 400 invalid_request
 * behaviour). This suite picks the pinned sequence up where the shared core
 * takes over: IDENTITY VERIFICATION -> PATH VALIDATION -> first outbound
 * call (`getInstallationToken()`), and asserts that suffix end to end.
 *
 * WHAT WOULD HAVE TO CHANGE FOR THIS REASONING TO STOP HOLDING
 * --------------------------------------------------------------
 * This suite's guarantee is only as strong as D-10 itself. It would stop
 * holding the moment either HTTP edge grew ITS OWN check instead of
 * delegating to `submitManagedPR` -- e.g. an edge that parsed the bearer
 * token itself to short-circuit before calling the core, or that ran its own
 * path-shape check "as a quick pre-filter" before forwarding to
 * `submitManagedPR`. At that point driving the core alone would no longer
 * prove anything about that edge's actual behaviour, because the edge would
 * have a second, un-exercised copy of the logic this suite is meant to pin.
 * If that ever happens, the fix is not "test the edge separately" but
 * "delete the edge's copy" -- FR-006 requires exactly one implementation, and
 * `contracts/core-api.md`'s closing line makes the violation explicit: "An
 * edge that starts doing any of those has reintroduced the divergence this
 * contract exists to prevent."
 */

import { describe, it, expect } from "vitest";
import {
  submitManagedPR,
  type ManagedPRPipelineConfig,
  type GitHubPipelineFetchResponse,
  type GitHubPipelineFetchFn,
} from "./github-pipeline.js";
import { deriveKeyboardPrefix } from "./submit-paths.js";
import type { ManagedPRBody } from "./managed-pr-schemas.js";
import type { GitHubUser } from "./verify-github-user.js";

// ---------------------------------------------------------------------------
// Shared fixtures
//
// Deliberately self-contained rather than importing github-pipeline.test.ts's
// scaffolding (that file has no exports; this suite needs only a fraction of
// its shape) -- but the shape below (stub fetch keyed by URL/method, call
// count exposed explicitly) mirrors it, per the task briefing, so a reader
// who already knows that file recognizes this one immediately.
// ---------------------------------------------------------------------------

const INSTALLATION_TOKEN = "ghs_CONFORMANCE_INSTALLATION_SECRET_MUST_NOT_LEAK";
const ORG_LOGIN = "keyboard-studio-bot";
const AUTH_HEADER = "Bearer gho_CONFORMANCE_CALLER_TOKEN";
const VERIFIED_USER: GitHubUser = { id: 9001, login: "grace-hopper" };
const NEW_COMMIT_SHA = "deadbeef00000000000000000000000000000000";
const PR_URL = "https://github.com/keymanapp/keyboards/pull/9001";

const VALID_BODY: ManagedPRBody = {
  attribution: { displayName: "Grace Hopper", email: "grace@example.com" },
  keyboardId: "my_keyboard",
  prTitle: "[my_keyboard] Add My Keyboard 1.0",
  prBody: "## Checklist\n- green",
  sourceFiles: [
    { path: "source/my_keyboard.kmn", content: "store(&VERSION) '14.0'" },
    { path: "my_keyboard.kps", content: "<Keyboard/>" },
  ],
};

function res(body: object, ok = true, status = 200): GitHubPipelineFetchResponse {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/**
 * A fetch stub that walks the full happy path (ref -> parent commit -> tree
 * -> commit -> branch -> PR) so a submission that clears both gates actually
 * completes, and records every call so `callCount()` gives the SC-001
 * zero-write assertion something concrete to check -- "zero recorded calls",
 * not "no PR resulted" (the distinction SC-001 itself insists on).
 */
function makeStub(): {
  fetch: GitHubPipelineFetchFn;
  calls: Array<{ url: string; method: string; body?: string }>;
  callCount: () => number;
} {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const fetch: GitHubPipelineFetchFn = async (url, init) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method, ...(init?.body !== undefined ? { body: init.body } : {}) });
    if (url.includes("/git/ref/heads/master")) return res({ object: { sha: "masterSha111" } });
    if (url.includes("/git/commits/masterSha111")) return res({ tree: { sha: "treeShaBase" } });
    if (url.endsWith("/git/trees") && method === "POST") return res({ sha: "newTreeSha" });
    if (url.endsWith("/git/commits") && method === "POST") return res({ sha: NEW_COMMIT_SHA });
    if (url.endsWith("/git/refs") && method === "POST") return res({ ref: "ok" }, true, 201);
    if (url.endsWith("/pulls") && method === "POST") return res({ html_url: PR_URL }, true, 201);
    throw new Error(`unexpected request: ${method} ${url}`);
  };
  return { fetch, calls, callCount: () => calls.length };
}

/** Default identity verifier: resolves VERIFIED_USER for any non-null token. */
function defaultVerifyUser(token: string | null): Promise<GitHubUser | null> {
  return Promise.resolve(token === null ? null : VERIFIED_USER);
}

function makeConfig(
  fetchFn: GitHubPipelineFetchFn,
  verifyUser: (token: string | null) => Promise<GitHubUser | null> = defaultVerifyUser
): ManagedPRPipelineConfig {
  return {
    getInstallationToken: () => Promise.resolve(INSTALLATION_TOKEN),
    orgLogin: ORG_LOGIN,
    fetch: fetchFn,
    verifyUser,
  };
}

// ---------------------------------------------------------------------------
// FR-015 -- nothing leaks
//
// Probes for every category FR-015 names: the submitted path (added per-case
// below), a bearer/installation token, an env-var name, the org login, the
// upstream repo name, an internal file path, and a stack-trace frame marker.
// Modelled on the `staticZodDetail` precedent in server.ts -- a refusal must
// be a static, non-reflective description, never a reflection of anything
// the pipeline touched internally.
// ---------------------------------------------------------------------------

const LEAK_PROBES: readonly string[] = [
  INSTALLATION_TOKEN,
  "gho_CONFORMANCE_CALLER_TOKEN",
  ORG_LOGIN,
  "GITHUB_APP_ID",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_APP_INSTALLATION_ID",
  "keyboards", // UPSTREAM_REPO (github-pipeline.ts) -- keyboardId "my_keyboard" never matches this exactly
  "utilities/oauth-backend/src/github-pipeline.ts",
  "    at ", // a typical stack-trace frame indent
];

function assertNoLeak(result: unknown, extraProbes: readonly string[] = []): void {
  const serialized = JSON.stringify(result);
  // An empty-string probe (the "empty path" corpus case) would trivially
  // "leak" into any string, so it is excluded rather than asserted -- the
  // empty path is itself never a secret.
  for (const probe of [...LEAK_PROBES, ...extraProbes].filter((p) => p !== "")) {
    expect(serialized, `refusal response leaked probe "${probe}"`).not.toContain(probe);
  }
}

// ---------------------------------------------------------------------------
// FR-001 -- identity refusal corpus
//
// Every way a caller can fail to present a verified identity. The last case
// (verifier throws) is the one that matters most: it pins fail-closed so a
// refactor of the try/catch in submitManagedPR cannot silently turn the gate
// fail-open (research D-2).
// ---------------------------------------------------------------------------

interface IdentityRefusalCase {
  name: string;
  authHeader: string | null | undefined;
  verifyUser: (token: string | null) => Promise<GitHubUser | null>;
}

const IDENTITY_REFUSAL_CASES: IdentityRefusalCase[] = [
  { name: "no Authorization header at all (null)", authHeader: null, verifyUser: defaultVerifyUser },
  { name: "no Authorization header at all (undefined)", authHeader: undefined, verifyUser: defaultVerifyUser },
  { name: "malformed header -- wrong scheme", authHeader: "Basic abc", verifyUser: defaultVerifyUser },
  { name: "malformed header -- Bearer with no token", authHeader: "Bearer", verifyUser: defaultVerifyUser },
  {
    name: "a token the verifier rejects (verifyUser resolves null)",
    authHeader: AUTH_HEADER,
    verifyUser: () => Promise.resolve(null),
  },
  {
    name: "the identity provider is unreachable -- verifyUser throws (fail closed, D-2)",
    authHeader: AUTH_HEADER,
    verifyUser: () => Promise.reject(new Error("ECONNREFUSED: identity provider unreachable")),
  },
];

describe("SC-006 conformance -- FR-001 identity refusal corpus", () => {
  it.each(IDENTITY_REFUSAL_CASES)(
    "refuses with 401 unauthorized, zero outbound calls, getInstallationToken never invoked, and no leak: $name",
    async ({ authHeader, verifyUser }) => {
      const { fetch, callCount } = makeStub();
      let installationTokenCalled = false;
      const config: ManagedPRPipelineConfig = {
        getInstallationToken: () => {
          installationTokenCalled = true;
          return Promise.resolve(INSTALLATION_TOKEN);
        },
        orgLogin: ORG_LOGIN,
        fetch,
        verifyUser,
      };

      const result = await submitManagedPR(authHeader, VALID_BODY, config);

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.status).toBe(401);
      expect(result.error).toBe("unauthorized");

      // SC-001: recorded call count, not "no PR resulted".
      expect(callCount()).toBe(0);
      // The strongest form: getInstallationToken() is itself the first
      // outbound call, so a spy catches a reordering a status code alone
      // would miss.
      expect(installationTokenCalled).toBe(false);

      // FR-015: a static refusal, nothing reflected back.
      expect(Object.keys(result).sort()).toEqual(["error", "ok", "status"]);
      assertNoLeak(result);
    }
  );
});

// ---------------------------------------------------------------------------
// FR-004 -- the full path corpus, driven through submitManagedPR end to end
//
// SC-002: "100% of submitted paths outside the permitted set are rejected,
// measured against a test corpus covering absolute paths, traversal, and
// metadata paths." Driven through the whole pipeline (not the pure
// submit-paths.ts module directly, which submit-paths.test.ts already
// covers) so this suite proves the pipeline actually calls the validator
// with every submission, not merely that the validator is correct in
// isolation.
// ---------------------------------------------------------------------------

interface PathRejectionCase {
  category: "absolute" | "traversal" | "metadata" | "malformed";
  name: string;
  path: string;
}

function buildOverLimitPath(): string {
  // Mirrors submit-paths.test.ts's "over the limit once prefixed" fixture:
  // a path whose length, once the my_keyboard prefix is added back, lands
  // one character past the 512 ceiling -- states the intent from
  // deriveKeyboardPrefix rather than a hardcoded magic-number path.
  const prefixLength = deriveKeyboardPrefix(VALID_BODY.keyboardId).length;
  const prefix = "source/";
  const suffix = ".kmn";
  const fillerLength = 512 - prefixLength - prefix.length - suffix.length;
  return `${prefix}${"a".repeat(fillerLength + 1)}${suffix}`;
}

const PATH_REJECTION_CASES: PathRejectionCase[] = [
  { category: "absolute", name: "leading slash", path: "/etc/passwd" },
  { category: "absolute", name: "Windows drive letter first segment", path: "C:/Windows/system32/x.kmn" },
  { category: "traversal", name: "parent-directory segment", path: "../escape.txt" },
  { category: "metadata", name: "release/ first segment", path: "release/evil.kmn" },
  { category: "metadata", name: ".github/ first segment", path: ".github/workflows/x.yml" },
  { category: "metadata", name: ".git/ first segment", path: ".git/config" },
  { category: "malformed", name: "empty path", path: "" },
  { category: "malformed", name: "backslash separator", path: "source\\my_keyboard.kmn" },
  { category: "malformed", name: "double slash (empty interior segment)", path: "source//my_keyboard.kmn" },
  { category: "malformed", name: "trailing slash (empty final segment)", path: "source/" },
  { category: "malformed", name: "dot segment", path: "source/./my_keyboard.kmn" },
  { category: "malformed", name: "over 512 chars once prefixed", path: buildOverLimitPath() },
];

describe("SC-006 conformance -- FR-004 path corpus, end to end through submitManagedPR", () => {
  it.each(PATH_REJECTION_CASES)(
    "rejects $category ($name) with 400 invalid_path, zero outbound calls, getInstallationToken never invoked, and no leak",
    async ({ category, path }) => {
      const { fetch, callCount } = makeStub();
      let installationTokenCalled = false;
      const config: ManagedPRPipelineConfig = {
        getInstallationToken: () => {
          installationTokenCalled = true;
          return Promise.resolve(INSTALLATION_TOKEN);
        },
        orgLogin: ORG_LOGIN,
        fetch,
        verifyUser: defaultVerifyUser,
      };
      const body: ManagedPRBody = { ...VALID_BODY, sourceFiles: [{ path, content: "x" }] };

      const result = await submitManagedPR(AUTH_HEADER, body, config);

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.status).toBe(400);
      expect(result.error).toBe("invalid_path");
      expect((result as { category?: string }).category).toBe(category);

      // SC-001: recorded call count, not "no PR resulted".
      expect(callCount()).toBe(0);
      expect(installationTokenCalled).toBe(false);

      // FR-015 / US2 AC4: a static category, never the offending path.
      expect(Object.keys(result).sort()).toEqual(["category", "error", "ok", "status"]);
      assertNoLeak(result, [path]);
    }
  );
});

// ---------------------------------------------------------------------------
// Ordering guarantee (contracts/http-api.md's "Ordering guarantee" block)
//
//   method -> config -> schema -> IDENTITY -> PATH -> first outbound call
//
// method/config/schema are edge-local (see the docblock above) and are
// exercised by api/submit/managed-pr.test.ts and server.test.ts. What
// remains provable by driving the core alone is the suffix: identity runs
// before path, and both complete before getInstallationToken() -- the first
// outbound call. Both FR-001 and FR-004 blocks above already assert the
// "before getInstallationToken" half per case; the two tests below assert
// the "identity before path" half and supply a positive control so the spy
// used throughout this file is proven to actually observe a real call, not
// merely to never fire because it is wired wrong.
// ---------------------------------------------------------------------------

describe("SC-006 conformance -- ordering guarantee", () => {
  it("refuses 401 (not 400) when the request is BOTH unauthenticated AND carrying a path that would also fail validation -- identity runs strictly first", async () => {
    const { fetch, callCount } = makeStub();
    let installationTokenCalled = false;
    const config: ManagedPRPipelineConfig = {
      getInstallationToken: () => {
        installationTokenCalled = true;
        return Promise.resolve(INSTALLATION_TOKEN);
      },
      orgLogin: ORG_LOGIN,
      fetch,
      verifyUser: () => Promise.resolve(null),
    };
    const body: ManagedPRBody = { ...VALID_BODY, sourceFiles: [{ path: "/etc/passwd", content: "x" }] };

    const result = await submitManagedPR(null, body, config);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    // Had path validation run first (or concurrently and won), this would be
    // 400 invalid_path -- it must be 401, proving identity is checked first.
    expect(result.status).toBe(401);
    expect(result.error).toBe("unauthorized");
    expect(callCount()).toBe(0);
    expect(installationTokenCalled).toBe(false);
  });

  it("positive control: getInstallationToken IS called exactly once when identity and path both succeed, proving the spy used throughout this suite actually observes a real call", async () => {
    const { fetch } = makeStub();
    let installationTokenCallCount = 0;
    const config: ManagedPRPipelineConfig = {
      getInstallationToken: () => {
        installationTokenCallCount += 1;
        return Promise.resolve(INSTALLATION_TOKEN);
      },
      orgLogin: ORG_LOGIN,
      fetch,
      verifyUser: defaultVerifyUser,
    };

    const result = await submitManagedPR(AUTH_HEADER, VALID_BODY, config);

    expect(result.ok).toBe(true);
    expect(installationTokenCallCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// FR-016 -- the client-side isSourceFile filter and the server validator must
// not disagree on any real scaffolder output (US2 AC5).
//
// IMPORT NOTE (per the task briefing -- investigated, not assumed):
//
// `isSourceFile` lives at packages/engine/src/output/github.ts:79. A
// conventional package-name import (`@keyboard-studio/engine`) does NOT
// resolve from this package: oauth-backend/package.json declares no
// dependency on `@keyboard-studio/engine` (only `@keyboard-studio/contracts`
// is listed), and pnpm's strict, non-hoisting linking means
// `node_modules/@keyboard-studio/` here contains only `contracts` --
// confirmed by inspection, not assumed.
//
// A relative-path reach-through (e.g.
// `../../../packages/engine/src/output/github.js`) WAS tried as a probe and
// does transpile and resolve under vitest's esbuild transform -- Vite/vitest
// resolves a relative specifier straight off disk with no awareness of
// package boundaries. That path is deliberately NOT taken here: it is
// exactly the kind of undeclared, unreviewed cross-package edge the "do not
// bend the build" instruction rules out. oauth-backend is deliberately
// dependency-free of packages/engine (it must stay independently
// deployable), dependency-cruiser's boundary rules are scoped to
// `packages/*/src` only (see .dependency-cruiser.cjs's `depcruise` script
// target) and would never see or gate an edge reaching out of that tree from
// utilities/, and this package's own tsconfig.json excludes `*.test.ts` from
// its program, so tsc would never type-check the import either. Nothing in
// the build would catch that edge drifting if it were taken.
//
// Copying `isSourceFile`'s logic into this test was also rejected per the
// task briefing: a copy would keep passing after the real filter changed,
// which defeats the point of a conformance check.
//
// THE HONEST ROUTE TAKEN INSTEAD: the exact §12 corpus is reproduced here
// verbatim from packages/engine/src/scaffolder/scaffolder.test.ts's
// "generates all required §12 paths" case (the same corpus
// submit-paths.test.ts's SCAFFOLDER_ACCEPT_PATHS already keeps a synced copy
// of, for the identical reason -- submit-paths.ts is pure and imports
// nothing outside this package either). Rather than execute or duplicate
// `isSourceFile`, this suite states -- and cites -- why the full corpus
// already equals what `isSourceFile` would return, with no filtering step
// needed: `isSourceFile`'s only two exclusions are a compiled-extension
// check (`.kmx`, `.kvk`, `.js` -- github.ts:63) and the import-sidecar
// predicate (`.kmn.imported` / `.kmn.imported.sha256` suffixes, or a
// `.studio/` prefix -- sidecar.ts:44-50). None of the twelve §12 paths below
// carry any of those five markers, which is checked directly below rather
// than asserted only in prose, so a future §12 path that DID need filtering
// would fail this test's own assertion rather than silently agree.
// ---------------------------------------------------------------------------

const SCAFFOLDER_REQUIRED_PATHS = [
  "source/my_keyboard.kmn",
  "source/my_keyboard.kps",
  "source/my_keyboard.kvks",
  "source/my_keyboard.keyman-touch-layout",
  "source/my_keyboard.ico",
  "source/welcome.htm",
  "source/readme.htm",
  "source/help/my_keyboard.php",
  "LICENSE.md",
  "HISTORY.md",
  "README.md",
  "tests/my_keyboard_tests.kmn",
];

/** isSourceFile's compiled-artifact exclusion set (github.ts:63). Cited, not imported. */
const COMPILED_EXT = new Set([".kmx", ".kvk", ".js"]);
/** isSourceFile's sidecar exclusion markers (sidecar.ts:44-50). Cited, not imported. */
const SIDECAR_SUFFIXES = [".kmn.imported", ".kmn.imported.sha256"];
const SIDECAR_PREFIX = ".studio/";

describe("SC-006 conformance -- FR-016 client/server filter agreement (US2 AC5)", () => {
  it("none of the scaffolder's §12 output paths would be excluded by isSourceFile's own two rules -- the survivor set is the full corpus", () => {
    for (const path of SCAFFOLDER_REQUIRED_PATHS) {
      const dot = path.lastIndexOf(".");
      const ext = dot === -1 ? "" : path.slice(dot);
      expect(COMPILED_EXT.has(ext), `${path} would be excluded as a compiled artifact`).toBe(false);
      expect(path.startsWith(SIDECAR_PREFIX), `${path} would be excluded as studio metadata`).toBe(false);
      for (const suffix of SIDECAR_SUFFIXES) {
        expect(path.endsWith(suffix), `${path} would be excluded as an import sidecar`).toBe(false);
      }
    }
  });

  it("a studio-produced submission built from the full §12 corpus is accepted, and every committed tree entry is the submitted path with release/<firstLetter>/<id>/ prepended -- same files, same contents, correctly located (SC-003)", async () => {
    const submittedFiles = SCAFFOLDER_REQUIRED_PATHS.map((path) => ({
      path,
      content: `content of ${path}`,
    }));
    const body: ManagedPRBody = { ...VALID_BODY, sourceFiles: submittedFiles };
    const { fetch, calls } = makeStub();

    const result = await submitManagedPR(AUTH_HEADER, body, makeConfig(fetch));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    const treeCall = calls.find((c) => c.url.endsWith("/git/trees") && c.method === "POST");
    expect(treeCall).toBeDefined();
    const parsed = JSON.parse(treeCall!.body!) as {
      tree: Array<{ path: string; content: string }>;
    };

    // Same files, in the same order, each correctly relocated.
    expect(parsed.tree.map((entry) => entry.path)).toEqual(
      submittedFiles.map((f) => `release/m/my_keyboard/${f.path}`)
    );
    // Same contents -- nothing was rewritten in transit.
    for (const [i, entry] of parsed.tree.entries()) {
      expect(entry.content).toBe(submittedFiles[i]!.content);
    }
  });
});
