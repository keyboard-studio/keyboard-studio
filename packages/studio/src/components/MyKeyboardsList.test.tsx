// Tests for MyKeyboardsList — the "My keyboards" section on the profile page
// (specs/037-my-keyboards/spec.md).
//
// Mocking idiom: mock useGitHubAuth at the module boundary (same idiom as
// ProfileScreen.test.tsx / AccountControl.test.tsx). draftAutosave.ts is
// exercised for real against real localStorage (same idiom as
// draftAutosave.test.ts) except for `deleteProject`, which is wrapped with
// `vi.fn(actual.deleteProject)` so we can assert the call AND let the real
// removal happen. serverDraftStore.ts is likewise real except for
// `listServerDrafts`, which is stubbed per-test to control the cloud list.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MyKeyboardsList } from "./MyKeyboardsList.tsx";
import { useGitHubAuth, type UseGitHubAuthResult } from "../hooks/useGitHubAuth.ts";
import { listServerDrafts, type ServerDraftMeta } from "../lib/serverDraftStore.ts";
import { navigateTo } from "../lib/navigate.ts";
import { getActiveProjectKey, deleteProject } from "../lib/draftAutosave.ts";

vi.mock("../hooks/useGitHubAuth.ts", () => ({ useGitHubAuth: vi.fn() }));

vi.mock("../lib/serverDraftStore.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/serverDraftStore.ts")>();
  return { ...actual, listServerDrafts: vi.fn(async () => []) };
});

vi.mock("../lib/draftAutosave.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/draftAutosave.ts")>();
  return { ...actual, deleteProject: vi.fn(actual.deleteProject) };
});

vi.mock("../lib/navigate.ts", () => ({ navigateTo: vi.fn() }));

const mockedUseGitHubAuth = vi.mocked(useGitHubAuth);
const mockedListServerDrafts = vi.mocked(listServerDrafts);
const mockedNavigateTo = vi.mocked(navigateTo);
const mockedDeleteProject = vi.mocked(deleteProject);

const PROJECT_INDEX_KEY = "ks.studio.projects.index";

function projectStorageKey(projectKey: string): string {
  return `ks.studio.project.${projectKey}`;
}

interface Fixture {
  projectKey: string;
  savedAt: number;
  activeStepId?: string;
  label: string | null;
  langTag?: string | null;
  status: "draft" | "submitted";
  prUrl?: string | null;
}

function seedLocalIndex(entries: Fixture[]): void {
  localStorage.setItem(
    PROJECT_INDEX_KEY,
    JSON.stringify(
      entries.map((e) => ({
        projectKey: e.projectKey,
        savedAt: e.savedAt,
        activeStepId: e.activeStepId ?? "carve",
        label: e.label,
        langTag: e.langTag ?? null,
        status: e.status,
        prUrl: e.prUrl ?? null,
      })),
    ),
  );
  // Seed a minimal per-project draft record too, so deleteProject's local
  // removal has a real record to remove (mirrors draftAutosave.test.ts).
  for (const e of entries) {
    localStorage.setItem(
      projectStorageKey(e.projectKey),
      JSON.stringify({
        version: 1,
        savedAt: e.savedAt,
        survey: { activeStepId: e.activeStepId ?? "carve", history: [], identityResult: null },
        workingCopy: null,
      }),
    );
  }
}

