# Provenance

`basic_kbdfr.kmn` is a byte-exact copy of `release/basic/basic_kbdfr/source/basic_kbdfr.kmn` in the
`keyboard-studio/keyboards` fork at `433ac1e16`, the parent of `029d5f67e` ("Basic Keyboard
Rewrites"): the version before the owner's Template Cleanup `processKMN.py` added `&CasedKeys`.

AZERTY: Caps types the number row's digits, which is its Shift output, so the number row belongs in
`&CasedKeys` though `&`/`1` is no case pair. Used by spec 111 (cased-keys upgrade on AZERTY).
