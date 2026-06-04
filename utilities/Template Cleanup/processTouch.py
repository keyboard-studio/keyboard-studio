import json
import os
import sys
import copy

# Accept the corpus root as the first CLI argument so the script doesn't have to
# be edited to point at a different keymanapp/keyboards checkout (see #114).
# Matches the pattern processKMN.py and previewSymbolKey.py already use.
root_folder = sys.argv[1] if len(sys.argv) > 1 else "D:\\Github\\_Projects\\_KM\\keyboards\\release\\basic"
addSymbols = True  # Set to False if you don't want to add symbols layer
removePhone = True  # Set to True if you want to remove the phone layout
test = False

def process_modifier_key(lid, key, type):
    """Mutate `key` in-place to canonical modifier-key form.

    Returns (key, changed) where `changed` is True if any mutation occurred.
    The outer loop uses `changed` to decide whether to write the touch-layout
    JSON back to disk; the previous `modified = True` local inside this
    function never propagated to the outer scope (issue #112).
    """
    changed = False
    if key.get("id") in ["K_LCONTROL", "K_RCONTROL", "K_CONTROL","K_ALT", "K_RALT", "K_LALT"] and key.get("sp") != '9':
        if type == "subkey":
            print(f"Processing subkey {key.get('id')} in layer {lid}")
        elif type == "multitap":
            print(f"Processing multitap {key.get('id')} in layer {lid}")
        id = key.get("id")
        sp = key.get("sp",0)
        next_layer = key.get("nextlayer", "")
        text = key.get("text", "").lower()
        if text == "ctrl":
            key["text"] = "*Ctrl*"
            if "ctrl-shift" in layers:
                key["nextlayer"] = "ctrl-shift"
                changed = True
            else:
                key["nextlayer"] = "ctrl"
            if "crtl" in lid or "control" in lid:
                key["sp"] = 2
                changed = True
            print(f"{id} in {lid} layer")
        elif text in ["*alt*", "ralt", "rightalt"]:
            print(f"{id} in {lid} layer")
            if "rightalt" in lid or "ralt" in lid:
                if lid == "rightalt":
                    key["id"] = "K_RALT"
                    key["nextlayer"] = "default"
                    key["sp"] = 2
                    key["text"] = "*RAlt*"
                elif lid in ["rightalt-shift", "shift-ralt"]:
                    key["id"] = "K_RALT"
                    key["nextlayer"] = "shift"
                    key["sp"] = 2
                    key["text"] = "*RAlt*"
                elif lid == "rightalt-caps":
                    key["id"] = "K_RALT"
                    key["nextlayer"] = "caps"
                    key["sp"] = 2
                    key["text"] = "*RAlt*"
                changed = True
            else:
                key["id"] = "K_RALT"
                key["text"] = "*RAlt*"
                if lid == "shift":
                    if "rightalt-shift" in layers:
                        key["nextlayer"] = "rightalt-shift"
                        changed = True
                    else:
                        key["nextlayer"] = "rightalt"
                elif lid == "default":
                    # nothing to do
                    print(f"{id} in {lid} layer")
                elif lid == "caps":
                    if "rightalt-caps" in layers:
                        key["nextlayer"] = "rightalt-caps"
                    else:
                        key["nextlayer"] = "rightalt"
                else:
                    print(f"{id} in {lid} layer")

        elif text == "default":
            if "rightalt" in lid or "ralt" in lid:
                key["id"] = "K_RALT"
                key["sp"] = 2
                key["text"] = "*RAlt*"
            elif "ctrl" in lid or "control" in lid:
                #key["id"] = "K_RALT"
                key["sp"] = 2
                key["text"] = "*Ctrl*"
            elif lid == "shift":
                key["id"] = "K_RALT"
                key["text"] = "*RAlt*"
                if "rightalt-shift" in layers:
                    key["nextlayer"] = "rightalt-shift"
                else:
                    key["nextlayer"] = "rightalt"
            elif lid == "caps":
                key["id"] = "K_RALT"
                key["text"] = "*RAlt*"
                if "rightalt-caps" in layers:
                    key["nextlayer"] = "rightalt-caps"
                else:
                    key["nextlayer"] = "rightalt"
            else:

                print(f"{id} in {lid} layer")
        elif text in ["s-alt", "s alt", "shift alt", "shift-ralt"]:

            if "rightalt" in lid or "ralt" in lid:
                key["id"] = "K_RALT"
                key["text"] = "*RAlt*"
                key["sp"] = 2
                key["nextlayer"] = "default"
            else:
                key["id"] = "K_RALT"
                key["text"] = "*RAlt*"
                print(f"{id} in {lid} layer")
        elif text in ["*123*"]:
            print(f"{id} in {lid} layer")
        else:
            print(f"{id} in {lid} layer")
            # Stashed alternative: multitap-on-shift for caps transition.
            # Kept as a real comment rather than a triple-quoted no-op string
            # (the previous form is a string literal Python evaluates and
            # discards — confusing to readers).
            # Reference shape:
            #   key["multitap"] = [{
            #       "id": "T_CAPS",
            #       "text": "*ShiftLock*",
            #       "nextlayer": target_caps,
            #   }]

        changed = True
    return key, changed

