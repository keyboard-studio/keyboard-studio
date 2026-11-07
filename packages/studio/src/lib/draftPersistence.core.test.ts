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


import { describe, it, expect, vi } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { StartKeyboard, SurveyPhaseResult } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { getDecisionSnapshot, selectTouchSeedSource, useDecisionStore } from "../stores/decisionStore.ts";
import { instantiateMinimal, makeScaffoldedIR } from "../test/draftSeeds.ts";
import { DRAFT_KEY_PREFIX, DRAFT_VERSION, draftKey, saveDraft, loadDraft, clearDraft, resolveActiveProjectKey, setActiveProjectKey, clearActiveProjectKey, discardActiveDraft, deriveProjectKeyFromWorkingCopy, wasDraftRestoredThisBoot, listDrafts, DRAFT_INDEX_KEY, PENDING_PROJECT_KEY, type DurableDraft } from "./draftPersistence.ts";
import { makeIrWithRemovableRule, installDraftPersistenceHooks } from "./draftPersistence.testkit.ts";

// serverDraftStore's fetch-based transport is mocked at the module boundary
// (P1-2) so startCloudSync/recordProjectSubmission tests never touch the
// network — the whole module is replaced since every function it exports is a
// real HTTP call. vi.mock hoists per file, so each split file repeats it.
vi.mock("./serverDraftStore.ts", () => ({
  saveServerDraft: vi.fn(async () => true),
  saveServerDraftBeacon: vi.fn(),
  clearServerDraft: vi.fn(async () => true),
}));

installDraftPersistenceHooks();

