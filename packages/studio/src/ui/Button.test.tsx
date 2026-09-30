import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Button } from "./Button.tsx";

afterEach(() => {
  cleanup();
});

describe("Button — element", () => {
  it("renders a <button> element", () => {
    const { container } = render(<Button>Click me</Button>);
    expect(container.querySelector("button")).not.toBeNull();
  });

  it("defaults type to button (not submit)", () => {
    const { container } = render(<Button>Submit</Button>);
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.type).toBe("button");
  });

  it("renders children as button text", () => {
    const { container } = render(<Button>Next</Button>);
    expect(container.textContent).toBe("Next");
  });
});

describe("Button — primary variant (enabled)", () => {
  it("applies accent background, on-accent text, pointer cursor, and padding", () => {
    const { container } = render(<Button variant="primary">Next</Button>);
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.style.background).toBe("var(--app-accent)");
    expect(btn.style.color).toBe("var(--app-text-on-accent)");
    expect(btn.style.cursor).toBe("pointer");
    expect(btn.style.padding).toBe("8px 18px");
  });
});

describe("Button — primary variant (disabled)", () => {
  it("is natively disabled; applies transparent background, dim text, not-allowed cursor", () => {
    const { container } = render(
      <Button variant="primary" disabled>
        Next
      </Button>,
    );
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.style.background).toBe("transparent");
    expect(btn.style.color).toBe("var(--app-text-disabled)");
    expect(btn.style.cursor).toBe("not-allowed");
  });
});

describe("Button — back variant", () => {
  it("applies transparent background, muted text, border, and padding", () => {
    const { container } = render(<Button variant="back">{"← Back"}</Button>);
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.style.background).toBe("transparent");
    expect(btn.style.color).toBe("var(--app-text-muted)");
    expect(btn.style.borderColor).toBe("var(--app-border)");
    expect(btn.style.padding).toBe("6px 14px");
  });
});

describe("Button — secondary variant (default)", () => {
  it("secondary is the default variant", () => {
    const { container } = render(<Button>Plain</Button>);
    // No baked background — style.background should be empty string
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.style.background).toBe("");
  });

  it("renders without crashing with no variant specified", () => {
    const { container } = render(<Button>Go</Button>);
    expect(container.querySelector("button")).not.toBeNull();
  });
});

describe("Button — style pass-through", () => {
  it("merges caller style over primary variant (ScaffoldForm success-green pattern)", () => {
    const { container } = render(
      <Button variant="primary" style={{ background: "#238636", color: "#e6edf3" }}>
        Create keyboard
      </Button>,
    );
    const btn = container.querySelector("button") as HTMLButtonElement;
    // Caller override wins — #238636
    expect(btn.style.background).toBe("rgb(35, 134, 54)");
  });

  it("forwards className to the button element, merged with the shared ks-* classes", () => {
    const { container } = render(<Button className="my-btn">Click</Button>);
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.className.split(" ")).toContain("my-btn");
  });

  it("forwards aria-disabled attribute from caller", () => {
    const { container } = render(
      <Button variant="primary" disabled aria-disabled={true}>
        Next
      </Button>,
    );
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.getAttribute("aria-disabled")).toBe("true");
  });
});

describe("Button — click behavior", () => {
  it("calls onClick when clicked and not disabled", () => {
    const handler = vi.fn();
    const { container } = render(
      <Button variant="primary" onClick={handler}>
        Go
      </Button>,
    );
    fireEvent.click(container.querySelector("button")!);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when natively disabled", () => {
    const handler = vi.fn();
    const { container } = render(
      <Button variant="primary" disabled onClick={handler}>
        Go
      </Button>,
    );
    fireEvent.click(container.querySelector("button")!);
    // Native disabled prevents click events from firing
    expect(handler).not.toHaveBeenCalled();
  });

  it("calls onClick for back variant", () => {
    const handler = vi.fn();
    const { container } = render(
      <Button variant="back" onClick={handler}>
        {"← Back"}
      </Button>,
    );
    fireEvent.click(container.querySelector("button")!);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("Button — press feedback", () => {
  it.each([
    ["primary", "primary"],
    ["secondary", undefined],
    ["back", "back"],
  ] as const)("applies the ks-press utility class on the %s variant", (_label, variant) => {
    const { container } = render(
      <Button {...(variant !== undefined ? { variant } : {})}>Go</Button>,
    );
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.className.split(" ")).toContain("ks-press");
  });

  it("applies ks-press on the compact size too (footer nav cluster)", () => {
    const { container } = render(
      <Button variant="primary" size="compact">
        Next
      </Button>,
    );
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.className.split(" ")).toContain("ks-press");
  });

  it("keeps the shared ks-* utilities and the caller className together", () => {
    const { container } = render(<Button className="my-btn">Click</Button>);
    const btn = container.querySelector("button") as HTMLButtonElement;
    const classes = btn.className.split(" ");
    expect(classes).toEqual(
      expect.arrayContaining(["ks-focus-ring", "ks-hit-target", "ks-press", "my-btn"]),
    );
  });

  it("keeps ks-press when disabled (native disabled suppresses :active anyway)", () => {
    const { container } = render(
      <Button variant="primary" disabled>
        Go
      </Button>,
    );
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.className.split(" ")).toContain("ks-press");
  });
});

describe("Button — accessible label", () => {
  it("button text is accessible by role", () => {
    render(<Button variant="primary">Confirm</Button>);
    expect(screen.getByRole("button", { name: "Confirm" })).not.toBeNull();
  });
});