# --- K_SYMBOLS placement algorithm ---
# Picks one (row, column, width, mode) per keyboard that works across all
# non-symbol layers, so layer switches don't move keys around. Strategy 1
# shrinks the spacebar (taking row-slack into account); Strategy 2 replaces
# a trailing filler key on a row that has slack vs the layer's widest row.
KEY_PAD = 15  # Keyman per-key gutter that counts toward effective row width
DEFAULT_KEY_WIDTH = 100
MIN_SPACE_WIDTH = 500
MIN_USABLE_SYM_WIDTH = 80


def _key_w(k):
    w = k.get("width", DEFAULT_KEY_WIDTH)
    try:
        return int(w) if str(w).strip() != "" else DEFAULT_KEY_WIDTH
    except (TypeError, ValueError):
        return DEFAULT_KEY_WIDTH


def _row_effective_total(row):
    ks = row.get("key", [])
    return sum(_key_w(k) for k in ks) + KEY_PAD * len(ks)


def _layer_row_totals(layer):
    return [_row_effective_total(r) for r in layer.get("row", [])]


def _is_filler_key(k):
    if k.get("sp") == 10:
        return True
    if _key_w(k) <= 20:
        return True
    kid = str(k.get("id", ""))
    if kid.startswith("T_new_") and _key_w(k) <= 50:
        return True
    return False


def _try_shrink_space_plan(non_symbol_layers, ri):
    space_positions = []
    for l in non_symbol_layers:
        keys = l["row"][ri].get("key", [])
        pos = next((i for i, k in enumerate(keys) if k.get("id") == "K_SPACE"), -1)
        space_positions.append(pos)
    if any(p < 0 for p in space_positions) or len(set(space_positions)) != 1:
        return None
    space_idx = space_positions[0]

    lopt_positions = []
    for l in non_symbol_layers:
        keys = l["row"][ri].get("key", [])
        pos = next((i for i, k in enumerate(keys) if k.get("id") == "K_LOPT"), -1)
        lopt_positions.append(pos)
    if all(p >= 0 for p in lopt_positions) and len(set(lopt_positions)) == 1:
        insert_col = lopt_positions[0] + 1
        target_w = min(_key_w(l["row"][ri]["key"][lopt_positions[0]]) for l in non_symbol_layers)
    else:
        insert_col = space_idx
        target_w = DEFAULT_KEY_WIDTH

    sym_effective_w = target_w + KEY_PAD
    slacks = []
    for l in non_symbol_layers:
        totals = _layer_row_totals(l)
        slacks.append((max(totals) - totals[ri]) if totals else 0)
    min_slack = min(slacks) if slacks else 0
    space_shrink = max(0, sym_effective_w - min_slack)

    for l in non_symbol_layers:
        sp_w = _key_w(l["row"][ri]["key"][space_idx])
        if sp_w - space_shrink < MIN_SPACE_WIDTH:
            return None

    return {
        "mode": "shrink_space",
        "row_idx": ri,
        "insert_col": insert_col,
        "space_idx": space_idx,
        "sym_width": target_w,
        "space_shrink": space_shrink,
    }


