/**
 * Unit tests for the Option B managed-PR pipeline in github-pipeline.ts.
 *
 * All tests use an injected stub fetch -- no real GitHub calls. The stub routes
 * by URL + method so the 7-step pipeline (ref -> parent commit -> build tree
 * -> create tree -> commit -> branch -> PR) can be exercised end-to-end and
 * individual steps overridden to provoke each error path.
 */

import { describe, it, expect } from "vitest";
import {
  submitManagedPR,
  buildCommitMessage,
  buildManagedBranchName,
  normalizePrTitle,
  buildPrBody,
  UPSTREAM_OWNER,
  type ManagedPRPipelineConfig,
  type GitHubPipelineFetchResponse,
  type GitHubPipelineFetchFn,
} from "./github-pipeline.js";
import type { ManagedPRBody } from "./managed-pr-schemas.js";
import type { GitHubUser } from "./verify-github-user.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const INSTALLATION_TOKEN = "ghs_INSTALLATION_SECRET_SHOULD_NEVER_LEAK";
const ORG_LOGIN = "keyboard-studio-bot";
/** Caller's sign-in token, presented as proof of identity on every request. */
const AUTH_HEADER = "Bearer gho_CALLER_SIGN_IN_TOKEN";
/** What the stub verifier resolves the header to. Authorship derives from this. */
const VERIFIED_USER: GitHubUser = { id: 4242, login: "ada-lovelace" };
/** The address buildCommitMessage/buildPrBody must derive from VERIFIED_USER. */
const VERIFIED_EMAIL = "ada-lovelace@users.noreply.github.com";
const NEW_COMMIT_SHA = "abc1234567890def00000000000000000000000";
const PR_URL = "https://github.com/keymanapp/keyboards/pull/4242";

/**
 * Submitted paths are package-root-relative (what the scaffolder emits and
 * what the SPA actually posts) -- the server derives and prepends the
 * `release/<firstLetter>/<keyboardId>/` prefix itself (FR-004). Any assertion
 * that inspects the resulting git tree expects the PREFIXED form instead; see
 * the "submitManagedPR() -- path prefixing" describe block below.
 */
const VALID_BODY: ManagedPRBody = {
  attribution: { displayName: "Ada Lovelace", email: "ada@example.com" },
  keyboardId: "my_keyboard",
  prTitle: "[my_keyboard] Add My Keyboard 1.0",
  prBody: "## Checklist\n- green",
  sourceFiles: [
    { path: "source/my_keyboard.kmn", content: "store(&VERSION) '14.0'" },
    { path: "my_keyboard.kps", content: "<Keyboard/>" },
  ],
};

/** Status of one step, keyed by a short tag, so tests override single calls. */
interface StepOverrides {
  masterRef?: Partial<GitHubPipelineFetchResponse>;
  parentCommit?: Partial<GitHubPipelineFetchResponse>;
  tree?: Partial<GitHubPipelineFetchResponse>;
  commit?: Partial<GitHubPipelineFetchResponse>;
  branch?: Partial<GitHubPipelineFetchResponse>;
  pr?: Partial<GitHubPipelineFetchResponse>;
}

