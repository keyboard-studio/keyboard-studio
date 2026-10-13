// criteriaRecordStore.test.ts — tests for the spec 084 D5 criteria record store.
import { describe, it, expect, beforeEach } from "vitest";
import {
  useCriteriaRecordStore,
  getCriteriaRecordSnapshot,
  applyCriteriaRecordSnapshot,
  EMPTY_CRITERIA_RECORD,
  type CriteriaRecord,
} from "./criteriaRecordStore.ts";

beforeEach(() => {
  useCriteriaRecordStore.getState().reset();
});

describe("criteriaRecordStore (spec 084 D5)", () => {
  it("starts empty, matching EMPTY_CRITERIA_RECORD", () => {
    expect(getCriteriaRecordSnapshot()).toEqual(EMPTY_CRITERIA_RECORD);
    expect(getCriteriaRecordSnapshot()).toEqual({ attestations: {}, confirmations: {} });
  });

  it("attest records the answer with an ISO timestamp", () => {
    useCriteriaRecordStore.getState().attest("criterion-a", "yes");
    const attestation = useCriteriaRecordStore.getState().attestations["criterion-a"];
    expect(attestation?.answer).toBe("yes");
    expect(typeof attestation?.at).toBe("string");
    expect(Number.isNaN(Date.parse(attestation!.at))).toBe(false);
  });

  it("attest overwrites on re-attest, leaving every other attestation untouched", () => {
    const store = useCriteriaRecordStore.getState();
    store.attest("criterion-a", "yes");
    store.attest("criterion-b", "not-applicable");
    store.attest("criterion-a", "no");
    const { attestations } = useCriteriaRecordStore.getState();
    expect(attestations["criterion-a"]?.answer).toBe("no");
    expect(attestations["criterion-b"]?.answer).toBe("not-applicable");
    expect(Object.keys(attestations)).toHaveLength(2);
  });

  it("clearAttestation removes only that id", () => {
    const store = useCriteriaRecordStore.getState();
    store.attest("criterion-a", "yes");
    store.attest("criterion-b", "no");
    store.clearAttestation("criterion-a");
    const { attestations } = useCriteriaRecordStore.getState();
    expect(attestations["criterion-a"]).toBeUndefined();
    expect(attestations["criterion-b"]?.answer).toBe("no");
    expect(Object.keys(attestations)).toHaveLength(1);
  });

  it("confirm records a timestamp and unconfirm removes only that id", () => {
    const store = useCriteriaRecordStore.getState();
    store.confirm("criterion-a");
    store.confirm("criterion-b");
    const confirmation = useCriteriaRecordStore.getState().confirmations["criterion-a"];
    expect(typeof confirmation?.at).toBe("string");
    expect(Number.isNaN(Date.parse(confirmation!.at))).toBe(false);

    store.unconfirm("criterion-a");
    const { confirmations } = useCriteriaRecordStore.getState();
    expect(confirmations["criterion-a"]).toBeUndefined();
    expect(confirmations["criterion-b"]).toBeDefined();
    expect(Object.keys(confirmations)).toHaveLength(1);
  });

  it("reset empties both maps", () => {
    const store = useCriteriaRecordStore.getState();
    store.attest("criterion-a", "yes");
    store.confirm("criterion-b");
    store.reset();
    expect(getCriteriaRecordSnapshot()).toEqual({ attestations: {}, confirmations: {} });
  });

  it("snapshot → apply is a round-trip identity", () => {
    const store = useCriteriaRecordStore.getState();
    store.attest("criterion-a", "not-applicable");
    store.confirm("criterion-b");
    const snapshot: CriteriaRecord = getCriteriaRecordSnapshot();

    useCriteriaRecordStore.getState().reset();
    expect(getCriteriaRecordSnapshot()).toEqual(EMPTY_CRITERIA_RECORD);

    applyCriteriaRecordSnapshot(snapshot);
    expect(getCriteriaRecordSnapshot()).toEqual(snapshot);
    expect(useCriteriaRecordStore.getState().attestations["criterion-a"]?.answer).toBe(
      "not-applicable",
    );
    expect(useCriteriaRecordStore.getState().confirmations["criterion-b"]?.at).toBe(
      snapshot.confirmations["criterion-b"]?.at,
    );
  });

  it("apply restores a JSON round-tripped snapshot intact", () => {
    const store = useCriteriaRecordStore.getState();
    store.attest("criterion-a", "yes");
    store.confirm("criterion-b");
    const snapshot = getCriteriaRecordSnapshot();
    useCriteriaRecordStore.getState().reset();
    applyCriteriaRecordSnapshot(JSON.parse(JSON.stringify(snapshot)) as CriteriaRecord);
    expect(getCriteriaRecordSnapshot()).toEqual(snapshot);
  });
});
