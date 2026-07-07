# Current Test Coverage Notes

Keep this file focused on current validation coverage. Do not use it as a migration history archive.

## Current Counts

- Bot self-test count: `344`.
- Strategy module self-test count: `118`.
- Combat-log analyzer self-test count: `88`.
- Combat replay self-test count: `1` local replay case plus skipped historical fixtures when retained logs are absent.
- Objective build verification count: `38`.

## Main Validation Surfaces

- `node grasp-rat-bot.js --self-test`: runs the Node self-test suite and delegates strategy module tests through `src/node/run-self-test.js`.
- `node scripts/objective-status.js --self-test`: verifies objective-status reporting behavior.
- `cd combat-log-service && npm test`: runs collector, cleanup, analyzer, daily-summary, and replay self-tests.
- `npm run test:runtime-helper-entry`: bundles and smoke-tests the browser runtime helper entry.
- `npm run test:remote-bundled`: builds a candidate remote bot/manifest through the bundled runtime path.
- `node scripts/verify-objective-build.js`: verifies the generated release artifact, current architecture boundaries, and static behavioral anchors.

Do not run manifest/build-producing commands in parallel with manifest-reading validation. `node scripts/build-remote-bot.js --version ...` rewrites `dist/manifest.json`; `node scripts/objective-status.js --self-test` and `node scripts/verify-objective-build.js` read that file and can report false missing/mismatched evidence if they run concurrently with the build.

## Strategy Coverage

`src/strategy/self-test.js` covers pure strategy helpers for:

- action priority and final action arbitration;
- target-switch diagnostics;
- attack-worth target eligibility;
- exit-motion targetless-decision handling;
- pending-exit retry/display/summary/leave-confirmation helpers;
- leave-command summaries and Clash rescue retry behavior;
- coin diagnostics, motion, target identity, progress, route, and pickup helpers;
- opportunity choice, candidate, pick, clear, persistence, and missing-held behavior;
- patrol and post-attack drop behavior;
- stamina-budget summaries/selectors;
- chase-mode candidate aggregation, invulnerable remaining-time normalization and seekability, panel union selection, target stickiness, stale/low-Drop state exposure, visible low-Drop clear grace, killed-target candidate suppression until explicit newer observation, and active-chase post-attack drop wait eligibility;
- combat constants and opportunity constants;
- ROI calculations.

The browser runtime should adapt page/native state into these pure helpers instead of duplicating the same policy logic.

## Browser Runtime Coverage

`src/node/run-self-test.js` includes focused browser-runtime smoke checks for session recovery, including the no-self snapshot-exit confirmation path that only accepts a fresh authoritative snapshot with current self absent, the local stale-session reset that clears `tmpGameSessionToken`/`tmpGameUserId` while preserving the login id input and `tmpGameHelpSeenV3`, writes the recovery marker, and clears page-native `state.currentUserId/sessionToken/ws/wsOpen` plus stale entity/reconnect state before relogin. It also verifies that a visible login control does not hide stale no-self game-session evidence, that explicit login-required no-self auth blocks clear stale local/session/native WebSocket state and reload without fresh snapshot confirmation, covers leave-403 no-self recovery that clears stale local state without creating a pending-exit retry, covers both persisted and in-memory marker paths that suppress repeat leave/session-mismatch handling while stale native-session evidence is still present, and directly exercises `maybeStartAutoLogin()` for the marker path and the ordinary no-self no-page-session path that must prefer a visible native login control over page-global `startLinuxDoLogin`. These login checks verify that stale native-session evidence and old suppress state do not block the first recovery login, that the marker records the started login/method/suppress expiry, that a later OAuth callback/page reload waits instead of clicking login again, that known same-day long-stamina exhaustion blocks automatic login without clicking the visible login control or page-global login fallback, and that a visible login-control click with no URL/token/self/user-id/WebSocket evidence does not enter the 45s `bot login started` grace. Pending-exit runtime coverage also verifies that confirmed exits request a page reload after `exit-confirmed`, that a no-self pending exit clears stale local/session/native WebSocket state before requesting reload even when the reload request is blocked, that an external/manual `left user <currentUserId>` exit with fresh snapshot-missing-self evidence clears stale native self entities before reload, that the external-left-user recovery remains idempotent while reload is blocked by exit-audit flushing, and that old `left user` chat history is ignored while a live current self still has token/session evidence. Native transport coverage verifies that a movement/settlement stall reset closes only the current page-owned native WebSocket, preserves login/session state, clears local motion, recognizes a replacement WebSocket as recovered, and cooldown-blocks repeated reset after timeout. Session-recovery coverage verifies that repeated exit-audit reload blocks are throttled while still forcing log flush attempts. Combat tick-gap coverage verifies main-loop, reentry, and active-combat frame-gap exits while guarding against post-combat log-buffer frame gaps forcing an offline exit after the current decision has switched to AFK profit seeking. Page-modal smoke coverage verifies that only a visible tutorial/help modal with a known confirmation button is clicked. Post-login zoom smoke checks cover direct page-native `setViewRadius(50200)` application, one-way wheel fallback until the native `view r` reaches 502m, stopping at/above the target without zooming back in, plus stable no-token zoom session keys.

