// Unit tests for CharScrollStrip — the horizontal character-scroll strip
// shared by MechanismGallery (physical) and TouchGallery (touch). See the
// file-header comment on CharScrollStrip.tsx for the testid scheme (chip/
// badge key off the FULL hyphen-joined hex of every codepoint in the
// grapheme, not just the first one — the reason for "full", not "first", is
// exactly the collision case the last test below locks down).

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../../../test/renderWithI18n.tsx";
import { CharScrollStrip } from "./CharScrollStrip.tsx";
import type { MechanismAssignment } from "@keyboard-studio/contracts";
import { PATTERN_DEADKEY } from "../patternIds.ts";

afterEach(() => {
  cleanup();
});

describe("CharScrollStrip — chip rendering", () => {
  it("renders one chip per character in `chars`", () => {
    render(
      <CharScrollStrip
        chars={["a", "b", "c"]}
        currentChar="a"
        onSelectChar={vi.fn()}
        assignments={[]}
        modality="physical"
      />,
    );

    expect(screen.getByTestId("char-scroll-chip-0061")).toBeTruthy();
    expect(screen.getByTestId("char-scroll-chip-0062")).toBeTruthy();
    expect(screen.getByTestId("char-scroll-chip-0063")).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("renders null (no strip) when `chars` is empty", () => {
    const { container } = render(
      <CharScrollStrip
        chars={[]}
        currentChar={null}
        onSelectChar={vi.fn()}
        assignments={[]}
        modality="physical"
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("CharScrollStrip — producer-count badge", () => {
  it("badges an unproduced character RED at count 0", () => {
    render(
      <CharScrollStrip
        chars={["a"]}
        currentChar="a"
        onSelectChar={vi.fn()}
        assignments={[]}
        modality="physical"
      />,
    );

    const badge = screen.getByTestId("char-scroll-badge-0061");
    expect(badge.textContent).toBe("0");
    expect(badge.style.color).toBe("rgb(248, 81, 73)"); // #f85149 — the badge-bad color
  });

  it("badges a produced character GREEN at count >= 1, with the count as its text", () => {
    const assignments: MechanismAssignment[] = [
      {
        scope: "individual",
        target: "a",
        modality: "physical",
        mechanisms: [{ patternId: PATTERN_DEADKEY, slotValues: { baseLetters: "a" } }],
      },
    ];

    render(
      <CharScrollStrip
        chars={["a"]}
        currentChar="a"
        onSelectChar={vi.fn()}
        assignments={assignments}
        modality="physical"
      />,
    );

    const badge = screen.getByTestId("char-scroll-badge-0061");
    expect(badge.textContent).toBe("1");
    expect(badge.style.color).toBe("rgb(86, 211, 100)"); // #56d364 — the badge-good color
  });

  it("computes each chip's badge from the shared getCharMechanisms selector, not a re-derived count — a modality mismatch still reads 0", () => {
    const assignments: MechanismAssignment[] = [
      {
        scope: "individual",
        target: "a",
        modality: "touch", // caller below asks for "physical" — must not count
        mechanisms: [{ patternId: PATTERN_DEADKEY }],
      },
    ];

    render(
      <CharScrollStrip
        chars={["a"]}
        currentChar="a"
        onSelectChar={vi.fn()}
        assignments={assignments}
        modality="physical"
      />,
    );

    expect(screen.getByTestId("char-scroll-badge-0061").textContent).toBe("0");
  });
});

describe("CharScrollStrip — chip click", () => {
  it("clicking a chip calls onSelectChar with that exact character", () => {
    const onSelectChar = vi.fn();
    render(
      <CharScrollStrip
        chars={["a", "b"]}
        currentChar="a"
        onSelectChar={onSelectChar}
        assignments={[]}
        modality="physical"
      />,
    );

    fireEvent.click(screen.getByTestId("char-scroll-chip-0062"));

    expect(onSelectChar).toHaveBeenCalledTimes(1);
    expect(onSelectChar).toHaveBeenCalledWith("b");
  });
});

describe("CharScrollStrip — full-codepoint testid keying (no first-codepoint collision)", () => {
  it("gives two distinct multi-codepoint graphemes sharing a base codepoint distinct, non-colliding testids", () => {
    // "e" + combining acute (U+0301) vs "e" + combining grave (U+0300) — both
    // start with the SAME base codepoint (U+0065). Keying the testid off only
    // the first codepoint (the pre-fix scheme) would collide; keying off the
    // FULL sequence must not.
    const eAcute = "é";
    const eGrave = "è";

    render(
      <CharScrollStrip
        chars={[eAcute, eGrave]}
        currentChar={eAcute}
        onSelectChar={vi.fn()}
        assignments={[]}
        modality="physical"
      />,
    );

    const acuteChip = screen.getByTestId("char-scroll-chip-0065-0301");
    const graveChip = screen.getByTestId("char-scroll-chip-0065-0300");

    expect(acuteChip).toBeTruthy();
    expect(graveChip).toBeTruthy();
    expect(acuteChip).not.toBe(graveChip);
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("clicking each of the two colliding-base-codepoint chips navigates to its OWN distinct character, not the other one", () => {
    const onSelectChar = vi.fn();
    const eAcute = "é";
    const eGrave = "è";

    render(
      <CharScrollStrip
        chars={[eAcute, eGrave]}
        currentChar={eAcute}
        onSelectChar={onSelectChar}
        assignments={[]}
        modality="physical"
      />,
    );

    fireEvent.click(screen.getByTestId("char-scroll-chip-0065-0300"));
    expect(onSelectChar).toHaveBeenCalledWith(eGrave);
    expect(onSelectChar).not.toHaveBeenCalledWith(eAcute);
  });
});
