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

The watchdog must be opt-in, like combat logging. It should remain fully disabled until the user explicitly enables and configures it.

## Why Not A Browser Extension

A browser extension can help with UI or diagnostics, but it is not a strong safety boundary for this failure mode:

- Content scripts are still tied to the tab/frame/renderer scheduling model.
- Manifest V3 service workers can be suspended by Chrome.
- Extension `chrome.debugger` access still lives inside Chrome's extension lifecycle and permission model.
- If the renderer or page lifecycle is frozen, the extension may not provide reliable sub-second emergency handling.

For combat safety, the watchdog should live outside Chrome's renderer scheduling path.

## Combat Log Service Integration

The watchdog should be implemented as a side module of `combat-log-service/server.js`, not as part of the normal JSONL append path.

The service should expose watchdog endpoints even when disabled, but the userscript should not send heartbeat traffic and the service should not trigger rescue until watchdog configuration is explicitly enabled.

New local endpoints:

- `POST /watchdog/heartbeat`: lightweight, high-frequency page heartbeat. This must not be batched behind combat log flushing.
- `GET /watchdog/status`: current in-memory watchdog state and last rescue decision.
- `POST /watchdog/config`: local-only runtime config update for enabling/disabling watchdog, thresholds, dry-run mode, Clash validation, and direct leave settings.
- `POST /watchdog/test-clash`: optional manual Clash validation endpoint.

The userscript should gain a manual configuration entry similar to `configureCombatLogging`, for example `configureWatchdog({ enabled: true, endpoint: 'http://127.0.0.1:18765/watchdog/heartbeat' })`. Configuration should persist through Tampermonkey storage. When disabled, no heartbeat should be sent.

The heartbeat should be small and sent frequently only while the watchdog is enabled, for example every 250-500 ms while logged in and every 150-250 ms during active combat. It should use a short timeout and should not wait for combat log queue flushing.

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
2. If the direct leave response is a Cloudflare challenge and Clash validation is currently passing, call the Clash REST API from the Node watchdog and retry direct leave once after the switch.
3. If the page heartbeat later resumes, let the userscript observe pending exit state and avoid re-entering unsafe combat.

The watchdog should not close or reload the browser as part of this design. Direct game leave is the safety action.

## Direct Leave Plan

The watchdog is only useful as a safety boundary if it can issue leave without page JavaScript. The first implementation must therefore add a service-side `leaveClient` to `combat-log-service`.

Requirements:

- The direct leave endpoint, method, request body, and authentication method must be verified against the live game before active rescue is enabled.
- The userscript should send the latest leave authentication/request descriptor to `/watchdog/heartbeat` while the page is healthy.
- If the game leave request can be authenticated with `tmpGameSessionToken`, the heartbeat can provide a short-lived token snapshot to the local service.
- If the game leave request hits a Cloudflare challenge from Node, the watchdog should treat that as a response-time rescue condition and use validated Clash switching before retrying.
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
  -> if response is Cloudflare-blocked, call Clash rescue only if validated
  -> after a successful Clash switch, retry sendDirectLeave once with stage after-clash
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

If validation fails, Clash rescue should be disabled automatically for that runtime session and the reason should be visible in status/log output. A failed validation must not block or delay the first direct game leave request. In the emergency path, direct leave remains the primary action, and proxy rescue runs only after a Cloudflare-blocked response.

## Development Commit Plan

Implement this feature in narrow commits. Each commit should leave the tree in a working state, keep active rescue disabled unless explicitly stated, and include the validation listed for that commit. Commits that touch browser runtime or bootstrap behavior must also rebuild the remote bot and update release/handoff docs according to the project release flow.

### Commit 1: Service Watchdog Skeleton

Purpose: add the local service surface without changing browser behavior or triggering rescue.

Implement:

- Add a `combat-log-service/watchdog.js` module or similarly scoped server-side owner.
- Add disabled-by-default watchdog defaults to `combat-log-service/server.js` options.
- Add `GET /watchdog/status`.
- Add `POST /watchdog/config` for local-only config updates.
- Return `enabled: false`, `activeRescueEnabled: false`, and empty state by default.
- Do not add heartbeat sending from the browser yet.
- Do not send leave requests or Clash requests.

Files likely touched:

