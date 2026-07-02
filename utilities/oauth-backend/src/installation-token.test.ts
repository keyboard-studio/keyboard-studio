/**
 * Unit tests for the GitHub App installation-token minter.
 *
 * All tests mock @octokit/auth-app so no real GitHub calls are made.
 * Each test resets the module-level auth cache via _resetAuthCache() and
 * restores process.env after modification.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock @octokit/auth-app before importing the module under test
// ---------------------------------------------------------------------------

const mockAuth = vi.fn();

vi.mock("@octokit/auth-app", () => ({
  createAppAuth: vi.fn(() => mockAuth),
}));

// Import after mock is registered
import { getInstallationToken, _resetAuthCache } from "./installation-token.js";
import { createAppAuth } from "@octokit/auth-app";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_PEM =
  "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0Z3VS5JJcds3xHn/ygWep4VF\n-----END RSA PRIVATE KEY-----\n";
const VALID_PEM_B64 = Buffer.from(VALID_PEM).toString("base64");

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  // Snapshot the three env vars we touch
  savedEnv = {
    GITHUB_APP_ID: process.env["GITHUB_APP_ID"],
    GITHUB_APP_PRIVATE_KEY: process.env["GITHUB_APP_PRIVATE_KEY"],
    GITHUB_APP_INSTALLATION_ID: process.env["GITHUB_APP_INSTALLATION_ID"],
  };
  // Reset the module-level auth cache so each test starts clean
  _resetAuthCache();
  vi.clearAllMocks();
});

afterEach(() => {
  // Restore env vars
  setEnv(savedEnv);
  _resetAuthCache();
});

// ---------------------------------------------------------------------------
// "Not configured" paths — missing env vars return undefined
// ---------------------------------------------------------------------------

describe("getInstallationToken() — not configured", () => {
  it("returns undefined when all three App env vars are absent", async () => {
    setEnv({
      GITHUB_APP_ID: undefined,
      GITHUB_APP_PRIVATE_KEY: undefined,
      GITHUB_APP_INSTALLATION_ID: undefined,
    });
    const token = await getInstallationToken();
    expect(token).toBeUndefined();
  });

  it("returns undefined when GITHUB_APP_ID is absent", async () => {
    setEnv({
      GITHUB_APP_ID: undefined,
      GITHUB_APP_PRIVATE_KEY: VALID_PEM_B64,
      GITHUB_APP_INSTALLATION_ID: "456",
    });
    const token = await getInstallationToken();
    expect(token).toBeUndefined();
  });

  it("returns undefined when GITHUB_APP_PRIVATE_KEY is absent", async () => {
    setEnv({
      GITHUB_APP_ID: "123",
      GITHUB_APP_PRIVATE_KEY: undefined,
      GITHUB_APP_INSTALLATION_ID: "456",
    });
    const token = await getInstallationToken();
    expect(token).toBeUndefined();
  });

  it("returns undefined when GITHUB_APP_INSTALLATION_ID is absent", async () => {
    setEnv({
      GITHUB_APP_ID: "123",
      GITHUB_APP_PRIVATE_KEY: VALID_PEM_B64,
      GITHUB_APP_INSTALLATION_ID: undefined,
    });
    const token = await getInstallationToken();
    expect(token).toBeUndefined();
  });

  it("does not call createAppAuth when not configured", async () => {
    setEnv({
      GITHUB_APP_ID: undefined,
      GITHUB_APP_PRIVATE_KEY: undefined,
      GITHUB_APP_INSTALLATION_ID: undefined,
    });
    await getInstallationToken();
    expect(createAppAuth).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Present-but-unparseable IDs — warns and returns undefined
// ---------------------------------------------------------------------------

describe("getInstallationToken() — present but unparseable IDs", () => {
  it("returns undefined and warns when GITHUB_APP_ID is not a valid integer", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    setEnv({
      GITHUB_APP_ID: "not-a-number",
      GITHUB_APP_PRIVATE_KEY: VALID_PEM_B64,
      GITHUB_APP_INSTALLATION_ID: "456",
    });
    const token = await getInstallationToken();
    expect(token).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]?.[0]).toContain("[WARN]");
    warnSpy.mockRestore();
  });

  it("returns undefined and warns when GITHUB_APP_INSTALLATION_ID is not a valid integer", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    setEnv({
      GITHUB_APP_ID: "123",
      GITHUB_APP_PRIVATE_KEY: VALID_PEM_B64,
      GITHUB_APP_INSTALLATION_ID: "not-a-number",
    });
    const token = await getInstallationToken();
    expect(token).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]?.[0]).toContain("[WARN]");
    warnSpy.mockRestore();
  });

  it("does not call createAppAuth when IDs are present but unparseable", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    setEnv({
      GITHUB_APP_ID: "abc",
      GITHUB_APP_PRIVATE_KEY: VALID_PEM_B64,
      GITHUB_APP_INSTALLATION_ID: "456",
    });
    await getInstallationToken();
    expect(createAppAuth).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Happy path — returns the token from the auth function
// ---------------------------------------------------------------------------

describe("getInstallationToken() — configured", () => {
  beforeEach(() => {
    setEnv({
      GITHUB_APP_ID: "123",
      GITHUB_APP_PRIVATE_KEY: VALID_PEM_B64,
      GITHUB_APP_INSTALLATION_ID: "456",
    });
    mockAuth.mockResolvedValue({ token: "ghs_minted_token", type: "installation" });
  });

  it("returns the token string from the auth function", async () => {
    const token = await getInstallationToken();
    expect(token).toBe("ghs_minted_token");
  });

  it("calls createAppAuth with the decoded PEM (not the base64 string)", () => {
    // createAppAuth is called lazily on first getInstallationToken() call;
    // the mock was already exercised in the previous test via beforeEach env setup,
    // but _resetAuthCache() ensures a fresh call here.
    const spy = vi.mocked(createAppAuth);
    // Trigger the call
    return getInstallationToken().then(() => {
      expect(spy).toHaveBeenCalledOnce();
      const callArg = spy.mock.calls[0]?.[0] as { privateKey?: string } | undefined;
      // The privateKey passed to createAppAuth must be the decoded PEM,
      // not the base64-encoded value stored in the env var.
      expect(callArg?.privateKey).toBe(VALID_PEM);
      expect(callArg?.privateKey).not.toBe(VALID_PEM_B64);
    });
  });

  it("calls createAppAuth with the numeric appId and installationId", () => {
    const spy = vi.mocked(createAppAuth);
    return getInstallationToken().then(() => {
      const callArg = spy.mock.calls[0]?.[0] as
        | { appId?: number; installationId?: number }
        | undefined;
      expect(callArg?.appId).toBe(123);
      expect(callArg?.installationId).toBe(456);
    });
  });

  it("calls the auth function with type: installation", async () => {
    await getInstallationToken();
    expect(mockAuth).toHaveBeenCalledWith({ type: "installation" });
  });

  it("throws if the auth function rejects (misconfigured key)", async () => {
    mockAuth.mockRejectedValueOnce(new Error("bad credentials"));
    await expect(getInstallationToken()).rejects.toThrow("bad credentials");
  });
});

// ---------------------------------------------------------------------------
// Cache behaviour — createAppAuth is called only once per process lifecycle
// ---------------------------------------------------------------------------

describe("getInstallationToken() — caching", () => {
  beforeEach(() => {
    setEnv({
      GITHUB_APP_ID: "123",
      GITHUB_APP_PRIVATE_KEY: VALID_PEM_B64,
      GITHUB_APP_INSTALLATION_ID: "456",
    });
    mockAuth.mockResolvedValue({ token: "ghs_cached_token", type: "installation" });
  });

  it("calls createAppAuth only once across multiple getInstallationToken() calls", async () => {
    const spy = vi.mocked(createAppAuth);
    await getInstallationToken();
    await getInstallationToken();
    await getInstallationToken();
    // createAppAuth (the factory) is called once; mockAuth (the auth fn) is
    // called on each getInstallationToken() call (token refresh is its job).
    expect(spy).toHaveBeenCalledOnce();
  });
});
