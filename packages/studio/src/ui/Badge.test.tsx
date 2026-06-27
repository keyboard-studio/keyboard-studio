// Unit tests for ui/Badge.tsx
//
// Assertions:
//   1. Renders a <span> element.
//   2. Children appear as text content.
//   3. Default tone ("default") uses CSS_TEXT_MUTED.
//   4. tone="success" uses CSS_SIL_GREEN (var(--sil-green)).
//   5. tone="accent" uses CSS_ACCENT (var(--app-accent)).
//   6. tone="warn" uses CSS_SIL_ORANGE_DARK (var(--sil-orange-dark)).
//   7. tone="subtle" uses CSS_TEXT_SUBTLE (var(--app-text-subtle)).
//   8. Base typographic styles are applied (fontSize 11, fontWeight 600, whiteSpace nowrap).

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Badge } from "./Badge.tsx";

afterEach(() => {
  cleanup();
});

describe("Badge — element and children", () => {
  it("renders a span element", () => {
    const { container } = render(<Badge>Label</Badge>);
    expect(container.querySelector("span")).not.toBeNull();
  });

  it("renders children as text", () => {
    const { container } = render(<Badge>Already supports your language</Badge>);
    expect(container.textContent).toBe("Already supports your language");
  });
});

describe("Badge — tone colors (CSS vars preserved in jsdom)", () => {
  it("no tone (default) → CSS_TEXT_MUTED (var(--app-text-muted))", () => {
    const { container } = render(<Badge>badge</Badge>);
    const el = container.querySelector("span") as HTMLElement;
    expect(el.style.color).toBe("var(--app-text-muted)");
  });

  it("tone='success' → CSS_SIL_GREEN (var(--sil-green))", () => {
    const { container } = render(<Badge tone="success">match</Badge>);
    const el = container.querySelector("span") as HTMLElement;
    expect(el.style.color).toBe("var(--sil-green)");
  });

  it("tone='accent' → CSS_ACCENT (var(--app-accent))", () => {
    const { container } = render(<Badge tone="accent">script</Badge>);
    const el = container.querySelector("span") as HTMLElement;
    expect(el.style.color).toBe("var(--app-accent)");
  });

  it("tone='warn' → CSS_SIL_ORANGE_DARK (var(--sil-orange-dark))", () => {
    const { container } = render(<Badge tone="warn">cross-script</Badge>);
    const el = container.querySelector("span") as HTMLElement;
    expect(el.style.color).toBe("var(--sil-orange-dark)");
  });

  it("tone='subtle' → CSS_TEXT_SUBTLE (var(--app-text-subtle))", () => {
    const { container } = render(<Badge tone="subtle">fallback</Badge>);
    const el = container.querySelector("span") as HTMLElement;
    expect(el.style.color).toBe("var(--app-text-subtle)");
  });
});

describe("Badge — style and className passthrough", () => {
  it("merges caller style AFTER tone styles (override wins)", () => {
    const { container } = render(
      <Badge tone="accent" style={{ color: "red" }}>x</Badge>,
    );
    const el = container.querySelector("span") as HTMLElement;
    // Caller override should win over tone color.
    expect(el.style.color).toBe("red");
  });

  it("forwards className to the span", () => {
    const { container } = render(
      <Badge className="badge-custom">x</Badge>,
    );
    const el = container.querySelector("span") as HTMLElement;
    expect(el.classList.contains("badge-custom")).toBe(true);
  });

  it("renders without style/className props (existing call sites unchanged)", () => {
    const { container } = render(<Badge tone="success">ok</Badge>);
    const el = container.querySelector("span") as HTMLElement;
    expect(el.style.color).toBe("var(--sil-green)");
  });
});

describe("Badge — base typographic styles", () => {
  it("applies fontSize 11px", () => {
    const { container } = render(<Badge>x</Badge>);
    const el = container.querySelector("span") as HTMLElement;
    expect(el.style.fontSize).toBe("11px");
  });

  it("applies fontWeight 600", () => {
    const { container } = render(<Badge>x</Badge>);
    const el = container.querySelector("span") as HTMLElement;
    expect(el.style.fontWeight).toBe("600");
  });

  it("applies whiteSpace nowrap", () => {
    const { container } = render(<Badge>x</Badge>);
    const el = container.querySelector("span") as HTMLElement;
    expect(el.style.whiteSpace).toBe("nowrap");
  });
});