- `combat-log-service/server.js`
- `combat-log-service/watchdog.js`
- `combat-log-service/README.md`
- `docs/agent/combat-logging.md`

Validation:

- `cd combat-log-service && npm test`
- `node combat-log-service/server.js --self-test`
- Manual smoke with `GET /health`, `GET /watchdog/status`, and `POST /watchdog/config`.

Done when:

- Existing `/combat-log` behavior is unchanged.
- Watchdog endpoints exist and are inert while disabled.
- Service status clearly reports disabled watchdog state.

### Commit 2: Heartbeat Ingest And State Model

Purpose: make the service able to receive heartbeat data, normalize it, and expose it without rescue logic.

Implement:

- Add `POST /watchdog/heartbeat`.
- Reject oversized or malformed heartbeat payloads with JSON errors.
- Normalize `pageId`, `userId`, `sequence`, `combatActive`, `damagedInCombat`, `self`, `target`, `decision`, `control`, `runtime`, and `leaveAuth`.
- Maintain in-memory state keyed by `pageId` plus `userId` when available.
- Track Node receive time separately from page timestamp.
- Track heartbeat age, sequence gaps, last combat-active time, last damaged-combat time, and current direct-leave readiness.
- Keep all secret-bearing data in memory only.
- Keep rescue disabled even when high-risk stale state is present.

Files likely touched:

- `combat-log-service/server.js`
- `combat-log-service/watchdog.js`
- `combat-log-service/README.md`

Validation:

- `cd combat-log-service && npm test`
- Add self-test cases for valid heartbeat, malformed heartbeat, state replacement, and disabled state.
- Manual `curl` or PowerShell POST to `/watchdog/heartbeat`, then verify `/watchdog/status`.

Done when:

- A synthetic heartbeat updates state.
- Heartbeat state never appears in ordinary combat JSONL.
- No rescue action can happen from heartbeat ingestion alone.

### Commit 3: Userscript Watchdog Configuration

Purpose: add opt-in browser-side configuration, still without sending heartbeat by default.

Implement:

- Add `configureWatchdog(options)` to the Tampermonkey bootstrap API.
- Persist `watchdogEnabled`, `watchdogEndpoint`, and initial heartbeat interval settings with `GM_setValue`.
- Mirror the same user-facing configuration path in the extension bootstrap if that surface is still maintained.
- Default `watchdogEnabled` to `false`.
- Add status/panel visibility for whether watchdog is disabled, enabled, or misconfigured.
- Do not send heartbeat until the user enables watchdog.

Files likely touched:

- `userscript/grasp-rat-bootstrap.user.js`
- `extension/page-bootstrap.js`
- `src/browser/runtime/bot-api-runtime.js` if status needs runtime exposure
- `docs/agent/config-defaults.md`
- `docs/agent/combat-logging.md`

Validation:

- `node --check userscript/grasp-rat-bootstrap.user.js`
- `node --check extension/page-bootstrap.js`
- Runtime/browser validation surface required by the release flow.
- Build remote bot if runtime or generated outputs are touched.

Done when:

- Console configuration can enable/disable watchdog settings.
- Disabled watchdog sends no network traffic.
- Existing combat logging config remains unchanged.

### Commit 4: Non-Batched Browser Heartbeat Sender

Purpose: send fresh watchdog heartbeat directly to the service only when explicitly enabled.

Implement:

- Add a heartbeat sender that bypasses the combat-log queue.
- Use short request timeouts and avoid blocking combat ticks.
- Send lower-frequency heartbeat while logged in and higher-frequency heartbeat during combat.
- Include current state fields from the plan: user id, HP, combat-active flag, damage flag, target summary, decision reason, pending-exit state, visibility, control state, and runtime tick timing.
- Include only non-secret `leaveAuth.available` / readiness fields until direct leave descriptor handling is implemented.
- Track heartbeat send success/failure counters in status.
- Stop sending immediately when watchdog is disabled.

Files likely touched:

- `userscript/grasp-rat-bootstrap.user.js`
- `src/browser/runtime/combat-log-runtime.js` or a new focused runtime owner if heartbeat is runtime-owned
- `src/browser/runtime/combat-log-frame-runtime.js` only if reusing frame summaries is appropriate
- `extension/page-bootstrap.js`
- `docs/agent/combat-logging.md`