## Objective Build Verification

`scripts/verify-objective-build.js` is the static architecture and release guard. It currently verifies:

- `dist/manifest.json` matches the generated remote bot hash and current runtime entry/config hash;
- production manifest metadata records direct `src/browser/runtime-entry.js` bundling;
- `src/browser/runtime-entry.js` is executable composition code, not a source-fragment adapter;
- the obsolete browser source-string layer is absent;
- production and local CDP/print-source paths both use the bundled direct runtime entry;
- all browser runtime modules are included in the esbuild graph;
- generated dist is browser-safe single-file output with no unresolved relative imports;
- runtime owner modules retain their assigned shell/API/entity/UI/logging/control/native/profit/combat/orchestration bodies;
- combat composition guards include known split-runtime dependency wires such as `opportunityLongStaminaBudget`, `dropValue`, `speed`, `isJoinModeActive`, `isInvulnerable`, `combatTargetId`, `directionTo`, and `now`, with smoke coverage for combat movement passive-runner current-target/close-vector paths, combat target sticky-selection timing, and in-range engaged Active targets continuing under a low long-cycle stamina budget while fresh proactive Active combat remains blocked;
- module size budgets prevent domain code from flowing back into composition points;
- dependency-width budgets prevent wide flat runtime injection from returning;
- combat target, aim, and fire stay native/realtime-visible only;
- ordinary profit keeps visible/native coin and visible/native AFK priority before snapshot fallback;
- chase-mode runtime owns target persistence/status and only hands combat off through current visible/attackable native combat targets;
- post-login zoom keeps the 502m target radius, uses native/page `view r` as the stop condition, applies page-native `setViewRadius(50200)` before wheel fallback, only sends zoom-out fallback steps, disables blind fallback clicks by default, and keeps stable no-token session keys;
- bootstrap panels expose red/blue dashed-circle manual view-radius buttons for 151m and 502m plus the icon-only hunt-panel toggle on the current-time row;
- bootstrap auto-login evaluates the local login-point safety gate only after deciding that login is needed, and login-start grace is written only after observable login-start evidence;
- userscript and extension bootstrap versions match their runtime constants.

Current high-risk size and dependency guards include:

- `runtime-entry.js`: must stay under its composition-entry budget.
- `orchestration-runtime.js`, `orchestration-decision-runtime.js`, and `orchestration-tick-runtime.js`: must stay context-based and narrow.
- `control-flow-runtime.js`: must remain a composition owner with session recovery and relogin gate split out.
- `combat-log-runtime.js`, `combat-runtime.js`, `profit-runtime.js`, and `native-state-runtime.js`: must remain composition owners.
- combat target/movement/aim and target overlay modules have budgets to prevent uncontrolled growth.

## Replay And Live Evidence

Combat-logic changes based on battle records require offline replay of the referenced fight before release. Structural refactors that do not change combat behavior still run the normal release validation.

`objective-status.js --fail-on-incomplete` remains a live-evidence gate, not a substitute for static verification. It can fail with no fresh matching current-version logs even when the build is structurally valid.

## Documentation-Only Changes

For documentation-only changes, run at least:

```bash
git diff --check
```

If documentation changes alter validation instructions, architecture boundaries, release workflow, or generated docs/reports paths, also run the relevant command named by the changed documentation.
