import { beforeEach, describe, expect, it } from "vitest";
import { addToInventory, charactersOf, withCharacters } from "./openInventory.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";

describe("charactersOf / withCharacters", () => {
  it("splits typed text into distinct NFC characters and drops whitespace", () => {
    expect(charactersOf("a  ʻ a\n")).toEqual(["a", "ʻ"]);
    expect(charactersOf("é")).toEqual(["é"]);
  });

  it("appends only characters not already present, comparing in NFC", () => {
    expect(withCharacters(["a", "é"], ["é", "ʻ"])).toEqual(["a", "é", "ʻ"]);
  });
});

describe("addToInventory", () => {
  beforeEach(() => useWorkingCopyStore.getState().reset());

  it("records the union in the session's confirmed inventory and reports whether it changed", () => {
    expect(addToInventory(["a", "b"])).toBe(true);
    expect(addToInventory(["b"])).toBe(false);
    expect(addToInventory(["ʻ"])).toBe(true);
    expect(useWorkingCopyStore.getState().session.confirmedInventory).toEqual(["a", "b", "ʻ"]);
  });
});
