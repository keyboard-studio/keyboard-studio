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

function renderPanel(props: ManagedPRSubmitPanelProps) {
  return render(<ManagedPRSubmitPanel {...props} />);
}

// ---------------------------------------------------------------------------
// Mock the async helpers the panel calls at submit time.
// ---------------------------------------------------------------------------

vi.mock("../lib/serializeWorkingCopy.ts", () => ({
  projectWorkingCopyForOutput: vi.fn(),
}));

vi.mock("../lib/services.ts", () => ({
  getManagedPROutputService: vi.fn(),
  getGitHubOutputService: vi.fn(),
  getManagedPRProxyEndpoint: vi.fn(() => "https://example.com/submit/managed-pr"),
}));

// useGitHubAuth mocked at the module boundary — same idiom as
// ProfileScreen.test.tsx / AccountControl.test.tsx.
vi.mock("../hooks/useGitHubAuth.ts", () => ({ useGitHubAuth: vi.fn() }));
vi.mock("../hooks/useGoogleAuth.ts", () => ({ useGoogleAuth: vi.fn() }));

// recordProjectSubmission mocked so the "My keyboards" submission-transition
// call can be asserted without exercising the real localStorage/index/server
// side effects (covered separately by draftPersistence.test.ts).
vi.mock("../lib/draftPersistence.ts", () => ({ recordProjectSubmission: vi.fn(async () => {}) }));

import { projectWorkingCopyForOutput } from "../lib/serializeWorkingCopy.ts";
import { getGitHubOutputService, getManagedPROutputService } from "../lib/services.ts";
import { useGitHubAuth, type UseGitHubAuthResult } from "../hooks/useGitHubAuth.ts";
import { useGoogleAuth, type UseGoogleAuthResult } from "../hooks/useGoogleAuth.ts";
import { recordProjectSubmission } from "../lib/draftPersistence.ts";

const mockedProject = projectWorkingCopyForOutput as Mock;
const mockedGetService = getManagedPROutputService as Mock;
const mockedUseGitHubAuth = vi.mocked(useGitHubAuth);
const mockedUseGoogleAuth = vi.mocked(useGoogleAuth);
const mockedGetGitHubService = getGitHubOutputService as Mock;

const GOOGLE_SESSION = "kss1.payload.sig";

/**
 * Default: signed in with Google (session token present), so the pre-existing
 * tests keep a sign-in the server would accept. Pass `null` to sign out.
 */
