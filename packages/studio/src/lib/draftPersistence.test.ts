// draftPersistence.test.ts — unit tests for the durable localStorage draft
// (spec 034 US3, T026/T027).
//
// Covers data-model.md VR-1..VR-5 and contracts/persistence.md G-1..G-5.
// Mirrors persistWorkingCopy.test.ts's storage/store-seeding idiom: build a
// working copy into useWorkingCopyStore (and, here, traversal state into
// useSurveySessionStore) via the stores' own actions before exercising
// save/load/clear, rather than hand-rolling ad hoc partial states.
//
// IMPORTANT test-order note: `wasDraftRestoredThisBoot()` is a module-level
// flag that flips false -> true the first time `loadDraft()` succeeds, and is
// NEVER reset back to false (see draftPersistence.ts). Its "initial state"
// assertion below is therefore written as the FIRST test in this file,
// before any other test performs a successful `loadDraft()` — vitest runs
// tests within one file in declaration order (no shuffle is configured in
// packages/studio/vitest.config.ts), and each test file gets a fresh module
// registry, so this ordering is sufficient without vi.resetModules().

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { DEBOUNCE_MS } from "../hooks/useDebounce.ts";
import type { BaseKeyboard, KeyboardIR, SurveyPhaseResult } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { usePhaseBDraftStore } from "../stores/phaseBDraftStore.ts";
import type { IdentityLiteResult } from "../survey/index.ts";
import {
  DRAFT_KEY_PREFIX,
  DRAFT_VERSION,
  draftKey,
  saveDraft,
  loadDraft,
  clearDraft,
  resolveActiveProjectKey,
  setActiveProjectKey,
  clearActiveProjectKey,
  replaceActiveDraftIfDifferentProject,
  deriveProjectKeyFromWorkingCopy,
  installDraftAutosave,
  flushActiveDraft,
  wasDraftRestoredThisBoot,
  AUTOSAVE_DEBOUNCE_MS,
  type DurableDraft,
} from "./draftPersistence.ts";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMinimalIr(): KeyboardIR {
  return {
    origin: "scaffolded" as const,
    header: {
      keyboardId: "test",
      name: "test",
      bcp47: [],
      copyright: "",
      version: "10.0",
      targets: [],
      storeDirectives: [],
    },
    stores: [],
    groups: [],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  } as unknown as KeyboardIR;
}

/**
 * An IR with one S-01 removable rule (vkey -> char in a normal group) — reused
 * from persistWorkingCopy.test.ts's own fixture so the draft round-trip test
 * below exercises the SAME realistic shape (a real fixture, not a stripped-down
 * one that would hide the removalCapabilities re-derivation bug class).
 */
function makeIrWithRemovableRule(): KeyboardIR {
  return {
    origin: "scaffolded" as const,
    header: {
      keyboardId: "test_keyboard",
      name: "Test",
      bcp47: [],
      copyright: "",
      version: "10.0",
      targets: [],
      storeDirectives: [],
    },
    stores: [],
    groups: [
      {
        nodeId: "group-main",
        name: "main",
        usingKeys: true,
        readonly: false,
        rules: [
          {
            nodeId: "rule-s01-1",
            context: [{ kind: "vkey" as const, vkey: "K_A", modifiers: [] }],
            output: [{ kind: "char" as const, char: "a" }],
          },
        ],
      },
    ],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  } as unknown as KeyboardIR;
}

