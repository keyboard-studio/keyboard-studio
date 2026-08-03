import { describe, it, expect } from "vitest";
import {
  publishManagedPR,
  type ManagedPRFetchFn,
  type ManagedPRFetchResponse,
} from "./managed-pr.js";
import type { PublishManagedPROptions, PublishManagedPRError } from "@keyboard-studio/contracts";
import { createVirtualFS } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Mock fetch builder (mirrors github.test.ts)
// ---------------------------------------------------------------------------

type ResponseSpec =
  | { ok: true; status?: number; body: unknown; headers?: Record<string, string> }
  | { ok: false; status: number; body?: unknown; headers?: Record<string, string> };

function makeResponse(spec: ResponseSpec): ManagedPRFetchResponse {
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

/** A fetch that always returns `spec` and captures the single request made. */
function capturingFetch(spec: ResponseSpec): {
  fetch: ManagedPRFetchFn;
  captured: { url?: string; method?: string; body?: string; headers?: Record<string, string> };
} {
  const captured: {
    url?: string;
    method?: string;
    body?: string;
    headers?: Record<string, string>;
  } = {};
  const fetch: ManagedPRFetchFn = async (url, init) => {
    captured.url = url;
    captured.method = init?.method;
    captured.body = init?.body;
    captured.headers = init?.headers;
    return makeResponse(spec);
  };
  return { fetch, captured };
}

const SUCCESS_BODY = {
  prUrl: "https://github.com/keymanapp/keyboards/pull/123",
  commitSha: "abc1234000000000000000000000000000000000",
};

const OPTS: PublishManagedPROptions = {
  attribution: { displayName: "Ada Lovelace", email: "ada@example.com" },
  keyboardId: "my_keyboard",
  prTitle: "[my_keyboard] Add it",
  prBody: "## Checklist",
  proxyEndpoint: "https://backend.example.com/submit/managed-pr",
};

/** Parse the JSON body the engine POSTed to the proxy. */
function postedBody(captured: { body?: string }): {
  attribution: { displayName: string; email: string };
  keyboardId: string;
  prTitle: string;
  prBody: string;
  importAttribution?: string;
  sourceFiles: Array<{ path: string; content: string }>;
} {
  return JSON.parse(captured.body ?? "{}");
}

/** Run publishManagedPR and capture the thrown PublishManagedPRError. */
async function expectError(fetch: ManagedPRFetchFn): Promise<PublishManagedPRError> {
  try {
    await publishManagedPR(createVirtualFS([]), OPTS, fetch);
  } catch (e) {
    return e as PublishManagedPRError;
  }
  throw new Error("expected publishManagedPR to reject");
}

// ---------------------------------------------------------------------------
// SS1 source-file filter
// ---------------------------------------------------------------------------

describe("publishManagedPR() — SS1 source-file filter", () => {
  it("excludes compiled artifacts (.kmx, .kvk, .js) and sidecars from the POST", async () => {
    const fs = createVirtualFS([
      { path: "release/m/my_keyboard/source/my_keyboard.kmn", content: "store(&VERSION) '14.0'" },
      { path: "release/m/my_keyboard/my_keyboard.kps", content: "<Keyboard/>" },
      { path: "release/m/my_keyboard/build/my_keyboard.kmx", content: "COMPILED" },
      { path: "release/m/my_keyboard/build/my_keyboard.kvk", content: "COMPILED" },
      { path: "release/m/my_keyboard/build/my_keyboard.js", content: "COMPILED" },
      { path: "release/m/my_keyboard/source/my_keyboard.kmn.imported", content: "SIDECAR" },
    ]);
    const { fetch, captured } = capturingFetch({ ok: true, body: SUCCESS_BODY });

    await publishManagedPR(fs, OPTS, fetch);

    const paths = postedBody(captured).sourceFiles.map((f) => f.path);
    expect(paths).toContain("release/m/my_keyboard/source/my_keyboard.kmn");
    expect(paths).toContain("release/m/my_keyboard/my_keyboard.kps");
    expect(paths.some((p) => p.endsWith(".kmx"))).toBe(false);
    expect(paths.some((p) => p.endsWith(".kvk"))).toBe(false);
    expect(paths.some((p) => p.endsWith(".js"))).toBe(false);
    expect(paths.some((p) => p.endsWith(".imported"))).toBe(false);
  });

  it("skips binary (non-string) entries — the managed body carries text only", async () => {
    const fs = createVirtualFS([
      { path: "release/m/my_keyboard/source/my_keyboard.kmn", content: "store(&VERSION) '14.0'" },
      { path: "release/m/my_keyboard/welcome/banner.png", content: new Uint8Array([1, 2, 3]) },
    ]);
    const { fetch, captured } = capturingFetch({ ok: true, body: SUCCESS_BODY });

    await publishManagedPR(fs, OPTS, fetch);

    const paths = postedBody(captured).sourceFiles.map((f) => f.path);
    expect(paths).toEqual(["release/m/my_keyboard/source/my_keyboard.kmn"]);
  });
});

// ---------------------------------------------------------------------------
// Request shape — attribution forwarded for the Co-authored-by trailer
// ---------------------------------------------------------------------------

describe("publishManagedPR() — request shape", () => {
  it("POSTs to the proxyEndpoint with attribution + keyboardId + PR metadata", async () => {
    const { fetch, captured } = capturingFetch({ ok: true, body: SUCCESS_BODY });
    await publishManagedPR(createVirtualFS([]), OPTS, fetch);

    expect(captured.url).toBe(OPTS.proxyEndpoint);
    expect(captured.method).toBe("POST");
    const body = postedBody(captured);
    // The trailer itself is formed server-side; the engine must forward the
    // attribution the backend needs to build it.
    expect(body.attribution).toEqual({ displayName: "Ada Lovelace", email: "ada@example.com" });
    expect(body.keyboardId).toBe("my_keyboard");
    expect(body.prTitle).toBe("[my_keyboard] Add it");
    expect(body.prBody).toBe("## Checklist");
  });

  it("includes importAttribution only when supplied", async () => {
    const withAttr = capturingFetch({ ok: true, body: SUCCESS_BODY });
    await publishManagedPR(
      createVirtualFS([]),
      { ...OPTS, importAttribution: "## Import attribution\nBase X" },
      withAttr.fetch
    );
    expect(postedBody(withAttr.captured).importAttribution).toContain("Import attribution");

    const without = capturingFetch({ ok: true, body: SUCCESS_BODY });
    await publishManagedPR(createVirtualFS([]), OPTS, without.fetch);
    expect(postedBody(without.captured).importAttribution).toBeUndefined();
  });

  it("returns { prUrl, commitSha } from the proxy response", async () => {
    const { fetch } = capturingFetch({ ok: true, body: SUCCESS_BODY });
    const result = await publishManagedPR(createVirtualFS([]), OPTS, fetch);
    expect(result).toEqual(SUCCESS_BODY);
  });
});

// ---------------------------------------------------------------------------
// accessToken → Authorization header (verified-identity bearer token)
// ---------------------------------------------------------------------------

describe("publishManagedPR() — accessToken header", () => {
  it("sends Authorization: Bearer <accessToken> when accessToken is set", async () => {
    const { fetch, captured } = capturingFetch({ ok: true, body: SUCCESS_BODY });

    await publishManagedPR(createVirtualFS([]), { ...OPTS, accessToken: "gho_abc123" }, fetch);

    expect(captured.headers?.Authorization).toBe("Bearer gho_abc123");
  });

  it("omits the Authorization header entirely when accessToken is not set", async () => {
    const { fetch, captured } = capturingFetch({ ok: true, body: SUCCESS_BODY });

    await publishManagedPR(createVirtualFS([]), OPTS, fetch);

    expect(Object.prototype.hasOwnProperty.call(captured.headers ?? {}, "Authorization")).toBe(
      false
    );
  });

  it("never forwards accessToken in the POST body — header credential only", async () => {
    const { fetch, captured } = capturingFetch({ ok: true, body: SUCCESS_BODY });

    await publishManagedPR(
      createVirtualFS([]),
      { ...OPTS, accessToken: "gho_super-secret-token" },
      fetch
    );

    expect(captured.headers?.Authorization).toBe("Bearer gho_super-secret-token");
    expect(captured.body ?? "").not.toContain("gho_super-secret-token");
    const body = postedBody(captured) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(body, "accessToken")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PublishManagedPRError mapping — each kind from the right HTTP status
// ---------------------------------------------------------------------------

describe("publishManagedPR() — error mapping", () => {
  it("network throw → proxy-unavailable", async () => {
    const fetch: ManagedPRFetchFn = async () => {
      throw new Error("ECONNREFUSED");
    };
    const err = await expectError(fetch);
    expect(err.kind).toBe("proxy-unavailable");
  });

  it("429 → rate-limit, with retryAfterSeconds from Retry-After", async () => {
    const { fetch } = capturingFetch({
      ok: false,
      status: 429,
      headers: { "Retry-After": "120" },
      body: { error: "rate_limited" },
    });
    const err = await expectError(fetch);
    expect(err.kind).toBe("rate-limit");
    if (err.kind !== "rate-limit") throw new Error("unreachable");
    expect(err.retryAfterSeconds).toBe(120);
  });

  it("429 without Retry-After defaults to 60s", async () => {
    const { fetch } = capturingFetch({ ok: false, status: 429, body: {} });
    const err = await expectError(fetch);
    if (err.kind !== "rate-limit") throw new Error("expected rate-limit");
    expect(err.retryAfterSeconds).toBe(60);
  });

  it("409 → branch-exists, branchName from the body", async () => {
    const { fetch } = capturingFetch({
      ok: false,
      status: 409,
      body: { error: "branch_exists", branchName: "add/my_keyboard-abc1234" },
    });
    const err = await expectError(fetch);
    expect(err.kind).toBe("branch-exists");
    if (err.kind !== "branch-exists") throw new Error("unreachable");
    expect(err.branchName).toBe("add/my_keyboard-abc1234");
  });

  it("409 without a body branchName falls back to add/<keyboardId>", async () => {
    const { fetch } = capturingFetch({ ok: false, status: 409, body: {} });
    const err = await expectError(fetch);
    if (err.kind !== "branch-exists") throw new Error("expected branch-exists");
    expect(err.branchName).toBe("add/my_keyboard");
  });

  it("5xx → upstream-failure", async () => {
    for (const status of [500, 502, 503]) {
      const { fetch } = capturingFetch({ ok: false, status, body: { error: "upstream_error" } });
      const err = await expectError(fetch);
      expect(err.kind).toBe("upstream-failure");
    }
  });

  it("other 4xx → proxy-rejected, carrying the HTTP status", async () => {
    const { fetch } = capturingFetch({ ok: false, status: 400, body: { error: "invalid_request" } });
    const err = await expectError(fetch);
    expect(err.kind).toBe("proxy-rejected");
    if (err.kind !== "proxy-rejected") throw new Error("unreachable");
    expect(err.httpStatus).toBe(400);
  });

  it("ok response with malformed JSON → unknown", async () => {
    const fetch: ManagedPRFetchFn = async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => null },
      json: async () => {
        throw new Error("not json");
      },
      text: async () => "",
    });
    const err = await expectError(fetch);
    expect(err.kind).toBe("unknown");
  });
});
