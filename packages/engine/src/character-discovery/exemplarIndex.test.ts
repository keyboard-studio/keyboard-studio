/**
 * Load-path tests for the committed exemplar index (spec 044).
 *
 * These cover the module-level caching in `exemplarIndex.ts`, which every
 * other exemplar test relied on implicitly but nothing asserted directly:
 * `loadExemplarIndex` memoizes, `lookup` reads only what a completed load
 * published, and `__resetExemplarIndexForTest` clears both so a test can
 * observe the pre-load state. That hook had no caller until this file, which
 * meant the reset path it exists to enable was itself untested.
 *
 * Deliberately a separate file from exemplarSource.test.ts: that suite loads
 * the index once in `beforeAll` and every later case depends on it still being
 * resident, so resetting module state there would sabotage its siblings.
 * Vitest isolates module registries per file, so the reset stays contained.
 */

import { beforeEach, describe, it, expect } from "vitest";
import { loadExemplarIndex, lookup, __resetExemplarIndexForTest } from "./exemplarIndex.js";

beforeEach(() => {
  __resetExemplarIndexForTest();
});

describe("exemplarIndex load path", () => {
  it("lookup finds nothing until a load has completed", () => {
    // Not merely "en is absent" — the whole index is unpublished, so any id
    // misses. Guards against `lookup` reading a partially-initialized object.
    expect(lookup("en")).toBeUndefined();
    expect(lookup("bm")).toBeUndefined();
  });

  it("loads the committed index with its pinned provenance", async () => {
    const index = await loadExemplarIndex();
    // The version block is what `check-exemplar-staleness` compares against
    // upstream, so an index that loaded without it would break staleness
    // reporting silently rather than loudly.
    expect(index.version.cldr).toMatch(/^\d+\.\d+\.\d+$/);
    expect(index.version.sldrCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(Object.keys(index.locales).length).toBeGreaterThan(0);
  });

  it("memoizes — a second load returns the identical object, not a re-import", async () => {
    const first = await loadExemplarIndex();
    const second = await loadExemplarIndex();
    // Identity, not deep equality: a fresh import would be deep-equal but a
    // different object, and re-importing a ~1.2 MB chunk per lookup is the
    // cost this cache exists to avoid.
    expect(second).toBe(first);
  });

  it("publishes entries to lookup once loaded, and still misses unknown ids", async () => {
    await loadExemplarIndex();
    const en = lookup("en");
    expect(en).toBeDefined();
    // At least one side (CLDR or SLDR) must carry sets, or the entry is inert.
    expect(en?.c ?? en?.s).toBeDefined();
    expect(lookup("no-such-locale-id")).toBeUndefined();
  });

  it("reset returns lookup to its pre-load state, and a later load repopulates", async () => {
    await loadExemplarIndex();
    expect(lookup("en")).toBeDefined();

    __resetExemplarIndexForTest();
    // This is the assertion the hook exists for: `loaded` is genuinely
    // cleared, not just `cached`. Clearing only the promise would leave
    // `lookup` serving stale data after a reset.
    expect(lookup("en")).toBeUndefined();

    await loadExemplarIndex();
    expect(lookup("en")).toBeDefined();
  });
});
