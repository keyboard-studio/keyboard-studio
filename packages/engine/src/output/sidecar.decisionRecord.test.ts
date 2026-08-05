// Packaging guarantees for the decision record (specs/053-decision-audit,
// contracts/decision-record.contract.md §3).
//
// Four guarantees, one test block each. The load-bearing one is the last:
// SC-008 says the committed source tree is BYTE-IDENTICAL whether or not the
// session recorded decisions, so it is asserted as an equality between two
// publishPR runs rather than as a "does not contain" spot-check. A spot-check
// passes if the record leaks in under a different name; the equality does not.
//
// @see specs/053-decision-audit/spec.md — FR-019, FR-020, SC-008

import { describe, it, expect } from "vitest";
import { unzipSync } from "fflate";
import { createVirtualFS, makeEmptyDecisionRecord } from "@keyboard-studio/contracts";
import type {
  DecisionEntry,
  DecisionRecord,
  PublishPROptions,
  VirtualFS,
} from "@keyboard-studio/contracts";
import { toZip } from "./zip.js";
import { isSourceFile, publishPR, type GitHubFetchFn, type GitHubFetchResponse } from "./github.js";
import { isSidecarPath, SIDECAR_HASH_SUFFIX, SIDECAR_SUFFIX } from "./sidecar.js";
import {
  addDecisionRecordSidecar,
  DECISION_RECORD_VFS_PATH,
  STUDIO_METADATA_PREFIX,
} from "../decision-audit/index.js";
import { parseDecisionRecord } from "../decision-audit/record.js";

const dec = new TextDecoder();

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const KEYBOARD_ID = "test_keyboard";

function makeEntry(overrides: Partial<DecisionEntry> = {}): DecisionEntry {
  return {
    entryId: "e1",
    stepId: "identify-language",
    payload: {
      kind: "survey-answer",
      questionId: "il_language_english",
      answerType: "text",
      value: "Bambara",
    },
    provenance: { agency: "hand-set" },
    recordedAt: 1_700_000_000_000,
    supersedes: null,
    ...overrides,
  } as DecisionEntry;
}

function makeRecord(): DecisionRecord {
  return {
    ...makeEmptyDecisionRecord(KEYBOARD_ID),
    entries: [
      makeEntry(),
      makeEntry({
        entryId: "e2",
        stepId: "carve-gallery",
        payload: {
          kind: "editor-action",
          actionType: "gallery_edit",
          summary: {
            keysRemoved: 3,
            keysAdded: 0,
            mechanismsAssigned: 0,
            touchKeysAffected: 0,
            sample: ["K_A", "K_B", "K_C"],
            sampleTruncated: false,
          },
        },
        provenance: { agency: "hand-set" },
      }),
    ],
  };
}

/** The keyboard's own files — what a hand-authored submission would contain. */
function makeSourceFS(): VirtualFS {
  return createVirtualFS([
    { path: `source/${KEYBOARD_ID}.kmn`, content: "c version(10.0)\n", isBinary: false },
    { path: `source/${KEYBOARD_ID}.kps`, content: "<Package/>", isBinary: false },
    { path: `build/${KEYBOARD_ID}.kmx`, content: new Uint8Array([1, 2, 3]), isBinary: true },
  ]);
}

// ---------------------------------------------------------------------------
// publishPR mock harness (mirrors github.test.ts)
// ---------------------------------------------------------------------------

const FORK_OWNER = "testuser";
const MASTER_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const BASE_TREE_SHA = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const NEW_TREE_SHA = "cccccccccccccccccccccccccccccccccccccccc";
const NEW_COMMIT_SHA = "dddddddddddddddddddddddddddddddddddddddd";
const BLOB_SHA = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const PR_URL = "https://github.com/keyboard-studio/keyboards/pull/999";
const BRANCH = `add/${KEYBOARD_ID}`;
const API = "https://api.github.com";

type ResponseSpec =
  | { ok: true; status?: number; body: unknown; headers?: Record<string, string> }
  | { ok: false; status: number; body?: unknown; headers?: Record<string, string> };

function makeResponse(spec: ResponseSpec): GitHubFetchResponse {
  const headers: Record<string, string> = spec.headers ?? {};
  return {
    ok: spec.ok,
    status: spec.status ?? (spec.ok ? 200 : 400),
    statusText: spec.ok ? "OK" : "Error",
    headers: { get: (name) => headers[name] ?? null },
    json: async () => spec.body ?? {},
    text: async () => JSON.stringify(spec.body ?? {}),
  };
}