Validation:

- Browser/runtime self-tests required by the touched surface.
- `cd combat-log-service && npm test`
- Manual enable command:

```js
window.__graspRatBotBootstrap.configureWatchdog({
  enabled: true,
  endpoint: 'http://127.0.0.1:18765/watchdog/heartbeat'
})
```

- Verify `/watchdog/status` shows fresh heartbeat age while enabled.
- Disable watchdog and verify heartbeat age stops updating because no new POSTs arrive.

Done when:

- Heartbeat is fresh under normal play.
- Heartbeat traffic is independent of combat-log queue flushing.
- No active rescue action exists.

### Commit 5: Watchdog Audit Logging And Dry-Run Detector

Purpose: make the service decide when it would rescue, but only log dry-run decisions.

Implement:

- Add service-side stale heartbeat detection interval.
- Add configurable thresholds: `heartbeatStaleMs`, `combatHeartbeatStaleMs`, `damagedCombatStaleMs`, and HP threshold.
- Add high-risk state function based on combat active, damaged-in-combat, HP, target recency, and heartbeat age.
- Add dry-run audit events: `watchdog-would-rescue`, `watchdog-state-change`, and `watchdog-disabled`.
- Write watchdog audit JSONL under the daily audit layout.
- Add duplicate suppression so the same stale window does not spam logs.
- Keep `activeRescueEnabled` default false.

Files likely touched:

- `combat-log-service/watchdog.js`
- `combat-log-service/server.js`
- `combat-log-service/README.md`
- `docs/agent/combat-logging.md`

Validation:

- `cd combat-log-service && npm test`
- Add synthetic timer/self-test cases for no combat, combat without damage, damaged combat stale heartbeat, duplicate suppression, and recovery after fresh heartbeat.
- Replay recent death windows by feeding synthetic heartbeats matching known timings and checking dry-run audit output.

Done when:

- The service logs exactly when it would have rescued in high-risk stale-heartbeat cases.
- No leave or Clash call can happen yet.

### Commit 6: Service-Side Clash Client And Validation

Purpose: move Clash validation/rescue capability into Node without allowing it to delay direct leave.

Implement:

- Add service-side Clash config: controller URL, secret, proxy group, auto/manual/direct proxy names, timeout.
- Add startup and config-change validation that performs harmless authenticated reads.
- Add `POST /watchdog/test-clash`.
- Preserve exact secret strings, including backslashes, without JavaScript console escape corruption when configured through JSON/config files.
- Mark Clash rescue unavailable when validation fails.
- Do not switch proxy from watchdog stale-heartbeat detection yet.

Files likely touched:

- `combat-log-service/watchdog.js`
- `combat-log-service/server.js`
- `combat-log-service/README.md`
- `docs/agent/config-defaults.md`

Validation:

- `cd combat-log-service && npm test`
- Manual validation with a known-good Clash secret containing a backslash.
- Manual validation with bad secret should produce a clear disabled reason and no retry loop.

Done when:

- Clash readiness is visible in `/watchdog/status`.
- Invalid Clash configuration disables Clash rescue before combat.
- No proxy switch occurs during stale-heartbeat dry-run.

### Commit 7: Direct Leave Descriptor Plumbing

Purpose: identify and transport enough leave information for Node to know whether direct leave is possible.

Implement:

- Verify the live game leave endpoint, method, request body, and authentication source in a controlled session.
- Define `leaveAuth` / `leaveDescriptor` schema for the heartbeat.
- Add browser-side collection of the minimum direct-leave descriptor while the page is healthy.
- Send descriptor only when watchdog is enabled.
- Keep descriptor in service memory with a short TTL.
- Expose `directLeaveReady`, descriptor age, and missing fields in `/watchdog/status`.
- Do not write tokens/cookies to ordinary logs.
- Do not send active leave from stale-heartbeat detection yet.

Files likely touched:

- `userscript/grasp-rat-bootstrap.user.js`
- `src/browser/runtime/*` owner that can read session/user state safely
- `combat-log-service/watchdog.js`
- `docs/agent/data-model.md`
- `docs/agent/combat-logging.md`

Validation:

- Runtime validation required by touched browser files.
- `cd combat-log-service && npm test`
- Manual status check confirms `directLeaveReady=true` only when the descriptor is fresh and complete.
- Manual logout/login confirms stale descriptors expire.

