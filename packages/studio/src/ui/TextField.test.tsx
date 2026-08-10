// Unit tests for the TextField primitive (packages/studio/src/ui/TextField.tsx).
//
// Coverage:
//   1. Renders an <input type="text"> element.
//   2. Passed props (value, onChange, disabled, placeholder) work.
//   3. The error variant applies ERROR_BORDER (var(--app-danger-border)) as border color.
//   4. The mono variant applies CSS_FONT_MONO (var(--app-font-mono)) as fontFamily.
//   5. style override passes through (merges over base styles).
//   6. className override passes through.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { TextField } from "./TextField.tsx";
import { CSS_FONT_MONO, FONT } from "./theme.ts";

// theme.ts constants resolve to `var(--app-*)` token strings (epic #533) —
// jsdom does not resolve CSS custom properties, so the raw string is preserved.
const ERROR_BORDER_TOKEN = "var(--app-danger-border)";
const BORDER_TOKEN = "var(--app-border)";

afterEach(() => {
  cleanup();
});

describe("TextField — element", () => {
  it("renders an <input> with type=text", () => {
    render(<TextField />);
    const el = screen.getByRole("textbox");
    expect(el.tagName).toBe("INPUT");
    expect((el as HTMLInputElement).type).toBe("text");
  });
});

describe("TextField — prop passthrough", () => {
  it("forwards value prop", () => {
    render(<TextField value="hello" onChange={() => undefined} />);
    const el = screen.getByRole<HTMLInputElement>("textbox");
    expect(el.value).toBe("hello");
  });

  it("calls onChange when the value changes", () => {
    const handler = vi.fn();
    render(<TextField value="" onChange={handler} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "x" } });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("respects disabled prop", () => {
    render(<TextField disabled />);
    expect((screen.getByRole<HTMLInputElement>("textbox")).disabled).toBe(true);
  });

  it("respects placeholder prop", () => {
    render(<TextField placeholder="Type here" />);
    expect(screen.getByPlaceholderText("Type here")).toBeDefined();
  });
});

describe("TextField — error variant", () => {
  it("applies ERROR_BORDER (var(--app-danger-border)) when error=true", () => {
    render(<TextField error />);
    const el = screen.getByRole("textbox") as HTMLInputElement;
    expect(el.style.borderColor).toBe(ERROR_BORDER_TOKEN);
  });

  it("applies normal BORDER (var(--app-border)) when error is not set", () => {
    render(<TextField />);
    const el = screen.getByRole("textbox") as HTMLInputElement;
    expect(el.style.borderColor).toBe(BORDER_TOKEN);
  });
});

describe("TextField — mono variant", () => {
  it("applies CSS_FONT_MONO when mono=true", () => {
    render(<TextField mono />);
    const el = screen.getByRole("textbox") as HTMLInputElement;
    expect(el.style.fontFamily).toBe(CSS_FONT_MONO);
  });

  it("applies FONT (var(--app-font)) when mono is not set", () => {
    render(<TextField />);
    const el = screen.getByRole("textbox") as HTMLInputElement;
    // theme.ts constants resolve to `var(--app-*)` token strings (epic #533) —
    // jsdom does not resolve CSS custom properties, so the raw string is preserved.
    expect(el.style.fontFamily).toBe(FONT);
  });
});

describe("TextField — style and className override", () => {
  it("merges caller style over base styles", () => {
    render(<TextField style={{ color: "red" }} />);
    const el = screen.getByRole("textbox") as HTMLInputElement;
    expect(el.style.color).toBe("red");
  });

  it("forwards className, merged with the shared ks-* classes", () => {
    render(<TextField className="my-class" />);
    const el = screen.getByRole("textbox") as HTMLInputElement;
    expect(el.className.split(" ")).toContain("my-class");
  });
});
