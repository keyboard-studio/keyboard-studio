// Shared artifact pipeline for PreviewScreen and OutputScreen.
//
// Encapsulates: baseKeyboard / pickerMode / scaffoldSpec local state,
// useKeyboardArtifact, useWorkingCopyTransform, onInstantiate, diagnostics
// derivation, canDownload, handleDownload, the zip-blob cleanup effect, and
// the download/identity warning state.
//
// Both screens mount this hook so each screen has its own live pipeline
// instance. The Zustand working-copy store (module-level singleton) persists
// across hash navigation, so selecting/instantiating on Output works
// standalone and handleDownload reads the settled store state regardless of
// which screen triggered the compile.

import { useCallback, useEffect, useRef, useState } from "react";
import type { BaseKeyboard, CompilerDiagnostic } from "@keyboard-studio/contracts";
import {
  useKeyboardArtifact,
  type ScaffoldSpec,
  type OnInstantiateCallback,
} from "./useKeyboardArtifact.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { instantiateFromBaseIfConfirmed } from "../lib/confirmRebase.ts";
import { useWorkingCopyTransform } from "./useWorkingCopyTransform.ts";
import { serializeWorkingCopy } from "../lib/serializeWorkingCopy.ts";

export type PickerMode = "open" | "scaffold";

export interface PreviewArtifact {
  // Picker state
  baseKeyboard: BaseKeyboard | null;
  pickerMode: PickerMode;
  scaffoldSpec: ScaffoldSpec | null;
  setScaffoldSpec: (spec: ScaffoldSpec | null) => void;
  handleBaseKeyboardChange: (kb: BaseKeyboard | null) => void;
  handlePickerModeChange: (mode: PickerMode) => void;

  // Artifact pipeline
  stage: ReturnType<typeof useKeyboardArtifact>["stage"];
  retry: ReturnType<typeof useKeyboardArtifact>["retry"];
  recompile: ReturnType<typeof useKeyboardArtifact>["recompile"];
  diagnostics: CompilerDiagnostic[];

  // Download state
  canDownload: boolean;
  downloading: boolean;
  downloadError: string | null;
  downloadWarnings: string[];
  handleDownload: () => Promise<void>;

  // Identity warning
  showIdentityWarn: boolean;
}

