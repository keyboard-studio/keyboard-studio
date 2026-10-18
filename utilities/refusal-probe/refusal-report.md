# Spec 104 T026 — severance refusal-rate probe

Generated: 2026-10-18T03:30:32.806Z
Corpus roots: /home/hatch/workspace/keyboards/release

## Coverage (read this first)

Keyboards found: 15; probed (kmn + touch layout parsed): 13; no touch layout: 2; parse errors: 0.
This run covers ONLY the keyboards present in the roots above. The full
keymanapp/keyboards corpus (962 touch layouts in the spec 104 research
census) is not checked out on this machine — the local checkout is a
partial one — so these rates size the Track 2 UX for the keyboards at
hand and MUST be re-run against a full corpus checkout before they are
treated as corpus-wide.

## Headline

- K_-linked touch keys attempted: 745
- Transplants completed: 613 (82.3%)
- Transplants refused (default policy): 132 (17.7%)
- Emulation-class keys among the refusals (K_BKSP/K_ENTER/K_LOPT — refused by design, never severance candidates): 45
- Refusal rate over genuine severance candidates (700 keys): 87 refused (12.4%)
- Of the candidate refusals, completed once opaque fragments were acknowledged: 87

## Refusal causes (binding, behind the opaque gate where it applied)

- opaque-fragments (passes once acknowledged): 87
- emulation: 45

## Per keyboard

| keyboard | linked keys | completed | refused | refusal rate |
| --- | ---: | ---: | ---: | ---: |
| akan | 53 | 50 | 3 | 5.7% |
| arabic_izza | 98 | 92 | 6 | 6.1% |
| bambara | 50 | 47 | 3 | 6.0% |
| basic_kbdfr | 56 | 53 | 3 | 5.4% |
| basic_kbdgr | 55 | 52 | 3 | 5.5% |
| basic_kbduk | 55 | 52 | 3 | 5.5% |
| basic_kbdus | 54 | 51 | 3 | 5.6% |
| basic_kbdusx | 55 | 52 | 3 | 5.5% |
| nias | 100 | 94 | 6 | 6.0% |
| sil_cameroon_azerty | 33 | 30 | 3 | 9.1% |
| sil_cameroon_qwerty | 43 | 40 | 3 | 7.0% |
| sil_euro_latin | 46 | 0 | 46 | 100.0% |
| sil_ipa | 47 | 0 | 47 | 100.0% |

Full per-key detail (including the verbatim refusalBinding text) is in
refusal-report.json beside this file.
