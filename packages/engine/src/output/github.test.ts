import { describe, it, expect } from "vitest";
import { verifyToken, publishPR, type GitHubFetchFn, type GitHubFetchResponse } from "./github.js";
import type { PublishPROptions, VirtualFS, VirtualFSEntry } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Minimal VirtualFS (same helper as zip.test.ts, inline for isolation)
// ---------------------------------------------------------------------------

function makeVirtualFS(entries: VirtualFSEntry[]): VirtualFS {
  const store = new Map<string, VirtualFSEntry>(entries.map((e) => [e.path, e]));
  return {
    get: (path) => store.get(path),
    set: (path, content, isBinary = false) => {
      const prev = store.get(path);
      store.set(path, { path, content, isBinary });
      return prev;
    },
    delete: (path) => store.delete(path),
    list: (prefix) =>
      [...store.keys()].filter((p) => prefix === undefined || p.startsWith(prefix)),
    entries: (prefix) =>
      [...store.values()].filter(
        (e) => prefix === undefined || e.path.startsWith(prefix)
      ),
  };
}

// ---------------------------------------------------------------------------
// Mock fetch builder
// ---------------------------------------------------------------------------

type ResponseSpec =
  | { ok: true; status?: number; body: unknown; headers?: Record<string, string> }
  | { ok: false; status: number; body?: unknown; headers?: Record<string, string> };

function makeResponse(spec: ResponseSpec): GitHubFetchResponse {
  const headers: Record<string, string> = spec.headers ?? {};
  return {
    ok: spec.ok,
    status: spec.status ?? (spec.ok ? 200 : 400),
    statusText: spec.ok ? "OK" : "Error",
    headers: { get: (name) => headers[name] ?? null },
    json: async () => spec.body ?? {},
    text: async () => JSON.stringify(spec.body ?? {}),
  };
}

/** Build a mock fetch that routes by URL+method to pre-canned responses. */
function buildMockFetch(
  routes: Map<string, ResponseSpec>
): GitHubFetchFn {
  return async (url, init) => {
    const method = init?.method ?? "GET";
    const key = `${method} ${url}`;
    const wildcardKey = `${method} ${url.replace(/\/[a-f0-9]{40}$/, "/{sha}")}`;
    const spec = routes.get(key) ?? routes.get(wildcardKey);
    if (spec === undefined) {
      return makeResponse({ ok: false, status: 404, body: { message: `No mock for: ${key}` } });
    }
    return makeResponse(spec);
  };
}

// ---------------------------------------------------------------------------
// Shared fixture data
// ---------------------------------------------------------------------------

const FORK_OWNER = "testuser";
const MASTER_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const BASE_TREE_SHA = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const NEW_TREE_SHA = "cccccccccccccccccccccccccccccccccccccccc";
const NEW_COMMIT_SHA = "dddddddddddddddddddddddddddddddddddddddd";
const PR_URL = "https://github.com/keymanapp/keyboards/pull/999";
const BRANCH = "add/test_keyboard";

const API = "https://api.github.com";

function happyPathRoutes(): Map<string, ResponseSpec> {
  return new Map([
    // verifyToken
    [`GET ${API}/user`, { ok: true, body: { login: FORK_OWNER }, headers: { "X-OAuth-Scopes": "public_repo" } }],
    // fork check — exists
    [`GET ${API}/repos/${FORK_OWNER}/keyboards`, { ok: true, body: { fork: true } }],
    // master ref
    [`GET ${API}/repos/${FORK_OWNER}/keyboards/git/ref/heads/master`, { ok: true, body: { object: { sha: MASTER_SHA } } }],
    // parent commit
    [`GET ${API}/repos/${FORK_OWNER}/keyboards/git/commits/${MASTER_SHA}`, { ok: true, body: { tree: { sha: BASE_TREE_SHA } } }],
    // new tree
    [`POST ${API}/repos/${FORK_OWNER}/keyboards/git/trees`, { ok: true, status: 201, body: { sha: NEW_TREE_SHA } }],
    // new commit
    [`POST ${API}/repos/${FORK_OWNER}/keyboards/git/commits`, { ok: true, status: 201, body: { sha: NEW_COMMIT_SHA } }],
    // create branch ref
    [`POST ${API}/repos/${FORK_OWNER}/keyboards/git/refs`, { ok: true, status: 201, body: { ref: `refs/heads/${BRANCH}` } }],
    // create draft PR
    [`POST ${API}/repos/keymanapp/keyboards/pulls`, { ok: true, status: 201, body: { html_url: PR_URL } }],
  ]);
}

