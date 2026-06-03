# Files the kbgen integration issues on MattGyverLee/keyboard-studio.
# Prereq: `gh auth login`  (or set $env:GH_TOKEN).  Run once; it is NOT idempotent.
# Creates labels if missing, files E1 + #2..#6, then links blockers in issue bodies.
$ErrorActionPreference = 'Stop'
$repo = 'MattGyverLee/keyboard-studio'

# Ensure labels exist (ignore "already exists" errors).
foreach ($l in @(
  @{n='epic';     c='5319e7'; d='Umbrella tracking issue'},
  @{n='process';  c='c2e0c6'; d='Process / coordination'},
  @{n='feat';     c='1d76db'; d='New functionality'},
  @{n='chore';    c='fef2c0'; d='Housekeeping, no behaviour change'},
  @{n='tools';    c='bfdadc'; d='Area: tooling / utilities'},
  @{n='engine';   c='bfdadc'; d='Area: engine'},
  @{n='contracts';c='bfdadc'; d='Area: packages/contracts'}
)) { try { gh label create $l.n --color $l.c --description $l.d --repo $repo 2>$null } catch {} }

function New-Issue($title, $bodyFile, $labels) {
  $url = gh issue create --repo $repo --title $title --label $labels --body-file $bodyFile
  ($url -split '/')[-1]   # return the new issue number
}

# Bodies are read from the matching sections of ISSUES.md by hand, or paste inline below.
# Simplest path: create from ISSUES.md sections. Here we file with short bodies pointing at the doc.
$doc = 'See utilities/kbgen/ISSUES.md and utilities/kbgen/INTEGRATION.md for full detail.'

$e1 = gh issue create --repo $repo --label epic `
  --title 'epic(kbgen): integrate the placement seeder into the engine pipeline' `
  --body "Umbrella for promoting utilities/kbgen into a contract-conforming engine deliverable. $doc"
$e1n = ($e1 -split '/')[-1]

$i2 = gh issue create --repo $repo --label process `
  --title 'process(kbgen): joint engine+content session to settle placement contract + scope' `
  --body "BLOCKING GATE. Settle (1) placement contract type in packages/contracts, (2) strategy scope, (3) ownership of data/supplement.json, before port/wiring. Tracked by #$e1n. $doc"
$i2n = ($i2 -split '/')[-1]

$i3 = gh issue create --repo $repo --label chore,tools `
  --title 'chore(tools): port kbgen to ESM TypeScript and wire it into the workspace' `
  --body "Port CommonJS->ESM TS, add tsconfig/build/typecheck, migrate test to vitest. Blocked by #$i2n for the emitted type. Tracked by #$e1n. $doc"
$i3n = ($i3 -split '/')[-1]

$i4 = gh issue create --repo $repo --label feat,contracts `
  --title 'feat(contracts): add the placement-map type settled in joint session' `
  --body "Implement the placement type decided in #$i2n (extend Pattern or add PlacementMap) with fixtures + vitest specs. Blocked by #$i2n. Tracked by #$e1n. $doc"
$i4n = ($i4 -split '/')[-1]

$i5 = gh issue create --repo $repo --label feat,engine `
  --title 'feat(engine): consume kbgen output as Phase B placement defaults' `
  --body "Wire the seeder into survey Phase B (spec section 8): pre-fill data-driven placements for user confirmation, tagged with strategyId. Blocked by #$i3n and #$i4n. Tracked by #$e1n. $doc"
$i5n = ($i5 -split '/')[-1]

$i6 = gh issue create --repo $repo --label feat,tools `
  --title 'feat(tools): expand kbgen strategy coverage beyond S-01/S-08' `
  --body "Post-v1 / scope-gated by #$i2n. Add emitters for additional strategies (S-02/S-05/S-07/S-09) if the joint session decides the seeder should cover more of the decision tree. Tracked by #$e1n. $doc"
$i6n = ($i6 -split '/')[-1]

Write-Host "[OK] Filed: epic #$e1n; gate #$i2n; work #$i3n #$i4n #$i5n #$i6n"
Write-Host "[NOTE] Add the children as a task list to epic #$e1n in the GitHub UI (gh has no native sub-issue link)."
