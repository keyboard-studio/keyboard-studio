// Regression: picking the D5 holder choice and then building attribution yields
// exactly ONE holder line. A retyped "SIL International" (single space) would
// emit a second line beside the extracted "SIL  International".

import { describe, it, expect } from "vitest";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { packageAttributionFields, resolveInheritedHolders } from "@keyboard-studio/engine";
import { startCopyrightHolders } from "./startCopyrightHolders.ts";

const irWith = (copyright: string): KeyboardIR =>
  ({ header: { copyright } }) as unknown as KeyboardIR;

const UNREADABLE_LICENSE = "Copyright (c) YYYY ______\n";

describe("D5 holder choice", () => {
  it("offers the header holder when the LICENSE is unreadable, ignoring the override", () => {
    expect(
      startCopyrightHolders(UNREADABLE_LICENSE, null, irWith("(c) 2016 SIL  International")),
    ).toEqual(["SIL  International"]);
  });

  it("resolving via the choice then building attribution emits ONE holder line", () => {
    const [choice] = startCopyrightHolders(
      UNREADABLE_LICENSE,
      null,
      irWith("(c) 2016 SIL  International"),
    );
    expect(choice).toBe("SIL  International");
    const { inherited, licenseUnparseable } = resolveInheritedHolders(UNREADABLE_LICENSE, choice);
    expect(licenseUnparseable).toBeNull();
    const fields = packageAttributionFields(
      { authorName: "New Author", copyrightHolder: choice! },
      inherited,
      2026,
    );
    const line = fields.copyrightLine ?? "";
    expect(line.match(/SIL/g) ?? []).toHaveLength(1);
    expect(line).toContain("SIL  International");
  });
});