function makeOpts(overrides: Partial<PublishPROptions> = {}): PublishPROptions {
  return {
    token: "ghp_test",
    forkOwner: FORK_OWNER,
    branchName: BRANCH,
    commitMessage: "feat(base-browser): add test_keyboard 1.0",
    prTitle: "Add Test Keyboard 1.0",
    prBody: "## Summary\n- New keyboard\n",
    ...overrides,
  };
}

function makeSourceFS(): VirtualFS {
  return makeVirtualFS([
    { path: "source/test.kmn", content: "c version(10.0)\n", isBinary: false },
    { path: "source/test.kps", content: "<Package/>", isBinary: false },
    // compiled artifacts — must be excluded from the PR
    { path: "build/test.kmx", content: new Uint8Array([1, 2, 3]), isBinary: true },
    { path: "build/test.js", content: "// compiled", isBinary: false },
  ]);
}

// ---------------------------------------------------------------------------
// verifyToken tests
// ---------------------------------------------------------------------------

describe("verifyToken", () => {
  it("returns ok:true with login when token has public_repo scope", async () => {
    const fetch = buildMockFetch(new Map([
      [`GET ${API}/user`, { ok: true, body: { login: "alice" }, headers: { "X-OAuth-Scopes": "public_repo, user" } }],
    ]));
    const result = await verifyToken("token", fetch);
    expect(result.ok).toBe(true);
    expect(result.login).toBe("alice");
    expect(result.scopes).toContain("public_repo");
    expect(result.missingScopes).toHaveLength(0);
  });

  it("accepts 'repo' scope as a superset of public_repo", async () => {
    const fetch = buildMockFetch(new Map([
      [`GET ${API}/user`, { ok: true, body: { login: "bob" }, headers: { "X-OAuth-Scopes": "repo" } }],
    ]));
    const result = await verifyToken("token", fetch);
    expect(result.ok).toBe(true);
  });

  it("returns ok:false when token lacks public_repo", async () => {
    const fetch = buildMockFetch(new Map([
      [`GET ${API}/user`, { ok: true, body: { login: "carol" }, headers: { "X-OAuth-Scopes": "user" } }],
    ]));
    const result = await verifyToken("token", fetch);
    expect(result.ok).toBe(false);
    expect(result.missingScopes).toContain("public_repo");
  });

  it("returns ok:false on 401 response", async () => {
    const fetch = buildMockFetch(new Map([
      [`GET ${API}/user`, { ok: false, status: 401, body: {} }],
    ]));
    const result = await verifyToken("bad-token", fetch);
    expect(result.ok).toBe(false);
  });

  it("throws a network PublishPRError when fetch throws", async () => {
    const fetch: GitHubFetchFn = async () => { throw new Error("offline"); };
    await expect(verifyToken("token", fetch)).rejects.toMatchObject({ kind: "network" });
  });
});

// ---------------------------------------------------------------------------
// publishPR tests
// ---------------------------------------------------------------------------