function mockGitHubAuth(overrides: Partial<UseGitHubAuthResult>): void {
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

function signedInToken() {
  return {
    accessToken: "gho_test",
    tokenType: "bearer",
    scope: "",
    client: "github_app" as const,
  };
}

function serverMeta(overrides: Partial<ServerDraftMeta> & { draftId: string }): ServerDraftMeta {
  return {
    savedAt: Date.now(),
    activeStepId: "carve",
    label: null,
    keyboardId: overrides.draftId,
    schemaVersion: 1,
    status: "draft",
    prUrl: null,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  mockGitHubAuth({ status: "idle" });
  mockedListServerDrafts.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

describe("MyKeyboardsList — empty state", () => {
  it("renders an empty-state message when there are no local drafts and the caller is signed out", async () => {
    render(<MyKeyboardsList />);
    expect(await screen.findByTestId("my-keyboards-empty")).toBeTruthy();
    expect(screen.queryByTestId("my-keyboards-card")).toBeNull();
  });
});

describe("MyKeyboardsList — renders N cards from the local index", () => {
  it("renders one card per local project entry", async () => {
    seedLocalIndex([
      { projectKey: "kbd_a", savedAt: Date.now() - 60_000, label: "Alpha", status: "draft" },
      { projectKey: "kbd_b", savedAt: Date.now() - 120_000, label: "Beta", status: "draft" },
    ]);

    render(<MyKeyboardsList />);

    const cards = await screen.findAllByTestId("my-keyboards-card");
    expect(cards).toHaveLength(2);
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();
  });

  it("falls back to the projectKey, then a generic name, when label is null", async () => {
    seedLocalIndex([
      { projectKey: "kbd_named_by_key", savedAt: Date.now(), label: null, status: "draft" },
      { projectKey: "__pending__", savedAt: Date.now(), label: null, status: "draft" },
    ]);

    render(<MyKeyboardsList />);

    expect(await screen.findByText("kbd_named_by_key")).toBeTruthy();
    expect(screen.getByText("Untitled keyboard")).toBeTruthy();
  });
});

describe("MyKeyboardsList — badges", () => {
  it("shows a Draft badge for a draft project", async () => {
    seedLocalIndex([{ projectKey: "kbd_a", savedAt: Date.now(), label: "Alpha", status: "draft" }]);
    render(<MyKeyboardsList />);
    const card = await screen.findByTestId("my-keyboards-card");
    expect(within(card).getByText("Draft")).toBeTruthy();
  });

  it("shows a Submitted badge for a submitted project", async () => {
    seedLocalIndex([
      {
        projectKey: "kbd_a",
        savedAt: Date.now(),
        label: "Alpha",
        status: "submitted",
        prUrl: "https://github.com/keymanapp/keyboards/pull/42",
      },
    ]);
    render(<MyKeyboardsList />);
    const card = await screen.findByTestId("my-keyboards-card");
    expect(within(card).getByText("Submitted")).toBeTruthy();
  });
});

describe("MyKeyboardsList — View PR", () => {
  it("shows View PR only on a submitted card with a prUrl, and not on a draft card", async () => {
    seedLocalIndex([
      { projectKey: "kbd_draft", savedAt: Date.now(), label: "Draft One", status: "draft" },
      {
        projectKey: "kbd_submitted",
        savedAt: Date.now(),
        label: "Submitted One",
        status: "submitted",
        prUrl: "https://github.com/keymanapp/keyboards/pull/7",
      },
    ]);

    render(<MyKeyboardsList />);
    await screen.findAllByTestId("my-keyboards-card");

    const viewPrLink = screen.getByRole("link", { name: /View PR for Submitted One/i });
    expect(viewPrLink.getAttribute("href")).toBe("https://github.com/keymanapp/keyboards/pull/7");
    expect(viewPrLink.getAttribute("target")).toBe("_blank");
    expect(viewPrLink.getAttribute("rel")).toContain("noopener");

    expect(screen.queryByRole("link", { name: /View PR for Draft One/i })).toBeNull();
  });

  it("does not offer Resume on a submitted card", async () => {
    seedLocalIndex([
      {
        projectKey: "kbd_submitted",
        savedAt: Date.now(),
        label: "Submitted One",
        status: "submitted",
        prUrl: "https://github.com/x/y/pull/7",
      },
    ]);
    render(<MyKeyboardsList />);
    await screen.findAllByTestId("my-keyboards-card");
    expect(screen.queryByRole("button", { name: /Resume Submitted One/i })).toBeNull();
  });
});

describe("MyKeyboardsList — Resume", () => {
  it("sets the project active and navigates to survey", async () => {
    seedLocalIndex([{ projectKey: "kbd_a", savedAt: Date.now(), label: "Alpha", status: "draft" }]);
    render(<MyKeyboardsList />);

    const resumeButton = await screen.findByRole("button", { name: /Resume Alpha/i });
    fireEvent.click(resumeButton);

    expect(getActiveProjectKey()).toBe("kbd_a");
    expect(mockedNavigateTo).toHaveBeenCalledWith("survey");
  });
});

describe("MyKeyboardsList — Delete", () => {
  it("calls deleteProject and refreshes the list, removing the card", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    seedLocalIndex([{ projectKey: "kbd_a", savedAt: Date.now(), label: "Alpha", status: "draft" }]);

    render(<MyKeyboardsList />);
    const deleteButton = await screen.findByRole("button", { name: /Delete Alpha/i });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(mockedDeleteProject).toHaveBeenCalledWith("kbd_a", null);
    });
    await waitFor(() => {
      expect(screen.queryByTestId("my-keyboards-card")).toBeNull();
    });
    expect(screen.getByTestId("my-keyboards-empty")).toBeTruthy();

    vi.unstubAllGlobals();
  });

  it("does not delete when the confirm dialog is dismissed", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    seedLocalIndex([{ projectKey: "kbd_a", savedAt: Date.now(), label: "Alpha", status: "draft" }]);

    render(<MyKeyboardsList />);
    const deleteButton = await screen.findByRole("button", { name: /Delete Alpha/i });
    fireEvent.click(deleteButton);

    expect(mockedDeleteProject).not.toHaveBeenCalled();
    expect(await screen.findByTestId("my-keyboards-card")).toBeTruthy();

    vi.unstubAllGlobals();
  });
});

