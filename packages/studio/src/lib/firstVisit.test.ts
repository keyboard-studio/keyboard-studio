import { describe, it, expect, afterEach } from "vitest";
import { hasVisited, markVisited } from "./firstVisit.ts";

afterEach(() => {
  localStorage.clear();
});

describe("firstVisit", () => {
  it("reports not-visited for a pristine browser", () => {
    expect(hasVisited()).toBe(false);
  });

  it("reports visited after markVisited()", () => {
    markVisited();
    expect(hasVisited()).toBe(true);
  });

  it("persists the flag under the ks.visited key", () => {
    markVisited();
    expect(localStorage.getItem("ks.visited")).toBe("1");
  });

  it("is idempotent", () => {
    markVisited();
    markVisited();
    expect(hasVisited()).toBe(true);
  });

  it("treats any non-\"1\" value as not-visited", () => {
    localStorage.setItem("ks.visited", "true");
    expect(hasVisited()).toBe(false);
  });
});
