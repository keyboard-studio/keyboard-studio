// Button.test.tsx — vitest + @testing-library/react
// Asserts element/role, variant styles, disabled handling, and style pass-through.
//
// No @testing-library/jest-dom — DOM style properties accessed directly on the
// element, matching the pattern in TextField.test.tsx and Badge.test.tsx.
//
// jsdom normalizes hex colors to rgb() in inline styles:
//   #1f6feb → rgb(31, 111, 235)
//   #484f58 → rgb(72, 79, 88)
//   #8b949e → rgb(139, 148, 158)
//   #30363d → rgb(48, 54, 61)
//   #238636 → rgb(35, 134, 54)

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
  it("applies blue background (#1f6feb)", () => {
    const { container } = render(<Button variant="primary">Next</Button>);
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.style.background).toBe("rgb(31, 111, 235)");
  });

  it("applies white text", () => {
    const { container } = render(<Button variant="primary">Next</Button>);
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.style.color).toBe("rgb(255, 255, 255)");
  });

  it("applies cursor:pointer", () => {
    const { container } = render(<Button variant="primary">Next</Button>);
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.style.cursor).toBe("pointer");
  });

  it("applies padding 8px 18px", () => {
    const { container } = render(<Button variant="primary">Next</Button>);
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.style.padding).toBe("8px 18px");
  });
});

describe("Button — primary variant (disabled)", () => {
  it("is natively disabled when disabled prop is set", () => {
    const { container } = render(
      <Button variant="primary" disabled>
        Next
      </Button>,
    );
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("applies transparent background when disabled", () => {
    const { container } = render(
      <Button variant="primary" disabled>
        Next
      </Button>,
    );
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.style.background).toBe("transparent");
  });

  it("applies dim text color (#484f58) when disabled", () => {
    const { container } = render(
      <Button variant="primary" disabled>
        Next
      </Button>,
    );
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.style.color).toBe("rgb(72, 79, 88)");
  });

  it("applies cursor:not-allowed when disabled", () => {
    const { container } = render(
      <Button variant="primary" disabled>
        Next
      </Button>,
    );
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.style.cursor).toBe("not-allowed");
  });
});

describe("Button — back variant", () => {
  it("applies transparent background", () => {
    const { container } = render(<Button variant="back">{"← Back"}</Button>);
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.style.background).toBe("transparent");
  });

  it("applies muted text color (#8b949e)", () => {
    const { container } = render(<Button variant="back">{"← Back"}</Button>);
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.style.color).toBe("rgb(139, 148, 158)");
  });

  it("applies border 1px solid #30363d", () => {
    const { container } = render(<Button variant="back">{"← Back"}</Button>);
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.style.borderColor).toBe("rgb(48, 54, 61)");
  });

  it("applies padding 6px 14px", () => {
    const { container } = render(<Button variant="back">{"← Back"}</Button>);
    const btn = container.querySelector("button") as HTMLButtonElement;
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

  it("forwards className to the button element", () => {
    const { container } = render(<Button className="my-btn">Click</Button>);
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.className).toBe("my-btn");
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

describe("Button — accessible label", () => {
  it("button text is accessible by role", () => {
    render(<Button variant="primary">Confirm</Button>);
    expect(screen.getByRole("button", { name: "Confirm" })).not.toBeNull();
  });
});