describe("MyKeyboardsList — signed-in merge/dedupe", () => {
  it("merges the local index with the cloud list, deduping by projectKey", async () => {
    mockGitHubAuth({ status: "connected", token: signedInToken(), login: "octocat" });
    seedLocalIndex([{ projectKey: "kbd_local_only", savedAt: Date.now(), label: "Local Only", status: "draft" }]);
    mockedListServerDrafts.mockResolvedValue([
      serverMeta({ draftId: "kbd_cloud_only", label: "Cloud Only", savedAt: Date.now() }),
    ]);

    render(<MyKeyboardsList />);

    // findAllByTestId resolves as soon as ANY card is present (the local-only
    // render, before the cloud fetch resolves) — wait for the merged count
    // explicitly rather than the first (unstable) render.
    await waitFor(() => {
      expect(screen.getAllByTestId("my-keyboards-card")).toHaveLength(2);
    });
    expect(screen.getByText("Local Only")).toBeTruthy();
    expect(screen.getByText("Cloud Only")).toBeTruthy();
  });

  it("shows a single card (not two) for a project present in both, preferring the submitted status", async () => {
    mockGitHubAuth({ status: "connected", token: signedInToken(), login: "octocat" });
    seedLocalIndex([
      { projectKey: "kbd_shared", savedAt: 1_000, label: "Shared", status: "draft" },
    ]);
    mockedListServerDrafts.mockResolvedValue([
      serverMeta({
        draftId: "kbd_shared",
        label: "Shared",
        savedAt: 2_000,
        status: "submitted",
        prUrl: "https://github.com/x/y/pull/1",
      }),
    ]);

    render(<MyKeyboardsList />);

    // Wait for the merge to settle (the local-only render shows "Draft" first)
    // before asserting on the merged badge.
    await waitFor(() => {
      expect(screen.getAllByTestId("my-keyboards-card")).toHaveLength(1);
      expect(screen.getByText("Submitted")).toBeTruthy();
    });
  });
});

describe("MyKeyboardsList — cloud-fetch-fails falls back to local list", () => {
  it("renders the local list when listServerDrafts resolves empty (its fail-soft contract)", async () => {
    mockGitHubAuth({ status: "connected", token: signedInToken(), login: "octocat" });
    seedLocalIndex([{ projectKey: "kbd_local", savedAt: Date.now(), label: "Local", status: "draft" }]);
    // listServerDrafts already swallows every transport failure into [] — see
    // serverDraftStore.ts — so a fetch failure and a genuinely empty cloud
    // list are indistinguishable at this boundary. Simulating the fail-soft
    // resolution here is the correct/only observable behavior for this test.
    mockedListServerDrafts.mockResolvedValue([]);

    render(<MyKeyboardsList />);

    const cards = await screen.findAllByTestId("my-keyboards-card");
    expect(cards).toHaveLength(1);
    expect(screen.getByText("Local")).toBeTruthy();
    // Never blanks the section or throws.
    expect(screen.queryByTestId("my-keyboards-empty")).toBeNull();
  });
});

describe("MyKeyboardsList — guest never calls the cloud endpoint", () => {
  it("does not call listServerDrafts when signed out", async () => {
    seedLocalIndex([{ projectKey: "kbd_a", savedAt: Date.now(), label: "Alpha", status: "draft" }]);
    render(<MyKeyboardsList />);
    await screen.findAllByTestId("my-keyboards-card");
    expect(mockedListServerDrafts).not.toHaveBeenCalled();
  });
});

describe("MyKeyboardsList — Delete race against an in-flight cloud refresh", () => {
  it("does not re-introduce a deleted project when a stale listServerDrafts response (issued before the delete) resolves afterward still listing it", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    mockGitHubAuth({ status: "connected", token: signedInToken(), login: "octocat" });
    seedLocalIndex([{ projectKey: "kbd_e", savedAt: Date.now(), label: "Entry E", status: "draft" }]);

    // The mount-triggered refresh's listServerDrafts() call is left pending —
    // resolved manually below, AFTER the delete has completed, to reproduce
    // the exact race: a Delete finishing while an already-in-flight cloud
    // fetch (issued before the delete) is still outstanding.
    let resolveCloud: (drafts: ServerDraftMeta[]) => void = () => {};
    mockedListServerDrafts.mockImplementation(
      () => new Promise<ServerDraftMeta[]>((resolve) => { resolveCloud = resolve; }),
    );

    render(<MyKeyboardsList />);
    await screen.findByTestId("my-keyboards-card");

    const deleteButton = screen.getByRole("button", { name: /Delete Entry E/i });
    fireEvent.click(deleteButton);

    // The delete (and its .then(refresh) chain) has fully completed locally.
    await waitFor(() => {
      expect(mockedDeleteProject).toHaveBeenCalledWith("kbd_e", "gho_test");
    });
    await waitFor(() => {
      expect(localStorage.getItem(projectStorageKey("kbd_e"))).toBeNull();
    });

    // NOW resolve the stale cloud fetch — its response still lists the
    // just-deleted entry (as it would have been fetched/queued before the
    // delete's own server round trip landed).
    resolveCloud([
      serverMeta({ draftId: "kbd_e", label: "Entry E", savedAt: Date.now() }),
    ]);

    // The stale response must not resurrect the deleted card.
    await waitFor(() => {
      expect(screen.queryAllByTestId("my-keyboards-card")).toHaveLength(0);
    });
    expect(screen.getByTestId("my-keyboards-empty")).toBeTruthy();

    vi.unstubAllGlobals();
  });
});
