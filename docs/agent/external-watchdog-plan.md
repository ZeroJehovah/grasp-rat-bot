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

Build the watchdog as a separate local program, not as a browser extension.

Recommended first implementation:

- A Node.js or Windows service/process running outside Chrome's renderer process.
- Chrome launched with a local DevTools Protocol port.
- CDP used for observation and optional page-side fallback actions.
- Direct game leave requests sent by the watchdog itself when possible.
- Direct Clash REST API calls sent by the watchdog itself when configured.

The userscript should continue to own normal strategy decisions. The watchdog should own only high-risk failure handling: combat heartbeat stalls, renderer unresponsiveness, lifecycle freezes, hidden/frozen tab state during combat, and emergency exit/proxy rescue.

## Why Not A Browser Extension

A browser extension can help with UI or diagnostics, but it is not a strong safety boundary for this failure mode:

- Content scripts are still tied to the tab/frame/renderer scheduling model.
- Manifest V3 service workers can be suspended by Chrome.
- Extension `chrome.debugger` access still lives inside Chrome's extension lifecycle and permission model.
- If the renderer or page lifecycle is frozen, the extension may not provide reliable sub-second emergency handling.

For combat safety, the watchdog should live outside Chrome's renderer scheduling path.

## Chrome Startup

When CDP observation is needed, launch Chrome with a local remote-debugging port and an isolated user profile:

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

If the watchdog only consumes local logs and sends direct backend requests, CDP is not strictly required. However, CDP is recommended for the first serious version because it gives better tab identification, lifecycle visibility, runtime liveness checks, and WebSocket visibility.

## Signals To Monitor

The watchdog should maintain its own state machine outside the page:

- Last page heartbeat time.
- Last combat tick time.
- Whether combat is active.
- Current self HP and whether HP has already dropped in this combat.
- Current target and target HP.
- Page visibility and lifecycle state, including `hidden`, `freeze`, `resume`, `pagehide`, and `pageshow`.
- WebSocket frame receive/send activity.
- CDP `Runtime.evaluate` responsiveness and timeout.
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
- CDP runtime calls time out while combat was recently active.

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

1. Send a direct game leave request from the watchdog process using the current browser session credentials or a separately configured authenticated client.
2. Call the Clash REST API directly from the watchdog process when proxy rescue is enabled.
3. Use CDP to attempt the existing page-side leave path if the renderer still responds.
4. As a last resort, close or reload the tab.

Closing the tab is not guaranteed to equal an in-game leave. It should be treated as a final fallback, not as the primary safety mechanism.

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

- Start watchdog outside Chrome.
- Connect to CDP.
- Identify the game tab.
- Record page heartbeat age, combat tick age, visibility/lifecycle events, CDP runtime responsiveness, and WebSocket activity.
- Emit structured logs without taking action.

Phase 2: Dry-run rescue decisions.

- Add the emergency state machine.
- Log when a rescue would have triggered.
- Compare dry-run triggers against real combat logs to tune thresholds.

Phase 3: Direct leave rescue.

- Implement authenticated direct leave requests from the watchdog.
- Keep CDP page-side leave as fallback only.
- Log request time, response status, and exit confirmation.

Phase 4: Clash rescue.

- Add Clash authenticated API validation at startup.
- Add page-side Clash validation after configuration changes and after script injection while page-side rescue still exists.
- Disable Clash rescue automatically for the runtime session when validation fails.
- Trigger proxy switching only under configured high-risk conditions.
- Record proxy-switch attempts and failures in watchdog logs.

Phase 5: Service hardening.

- Package as a Windows-startable process or service.
- Add restart behavior, log rotation, config validation, and a local status endpoint.
- Add a clear manual pause/disable control.

## Validation

Before enabling active rescue, validate with:

- Synthetic heartbeat stall tests.
- CDP runtime timeout simulation.
- Clash API authentication self-test.
- Dry-run comparison against existing combat logs.
- A controlled live session where the watchdog exits only after a deliberately induced stall.

Success criteria:

- The watchdog detects page heartbeat stalls without relying on in-page JavaScript recovery.
- In high-risk combat, the watchdog attempts external leave within the configured threshold.
- Clash authentication problems are detected before combat.
- All rescue attempts are logged with enough timing detail to reconstruct the decision.

## Open Questions

- Which direct game leave endpoint and credentials should the watchdog use as the primary exit path?
- Should hidden/frozen visibility during active damaged combat trigger immediate leave, or only lower the heartbeat stall threshold?
- What HP/damage threshold should count as high risk for watchdog policy?
- Should proxy switching run before, after, or in parallel with direct leave?
- Should the watchdog control Chrome startup itself, or attach to an already-started debug-profile Chrome?
