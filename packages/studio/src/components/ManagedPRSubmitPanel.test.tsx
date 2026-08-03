// Tests for ManagedPRSubmitPanel.
//
// Covers:
//   1. Attribution form gating: Submit disabled until name + email + copyright
//      checkbox are all valid.
//   2. Prefill: fields populated from the prefill prop.
//   3. Error-state rendering: each PublishManagedPRError kind maps to the
//      expected user-facing copy.
//   4. Success state: PR link shown after a successful submission.
//
// The real services (getManagedPROutputService, projectWorkingCopyForOutput)
// are mocked so the tests never touch the engine, WASM, or the backend.

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { ManagedPRSubmitPanel, type ManagedPRSubmitPanelProps } from "./ManagedPRSubmitPanel.tsx";

/**
 * Default verified GitHub identity used by `renderPanel` below. Most of this
 * file's tests are about form gating / success / error handling, not the
 * identity gate itself (that gate has its own describe block, "gh identity
 * gate", further down) — so the default keeps those 20+ pre-existing tests
 * reaching an enabled/submitting state without threading `githubIdentity`
 * through every call site. Tests that care about the identity gate pass
 * `githubIdentity` explicitly (including `null`), which overrides this default
 * since it is spread after in `renderPanel`.
 */
const DEFAULT_GITHUB_IDENTITY = { login: "octocat", accessToken: "gho_default_test_token" };

function renderPanel(props: ManagedPRSubmitPanelProps) {
  return render(
    <ManagedPRSubmitPanel githubIdentity={DEFAULT_GITHUB_IDENTITY} {...props} />,
  );
}

// ---------------------------------------------------------------------------
// Mock the async helpers the panel calls at submit time.
// ---------------------------------------------------------------------------

vi.mock("../lib/serializeWorkingCopy.ts", () => ({
  projectWorkingCopyForOutput: vi.fn(),
}));

vi.mock("../lib/services.ts", () => ({
  getManagedPROutputService: vi.fn(),
  getManagedPRProxyEndpoint: vi.fn(() => "https://example.com/submit/managed-pr"),
}));

// useGitHubAuth mocked at the module boundary — same idiom as
// ProfileScreen.test.tsx / AccountControl.test.tsx.
vi.mock("../hooks/useGitHubAuth.ts", () => ({ useGitHubAuth: vi.fn() }));

// useGoogleAuth mocked the same way (same idiom as AccountControl.test.tsx).
// The panel reads this ONLY to distinguish "signed out" from "Google-only"
// copy in the disabled-state notice/aria-label — it never affects the gate.
vi.mock("../hooks/useGoogleAuth.ts", () => ({ useGoogleAuth: vi.fn() }));

// recordProjectSubmission mocked so the "My keyboards" submission-transition
// call can be asserted without exercising the real localStorage/index/server
// side effects (covered separately by draftPersistence.test.ts).
vi.mock("../lib/draftPersistence.ts", () => ({ recordProjectSubmission: vi.fn(async () => {}) }));

import { projectWorkingCopyForOutput } from "../lib/serializeWorkingCopy.ts";
import { getManagedPROutputService } from "../lib/services.ts";
import { useGitHubAuth, type UseGitHubAuthResult } from "../hooks/useGitHubAuth.ts";
import { useGoogleAuth, type UseGoogleAuthResult } from "../hooks/useGoogleAuth.ts";
import { recordProjectSubmission } from "../lib/draftPersistence.ts";

const mockedProject = projectWorkingCopyForOutput as Mock;
const mockedGetService = getManagedPROutputService as Mock;
const mockedUseGitHubAuth = vi.mocked(useGitHubAuth);
const mockedUseGoogleAuth = vi.mocked(useGoogleAuth);
const mockedRecordProjectSubmission = vi.mocked(recordProjectSubmission);

