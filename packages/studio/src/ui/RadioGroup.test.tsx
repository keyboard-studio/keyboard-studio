import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { RadioGroup } from "./RadioGroup.tsx";

afterEach(() => {
  cleanup();
});

const LIST_OPTIONS = [
  { value: "x", label: "X-ray" },
  { value: "y", label: "Yankee", note: "a note" },
];

describe("RadioGroup — list mode (default)", () => {
  it("renders a div with role=radiogroup", () => {
    render(
      <RadioGroup name="test" value={null} options={LIST_OPTIONS} onChange={() => undefined} />
    );
    expect(screen.getByRole("radiogroup")).toBeDefined();
  });

  it("renders one radio per option", () => {
    render(
      <RadioGroup name="test" value={null} options={LIST_OPTIONS} onChange={() => undefined} />
    );
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("checks the radio matching the current value", () => {
    render(
      <RadioGroup name="test" value="x" options={LIST_OPTIONS} onChange={() => undefined} />
    );
    const xRadio = screen.getByRole("radio", { name: /X-ray/ }) as HTMLInputElement;
    const yRadio = screen.getByRole("radio", { name: /Yankee/ }) as HTMLInputElement;
    expect(xRadio.checked).toBe(true);
    expect(yRadio.checked).toBe(false);
  });

  it("calls onChange with the option value on click", () => {
    const onChange = vi.fn();
    render(
      <RadioGroup name="test" value={null} options={LIST_OPTIONS} onChange={onChange} />
    );
    fireEvent.click(screen.getByRole("radio", { name: /Yankee/ }));
    expect(onChange).toHaveBeenCalledWith("y");
  });

  it("uses list-mode accent #6ea8fe by default", () => {
    render(
      <RadioGroup name="test" value={null} options={LIST_OPTIONS} onChange={() => undefined} />
    );
    const radio = screen.getAllByRole("radio")[0] as HTMLInputElement;
    expect(radio.style.accentColor).toBe("#6ea8fe");
  });

  it("renders a note span when option.note is present", () => {
    render(
      <RadioGroup name="test" value={null} options={LIST_OPTIONS} onChange={() => undefined} />
    );
    expect(screen.getByText("a note")).toBeDefined();
  });

  it("accepts caller accent override in list mode", () => {
    render(
      <RadioGroup
        name="test"
        value={null}
        options={LIST_OPTIONS}
        accent="#ff0000"
        onChange={() => undefined}
      />
    );
    const radio = screen.getAllByRole("radio")[0] as HTMLInputElement;
    expect(radio.style.accentColor).toBe("#ff0000");
  });

  it("no radio is checked when value is null", () => {
    render(
      <RadioGroup name="test" value={null} options={LIST_OPTIONS} onChange={() => undefined} />
    );
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios.every((r) => !r.checked)).toBe(true);
  });
});

describe("RadioGroup — bool mode", () => {
  it("renders a div with role=radiogroup", () => {
    render(
      <RadioGroup mode="bool" name="q1" value={null} options={[]} onChange={() => undefined} />
    );
    expect(screen.getByRole("radiogroup")).toBeDefined();
  });

  it("synthesizes exactly Yes and No radio options", () => {
    render(
      <RadioGroup mode="bool" name="q1" value={null} options={[]} onChange={() => undefined} />
    );
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
    expect(screen.getByLabelText("Yes")).toBeDefined();
    expect(screen.getByLabelText("No")).toBeDefined();
  });

  it("checks Yes when value is 'true'", () => {
    render(
      <RadioGroup mode="bool" name="q1" value="true" options={[]} onChange={() => undefined} />
    );
    const yes = screen.getByLabelText("Yes") as HTMLInputElement;
    const no = screen.getByLabelText("No") as HTMLInputElement;
    expect(yes.checked).toBe(true);
    expect(no.checked).toBe(false);
  });

  it("checks No when value is 'false'", () => {
    render(
      <RadioGroup mode="bool" name="q1" value="false" options={[]} onChange={() => undefined} />
    );
    const yes = screen.getByLabelText("Yes") as HTMLInputElement;
    const no = screen.getByLabelText("No") as HTMLInputElement;
    expect(yes.checked).toBe(false);
    expect(no.checked).toBe(true);
  });

  it("calls onChange with 'true' when Yes clicked", () => {
    const onChange = vi.fn();
    render(
      <RadioGroup mode="bool" name="q1" value={null} options={[]} onChange={onChange} />
    );
    fireEvent.click(screen.getByLabelText("Yes"));
    expect(onChange).toHaveBeenCalledWith("true");
  });

  it("calls onChange with 'false' when No clicked", () => {
    const onChange = vi.fn();
    render(
      <RadioGroup mode="bool" name="q1" value={null} options={[]} onChange={onChange} />
    );
    fireEvent.click(screen.getByLabelText("No"));
    expect(onChange).toHaveBeenCalledWith("false");
  });

  it("uses green accent #3fb950 in bool mode — not list accent", () => {
    render(
      <RadioGroup mode="bool" name="q1" value={null} options={[]} onChange={() => undefined} />
    );
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    for (const radio of radios) {
      expect(radio.style.accentColor).toBe("#3fb950");
      expect(radio.style.accentColor).not.toBe("#6ea8fe");
    }
  });

  it("accepts caller accent override in bool mode", () => {
    render(
      <RadioGroup
        mode="bool"
        name="q1"
        value={null}
        options={[]}
        accent="#abcdef"
        onChange={() => undefined}
      />
    );
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    for (const radio of radios) {
      expect(radio.style.accentColor).toBe("#abcdef");
    }
  });

  it("ignores list options in bool mode (synthesizes yes/no only)", () => {
    render(
      <RadioGroup
        mode="bool"
        name="q1"
        value={null}
        options={[{ value: "ignored", label: "Should not appear" }]}
        onChange={() => undefined}
      />
    );
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.queryByText("Should not appear")).toBeNull();
  });

  it("ariaLabelledby is set on the radiogroup div in bool mode when provided", () => {
    render(
      <RadioGroup
        mode="bool"
        name="q1"
        value={null}
        options={[]}
        onChange={() => undefined}
        ariaLabelledby="label-q1"
      />
    );
    const group = screen.getByRole("radiogroup") as HTMLElement;
    expect(group.getAttribute("aria-labelledby")).toBe("label-q1");
  });
});

describe("RadioGroup — ariaLabelledby", () => {
  it("sets aria-labelledby on the radiogroup div in list mode when provided", () => {
    render(
      <RadioGroup
        name="test"
        value={null}
        options={LIST_OPTIONS}
        onChange={() => undefined}
        ariaLabelledby="label-test"
      />
    );
    const group = screen.getByRole("radiogroup") as HTMLElement;
    expect(group.getAttribute("aria-labelledby")).toBe("label-test");
  });

  it("aria-labelledby is absent when not provided (default behavior preserved)", () => {
    render(
      <RadioGroup name="test" value={null} options={LIST_OPTIONS} onChange={() => undefined} />
    );
    const group = screen.getByRole("radiogroup") as HTMLElement;
    expect(group.getAttribute("aria-labelledby")).toBeNull();
  });
});
