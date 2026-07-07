# External Watchdog Plan

This document records the proposed out-of-page safety watchdog for high-risk combat stalls. The goal is to handle cases where the browser page or Tampermonkey userscript does not get scheduled for multiple seconds while combat is still active.

## Problem

The current combat safety logic runs inside the game page through the userscript/browser runtime. If Chrome pauses, freezes, throttles, or severely delays that page's JavaScript main loop, the script cannot:

- Run a combat tick.
- Detect newly stale state.
- Send a leave request.
- Switch Clash proxy.
- Emit an in-page rescue event.

In the 2026-07-07 death investigation, the last normal combat tick completed at `15:55:40.828`, and the next meaningful script execution happened at about `15:56:01.944`. The in-page runtime diagnosed this as a `main-loop-gap` of about 21 seconds. During that gap, no page-side exit or proxy rescue could run.

The important constraint is that page-side logic can only react after it is scheduled again. It can detect and report the gap after recovery, but it cannot provide first-response protection during the gap itself.

## Recommended Shape

Build the first watchdog inside the existing `combat-log-service` process. This keeps the first version operationally simple: the same local Node service that already receives combat logs can also receive a lightweight heartbeat, maintain watchdog state, and issue emergency rescue actions outside the browser page's JavaScript loop.

Recommended first implementation:

- Add a non-batched watchdog heartbeat endpoint to `combat-log-service`.
- Keep combat JSONL logging on `/combat-log` unchanged.
- Maintain latest heartbeat/combat state in memory, keyed by user/session/page id.
- Run a Node-side interval that detects stale heartbeats during high-risk combat.
- Send direct game leave requests from the Node service when enough authenticated leave information is available.
- Call the Clash REST API directly from the Node service when proxy rescue is enabled and validated.
- Log watchdog decisions and rescue attempts to the existing daily audit log layout.

The userscript should continue to own normal strategy decisions. The watchdog should own only high-risk failure handling: missing heartbeat during combat, page-side tick stalls, validated direct leave, validated Clash rescue, and audit logging.

CDP can still be added later as an observability enhancement, but it should not be required for the first implementation. The first version should work with the user's normal browser profile and Tampermonkey setup.

## Why Not A Browser Extension

A browser extension can help with UI or diagnostics, but it is not a strong safety boundary for this failure mode:

- Content scripts are still tied to the tab/frame/renderer scheduling model.
- Manifest V3 service workers can be suspended by Chrome.
- Extension `chrome.debugger` access still lives inside Chrome's extension lifecycle and permission model.
- If the renderer or page lifecycle is frozen, the extension may not provide reliable sub-second emergency handling.

For combat safety, the watchdog should live outside Chrome's renderer scheduling path.

## CDP Optional Enhancement

CDP is optional for this design. When CDP observation is needed later, launch Chrome with a local remote-debugging port and an isolated user profile:

```bat
chrome.exe ^
  --remote-debugging-port=9222 ^
  --user-data-dir=C:\grasp-rat-profile ^
  --disable-background-timer-throttling ^
  --disable-renderer-backgrounding ^
  --disable-backgrounding-occluded-windows
```

Notes:

- Bind only to localhost. Do not expose the debugging port to the LAN or public network.
- Use a dedicated Chrome profile for the bot.
- The throttling-related flags can reduce background scheduling risk, but they are not a full safety guarantee.
- CDP mode is not the same as manually opening DevTools. It only allows the local watchdog process to inspect and control the browser.

The `combat-log-service` watchdog does not require this startup mode. It detects stalls by observing that the page has stopped sending fresh heartbeat messages.

## Combat Log Service Integration

The watchdog should be implemented as a side module of `combat-log-service/server.js`, not as part of the normal JSONL append path.

New local endpoints:

