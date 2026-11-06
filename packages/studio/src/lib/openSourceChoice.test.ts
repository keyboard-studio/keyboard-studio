// Spec 111 T037: both repositories' copies resolve through /review-proxy, are
// compared on .kmn and .kps text, and the newer side comes from commit dates.

import { describe, expect, it } from "vitest";
import type { StartKeyboard } from "@keyboard-studio/contracts";
import type { FetchFn } from "@keyboard-studio/engine";
import { forkIsNewer, replacesCuratedCopy, resolveSourceChoice, sourceRefFor } from "./openSourceChoice.ts";

const KB: StartKeyboard = {
  id: "sil_test",
  path: "release/sil/sil_test",
  script: "Latn",
  targets: ["windows"],
  displayName: "Test",
  version: "1.0",
  languages: ["bas"],
};

interface Side {
  sha: string;
  date: string;
  kmn: string;
  kps: string;
}

/** A fetch stub serving the commits API and the pinned review-proxy files. */
function stubFetch(sides: Record<string, Side>): FetchFn {
  const reply = (ok: boolean, body = ""): Awaited<ReturnType<FetchFn>> => ({
    ok,
    status: ok ? 200 : 404,
    text: async () => body,
    arrayBuffer: async () => new TextEncoder().encode(body).buffer as ArrayBuffer,
  });
  return async (url) => {
    const api = /api\.github\.com\/repos\/([^/]+)\/keyboards\/commits/.exec(url);
    if (api) {
      const side = sides[api[1]!];
      if (side === undefined) return reply(false);
      return reply(true, JSON.stringify([{ sha: side.sha, commit: { committer: { date: side.date } } }]));
    }
    const proxy = /^\/review-proxy\/([^/]+)\/keyboards\/([^/]+)\/(.+)$/.exec(url);
    if (!proxy) return reply(false);
    const side = sides[proxy[1]!];
    if (side === undefined || side.sha !== proxy[2]) return reply(false);
    const path = proxy[3]!;
    if (path === `${KB.path}/source/${KB.id}.kmn`) return reply(true, side.kmn);
    if (path === `${KB.path}/source/${KB.id}.kps`) return reply(true, side.kps);
    return reply(false);
  };
}

const KMN = "store(&NAME) 'Test'\n";
const KPS = "<Package></Package>\n";

describe("resolveSourceChoice", () => {
  it("identical copies: no difference, no warning, no alternative", async () => {
    const choice = await resolveSourceChoice(
      KB,
      stubFetch({
        keymanapp: { sha: "a".repeat(40), date: "2026-01-01T00:00:00Z", kmn: KMN, kps: KPS },
        "keyboard-studio": { sha: "b".repeat(40), date: "2026-02-01T00:00:00Z", kmn: KMN, kps: KPS },
      }),
    );
    expect(choice.differ).toBe(false);
    expect(forkIsNewer(choice)).toBe(false);
    const ref = sourceRefFor(choice, KB, "keymanapp");
    expect(ref?.alternative).toBeNull();
    expect(replacesCuratedCopy(ref)).toBe(false);
  });

  it("curated in the fork: differs, fork newer, choosing upstream warns", async () => {
    const choice = await resolveSourceChoice(
      KB,
      stubFetch({
        keymanapp: { sha: "a".repeat(40), date: "2026-01-01T00:00:00Z", kmn: KMN, kps: KPS },
        "keyboard-studio": {
          sha: "b".repeat(40),
          date: "2026-03-01T00:00:00Z",
          kmn: `${KMN}c curated\n`,
          kps: KPS,
        },
      }),
    );
    expect(choice.differ).toBe(true);
    expect(forkIsNewer(choice)).toBe(true);
    const upstream = sourceRefFor(choice, KB, "keymanapp")!;
    expect(upstream.commit).toBe("a".repeat(40));
    expect(upstream.path).toBe(KB.path);
    expect(upstream.alternative).toEqual({ owner: "keyboard-studio", commit: "b".repeat(40), newer: true });
    expect(replacesCuratedCopy(upstream)).toBe(true);
    const fork = sourceRefFor(choice, KB, "keyboard-studio")!;
    expect(fork.alternative).toEqual({ owner: "keymanapp", commit: "a".repeat(40), newer: false });
    expect(replacesCuratedCopy(fork)).toBe(false);
  });

  it("stale in the fork: differs, upstream newer, no curated warning", async () => {
    const choice = await resolveSourceChoice(
      KB,
      stubFetch({
        keymanapp: { sha: "a".repeat(40), date: "2026-04-01T00:00:00Z", kmn: `${KMN}c fixed\n`, kps: KPS },
        "keyboard-studio": { sha: "b".repeat(40), date: "2026-01-01T00:00:00Z", kmn: KMN, kps: KPS },
      }),
    );
    expect(choice.differ).toBe(true);
    expect(forkIsNewer(choice)).toBe(false);
    const upstream = sourceRefFor(choice, KB, "keymanapp")!;
    expect(upstream.alternative?.newer).toBe(false);
    expect(replacesCuratedCopy(upstream)).toBe(false);
    expect(sourceRefFor(choice, KB, "keyboard-studio")!.alternative?.newer).toBe(true);
  });

  it("a .kps-only difference counts as a difference", async () => {
    const choice = await resolveSourceChoice(
      KB,
      stubFetch({
        keymanapp: { sha: "a".repeat(40), date: "2026-01-01T00:00:00Z", kmn: KMN, kps: KPS },
        "keyboard-studio": { sha: "b".repeat(40), date: "2026-02-01T00:00:00Z", kmn: KMN, kps: `${KPS}<!-- x -->` },
      }),
    );
    expect(choice.differ).toBe(true);
  });

  it("a keyboard absent from the fork opens from upstream with no alternative", async () => {
    const choice = await resolveSourceChoice(
      KB,
      stubFetch({ keymanapp: { sha: "a".repeat(40), date: "2026-01-01T00:00:00Z", kmn: KMN, kps: KPS } }),
    );
    expect(choice.fork).toBeNull();
    expect(choice.differ).toBe(false);
    expect(sourceRefFor(choice, KB, "keymanapp")?.alternative).toBeNull();
    expect(sourceRefFor(choice, KB, "keyboard-studio")).toBeNull();
  });
});
