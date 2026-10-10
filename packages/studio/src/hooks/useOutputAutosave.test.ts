// useOutputAutosave — the draft autosave runs while Output is open, because
// SurveyView (which owns it otherwise) is unmounted on that route.

import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

const teardown = vi.fn();
const install = vi.fn((_key: string) => teardown);

vi.mock("../lib/draftPersistence.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/draftPersistence.ts")>();
  return { ...actual, installDraftAutosave: (key: string) => install(key) };
});

import { useOutputAutosave } from "./useOutputAutosave.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";

const initial = useWorkingCopyStore.getState();

afterEach(() => {
  install.mockClear();
  teardown.mockClear();
  useWorkingCopyStore.setState(initial, true);
});

describe("useOutputAutosave", () => {
  it("installs the autosave under the working copy's project key and tears it down on unmount", () => {
    useWorkingCopyStore.setState({
      identity: { keyboardId: "my_kbd" },
    } as unknown as Partial<ReturnType<typeof useWorkingCopyStore.getState>>);
    const { unmount } = renderHook(() => useOutputAutosave());
    expect(install).toHaveBeenCalledTimes(1);
    expect(install).toHaveBeenCalledWith("my_kbd");
    expect(teardown).not.toHaveBeenCalled();
    unmount();
    expect(teardown).toHaveBeenCalledTimes(1);
  });

  it("installs nothing while no working copy names a project", () => {
    useWorkingCopyStore.setState({ identity: null, baseKeyboard: null } as unknown as Partial<
      ReturnType<typeof useWorkingCopyStore.getState>
    >);
    const { unmount } = renderHook(() => useOutputAutosave());
    unmount();
    expect(install).not.toHaveBeenCalled();
  });
});