- `POST /watchdog/heartbeat`: lightweight, high-frequency page heartbeat. This must not be batched behind combat log flushing.
- `GET /watchdog/status`: current in-memory watchdog state and last rescue decision.
- `POST /watchdog/config`: optional local-only runtime config update for thresholds, dry-run mode, Clash validation, and direct leave settings.
- `POST /watchdog/test-clash`: optional manual Clash validation endpoint.

The heartbeat should be small and sent frequently, for example every 250-500 ms while logged in and every 150-250 ms during active combat. It should use a short timeout and should not wait for combat log queue flushing.

Example heartbeat:

```json
{
  "type": "watchdog-heartbeat",
  "pageId": "mrae7o2a",
  "userId": 28886,
  "at": 1783413267336,
  "sequence": 12345,
  "visibilityState": "hidden",
  "combatActive": true,
  "damagedInCombat": true,
  "self": {
    "id": 28886,
    "hp": 58,
    "maxHp": 100,
    "life": "Alive"
  },
  "target": {
    "id": 27355,
    "name": "RIS_YI",
    "hp": 100,
    "distance": 12665
  },
  "decision": {
    "reason": "combat-hp-disadvantage-leave",
    "pendingExit": false
  },
  "control": {
    "wsOpen": true,
    "nativeWsOpen": true,
    "hasToken": true
  },
  "runtime": {
    "lastCombatTickAt": 1783413267336,
    "lastTickCompletedAt": 1783413267273
  },
  "leaveAuth": {
    "available": true,
    "userId": 28886,
    "origin": "https://grasp-rat-game.h-e.top",
    "sessionTokenPresent": true,
    "expiresAt": 1783413297336
  }
}
```

The exact `leaveAuth` shape depends on the verified game leave API. It should contain only what the Node process needs to perform direct leave and should be kept in memory where possible. Do not write secrets, cookies, or session tokens into tracked files or ordinary JSONL combat logs.

In-memory state per page/user should include:

- Last heartbeat received time according to Node.
- Last page timestamp and monotonic heartbeat sequence.
- Current combat-active flag.
- Current self HP and whether HP dropped during the current combat.
- Current target id/name/HP/distance.
- Current pending-exit state, if the page already triggered one.
- Latest direct leave credential/request descriptor and its expiry.
- Latest Clash validation result.
- Active rescue attempt state so repeated intervals do not spam leave requests.

Watchdog audit events should be written separately from normal combat frames, for example under `logs/YYYY-MM-DD/audit/watchdog.jsonl` or a per-combat audit file when the combat id is known.

## Signals To Monitor

The watchdog should maintain its own state machine outside the page:

- Last page heartbeat time.
- Last combat tick time.
- Whether combat is active.
- Current self HP and whether HP has already dropped in this combat.
- Current target and target HP.
- Page visibility and lifecycle state, including `hidden`, `freeze`, `resume`, `pagehide`, and `pageshow`.
- WebSocket frame receive/send activity.
- Heartbeat sequence continuity.
- Direct leave credential freshness and validation state.
- Optional CDP `Runtime.evaluate` responsiveness and timeout, when CDP is enabled later.
- Clash API availability and authentication status.
- Last successful leave request and exit confirmation time.

The page can still publish lightweight heartbeat/state data when it is healthy. The watchdog must treat missing heartbeat updates as a signal in its own process, not wait for the page to diagnose itself.

## Emergency Policy

Baseline packet loss alone should not trigger rescue, because current operating conditions can normally show 20% or higher packet loss.

Emergency decisions should focus on high-risk combinations such as:

- Combat is active.
- Self has already taken damage or is below a configured HP threshold.
- A hostile target is still present or was recently present.
- Page heartbeat or combat tick age exceeds the stall threshold.
- The page is reported as hidden/frozen during active combat.
- Optional CDP runtime calls time out while combat was recently active.

Example first-version rule:

```text
if combatActive
and selfDamagedInCurrentCombat
and pageHeartbeatAgeMs >= 2000
then trigger external leave rescue
```

The exact threshold should be conservative and configurable. For high-risk combat, a 1500-3000 ms heartbeat/tick stall threshold is a reasonable starting range. The threshold should be based on page heartbeat age, combat tick age, and state freshness rather than packet-loss percentage alone.

