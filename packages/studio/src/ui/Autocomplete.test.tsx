// Unit tests for the Autocomplete primitive (packages/studio/src/ui/Autocomplete.tsx).
//
// Coverage:
//   1. Renders an <input type="text"> with a list attribute.
//   2. Renders a <datalist> with the correct id.
//   3. Each option string appears as a datalist <option>.
//   4. Passed props (value, onChange, disabled, placeholder) work.
//   5. style override passes through (merges over base styles).
//   6. className override passes through.
//   7. autoComplete="off" is always applied.
//   8. listId is derived as `datalist-${id}` when id is provided.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { Autocomplete } from "./Autocomplete.tsx";

afterEach(() => {
  cleanup();
});

describe("Autocomplete — element structure", () => {
  it("renders an <input> with type=text", () => {
    render(<Autocomplete options={[]} id="ac-test" />);
    const el = screen.getByRole("combobox");
    expect(el.tagName).toBe("INPUT");
    expect((el as HTMLInputElement).type).toBe("text");
  });

  it("links input list attribute to datalist id derived from id prop", () => {
    const { container } = render(<Autocomplete options={[]} id="my-field" />);
    const input = container.querySelector("input") as HTMLInputElement;
    const datalist = container.querySelector("datalist") as HTMLDataListElement;
    expect(input.getAttribute("list")).toBe("datalist-my-field");
    expect(datalist.id).toBe("datalist-my-field");
  });

  it("renders each option as a datalist <option>", () => {
    const { container } = render(
      <Autocomplete options={["en", "fr", "de"]} id="lang" />
    );
    const options = container.querySelectorAll("datalist option");
    expect(options.length).toBe(3);
    expect((options[0] as HTMLOptionElement).value).toBe("en");
    expect((options[1] as HTMLOptionElement).value).toBe("fr");
    expect((options[2] as HTMLOptionElement).value).toBe("de");
  });

  it("renders an empty datalist when options is empty", () => {
    const { container } = render(<Autocomplete options={[]} id="empty" />);
    const options = container.querySelectorAll("datalist option");
    expect(options.length).toBe(0);
  });
});

describe("Autocomplete — prop passthrough", () => {
  it("forwards value prop", () => {
    render(<Autocomplete options={[]} id="v" value="hello" onChange={() => undefined} />);
    const el = screen.getByRole<HTMLInputElement>("combobox");
    expect(el.value).toBe("hello");
  });

  it("calls onChange when the value changes", () => {
    const handler = vi.fn();
    render(<Autocomplete options={[]} id="oc" value="" onChange={handler} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "x" } });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("respects disabled prop", () => {
    render(<Autocomplete options={[]} id="dis" disabled />);
    expect((screen.getByRole<HTMLInputElement>("combobox")).disabled).toBe(true);
  });

  it("respects placeholder prop", () => {
    render(<Autocomplete options={[]} id="ph" placeholder="Pick one" />);
    expect(screen.getByPlaceholderText("Pick one")).toBeDefined();
  });
});

describe("Autocomplete — autoComplete attribute", () => {
  it("always sets autoComplete=off on the input", () => {
    const { container } = render(<Autocomplete options={[]} id="ac-off" />);
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.getAttribute("autocomplete")).toBe("off");
  });
});

describe("Autocomplete — style and className override", () => {
  it("merges caller style over base styles", () => {
    const { container } = render(
      <Autocomplete options={[]} id="s" style={{ color: "green" }} />
    );
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.style.color).toBe("green");
  });

  it("forwards className to the input", () => {
    const { container } = render(
      <Autocomplete options={[]} id="cn" className="ac-class" />
    );
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.className).toBe("ac-class");
  });
});
