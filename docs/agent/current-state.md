# Current State

Update this file for every remote bot release or handoff-relevant state change. Keep it current and concise; architecture rules live in [current-architecture.md](current-architecture.md).

## Latest Release

- Latest remote bot: `bootstrap-0.4.571`.
- Latest manifest SHA-256: `7b23f2e4f6ab5f6505d37416d2466a622779bf5ee4301e5aa7d56502099a13fd`.
- Latest remote release commit: `04c2ec7` (`bootstrap-0.4.571` fit post-login zoom by measured 500m circle).
- Latest bootstrap A versions: Tampermonkey `0.4.74`, extension `0.1.53`.
- Latest direct entry/config SHA-256: `bb2d749f0ac9b5e1c8e2214d16e38d99c8cca51e490c8a816c2bcd510c4b209d`.

## Current Handoff

- `bootstrap-0.4.571` fixes the `bootstrap-0.4.570` post-login zoom stop-at-~200m regression. The page `viewRadiusCm`/scale label can already report 500m even when the 500m circle is still clipped on screen, so zoom fitting no longer stops on that label. It continues zooming out while measured `fitRatio > maxRatio`, preserves the no-improvement stop and disabled blind fallback clicks, and raises the measured pass caps to 24 total/outward steps and 8 inward steps so the small wheel delta can actually reach the 500m target.
- `bootstrap-0.4.570` keeps the post-login target at a 500m visible range while preventing runaway zoom-out. The measured fit now stops with `view-radius-cap` once `postLoginZoomMaxViewRadiusCm = 50000` is reached, limits each pass to 8 measured steps with at most 4 outward steps and 3 inward steps, stops on non-improving measured steps instead of falling back to zoom buttons, disables blind fallback zoom-out clicks by default, and uses a stable no-token session key so no-self/self jitter cannot repeatedly re-arm zoom without a real new session token.
- `bootstrap-0.4.569` stops using page refresh as the recovery mechanism after a snapshot-confirmed no-self server-side exit. The recovery path now clears all `tmpGame*` local/session storage keys, writes `graspRatNoSelfSnapshotRecovery`, closes the native WebSocket, and resets page-native `state.currentUserId`, `state.sessionToken`, `state.ws`, `state.wsOpen`, cached entity arrays, and reconnect timer fields before returning to the normal gated auto-login path on the same page. Session recovery and auto-login also accept the in-memory marker, so the same tick cannot fall back into repeat leave/session-mismatch or `game-session-connecting` reload loops if localStorage is rewritten.
- `bootstrap-0.4.568` completes the no-self recovery relogin path. When `localStorage.graspRatNoSelfSnapshotRecovery` is active after a snapshot-confirmed server-side exit, the generic no-self wait no longer treats the stale reconnecting native WebSocket as `game-session-connecting`, so it does not fall into the reload countdown. `maybeStartAutoLogin()` ignores stale generic post-login suppress for this marker path, uses normal login cooldown for retries, and clicks a visible login control before falling back to page-global `startLinuxDoLogin`, avoiding the observed no-op global login call while the native sidebar still shows `立即登录`.
- `bootstrap-0.4.567` fixes the follow-up stale no-self recovery trap where the refresh after `snapshot-no-self-exit-confirmed` still left the page showing a user id and reconnecting native WebSocket, so auto-login treated it as an active page session and never clicked login. Snapshot-confirmed server-side exit clears the same local/session login keys, writes a short-lived `localStorage.graspRatNoSelfSnapshotRecovery` marker, and after reload the no-self/session-mismatch logic ignores stale native session evidence while that marker matches the current user. The normal login-point safety gate still controls unattended relogin.
- `bootstrap-0.4.566` handles the stale logged-in/no-self trap where the page still has a user id and reconnecting WebSocket but the server has already exited the player. Once the old no-self leave threshold is reached, a fresh `/snapshot` that is authoritative and lacks the current self confirms the server-side exit, clears stale local login keys (`tmpGameSessionToken`/`tmpGameUserId`), closes the page WebSocket, records `snapshot-no-self-exit-confirmed`, and refreshes for the next gated login instead of repeatedly calling `leave()` into HTTP 403. Fresh snapshots that still contain self continue through live session/mismatch recovery; stale/unknown snapshots keep the existing offline leave path.
- `bootstrap-0.4.565` changes post-login visible-range zoom from one-way zoom-out to a slower measured fit loop. It now targets a near-full view-circle fit (`postLoginZoomFitTargetRatio = 0.98`, tolerance `0.04`), uses smaller/slower wheel steps (`postLoginZoomWheelDeltaY = 35`, `postLoginZoomOutIntervalMs = 220`), stops immediately after a post-step measurement reaches the target band, and can zoom back in when the view was over-shrunk. Fallback zoom button clicks are serialized with fit rechecks instead of queuing fixed clicks blindly.
- `bootstrap-0.4.564` changes confirmed passive coin-runner aiming inside `combatPassiveRunnerPrecisionRange = 5500cm` from full intercept lead to live/native/render precision. Recent `xuanze00` replays showed the old close intercept overled small zigzag movement; the new generic passive-runner branch improved estimated hits from `29/229` to `86/229` and from `19/143` to `67/143` on two records, while `colloq168` active-pressure replays stayed effectively unchanged.
- `bootstrap-0.4.563` preserves healthy high-value visible coin pickup after a same-tick minor injury instead of escalating the generic `injury hp drop` fallback to `leave()`, while keeping low-HP/combat-disadvantage exits intact. Injury leave summaries now prefer an explicit bullet owner or closer real human over a farther/invulnerable Active summary, so the displayed attacker should match the nearby player that caused the HP drop.
- `bootstrap-0.4.562` passes `directionTo` into combat movement runtime and `now` into combat target runtime, with objective-build smoke coverage for passive-runner close movement and sticky combat target selection; the checked browser runtime surface has no unexpected `no-undef` findings beyond known build/page globals.
- `bootstrap-0.4.561` passes `combatTargetId` into combat movement runtime and adds an objective-build passive-runner smoke for the dependency; passive-runner combat checks should no longer throw `combatTargetId is not defined` when combat starts.
- `bootstrap-0.4.560` passes `isInvulnerable` into combat movement runtime and adds objective-build guards for the dependency; passive-runner combat checks should no longer throw `isInvulnerable is not defined` when combat starts.
- `bootstrap-0.4.559` passes `speed` into combat movement runtime and `isJoinModeActive` into combat target runtime, with objective-build guards for both dependencies; active-combat checks should no longer throw `speed is not defined` or `isJoinModeActive is not defined`.
- `bootstrap-0.4.558` passes `dropValue` into the combat movement runtime and adds objective-build guards for the dependency; passive-runner combat checks should no longer throw `dropValue is not defined`.
- Bootstrap A Tampermonkey `0.4.74` and extension `0.1.53` now evaluate the local login-point safety gate only after `maybeStartGameLogin()` confirms that an automatic login is actually needed; watchdog intervals should no longer print `login blocked by local login-point safety gate` while an alive in-game self is active.
- `bootstrap-0.4.557` passes `highValueCoinPriorityAmount` into the profit opportunity runtime and adds an objective-build smoke for `opportunityChoiceCoreOptions()`; missing-held opportunity checks should no longer throw `highValueCoinPriorityAmount is not defined`.
- `bootstrap-0.4.556` passes `opportunityLongStaminaBudget` from the combat composition runtime into combat-target runtime; active-combat budget checks should no longer throw `opportunityLongStaminaBudget is not defined`.
- `bootstrap-0.4.555` restores the control-flow dependencies for `newExitAuditRequestId` and `syncPausedFromPage`; the control-flow runtime now instantiates cleanly with stub dependencies and should no longer fail with `newExitAuditRequestId is not defined`.
- `bootstrap-0.4.554` defers the control-flow `stopMotionAfterExit` dependency until native state initializes it; remote startup should no longer fail with `Cannot access 'stopMotionAfterExit' before initialization`.
- `bootstrap-0.4.553` restores the combat-log session boundary helpers that were dropped during the logging runtime split; remote startup should no longer fail with `startCombatLogSession is not defined`.
- The runtime refactoring result is accepted as complete.
- The old refactoring-process documents and migration plans have been removed from tracked docs.
- The durable architecture guidance is now [current-architecture.md](current-architecture.md).
- Future source changes should follow the current architecture: pure strategy in `src/strategy/`, browser runtime domain ownership in `src/browser/runtime/`, a thin `src/browser/runtime-entry.js`, and script A/bootstrap changes in `userscript/` plus `extension/`.
- `AGENTS.md` remains the local standing-rule entrypoint and points to `docs/agent/README.md`; tracked architecture detail belongs in `docs/agent/current-architecture.md`.

