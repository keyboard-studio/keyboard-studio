# Code Review: clavbur9.kmn (Clavier du Burkina v9.1.3)

**File:** `release/c/clavbur9/source/clavbur9.kmn`  
**Reviewer:** Claude Code  
**Date:** 2026-06-03

---

## Summary

Overall the keyboard is well-structured. The diacritic reordering logic is especially careful. A few things warrant attention.

| Severity | Issue |
|---|---|
| Medium | NFC comment vs. actual NFD output — may affect French spell-check |
| Low | Undocumented `beep` padding entries in `specchar1K` |
| Low | Silent fallthrough for non-dot-below diacritics on `d`/`D` |
| Low | NFD touch-key output inconsistent with stated NFC goal |
| Verify | `$keymanweb` store mixing virtual key code + character literal |
| Cosmetic | `DrsisK` should be `DieresisK` |

---

## Issues

### 1. NFC comment contradicts actual NFD output (lines 40-46)

The comment states the rules "create NFC values only for ANSI equivalents" to fix French spell-checker problems with NFD. But the rule at line 90:

```keyman
any(Umodifiable) + any(modifierK) > context index(Umodifier,2)
```

outputs the base character (`context`) followed by a combining diacritic (`index(Umodifier,2)`). That is NFD, not NFC. For example, typing `e /` produces U+0065 + U+0301 (NFD e + combining acute), not U+00E9 (NFC precomposed é). No precomposition rules exist anywhere in the file.

The comment is either aspirational (NFC rules were planned but never written) or incorrect. If French spell-checkers actually fail with NFD output, this issue is still live. Options:

- Implement explicit NFC rules for the common ANSI composites (A, E, I, O, U + the basic combining diacritics mapping to their precomposed forms).
- Or update the comment to accurately describe the limitation.

---

### 2. Undocumented `beep` entries in parallel stores (lines 49-53)

Positions 11 (`R`), 23 (`j`), and 27 (`r`) in `specchar1K` / `Uspecchar1` map to `beep` rather than a character. The effect is that `;R`, `;j`, and `;r` produce a beep and no output. This is presumably intentional padding to hold positional alignment, but it is not documented. A short inline comment on each `beep` entry (e.g., `c no character -- reserved`) would prevent confusion when maintaining the store.

---

### 3. Diacritics on `d`/`D` -- only dot-below is handled (line 95)

```keyman
store(cons)  U+0044 U+0064
...
any(cons) + any(DotBK) > context index(UDotB,2)
```

`d` and `D` are absent from `Umodifiable`, so only the explicit `DotBK` rule at line 95 applies to them. Any other modifier key pressed after `d` or `D` falls through silently with no output and no beep. If other diacritics on `d`/`D` are intentionally out of scope, a comment should say so. A `beep` fallback for unhandled modifier+`d` combinations would be better than silent fallthrough.

---

### 4. Touch-key output is NFD, inconsistent with the stated NFC goal (lines 104-105)

```keyman
+ [T_0064_0323] > U+0064 U+0323
+ [SHIFT T_0044_0323] > U+0044 U+0323
```

These output NFD d + combining dot below (U+0064 U+0323) rather than the NFC precomposed forms U+1E0D (ḍ) and U+1E0C (Ḍ). This is consistent with the "too complex for all composites" caveat in the source, but it means the touch-layout path and the diacritic-composition path produce non-equivalent byte sequences for the same visual result. Worth noting for any downstream normalization requirements.

---

### 5. `$keymanweb` store mixes virtual key code and character literal (lines 16-17)

```keyman
$keymanweb: store(lessthan)    [K_oE2] "<"
$keymanweb: store(greaterthan) [SHIFT K_oE2] ">"
```

Mixing a virtual key identifier (`[K_oE2]`) and a character literal (`"<"`) in the same store is unusual KMN. The intent is clear -- match the key or the literal `<` on KeymanWeb -- but this should be verified that it compiles and behaves correctly in current Keyman Developer. If `[K_oE2]` is not a valid store element in this context, the rule at line 97 might silently match only `<` and miss the physical key, causing the `<>` key to not produce guillemets on some AZERTY layouts.

---

### 6. `DrsisK` abbreviation is opaque (line 25)

All other modifier-key store names are readable (`GraveK`, `CircK`, `CaronK`, `TildeK`, etc.) but `DrsisK` for dieresis is a non-obvious contraction. `DieresisK` or `UmlautK` would make the intent immediately clear to a future maintainer.

---

## What looks correct

- **`specchar1K` / `Uspecchar1` alignment:** 33 entries on each side.
- **`specchar2K` / `Uspecchar2` alignment:** 6 entries on each side.
- **`modifierK` / `Umodifier` alignment:** 13 entries on each side.
- **`angleit` group:** Correctly implements French typographic guillemet expansion (`<<` -> `«`, then `«<` -> `« <`, and the corresponding closing logic including the context-reorder on line 112).
- **`Udiacritics` reordering:** Tilde-specific cases (lines 116-118) are correctly ordered before the general three-modifier fallback (line 120). The `below`/`above` split (line 119) correctly preserves valid stacking without reordering.
- **CapSchwa / LCSchwa warning comment** (lines 38-39): The note distinguishing U+01DD from U+0259 is an important correctness guard.
- **`U+0251` separate rule** (line 94): Correctly extends diacritic support to alpha (ɑ), which is produced by the `,a` rule but absent from `Umodifiable`.