/** Default: signed out (token null) — matches the pre-existing test posture. */
function mockGitHubAuth(overrides: Partial<UseGitHubAuthResult> = {}): void {
  mockedUseGitHubAuth.mockReturnValue({
    status: "idle",
    token: null,
    verify: null,
    login: null,
    canSubmit: false,
    missingScopes: [],
    error: null,
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(),
    ...overrides,
  });
}

/** Default: no Google identity — matches the real hook's un-connected state. */
function mockGoogleAuth(overrides: Partial<UseGoogleAuthResult> = {}): void {
  mockedUseGoogleAuth.mockReturnValue({
    status: "idle",
    identity: null,
    error: null,
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(),
    ...overrides,
  });
}

beforeEach(() => {
  mockGitHubAuth();
  mockGoogleAuth();
});

// Minimal VirtualFS-shaped object — the panel passes it through to publishManagedPR.
const MOCK_VFS = { entries: () => [] };

function makeProjectResult(overrides: Record<string, unknown> = {}) {
  return {
    vfs: MOCK_VFS,
    keyboardId: "test_keyboard",
    displayName: "Test Keyboard",
    version: "1.0",
    warnings: [],
    ...overrides,
  };
}

function makeService(overrides: Partial<{ publishManagedPR: Mock }> = {}) {
  return {
    publishManagedPR: vi.fn(async () => ({
      prUrl: "https://github.com/keymanapp/keyboards/pull/9999",
      commitSha: "deadbeef",
    })),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fill in valid name + email + check copyright. Does NOT submit. */
function fillValidForm(
  nameValue = "Test Author",
  emailValue = "author@example.com",
) {
  const nameInput = screen.getByRole("textbox", { name: /your name/i });
  fireEvent.change(nameInput, { target: { value: nameValue } });
  fireEvent.blur(nameInput);

  const emailInput = screen.getByRole("textbox", { name: /email address/i });
  fireEvent.change(emailInput, { target: { value: emailValue } });
  fireEvent.blur(emailInput);

  const checkbox = screen.getByRole("checkbox");
  fireEvent.click(checkbox);
}

// ---------------------------------------------------------------------------
// Tests: form gating
// ---------------------------------------------------------------------------

describe("ManagedPRSubmitPanel — form gating", () => {
  it("Submit button is disabled on initial render", () => {
    renderPanel({ canSubmit: true });
    // On initial render the form is incomplete; the aria-label reflects "fill in" copy.
    const btn = screen.getByRole("button", { name: /fill in your name/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("Submit button is disabled when canSubmit is false even with a valid form", () => {
    renderPanel({ canSubmit: false });
    fillValidForm();
    const btn = screen.getByRole("button", { name: /submit unavailable/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("Submit button is disabled when name is empty", () => {
    renderPanel({ canSubmit: true });
    // Fill only email + checkbox, leave name blank.
    const emailInput = screen.getByRole("textbox", { name: /email address/i });
    fireEvent.change(emailInput, { target: { value: "a@b.com" } });
    fireEvent.blur(emailInput);
    fireEvent.click(screen.getByRole("checkbox"));
    const btn = screen.getByRole("button", { name: /fill in/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("Submit button is disabled when email is invalid", () => {
    renderPanel({ canSubmit: true });
    const nameInput = screen.getByRole("textbox", { name: /your name/i });
    fireEvent.change(nameInput, { target: { value: "Jane" } });
    fireEvent.blur(nameInput);
    const emailInput = screen.getByRole("textbox", { name: /email address/i });
    fireEvent.change(emailInput, { target: { value: "not-an-email" } });
    fireEvent.blur(emailInput);
    fireEvent.click(screen.getByRole("checkbox"));
    const btn = screen.getByRole("button", { name: /fill in/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("Submit button is disabled when copyright checkbox is unchecked", () => {
    renderPanel({ canSubmit: true });
    const nameInput = screen.getByRole("textbox", { name: /your name/i });
    fireEvent.change(nameInput, { target: { value: "Jane" } });
    fireEvent.blur(nameInput);
    const emailInput = screen.getByRole("textbox", { name: /email address/i });
    fireEvent.change(emailInput, { target: { value: "jane@example.com" } });
    fireEvent.blur(emailInput);
    // Deliberately do NOT click the checkbox.
    const btn = screen.getByRole("button", { name: /fill in/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("Submit button is enabled when name + email + copyright are valid and canSubmit is true", () => {
    renderPanel({ canSubmit: true });
    fillValidForm();
    const btn = screen.getByRole("button", { name: /submit keyboard to community repository/i });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  // Output-time staleness gate (a stale touch-layout side-car after a
  // post-Touch-step mechanics edit): the panel must refuse to submit
  // regardless of an otherwise-valid form and canSubmit=true.
  it("Submit button is disabled when outputBlocked is true even with a valid form and canSubmit", () => {
    renderPanel({
      canSubmit: true,
      outputBlocked: true,
      outputBlockedReason: "the touch layout is out of date",
    });
    fillValidForm();
    const btn = screen.getByRole("button", { name: /submit unavailable.*touch layout is out of date/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("Submit button aria-label explains the block reason when outputBlocked is true", () => {
    renderPanel({
      canSubmit: true,
      outputBlocked: true,
      outputBlockedReason: "the touch layout is out of date",
    });
    fillValidForm();
    expect(
      screen.getByRole("button", { name: /submit unavailable — the touch layout is out of date/i }),
    ).toBeTruthy();
  });

  // Priority ordering (intentional, not incidental): when both outputBlocked
  // and !canSubmit are simultaneously true, the aria-label must explain the
  // outputBlocked reason, not the generic "submit unavailable until compile
  // completes" canSubmit copy. See aria-label derivation in the component.
  it("aria-label reflects outputBlocked reason when both outputBlocked and !canSubmit are true", () => {
    renderPanel({
      canSubmit: false,
      outputBlocked: true,
      outputBlockedReason: "the touch layout is out of date",
    });
    fillValidForm();
    const btn = screen.getByRole("button", {
      name: /submit unavailable — the touch layout is out of date/i,
    });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("Submit button is enabled when outputBlocked is false (control)", () => {
    renderPanel({ canSubmit: true, outputBlocked: false });
    fillValidForm();
    const btn = screen.getByRole("button", { name: /submit keyboard to community repository/i });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows name-required error after blurring an empty name field", () => {
    renderPanel({ canSubmit: true });
    const nameInput = screen.getByRole("textbox", { name: /your name/i });
    fireEvent.blur(nameInput);
    // role="alert" elements have their accessible name from their text content.
    const alerts = screen.getAllByRole("alert");
    const nameAlert = alerts.find((el) => /name is required/i.test(el.textContent ?? ""));
    expect(nameAlert).toBeTruthy();
  });

  it("shows email-required error after blurring an invalid email field", () => {
    renderPanel({ canSubmit: true });
    const emailInput = screen.getByRole("textbox", { name: /email address/i });
    fireEvent.change(emailInput, { target: { value: "notanemail" } });
    fireEvent.blur(emailInput);
    expect(screen.getByText(/a valid email address is required/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests: prefill
// ---------------------------------------------------------------------------

describe("ManagedPRSubmitPanel — prefill", () => {
  it("prefills name and email from the prefill prop", () => {
    renderPanel({
      canSubmit: true,
      prefill: { displayName: "Alice", email: "alice@example.com" },
    });
    const nameInput = screen.getByRole("textbox", { name: /your name/i }) as HTMLInputElement;
    const emailInput = screen.getByRole("textbox", { name: /email address/i }) as HTMLInputElement;
    expect(nameInput.value).toBe("Alice");
    expect(emailInput.value).toBe("alice@example.com");
  });

  it("prefills only name when only displayName is provided", () => {
    renderPanel({ canSubmit: true, prefill: { displayName: "Bob" } });
    const nameInput = screen.getByRole("textbox", { name: /your name/i }) as HTMLInputElement;
    const emailInput = screen.getByRole("textbox", { name: /email address/i }) as HTMLInputElement;
    expect(nameInput.value).toBe("Bob");
    expect(emailInput.value).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Tests: success state
// ---------------------------------------------------------------------------

describe("ManagedPRSubmitPanel — success state", () => {
  it("shows the success panel with a PR link after submission", async () => {
    mockedProject.mockResolvedValueOnce(makeProjectResult());
    const svc = makeService();
    mockedGetService.mockResolvedValueOnce(svc);

    renderPanel({ canSubmit: true });
    fillValidForm();
    const btn = screen.getByRole("button", { name: /submit keyboard to community repository/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByText(/your submission is being reviewed/i)).toBeTruthy();
    });
    expect(
      screen.getByRole("link", { name: /view your keyboard submission/i }),
    ).toBeTruthy();
    const link = screen.getByRole("link", { name: /view your keyboard submission/i }) as HTMLAnchorElement;
    expect(link.href).toBe("https://github.com/keymanapp/keyboards/pull/9999");
  });

  it("transitions the active 'My keyboards' project via recordProjectSubmission with the PR URL and access token", async () => {
    mockGitHubAuth({ token: { accessToken: "gho_test", tokenType: "bearer", scope: "", client: "github_app" } });
    mockedProject.mockResolvedValueOnce(makeProjectResult());
    const svc = makeService();
    mockedGetService.mockResolvedValueOnce(svc);

    renderPanel({ canSubmit: true });
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: /submit keyboard to community repository/i }));

    await waitFor(() => {
      expect(mockedRecordProjectSubmission).toHaveBeenCalledWith(
        "https://github.com/keymanapp/keyboards/pull/9999",
        "gho_test",
      );
    });
  });

  // NOTE on the interaction between the two "signed out" notions this test
  // straddles: `mockGitHubAuth()` (the beforeEach default, unchanged here)
  // makes the panel's OWN internal `useGitHubAuth()` call — the one that
  // feeds `recordProjectSubmission`'s access-token argument — report
  // signed-out (token: null). That is independent of the `githubIdentity`
  // PROP (the gate `renderPanel` defaults to a valid identity so Submit is
  // reachable at all — see `DEFAULT_GITHUB_IDENTITY` above and the prop's
  // docstring on the component distinguishing the two paths). Without a
  // valid `githubIdentity` prop, Submit stays disabled and this test could
  // never click through to assert the recordProjectSubmission call — the
  // original intent ("verify null is passed when the account is signed out")
  // is only representable by keeping the identity PROP present while the
  // internal hook stays signed out; it is not representable with BOTH
  // signed out simultaneously, since then there is nothing to click.
  it("passes null to recordProjectSubmission when signed out", async () => {
    mockedProject.mockResolvedValueOnce(makeProjectResult());
    const svc = makeService();
    mockedGetService.mockResolvedValueOnce(svc);

    renderPanel({ canSubmit: true });
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: /submit keyboard to community repository/i }));

    await waitFor(() => {
      expect(mockedRecordProjectSubmission).toHaveBeenCalledWith(
        "https://github.com/keymanapp/keyboards/pull/9999",
        null,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: error states — one per PublishManagedPRError kind
// ---------------------------------------------------------------------------

describe("ManagedPRSubmitPanel — error states", () => {
  async function submitAndExpectError(
    err: Record<string, unknown>,
    expectedText: RegExp,
  ) {
    mockedProject.mockResolvedValueOnce(makeProjectResult());
    const svc = makeService({
      publishManagedPR: vi.fn(async () => { throw err; }),
    });
    mockedGetService.mockResolvedValueOnce(svc);

    renderPanel({ canSubmit: true });
    fillValidForm();
    fireEvent.click(
      screen.getByRole("button", { name: /submit keyboard to community repository/i }),
    );

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(expectedText);
    });
  }

  it("proxy-unavailable: shows 'temporarily unavailable' copy", async () => {
    await submitAndExpectError(
      { kind: "proxy-unavailable", message: "down" },
      /temporarily unavailable/i,
    );
  });

  it("rate-limit: shows retry-in-N-seconds copy", async () => {
    await submitAndExpectError(
      { kind: "rate-limit", message: "slow down", retryAfterSeconds: 30 },
      /retry in 30 seconds/i,
    );
  });

  it("branch-exists: shows 'already submitted' copy", async () => {
    await submitAndExpectError(
      {
        kind: "branch-exists",
        message: "exists",
        branchName: "add/test_keyboard",
      },
      /already submitted/i,
    );
  });

  it("upstream-failure: shows 'upstream error' copy", async () => {
    await submitAndExpectError(
      { kind: "upstream-failure", message: "upstream blew up" },
      /upstream error/i,
    );
  });

  it("proxy-rejected: shows rejected copy with status", async () => {
    await submitAndExpectError(
      { kind: "proxy-rejected", message: "bad request", httpStatus: 400 },
      /rejected.*400/i,
    );
  });

  it("network: shows 'check your connection' copy", async () => {
    await submitAndExpectError(
      { kind: "network", message: "offline" },
      /check your connection/i,
    );
  });

  it("unknown: shows the error message", async () => {
    await submitAndExpectError(
      { kind: "unknown", message: "something weird happened" },
      /something weird happened/i,
    );
  });

  it("dismiss button clears the error state", async () => {
    mockedProject.mockResolvedValueOnce(makeProjectResult());
    const svc = makeService({
      publishManagedPR: vi.fn(async () => {
        throw { kind: "network", message: "offline" };
      }),
    });
    mockedGetService.mockResolvedValueOnce(svc);

    renderPanel({ canSubmit: true });
    fillValidForm();
    fireEvent.click(
      screen.getByRole("button", { name: /submit keyboard to community repository/i }),
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // spec 034 T014 (FR-008, PP-2/PP-3): when the managed-PR backend is
  // unreachable the panel shows an honest error and NEVER a fake success — the
  // ZIP path (a separate control in OutputScreen, not gated on the backend)
  // stays functional.
  it("T014: backend unreachable → honest error, no success panel (never fakes success)", async () => {
    mockedProject.mockResolvedValueOnce(makeProjectResult());
    const svc = makeService({
      publishManagedPR: vi.fn(async () => {
        throw { kind: "proxy-unavailable", message: "backend down" };
      }),
    });
    mockedGetService.mockResolvedValueOnce(svc);

    renderPanel({ canSubmit: true });
    fillValidForm();
    fireEvent.click(
      screen.getByRole("button", { name: /submit keyboard to community repository/i }),
    );

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(/temporarily unavailable/i);
    });
    // The success affordance must NOT appear on a failed submit.
    expect(screen.queryByText(/your submission is being reviewed/i)).toBeNull();
    expect(screen.queryByRole("link", { name: /view your keyboard submission/i })).toBeNull();
  });

  // spec 034 T015 (PP-4, Article III): the PR submit path serializes the SAME
  // working copy the ZIP download serializes — both go through the single
  // projectWorkingCopyForOutput() projector. Submitting must call it exactly
  // once and hand its VFS straight to publishManagedPR — no second projection,
  // no second working copy.
  it("T015: submit projects the working copy once and submits that exact VFS (one working copy)", async () => {
    const projectResult = makeProjectResult();
    mockedProject.mockResolvedValueOnce(projectResult);
    const svc = makeService();
    mockedGetService.mockResolvedValueOnce(svc);

    renderPanel({ canSubmit: true });
    fillValidForm();
    fireEvent.click(
      screen.getByRole("button", { name: /submit keyboard to community repository/i }),
    );

    await waitFor(() => {
      expect(svc.publishManagedPR).toHaveBeenCalledTimes(1);
    });
    // Exactly one projection — the shared serializer the ZIP path also uses.
    expect(mockedProject).toHaveBeenCalledTimes(1);
    // The submitted VFS is the very object the projector returned (not a re-derived copy).
    expect(svc.publishManagedPR.mock.calls[0]?.[0]).toBe(projectResult.vfs);
  });

  it("null projectWorkingCopyForOutput shows a form-level error", async () => {
    mockedProject.mockResolvedValueOnce(null);
    // Deliberately do NOT queue a mockedGetService resolution: handleSubmit
    // returns before calling getManagedPROutputService() when the projected
    // working copy is null, so a queued value here is never consumed and
    // (since vi.clearAllMocks() clears calls/results but not queued
    // mockResolvedValueOnce implementations) would leak into whichever test
    // runs next and calls getManagedPROutputService() first.

    renderPanel({ canSubmit: true });
    fillValidForm();
    fireEvent.click(
      screen.getByRole("button", { name: /submit keyboard to community repository/i }),
    );

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(/select a keyboard first/i);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: GitHub identity gate (spec 054 backend authz hardening)
//
// The server 401s a managed-PR request without a verified GitHub identity;
// this panel fails closed the same way via the `githubIdentity` prop, and
// explains why through the button's accessible name (not a raw text-node
// match — see docs/accessibility.md). These tests deliberately do NOT use
// the `renderPanel` helper's default identity — they override it directly
// via the `githubIdentity` prop on each render call.
// ---------------------------------------------------------------------------

describe("ManagedPRSubmitPanel — GitHub identity gate", () => {
  it("signed out: an otherwise-complete form stays disabled, and the accessible name explains sign-in is required", () => {
    renderPanel({ canSubmit: true, githubIdentity: null });
    fillValidForm();

    const btn = screen.getByRole("button", {
      name: "Submit unavailable — sign in with GitHub to submit to the community repository",
    });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("Google-only: no GitHub identity but a connected Google session stays disabled, with a distinct Google-specific accessible name", () => {
    mockGoogleAuth({
      status: "connected",
      identity: {
        provider: "google",
        sub: "123",
        email: "tester@example.com",
        emailVerified: true,
        name: "Tester User",
        picture: "",
      },
    });

    renderPanel({ canSubmit: true, githubIdentity: null });
    fillValidForm();

    const btn = screen.getByRole("button", {
      name: "Submit unavailable — submitting requires a GitHub account; sign in with GitHub, or download the keyboard instead",
    });
    expect((btn as HTMLButtonElement).disabled).toBe(true);

    // Distinct from the plain signed-out copy — asserting the negative keeps
    // this test honest that the two messages are actually different, not
    // just that *a* message matched.
    expect(
      screen.queryByRole("button", {
        name: "Submit unavailable — sign in with GitHub to submit to the community repository",
      }),
    ).toBeNull();
  });

  it("omitting the githubIdentity prop behaves identically to passing null (fail-closed default)", () => {
    // Deliberately bypasses the `renderPanel` helper (which defaults
    // `githubIdentity` to a valid identity for the rest of this file's
    // tests) — this test's whole point is what happens when the prop key is
    // absent entirely, pinning the component's destructuring default so a
    // future refactor can't quietly turn "prop omitted" into "allowed".
    render(<ManagedPRSubmitPanel canSubmit={true} />);
    fillValidForm();

    const btn = screen.getByRole("button", {
      name: "Submit unavailable — sign in with GitHub to submit to the community repository",
    });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("a verified GitHub identity enables Submit, and its access token reaches publishManagedPR", async () => {
    mockedProject.mockResolvedValueOnce(makeProjectResult());
    const svc = makeService();
    mockedGetService.mockResolvedValueOnce(svc);

    renderPanel({
      canSubmit: true,
      githubIdentity: { login: "gate-test-user", accessToken: "gho_gate_test_token" },
    });
    fillValidForm();

    const btn = screen.getByRole("button", {
      name: "Submit keyboard to community repository",
    });
    expect((btn as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(btn);

    await waitFor(() => {
      expect(svc.publishManagedPR).toHaveBeenCalledTimes(1);
    });
    const options = svc.publishManagedPR.mock.calls[0]?.[1];
    expect(options).toMatchObject({ accessToken: "gho_gate_test_token" });
  });
});