## Current Architecture Facts

- `src/browser/runtime-entry.js` is the single browser runtime entry bundled by esbuild.
- The old browser source-string layer is gone and must stay gone: no `src/browser/*source.js`, `runtime-source.js`, `runtime-entry-source.js`, or `runtime-fragment-registry.js`.
- `src/browser/runtime/` contains 90 executable browser runtime modules in the esbuild graph.
- Orchestration runtime factories use named domain contexts instead of the former wide flat dependency bag.
- `control-flow-runtime.js` is a composition owner; session recovery and relogin gate behavior have dedicated modules.
- `grasp-rat-bot.js` is the Node/CDP fallback and local CLI wrapper, not the normal home for strategy or browser-runtime changes.

## Latest Validation Baseline

The latest `bootstrap-0.4.571` release validation passed:

```bash
node grasp-rat-bot.js --self-test
node scripts/objective-status.js --self-test
node --check grasp-rat-bot.js
node --check scripts/build-remote-bot.js
node --check scripts/objective-status.js
node --check scripts/verify-objective-build.js
node --check userscript/grasp-rat-bootstrap.user.js
node --check extension/background.js
node --check extension/content-bridge.js
node --check extension/page-bootstrap.js
node --check extension/popup.js
cd combat-log-service && npm test
npm run test:runtime-helper-entry
npm run test:remote-bundled
node scripts/build-remote-bot.js --version bootstrap-0.4.571
node scripts/verify-objective-build.js
git diff --check
```

