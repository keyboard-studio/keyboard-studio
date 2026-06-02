import json
import os
import copy

# Set your root folder path here
root_folder = "D:\\Github\\_Projects\\_KM\\keyboards\\release\\basic"  # Change to your desired root path
currentLanguage = ""
addSymbols = True  # Set to False if you don't want to add symbols layer
removePhone = True  # Set to True if you want to remove the phone layout
test = False

def process_modifier_key(lid, key, type):

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
                modified = True
            else:
                key["nextlayer"] = "ctrl"
            if "crtl" in lid or "control" in lid:
                key["sp"] = 2
                modified = True
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
                modified = True
            else:
                key["id"] = "K_RALT"
                key["text"] = "*RAlt*"
                if lid == "shift":
                    if "rightalt-shift" in layers:
                        key["nextlayer"] = "rightalt-shift"
                        modified = True
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
            """ key["multitap"] = [{
                "id": "T_CAPS",
                "text": "*ShiftLock*",
                "nextlayer": target_caps
            }] """

        modified = True
    return key

# Load symbols layer data from files
with open("symbols.json", "r", encoding="utf-8") as f:
    symbols_layer = json.load(f)
with open("symbol-caps.json", "r", encoding="utf-8") as f:
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
                                            if key.get("sp") not in [1, 2, 8]:  # 1: special, 2: shift, 8: blank
                                                if key.get("nextlayer") is None: # != "default":
                                                    key["nextlayer"] = "default"
                                                    modified = True
                                          # Use multitap on K_SHIFT for caps transition
                            for layer in layers:
                                lid = layer.get("id", "")
                                for row in layer.get("row", []):
                                    for key in row.get("key", []):
                                        key = process_modifier_key(lid, key, "key")
                                        if key is not None and key.get("sk") is not None:
                                            for sk in key.get("sk", None):
                                                sk = process_modifier_key(lid, sk, "subkey")
                                        if key is not None and key.get("mt") is not None:
                                            for mt in key.get("multitap", None):
                                                mt = process_modifier_key(lid, mt, "multitap")

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

                if modified and not test:
                    with open(full_path, "w", encoding="utf-8") as f:
                        json.dump(data, f, indent=2, ensure_ascii=False)

            except Exception as e:
                print(f"Error processing {full_path}: {e}")
