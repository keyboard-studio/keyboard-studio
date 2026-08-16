// OutputScreen — left-pane scope on the ship-it screen (spec 058).
//
// What these lock down:
//   (a) With a working copy (the normal end-of-flow arrival) the pane drops the
//       "Open base" / "New from base" mode toggle and the base picker, and shows
//       read-only provenance instead. The toggle could never report how the
//       working copy was actually created — `pickerMode` is per-screen local
//       state re-initialized to "open" on every mount — and selecting a
//       different base here re-instantiates, discarding carve deletions and
//       recorded phases behind nothing but a window.confirm.
//   (b) Cold arrival at #output (bookmark / typed hash, no working copy) keeps
//       the full picker, which is the documented reason a picker is reachable
//       from this screen at all.
//   (c) "Change base keyboard" is a pure navigation action: it routes to the
//       survey's choose_base step, rewinds history, clears the baseConfirmed
//       commit gate, and mutates the working copy not at all.
//   (d) The download control announces the id it will actually emit
//       (identity.keyboardId, the same source serializeWorkingCopy resolves) —
//       not the base id the old pickerMode-derived label announced.
//
// Harness follows OutputScreen.coverageBanner.test.tsx: mock useKeyboardArtifact
// to force stage:"ready", seed the real working-copy store, and let the real
// PickerPane render (it is the component under test here, so it is NOT stubbed).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR, basicKbdus } from "@keyboard-studio/contracts/fixtures";
import type { Stage } from "../hooks/useKeyboardArtifact.ts";

const READY_STAGE: Stage = {
  kind: "ready",
  compileResult: { diagnostics: [] },
  jsBlobUrl: "blob:test",
  vfs: createVirtualFS([]),
  scaffoldWarnings: [],
  keyboardId: "test",
} as unknown as Stage;

vi.mock("../hooks/useKeyboardArtifact.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hooks/useKeyboardArtifact.ts")>()),
  useKeyboardArtifact: () => ({
    stage: READY_STAGE,
    retry: vi.fn(),
    recompile: vi.fn(),
  }),
}));

// The picker itself reaches for BaseBrowserService; stub it so the slot's
// presence/absence is what this file measures, not the service.
vi.mock("./BaseKeyboardPicker.tsx", () => ({
  BaseKeyboardPicker: () => <div data-testid="base-picker-stub" />,
}));
vi.mock("./KmnEditor.tsx", () => ({ KmnEditor: () => <div data-testid="kmn-editor-stub" /> }));
vi.mock("./SignUpPanel.tsx", () => ({ SignUpPanel: () => null }));
vi.mock("./ManagedPRSubmitPanel.tsx", () => ({ ManagedPRSubmitPanel: () => null }));

const navigateTo = vi.fn();
vi.mock("../lib/navigate.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/navigate.ts")>()),
  navigateTo: (...args: unknown[]) => navigateTo(...args),
}));

function resetStores() {
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
}

function seedInstantiatedWorkingCopy() {
  const vfs = createVirtualFS([
    { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
  ]);
  useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir: makeTestIR([]) });
  // spec 064: download is gated on attribution, and the download control's
  // aria-label states the blocking reason when it is missing. A working copy that
  // has reached the ship-it screen has an author, so seed one — otherwise the
  // id-announcement test below would assert against the blocked label and fail
  // for a reason that has nothing to do with the id it is checking.
  useWorkingCopyStore.getState().setAttribution({
    authorName: "Alice Example",
    copyrightHolder: "Alice Example",
  });
}

/** The mode toggle, located the way an author does — by its group label. */
function modeToggle() {
  return screen.queryByRole("group", { name: "Keyboard source mode" });
}

beforeEach(resetStores);
afterEach(() => {
  cleanup();
  resetStores();
  vi.clearAllMocks();
});

describe("OutputScreen — left-pane scope", () => {
  it("with a working copy: no mode toggle and no base picker; read-only provenance instead", async () => {
    seedInstantiatedWorkingCopy();

    const { OutputScreen } = await import("./OutputScreen.tsx");
    render(<OutputScreen />);

    expect(modeToggle()).toBeNull();
    expect(screen.queryByTestId("base-picker-stub")).toBeNull();
    expect(screen.queryByText("Open base")).toBeNull();
    expect(screen.queryByText("New from base")).toBeNull();

    // The base is still visible — as provenance, not as a control.
    const provenance = screen.getByTestId("output-base-provenance");
    expect(provenance.textContent).toContain(basicKbdus.id);
    expect(provenance.querySelector("select")).toBeNull();
    expect(provenance.querySelector("button")).toBeNull();
  });

  it("with a working copy: the identity form and KMN editor still render", async () => {
    seedInstantiatedWorkingCopy();

    const { OutputScreen } = await import("./OutputScreen.tsx");
    render(<OutputScreen />);

    // Naming the keyboard and a final source tweak are legitimate at ship time.
    expect(screen.getByLabelText("Keyboard ID")).toBeTruthy();
    expect(screen.getByTestId("kmn-editor-stub")).toBeTruthy();
  });

  it("cold arrival with no working copy: the full picker and mode toggle still render", async () => {
    // No seeding — this is the bookmark / typed-hash path.
    expect(useWorkingCopyStore.getState().isInstantiated()).toBe(false);

    const { OutputScreen } = await import("./OutputScreen.tsx");
    render(<OutputScreen />);

    expect(modeToggle()).not.toBeNull();
    expect(screen.getByTestId("base-picker-stub")).toBeTruthy();
    expect(screen.queryByTestId("output-base-provenance")).toBeNull();
  });

  it("'Change base keyboard' routes to the survey's choose_base step and mutates nothing", async () => {
    seedInstantiatedWorkingCopy();
    // Walk far enough that choose_base is genuinely behind the author, and arm
    // the commit gate the way a real confirmed base does.
    const session = useSurveySessionStore.getState();
    session.advance("choose_base");
    session.advance("track");
    session.advance("characters");
    session.setBaseConfirmed(true);

    const { OutputScreen } = await import("./OutputScreen.tsx");
    render(<OutputScreen />);

    screen.getByTestId("output-change-base").click();

    const after = useSurveySessionStore.getState();
    expect(after.activeStepId).toBe("choose_base");
    // Rewound to what was walked BEFORE the picker — nothing at-or-after it
    // survives for a later Back to walk forward into.
    expect(after.history).toEqual(["identity"]);
    // The stale confirmation must not arm StudioShell's instantiation effect
    // on the next compile settle.
    expect(after.baseConfirmed).toBe(false);
    expect(navigateTo).toHaveBeenCalledWith("survey");

    // The working copy is untouched — re-basing is answered at the destination.
    expect(useWorkingCopyStore.getState().baseKeyboard?.id).toBe(basicKbdus.id);
  });

  it("the download control announces the id it will emit, not the base id", async () => {
    seedInstantiatedWorkingCopy();
    useWorkingCopyStore.getState().setIdentity({ keyboardId: "dagbanli", displayName: "Dagbanli" });

    const { OutputScreen } = await import("./OutputScreen.tsx");
    render(<OutputScreen />);

    const label = screen.getByTestId("emit-download").getAttribute("aria-label") ?? "";
    expect(label).toContain("dagbanli");
    expect(label).not.toContain(basicKbdus.id);
  });
});