function happyPathRoutes(): Map<string, ResponseSpec> {
  return new Map<string, ResponseSpec>([
    [`GET ${API}/user`, { ok: true, body: { login: FORK_OWNER }, headers: { "X-OAuth-Scopes": "public_repo" } }],
    [`GET ${API}/repos/${FORK_OWNER}/keyboards`, { ok: true, body: { fork: true } }],
    [`GET ${API}/repos/${FORK_OWNER}/keyboards/git/ref/heads/master`, { ok: true, body: { object: { sha: MASTER_SHA } } }],
    [`GET ${API}/repos/${FORK_OWNER}/keyboards/git/commits/${MASTER_SHA}`, { ok: true, body: { tree: { sha: BASE_TREE_SHA } } }],
    [`POST ${API}/repos/${FORK_OWNER}/keyboards/git/blobs`, { ok: true, status: 201, body: { sha: BLOB_SHA } }],
    [`POST ${API}/repos/${FORK_OWNER}/keyboards/git/trees`, { ok: true, status: 201, body: { sha: NEW_TREE_SHA } }],
    [`POST ${API}/repos/${FORK_OWNER}/keyboards/git/commits`, { ok: true, status: 201, body: { sha: NEW_COMMIT_SHA } }],
    [`POST ${API}/repos/${FORK_OWNER}/keyboards/git/refs`, { ok: true, status: 201, body: { ref: `refs/heads/${BRANCH}` } }],
    [`POST ${API}/repos/keyboard-studio/keyboards/pulls`, { ok: true, status: 201, body: { html_url: PR_URL } }],
  ]);
}

function makeOpts(): PublishPROptions {
  return {
    token: "ghp_test",
    forkOwner: FORK_OWNER,
    branchName: BRANCH,
    commitMessage: `feat(base-browser): add ${KEYBOARD_ID} 1.0`,
    prTitle: "Add Test Keyboard 1.0",
    prBody: "## Summary\n- New keyboard\n",
  };
}

/**
 * Run `publishPR` against the mock API and return the JSON body of the
 * `git/trees` POST — the commit tree as it was actually sent.
 */
async function capturePRTree(fs: VirtualFS): Promise<string> {
  const routes = happyPathRoutes();
  let treeBody = "";
  const fetchFn: GitHubFetchFn = async (url, init) => {
    const method = init?.method ?? "GET";
    if (method === "POST" && url.endsWith("/git/trees")) {
      treeBody = typeof init?.body === "string" ? init.body : "";
    }
    const key = `${method} ${url}`;
    const wildcardKey = `${method} ${url.replace(/\/[a-f0-9]{40}$/, "/{sha}")}`;
    const spec = routes.get(key) ?? routes.get(wildcardKey);
    if (spec === undefined) {
      return makeResponse({ ok: false, status: 404, body: { message: `No mock for: ${key}` } });
    }
    return makeResponse(spec);
  };

  await publishPR(fs, makeOpts(), fetchFn);
  return treeBody;
}

// ---------------------------------------------------------------------------
// §3 row 1 — the record appears in the downloaded .zip
// ---------------------------------------------------------------------------