export function usePreviewArtifact(): PreviewArtifact {
  const [baseKeyboard, setBaseKeyboard] = useState<BaseKeyboard | null>(null);
  const [pickerMode, setPickerMode] = useState<PickerMode>("open");
  const [scaffoldSpec, setScaffoldSpec] = useState<ScaffoldSpec | null>(null);

  const handleBaseKeyboardChange = useCallback(
    (kb: BaseKeyboard | null) => {
      setBaseKeyboard(kb);
      if (pickerMode === "open") {
        setScaffoldSpec(null);
      }
    },
    [pickerMode],
  );

  const handlePickerModeChange = useCallback((mode: PickerMode) => {
    setPickerMode(mode);
    if (mode === "open") {
      setScaffoldSpec(null);
    }
  }, []);

  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadWarnings, setDownloadWarnings] = useState<string[]>([]);
  const zipBlobUrlRef = useRef<string | null>(null);

  // Clean up any lingering zip blob URL on unmount.
  useEffect(() => {
    return () => {
      if (zipBlobUrlRef.current !== null) {
        URL.revokeObjectURL(zipBlobUrlRef.current);
        zipBlobUrlRef.current = null;
      }
    };
  }, []);

  // onInstantiate: explicit working-copy instantiation (spec §8 v1.3.0, Track 1).
  // Delegates to instantiateFromBaseIfConfirmed which reads live store state via
  // getState() so the stale-closure problem cannot arise even though this
  // callback is memoised.
  const onInstantiate = useCallback<OnInstantiateCallback>((base, { vfs, ir }) => {
    instantiateFromBaseIfConfirmed(base, { vfs, ir });
  }, []);

  // Working-copy transform — projects carve + identity layers into the pick-base
  // OSK. Returns null when the working copy is not yet instantiated.
  const workingCopyTransform = useWorkingCopyTransform();

  const activeSpec = pickerMode === "scaffold" ? scaffoldSpec : null;
  const { stage, retry, recompile } = useKeyboardArtifact(
    baseKeyboard,
    activeSpec,
    workingCopyTransform,
    onInstantiate,
  );

  const diagnostics: CompilerDiagnostic[] =
    stage.kind === "ready"
      ? stage.compileResult.diagnostics
      : stage.kind === "error" && stage.compileResult !== undefined
        ? stage.compileResult.diagnostics
        : [];

  // Working-copy instantiation state — used for canDownload and the
  // not-instantiated guard in handleDownload.
  const isInstantiated = useWorkingCopyStore((s) => s.baseKeyboard !== null);

  // Identity-unset warning: shown non-blocking when Track 1 author has not
  // set a unique keyboard id (id still equals the base keyboard's id).
  const instantiationMode = useWorkingCopyStore((s) => s.instantiationMode);
  const storeIdentity = useWorkingCopyStore((s) => s.identity);
  const storeBaseKeyboard = useWorkingCopyStore((s) => s.baseKeyboard);
  const showIdentityWarn =
    instantiationMode === "new-from-base" &&
    storeBaseKeyboard !== null &&
    (storeIdentity?.keyboardId === undefined ||
      storeIdentity.keyboardId === storeBaseKeyboard.id);

  // canDownload: require the compile to be ready AND the working copy to be
  // instantiated (baseVfs + baseIr available in the store). The serializer
  // builds the zip from the store's baseVfs, not from stage.vfs, so the
  // download contains the full projected working copy including assignments.
  const canDownload = stage.kind === "ready" && isInstantiated;

  const handleDownload = useCallback(async () => {
    if (stage.kind !== "ready") return;
    setDownloading(true);
    setDownloadError(null);
    setDownloadWarnings([]);
    try {
      // Serialize via the canonical path: projectWorkingCopyVfs (carve +
      // assignments + identity) → toZip. Returns null when the working copy
      // is not instantiated (no baseVfs / baseIr in the store).
      const result = await serializeWorkingCopy();
      if (result === null) {
        setDownloadError("Nothing to download — select a keyboard first.");
        return;
      }

      // Surface any projection warnings to the user (carve safety gate,
      // missing patterns, identity-injection failures). Warn-only: the
      // download still proceeds so the user is not silently blocked.
      if (result.warnings.length > 0) {
        console.warn("[studio] download projection warnings:", result.warnings);
        setDownloadWarnings(result.warnings);
      }

      const { bytes } = result;
      // Coerce to ArrayBuffer to satisfy Blob constructor's strict BlobPart type.
      const buf =
        bytes.buffer instanceof ArrayBuffer
          ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
          : new Uint8Array(bytes).buffer;
      const blob = new Blob([buf], { type: "application/zip" });

      // Revoke previous zip URL before creating a new one.
      if (zipBlobUrlRef.current !== null) {
        URL.revokeObjectURL(zipBlobUrlRef.current);
        zipBlobUrlRef.current = null;
      }

      const url = URL.createObjectURL(blob);
      zipBlobUrlRef.current = url;
      try {
        const a = document.createElement("a");
        a.href = url;
        // Use the keyboardId + release version from the serializer result
        // (derived from the store's baseKeyboard.id and baseIr.header.version)
        // so the filename is always consistent with the content.
        const downloadId = result.keyboardId;
        a.download = `${downloadId}-${result.version}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } finally {
        // Revoke after the click tick so the browser has time to start the download.
        URL.revokeObjectURL(url);
        zipBlobUrlRef.current = null;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Download failed";
      setDownloadError(msg);
    } finally {
      setDownloading(false);
    }
  }, [stage]);

  return {
    baseKeyboard,
    pickerMode,
    scaffoldSpec,
    setScaffoldSpec,
    handleBaseKeyboardChange,
    handlePickerModeChange,
    stage,
    retry,
    recompile,
    diagnostics,
    canDownload,
    downloading,
    downloadError,
    downloadWarnings,
    handleDownload,
    showIdentityWarn,
  };
}
