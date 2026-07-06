# Current Test Coverage Notes

Keep this file focused on current validation coverage. Do not use it as a migration history archive.

## Current Counts

- Bot self-test count: `324`.
- Strategy module self-test count: `107`.
- Combat-log analyzer self-test count: `88`.
- Combat replay self-test count: `1` local replay case plus skipped historical fixtures when retained logs are absent.
- Objective build verification count: `35`.

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
- combat constants and opportunity constants;
- ROI calculations.

The browser runtime should adapt page/native state into these pure helpers instead of duplicating the same policy logic.

## Browser Runtime Coverage

`src/node/run-self-test.js` includes focused browser-runtime smoke checks for session recovery, including the no-self snapshot-exit confirmation path that only accepts a fresh authoritative snapshot with current self absent, the local stale-session reset that clears `tmpGameSessionToken`/`tmpGameUserId` while preserving the login id input, writes the recovery marker, and clears page-native `state.currentUserId/sessionToken/ws/wsOpen` plus stale entity/reconnect state before relogin. It also verifies that a visible login control does not hide stale no-self game-session evidence, covers leave-403 no-self recovery that clears stale local state without creating a pending-exit retry, covers both persisted and in-memory marker paths that suppress repeat leave/session-mismatch handling while stale native-session evidence is still present, and directly exercises `maybeStartAutoLogin()` for the marker path. These login checks verify that stale native-session evidence and old suppress state do not block the first recovery login, that the marker records the started login/method/suppress expiry, and that a later OAuth callback/page reload waits instead of clicking login again. Pending-exit runtime coverage also verifies that confirmed exits request a page reload after `exit-confirmed`. Post-login zoom smoke checks cover continuing to fit a clipped 500m circle even when the page view-radius label already says 500m, plus stable no-token zoom session keys.

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
- combat composition guards include known split-runtime dependency wires such as `opportunityLongStaminaBudget`, `dropValue`, `speed`, `isJoinModeActive`, `isInvulnerable`, `combatTargetId`, `directionTo`, and `now`, with smoke coverage for combat movement passive-runner current-target/close-vector paths and combat target sticky-selection timing;
- module size budgets prevent domain code from flowing back into composition points;
- dependency-width budgets prevent wide flat runtime injection from returning;
- combat target, aim, and fire stay native/realtime-visible only;
- ordinary profit keeps visible/native coin and visible/native AFK priority before snapshot fallback;
- post-login zoom keeps the 500m target radius, does not stop on the page view-radius label, limits measured steps, disables blind fallback clicks by default, and keeps stable no-token session keys;
- bootstrap auto-login evaluates the local login-point safety gate only after deciding that login is needed;
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