describe("draftPersistence", () => {
  // Must run before any test performs a successful loadDraft() — see the
  // module header note on wasDraftRestoredThisBoot's monotonic flag.
  it("wasDraftRestoredThisBoot() is false before any successful loadDraft this boot", () => {
    expect(wasDraftRestoredThisBoot()).toBe(false);
  });


  describe("constants + draftKey", () => {
    it("DRAFT_KEY_PREFIX and DRAFT_VERSION match the documented contract", () => {
      expect(DRAFT_KEY_PREFIX).toBe("ks.draft.");
      expect(DRAFT_VERSION).toBe(2); // spec 088 FR-007: bumped 1 → 2
    });

    it("draftKey namespaces and versions the per-project key", () => {
      expect(draftKey("my_kbd")).toBe("ks.draft.my_kbd.v2");
    });
  });

  describe("deriveProjectKeyFromWorkingCopy", () => {
    it("prefers identity.keyboardId when present", () => {
      const key = deriveProjectKeyFromWorkingCopy({
        identity: { keyboardId: "from-identity" },
        startKeyboard: { id: "from-base", displayName: "X", languages: [] } as StartKeyboard,
      });
      expect(key).toBe("from-identity");
    });

    it("falls back to baseKeyboard.id when identity has no keyboardId yet (Track 1 immediate-instantiation window)", () => {
      const key = deriveProjectKeyFromWorkingCopy({
        identity: null,
        startKeyboard: { id: "from-base", displayName: "X", languages: [] } as StartKeyboard,
      });
      expect(key).toBe("from-base");
    });

    it("returns null before any instantiation (both sources absent)", () => {
      expect(deriveProjectKeyFromWorkingCopy({ identity: null, startKeyboard: null })).toBeNull();
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

  // ---------------------------------------------------------------------------
  // F6 regression (docs/design-notes/switch-base-popup-behavior-log.md):
  // pre-instantiation progress (wizard levels L1/L2 — identity answers, an
  // un-confirmed base preview) must survive a save/load round-trip under the
  // reserved PENDING_PROJECT_KEY slot, the SAME way an instantiated project's
  // draft already does. Before the fix, `saveDraft`'s VR-2 guard refused to
  // write ANYTHING before instantiation, and `loadDraft` refused to apply a
  // record with `instantiationMode === null` even if one existed — so this
  // whole round-trip was previously impossible for any projectKey, pending or
  // not.
  // ---------------------------------------------------------------------------
  describe("F6: pending-slot persistence for pre-instantiation progress", () => {
    it("saveDraft still no-ops for the pending key when there is no meaningful progress (pristine identity step)", () => {
      expect(useWorkingCopyStore.getState().instantiationMode).toBeNull();
      expect(useSurveySessionStore.getState().activeStepId).toBe("identity");
      saveDraft(PENDING_PROJECT_KEY);
      expect(localStorage.getItem(draftKey(PENDING_PROJECT_KEY))).toBeNull();
    });

    it("saveDraft persists identity-lite progress (L1) under the pending key even though the working copy is not instantiated", () => {
      useSurveySessionStore.getState().advance("choose_base");
      useSurveySessionStore.setState({
        identityResult: { english: "Test", autonym: "Test", bcp47: "und", prefill: { script: "Latn" } } as never,
      });

      saveDraft(PENDING_PROJECT_KEY);

      const stored = localStorage.getItem(draftKey(PENDING_PROJECT_KEY));
      expect(stored).not.toBeNull();
      const saved = JSON.parse(stored!) as DurableDraft;
      expect(saved.workingCopy.instantiationMode).toBeNull();
      expect(saved.traversal.activeStepId).toBe("choose_base");
      expect(resolveActiveProjectKey()).toBe(PENDING_PROJECT_KEY);
    });

    it("saveDraft persists an un-confirmed base preview (L2) under the pending key", () => {
      const base = { id: "preview_only", displayName: "Preview Only", languages: [] } as unknown as StartKeyboard;
      useSurveySessionStore.getState().advance("choose_base");
      useSurveySessionStore.getState().setLocalStart(base);
      // Explicitly NOT confirmed — the working copy stays uninstantiated.
      expect(useWorkingCopyStore.getState().instantiationMode).toBeNull();

      saveDraft(PENDING_PROJECT_KEY);

      const saved = JSON.parse(localStorage.getItem(draftKey(PENDING_PROJECT_KEY))!) as DurableDraft;
      expect(saved.workingCopy.instantiationMode).toBeNull();
      expect(saved.traversal.localStart?.id).toBe("preview_only");
    });

    it("loadDraft restores pending-slot progress (activeStepId + localBase) even though instantiationMode is null", () => {
      const base = { id: "preview_only_2", displayName: "Preview Only 2", languages: [] } as unknown as StartKeyboard;
      useSurveySessionStore.getState().advance("choose_base");
      useSurveySessionStore.getState().setLocalStart(base);
      saveDraft(PENDING_PROJECT_KEY);

      // Cold reset — nothing left to inherit from.
      useWorkingCopyStore.getState().reset();
      useSurveySessionStore.getState().reset();
      expect(useSurveySessionStore.getState().activeStepId).toBe("identity");

      expect(loadDraft(PENDING_PROJECT_KEY)).toBe(true);

      expect(useWorkingCopyStore.getState().instantiationMode).toBeNull();
      const session = useSurveySessionStore.getState();
      expect(session.activeStepId).toBe("choose_base");
      expect(session.localStart?.id).toBe("preview_only_2");
      expect(wasDraftRestoredThisBoot()).toBe(true);
    });

    it("a NON-pending projectKey is still refused when uninstantiated, even with meaningful survey progress (the relaxation is scoped to PENDING_PROJECT_KEY only)", () => {
      useSurveySessionStore.getState().advance("choose_base");
      useSurveySessionStore.setState({
        identityResult: { english: "Test", autonym: "Test", bcp47: "und", prefill: { script: "Latn" } } as never,
      });

      saveDraft("some_other_key");

      expect(localStorage.getItem(draftKey("some_other_key"))).toBeNull();
    });

    // P1 regression (review finding 1): saveDraft's index upsert must never
    // write a `PENDING_PROJECT_KEY` row. MyKeyboardsList (listDrafts's
    // exclusive consumer) would otherwise render a phantom "Untitled
    // keyboard" card for an author who has only answered the identity
    // question — no keyboard picked yet, nothing to resume into.
    it("saveDraft under the pending key writes the draft RECORD but leaves the 'My keyboards' index empty — loadDraft still restores it", () => {
      useSurveySessionStore.getState().advance("choose_base");
      useSurveySessionStore.setState({
        identityResult: { english: "Test", autonym: "Test", bcp47: "und", prefill: { script: "Latn" } } as never,
      });

      saveDraft(PENDING_PROJECT_KEY);

      // The record itself IS written (unchanged from the tests above)...
      expect(localStorage.getItem(draftKey(PENDING_PROJECT_KEY))).not.toBeNull();
      // ...but no index row exists for it, under either read path.
      expect(JSON.parse(localStorage.getItem(DRAFT_INDEX_KEY) ?? "[]")).toEqual([]);
      expect(listDrafts()).toEqual([]);
      expect(listDrafts().some((e) => e.projectKey === PENDING_PROJECT_KEY)).toBe(false);

      // Boot-resume is unaffected: it resolves via the ks.draft.active
      // pointer, never via the index.
      useWorkingCopyStore.getState().reset();
      useSurveySessionStore.getState().reset();
      expect(loadDraft(PENDING_PROJECT_KEY)).toBe(true);
      expect(useSurveySessionStore.getState().activeStepId).toBe("choose_base");

      // Still no index row after the restore (loadDraft never upserts).
      expect(listDrafts()).toEqual([]);
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
      const base: StartKeyboard = {
        id: pk,
        displayName: "Corrupt Base64 Test",
        languages: [],
      } as unknown as StartKeyboard;
      // A real binary VFS entry, correctly Base64-encoded at first — mirrors the
      // G-1/G-5 round-trip test's fixture shape rather than a stripped-down one.
      const vfs = createVirtualFS([
        { path: "source/welcome/welcome.htm", content: new Uint8Array([1, 2, 3, 4]), isBinary: true },
      ]);
      useWorkingCopyStore.getState().instantiateFromStart(base, { vfs, ir: makeScaffoldedIR() });

      saveDraft(pk);
      const stored = localStorage.getItem(draftKey(pk));
      expect(stored).not.toBeNull();

      // Corrupt exactly the Base64 `content` field of the (isBinary: true) VFS
      // entry — atob() rejects "!" as outside the Base64 alphabet — while leaving
      // isBinary: true so deserializeEntry still takes the atob() path.
      const envelope = JSON.parse(stored!) as DurableDraft;
      const entries = (envelope.workingCopy as unknown as { startVfsEntries: Array<{ isBinary: boolean; content: string }> })
        .startVfsEntries;
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
      const base = { id: pk, displayName: "Atomic Test", languages: [] } as unknown as StartKeyboard;
      const vfs = createVirtualFS([
        { path: "source/icon.ico", content: new Uint8Array([9, 8, 7, 6]), isBinary: true },
      ]);
      useWorkingCopyStore.getState().instantiateFromStart(base, { vfs, ir: makeScaffoldedIR() });
      saveDraft(pk);

      // Corrupt the (isBinary) VFS entry so prepareWorkingCopySnapshot's atob() throws.
      const envelope = JSON.parse(localStorage.getItem(draftKey(pk))!) as DurableDraft;
      const entries = (envelope.workingCopy as unknown as { startVfsEntries: Array<{ isBinary: boolean; content: string }> })
        .startVfsEntries;
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

  describe("SC-001 (supersedes spec 034 VR-5): a project switch PRESERVES the prior project's draft", () => {
    // Spec 034's VR-5 asserted the opposite of these tests: instantiating
    // under a different projectKey cleared the previously-active project's
    // draft, because only one draft could exist. "My keyboards" makes several
    // drafts co-exist, so the same behavior is now data loss — an author
    // starts keyboard B and finds keyboard A gone from their list. The guard
    // (and its call site in StudioShell's onInstantiate) is removed; these
    // tests pin the replacement guarantee so it cannot silently regress.

    it("both drafts remain listed after the author switches projects", () => {
      instantiateMinimal("proj-a");
      saveDraft("proj-a"); // also points the active pointer at proj-a
      expect(resolveActiveProjectKey()).toBe("proj-a");

      // The author returns to the gallery and picks a different base — the
      // exact sequence StudioShell's onInstantiate runs.
      useWorkingCopyStore.getState().reset();
      instantiateMinimal("proj-b");
      saveDraft("proj-b");

      expect(localStorage.getItem(draftKey("proj-a"))).not.toBeNull();
      expect(localStorage.getItem(draftKey("proj-b"))).not.toBeNull();
      expect(
        listDrafts()
          .map((e) => e.projectKey)
          .sort(),
      ).toEqual(["proj-a", "proj-b"]);
      // The pointer follows the project now being edited.
      expect(resolveActiveProjectKey()).toBe("proj-b");
    });

    it("abandonment stays explicit — only discardActiveDraft removes a draft", () => {
      instantiateMinimal("proj-keep");
      saveDraft("proj-keep");
      useWorkingCopyStore.getState().reset();
      instantiateMinimal("proj-drop");
      saveDraft("proj-drop");
      expect(listDrafts()).toHaveLength(2);

      // "Start over" on the ACTIVE project (proj-drop) discards exactly that
      // one and leaves the other alone.
      discardActiveDraft();

      expect(listDrafts().map((e) => e.projectKey)).toEqual(["proj-keep"]);
      expect(localStorage.getItem(draftKey("proj-drop"))).toBeNull();
      expect(resolveActiveProjectKey()).toBeNull();
    });
  });

  describe("G-1/G-5: round-trip save + load restores BOTH stores from a single draft", () => {
    it("restores working-copy IR/identity/deletions/phaseResults AND traversal position/history/touch-seed decision, never re-instantiating a second working copy", () => {
      const base: StartKeyboard = {
        id: "test_keyboard",
        displayName: "Test Keyboard",
        languages: ["en"],
      } as StartKeyboard;
      const ir = makeIrWithRemovableRule();
      const vfs = createVirtualFS([
        { path: "source/test_keyboard.kmn", content: "c Test\n", isBinary: false },
      ]);

      useWorkingCopyStore.getState().instantiateFromStart(base, { vfs, ir });
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
      // the spec-035 touch-seed fork choice — since spec 088 that choice is
      // the `touch-seed-source` decision, not a session field.
      useSurveySessionStore.getState().advance("choose_base");
      // No "track": the step was removed by #2568; attribution is the
      // next step after choose_base on the copy track.
      useSurveySessionStore.getState().advance("attribution");
      useDecisionStore.getState().record({
        id: "touch-seed-source",
        value: "import-adapt",
        provenance: "asked",
        step: "touch_seed_source",
      });

      const projectKey = deriveProjectKeyFromWorkingCopy(useWorkingCopyStore.getState());
      expect(projectKey).toBe("test_keyboard");

      saveDraft(projectKey!);
      expect(localStorage.getItem(draftKey(projectKey!))).not.toBeNull();

      // Cold reset the stores — nothing left to inherit from; a partial reset
      // would mask a restore that only APPEARED to work.
      useWorkingCopyStore.getState().reset();
      useSurveySessionStore.getState().reset();
      useDecisionStore.getState().reset();
      expect(useWorkingCopyStore.getState().instantiationMode).toBeNull();
      expect(useSurveySessionStore.getState().activeStepId).toBe("identity");

      // G-5: restore must patch the SAME store, never construct a second one.
      const instantiateFromStartSpy = vi.spyOn(useWorkingCopyStore.getState(), "instantiateFromStart");
      const instantiateFromExistingSpy = vi.spyOn(useWorkingCopyStore.getState(), "instantiateFromExisting");

      const result = loadDraft(projectKey!);
      expect(result).toBe(true);

      expect(instantiateFromStartSpy).not.toHaveBeenCalled();
      expect(instantiateFromExistingSpy).not.toHaveBeenCalled();

      const wc = useWorkingCopyStore.getState();
      expect(wc.instantiationMode).toBe("new-from-base");
      expect(wc.startKeyboard?.id).toBe("test_keyboard");
      expect(wc.identity?.bcp47).toBe("en-Latn");
      expect(wc.deletedNodeIds.has("rule-s01-1")).toBe(true);
      expect(wc.phaseResults).toHaveLength(1);
      expect(wc.phaseResults[0]?.phase).toBe("B");

      const session = useSurveySessionStore.getState();
      expect(session.activeStepId).toBe("attribution");
      expect(session.history).toEqual(["identity", "choose_base"]);
      // (a) the touch-seed choice round-trips through the draft's decisions
      // slice (spec 088 — it no longer rides the traversal snapshot).
      expect(selectTouchSeedSource(getDecisionSnapshot())).toBe("import-adapt");

      expect(wasDraftRestoredThisBoot()).toBe(true);
    });
  });});
