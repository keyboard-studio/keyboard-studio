"""
Dry-run: decide where K_SYMBOLS would go on each .keyman-touch-layout under
release/basic, applying the SAME (row, column, width, mode) across every
non-symbol layer of that keyboard. No files are written.

Algorithm:
  Strategy 1 - shrink_space:
    On the row that contains K_SPACE in ALL non-symbol layers (same column),
    insert K_SYMBOLS just after K_LOPT (else just before K_SPACE) with
    width = K_LOPT's width (else DEFAULT_KEY_WIDTH), shrinking K_SPACE.
    Skipped if K_SPACE would drop below MIN_SPACE_WIDTH.

  Strategy 2 - replace_filler:
    On a row that has slack relative to the layer's widest row AND whose
    last column is a filler in all non-symbol layers (sp=10, width<=20,
    or T_new_* with width<=50), replace that filler with K_SYMBOLS sized
    to (filler_width + min_slack). Skipped if the resulting width < 80.

If neither strategy is feasible the keyboard is reported as SKIP.
"""

import json
import os
import sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else r"D:\Github\_Projects\_KM\keyboards\release\basic"
DEFAULT_KEY_WIDTH = 100
KEY_PAD = 15  # Keyman renders each key with a 15-unit pad; counts toward row width
MIN_SPACE_WIDTH = 500
MIN_USABLE_SYM_WIDTH = 80
NON_SYMBOL_TAG = lambda lid: lid not in ("symbol", "symbol-caps")


def key_w(k):
    w = k.get("width", DEFAULT_KEY_WIDTH)
    try:
        return int(w) if str(w).strip() != "" else DEFAULT_KEY_WIDTH
    except (TypeError, ValueError):
        return DEFAULT_KEY_WIDTH


def row_effective_total(row):
    """Row's total rendered width: sum of key widths + KEY_PAD per key."""
    ks = row.get("key", [])
    return sum(key_w(k) for k in ks) + KEY_PAD * len(ks)


def is_filler(k):
    if k.get("sp") == 10:
        return True
    if key_w(k) <= 20:
        return True
    kid = str(k.get("id", ""))
    if kid.startswith("T_new_") and key_w(k) <= 50:
        return True
    return False


def row_totals(layer):
    return [row_effective_total(r) for r in layer.get("row", [])]


def try_shrink_space(layers, ri):
    space_positions = []
    for l in layers:
        keys = l["row"][ri].get("key", [])
        pos = next((i for i, k in enumerate(keys) if k.get("id") == "K_SPACE"), -1)
        space_positions.append(pos)
    if any(p < 0 for p in space_positions):
        return None
    if len(set(space_positions)) != 1:
        return None
    space_idx = space_positions[0]

    lopt_positions = []
    for l in layers:
        keys = l["row"][ri].get("key", [])
        pos = next((i for i, k in enumerate(keys) if k.get("id") == "K_LOPT"), -1)
        lopt_positions.append(pos)
    if all(p >= 0 for p in lopt_positions) and len(set(lopt_positions)) == 1:
        insert_col = lopt_positions[0] + 1
        target_w = min(key_w(l["row"][ri]["key"][lopt_positions[0]]) for l in layers)
    else:
        insert_col = space_idx
        target_w = DEFAULT_KEY_WIDTH

    # Slack-aware shrink: rows render to the widest row's effective width, so we can
    # grow row ri up to (max effective row total) before any spacebar shrink is needed.
    # Adding K_SYMBOLS contributes target_w + KEY_PAD to the row (the new key brings its
    # own pad). Take the minimum slack across all non-symbol layers.
    sym_effective_w = target_w + KEY_PAD
    slacks = []
    for l in layers:
        totals = row_totals(l)
        slacks.append((max(totals) - totals[ri]) if totals else 0)
    min_slack = min(slacks) if slacks else 0
    space_shrink = max(0, sym_effective_w - min_slack)

    for l in layers:
        sp_w = key_w(l["row"][ri]["key"][space_idx])
        if sp_w - space_shrink < MIN_SPACE_WIDTH:
            return None

    return {
        "mode": "shrink_space",
        "row_idx": ri,
        "insert_col": insert_col,
        "space_idx": space_idx,
        "sym_width": target_w,
        "sym_effective_w": sym_effective_w,
        "min_slack": min_slack,
        "space_shrink": space_shrink,
    }


def try_replace_filler(layers, ri):
    keys_per = [l["row"][ri].get("key", []) for l in layers]
    if not all(keys_per):
        return None
    if len(set(len(ks) for ks in keys_per)) != 1:
        return None
    last_keys = [ks[-1] for ks in keys_per]
    if not all(is_filler(k) for k in last_keys):
        return None

    slacks = []
    for l in layers:
        totals = row_totals(l)
        slacks.append(max(totals) - totals[ri])
    min_slack = min(slacks)

    # Replacing the filler doesn't add a key, so its pad is already counted.
    # The new key can occupy (filler_width + slack), but capped to a reasonable size.
    filler_min_w = min(key_w(k) for k in last_keys)
    sym_w = filler_min_w + min_slack
    if sym_w < MIN_USABLE_SYM_WIDTH:
        return None

    return {
        "mode": "replace_filler",
        "row_idx": ri,
        "col_idx": len(keys_per[0]) - 1,
        "sym_width": sym_w,
        "filler_width": filler_min_w,
        "min_slack": min_slack,
    }


def find_plan(non_symbol_layers):
    if not non_symbol_layers:
        return {"mode": "no_layers"}
    if any(
        k.get("id") == "K_SYMBOLS"
        for l in non_symbol_layers
        for r in l.get("row", [])
        for k in r.get("key", [])
    ):
        return {"mode": "already_present"}
    n_rows = min(len(l.get("row", [])) for l in non_symbol_layers)
    for ri in range(n_rows):
        plan = try_shrink_space(non_symbol_layers, ri)
        if plan:
            return plan
    for ri in range(n_rows):
        plan = try_replace_filler(non_symbol_layers, ri)
        if plan:
            return plan
    return {"mode": "no_fit"}


def summarise(path):
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    out = {}
    for device in ("tablet", "phone"):
        if device not in data or "layer" not in data[device]:
            continue
        layers = data[device]["layer"]
        non_symbol = [l for l in layers if NON_SYMBOL_TAG(l.get("id", ""))]
        plan = find_plan(non_symbol)
        out[device] = {
            "plan": plan,
            "non_symbol_layer_ids": [l.get("id") for l in non_symbol],
        }
    return out


tally = {}
samples_per_mode = {}
for dirpath, _, filenames in os.walk(ROOT):
    for fn in filenames:
        if not fn.endswith(".keyman-touch-layout"):
            continue
        full = os.path.join(dirpath, fn)
        try:
            summary = summarise(full)
        except Exception as e:
            print(f"[ERROR] {full}: {e}")
            continue
        for device, info in summary.items():
            mode = info["plan"].get("mode", "unknown")
            key = f"{device}:{mode}"
            tally[key] = tally.get(key, 0) + 1
            samples_per_mode.setdefault(key, []).append((full, info))

print("=== mode tally ===")
for k in sorted(tally):
    print(f"  {tally[k]:4d}  {k}")
print()
print("=== one sample per mode ===")
for key, items in sorted(samples_per_mode.items()):
    full, info = items[0]
    print(f"--- {key} ({len(items)} keyboards) ---")
    print(f"    file: {os.path.basename(full)}")
    print(f"    non_symbol_layer_ids: {info['non_symbol_layer_ids']}")
    print(f"    plan: {info['plan']}")
print()
print(f"=== files inspected ===")
print(sum(tally.values()))
