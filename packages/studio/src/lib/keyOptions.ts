// Shared key-options catalog for the mechanism and touch galleries.
// Single source of truth for the physical key list used by both S-01 / S-08
// (MechanismGallery) and the long-press / flick / multitap host-key pickers
// (TouchGallery).

export const KEY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "-- choose a key --" },
  { value: "K_A", label: "K_A (A)" }, { value: "K_B", label: "K_B (B)" },
  { value: "K_C", label: "K_C (C)" }, { value: "K_D", label: "K_D (D)" },
  { value: "K_E", label: "K_E (E)" }, { value: "K_F", label: "K_F (F)" },
  { value: "K_G", label: "K_G (G)" }, { value: "K_H", label: "K_H (H)" },
  { value: "K_I", label: "K_I (I)" }, { value: "K_J", label: "K_J (J)" },
  { value: "K_K", label: "K_K (K)" }, { value: "K_L", label: "K_L (L)" },
  { value: "K_M", label: "K_M (M)" }, { value: "K_N", label: "K_N (N)" },
  { value: "K_O", label: "K_O (O)" }, { value: "K_P", label: "K_P (P)" },
  { value: "K_Q", label: "K_Q (Q)" }, { value: "K_R", label: "K_R (R)" },
  { value: "K_S", label: "K_S (S)" }, { value: "K_T", label: "K_T (T)" },
  { value: "K_U", label: "K_U (U)" }, { value: "K_V", label: "K_V (V)" },
  { value: "K_W", label: "K_W (W)" }, { value: "K_X", label: "K_X (X)" },
  { value: "K_Y", label: "K_Y (Y)" }, { value: "K_Z", label: "K_Z (Z)" },
  { value: "K_0", label: "K_0 (0)" }, { value: "K_1", label: "K_1 (1)" },
  { value: "K_2", label: "K_2 (2)" }, { value: "K_3", label: "K_3 (3)" },
  { value: "K_4", label: "K_4 (4)" }, { value: "K_5", label: "K_5 (5)" },
  { value: "K_6", label: "K_6 (6)" }, { value: "K_7", label: "K_7 (7)" },
  { value: "K_8", label: "K_8 (8)" }, { value: "K_9", label: "K_9 (9)" },
  { value: "K_LBRKT", label: "K_LBRKT ([)" }, { value: "K_RBRKT", label: "K_RBRKT (])" },
  { value: "K_BKSLASH", label: "K_BKSLASH (\\)" }, { value: "K_SEMI", label: "K_SEMI (;)" },
  { value: "K_QUOTE", label: "K_QUOTE (')" }, { value: "K_COMMA", label: "K_COMMA (,)" },
  { value: "K_PERIOD", label: "K_PERIOD (.)" }, { value: "K_SLASH", label: "K_SLASH (/)" },
  { value: "K_BKQUOTE", label: "K_BKQUOTE (`)" },
];

// O(1) membership set — all non-empty KEY_OPTIONS values.
// Used in both galleries for tap-to-select routing (a key tapped in the OSK
// preview is validated against this set before wiring to a host-key picker).
// Not specific to any one mechanism — it is the full pickable-key set.
export const ALL_PICKABLE_KEYS: ReadonlySet<string> = new Set(
  KEY_OPTIONS.filter((o) => o.value !== "").map((o) => o.value),
);

// Use-case-named alias for TouchGallery host-key validation (identical set).
export const VALID_HOST_KEYS: ReadonlySet<string> = ALL_PICKABLE_KEYS;
