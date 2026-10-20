# #2302 Playwright-CLI walk — results

Driver: playwright-cli (named session per case) + run-code phase snippets; dev server from ks-2302-walk @ d273b398 (PR #2303 build). Status counts: BLOCKED 18 · NOT-ATTEMPTED 12 · PASS 2 of 32.

| Case | Profile | Backspace | Base | Status | Furthest | Evidence |
|---|---|---|---|---|---|---|
| p1-whole-bafut-camqwerty | P1 (postfix/NFD) | whole (off-diag) | sil_cameroon_qwerty | BLOCKED | phase1-failed:start | [evidence/p1-whole-bafut-camqwerty.case-result.json](evidence/p1-whole-bafut-camqwerty.case-result.json) |
| p1-unwrap-bafut-camqwerty | P1 (postfix/NFD) | unwrap | sil_cameroon_qwerty | BLOCKED | open | [evidence/p1-unwrap-bafut-camqwerty.case-result.json](evidence/p1-unwrap-bafut-camqwerty.case-result.json) |
| p2-whole-bafut-camqwerty | P2 (prefix/NFC) | whole | sil_cameroon_qwerty | BLOCKED | mechanisms-stuck-at-? | [evidence/p2-whole-bafut-camqwerty.case-result.json](evidence/p2-whole-bafut-camqwerty.case-result.json) |
| p2-unwrap-bafut-camqwerty | P2 (prefix/NFC) | unwrap (off-diag) | sil_cameroon_qwerty | BLOCKED | mechanisms-open | [evidence/p2-unwrap-bafut-camqwerty.case-result.json](evidence/p2-unwrap-bafut-camqwerty.case-result.json) |
| p3-whole-bafut-camqwerty | P3 (postfix/NFC) | whole | sil_cameroon_qwerty | BLOCKED | phase1-failed:start | [evidence/p3-whole-bafut-camqwerty.case-result.json](evidence/p3-whole-bafut-camqwerty.case-result.json) |
| p3-unwrap-bafut-camqwerty | P3 (postfix/NFC) | unwrap (off-diag) | sil_cameroon_qwerty | BLOCKED | phase1-failed:base-picker | [evidence/p3-unwrap-bafut-camqwerty.case-result.json](evidence/p3-unwrap-bafut-camqwerty.case-result.json) |
| p4-whole-bafut-camqwerty | P4 (prefix/NFD) | whole (off-diag) | sil_cameroon_qwerty | BLOCKED | phase1-failed:track-copy | [evidence/p4-whole-bafut-camqwerty.case-result.json](evidence/p4-whole-bafut-camqwerty.case-result.json) |
| p4-unwrap-bafut-camqwerty | P4 (prefix/NFD) | unwrap | sil_cameroon_qwerty | BLOCKED | phase1-failed:base-picker | [evidence/p4-unwrap-bafut-camqwerty.case-result.json](evidence/p4-unwrap-bafut-camqwerty.case-result.json) |
| p1-whole-ewondo-camazerty | P1 (postfix/NFD) | whole (off-diag) | sil_cameroon_azerty | BLOCKED | phase1-failed:pick-base | [evidence/p1-whole-ewondo-camazerty.case-result.json](evidence/p1-whole-ewondo-camazerty.case-result.json) |
| p1-unwrap-ewondo-camazerty | P1 (postfix/NFD) | unwrap | sil_cameroon_azerty | BLOCKED | phase1-failed:pick-base | [evidence/p1-unwrap-ewondo-camazerty.case-result.json](evidence/p1-unwrap-ewondo-camazerty.case-result.json) |
| p2-whole-ewondo-camazerty | P2 (prefix/NFC) | whole | sil_cameroon_azerty | BLOCKED | phase1-failed:pick-base | [evidence/p2-whole-ewondo-camazerty.case-result.json](evidence/p2-whole-ewondo-camazerty.case-result.json) |
| p2-unwrap-ewondo-camazerty | P2 (prefix/NFC) | unwrap (off-diag) | sil_cameroon_azerty | NOT-ATTEMPTED | not-attempted | — |
| p3-whole-ewondo-camazerty | P3 (postfix/NFC) | whole | sil_cameroon_azerty | NOT-ATTEMPTED | not-attempted | — |
| p3-unwrap-ewondo-camazerty | P3 (postfix/NFC) | unwrap (off-diag) | sil_cameroon_azerty | NOT-ATTEMPTED | not-attempted | — |
| p4-whole-ewondo-camazerty | P4 (prefix/NFD) | whole (off-diag) | sil_cameroon_azerty | BLOCKED | phase1-failed:pick-base | [evidence/p4-whole-ewondo-camazerty.case-result.json](evidence/p4-whole-ewondo-camazerty.case-result.json) |
| p4-unwrap-ewondo-camazerty | P4 (prefix/NFD) | unwrap | sil_cameroon_azerty | NOT-ATTEMPTED | not-attempted | — |
| p1-whole-bafut-kbdus | P1 (postfix/NFD) | whole (off-diag) | basic_kbdus | BLOCKED | phase1-failed:base-picker | [evidence/p1-whole-bafut-kbdus.case-result.json](evidence/p1-whole-bafut-kbdus.case-result.json) |
| p1-unwrap-bafut-kbdus | P1 (postfix/NFD) | unwrap | basic_kbdus | PASS | mechanisms-complete | [evidence/p1-unwrap-bafut-kbdus.case-result.json](evidence/p1-unwrap-bafut-kbdus.case-result.json) |
| p2-whole-bafut-kbdus | P2 (prefix/NFC) | whole | basic_kbdus | NOT-ATTEMPTED | not-attempted | — |
| p2-unwrap-bafut-kbdus | P2 (prefix/NFC) | unwrap (off-diag) | basic_kbdus | NOT-ATTEMPTED | not-attempted | — |
| p3-whole-bafut-kbdus | P3 (postfix/NFC) | whole | basic_kbdus | NOT-ATTEMPTED | not-attempted | — |
| p3-unwrap-bafut-kbdus | P3 (postfix/NFC) | unwrap (off-diag) | basic_kbdus | BLOCKED | phase1-failed:track-copy | [evidence/p3-unwrap-bafut-kbdus.case-result.json](evidence/p3-unwrap-bafut-kbdus.case-result.json) |
| p4-whole-bafut-kbdus | P4 (prefix/NFD) | whole (off-diag) | basic_kbdus | NOT-ATTEMPTED | not-attempted | — |
| p4-unwrap-bafut-kbdus | P4 (prefix/NFD) | unwrap | basic_kbdus | PASS | mechanisms-complete | [evidence/p4-unwrap-bafut-kbdus.case-result.json](evidence/p4-unwrap-bafut-kbdus.case-result.json) |
| p1-whole-ewondo-kbdfr | P1 (postfix/NFD) | whole (off-diag) | basic_kbdfr | BLOCKED | open | [evidence/p1-whole-ewondo-kbdfr.case-result.json](evidence/p1-whole-ewondo-kbdfr.case-result.json) |
| p1-unwrap-ewondo-kbdfr | P1 (postfix/NFD) | unwrap | basic_kbdfr | BLOCKED | mechanisms-stuck-at-? | [evidence/p1-unwrap-ewondo-kbdfr.case-result.json](evidence/p1-unwrap-ewondo-kbdfr.case-result.json) |
| p2-whole-ewondo-kbdfr | P2 (prefix/NFC) | whole | basic_kbdfr | NOT-ATTEMPTED | not-attempted | — |
| p2-unwrap-ewondo-kbdfr | P2 (prefix/NFC) | unwrap (off-diag) | basic_kbdfr | BLOCKED | rules | [evidence/p2-unwrap-ewondo-kbdfr.case-result.json](evidence/p2-unwrap-ewondo-kbdfr.case-result.json) |
| p3-whole-ewondo-kbdfr | P3 (postfix/NFC) | whole | basic_kbdfr | BLOCKED | mechanisms-stuck-at-? | [evidence/p3-whole-ewondo-kbdfr.case-result.json](evidence/p3-whole-ewondo-kbdfr.case-result.json) |
| p3-unwrap-ewondo-kbdfr | P3 (postfix/NFC) | unwrap (off-diag) | basic_kbdfr | NOT-ATTEMPTED | not-attempted | — |
| p4-whole-ewondo-kbdfr | P4 (prefix/NFD) | whole (off-diag) | basic_kbdfr | NOT-ATTEMPTED | not-attempted | — |
| p4-unwrap-ewondo-kbdfr | P4 (prefix/NFD) | unwrap | basic_kbdfr | NOT-ATTEMPTED | not-attempted | — |

Per-case detail lives in `results.json` and each case's `evidence/<id>/case-result.json` (phase JSON + CLI snapshots + logs).
