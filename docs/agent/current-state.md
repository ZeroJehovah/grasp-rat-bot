# Current State

Update this file for every remote bot release or handoff-relevant state change. Keep it current and concise; architecture rules live in [current-architecture.md](current-architecture.md).

## Latest Release

- Latest remote bot: `bootstrap-0.4.581`.
- Latest manifest SHA-256: `e1aa4b40785403e9424da425b2284a7c36d9e9d1ec55e9521f76a353214b7eed`.
- Latest remote release commit: `9e2b03a` (`bootstrap-0.4.581` handle external left-user exits).
- Latest bootstrap A versions: Tampermonkey `0.4.74`, extension `0.1.53`.
- Latest direct entry/config SHA-256: `0b6a86a15546df2acae3d30e9413a37a30c2186755b8813536be3b2d3fa92abf`.

## Current Handoff

- `bootstrap-0.4.581` handles external/manual exits that leave no pending-exit context. Before normal action selection, if chat confirms `left user <currentUserId>` and strong exit evidence is present, especially a fresh page-native snapshot with the current self absent, the bot now ignores stale native `state.entities` self data, stops motion, clears local/session/native stale login state through the no-self recovery path, records `external-left-user-exit-confirmed`, resets the relogin safety gate, and requests reload. A live current self with token/session evidence blocks the path so old chat history cannot kick an active session.
- `bootstrap-0.4.580` changes post-login zoom back to a one-way native view-radius loop. After login it reads the native/page `view r` value from `#scaleText` or native state, sends one centered zoom-out wheel step at a time while the view radius is below 500m, and stops as soon as the radius reaches or exceeds 500m for that login/session key. It no longer uses screen-fit ratio, no longer sends zoom-in correction steps when the view is over-shrunk, and no longer stops after a single non-improving measurement, so delayed label updates do not create early aborts or back-and-forth adjustment.
- `bootstrap-0.4.579` fixes the post-safety no-self relogin loop where the panel reached `登录点安全 3/3`, then repeatedly reset `bot login started` cooldown to about 45s without opening OAuth or reconnecting. In ordinary no-self/no-page-session auto-login, `maybeStartAutoLogin()` now prefers the visible native login control over page-global `startLinuxDoLogin()` when both are available. This avoids the no-op global login path while preserving the recovery-marker behavior that waits after a real login click has started.
- `bootstrap-0.4.578` fixes the earlier stale-login branch where the page/chat already said `websocket blocked: login required`, but session recovery still classified the tab as logged-in/no-self and waited on reconnect/snapshot handling. Explicit login-required text in the body, chat DOM, or recent page messages now counts as a server auth block when stale local/native session evidence and a missing self are present. That path confirms `login-required-no-self-exit-confirmed`, clears session/auth/login-like `tmpGame*` local/session keys while preserving `tmpGameHelpSeen*`, writes `graspRatNoSelfSnapshotRecovery`, resets page-native session/WebSocket/reconnect state, closes the native WebSocket, clears pending exit state, and requests a page reload without waiting for a fresh snapshot or calling `leave()`.
- `bootstrap-0.4.577` fixes the no-self pending-exit follow-up where a stale server-exited/local-session state could fall back to `leave()`, later reach `exit-confirmed`, and then keep the old native WebSocket reconnecting because `requestReload('exit confirmed')` was blocked by pending exit-audit flush. Confirmed pending exits that came from `offlineSafety.noSelfGameSession` now run the same local-session reset before requesting reload: session/auth/login-like `tmpGame*` keys are removed, `tmpGameHelpSeen*` is preserved, `graspRatNoSelfSnapshotRecovery` is written, page-native `state.currentUserId/sessionToken/ws/wsOpen` plus stale reconnect/cache state are cleared, the native WebSocket is closed, and gated relogin can proceed even if audit-log flushing delays the page reload.
- `bootstrap-0.4.576` narrows stale no-self local-session cleanup so it removes only session/auth/login-like `tmpGame*` keys (`tmpGameSession*`, `tmpGameUser*`, `tmpGameLogin*`, `tmpGameAuth*`, `tmpGameToken*`, `tmpGameOAuth*`) and explicitly preserves `tmpGameHelpSeen*`, including the observed tutorial marker `tmpGameHelpSeenV3`. A new page-modal runtime also clicks the visible `#helpModal` / `#helpOkBtn` new-player tutorial confirmation during tick and before auto-login as a fallback if the page still shows the modal.
- `bootstrap-0.4.575` fixes two follow-up session edge cases. First, `graspRatNoSelfSnapshotRecovery` now records when its recovery login has already been started, including method and suppress expiry, so the first stale-session relogin can still ignore old native session evidence but an OAuth callback/page reload will wait through the active `bot login started` grace instead of clicking the login control again and restarting OAuth. Second, any pending-exit confirmation now requests the normal page reload path after logging `exit-confirmed`, so native page WebSocket reconnect timers and stale movement state are cleared even when the exit was confirmed from chat/token/self-missing evidence rather than the stale no-self cleanup path.
- `bootstrap-0.4.574` refreshes the page immediately after stale no-self local-session cleanup succeeds. Both snapshot-confirmed no-self cleanup and no-self leave-403 cleanup now call the normal reload path after removing `tmpGame*`, writing the recovery marker, and resetting native page WebSocket state. This stops the native page script's own stale WebSocket reconnect loop from continuing to post `websocket reconnecting` / `websocket blocked: login required` messages with the old token after the bot has already cleared login state.
- `bootstrap-0.4.573` fixes the follow-up regression in `bootstrap-0.4.572` where stale no-self sessions could still fall through to `leaveOffline()`, receive HTTP 403 from `/leave`, and then be persisted as a pending exit that kept showing "waiting for exit confirmation / will resend". For no-self game-session recovery only, a leave HTTP 403 now confirms that the local session is stale enough to clear locally: it removes `tmpGame*` local/session storage, writes the no-self recovery marker with reason `leave-403-no-self-exit-confirmed`, closes/resets the native page WebSocket state, clears pending exit state, and returns to gated relogin without creating a pending-exit retry or a 403 risk-control hold. Ordinary offline, combat, pursuit, injury, and stamina exits keep their existing pending/retry behavior.
- `bootstrap-0.4.572` fixes the stale server-exited/local-session reconnect loop where the service has already removed the player but `tmpGameSessionToken`/`tmpGameUserId` and the page WebSocket reconnect state remain. Session recovery no longer treats a visible login control as proof that the page is in a login-required state, because the native/sidebar login entry can be present while the script controls it. Only explicit login-required text is used for that state signal; the login control remains only an action target. A no-self state with current user/session/native WebSocket evidence can now reach the reconnect-churn or timeout recovery path, allowing snapshot-confirmed local-session cleanup and gated relogin instead of falling back to repeated no-self reloads.
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
- `src/browser/runtime/` contains 91 executable browser runtime modules in the esbuild graph.
- Orchestration runtime factories use named domain contexts instead of the former wide flat dependency bag.
- `control-flow-runtime.js` is a composition owner; session recovery and relogin gate behavior have dedicated modules.
- `grasp-rat-bot.js` is the Node/CDP fallback and local CLI wrapper, not the normal home for strategy or browser-runtime changes.