Latest objective build verification reports 35 checks and guards:

- manifest/dist/source hash consistency;
- direct runtime-entry bundling for production and local CDP/print-source;
- absence of obsolete source-fragment files;
- ownership boundaries for shell, API, entity, UI, logging, control, native, profit, combat, and orchestration modules;
- runtime module graph coverage for all browser runtime modules;
- module size budgets;
- dependency-width budgets for high-risk composition factories;
- native/realtime-only combat target/aim/fire anchors;
- visible/native ordinary-profit priority before snapshot fallback;
- no-self snapshot recovery remains a dedicated control runtime module, the shared recovery marker helper is included in the browser module graph, and composition owners stay under size/dependency guards;
- post-login visible-range zoom keeps the 500m target radius, does not stop on the page view-radius label, limits measured steps, disables blind fallback clicks by default, and keeps stable no-token session keys;
- bootstrap auto-login evaluates login-point safety only after login is needed;
- userscript and extension bootstrap version consistency.

## Report Locations

- Daily reports: `docs/reports/YYYY-MM/daily-YYYY-MM-DD.md`.
- Monthly Elysiver coin balance reports: `docs/reports/YYYY-MM/monthly-YYYY-MM.md`.
- Combat logs and temporary detailed JSONL remain under `combat-log-service/logs/` and are not the durable report location.
