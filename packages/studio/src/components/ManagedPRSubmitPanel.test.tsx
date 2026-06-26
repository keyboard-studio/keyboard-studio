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

import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ManagedPRSubmitPanel } from "./ManagedPRSubmitPanel.tsx";

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

import { projectWorkingCopyForOutput } from "../lib/serializeWorkingCopy.ts";
import { getManagedPROutputService } from "../lib/services.ts";

const mockedProject = projectWorkingCopyForOutput as Mock;
const mockedGetService = getManagedPROutputService as Mock;

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
    render(<ManagedPRSubmitPanel canSubmit={true} />);
    // On initial render the form is incomplete; the aria-label reflects "fill in" copy.
    const btn = screen.getByRole("button", { name: /fill in your name/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("Submit button is disabled when canSubmit is false even with a valid form", () => {
    render(<ManagedPRSubmitPanel canSubmit={false} />);
    fillValidForm();
    const btn = screen.getByRole("button", { name: /submit unavailable/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("Submit button is disabled when name is empty", () => {
    render(<ManagedPRSubmitPanel canSubmit={true} />);
    // Fill only email + checkbox, leave name blank.
    const emailInput = screen.getByRole("textbox", { name: /email address/i });
    fireEvent.change(emailInput, { target: { value: "a@b.com" } });
    fireEvent.blur(emailInput);
    fireEvent.click(screen.getByRole("checkbox"));
    const btn = screen.getByRole("button", { name: /fill in/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("Submit button is disabled when email is invalid", () => {
    render(<ManagedPRSubmitPanel canSubmit={true} />);
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
    render(<ManagedPRSubmitPanel canSubmit={true} />);
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
    render(<ManagedPRSubmitPanel canSubmit={true} />);
    fillValidForm();
    const btn = screen.getByRole("button", { name: /submit keyboard to community repository/i });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows name-required error after blurring an empty name field", () => {
    render(<ManagedPRSubmitPanel canSubmit={true} />);
    const nameInput = screen.getByRole("textbox", { name: /your name/i });
    fireEvent.blur(nameInput);
    // role="alert" elements have their accessible name from their text content.
    const alerts = screen.getAllByRole("alert");
    const nameAlert = alerts.find((el) => /name is required/i.test(el.textContent ?? ""));
    expect(nameAlert).toBeTruthy();
  });

  it("shows email-required error after blurring an invalid email field", () => {
    render(<ManagedPRSubmitPanel canSubmit={true} />);
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
    render(
      <ManagedPRSubmitPanel
        canSubmit={true}
        prefill={{ displayName: "Alice", email: "alice@example.com" }}
      />,
    );
    const nameInput = screen.getByRole("textbox", { name: /your name/i }) as HTMLInputElement;
    const emailInput = screen.getByRole("textbox", { name: /email address/i }) as HTMLInputElement;
    expect(nameInput.value).toBe("Alice");
    expect(emailInput.value).toBe("alice@example.com");
  });

  it("prefills only name when only displayName is provided", () => {
    render(
      <ManagedPRSubmitPanel canSubmit={true} prefill={{ displayName: "Bob" }} />,
    );
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

    render(<ManagedPRSubmitPanel canSubmit={true} />);
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

    render(<ManagedPRSubmitPanel canSubmit={true} />);
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

    render(<ManagedPRSubmitPanel canSubmit={true} />);
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

  it("null projectWorkingCopyForOutput shows a form-level error", async () => {
    mockedProject.mockResolvedValueOnce(null);
    mockedGetService.mockResolvedValueOnce(makeService());

    render(<ManagedPRSubmitPanel canSubmit={true} />);
    fillValidForm();
    fireEvent.click(
      screen.getByRole("button", { name: /submit keyboard to community repository/i }),
    );

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(/select a keyboard first/i);
    });
  });
});
