# Provenance

Files `basic_kbdus.kmn` and `basic_kbdus.keyman-touch-layout` are byte-exact copies of
`release/basic/basic_kbdus/source/` on `master` of https://github.com/keymanapp/keyboards
(fetched 2026-11-03 via `gh api .../contents/...?ref=master`).

- Latest upstream commit touching that path: `299e29a84d67720c15deae8eead87eca998d7559` (2023-10-18)
- Line endings: LF; `.kmn` starts with a UTF-8 BOM. `../.gitattributes` marks these `-text` so git never normalises them.

Differs from the fork copy (`keyboard-studio/keyboards`, `../keyboards`):
- NCAPS/CAPS rules on K_A..K_Z (four per letter)
- no `&CasedKeys` store
- `&VERSION 10.0`
- touch layout has no `caps` layer (default, shift, numeric, symbol, currency only)

Used by spec 112 (and spec 111 T045) as the "upstream, needs &CasedKeys upgrade" case.