describe("decision record in the downloaded package", () => {
  it("writes the record to the contract's VFS path", () => {
    const vfs = addDecisionRecordSidecar(makeSourceFS(), makeRecord());
    expect(vfs.get(DECISION_RECORD_VFS_PATH)).toBeDefined();
    expect(DECISION_RECORD_VFS_PATH).toBe(".studio/decision-record.json");
  });

  it("is idempotent — a second write leaves one entry with the same content", () => {
    const record = makeRecord();
    const vfs = addDecisionRecordSidecar(addDecisionRecordSidecar(makeSourceFS(), record), record);
    const studioPaths = vfs.list().filter((p) => p.startsWith(STUDIO_METADATA_PREFIX));
    expect(studioPaths).toEqual([DECISION_RECORD_VFS_PATH]);
  });

  it("the zip contains .studio/decision-record.json", async () => {
    const vfs = addDecisionRecordSidecar(makeSourceFS(), makeRecord());
    const unzipped = unzipSync(await toZip(vfs));
    expect(Object.keys(unzipped)).toContain(DECISION_RECORD_VFS_PATH);
  });

  it("toZip packages a supplied record without mutating the caller's VFS", async () => {
    const vfs = makeSourceFS();
    const unzipped = unzipSync(await toZip(vfs, { decisionRecord: makeRecord() }));

    expect(Object.keys(unzipped)).toContain(DECISION_RECORD_VFS_PATH);
    // The caller's VFS is the live working copy's projection — packaging reads it.
    expect(vfs.get(DECISION_RECORD_VFS_PATH)).toBeUndefined();
  });

  it("toZip with no record produces an archive with no studio metadata", async () => {
    const unzipped = unzipSync(await toZip(makeSourceFS()));
    expect(Object.keys(unzipped).filter((p) => p.startsWith(STUDIO_METADATA_PREFIX))).toEqual([]);
  });

  it("the packaged bytes parse back to the same entries", async () => {
    const record = makeRecord();
    const vfs = addDecisionRecordSidecar(makeSourceFS(), record);
    const unzipped = unzipSync(await toZip(vfs));
    const parsed = parseDecisionRecord(dec.decode(unzipped[DECISION_RECORD_VFS_PATH]));

    expect(parsed.unreadable).toBe(false);
    expect(parsed.droppedCount).toBe(0);
    expect(parsed.record.entries.map((e) => e.entryId)).toEqual(["e1", "e2"]);
    expect(parsed.record.keyboardId).toBe(KEYBOARD_ID);
  });
});

// ---------------------------------------------------------------------------
// §3 row 2 — the record never appears in the PR commit tree
// ---------------------------------------------------------------------------

describe("studio metadata is excluded from the PR commit", () => {
  it("isSidecarPath matches any path under the studio-metadata prefix", () => {
    expect(isSidecarPath(DECISION_RECORD_VFS_PATH)).toBe(true);
    expect(isSidecarPath(`${STUDIO_METADATA_PREFIX}anything-else.json`)).toBe(true);
  });

  it("adds the prefix test without displacing the existing sidecar matches", () => {
    // Contract §3: the `.kmn.imported` matches are unchanged — added, not substituted.
    expect(isSidecarPath(`source/${KEYBOARD_ID}${SIDECAR_SUFFIX}`)).toBe(true);
    expect(isSidecarPath(`source/${KEYBOARD_ID}${SIDECAR_HASH_SUFFIX}`)).toBe(true);
    expect(isSidecarPath(`source/${KEYBOARD_ID}.kmn`)).toBe(false);
  });

  it("isSourceFile rejects the packaged record", () => {
    expect(isSourceFile(DECISION_RECORD_VFS_PATH)).toBe(false);
  });

  it("the publishPR commit tree has no .studio/ entry", async () => {
    const vfs = addDecisionRecordSidecar(makeSourceFS(), makeRecord());
    const treeBody = await capturePRTree(vfs);

    expect(treeBody).toContain(`source/${KEYBOARD_ID}.kmn`);
    expect(treeBody).not.toContain(STUDIO_METADATA_PREFIX);
    expect(treeBody).not.toContain("decision-record");
  });
});

// ---------------------------------------------------------------------------
// §3 row 3 — SC-008: zero files added to the committed source tree
// ---------------------------------------------------------------------------

describe("SC-008 — the committed tree is unchanged by recording", () => {
  it("the tree for a session with the record equals the tree without it", async () => {
    const withoutRecord = await capturePRTree(makeSourceFS());
    const withRecord = await capturePRTree(addDecisionRecordSidecar(makeSourceFS(), makeRecord()));

    expect(withRecord).toBe(withoutRecord);
  });
});

// ---------------------------------------------------------------------------
// §3 row 4 — the submission instructions say not to copy studio metadata
// ---------------------------------------------------------------------------

describe("NEXT_STEPS.md names studio metadata as not-to-be-copied", () => {
  it("mentions the studio-metadata prefix and tells the submitter to leave it out", async () => {
    const unzipped = unzipSync(await toZip(makeSourceFS()));
    const nextSteps = dec.decode(unzipped["NEXT_STEPS.md"]);

    expect(nextSteps).toContain(STUDIO_METADATA_PREFIX);
    expect(nextSteps.toLowerCase()).toContain("do not copy");
  });
});