## Rescue Order

The watchdog should not depend on page JavaScript for the primary rescue path.

Preferred order:

1. Send a direct game leave request from the Node watchdog using the freshest validated leave credentials/request descriptor.
2. Call the Clash REST API directly from the Node watchdog when proxy rescue is enabled and validation is currently passing. This may run in parallel with direct leave, but it must not delay direct leave.
3. If the page heartbeat later resumes, let the userscript observe pending exit state and avoid re-entering unsafe combat.
4. If CDP is enabled later, optionally use CDP to attempt the existing page-side leave path when the renderer still responds.
5. As a last resort, close or reload the tab only when CDP or another browser-control layer exists.

Closing the tab is not guaranteed to equal an in-game leave. It should be treated as a final fallback, not as the primary safety mechanism.

## Direct Leave Plan

The watchdog is only useful as a safety boundary if it can issue leave without page JavaScript. The first implementation must therefore add a service-side `leaveClient` to `combat-log-service`.

Requirements:

- The direct leave endpoint, method, request body, and authentication method must be verified against the live game before active rescue is enabled.
- The userscript should send the latest leave authentication/request descriptor to `/watchdog/heartbeat` while the page is healthy.
- If the game leave request can be authenticated with `tmpGameSessionToken`, the heartbeat can provide a short-lived token snapshot to the local service.
- If the game leave request requires HttpOnly cookies or browser-only state that JavaScript cannot read, the Node watchdog cannot directly leave until a different authenticated client path is identified.
- Credentials should be stored in memory with a short TTL. Avoid writing tokens/cookies to normal logs.
- Direct leave must never wait for Clash switching or page-side confirmation before sending the first request.

The direct leave flow should be:

```text
heartbeat received
  -> update lastKnownLeaveAuth
  -> mark directLeaveReady only if descriptor is fresh and complete

watchdog interval detects high-risk stale heartbeat
  -> create rescue id
  -> immediately call sendDirectLeave(userId, leaveAuth)
  -> in parallel, call Clash rescue only if validated
  -> record request timestamps, status, response summary, and errors
  -> retry direct leave on timeout/uncertain result with conservative backoff
  -> stop retrying when exit is confirmed or credentials expire
```

Pseudocode:

```js
if (shouldRescue(state) && !state.rescue.active) {
  state.rescue = startRescue(state);
  const jobs = [sendDirectLeave(state.userId, state.leaveAuth)];
  if (state.clash.valid) jobs.push(switchClashProxy(state.clash));
  Promise.allSettled(jobs).then(results => recordWatchdogRescueResult(state, results));
}
```

Exit confirmation sources:

- A later heartbeat or combat/audit log showing the user is no longer in session.
- A direct leave response that is verified to mean success.
- A later page-side `exit-confirmed` audit event.
- Optional snapshot/status fetch from the game backend, if a safe authenticated status endpoint is available.

If direct leave is not ready, active rescue must log `direct-leave-not-ready` and should still attempt validated Clash rescue if configured. This state is not considered a complete safety implementation.

## Clash Requirements

The watchdog should own Clash API configuration and validation:

- Clash controller URL.
- API secret, if configured.
- Target proxy group.
- Rescue proxy choice or policy.
- Startup self-test that performs a harmless authenticated read.
- Validation after every Clash configuration change.
- Validation after every userscript/runtime injection when page-side Clash rescue remains enabled.

The 2026-07-07 incident included a page-side Clash rescue failure with HTTP `401`. A watchdog implementation should surface this as a startup/configuration failure instead of discovering it only during combat.

The same class of failure can happen when the configured Clash secret contains characters that are accidentally escaped or transformed while being entered through the browser console or stored configuration. A backslash in the secret is a known risk because JavaScript string literals may interpret it as an escape prefix unless it is entered as an escaped backslash or through a safer UI path.