function mockGoogleAuth(sessionToken: string | null = GOOGLE_SESSION): void {
  mockedUseGoogleAuth.mockReturnValue({
    status: sessionToken === null ? "idle" : "connected",
    identity:
      sessionToken === null
        ? null
        : {
            provider: "google",
            sub: "1",
            email: "author@example.com",
            emailVerified: true,
            name: "Test Author",
            picture: "https://example.com/p.png",
          },
    sessionToken,
    error: null,
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(),
  } satisfies UseGoogleAuthResult);
}
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
      expect(screen.getByText(/your test submission was received/i)).toBeTruthy();
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

  it("passes null to recordProjectSubmission when not signed in with GitHub", async () => {
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
  // ZIP path (a separate control in PublishStep, not gated on the backend)
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
    expect(screen.queryByText(/your test submission was received/i)).toBeNull();
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
    // spec 094 FR-010: the publish projection — never a test-build or
    // fingerprint projection. Its content is covered in
    // serializeWorkingCopy.testBuild.test.ts.
    expect(mockedProject.mock.calls[0]).toEqual([]);
  });

  it("null projectWorkingCopyForOutput shows a form-level error", async () => {
    mockedProject.mockResolvedValueOnce(null);
    mockedGetService.mockResolvedValueOnce(makeService());

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
// Tests: #506 auto-generated PR body (spec §12)
// ---------------------------------------------------------------------------

import { ALL_CRITERIA } from "@keyboard-studio/contracts";
import type { PRBodyLintResults } from "../lib/generatePRBody.ts";

function lintResultsFixture(): PRBodyLintResults {
  const byId = (id: string) => {
    const c = ALL_CRITERIA.find((x) => x.id === id);
    if (c === undefined) throw new Error(`unknown criterion ${id}`);
    return c;
  };
  return {
    criteria: [
      { criterion: byId("1.1-no-files-outside-keyboard-folder"), status: "met" },
      { criterion: byId("4.3-copyright-holder-is-authorized"), status: "needs-human" },
    ],
    findings: [],
  };
}

describe("ManagedPRSubmitPanel — #506 generated PR body", () => {
  it("shows the generated lint checklist as the PR-description default", () => {
    renderPanel({ canSubmit: true, lintResults: lintResultsFixture() });
    const area = screen.getByRole("textbox", {
      name: /pull request description/i,
    }) as HTMLTextAreaElement;
    expect(area.value).toContain("### Green — checks passed");
    expect(area.value).toContain("- [x] 1.1-no-files-outside-keyboard-folder");
    expect(area.value).toContain("### Red — manual action required");
    // Copyright not yet confirmed: attestation is an unchecked red item.
    expect(area.value).toContain("- [ ] Copyright attestation:");
  });

  it("regenerates the default (attestation line) once copyright is confirmed, when unedited", () => {
    renderPanel({ canSubmit: true, lintResults: lintResultsFixture() });
    fillValidForm();
    const area = screen.getByRole("textbox", {
      name: /pull request description/i,
    }) as HTMLTextAreaElement;
    expect(area.value).toContain("**Copyright attestation:** The submitter has confirmed");
    expect(area.value).not.toContain("- [ ] Copyright attestation:");
  });

  it("submits the author's edited body rather than the generated default", async () => {
    mockedProject.mockResolvedValueOnce(makeProjectResult());
    const svc = makeService();
    // The "null projectWorkingCopyForOutput" test above queues a
    // getManagedPROutputService Once its flow never consumes (the null
    // project returns before the service call), and vi.clearAllMocks does
    // not drain Once queues — reset so the panel gets THIS test's service.
    mockedGetService.mockReset();
    mockedGetService.mockResolvedValueOnce(svc);

    renderPanel({ canSubmit: true, lintResults: lintResultsFixture() });
    fillValidForm();
    const area = screen.getByRole("textbox", {
      name: /pull request description/i,
    }) as HTMLTextAreaElement;
    fireEvent.change(area, { target: { value: "My custom PR description." } });
    fireEvent.click(
      screen.getByRole("button", { name: /submit keyboard to community repository/i }),
    );

    await waitFor(
      () => {
        expect(svc.publishManagedPR).toHaveBeenCalledTimes(1);
      },
      { timeout: 5000 },
    );
    const opts = svc.publishManagedPR.mock.calls[0]?.[1] as { prBody: string };
    expect(opts.prBody).toContain("My custom PR description.");
    expect(opts.prBody).not.toContain("### Green — checks passed");
    expect(opts.prBody).toContain("## Test Keyboard");
  });

  it("submits the generated body when the author did not edit it", async () => {
    mockedProject.mockResolvedValueOnce(makeProjectResult());
    const svc = makeService();
    // The "null projectWorkingCopyForOutput" test above queues a
    // getManagedPROutputService Once its flow never consumes (the null
    // project returns before the service call), and vi.clearAllMocks does
    // not drain Once queues — reset so the panel gets THIS test's service.
    mockedGetService.mockReset();
    mockedGetService.mockResolvedValueOnce(svc);

    renderPanel({ canSubmit: true, lintResults: lintResultsFixture() });
    fillValidForm();
    fireEvent.click(
      screen.getByRole("button", { name: /submit keyboard to community repository/i }),
    );

    await waitFor(
      () => {
        expect(svc.publishManagedPR).toHaveBeenCalledTimes(1);
      },
      { timeout: 5000 },
    );
    const opts = svc.publishManagedPR.mock.calls[0]?.[1] as { prBody: string };
    expect(opts.prBody).toContain("### Green — checks passed");
    expect(opts.prBody).toContain("**Copyright attestation:** The submitter has confirmed");
  });
});

// ---------------------------------------------------------------------------
// Sign-in requirement, testing notice, and the own-GitHub-account route
// ---------------------------------------------------------------------------

const GH_TOKEN = { accessToken: "gho_test", tokenType: "bearer", scope: "", client: "github_app" } as const;

describe("ManagedPRSubmitPanel — sign-in and routes", () => {
  it("says submissions go to the testing copy and that Keyman submission is coming soon", () => {
    renderPanel({ canSubmit: true });
    const notice = screen.getByTestId("submit-testing-phase-notice");
    expect(notice.textContent).toMatch(/keyboard-studio\/keyboards/);
    expect(notice.textContent).toMatch(/coming soon/i);
  });

  it("blocks submission when nobody is signed in", () => {
    mockGoogleAuth(null);
    renderPanel({ canSubmit: true });
    fillValidForm();
    expect(screen.getByTestId("submit-sign-in-required")).toBeTruthy();
    const btn = screen.getByRole("button", { name: /sign in with github or google/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("sends the Google session token as proof of sign-in", async () => {
    mockedProject.mockResolvedValueOnce(makeProjectResult());
    const svc = makeService();
    mockedGetService.mockResolvedValueOnce(svc);
    renderPanel({ canSubmit: true });
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: /submit keyboard to community repository/i }));
    await waitFor(() => expect(svc.publishManagedPR).toHaveBeenCalled());
    expect((svc.publishManagedPR.mock.calls[0]?.[1] as { authToken?: string }).authToken).toBe(GOOGLE_SESSION);
  });

  it("sends the GitHub token when signed in with GitHub only", async () => {
    mockGoogleAuth(null);
    mockGitHubAuth({ token: GH_TOKEN, login: "octo", status: "connected" });
    mockedProject.mockResolvedValueOnce(makeProjectResult());
    const svc = makeService();
    mockedGetService.mockResolvedValueOnce(svc);
    renderPanel({ canSubmit: true });
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: /submit keyboard to community repository/i }));
    await waitFor(() => expect(svc.publishManagedPR).toHaveBeenCalled());
    expect((svc.publishManagedPR.mock.calls[0]?.[1] as { authToken?: string }).authToken).toBe("gho_test");
  });

  it("asks for GitHub permission before submitting from the author's own account", () => {
    const connect = vi.fn(async () => {});
    mockGitHubAuth({ token: GH_TOKEN, login: "octo", status: "connected", canSubmit: false, connect });
    renderPanel({ canSubmit: true });
    fillValidForm();
    fireEvent.click(screen.getByRole("radio", { name: /my own github account/i }));
    const btn = screen.getByRole("button", { name: /^give permission on github$/i });
    expect(btn).toBeTruthy();
    const submit = screen.getByRole("button", { name: /until you give permission/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(btn);
    expect(connect).toHaveBeenCalledWith("submit");
  });

  it("opens the pull request from the author's fork on the own-account route", async () => {
    mockGitHubAuth({
      token: { ...GH_TOKEN, client: "oauth_app", scope: "public_repo" },
      login: "octo",
      status: "connected",
      canSubmit: true,
    });
    mockedProject.mockResolvedValueOnce(makeProjectResult());
    const publishPR = vi.fn(async () => ({ prUrl: "https://github.com/keyboard-studio/keyboards/pull/7", commitSha: "abc" }));
    mockedGetGitHubService.mockResolvedValueOnce({ publishPR, verifyToken: vi.fn() });
    const managed = makeService();
    mockedGetService.mockResolvedValueOnce(managed);

    renderPanel({ canSubmit: true });
    fillValidForm();
    fireEvent.click(screen.getByRole("radio", { name: /my own github account/i }));
    fireEvent.click(screen.getByRole("button", { name: /submit keyboard from my github account/i }));

    await waitFor(() => expect(publishPR).toHaveBeenCalled());
    const opts = publishPR.mock.calls[0]?.[1] as unknown as {
      token: string; forkOwner: string; prTitle: string; branchName: string; prBody: string;
    };
    expect(opts.token).toBe("gho_test");
    expect(opts.forkOwner).toBe("octo");
    expect(opts.prTitle).toBe("[test_keyboard] Test Keyboard");
    expect(opts.branchName).toMatch(/^add\/test_keyboard-/);
    expect(opts.prBody).toContain("from their own GitHub account");
    expect(managed.publishManagedPR).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText(/your test submission was received/i)).toBeTruthy());
  });
});