def _try_replace_filler_plan(non_symbol_layers, ri):
    keys_per = [l["row"][ri].get("key", []) for l in non_symbol_layers]
    if not all(keys_per) or len(set(len(ks) for ks in keys_per)) != 1:
        return None
    last_keys = [ks[-1] for ks in keys_per]
    if not all(_is_filler_key(k) for k in last_keys):
        return None
    slacks = []
    for l in non_symbol_layers:
        totals = _layer_row_totals(l)
        slacks.append(max(totals) - totals[ri])
    min_slack = min(slacks)
    filler_min_w = min(_key_w(k) for k in last_keys)
    sym_w = filler_min_w + min_slack
    if sym_w < MIN_USABLE_SYM_WIDTH:
        return None
    return {
        "mode": "replace_filler",
        "row_idx": ri,
        "col_idx": len(keys_per[0]) - 1,
        "sym_width": sym_w,
    }


def _find_symbol_plan(non_symbol_layers):
    if not non_symbol_layers:
        return None
    if any(
        k.get("id") == "K_SYMBOLS"
        for l in non_symbol_layers
        for r in l.get("row", [])
        for k in r.get("key", [])
    ):
        return {"mode": "already_present"}
    n_rows = min(len(l.get("row", [])) for l in non_symbol_layers)
    for ri in range(n_rows):
        plan = _try_shrink_space_plan(non_symbol_layers, ri)
        if plan:
            return plan
    for ri in range(n_rows):
        plan = _try_replace_filler_plan(non_symbol_layers, ri)
        if plan:
            return plan
    return {"mode": "no_fit"}


def _apply_symbol_plan(non_symbol_layers, plan):
    if not plan or plan.get("mode") in ("already_present", "no_fit", None):
        return 0
    n = 0
    ri = plan["row_idx"]
    for l in non_symbol_layers:
        lid = l.get("id", "")
        nextlayer = "symbol-caps" if "caps" in lid else "symbol"
        keys = l["row"][ri]["key"]
        sym_key = {
            "id": "K_SYMBOLS",
            "text": "*Symbol*",
            "sp": 1,
            "width": plan["sym_width"],
            "nextlayer": nextlayer,
        }
        if plan["mode"] == "shrink_space":
            si = plan["space_idx"]
            keys[si]["width"] = _key_w(keys[si]) - plan["space_shrink"]
            keys.insert(plan["insert_col"], sym_key)
        elif plan["mode"] == "replace_filler":
            keys[plan["col_idx"]] = sym_key
        n += 1
    return n


# Load symbols layer data from files (paths relative to this script, not CWD)
_HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(_HERE, "symbols.json"), "r", encoding="utf-8") as f:
    symbols_layer = json.load(f)
with open(os.path.join(_HERE, "symbol-caps.json"), "r", encoding="utf-8") as f:
    symbol_caps_layer = json.load(f)

