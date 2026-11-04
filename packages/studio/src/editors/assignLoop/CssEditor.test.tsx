// CssEditor — the live touch preview must read the working copy's raw touch-layout JSON through the codec, not cast it to the IR.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { CssEditor } from "./CssEditor.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";

// Monaco cannot load under vitest (see TouchGallery.keyMode.test.tsx); the preview is what is under test.
vi.mock("./CssCodePane.tsx", () => ({ CssCodePane: () => null }));

// The shape the touch step writes: the raw Keyman touch-layout file, with `layer`/`row`/`key`, not the IR's `platforms`.
const RAW_TOUCH_LAYOUT = JSON.stringify({
  phone: {
    font: "Tahoma",
    layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_Q", text: "q" }] }] }],
  },
});

describe("CssEditor touch preview", () => {
  beforeEach(() => {
    useWorkingCopyStore.setState({ ir: null, touchLayoutJson: RAW_TOUCH_LAYOUT });
  });

  it("renders the phone layout from raw touch-layout JSON without throwing", () => {
    render(<CssEditor onComplete={() => undefined} onBack={() => undefined} />);
    expect(screen.getAllByText("q").length).toBeGreaterThan(0);
  });

  it("falls back to the empty notice when the layout does not parse", () => {
    useWorkingCopyStore.setState({ touchLayoutJson: "not json" });
    render(<CssEditor onComplete={() => undefined} onBack={() => undefined} />);
    expect(screen.getAllByText("No touch layout available.").length).toBeGreaterThan(0);
  });
});
