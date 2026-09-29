// OSKFrame viewport-relative sizing tests (mobile adaptation, Phase 4).
//
// Contract:
//   - desktop (1280×800): the iframe keeps the long-standing 560px frame;
//   - narrow portrait (390×844): viewport-relative — min(560, max(240, 844-260)) = 560;
//   - scarce-height landscape (844×390): max(240, 390-260) floors at 240;
//   - mid height (600px): min(560, max(240, 600-260)) = 340 — proves the
//     formula is live, not just the two endpoints.
//
// The postMessage channel is mocked (sizing is host layout; the engine and
// iframe internals are untouched). Viewport geometry is stubbed via
// `window.innerWidth/innerHeight`.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup, act } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { OSKFrame } from "./OSKFrame.tsx";
import type { Stage } from "../hooks/useKeyboardArtifact.ts";

vi.mock("../hooks/useOskChannel.ts", () => ({
  useOskChannel: () => ({
    send: vi.fn(),
    lastEvent: null,
    engineReady: false,
    engineError: null,
    textValue: "",
  }),
}));

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
  act(() => {
    window.dispatchEvent(new Event("resize"));
  });
}

const IDLE_STAGE: Stage = { kind: "idle" };

function renderFrame(): void {
  render(
    <OSKFrame
      baseKeyboard={null}
      oskMode="desktop"
      stage={IDLE_STAGE}
      retry={() => {}}
    />,
  );
}

function iframeHeight(): string {
  const iframe = screen.getByTitle("On-screen keyboard preview");
  return (iframe as HTMLIFrameElement).style.height;
}

beforeEach(() => {
  setViewport(1280, 800);
});

afterEach(() => {
  cleanup();
  setViewport(1280, 800);
});

describe("OSKFrame — viewport-relative sizing", () => {
  it("keeps the 560px desktop frame at 1280×800", () => {
    setViewport(1280, 800);
    renderFrame();
    expect(iframeHeight()).toBe("560px");
  });

  it("keeps the 560px frame at a tall-but-not-desktop height (1280×600)", () => {
    // 600 > shortHeightMax (500): not compact — desktop keeps its frame.
    setViewport(1280, 600);
    renderFrame();
    expect(iframeHeight()).toBe("560px");
  });

  it("fills to 560px at narrow portrait 390×844 (844 − 120 chrome = 724, capped)", () => {
    setViewport(390, 844);
    renderFrame();
    expect(iframeHeight()).toBe("560px");
  });

  it("shrinks to 380px at the compact threshold 1280×500 (500 − 120)", () => {
    setViewport(1280, 500);
    renderFrame();
    expect(iframeHeight()).toBe("380px");
  });

  it("shrinks to 270px in scarce-height landscape 844×390 (390 − 120)", () => {
    setViewport(844, 390);
    renderFrame();
    expect(iframeHeight()).toBe("270px");
  });

  it("floors at 240px when the chrome estimate overshoots (400×320)", () => {
    setViewport(400, 320);
    renderFrame();
    // 320 − 120 = 200 < 240 floor — the keyboard stays usable.
    expect(iframeHeight()).toBe("240px");
  });
});