# Walk through all subdirectories and process matching files
for dirpath, _, filenames in os.walk(root_folder):
    for filename in filenames:
        if filename.endswith(".keyman-touch-layout"):

            full_path = os.path.join(dirpath, filename)

            # --- Scan for .kmn file and @casedKeys ---
            kmn_file = None
            for f in filenames:
                if f.lower().endswith(".kmn"):
                    kmn_file = os.path.join(dirpath, f)
                    break

            has_cased_keys = False
            if kmn_file:
                try:
                    with open(kmn_file, "r", encoding="utf-8") as kf:
                        for line in kf:
                            if "&CasedKeys" in line:
                                has_cased_keys = True
                                break
                except Exception as e:
                    print(f"Error reading {kmn_file}: {e}")

            if not has_cased_keys:
                print(f"[INFO] No @casedKeys in .kmn for {full_path} - will add 'symbol' only")

            try:
                with open(full_path, "r", encoding="utf-8") as f:
                    data = json.load(f)

                modified = False

                if has_cased_keys:
                    # Remove the phone layout if present
                    if "phone" in data and "tablet" in data and removePhone:
                        del data["phone"]
                        modified = True
                        print(f'Removed "phone" section from {full_path}')

                    # Duplicate shift -> CAPS, ralt-shift -> ralt-caps
                    for device in ["tablet", "phone"]:  # We already removed "phone"
                        if device in data and "layer" in data[device]:
                            layers = data[device]["layer"]
                            layer_map = {layer["id"]: layer for layer in layers if "id" in layer}

                            if "shift" in layer_map and "caps" not in layer_map:
                                caps_layer = copy.deepcopy(layer_map["shift"])
                                caps_layer["id"] = "caps"
                                layers.append(caps_layer)
                                modified = True
                                print(f'Duplicated "shift" as "caps" in {full_path}')

                            if "rightalt-shift" in layer_map and "rightalt-caps" not in layer_map:
                                ralt_caps_layer = copy.deepcopy(layer_map["rightalt-shift"])
                                ralt_caps_layer["id"] = "rightalt-caps"
                                layers.append(ralt_caps_layer)
                                modified = True
                                print(f'Duplicated "rightalt-shift" as "rightalt-caps" in {full_path}')

                            if "ctrl-shift" in layer_map and "ctrl-caps" not in layer_map:
                                ctrl_caps_layer = copy.deepcopy(layer_map["ctrl-shift"])
                                ctrl_caps_layer["id"] = "ctrl-caps"
                                layers.append(ctrl_caps_layer)
                                modified = True
                                print(f'Duplicated "ctrl-shift" as "ctrl-caps" in {full_path}')

                            # Set nextlayer to default for non-modifier keys
                            for layer in layers:
                                lid = layer.get("id", "")
                                if lid != "default" and "caps" not in lid.lower():
                                    for row in layer.get("row", []):
                                        for key in row.get("key", []):
                                            # Skip non-tappable key types per keyman-touch-layout schema:
                                            #   1 = modifier / frame key
                                            #   2 = selected modifier key
                                            #   8 = deadkey (highlighted differently)
                                            #   9 = blank key (no key cap)
                                            #  10 = spacer (occupies width but isn't a key)
                                            # The previous skip list `[1, 2, 8]` with comment
                                            # "8: blank" was wrong on both fronts: 8 is deadkey, and
                                            # blanks/spacers (sp=9, sp=10) were inappropriately
                                            # getting nextlayer="default" added. See #111.
                                            if key.get("sp") not in [1, 2, 8, 9, 10]:
                                                if key.get("nextlayer") is None: # != "default":
                                                    key["nextlayer"] = "default"
                                                    modified = True
                                          # Use multitap on K_SHIFT for caps transition
                            for layer in layers:
                                lid = layer.get("id", "")
                                for row in layer.get("row", []):
                                    for key in row.get("key", []):
                                        key, m = process_modifier_key(lid, key, "key")
                                        if m:
                                            modified = True
                                        if key is not None and key.get("sk") is not None:
                                            for sk in key.get("sk", None):
                                                sk, m = process_modifier_key(lid, sk, "subkey")
                                                if m:
                                                    modified = True
                                        # The canonical keyman-touch-layout field is `multitap`,
                                        # NOT `mt`. The previous guard `key.get("mt")` always
                                        # returned None, so this block never executed — modifier
                                        # keys inside multitap arrays were silently skipped.
                                        # See #110.
                                        if key is not None and key.get("multitap") is not None:
                                            for mt in key.get("multitap"):
                                                mt, m = process_modifier_key(lid, mt, "multitap")
                                                if m:
                                                    modified = True

                            # Use multitap on K_SHIFT for caps transition
                            for layer in layers:
                                lid = layer.get("id", "")
                                if "shift" not in lid.lower() and "caps" not in lid.lower():
                                    target_caps = "ralt-caps" if "ralt" in lid else "caps"
                                    for row in layer.get("row", []):
                                        for key in row.get("key", []):
                                            if key.get("id") == "K_SHIFT":
                                                key["multitap"] = [{
                                                    "id": "T_CAPS",
                                                    "text": "*ShiftLock*",
                                                    "nextlayer": target_caps
                                                }]
                                                modified = True

                            # Set K_SHIFT text and nextlayer in shifted and caps layers
                            for layer in layers:
                                lid = layer.get("id", "")
                                if "shift" in lid.lower():
                                    unshifted = lid.replace("-shift", "").replace("shift", "default")
                                    for row in layer.get("row", []):
                                        for key in row.get("key", []):
                                            if key.get("id") == "K_SHIFT":
                                                key["text"] = "*Shifted*"
                                                key["nextlayer"] = unshifted
                                                modified = True
                                elif "caps" in lid.lower():
                                    unshifted = lid.replace("ralt-caps", "ralt").replace("caps", "default")
                                    for row in layer.get("row", []):
                                        for key in row.get("key", []):
                                            if key.get("id") == "K_SHIFT":
                                                key["text"] = "*ShiftedLock*"
                                                key["nextlayer"] = unshifted
                                                modified = True

                # Always-on: append symbol / symbol-caps layers per the rules
                # - 'symbol' layer is added to every touch layout (when missing)
                # - 'symbol-caps' layer is added only when the .kmn has &CasedKeys
                if addSymbols:
                    for device in ["tablet", "phone"]:
                        if device in data and "layer" in data[device]:
                            layers = data[device]["layer"]
                            if not any(l.get("id") == symbols_layer.get("id") for l in layers):
                                layers.append(copy.deepcopy(symbols_layer))
                                modified = True
                                print(f'Appended "{symbols_layer.get("id")}" layer to {full_path}')
                            if has_cased_keys and not any(l.get("id") == symbol_caps_layer.get("id") for l in layers):
                                layers.append(copy.deepcopy(symbol_caps_layer))
                                modified = True
                                print(f'Appended "{symbol_caps_layer.get("id")}" layer to {full_path}')

                # Insert K_SYMBOLS link keys onto every non-symbol layer.
                # Picks one consistent (row, column) across all non-symbol layers
                # so keys do not move when switching layers.
                if addSymbols:
                    for device in ["tablet", "phone"]:
                        if device in data and "layer" in data[device]:
                            layers = data[device]["layer"]
                            non_symbol = [l for l in layers if l.get("id") not in ("symbol", "symbol-caps")]
                            plan = _find_symbol_plan(non_symbol)
                            if plan is None:
                                continue
                            mode = plan.get("mode")
                            if mode == "already_present":
                                continue
                            if mode == "no_fit":
                                print(f'[SKIP] K_SYMBOLS placement (no fit) for {device} of {full_path}')
                                continue
                            count = _apply_symbol_plan(non_symbol, plan)
                            if count:
                                modified = True
                                if mode == "shrink_space":
                                    print(
                                        f'Inserted K_SYMBOLS into {count} {device} layers of {full_path} '
                                        f'(row {plan["row_idx"]} col {plan["insert_col"]} w={plan["sym_width"]} '
                                        f'space_shrink={plan["space_shrink"]})'
                                    )
                                else:
                                    print(
                                        f'Replaced trailing filler with K_SYMBOLS in {count} {device} layers of {full_path} '
                                        f'(row {plan["row_idx"]} col {plan["col_idx"]} w={plan["sym_width"]})'
                                    )

                if modified and not test:
                    with open(full_path, "w", encoding="utf-8") as f:
                        json.dump(data, f, indent=2, ensure_ascii=False)

            except Exception as e:
                print(f"Error processing {full_path}: {e}")