Done when:

- The service can tell whether it has enough information to call direct leave.
- Missing or expired leave information is explicit and auditable.

### Commit 8: Direct Leave Client In Manual-Test Mode

Purpose: implement the Node leave client and validate it only through explicit manual test commands.

Implement:

- Add `sendDirectLeave(userId, leaveDescriptor)` in `combat-log-service`.
- Add a manual-only `POST /watchdog/test-leave` endpoint or equivalent guarded command.
- Require an explicit `confirm: true` or similarly hard-to-trigger field for manual test leave.
- Record request timestamp, duration, HTTP status, response summary, and error.
- Redact credentials from logs and status.
- Do not connect this client to stale-heartbeat rescue yet.

Files likely touched:

- `combat-log-service/watchdog.js`
- `combat-log-service/server.js`
- `combat-log-service/README.md`

Validation:

- `cd combat-log-service && npm test`
- Unit/self-test for request construction, timeout, redaction, and failure reporting.
- Controlled live test in a low-risk session proving Node can make the game leave successfully.

Done when:

- A manual local command can make the game leave through Node.
- Failure modes are clear enough to debug without exposing credentials.

### Commit 9: Active Direct-Leave Rescue

Purpose: enable the actual safety behavior, guarded by explicit user configuration and direct leave readiness.

Implement:

- Add `activeRescueEnabled`, default `false`.
- Require both watchdog enabled and active rescue enabled before automatic leave.
- On high-risk stale heartbeat, send direct leave immediately if `directLeaveReady=true`.
- Log `watchdog-rescue-start`, `watchdog-direct-leave-request`, and `watchdog-rescue-result`.
- If direct leave is not ready, log `direct-leave-not-ready` and do not pretend rescue was available.
- Add duplicate suppression per stale window/rescue id.
- Do not run Clash before direct leave.

Files likely touched:

- `combat-log-service/watchdog.js`
- `combat-log-service/server.js`
- `combat-log-service/README.md`
- `docs/agent/strategy-summary.md` if user-visible behavior is now active
- `docs/agent/config-defaults.md`

Validation:

- `cd combat-log-service && npm test`
- Synthetic stale-heartbeat self-test proving direct leave is called once within threshold.
- Controlled live test where a deliberately induced stale heartbeat causes Node direct leave.
- Verify direct leave request timestamp precedes any Clash operation.

Done when:

- Active rescue can be manually enabled.
- High-risk stale heartbeat triggers Node direct leave without page JavaScript.
- The feature remains off unless explicitly configured.

### Commit 10: Clash Rescue After Cloudflare Block

Purpose: allow validated proxy rescue for Cloudflare-blocked direct leave without ever delaying the first direct request.

Implement:

- If direct leave returns a Cloudflare challenge and Clash validation is passing, start Clash switch and then retry direct leave with stage `after-clash`.
- Ensure direct leave request is created before awaiting any Clash operation.
- Log `watchdog-clash-rescue-request` and result.
- If Clash validation is failing, skip Clash and include the validation failure reason in rescue audit.
- Add per-rescue and per-stage duplicate suppression.

Files likely touched:

- `combat-log-service/watchdog.js`
- `combat-log-service/README.md`
- `docs/agent/strategy-summary.md`

Validation:

- `cd combat-log-service && npm test`
- Synthetic test proving direct leave is not delayed by slow Clash request.
- Manual test with valid Clash config and with invalid secret.

Done when:

- Valid Clash rescue can run as a secondary action.
- Invalid Clash configuration is visible but does not block direct leave.

### Commit 11: Exit Confirmation And Retry Policy

Purpose: make rescue state robust after the first direct leave request.

Implement:

- Add exit confirmation state from later heartbeat, page-side exit audit, direct leave success response, or safe authenticated status endpoint when available.
- Add retry policy for uncertain direct leave result: bounded attempts, conservative backoff, and credential-expiry stop condition.
- Add status fields for rescue active/completed/failed/confirmed.
- Clear or age out stale rescue state after confirmation or timeout.
- Ensure a later page heartbeat cannot accidentally re-enter unsafe combat before the pending exit state is visible.

Files likely touched:

