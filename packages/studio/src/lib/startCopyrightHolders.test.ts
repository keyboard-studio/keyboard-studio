import { describe, it, expect } from "vitest";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { startCopyrightHolders } from "./startCopyrightHolders.ts";

const irWith = (copyright: string): KeyboardIR =>
  ({ header: { copyright } }) as unknown as KeyboardIR;

describe("startCopyrightHolders", () => {
  it("returns the exact parsed holder name from LICENSE.md", () => {
    expect(
      startCopyrightHolders("Copyright (c) 2016 SIL  International\n", null, null),
    ).toEqual(["SIL  International"]);
  });

  it("falls back to the &COPYRIGHT header when there is no license", () => {
    expect(startCopyrightHolders(null, null, irWith("(c) 2020 Acme Org"))).toEqual(["Acme Org"]);
  });

  it("is empty (selector hidden) when nothing parses", () => {
    expect(startCopyrightHolders(null, null, irWith(""))).toEqual([]);
    expect(startCopyrightHolders(null, null, null)).toEqual([]);
  });
});