## Latest Validation Baseline

The latest `bootstrap-0.4.581` release validation passed. Run build-producing commands and manifest-reading validation sequentially, not in parallel; `node scripts/build-remote-bot.js --version ...` rewrites `dist/manifest.json`, while `objective-status` and `verify-objective-build` read it.

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
node scripts/build-remote-bot.js --version bootstrap-0.4.581
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
- no-self snapshot recovery remains a dedicated control runtime module, visible login controls do not hide stale no-self page sessions, ordinary no-self auto-login prefers a visible native login control over page-global login when no page session is active, explicit login-required stale no-self sessions clear local/session/native state and reload without fresh snapshot confirmation, no-self cleanup requests a page reload after clearing stale local sessions, no-self recovery cleanup preserves `tmpGameHelpSeen*` tutorial markers, no-self recovery login markers suppress duplicate OAuth/login clicks after recovery login starts, confirmed pending exits request a page reload, confirmed no-self pending exits clear stale local sessions before any reload-block wait, external/manual `left user <currentUserId>` exits clear stale native self entities when fresh snapshot evidence says self is gone while old `left user` chat is ignored for a live current self, no-self leave 403 recovery clears stale local sessions without pending-exit retry, the shared recovery marker helper is included in the browser module graph, and composition owners stay under size/dependency guards;
- post-login visible-range zoom keeps the 500m target radius, uses the native/page `view r` as the stop condition, only sends zoom-out steps, disables blind fallback clicks by default, and keeps stable no-token session keys;
- bootstrap auto-login evaluates login-point safety only after login is needed;
- userscript and extension bootstrap version consistency.

## Report Locations

- Daily reports: `docs/reports/YYYY-MM/daily-YYYY-MM-DD.md`.
- Monthly Elysiver coin balance reports: `docs/reports/YYYY-MM/monthly-YYYY-MM.md`.
- Combat logs and temporary detailed JSONL remain under `combat-log-service/logs/` and are not the durable report location.
