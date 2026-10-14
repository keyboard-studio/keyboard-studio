// Tests for YourDataPanel (specs 097/098 self-service surface).
// Mocking idiom matches MyKeyboardsList.test.tsx: useGitHubAuth and
// serverDraftStore mocked at the module boundary, renderWithI18n.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { YourDataPanel } from "./YourDataPanel.tsx";
import { useGitHubAuth } from "../hooks/useGitHubAuth.ts";
import { deleteAllServerDrafts, exportServerData } from "../lib/serverDraftStore.ts";

vi.mock("../hooks/useGitHubAuth.ts", () => ({ useGitHubAuth: vi.fn() }));
vi.mock("../lib/serverDraftStore.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/serverDraftStore.ts")>();
  return { ...actual, exportServerData: vi.fn(), deleteAllServerDrafts: vi.fn() };
});
vi.mock("../lib/navigate.ts", () => ({ navigateTo: vi.fn() }));

const mockedAuth = vi.mocked(useGitHubAuth);
const mockedExport = vi.mocked(exportServerData);
const mockedDeleteAll = vi.mocked(deleteAllServerDrafts);

function authAs(status: string, accessToken: string | null) {
  mockedAuth.mockReturnValue({
    status,
    token: accessToken === null ? null : { accessToken },
  } as unknown as ReturnType<typeof useGitHubAuth>);
}

beforeEach(() => {
  vi.clearAllMocks();
  authAs("connected", "tok-123");
  mockedExport.mockResolvedValue({
    exportedAt: "2026-10-14T00:00:00.000Z",
    identity: { githubUserId: 42, login: "octocat" },
    drafts: [],
  });
  mockedDeleteAll.mockResolvedValue(2);
  // jsdom has no object-URL implementation; the export path needs both.
  URL.createObjectURL = vi.fn(() => "blob:fake");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
});

describe("YourDataPanel", () => {
  it("guest state: says the servers hold nothing, offers no export/delete", () => {
    authAs("idle", null);
    render(<YourDataPanel />);
    expect(screen.getByText(/browsing as a guest/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /export my server data/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /delete all my server data/i })).toBeNull();
  });

  it("export: calls the export endpoint with the session token and reports done", async () => {
    render(<YourDataPanel />);
    fireEvent.click(screen.getByRole("button", { name: /export my server data/i }));
    await waitFor(() => {
      expect(mockedExport).toHaveBeenCalledWith("tok-123");
    });
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it("export failure is reported as failure, never as success", async () => {
    mockedExport.mockResolvedValue(null);
    render(<YourDataPanel />);
    fireEvent.click(screen.getByRole("button", { name: /export my server data/i }));
    expect(await screen.findByText(/the export failed/i)).toBeTruthy();
  });

  it("delete-all: the confirm step separates the three cases before anything is deleted", async () => {
    render(<YourDataPanel />);
    fireEvent.click(screen.getByRole("button", { name: /delete all my server data/i }));
    expect(mockedDeleteAll).not.toHaveBeenCalled();
    expect(screen.getByText(/Deleted now:/)).toBeTruthy();
    expect(screen.getByText(/Never left your device:/)).toBeTruthy();
    expect(screen.getByText(/Public already:/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /yes, delete all my server data/i }));
    await waitFor(() => {
      expect(mockedDeleteAll).toHaveBeenCalledWith("tok-123");
    });
    expect(await screen.findByText(/Deleted 2 server drafts\./)).toBeTruthy();
  });

  it("delete failure (-1) shows the failure message and no success count", async () => {
    mockedDeleteAll.mockResolvedValue(-1);
    render(<YourDataPanel />);
    fireEvent.click(screen.getByRole("button", { name: /delete all my server data/i }));
    fireEvent.click(screen.getByRole("button", { name: /yes, delete all my server data/i }));
    expect(await screen.findByText(/the deletion failed/i)).toBeTruthy();
    expect(screen.queryByText(/Deleted \d+ server drafts\./)).toBeNull();
  });

  it("'Keep my data' backs out of the confirm without deleting", async () => {
    render(<YourDataPanel />);
    fireEvent.click(screen.getByRole("button", { name: /delete all my server data/i }));
    fireEvent.click(screen.getByRole("button", { name: /keep my data/i }));
    expect(mockedDeleteAll).not.toHaveBeenCalled();
    expect(screen.queryByText(/Deleted now:/)).toBeNull();
  });
});
