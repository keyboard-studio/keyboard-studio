// location.test — the hash grammar (spec 057 T010, FR-010/FR-011).
//
// Two obligations from contracts/location-grammar.md §1:
//   - round-trip is TOTAL for valid values: parseLocation(formatLocation(loc))
//     deep-equals loc, for every shape;
//   - the parse-failure matrix is exhaustive — each malformed hash returns
//     null rather than a partially-decoded location.

import { describe, it, expect } from "vitest";
import { formatLocation, locationsEqual, parseLocation, type Location } from "./location.ts";

const VALID: readonly Location[] = [
  { route: "welcome" },
  { route: "survey" },
  { route: "preview" },
  { route: "output" },
  { route: "flowmap" },
  { route: "trail" },
  { route: "profile" },
  { route: "survey", step: "identity" },
  { route: "survey", step: "choose_base" },
  { route: "survey", step: "characters" },
  { route: "survey", step: "touch_seed_source" },
  { route: "survey", step: "characters", question: "pb_rtl_direction_confirm" },
  { route: "survey", step: "identity", question: "il_language_english" },
];

describe("parseLocation / formatLocation round trip", () => {
  it.each(VALID.map((loc) => [formatLocation(loc), loc] as const))(
    "%s round-trips",
    (_hash, loc) => {
      const reparsed = parseLocation(formatLocation(loc));
      expect(reparsed).toEqual(loc);
      expect(reparsed !== null && locationsEqual(reparsed, loc)).toBe(true);
    },
  );

  it("formats with a leading '#'", () => {
    expect(formatLocation({ route: "survey" })).toBe("#survey");
    expect(formatLocation({ route: "survey", step: "characters" })).toBe("#survey/characters");
    expect(formatLocation({ route: "survey", step: "characters", question: "q_one" })).toBe(
      "#survey/characters/q_one",
    );
  });

  it("accepts a hash with or without the leading '#'", () => {
    expect(parseLocation("survey/characters")).toEqual({
      route: "survey",
      step: "characters",
    });
    expect(parseLocation("#survey/characters")).toEqual({
      route: "survey",
      step: "characters",
    });
  });

  it("drops an unexpressible bare question rather than emitting an unparseable hash", () => {
    // `question` without `step` cannot be addressed (data-model.md), so
    // formatting one must still produce something parseLocation accepts —
    // otherwise the round-trip is not total.
    const malformed = { route: "survey", question: "q_one" } as Location;
    const hash = formatLocation(malformed);
    expect(hash).toBe("#survey");
    expect(parseLocation(hash)).toEqual({ route: "survey" });
  });
});

describe("parseLocation failure matrix", () => {
  const FAILURES: ReadonlyArray<readonly [string, string]> = [
    ["empty hash", ""],
    ["bare '#'", "#"],
    ["trailing slash", "#survey/"],
    ["trailing slash after step", "#survey/characters/"],
    ["empty middle segment", "#survey//pb_rtl_direction_confirm"],
    ["leading empty segment", "#/characters"],
    ["four segments", "#survey/characters/q_one/extra"],
    ["unknown route token", "#dashboard"],
    ["uppercase in route", "#Survey"],
    ["uppercase in step", "#survey/Characters"],
    ["hyphen in step", "#survey/choose-base"],
    ["percent-encoding in question", "#survey/characters/q%20one"],
    ["query syntax", "#survey?step=characters"],
    ["space in segment", "#survey/two words"],
    ["dot in question", "#survey/characters/q.one"],
  ];

  it.each(FAILURES)("%s -> null", (_label, hash) => {
    expect(parseLocation(hash)).toBeNull();
  });
});

describe("locationsEqual", () => {
  it("compares by value, not identity", () => {
    expect(
      locationsEqual({ route: "survey", step: "characters" }, { route: "survey", step: "characters" }),
    ).toBe(true);
  });

  it("distinguishes a step-scoped location from a bare route", () => {
    expect(locationsEqual({ route: "survey" }, { route: "survey", step: "characters" })).toBe(false);
  });

  it("distinguishes a question-scoped location from its step", () => {
    expect(
      locationsEqual(
        { route: "survey", step: "characters" },
        { route: "survey", step: "characters", question: "q_one" },
      ),
    ).toBe(false);
  });
});