describe("publishPR", () => {
  it("returns prUrl and commitSha on the happy path", async () => {
    const fetch = buildMockFetch(happyPathRoutes());
    const result = await publishPR(makeSourceFS(), makeOpts(), fetch);
    expect(result.prUrl).toBe(PR_URL);
    expect(result.commitSha).toBe(NEW_COMMIT_SHA);
  });

  it("creates fork when fork does not exist (404)", async () => {
    const routes = happyPathRoutes();
    routes.set(`GET ${API}/repos/${FORK_OWNER}/keyboards`, { ok: false, status: 404, body: {} });
    routes.set(`POST ${API}/repos/keymanapp/keyboards/forks`, { ok: true, status: 202, body: { full_name: `${FORK_OWNER}/keyboards` } });
    const fetch = buildMockFetch(routes);
    const result = await publishPR(makeSourceFS(), makeOpts(), fetch);
    expect(result.prUrl).toBe(PR_URL);
  });

  it("excludes compiled artifacts (.kmx, .js) from the commit", async () => {
    const capturedBodies: string[] = [];
    const base = buildMockFetch(happyPathRoutes());
    const captureFetch: GitHubFetchFn = async (url, init) => {
      if (init?.body !== undefined) capturedBodies.push(init.body);
      return base(url, init);
    };
    await publishPR(makeSourceFS(), makeOpts(), captureFetch);

    // The tree creation body should contain source files but not compiled artifacts
    const treeBody = capturedBodies.find((b) => b.includes("base_tree")) ?? "";
    expect(treeBody).toContain("source/test.kmn");
    expect(treeBody).toContain("source/test.kps");
    expect(treeBody).not.toContain("build/test.kmx");
    expect(treeBody).not.toContain("build/test.js");
  });

  it("throws branch-exists error when branch ref already exists (422)", async () => {
    const routes = happyPathRoutes();
    routes.set(`POST ${API}/repos/${FORK_OWNER}/keyboards/git/refs`, { ok: false, status: 422, body: { message: "Reference already exists" } });
    const fetch = buildMockFetch(routes);
    await expect(publishPR(makeSourceFS(), makeOpts(), fetch)).rejects.toMatchObject({
      kind: "branch-exists",
      branchName: BRANCH,
    });
  });

  it("throws auth error on 401 during fork check", async () => {
    const routes = happyPathRoutes();
    routes.set(`GET ${API}/repos/${FORK_OWNER}/keyboards`, { ok: false, status: 401, body: {} });
    const fetch = buildMockFetch(routes);
    await expect(publishPR(makeSourceFS(), makeOpts(), fetch)).rejects.toMatchObject({ kind: "auth" });
  });

  it("throws scope error on 403 during fork check", async () => {
    const routes = happyPathRoutes();
    routes.set(`GET ${API}/repos/${FORK_OWNER}/keyboards`, { ok: false, status: 403, body: {} });
    const fetch = buildMockFetch(routes);
    await expect(publishPR(makeSourceFS(), makeOpts(), fetch)).rejects.toMatchObject({
      kind: "scope",
      required: expect.arrayContaining(["public_repo"]),
    });
  });

  it("throws network error when fetch throws", async () => {
    const errorFetch: GitHubFetchFn = async () => { throw new Error("DNS failure"); };
    await expect(publishPR(makeSourceFS(), makeOpts(), errorFetch)).rejects.toMatchObject({ kind: "network" });
  });

  it("opens the PR as a draft against keymanapp/keyboards:master", async () => {
    const capturedBodies: string[] = [];
    const base = buildMockFetch(happyPathRoutes());
    const captureFetch: GitHubFetchFn = async (url, init) => {
      if (init?.body !== undefined) capturedBodies.push(init.body);
      return base(url, init);
    };
    await publishPR(makeSourceFS(), makeOpts(), captureFetch);

    const prBody = capturedBodies.find((b) => b.includes('"draft"')) ?? "";
    expect(prBody).toContain('"draft":true');
    expect(prBody).toContain('"base":"master"');
    expect(prBody).toContain(`"head":"${FORK_OWNER}:${BRANCH}"`);
  });
});
