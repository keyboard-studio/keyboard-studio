import os
import re
import sys

# === CONFIGURATION ===
ROOT_DIR = sys.argv[1] if len(sys.argv) > 1 else "D:\\Github\\keyboards\\release\\basic"

def parse_outputs(lines):
    outputs = {}
    for line in lines:
        match = re.search(r'\+\s*(\[.*?\])\s*>\s*(.*)', line)
        if match:
            key = match.group(1)
            output = match.group(2).strip()
            if output.startswith("'") and output.endswith("'"):
                output = output[1:-1]
            elif output.upper().startswith("U+"):
                try:
                    output = chr(int(output[2:], 16))
                except ValueError:
                    continue
            outputs.setdefault(key, set()).add(output)
    return outputs

def collect_base_keys(outputs):
    base_keys = set()
    for key in outputs:
        key = key.replace("[", "").replace("]", "")
        for part in key.split():
            if part.startswith("K_"):
                base_keys.add(part)
                break
    return base_keys

def compress_single_letter_keys(keys):
    # Extract and sort the single-letter keys
    single_letter_keys = sorted(k for k in keys if re.fullmatch(r"K_[A-Z]", k))
    letters = [k[-1] for k in single_letter_keys]

    # Group into contiguous ranges
    ranges = []
    start = end = None

    for ch in letters:
        if start is None:
            start = end = ch
        elif ord(ch) == ord(end) + 1:
            end = ch
        else:
            ranges.append((start, end))
            start = end = ch
    if start is not None:
        ranges.append((start, end))

    # Convert ranges to string representation
    collapsed = [f"[K_{s}]..[K_{e}]" if s != e else f"K_{s}" for s, e in ranges]

    # Handle K_0 through K_9 as a collapsed range if all are present
    number_keys = [f"K_{i}" for i in range(0, 10)]
    if all(k in keys for k in number_keys):
        collapsed.append("[K_0]..[K_9]")
        # Remove individual K_0..K_9 from keys to avoid duplication
        for k in number_keys:
            if k in keys:
                keys.remove(k)
    else:
        # Add any individual number keys not in a full range
        for k in number_keys:
            if k in keys:
                collapsed.append(f"[{k}]")

    return collapsed

def scan_caps_sensitive_keys(outputs):
    caps_sensitive = []
    unknown_sensitivity = []
    number_row_caps = False
    letter_caps = False
    base_keys = collect_base_keys(outputs)  # e.g., returns ['K_Q', 'K_A', 'K_ENTER', ...]
    can_not_compress = False
    for base_key in base_keys:
        base_form = f"[{base_key}]"
        shift_form = f"[SHIFT {base_key}]"
        caps_form = f"[CAPS {base_key}]"

        caps_out = outputs.get(caps_form, set())
        if caps_out:
            base_out = set()
            for key, value in outputs.items():
                if key.replace("NCAPS ", "") == base_form:
                    base_out = value
                    break
            shift_out = set()
            for key, value in outputs.items():
                if key.replace("NCAPS ", "") == shift_form:
                    shift_out = value
                    break
            if caps_out == base_out:
                continue
            elif caps_out == shift_out:
                if base_key[-1].isdigit():
                    number_row_caps = True
                if len(base_key) == 3 and base_key[-1].isalpha():
                    letter_caps = True
                caps_sensitive.append(base_key)
            else:
                can_not_compress = True
        else:
            # If CAPS form doesn't exist, we can't determine anything
            unknown_sensitivity.append(base_key)

    if can_not_compress or len(caps_sensitive) == 0:
        return None
    
    if len(unknown_sensitivity) > 0:
        if letter_caps or number_row_caps:
            for k in unknown_sensitivity:
                if number_row_caps and k[-1].isdigit():
                    # Assume all number keys are CAPS sensitive
                    caps_sensitive.append(k)
                elif letter_caps and len(k) == 3 and k[-1].isalpha():
                    # Assume all letter keys are CAPS sensitive
                    caps_sensitive.append(k)
                elif letter_caps and number_row_caps:
                    # Assume all unknowns are CAPS sensitive (Azerty style)
                    caps_sensitive.append(k)

    # === Cleanup and merge ===
    single_letter_chunks = sorted(compress_single_letter_keys(caps_sensitive))
    multi_letter_keys = sorted([f"[{k}]" for k in caps_sensitive if not re.fullmatch(r"K_[A-Z0-9]", k)])

    combined = single_letter_chunks + multi_letter_keys
    return combined


def determine_casedkeys_entry(caps_sensitive_keys):
    if not caps_sensitive_keys:
        return ""
    return "store(&CasedKeys) " + " ".join(caps_sensitive_keys)

def process_kmn_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    outputs = parse_outputs(lines)
    caps_sensitive_keys = scan_caps_sensitive_keys(outputs)
    
    # Remove "NCAPS " and lines containing "[CAPS"
    # Truthy check: empty list is falsy and None is falsy, so this filters
    # both "no caps-sensitive keys found" and "scan failed / not called yet".
    # Previous form used `is not []`, which is identity comparison against
    # a FRESH empty list every evaluation - always True, so the NCAPS-strip
    # block fired even when no CAPS distinctions existed, silently changing
    # `[NCAPS K_X]` -> `[K_X]` without inserting compensating `store(&CasedKeys)`.
    # See issue #113.
    if caps_sensitive_keys:
        lines = [line.replace("NCAPS ","") for line in lines if "[CAPS" not in line]

        store_exists = any("store(&CasedKeys)" in line for line in lines)

        # Find &KEYBOARDVERSION line index
        version_index = next((i for i, line in enumerate(lines) if "&KEYBOARDVERSION" in line), None)
        if version_index is None:
            print(f"Skipped (no &KEYBOARDVERSION): {filepath}")
            return

        if not store_exists:
            store_line = determine_casedkeys_entry(caps_sensitive_keys)
            if store_line != "":
                lines.insert(version_index + 1, store_line + '\n')
            else:
                print(f"Skipped (no CAPS keys): {filepath}")

        with open(filepath, 'w', encoding='utf-8') as f:
            f.writelines(lines)
    else:
        print(f"Skipped (cannot compress further): {filepath}")

def walk_and_process(root):
    for dirpath, _, filenames in os.walk(root):
        for filename in filenames:
            if filename.lower().endswith(".kmn"):
                process_kmn_file(os.path.join(dirpath, filename))

# Run the script
walk_and_process(ROOT_DIR)

"""
Summary of Changes Made by This Script:

1. Removes all instances of the string "NCAPS " from each .kmn file.
2. Deletes any line that contains the substring "[CAPS".
3. Scans key outputs to find which base keys are affected by CAPS:
   - If [CAPS K_x] == [SHIFT K_x] and differs from [K_x], that key is added to &CasedKeys.
   - If [K_x] == [CAPS K_x], it's not added.
   - If all three differ, a warning is shown.
4. Determines what character is output by the key [K_Q] and infers layout type.
5. Constructs an appropriate store(&CasedKeys) line including all CAPS-affected keys.
6. Inserts the store only if no existing store(&CasedKeys) is found.
7. Inserts the line after &KEYBOARDVERSION.
8. Files are saved in-place.
"""
