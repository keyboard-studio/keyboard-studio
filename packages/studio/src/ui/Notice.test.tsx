// Unit tests for ui/Notice.tsx
//
// Assertions:
//   1. Renders a <div> element.
//   2. tone="info" (default) → role="note".
//   3. tone="warn" → role="status".
//   4. tone="error" → role="alert".
//   5. Info tone uses TEXT_DIM (#8b949e) color — verbatim from NoticeField.
//   6. Warn tone uses WARNING (#d29922) color.
//   7. Error tone uses ERROR_TEXT (#f0a0a0) color.
//   8. Base layout styles are applied (padding, borderRadius, fontSize).
//   9. Children appear as text content.

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Notice } from "./Notice.tsx";

afterEach(() => {
  cleanup();
});

describe("Notice — element and children", () => {
  it("renders a div element", () => {
    const { container } = render(<Notice>Content</Notice>);
    expect(container.querySelector("div")).not.toBeNull();
  });

  it("renders children as text", () => {
    const { container } = render(<Notice>Notice text</Notice>);
    expect(container.textContent).toBe("Notice text");
  });
});

describe("Notice — tone→role mapping", () => {
  it("no tone prop (default info) → role='note'", () => {
    const { container } = render(<Notice>Info</Notice>);
    expect(container.querySelector("div")?.getAttribute("role")).toBe("note");
  });

  it("tone='info' → role='note'", () => {
    const { container } = render(<Notice tone="info">Info</Notice>);
    expect(container.querySelector("div")?.getAttribute("role")).toBe("note");
  });

  it("tone='warn' → role='status'", () => {
    const { container } = render(<Notice tone="warn">Warn</Notice>);
    expect(container.querySelector("div")?.getAttribute("role")).toBe("status");
  });

  it("tone='error' → role='alert'", () => {
    const { container } = render(<Notice tone="error">Error</Notice>);
    expect(container.querySelector("div")?.getAttribute("role")).toBe("alert");
  });
});

describe("Notice — tone colors", () => {
  it("info tone uses TEXT_DIM color (#8b949e → rgb(139, 148, 158))", () => {
    const { container } = render(<Notice tone="info">Info</Notice>);
    const el = container.querySelector("div") as HTMLElement;
    expect(el.style.color).toBe("rgb(139, 148, 158)");
  });

  it("warn tone uses WARNING color (#d29922 → rgb(210, 153, 34))", () => {
    const { container } = render(<Notice tone="warn">Warn</Notice>);
    const el = container.querySelector("div") as HTMLElement;
    expect(el.style.color).toBe("rgb(210, 153, 34)");
  });

  it("error tone uses ERROR_TEXT color (#f0a0a0 → rgb(240, 160, 160))", () => {
    const { container } = render(<Notice tone="error">Error</Notice>);
    const el = container.querySelector("div") as HTMLElement;
    expect(el.style.color).toBe("rgb(240, 160, 160)");
  });
});

describe("Notice — base layout styles", () => {
  it("applies padding '14px 16px'", () => {
    const { container } = render(<Notice>x</Notice>);
    const el = container.querySelector("div") as HTMLElement;
    // jsdom normalises shorthand; check that the value contains the numbers.
    expect(el.style.padding).toBe("14px 16px");
  });

  it("applies fontSize 13px", () => {
    const { container } = render(<Notice>x</Notice>);
    const el = container.querySelector("div") as HTMLElement;
    expect(el.style.fontSize).toBe("13px");
  });

  it("applies borderRadius 8px", () => {
    const { container } = render(<Notice>x</Notice>);
    const el = container.querySelector("div") as HTMLElement;
    expect(el.style.borderRadius).toBe("8px");
  });
});