/** Build a minimal GitHubPipelineFetchResponse stub. */
function res(
  body: object,
  ok = true,
  status = 200,
  headers: Record<string, string> = {}
): GitHubPipelineFetchResponse {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/**
 * Build a fetch stub that walks the happy path, applying any per-step
 * overrides. Captures every request so tests can assert request shape.
 */
function makeStub(overrides: StepOverrides = {}): {
  fetch: GitHubPipelineFetchFn;
  calls: Array<{ url: string; method: string; body?: string }>;
  /** Recorded outbound call count, surfaced explicitly so a zero-write
   *  assertion (SC-001) reads as "no calls happened" rather than being
   *  inferred indirectly from an absent PR/commit/branch. */
  callCount: () => number;
} {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const fetch: GitHubPipelineFetchFn = async (url, init) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method, ...(init?.body !== undefined ? { body: init.body } : {}) });

    const apply = (
      base: GitHubPipelineFetchResponse,
      ov?: Partial<GitHubPipelineFetchResponse>
    ) => (ov ? { ...base, ...ov } : base);

    if (url.includes("/git/ref/heads/master")) return apply(res({ object: { sha: "masterSha111" } }), overrides.masterRef);
    if (url.includes("/git/commits/masterSha111")) return apply(res({ tree: { sha: "treeShaBase" } }), overrides.parentCommit);
    if (url.endsWith("/git/trees") && method === "POST") return apply(res({ sha: "newTreeSha" }), overrides.tree);
    if (url.endsWith("/git/commits") && method === "POST") return apply(res({ sha: NEW_COMMIT_SHA }), overrides.commit);
    if (url.endsWith("/git/refs") && method === "POST") return apply(res({ ref: "ok" }, true, 201), overrides.branch);
    if (url.endsWith("/pulls") && method === "POST") return apply(res({ html_url: PR_URL }, true, 201), overrides.pr);
    throw new Error(`unexpected request: ${method} ${url}`);
  };
  return { fetch, calls, callCount: () => calls.length };
}

/**
 * Build a pipeline config wired to a stub fetch and a stub identity verifier.
 *
 * Defaults `verifyUser` to resolve {@link VERIFIED_USER} for any non-null
 * token and `null` for a null token -- the happy-path identity every existing
 * test relies on. Pass an explicit `verifyUser` (e.g. one that resolves
 * `null` or rejects) to exercise the identity-gate suite below.
 */