function instantiateMinimal(projectId: string): void {
  const base = { id: projectId, displayName: "Autosave Test", languages: [] } as unknown as BaseKeyboard;
  useWorkingCopyStore.getState().instantiateFromBase(base, { vfs: createVirtualFS([]), ir: makeMinimalIr() });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  usePhaseBDraftStore.getState().reset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("draftPersistence", () => {
  // Must run before any test performs a successful loadDraft() — see the
  // module header note on wasDraftRestoredThisBoot's monotonic flag.
  it("wasDraftRestoredThisBoot() is false before any successful loadDraft this boot", () => {
    expect(wasDraftRestoredThisBoot()).toBe(false);
  });

  describe("constants + draftKey", () => {
    it("DRAFT_KEY_PREFIX and DRAFT_VERSION match the documented contract", () => {
      expect(DRAFT_KEY_PREFIX).toBe("ks.draft.");
      expect(DRAFT_VERSION).toBe(1);
    });

    it("draftKey namespaces and versions the per-project key", () => {
      expect(draftKey("my_kbd")).toBe("ks.draft.my_kbd.v1");
    });
  });

  describe("deriveProjectKeyFromWorkingCopy", () => {
    it("prefers identity.keyboardId when present", () => {
      const key = deriveProjectKeyFromWorkingCopy({
        identity: { keyboardId: "from-identity" },
        baseKeyboard: { id: "from-base", displayName: "X", languages: [] } as BaseKeyboard,
      });
      expect(key).toBe("from-identity");
    });

    it("falls back to baseKeyboard.id when identity has no keyboardId yet (Track 1 immediate-instantiation window)", () => {
      const key = deriveProjectKeyFromWorkingCopy({
        identity: null,
        baseKeyboard: { id: "from-base", displayName: "X", languages: [] } as BaseKeyboard,
      });
      expect(key).toBe("from-base");
    });

    it("returns null before any instantiation (both sources absent)", () => {
      expect(deriveProjectKeyFromWorkingCopy({ identity: null, baseKeyboard: null })).toBeNull();
    });
  });

  describe("VR-2: no-instantiation ignore", () => {
    it("saveDraft no-ops when instantiationMode === null", () => {
      expect(useWorkingCopyStore.getState().instantiationMode).toBeNull();
      saveDraft("vr2-noop-a");
      expect(localStorage.getItem(draftKey("vr2-noop-a"))).toBeNull();
      // No draft written => no active-project pointer either.
      expect(resolveActiveProjectKey()).toBeNull();
    });

    it("saveDraft no-ops when instantiationMode is set but ir is null", () => {
      useWorkingCopyStore.setState({ instantiationMode: "new-from-base", ir: null });
      saveDraft("vr2-noop-b");
      expect(localStorage.getItem(draftKey("vr2-noop-b"))).toBeNull();
    });

    it("loadDraft returns false (and leaves the record in place) when the stored workingCopy has no real instantiation", () => {
      const pk = "vr2-project";
      const raw: Partial<DurableDraft> = {
        version: DRAFT_VERSION,
        savedAt: Date.now(),
        projectKey: pk,
        displayName: null,
        languageTag: null,
        workingCopy: { instantiationMode: null } as unknown as DurableDraft["workingCopy"],
        traversal: {} as unknown as DurableDraft["traversal"],
      };
      localStorage.setItem(draftKey(pk), JSON.stringify(raw));

      expect(loadDraft(pk)).toBe(false);
      // Unlike VR-1/VR-3, "no real work" is left in place — nothing to migrate away from.
      expect(localStorage.getItem(draftKey(pk))).not.toBeNull();
    });
  });

  describe("VR-1: version-mismatch discard", () => {
    it("a stored draft with version !== DRAFT_VERSION is discarded (removed) on load, not migrated", () => {
      const pk = "vr1-project";
      const raw: Partial<DurableDraft> = {
        version: DRAFT_VERSION + 1,
        savedAt: Date.now(),
        projectKey: pk,
        displayName: null,
        languageTag: null,
        workingCopy: { instantiationMode: "new-from-base" } as unknown as DurableDraft["workingCopy"],
        traversal: {} as unknown as DurableDraft["traversal"],
      };
      localStorage.setItem(draftKey(pk), JSON.stringify(raw));

      expect(loadDraft(pk)).toBe(false);
      expect(localStorage.getItem(draftKey(pk))).toBeNull();
    });

    it("discarding an unusable draft also clears the active-project pointer when it names that key (km-review #4 — no dangling pointer)", () => {
      // main.tsx resolves the active pointer, then loadDraft(that key). If the
      // record is unusable (version-mismatched here) and only the RECORD is
      // cleared, `ks.draft.active` dangles at a now-deleted key and every
      // subsequent boot resolves to a key with no record. The discard must
      // clear the matching pointer too.
      const pk = "vr1-dangling";
      setActiveProjectKey(pk);
      localStorage.setItem(
        draftKey(pk),
        JSON.stringify({ version: DRAFT_VERSION + 1, projectKey: pk, workingCopy: {}, traversal: {} }),
      );

      expect(loadDraft(pk)).toBe(false);
      expect(localStorage.getItem(draftKey(pk))).toBeNull();
      // The active pointer must not dangle at the deleted record.
      expect(resolveActiveProjectKey()).toBeNull();
    });

    it("discarding a draft does NOT clear the active pointer when it names a DIFFERENT project (defensive)", () => {
      // Guard: loadDraft is normally called with the active key, but a future
      // caller passing a non-active key must not wipe the real active project.
      const active = "vr1-active-other";
      const stale = "vr1-stale";
      setActiveProjectKey(active);
      localStorage.setItem(
        draftKey(stale),
        JSON.stringify({ version: DRAFT_VERSION + 1, projectKey: stale, workingCopy: {}, traversal: {} }),
      );

      expect(loadDraft(stale)).toBe(false);
      expect(localStorage.getItem(draftKey(stale))).toBeNull();
      // The unrelated active pointer is left intact.
      expect(resolveActiveProjectKey()).toBe(active);
    });
  });

  describe("VR-3: malformed removal", () => {
    it("a corrupt (unparseable) draft value is removed and treated as absent, without throwing", () => {
      const pk = "vr3-project";
      localStorage.setItem(draftKey(pk), "{not valid json");

      let result: boolean | undefined;
      expect(() => {
        result = loadDraft(pk);
      }).not.toThrow();
      expect(result).toBe(false);
      expect(localStorage.getItem(draftKey(pk))).toBeNull();
    });
  });

  describe("VR-3 hardening (P0 fix): whole parse-through-apply body is one try/catch", () => {
    it("a wrong-shape draft ({\"version\":1} with workingCopy MISSING entirely) never throws and returns false", () => {
      const pk = "p0-missing-workingcopy";
      localStorage.setItem(draftKey(pk), JSON.stringify({ version: DRAFT_VERSION }));

      let result: boolean | undefined;
      expect(() => {
        result = loadDraft(pk);
      }).not.toThrow();
      expect(result).toBe(false);
    });

    it("a draft with workingCopy: null never throws and returns false", () => {
      const pk = "p0-null-workingcopy";
      localStorage.setItem(
        draftKey(pk),
        JSON.stringify({
          version: DRAFT_VERSION,
          savedAt: Date.now(),
          projectKey: pk,
          displayName: null,
          languageTag: null,
          workingCopy: null,
          traversal: {},
        }),
      );

      let result: boolean | undefined;
      expect(() => {
        result = loadDraft(pk);
      }).not.toThrow();
      expect(result).toBe(false);
    });

    it("a whole-value JSON primitive (a bare number, e.g. stored as \"42\") never throws, returns false, and is removed (version check fails on a primitive)", () => {
      const pk = "p0-primitive-number";
      localStorage.setItem(draftKey(pk), JSON.stringify(42));

      let result: boolean | undefined;
      expect(() => {
        result = loadDraft(pk);
      }).not.toThrow();
      expect(result).toBe(false);
      // A primitive has no `.version` field (undefined !== DRAFT_VERSION), so this
      // is caught by the VR-1 version-mismatch branch, which DOES remove the record.
      expect(localStorage.getItem(draftKey(pk))).toBeNull();
    });

    it("a whole-value JSON primitive (a bare string, e.g. stored as \"hi\") never throws, returns false, and is removed", () => {
      const pk = "p0-primitive-string";
      localStorage.setItem(draftKey(pk), JSON.stringify("hi"));

      let result: boolean | undefined;
      expect(() => {
        result = loadDraft(pk);
      }).not.toThrow();
      expect(result).toBe(false);
      expect(localStorage.getItem(draftKey(pk))).toBeNull();
    });

    it("a corrupt Base64 VFS entry that makes applyWorkingCopySnapshot/atob throw is caught, removes the record, and returns false (not a crash on boot)", () => {
      const pk = "p0-corrupt-base64";
      const base: BaseKeyboard = {
        id: pk,
        displayName: "Corrupt Base64 Test",
        languages: [],
      } as unknown as BaseKeyboard;
      // A real binary VFS entry, correctly Base64-encoded at first — mirrors the
      // G-1/G-5 round-trip test's fixture shape rather than a stripped-down one.
      const vfs = createVirtualFS([
        { path: "source/welcome/welcome.htm", content: new Uint8Array([1, 2, 3, 4]), isBinary: true },
      ]);
      useWorkingCopyStore.getState().instantiateFromBase(base, { vfs, ir: makeMinimalIr() });

      saveDraft(pk);
      const stored = localStorage.getItem(draftKey(pk));
      expect(stored).not.toBeNull();

      // Corrupt exactly the Base64 `content` field of the (isBinary: true) VFS
      // entry — atob() rejects "!" as outside the Base64 alphabet — while leaving
      // isBinary: true so deserializeEntry still takes the atob() path.
      const envelope = JSON.parse(stored!) as DurableDraft;
      const entries = (envelope.workingCopy as unknown as { baseVfsEntries: Array<{ isBinary: boolean; content: string }> })
        .baseVfsEntries;
      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0]!.isBinary).toBe(true);
      entries[0]!.content = "!!!not-valid-base64!!!";
      localStorage.setItem(draftKey(pk), JSON.stringify(envelope));

      useWorkingCopyStore.getState().reset();

      let result: boolean | undefined;
      expect(() => {
        result = loadDraft(pk);
      }).not.toThrow();
      expect(result).toBe(false);
      expect(localStorage.getItem(draftKey(pk))).toBeNull();
      // Never partially applied — the working copy stays reset, not half-restored.
      expect(useWorkingCopyStore.getState().instantiationMode).toBeNull();
    });

    it("a version-matched record with a valid workingCopy but MALFORMED traversal is removed and never partially restores the working copy (km-review #2)", () => {
      // Regression for the review finding: applyTraversalSnapshot's object-spread
      // never THROWS on a non-object (`{...null}` = `{}`), so a broken `traversal`
      // would otherwise slip past the catch, restore the working copy, and leave
      // the walk position silently defaulted to "identity" — an inconsistent
      // resume. The traversal-shape guard must reject it BEFORE any store patch.
      const pk = "traversal-malformed";
      instantiateMinimal(pk);
      saveDraft(pk);

      // Corrupt just the traversal field to a non-object; leave the (valid)
      // workingCopy untouched so it passes the workingCopy guard.
      const envelope = JSON.parse(localStorage.getItem(draftKey(pk))!) as Record<string, unknown>;
      expect(envelope.workingCopy).not.toBeNull();
      envelope.traversal = null;
      localStorage.setItem(draftKey(pk), JSON.stringify(envelope));

      useWorkingCopyStore.getState().reset();

      let result: boolean | undefined;
      expect(() => {
        result = loadDraft(pk);
      }).not.toThrow();
      expect(result).toBe(false);
      // VR-3: corrupt record removed (cannot self-heal), not left to re-fail every boot.
      expect(localStorage.getItem(draftKey(pk))).toBeNull();
      // The working copy was NOT partially patched — stays fully reset.
      expect(useWorkingCopyStore.getState().instantiationMode).toBeNull();
    });

    it("a failed working-copy restore leaves BOTH stores untouched — atomic multi-store restore (km-review #5)", () => {
      // Regression for the review finding: loadDraft prepares the (fallible)
      // working-copy payload BEFORE mutating either store, so a throw can't
      // leave the working-copy store patched while the survey-session store is
      // not (or vice-versa). Guards against reordering the commits so that one
      // store is mutated before the throwing preparation runs.
      const pk = "atomic-both-stores";
      const base = { id: pk, displayName: "Atomic Test", languages: [] } as unknown as BaseKeyboard;
      const vfs = createVirtualFS([
        { path: "source/icon.ico", content: new Uint8Array([9, 8, 7, 6]), isBinary: true },
      ]);
      useWorkingCopyStore.getState().instantiateFromBase(base, { vfs, ir: makeMinimalIr() });
      saveDraft(pk);

      // Corrupt the (isBinary) VFS entry so prepareWorkingCopySnapshot's atob() throws.
      const envelope = JSON.parse(localStorage.getItem(draftKey(pk))!) as DurableDraft;
      const entries = (envelope.workingCopy as unknown as { baseVfsEntries: Array<{ isBinary: boolean; content: string }> })
        .baseVfsEntries;
      entries[0]!.content = "@@@not-base64@@@";
      localStorage.setItem(draftKey(pk), JSON.stringify(envelope));

      // Reset the working copy, then seed the survey store to a KNOWN non-initial
      // step. A non-atomic restore that touched the survey store first would
      // clobber this before the working-copy preparation threw.
      useWorkingCopyStore.getState().reset();
      useSurveySessionStore.setState({ activeStepId: "carve" });

      expect(loadDraft(pk)).toBe(false);
      // Working copy not restored...
      expect(useWorkingCopyStore.getState().instantiationMode).toBeNull();
      // ...and the survey-session store was never touched by the failed restore.
      expect(useSurveySessionStore.getState().activeStepId).toBe("carve");
    });
  });

  describe("VR-4: quota-failure no-throw", () => {
    it("saveDraft swallows a localStorage.setItem quota/security failure instead of throwing", () => {
      instantiateMinimal("vr4-project");
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      });

      expect(() => saveDraft("vr4-project")).not.toThrow();
      expect(() => setActiveProjectKey("vr4-project")).not.toThrow();
    });

    it("resolveActiveProjectKey returns null (not throw) when localStorage.getItem itself fails", () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("security restriction");
      });
      let key: string | null = "unset";
      expect(() => {
        key = resolveActiveProjectKey();
      }).not.toThrow();
      expect(key).toBeNull();
    });

    it("clearDraft swallows a localStorage.removeItem failure instead of throwing", () => {
      vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
        throw new DOMException("security restriction", "SecurityError");
      });

      expect(() => clearDraft("vr4-remove-project")).not.toThrow();
    });

    it("clearActiveProjectKey swallows a localStorage.removeItem failure instead of throwing", () => {
      vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
        throw new DOMException("security restriction", "SecurityError");
      });

      expect(() => clearActiveProjectKey()).not.toThrow();
    });
  });

  describe("VR-5: single-project replace-or-warn (never silently merge)", () => {
    it("replaceActiveDraftIfDifferentProject clears the PRIOR project's draft when a DIFFERENT project is active", () => {
      instantiateMinimal("vr5-proj-a");
      saveDraft("vr5-proj-a"); // also sets the active-project pointer to vr5-proj-a
      expect(localStorage.getItem(draftKey("vr5-proj-a"))).not.toBeNull();
      expect(resolveActiveProjectKey()).toBe("vr5-proj-a");

      replaceActiveDraftIfDifferentProject("vr5-proj-b");

      expect(localStorage.getItem(draftKey("vr5-proj-a"))).toBeNull(); // replaced, not merged
      // The active pointer itself is left untouched here — the NEW project's own
      // saveDraft/installDraftAutosave repoints it immediately after (see docstring).
      expect(resolveActiveProjectKey()).toBe("vr5-proj-a");
    });

    it("is a no-op when the incoming project is the SAME as the active one", () => {
      instantiateMinimal("vr5-proj-same");
      saveDraft("vr5-proj-same");

      replaceActiveDraftIfDifferentProject("vr5-proj-same");

      expect(localStorage.getItem(draftKey("vr5-proj-same"))).not.toBeNull();
    });

    it("is a no-op when there is no active project yet (fresh install)", () => {
      expect(resolveActiveProjectKey()).toBeNull();
      expect(() => replaceActiveDraftIfDifferentProject("vr5-first-project")).not.toThrow();
    });
  });

  describe("G-1/G-5: round-trip save + load restores BOTH stores from a single draft", () => {
    it("restores working-copy IR/identity/deletions/phaseResults AND traversal position/history/touchSeedSource, never re-instantiating a second working copy", () => {
      const base: BaseKeyboard = {
        id: "test_keyboard",
        displayName: "Test Keyboard",
        languages: ["en"],
      } as BaseKeyboard;
      const ir = makeIrWithRemovableRule();
      const vfs = createVirtualFS([
        { path: "source/test_keyboard.kmn", content: "c Test\n", isBinary: false },
      ]);

      useWorkingCopyStore.getState().instantiateFromBase(base, { vfs, ir });
      useWorkingCopyStore.getState().setIdentity({
        keyboardId: "test_keyboard",
        displayName: "Test Keyboard",
        bcp47: "en-Latn",
      });
      useWorkingCopyStore.getState().deleteNode("rule-s01-1");
      useWorkingCopyStore.getState().recordPhase({
        phase: "B",
        answers: { scale: "full" },
      } as unknown as SurveyPhaseResult);

      // Traversal position: two forward hops (history becomes non-trivial) plus
      // the spec-035 touchSeedSource fork choice (km-frontend-flagged risk (a)).
      useSurveySessionStore.getState().advance("choose_base");
      useSurveySessionStore.getState().advance("track");
      useSurveySessionStore.getState().setTouchSeedSource("import-adapt");

      const projectKey = deriveProjectKeyFromWorkingCopy(useWorkingCopyStore.getState());
      expect(projectKey).toBe("test_keyboard");

      saveDraft(projectKey!);
      expect(localStorage.getItem(draftKey(projectKey!))).not.toBeNull();

      // Cold reset BOTH stores — nothing left to inherit from; a partial reset
      // would mask a restore that only APPEARED to work.
      useWorkingCopyStore.getState().reset();
      useSurveySessionStore.getState().reset();
      expect(useWorkingCopyStore.getState().instantiationMode).toBeNull();
      expect(useSurveySessionStore.getState().activeStepId).toBe("identity");

      // G-5: restore must patch the SAME store, never construct a second one.
      const instantiateFromBaseSpy = vi.spyOn(useWorkingCopyStore.getState(), "instantiateFromBase");
      const instantiateFromExistingSpy = vi.spyOn(useWorkingCopyStore.getState(), "instantiateFromExisting");

      const result = loadDraft(projectKey!);
      expect(result).toBe(true);

      expect(instantiateFromBaseSpy).not.toHaveBeenCalled();
      expect(instantiateFromExistingSpy).not.toHaveBeenCalled();

      const wc = useWorkingCopyStore.getState();
      expect(wc.instantiationMode).toBe("new-from-base");
      expect(wc.baseKeyboard?.id).toBe("test_keyboard");
      expect(wc.identity?.bcp47).toBe("en-Latn");
      expect(wc.deletedNodeIds.has("rule-s01-1")).toBe(true);
      expect(wc.phaseResults).toHaveLength(1);
      expect(wc.phaseResults[0]?.phase).toBe("B");

      const session = useSurveySessionStore.getState();
      expect(session.activeStepId).toBe("track");
      expect(session.history).toEqual(["identity", "choose_base"]);
      // (a) touchSeedSource round-trips through the traversal snapshot.
      expect(session.touchSeedSource).toBe("import-adapt");

      expect(wasDraftRestoredThisBoot()).toBe(true);
    });
  });

  describe("P0 fix: phaseBDraftStore.chars folds into the durable draft round-trip", () => {
    it("restores the in-progress build-list alphabet on load, not an empty array (km-review P0 — no silent discard of the author's typed/toggled chars)", () => {
      const pk = "phaseb-draft-project";
      instantiateMinimal(pk);
      useSurveySessionStore.getState().setDiscoveryMethod("build-list");
      useSurveySessionStore.getState().setCharactersSubStage("B");
      usePhaseBDraftStore.getState().setAll(["a", "b", "ɛ"]);

      saveDraft(pk);

      // Cold reset ALL THREE stores — nothing left to inherit from.
      useWorkingCopyStore.getState().reset();
      useSurveySessionStore.getState().reset();
      usePhaseBDraftStore.getState().reset();
      expect(usePhaseBDraftStore.getState().chars).toEqual([]);

      expect(loadDraft(pk)).toBe(true);

      // The build-list screen substage/discoveryMethod resume as before...
      const session = useSurveySessionStore.getState();
      expect(session.discoveryMethod).toBe("build-list");
      expect(session.charactersSubStage).toBe("B");
      // ...AND the alphabet the author had already built is intact, not blanked.
      expect(usePhaseBDraftStore.getState().chars).toEqual(["a", "b", "ɛ"]);
    });

    it("a pre-fix record with no phaseBDraft field restores to an empty alphabet (backward compat — additive optional field, not a version bump)", () => {
      const pk = "phaseb-draft-legacy";
      instantiateMinimal(pk);
      saveDraft(pk);

      // Simulate a record written before this field existed.
      const envelope = JSON.parse(localStorage.getItem(draftKey(pk))!) as Record<string, unknown>;
      delete envelope.phaseBDraft;
      localStorage.setItem(draftKey(pk), JSON.stringify(envelope));

      useWorkingCopyStore.getState().reset();
      useSurveySessionStore.getState().reset();
      usePhaseBDraftStore.getState().setAll(["stale"]); // must be cleared by restore, not left dangling

      expect(loadDraft(pk)).toBe(true);
      expect(usePhaseBDraftStore.getState().chars).toEqual([]);
    });

    it("installDraftAutosave also debounce-saves a phaseBDraftStore mutation (same 500ms window, no new timer)", () => {
      vi.useFakeTimers();
      const pk = "phaseb-draft-autosave";
      instantiateMinimal(pk);

      const teardown = installDraftAutosave(pk);
      usePhaseBDraftStore.getState().add("q");

      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
      const saved = JSON.parse(localStorage.getItem(draftKey(pk))!) as DurableDraft;
      expect(saved.phaseBDraft?.chars).toEqual(["q"]);

      teardown();
    });
  });

  describe("(b) installDraftAutosave — independent ~500ms debounce (Article IV)", () => {
    it("writes the debounced mutation only after the ~500ms debounce elapses, not immediately on mutation (P1's install-time save already landed a pre-mutation record)", () => {
      vi.useFakeTimers();
      const pk = "autosave-a";
      instantiateMinimal(pk);

      const teardown = installDraftAutosave(pk);
      // P1 fix: install performed ONE synchronous save already — a record exists,
      // but it reflects the PRE-mutation state (desktopLocked still false).
      const installTimeSaved = JSON.parse(localStorage.getItem(draftKey(pk))!) as DurableDraft;
      expect(installTimeSaved.workingCopy.desktopLocked).toBe(false);

      useWorkingCopyStore.getState().lockDesktop(); // triggers scheduleSave

      vi.advanceTimersByTime(499);
      // Still the install-time snapshot — the mutation's debounced write hasn't landed yet.
      const stillPreMutation = JSON.parse(localStorage.getItem(draftKey(pk))!) as DurableDraft;
      expect(stillPreMutation.workingCopy.desktopLocked).toBe(false);

      vi.advanceTimersByTime(1);
      const saved = JSON.parse(localStorage.getItem(draftKey(pk))!) as DurableDraft;
      expect(saved.workingCopy.desktopLocked).toBe(true);

      teardown();
    });

    it("teardown unsubscribes AND clears any pending timer — a mutation scheduled just before teardown never writes", () => {
      vi.useFakeTimers();
      const pk = "autosave-b";
      instantiateMinimal(pk);

      const teardown = installDraftAutosave(pk);
      useWorkingCopyStore.getState().lockDesktop();
      vi.advanceTimersByTime(500);
      expect(localStorage.getItem(draftKey(pk))).not.toBeNull(); // first save landed

      // Isolate the NEXT write.
      localStorage.removeItem(draftKey(pk));

      useWorkingCopyStore.getState().unlockDesktop(); // schedules a NEW pending timer
      teardown(); // must clear that pending timer AND unsubscribe both stores

      vi.advanceTimersByTime(5000); // well past 500ms
      expect(localStorage.getItem(draftKey(pk))).toBeNull();
    });

    it("coalesces rapid mutations into a single write — the debounce restarts rather than stacking", () => {
      vi.useFakeTimers();
      const pk = "autosave-c";
      instantiateMinimal(pk);

      const teardown = installDraftAutosave(pk);
      // The P1 install-time save already happened above (before the spy is
      // attached), so it is NOT among the writes the spy captures below —
      // draftWrites still counts only the mutation-triggered debounced write.
      const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

      useWorkingCopyStore.getState().lockDesktop();
      vi.advanceTimersByTime(300);
      useWorkingCopyStore.getState().unlockDesktop(); // restarts the debounce window
      vi.advanceTimersByTime(300); // only 300ms since the SECOND mutation
      // Still the install-time (pre-mutation) record — the debounce hasn't fired yet.
      const stillPreMutation = JSON.parse(localStorage.getItem(draftKey(pk))!) as DurableDraft;
      expect(stillPreMutation.workingCopy.desktopLocked).toBe(false);

      vi.advanceTimersByTime(200); // 500ms since the second mutation
      const saved = JSON.parse(localStorage.getItem(draftKey(pk))!) as DurableDraft;
      expect(saved.workingCopy.desktopLocked).toBe(false); // locked then unlocked — net unchanged

      const draftWrites = setItemSpy.mock.calls.filter(([key]) => key === draftKey(pk));
      expect(draftWrites).toHaveLength(1);

      teardown();
    });

    it("G-1 window (P1 fix): a draft record exists IMMEDIATELY at install time, synchronously, with no timer advance and no store mutation", () => {
      vi.useFakeTimers();
      const pk = "autosave-p1-sync";
      instantiateMinimal(pk);

      // Contrast case: nothing has fired yet — no mutation, no timer advance at all.
      expect(localStorage.getItem(draftKey(pk))).toBeNull();

      const teardown = installDraftAutosave(pk);

      // The record must be present RIGHT NOW — before vi.advanceTimersByTime is
      // ever called, and before any store subscription fires. Without the P1
      // fix, a reload in this exact window (instantiation succeeded, but the
      // author has not yet made a single edit) found only the active-project
      // pointer and no draft record, so loadDraft returned false and the
      // just-instantiated project was silently discarded on reload.
      const stored = localStorage.getItem(draftKey(pk));
      expect(stored).not.toBeNull();

      const saved = JSON.parse(stored!) as DurableDraft;
      expect(saved.projectKey).toBe(pk);
      expect(saved.workingCopy.instantiationMode).toBe("new-from-base");

      // The active-project pointer is also set at install time (pre-existing
      // behaviour) — confirmed alongside the draft record, not in place of it.
      expect(resolveActiveProjectKey()).toBe(pk);

      teardown();
    });
  });

  // ---------------------------------------------------------------------------
  // T027 — FR-014 forward-compat seam: save/load/clear are keyed BY PARAMETER,
  // and the envelope carries identity fields, so a future draft index + a
  // server-backed store are additive (no envelope change, no migration).
  // ---------------------------------------------------------------------------
  describe("T027/FR-014: projectKey-parameterized API + envelope identity fields", () => {
    it("save/clear are keyed by the projectKey PARAMETER — two distinct projects persist and clear independently", () => {
      instantiateMinimal("proj_a");
      saveDraft("proj_a");

      useWorkingCopyStore.getState().reset();
      instantiateMinimal("proj_b");
      saveDraft("proj_b");

      // Both per-project records coexist in storage at once (the keyed schema
      // supports this even though the MVP UI only ever actively uses one).
      expect(localStorage.getItem(draftKey("proj_a"))).not.toBeNull();
      expect(localStorage.getItem(draftKey("proj_b"))).not.toBeNull();

      const recA = JSON.parse(localStorage.getItem(draftKey("proj_a"))!) as DurableDraft;
      const recB = JSON.parse(localStorage.getItem(draftKey("proj_b"))!) as DurableDraft;
      expect(recA.projectKey).toBe("proj_a");
      expect(recB.projectKey).toBe("proj_b");

      // clearDraft is scoped to its own parameter — clearing "proj_a" must not
      // touch "proj_b"'s record.
      clearDraft("proj_a");
      expect(localStorage.getItem(draftKey("proj_a"))).toBeNull();
      expect(localStorage.getItem(draftKey("proj_b"))).not.toBeNull();
    });

    it("the DurableDraft envelope carries projectKey/displayName/languageTag identity fields (future project-list seam)", () => {
      const base: BaseKeyboard = {
        id: "proj_x",
        displayName: "Base Display Name",
        languages: ["yo"],
      } as BaseKeyboard;
      useWorkingCopyStore.getState().instantiateFromBase(base, {
        vfs: createVirtualFS([]),
        ir: makeMinimalIr(),
      });

      useSurveySessionStore.getState().setScaffoldSpec({
        keyboardId: "proj_x",
        displayName: "My Custom Keyboard",
      });
      useSurveySessionStore.getState().setIdentityResult({
        autonym: "Test",
        english: "Test",
        languageSubtag: "yo",
        region: "",
        targetScriptRaw: "Latn",
        bcp47: "yo-Latn",
        supported: true,
        prefill: {} as unknown as IdentityLiteResult["prefill"],
      });

      saveDraft("proj_x");

      const rec = JSON.parse(localStorage.getItem(draftKey("proj_x"))!) as DurableDraft;
      expect(rec.projectKey).toBe("proj_x");
      // Track-1 scaffoldSpec.displayName wins over the base's own displayName.
      expect(rec.displayName).toBe("My Custom Keyboard");
      expect(rec.languageTag).toBe("yo-Latn");
    });
  });

  // ---------------------------------------------------------------------------
  // flushActiveDraft (km-review #3) — synchronous pre-OAuth-redirect save so the
  // durable draft can't lag the sessionStorage snapshot across the redirect.
  // ---------------------------------------------------------------------------
  describe("flushActiveDraft: synchronous save of the active project (km-review #3)", () => {
    it("persists the CURRENT store state immediately, with no debounce timer advance", () => {
      vi.useFakeTimers();
      const pk = "flush-current";
      instantiateMinimal(pk);
      setActiveProjectKey(pk);

      // Mutate AFTER any prior save so the change is un-persisted until flushed.
      useWorkingCopyStore.getState().lockDesktop();

      // No timer advance at all — flush must write synchronously (unlike the
      // 500ms autosave debounce).
      flushActiveDraft();

      const rec = JSON.parse(localStorage.getItem(draftKey(pk))!) as DurableDraft;
      expect(rec.workingCopy.desktopLocked).toBe(true);
    });

    it("is a no-op (no throw, no write) when there is no active project", () => {
      clearActiveProjectKey();
      instantiateMinimal("flush-noactive");
      // Active pointer is absent, so flush resolves nothing to save.
      expect(() => flushActiveDraft()).not.toThrow();
      expect(localStorage.getItem(draftKey("flush-noactive"))).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // T029 — Article IV guard: the autosave subscription is a SEPARATE lightweight
  // timer, NOT a second validation debounce cycle and NOT a parallel validation
  // path. Two complementary assertions:
  //   (1) by inspection — draftPersistence.ts imports no validator/oracle and
  //       reuses no 300ms validate debounce; its own timer is the 500ms
  //       autosave window, distinct from DEBOUNCE_MS (300).
  //   (2) at runtime — a store mutation that fires the autosave performs exactly
  //       one localStorage write (serialize + setItem) and no validation work.
  // ---------------------------------------------------------------------------
  describe("T029/Article IV: autosave is an independent lightweight timer, not a second validate cycle", () => {
    it("draftPersistence.ts wires no validator/oracle and does not reuse the 300ms validate debounce (inspection)", () => {
      const raw = readFileSync(path.join(currentDir, "draftPersistence.ts"), "utf-8");
      // Strip comments first: the module's DOC PROSE deliberately names the
      // validator/useValidator/DEBOUNCE_MS to explain what the autosave is NOT,
      // so a raw text match would be a false positive. We assert against CODE.
      const code = raw
        .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
        .replace(/^[ \t]*\/\/.*$/gm, ""); // whole-line // comments

      // No validation surface is imported or invoked from the persistence path.
      expect(code).not.toMatch(/validateWithOracle|runAllChecks/);
      expect(code).not.toMatch(/\buseValidator\b/);
      // It does not reuse the validator's 300ms debounce hook/constant — the
      // autosave timer is its OWN locally-declared 500ms window.
      expect(code).not.toMatch(/\buseDebounce\b/);
      expect(code).not.toMatch(/\bDEBOUNCE_MS\b/); // the 300ms validate constant
      expect(code).toMatch(/AUTOSAVE_DEBOUNCE_MS\s*=\s*500/);
    });

    it("the autosave debounce window (500ms) is distinct from the single validate cycle (300ms)", () => {
      // The validate cycle owns 300ms (Decision D3); the autosave owns 500ms.
      // A regression that folded autosave into the validate timer would collapse
      // these to one value — this pins them apart.
      expect(AUTOSAVE_DEBOUNCE_MS).toBe(500);
      expect(DEBOUNCE_MS).toBe(300);
      expect(AUTOSAVE_DEBOUNCE_MS).not.toBe(DEBOUNCE_MS);
    });

    it("an autosaved mutation performs exactly one localStorage write and zero validation work", () => {
      vi.useFakeTimers();
      const pk = "t029-no-validate";
      instantiateMinimal(pk);

      const teardown = installDraftAutosave(pk); // one synchronous install-time save
      const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

      useWorkingCopyStore.getState().lockDesktop(); // schedules the autosave
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);

      // The mutation produced a single draft write — no fan-out into a second
      // (validation) timer that would re-enter and write again.
      const draftWrites = setItemSpy.mock.calls.filter(([key]) => key === draftKey(pk));
      expect(draftWrites).toHaveLength(1);

      teardown();
    });
  });
});