When page-side Clash rescue remains available before the external watchdog is implemented, the script should asynchronously validate the configured Clash connection in two places:

- Immediately after every call that changes Clash rescue configuration.
- On every script injection/bootstrap, before trusting Clash rescue during combat.

The validation should perform a harmless authenticated request, such as reading the configured proxy group. It should verify:

- The controller URL is reachable.
- The Authorization secret is accepted.
- The configured proxy group exists.
- The configured rescue proxy names exist when they will be used.

If validation fails, Clash rescue should be disabled automatically for that runtime session and the reason should be visible in status/log output. A failed validation must not block or delay direct game leave requests. In the emergency path, direct leave should remain the primary action, with proxy rescue running only after or in parallel with leave.

## Implementation Phases

Phase 1: Observation only.

- Add `/watchdog/heartbeat` and `/watchdog/status` to `combat-log-service`.
- Send non-batched heartbeat from the userscript/runtime.
- Maintain in-memory per-user/page watchdog state.
- Record heartbeat age, combat tick age, visibility/lifecycle fields, control state, and direct leave readiness.
- Emit structured watchdog logs without taking action.

Phase 2: Dry-run rescue decisions.

- Add the emergency state machine.
- Log when a rescue would have triggered.
- Compare dry-run triggers against real combat logs to tune thresholds.

Phase 3: Direct leave client.

- Verify the game leave endpoint, method, request body, and authentication source.
- Add a `leaveClient` in `combat-log-service`.
- Add heartbeat fields for the current leave request descriptor or short-lived auth snapshot.
- Add direct leave validation/readiness status without triggering real leave.
- Keep active rescue disabled until direct leave has a controlled live validation.

Phase 4: Clash rescue.

- Add Clash authenticated API validation at startup.
- Add page-side Clash validation after configuration changes and after script injection while page-side rescue still exists.
- Disable Clash rescue automatically for the runtime session when validation fails.
- Trigger proxy switching only under configured high-risk conditions and never before direct leave.
- Record proxy-switch attempts and failures in watchdog logs.

Phase 5: Active rescue.

- Enable direct leave on high-risk stale heartbeat.
- Run Clash rescue in parallel or after direct leave only when validation is passing.
- Add retry policy, duplicate-rescue suppression, and exit confirmation tracking.
- Keep page-side leave as normal strategy behavior, not as the watchdog's primary rescue path.

Phase 6: Service hardening.

- Package `combat-log-service` as a Windows-startable process or service.
- Add restart behavior, log rotation, config validation, and a local status endpoint.
- Add a clear manual pause/disable control.
- Optionally add CDP observation later for richer diagnostics.

## Validation

Before enabling active rescue, validate with:

- Synthetic heartbeat stall tests.
- Watchdog dry-run replay against existing death windows.
- Clash API authentication self-test.
- Direct leave client readiness test.
- Controlled direct leave test in a low-risk live session.
- Dry-run comparison against existing combat logs.
- A controlled live session where the watchdog exits only after a deliberately induced stall.

Success criteria:

- The watchdog detects page heartbeat stalls without relying on in-page JavaScript recovery.
- In high-risk combat, the watchdog attempts direct leave within the configured threshold.
- Direct leave is sent before any Clash operation can delay it.
- Clash authentication problems are detected before combat.
- All rescue attempts are logged with enough timing detail to reconstruct the decision.

## Open Questions

- Which direct game leave endpoint and credentials should the watchdog use as the primary exit path?
- Can direct leave use `tmpGameSessionToken`, or does it require HttpOnly browser cookies or another credential source?
- Should the direct leave request descriptor be configured statically, discovered at runtime, or both?
- Should hidden/frozen visibility during active damaged combat trigger immediate leave, or only lower the heartbeat stall threshold?
- What HP/damage threshold should count as high risk for watchdog policy?
- Should proxy switching run after direct leave or in parallel with direct leave?
- Should CDP be added later only for diagnostics, or also for final browser-control fallback?