- `combat-log-service/watchdog.js`
- `src/browser/runtime/*` if page heartbeat needs to report post-rescue pending state
- `docs/agent/combat-logging.md`

Validation:

- `cd combat-log-service && npm test`
- Synthetic tests for success confirmation, timeout retry, credential expiry, duplicate heartbeat recovery, and no retry after confirmation.
- Controlled live test where direct leave confirmation is observed.

Done when:

- Rescue attempts have clear lifecycle state.
- Uncertain direct leave responses get limited retries.
- Confirmed exits stop retries.

### Commit 12: Operator UX And Release Hardening

Purpose: make the feature practical to operate day to day.

Implement:

- Add clear README commands for enabling, disabling, status, dry-run, active rescue, Clash test, and manual leave test.
- Add panel/status indicators for watchdog enabled, heartbeat age, dry-run/active mode, direct leave readiness, and Clash readiness.
- Add startup config validation and clear console output.
- Add optional Windows start script or service instructions for `combat-log-service`.
- Update tracked handoff docs.
- Keep `AGENTS.md` untouched unless explicitly requested.

Files likely touched:

- `combat-log-service/README.md`
- `docs/agent/combat-logging.md`
- `docs/agent/config-defaults.md`
- `docs/agent/current-state.md` when a remote bot release is made
- `userscript/`, `extension/`, `dist/` if panel/status behavior changes

Validation:

- Full validation required for browser/runtime release if generated outputs change.
- `cd combat-log-service && npm test`
- `git diff --check`
- Manual operator walkthrough: enable dry-run, observe heartbeat, enable active rescue, disable watchdog.

Done when:

- The feature can be safely run without remembering internal endpoint details.
- The default state is still disabled.
- The user can see why rescue is or is not armed.

## Cross-Commit Release Rules

- Never enable active rescue in the same commit that first introduces an unvalidated leave client.
- When a ready descriptor exists, direct leave is attempted before Clash; Cloudflare-blocked direct leave is the trigger for Clash rescue plus one post-Clash retry.
- Never log raw tokens, cookies, Authorization headers, or full credential descriptors.
- Every code commit must preserve existing combat-log collection.
- Every browser/runtime behavior commit must follow the remote build and release documentation flow.
- Every combat-logic change, if any is made while implementing watchdog state, must be validated with offline replay. The watchdog itself should avoid changing combat policy.

## Validation

2026-07-07 live validation result:

- The live direct game leave endpoint is `GET https://grasp-rat-game.h-e.top/leave?user_id=${userId}&token=${sessionToken}` with no request body.
- `tmpGameSessionToken` is necessary direct-leave auth evidence. A Node request with only the token can be blocked by Cloudflare 403.
- The service no longer configures browser clearance cookies as descriptor requirements. It detects Cloudflare challenge responses, records `cloudflareBlocked`, runs validated Clash rescue, and retries direct leave once with stage `after-clash`.
- If Clash is enabled but validation fails, the service records `clash-validation-failed` and does not send the post-Clash retry.
- The service suppresses repeated rescues for the same stale heartbeat window until a new heartbeat sequence/receive time opens a new window.

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
- In high-risk combat with a ready descriptor, the watchdog attempts direct leave within the configured threshold.
- Cloudflare-blocked direct leave triggers validated Clash rescue before the `after-clash` retry.
- Clash authentication problems are detected before combat.
- All rescue attempts are logged with enough timing detail to reconstruct the decision.

## Open Questions

- Answered: the primary direct leave path is `GET /leave?user_id=${userId}&token=${sessionToken}` on `https://grasp-rat-game.h-e.top`.
- Answered: direct leave uses `tmpGameSessionToken` as the service-side auth evidence; browser Cloudflare clearance is not configured. Cloudflare challenge responses are handled by Clash IP switching and one post-Clash retry.
- Descriptor plumbing supports configured templates and runtime token material. For the current live game, do not add browser clearance-cookie requirements to direct-leave readiness.
- Should hidden/frozen visibility during active damaged combat trigger immediate leave, or only lower the heartbeat stall threshold?
- What HP/damage threshold should count as high risk for watchdog policy?
- Answered for ordering: ready direct leave is attempted first; validated Clash runs only after a Cloudflare-blocked direct-leave response, then the service retries direct leave with stage `after-clash`.
