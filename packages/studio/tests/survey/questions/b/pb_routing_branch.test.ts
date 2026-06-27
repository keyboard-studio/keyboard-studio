import { describe, it, expect } from "vitest";
import { definition, fixtures } from "../../../../src/survey/questions/b/pb_routing_branch.ts";

describe("pb_routing_branch — definition", () => {
  it("has correct id", () => {
    expect(definition.id).toBe("pb_routing_branch");
  });
  it("is engine-resolved (never rendered to user)", () => {
    expect((definition as Record<string, unknown>)["engine_resolved"]).toBe(true);
  });
  it("routes non-roman to pb_non_roman_branch", () => {
    const routes = definition.next as Array<{ condition?: string; goto: string | null; default?: boolean }>;
    const nonRomanRoute = routes.find(r => r.condition === "ctx.routing_group == 'non-roman'");
    expect(nonRomanRoute?.goto).toBe("pb_non_roman_branch");
  });
  it("has a default route to pb_standard_letters", () => {
    const routes = definition.next as Array<{ condition?: string; goto: string | null; default?: boolean }>;
    const defaultRoute = routes.find(r => r.default === true);
    expect(defaultRoute?.goto).toBe("pb_standard_letters");
  });
});

describe("pb_routing_branch — fixtures (no validate, engine-resolved)", () => {
  it("has no valid fixtures (engine-resolved, never user-facing)", () => {
    expect(fixtures.valid).toHaveLength(0);
  });
  it("has no invalid fixtures", () => {
    expect(fixtures.invalid).toHaveLength(0);
  });
});