function makeConfig(
  fetchFn: GitHubPipelineFetchFn,
  verifyUser: (token: string | null) => Promise<GitHubUser | null> = (token) =>
    Promise.resolve(token === null ? null : VERIFIED_USER)
): ManagedPRPipelineConfig {
  return {
    getInstallationToken: () => Promise.resolve(INSTALLATION_TOKEN),
    orgLogin: ORG_LOGIN,
    fetch: fetchFn,
    verifyUser,
  };
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("normalizePrTitle()", () => {
  it("prepends [keyboardId] when title does not start with '['", () => {
    expect(normalizePrTitle("my_keyboard", "Add My Keyboard 1.0")).toBe(
      "[my_keyboard] Add My Keyboard 1.0"
    );
  });

  it("does not double-wrap a title already starting with '['", () => {
    expect(normalizePrTitle("my_keyboard", "[my_keyboard] Add My Keyboard 1.0")).toBe(
      "[my_keyboard] Add My Keyboard 1.0"
    );
  });

  it("does not double-wrap even when the bracket prefix differs", () => {
    expect(normalizePrTitle("my_keyboard", "[other_id] Some title")).toBe(
      "[other_id] Some title"
    );
  });
});

describe("buildCommitMessage()", () => {
  it("uses the normalized title as the commit subject", () => {
    const msg = buildCommitMessage(
      "[my_keyboard] Add it",
      { displayName: "Ada Lovelace", email: "ada@example.com" },
      VERIFIED_USER
    );
    expect(msg.split("\n")[0]).toBe("[my_keyboard] Add it");
  });

  it("appends a Co-authored-by trailer crediting the human author, addressed from the verified identity", () => {
    const msg = buildCommitMessage(
      "[my_keyboard] Add it",
      { displayName: "Ada Lovelace", email: "ada@example.com" },
      VERIFIED_USER
    );
    expect(msg).toContain("[my_keyboard] Add it");
    expect(msg).toContain(`Co-authored-by: Ada Lovelace <${VERIFIED_EMAIL}>`);
  });

  it("never reads attribution.email for the trailer address", () => {
    const msg = buildCommitMessage(
      "[my_keyboard] Add it",
      { displayName: "Ada Lovelace", email: "impersonated@example.com" },
      VERIFIED_USER
    );
    expect(msg).not.toContain("impersonated@example.com");
    expect(msg).toContain(`<${VERIFIED_EMAIL}>`);
  });
});

describe("buildPrBody()", () => {
  it("prepends the provenance block naming the human author, addressed from the verified identity", () => {
    const body = buildPrBody(VALID_BODY, VERIFIED_USER);
    expect(body).toContain(
      "Submitted through **Keyboard Studio** on behalf of **Ada Lovelace**"
    );
    expect(body).toContain(VERIFIED_EMAIL);
  });

  it("never reads attribution.email for the provenance block address", () => {
    const body = buildPrBody(
      { ...VALID_BODY, attribution: { ...VALID_BODY.attribution, email: "impersonated@example.com" } },
      VERIFIED_USER
    );
    expect(body).not.toContain("impersonated@example.com");
    expect(body).toContain(VERIFIED_EMAIL);
  });

  it("includes the original prBody after the provenance block", () => {
    const body = buildPrBody(VALID_BODY, VERIFIED_USER);
    expect(body).toContain("## Checklist");
    const provenanceEnd = body.indexOf("please contact");
    const checklistPos = body.indexOf("## Checklist");
    expect(checklistPos).toBeGreaterThan(provenanceEnd);
  });

  it("appends importAttribution after prBody when present", () => {
    const body = buildPrBody(
      { ...VALID_BODY, importAttribution: "## Import attribution\nDerived from base-x" },
      VERIFIED_USER
    );
    expect(body).toContain("Import attribution");
    const checklistPos = body.indexOf("## Checklist");
    const importPos = body.indexOf("Import attribution");
    expect(importPos).toBeGreaterThan(checklistPos);
  });

  it("omits importAttribution section when not provided", () => {
    const body = buildPrBody(VALID_BODY, VERIFIED_USER);
    expect(body).not.toContain("Import attribution");
  });
});

describe("buildManagedBranchName()", () => {
  it("forms add/<keyboardId>-<short7sha> from the commit SHA", () => {
    expect(buildManagedBranchName("my_keyboard", NEW_COMMIT_SHA)).toBe("add/my_keyboard-abc1234");
  });

  it("differs for different commits, giving collision-free re-submission", () => {
    const a = buildManagedBranchName("kb", "1111111aaaa");
    const b = buildManagedBranchName("kb", "2222222bbbb");
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// submitManagedPR -- happy path
// ---------------------------------------------------------------------------

describe("submitManagedPR() -- success", () => {
  it("returns { prUrl, commitSha } after the full pipeline", async () => {
    const { fetch } = makeStub();
    const result = await submitManagedPR(AUTH_HEADER, VALID_BODY, makeConfig(fetch));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data.prUrl).toBe(PR_URL);
    expect(result.data.commitSha).toBe(NEW_COMMIT_SHA);
  });

  it("commits with a Co-authored-by trailer for the human author", async () => {
    const { fetch, calls } = makeStub();
    await submitManagedPR(AUTH_HEADER, VALID_BODY, makeConfig(fetch));
    const commitCall = calls.find((c) => c.url.endsWith("/git/commits") && c.method === "POST");
    expect(commitCall?.body).toContain(`Co-authored-by: Ada Lovelace <${VERIFIED_EMAIL}>`);
  });

  it("uses the normalized title as the commit message subject", async () => {
    const body: ManagedPRBody = { ...VALID_BODY, prTitle: "Add My Keyboard 1.0" };
    const { fetch, calls } = makeStub();
    await submitManagedPR(AUTH_HEADER, body, makeConfig(fetch));
    const commitCall = calls.find((c) => c.url.endsWith("/git/commits") && c.method === "POST");
    const parsed = JSON.parse(commitCall!.body!) as { message: string };
    expect(parsed.message.split("\n")[0]).toBe("[my_keyboard] Add My Keyboard 1.0");
  });

  it("sends the normalized title as the PR title", async () => {
    const body: ManagedPRBody = { ...VALID_BODY, prTitle: "Add My Keyboard 1.0" };
    const { fetch, calls } = makeStub();
    await submitManagedPR(AUTH_HEADER, body, makeConfig(fetch));
    const prCall = calls.find((c) => c.url.endsWith("/pulls") && c.method === "POST");
    const parsed = JSON.parse(prCall!.body!) as { title: string };
    expect(parsed.title).toBe("[my_keyboard] Add My Keyboard 1.0");
  });

  it("does not double-wrap a PR title already starting with '['", async () => {
    const { fetch, calls } = makeStub();
    await submitManagedPR(AUTH_HEADER, VALID_BODY, makeConfig(fetch));
    const prCall = calls.find((c) => c.url.endsWith("/pulls") && c.method === "POST");
    const parsed = JSON.parse(prCall!.body!) as { title: string };
    expect(parsed.title).toBe("[my_keyboard] Add My Keyboard 1.0");
    expect(parsed.title).not.toMatch(/^\[\[/);
  });

  it("PR body opens with the provenance block naming the human author", async () => {
    const { fetch, calls } = makeStub();
    await submitManagedPR(AUTH_HEADER, VALID_BODY, makeConfig(fetch));
    const prCall = calls.find((c) => c.url.endsWith("/pulls") && c.method === "POST");
    const parsed = JSON.parse(prCall!.body!) as { body: string };
    expect(parsed.body).toContain(
      "Submitted through **Keyboard Studio** on behalf of **Ada Lovelace**"
    );
    expect(parsed.body).toContain(VERIFIED_EMAIL);
  });

  it("opens the PR from the org branch against the keyboard-studio/keyboards staging repo, as a draft", async () => {
    const { fetch, calls } = makeStub();
    await submitManagedPR(AUTH_HEADER, VALID_BODY, makeConfig(fetch));
    const prCall = calls.find((c) => c.url.endsWith("/pulls"));
    expect(prCall!.url).toBe("https://api.github.com/repos/keyboard-studio/keyboards/pulls");
    const body = JSON.parse(prCall!.body!) as { head: string; base: string; draft: boolean };
    expect(body.head).toBe(`${ORG_LOGIN}:add/my_keyboard-abc1234`);
    expect(body.base).toBe("master");
    expect(body.draft).toBe(true);
  });

  it("targets the single staging repo for every call when orgLogin === UPSTREAM_OWNER (deployed same-repo model)", async () => {
    const { fetch, calls } = makeStub();
    const config: ManagedPRPipelineConfig = {
      getInstallationToken: () => Promise.resolve(INSTALLATION_TOKEN),
      orgLogin: UPSTREAM_OWNER,
      fetch,
      verifyUser: (token) => Promise.resolve(token === null ? null : VERIFIED_USER),
    };
    const result = await submitManagedPR(AUTH_HEADER, VALID_BODY, config);
    expect(result.ok).toBe(true);
    for (const c of calls) {
      expect(c.url.startsWith(`https://api.github.com/repos/${UPSTREAM_OWNER}/keyboards`)).toBe(true);
    }
    const prCall = calls.find((c) => c.url.endsWith("/pulls") && c.method === "POST");
    const body = JSON.parse(prCall!.body!) as { head: string };
    expect(body.head).toBe(`${UPSTREAM_OWNER}:add/my_keyboard-abc1234`);
  });

  it("appends importAttribution to the PR body when supplied", async () => {
    const { fetch, calls } = makeStub();
    await submitManagedPR(
      AUTH_HEADER,
      { ...VALID_BODY, importAttribution: "## Import attribution\nDerived from base-x" },
      makeConfig(fetch)
    );
    const prCall = calls.find((c) => c.url.endsWith("/pulls"));
    const body = JSON.parse(prCall!.body!) as { body: string };
    expect(body.body).toContain("Import attribution");
  });

  it("never attempts to create a fork (no ensure-fork step under the same-repo model)", async () => {
    const { fetch, calls } = makeStub();
    await submitManagedPR(AUTH_HEADER, VALID_BODY, makeConfig(fetch));
    expect(calls.some((c) => c.url.endsWith("/forks"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// submitManagedPR -- error mapping
// ---------------------------------------------------------------------------

describe("submitManagedPR() -- error mapping", () => {
  it("maps a 422 on branch creation to 409 branch_exists with the branch name", async () => {
    const { fetch } = makeStub({ branch: { ok: false, status: 422 } });
    const result = await submitManagedPR(AUTH_HEADER, VALID_BODY, makeConfig(fetch));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(409);
    expect(result.error).toBe("branch_exists");
    expect(result.branchName).toBe("add/my_keyboard-abc1234");
  });

  it("maps a 429 to rate_limited and reads retryAfterSeconds from the Retry-After header", async () => {
    const retryRes: GitHubPipelineFetchResponse = {
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      headers: { get: (name: string) => (name.toLowerCase() === "retry-after" ? "120" : null) },
      json: async () => ({}),
      text: async () => "{}",
    };
    const { fetch } = makeStub({ tree: retryRes });
    const result = await submitManagedPR(AUTH_HEADER, VALID_BODY, makeConfig(fetch));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(429);
    expect(result.error).toBe("rate_limited");
    expect(result.retryAfterSeconds).toBe(120);
  });

  it("falls back to 60 when Retry-After header is absent on 429", async () => {
    const { fetch } = makeStub({ tree: { ok: false, status: 429 } });
    const result = await submitManagedPR(AUTH_HEADER, VALID_BODY, makeConfig(fetch));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.retryAfterSeconds).toBe(60);
  });

  it("maps a missing staging repo (404 on the ref read) to 502 upstream_error, without a fork fallback", async () => {
    const { fetch, calls } = makeStub({ masterRef: { ok: false, status: 404 } });
    const result = await submitManagedPR(AUTH_HEADER, VALID_BODY, makeConfig(fetch));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(502);
    expect(result.error).toBe("upstream_error");
    expect(calls.some((c) => c.url.endsWith("/forks"))).toBe(false);
  });

  it("maps an org-token 401 to a generic 502 submission_unavailable (no token detail)", async () => {
    const { fetch } = makeStub({ masterRef: { ok: false, status: 401 } });
    const result = await submitManagedPR(AUTH_HEADER, VALID_BODY, makeConfig(fetch));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(502);
    expect(result.error).toBe("submission_unavailable");
  });

  it("maps an org-token 403 the same generic way", async () => {
    const { fetch } = makeStub({ commit: { ok: false, status: 403 } });
    const result = await submitManagedPR(AUTH_HEADER, VALID_BODY, makeConfig(fetch));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(502);
    expect(result.error).toBe("submission_unavailable");
  });

  it("maps any other non-ok to 502 upstream_error", async () => {
    const { fetch } = makeStub({ pr: { ok: false, status: 500 } });
    const result = await submitManagedPR(AUTH_HEADER, VALID_BODY, makeConfig(fetch));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(502);
    expect(result.error).toBe("upstream_error");
  });

  it("maps a network throw to 502 submission_unavailable", async () => {
    const fetch: GitHubPipelineFetchFn = async () => {
      throw new Error("ECONNREFUSED");
    };
    const result = await submitManagedPR(AUTH_HEADER, VALID_BODY, makeConfig(fetch));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(502);
    expect(result.error).toBe("submission_unavailable");
  });
});

// ---------------------------------------------------------------------------
// submitManagedPR -- org token never leaks into any returned result
// ---------------------------------------------------------------------------

describe("submitManagedPR() -- installation token never leaks", () => {
  it("is absent from a success result", async () => {
    const { fetch } = makeStub();
    const result = await submitManagedPR(AUTH_HEADER, VALID_BODY, makeConfig(fetch));
    expect(JSON.stringify(result)).not.toContain(INSTALLATION_TOKEN);
  });

  it("is absent from every error result", async () => {
    const failures: StepOverrides[] = [
      { branch: { ok: false, status: 422 } },
      { tree: { ok: false, status: 429 } },
      { masterRef: { ok: false, status: 401 } },
      { pr: { ok: false, status: 500 } },
    ];
    for (const ov of failures) {
      const { fetch } = makeStub(ov);
      const result = await submitManagedPR(AUTH_HEADER, VALID_BODY, makeConfig(fetch));
      expect(JSON.stringify(result)).not.toContain(INSTALLATION_TOKEN);
    }
  });

  it("sends the installation token in the Authorization header to GitHub (and only there)", async () => {
    // The token must reach GitHub but never the result; assert it is used as a
    // Bearer credential on the request, not echoed back.
    let sawAuth = false;
    const fetch: GitHubPipelineFetchFn = async (url, init) => {
      const auth = init?.headers?.["Authorization"];
      if (auth === `Bearer ${INSTALLATION_TOKEN}`) sawAuth = true;
      // Delegate to the happy-path stub behaviour.
      const { fetch: inner } = makeStub();
      return inner(url, init);
    };
    await submitManagedPR(AUTH_HEADER, VALID_BODY, makeConfig(fetch));
    expect(sawAuth).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Stateless backend -- secret server-side only, no token persistence (doc §4)
// ---------------------------------------------------------------------------

describe("submitManagedPR() -- stateless / no token persistence", () => {
  it("never places the installation token in any request body -- only the header", async () => {
    const { fetch, calls } = makeStub();
    await submitManagedPR(AUTH_HEADER, VALID_BODY, makeConfig(fetch));
    // The token may appear in Authorization headers (not captured here) but
    // must never be serialised into a request body the pipeline sends.
    for (const c of calls) {
      expect(c.body ?? "").not.toContain(INSTALLATION_TOKEN);
    }
  });

  it("holds no cross-call state -- the token comes only from the passed config", async () => {
    // First call with a token; second call with a DIFFERENT config that has no
    // token usage leaking from the first. A persisted/cached token would show
    // up here as the wrong Authorization value.
    const first = makeStub();
    await submitManagedPR(AUTH_HEADER, VALID_BODY, makeConfig(first.fetch));

    let observedToken: string | undefined;
    const probe: GitHubPipelineFetchFn = async (url, init) => {
      observedToken ??= init?.headers?.["Authorization"];
      const { fetch: inner } = makeStub();
      return inner(url, init);
    };
    const OTHER_TOKEN = "gho_A_COMPLETELY_DIFFERENT_TOKEN";
    await submitManagedPR(AUTH_HEADER, VALID_BODY, {
      getInstallationToken: () => Promise.resolve(OTHER_TOKEN),
      orgLogin: ORG_LOGIN,
      fetch: probe,
      verifyUser: (token) => Promise.resolve(token === null ? null : VERIFIED_USER),
    });
    // The second call must authenticate with its own config token, proving no
    // token from the first call was retained anywhere in module state.
    expect(observedToken).toBe(`Bearer ${OTHER_TOKEN}`);
    expect(observedToken).not.toContain(INSTALLATION_TOKEN);
  });
});

// ---------------------------------------------------------------------------
// submitManagedPR -- identity gate (spec 054 US1, T012)
//
// The gate is the FIRST statement of submitManagedPR, before getInstallationToken()
// -- itself an outbound call -- so every refusal below must show zero recorded
// fetch calls (SC-001), proving the gate actually runs before any GitHub call
// rather than merely producing the right status code by coincidence.
// ---------------------------------------------------------------------------

/** authHeader values that must never reach a verified identity. */
const UNVERIFIABLE_HEADERS: ReadonlyArray<[string, string | null | undefined]> = [
  ["missing header (null)", null],
  ["missing header (undefined)", undefined],
  ["malformed header -- wrong scheme", "Basic abc"],
  ["malformed header -- Bearer with no token", "Bearer"],
  ["malformed header -- empty string", ""],
];

describe("submitManagedPR() -- identity gate", () => {
  it.each(UNVERIFIABLE_HEADERS)(
    "returns 401 unauthorized with zero outbound calls: %s",
    async (_label, header) => {
      const { fetch, callCount } = makeStub();
      const result = await submitManagedPR(header, VALID_BODY, makeConfig(fetch));
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.status).toBe(401);
      expect(result.error).toBe("unauthorized");
      // SC-001: the identity gate must run before any outbound GitHub call.
      expect(callCount()).toBe(0);
    }
  );

  it("returns 401 unauthorized with zero outbound calls when the token is invalid or expired", async () => {
    const { fetch, callCount } = makeStub();
    const config = makeConfig(fetch, () => Promise.resolve(null));
    const result = await submitManagedPR(AUTH_HEADER, VALID_BODY, config);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(401);
    expect(result.error).toBe("unauthorized");
    expect(callCount()).toBe(0);
  });

  it("returns 401 unauthorized with zero outbound calls when the identity provider is unreachable (fail closed, research D-2)", async () => {
    // A verifyUser that rejects must be treated as "not verified", not
    // propagate as a thrown error -- this pins fail-closed so a later
    // refactor cannot turn the gate fail-open (research D-2).
    const { fetch, callCount } = makeStub();
    const config = makeConfig(fetch, () => Promise.reject(new Error("ECONNREFUSED")));
    const result = await submitManagedPR(AUTH_HEADER, VALID_BODY, config);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(401);
    expect(result.error).toBe("unauthorized");
    expect(callCount()).toBe(0);
  });

  it("never calls getInstallationToken on a 401 path (the identity gate runs first)", async () => {
    let installationTokenRequested = false;
    const { fetch, callCount } = makeStub();
    const config: ManagedPRPipelineConfig = {
      getInstallationToken: () => {
        installationTokenRequested = true;
        return Promise.resolve(INSTALLATION_TOKEN);
      },
      orgLogin: ORG_LOGIN,
      fetch,
      verifyUser: () => Promise.resolve(null),
    };
    const result = await submitManagedPR(AUTH_HEADER, VALID_BODY, config);
    expect(result.ok).toBe(false);
    expect(installationTokenRequested).toBe(false);
    expect(callCount()).toBe(0);
  });

  it("credits the verified identity, not a client-asserted attribution.email, in the commit trailer and the PR provenance block (US1 AC4)", async () => {
    const { fetch, calls } = makeStub();
    const body: ManagedPRBody = {
      ...VALID_BODY,
      attribution: { ...VALID_BODY.attribution, email: "impersonated@example.com" },
    };
    await submitManagedPR(AUTH_HEADER, body, makeConfig(fetch));

    const commitCall = calls.find((c) => c.url.endsWith("/git/commits") && c.method === "POST");
    expect(commitCall?.body).toContain(
      `Co-authored-by: ${VALID_BODY.attribution.displayName} <${VERIFIED_EMAIL}>`
    );
    expect(commitCall?.body).not.toContain("impersonated@example.com");

    const prCall = calls.find((c) => c.url.endsWith("/pulls") && c.method === "POST");
    expect(prCall?.body).toContain(VERIFIED_EMAIL);
    expect(prCall?.body).not.toContain("impersonated@example.com");
  });
});

// ---------------------------------------------------------------------------
// submitManagedPR() -- path authority (spec 054 US2, T020)
//
// The path-validation gate (submit-paths.ts) runs AFTER the identity gate but
// BEFORE getInstallationToken() -- the first outbound call -- so a rejected
// path must show zero recorded fetch calls (SC-001), never echo the offending
// path (FR-015 / US2 AC4), and every accepted path must land under the
// keyboard's own derived tree prefix rather than being committed verbatim
// (the README.md-at-repo-root regression, research finding F-2).
// ---------------------------------------------------------------------------

describe("submitManagedPR() -- path authority rejection", () => {
  const rejectionCases: Array<{
    category: "absolute" | "traversal" | "metadata" | "malformed";
    path: string;
  }> = [
    { category: "absolute", path: "/etc/passwd" },
    { category: "traversal", path: "../escape.txt" },
    { category: "metadata", path: "release/evil.kmn" },
    { category: "malformed", path: "source\\my_keyboard.kmn" },
  ];

  it.each(rejectionCases)(
    "rejects a $category path with 400 invalid_path, zero outbound calls, and no path echoed",
    async ({ category, path }) => {
      const { fetch, callCount } = makeStub();
      const body: ManagedPRBody = {
        ...VALID_BODY,
        sourceFiles: [{ path, content: "x" }],
      };
      const result = await submitManagedPR(AUTH_HEADER, body, makeConfig(fetch));

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.status).toBe(400);
      expect(result.error).toBe("invalid_path");
      expect((result as { category?: string }).category).toBe(category);

      // SC-001: path validation must run before any outbound GitHub call.
      expect(callCount()).toBe(0);

      // FR-015 / US2 AC4: the offending path must never surface in the result.
      expect(JSON.stringify(result)).not.toContain(path);
    }
  );

  it("rejects the whole submission when only one path among several is bad, in list order", async () => {
    const { fetch, callCount } = makeStub();
    const body: ManagedPRBody = {
      ...VALID_BODY,
      sourceFiles: [
        { path: "source/my_keyboard.kmn", content: "good" },
        { path: "../escape.txt", content: "bad" },
        { path: "README.md", content: "also good" },
      ],
    };
    const result = await submitManagedPR(AUTH_HEADER, body, makeConfig(fetch));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(400);
    expect(result.error).toBe("invalid_path");
    expect((result as { category?: string }).category).toBe("traversal");
    expect(callCount()).toBe(0);
  });

  it("still shows zero outbound calls on the verified-identity refusal path, now that path validation sits between it and the first outbound call", async () => {
    const { fetch, callCount } = makeStub();
    const config = makeConfig(fetch, () => Promise.resolve(null));
    // A body that would ALSO fail path validation, to prove the identity gate
    // -- not the path gate -- is what produced the zero-call refusal here.
    const body: ManagedPRBody = { ...VALID_BODY, sourceFiles: [{ path: "/etc/passwd", content: "x" }] };
    const result = await submitManagedPR(AUTH_HEADER, body, config);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(401);
    expect(result.error).toBe("unauthorized");
    expect(callCount()).toBe(0);
  });

  it("fails 401, not 400, when BOTH unauthenticated and carrying a bad path -- identity runs first (ordering guarantee)", async () => {
    const { fetch, callCount } = makeStub();
    const body: ManagedPRBody = { ...VALID_BODY, sourceFiles: [{ path: "/etc/passwd", content: "x" }] };
    // header === null -> makeConfig's default verifyUser resolves null for a null token.
    const result = await submitManagedPR(null, body, makeConfig(fetch));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(401);
    expect(result.error).toBe("unauthorized");
    expect(callCount()).toBe(0);
  });
});

describe("submitManagedPR() -- path prefixing on an accepted submission", () => {
  it("prefixes every submitted path with release/<firstLetter>/<keyboardId>/ in the created tree, including a README.md that used to land at the staging repo root", async () => {
    const { fetch, calls } = makeStub();
    const submittedFiles = [
      { path: "source/my_keyboard.kmn", content: "store(&VERSION) '14.0'" },
      { path: "my_keyboard.kps", content: "<Keyboard/>" },
      { path: "README.md", content: "# My Keyboard" },
    ];
    const body: ManagedPRBody = { ...VALID_BODY, sourceFiles: submittedFiles };
    const result = await submitManagedPR(AUTH_HEADER, body, makeConfig(fetch));
    expect(result.ok).toBe(true);

    const treeCall = calls.find((c) => c.url.endsWith("/git/trees") && c.method === "POST");
    expect(treeCall).toBeDefined();
    const parsed = JSON.parse(treeCall!.body!) as {
      tree: Array<{ path: string; content: string }>;
    };

    // Same files, same contents, correctly located: the set of committed
    // paths is exactly the submitted set with the derived prefix prepended.
    expect(parsed.tree.map((entry) => entry.path)).toEqual(
      submittedFiles.map((f) => `release/m/my_keyboard/${f.path}`)
    );
    for (const [i, entry] of parsed.tree.entries()) {
      expect(entry.content).toBe(submittedFiles[i]!.content);
    }

    // The README.md-at-repo-root regression this feature exists to prevent:
    // it must land under the keyboard's own tree, never at "README.md" bare.
    const readmeEntry = parsed.tree.find((entry) => entry.path.endsWith("README.md"));
    expect(readmeEntry?.path).toBe("release/m/my_keyboard/README.md");
    expect(parsed.tree.some((entry) => entry.path === "README.md")).toBe(false);
  });
});
