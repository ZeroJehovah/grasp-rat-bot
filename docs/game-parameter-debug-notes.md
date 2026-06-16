# Game Parameter Debug Notes

Last updated: 2026-06-17

This document records the live CDP debug setup and measured game parameters for `https://grasp-rat-game.h-e.top/`.

## CDP Debug Chain

Goal: use the pre-Tampermonkey CDP debugging approach without injecting `window.__graspRatBot` or starting the monitor.

Current working chain:

1. Start Chrome on Windows with a non-excluded DevTools port:

   ```powershell
   $profile="$env:LOCALAPPDATA\GraspRatDebugChrome9444"
   New-Item -ItemType Directory -Force -Path $profile | Out-Null
   & "C:\Program Files\Google\Chrome\Application\chrome.exe" `
     --remote-debugging-address=0.0.0.0 `
     --remote-debugging-port=9444 `
     --remote-allow-origins=* `
     --user-data-dir="$profile" `
     --no-first-run `
     --no-default-browser-check `
     --new-window `
     "https://grasp-rat-game.h-e.top/"
   ```

2. In an elevated Windows PowerShell, expose the Chrome loopback CDP port to WSL:

   ```powershell
   netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=9445
   netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=9445 connectaddress=127.0.0.1 connectport=9444
   netsh interface portproxy show all
   ```

3. From WSL, use:

   ```bash
   curl http://172.24.0.1:9445/json/version
   curl http://172.24.0.1:9445/json/list
   ```

Verified endpoint:

```text
http://172.24.0.1:9445
```

Verified Chrome CDP version:

```text
Chrome/149.0.7827.54
Protocol-Version: 1.3
```

Verified game target:

```text
title: 囤囤鼠历险记
url: https://grasp-rat-game.h-e.top/
```

## Next-Time Workflow

Use this exact flow for future live validation so the CDP connection does not need to be rediscovered:

1. The user starts Chrome on Windows with remote debugging enabled on a port that is actually free. If `9222` is blocked by excluded TCP ranges, pick another free high port.
2. The user adds or confirms a Windows `netsh interface portproxy` from the Chrome loopback port to a WSL-reachable bridge port.
3. The user keeps the game tab open on `https://grasp-rat-game.h-e.top/` and tells the agent the bridge URL.
4. The agent verifies the bridge from WSL:

   ```bash
   curl http://<bridge-host>:<bridge-port>/json/version
   curl http://<bridge-host>:<bridge-port>/json/list
   ```

5. The agent selects the game page and runs short, one-shot CDP `Runtime.evaluate` probes.
6. If the game exits unexpectedly or nearby danger appears, pause validation until the user explicitly resumes it.

User side:

- Start Chrome.
- Create or confirm the portproxy.
- Leave the game page open.
- Watch the screen and tell the agent to stop if the session exits or becomes unsafe.

Agent side:

- Read the CDP endpoints.
- Pick the game tab.
- Run only short read-only probes unless the user explicitly approves movement or another active test.
- Avoid starting `grasp-rat-bot.js` or `grasp-rat-monitor.js` for this validation path.

Known good bridge examples from this machine:

- Windows Chrome on `127.0.0.1:9444` bridged to WSL on `172.24.0.1:9445`.
- A later working bridge used the same pattern with `9222` on Windows forwarded to a higher WSL-facing port.

Notes from setup:

- Ports `9222`, `9224`, `9226`, and `9333` failed because Windows had TCP excluded port ranges covering them.
- Confirmed with:

  ```powershell
  netsh interface ipv4 show excludedportrange protocol=tcp
  netsh interface ipv6 show excludedportrange protocol=tcp
  ```

- Relevant excluded ranges observed:

  ```text
  9133-9232
  9233-9332
  9333-9432
  ```

- Chrome log for an excluded port showed:

  ```text
  bind() returned an error ... (0x271D)
  Cannot start http server for devtools.
  ```

- Chrome on `127.0.0.1:9444` worked, but WSL could not reach Chrome loopback directly. The stable bridge is `netsh interface portproxy` from `0.0.0.0:9445` to `127.0.0.1:9444`.

## Current Safety Constraints

- Do not run `node grasp-rat-bot.js` for this investigation.
- Do not inject `window.__graspRatBot`.
- Do not start `grasp-rat-monitor.js`.
- Use short, one-shot CDP `Runtime.evaluate` probes only.
- Movement and shooting tests should be deliberate and temporary after manual login.
- The user will manually leave the game if danger appears.

## Initial Page State

Captured before manual login:

```text
window.__graspRatBot: absent
window.__graspRatBotBootstrap: absent
window.__graspRatBotTampermonkeyBootstrapPresent: absent
localStorage: empty
state.currentUserId: 0
state.sessionToken: empty
getOwnEntity(): null
state.wsOpen: false
state.ws: null
state.serverTickMs: 50
state.renderDelayMs: 100
state.viewRadiusCm: 10000
state.minimap.worldRadiusCm: 1000000
```

Available page functions include:

```text
connectWs
scheduleReconnect
sendVelocity
shoot
shootBurst
getOwnEntity
getRenderEntities
getRenderCoinDrops
getRenderBullets
applySnapshot
applyPositionUpdate
trackOwnBullet
reconcileOwnBullets
formatStamina
updateStaminaText
leave
```

## Parameters Found So Far

These are source-level observations from page functions before manual login.

### Tick And Render

```text
serverTickMs = 50 ms
renderDelayMs = 100 ms
viewRadiusCm = 10000 cm
minimap.worldRadiusCm = 1000000 cm
WORLD_RADIUS_CM = 1000000 cm
DEFAULT_VIEW_RADIUS_CM = 10000 cm
ACTIVE_VIEW_RADIUS_CM = 50000 cm
CELL_SIZE_CM = 1000 cm
WS_STALE_MS = 3500 ms
```

### Stamina Display And Exhaustion

`updateStaminaText()` reads stamina from the current own entity:

```text
stamina_5s_remaining_milli
stamina_1h_remaining_milli
stamina_1d_remaining_milli
stamina_5s_limit_milli
stamina_1h_limit_milli
stamina_1d_limit_milli
```

Default display limits in page code:

```text
5s limit default: 10000 ms = 10
1h limit default: 3000000 ms = 3000
1d limit default: 20000000 ms = 20000
```

The page marks a bucket exhausted when remaining milli is below `1000`:

```text
remaining < 1000 => exhausted
```

The visible warning text is:

```text
5s/1h/1d体力限制已达，你将无法移动和攻击
```

Logged-in sample for user `28886` / `文月`:

```text
current_join_mode: Active
life: Alive
hp: 100/100
stamina_5s_remaining_milli: 10000
stamina_1h_remaining_milli: 2961424
stamina_1d_remaining_milli: 19961424
stamina_5s_limit_milli: 10000
stamina_1h_limit_milli: 3000000
stamina_1d_limit_milli: 20000000
coins: 1000
death_drop_coins / death_reward_preview: 124
death_loss_preview: 62
daily_budget_day_key_utc8: 20614
```

Confirmed after login:

```text
state.wsOpen: true
state.ws.readyState: 1
state.currentUserId: 28886
localStorage.tmpGameUserId: 28886
localStorage.tmpGameSessionToken: present
```

Nearest observed Active in the first logged-in sample was about `39967 cm`, so no immediate close-range threat was present at that instant.

### Movement Command Path

`computeVelocity()` returns `dx` and `dy` in the range `[-1, 1]`, based on keyboard/touch state.

`sendVelocity(force = false)`:

```text
minimum non-forced send interval: 100 ms
command format: vel <dx> <dy>
uses state.ws.send(...) when state.wsOpen && state.ws
calls scheduleReconnect() when websocket is offline
```

Source constants:

```text
PLAYER_SPEED_PER_TICK = 50 cm/tick
PLAYER_DIAGONAL_SPEED_PER_TICK = 35 cm/tick per axis
SERVER_TICK_MS = 50 ms
```

Measured movement:

```text
Cardinal movement: vx or vy = 50 cm/tick = 1000 cm/s = 10 m/s
Diagonal movement: vx = 35 and vy = 35 cm/tick
Diagonal combined speed: sqrt(35^2 + 35^2) = 49.5 cm/tick ~= 9.9 m/s
```

A single `vel 1 0` command only moved one small server step in testing. Sustained movement requires repeated `vel` commands. Sending roughly every `100 ms` produced continuous movement.

Observed movement stamina cost:

```text
Cardinal repeated movement test: roughly 600 ms stamina consumed over the accepted movement window.
Diagonal repeated movement test: stamina dropped from 10000 to 8824 after the movement plus stop-lag window.
```

Controlled cardinal movement test on 2026-06-10:

```text
start position: x=-91891, y=221646
commanded: repeated vel 1 0 for about 800 ms, then repeated vel 0 0
first observed server velocity: 325 ms after first vel 1 0
first observed position change: 376 ms after first vel 1 0
stop commands sent from 842 ms to 1058 ms after start
first observed server stop: 1167 ms after start
first observed stop after first stop command: about 325 ms
first observed stop after last repeated stop command: about 109 ms
final position: x=-91041, y=221646
final displacement: 850 cm = 8.5 m
observed server velocity while moving: vx=50, vy=0
stamina delta: 5s=-850, 1h=-850, 1d=-850
```

Interpretation:

```text
Movement consumes all three stamina buckets at about 1 ms stamina per 1 ms of accepted movement.
Short control pulses should account for roughly 300 ms start/stop observation latency in this CDP/page path.
```

### Shooting Command Path

`shoot()`:

```text
command format: shoot <pointerWorld.x> <pointerWorld.y> <startX> <startY>
start position comes from state.localVisual or current render entity
uses state.ws.send(...) when state.wsOpen && state.ws
```

`shootBurst(count)`:

```text
fires count shots with 100 ms spacing
```

Source constants and live bullet fields:

```text
BULLET_RANGE_CM = 15000 cm = 150 m
BULLET_SPEED_PER_TICK = 500 cm/tick
BULLET_HIT_RADIUS_CM = 90 cm
expire_tick - created_tick = 30 ticks
bullet lifetime = 30 * 50 ms = 1500 ms
bullet speed = 500 cm/tick / 50 ms = 10000 cm/s = 100 m/s
```

Observed successful `shoot_ok` bullet:

```text
range_cm: 15000
speed_per_tick: 500
dir_x_micros / dir_y_micros: direction unit vector scaled by 1,000,000
created_tick and expire_tick are included in the server response
```

Observed shooting stamina cost:

```text
Each successful shot consumes 500 ms from all three stamina buckets.
Example: two successful shots at 50 ms request spacing reduced 5s stamina from 10000 to 9000, and 1h/1d by the same 1000 ms.
```

Controlled firing test on 2026-06-10:

```text
target: 小趴菜FFF / 27201
target mode: Passive
target distance: 14823 cm
target HP before: 100
target HP after: 86
shoot requests sent: 5
own stamina before: 5s=10000, 1h=2437734, 1d=19437734
own stamina after: 5s=7500, 1h=2435234, 1d=19435234
stamina delta: 5s=-2500, 1h=-2500, 1d=-2500
inferred accepted shots from stamina: 5
damage observed: 14 HP over 5 accepted shots
average observed damage: 2.8 HP/shot
```

The page's `state.ownBullets` only exposed three new own bullets during that test even though stamina and HP show five successful shots. Treat `state.ownBullets` as useful for bullet fields but not always complete for counting recently accepted shots if it is sampled late or around expiry.

Observed own bullet fields from that test:

```text
bullet_id: 135825
owner_user_id: 28886
start_x: -91891
start_y: 221646
target_x: -83700
target_y: 234000
dir_x_micros: 552596
dir_y_micros: 833448
range_cm: 15000
speed_per_tick: 500
created_tick: 4739661
expire_tick: 4739691
```

Observed firing rate behavior:

```text
100 ms request spacing: server accepted repeated shots until 5s stamina was exhausted.
50 ms request spacing: server accepted some shots and returned shoot_failed: "shoot cooldown" for intermediate requests.
Accepted 50 ms test example: shot at created_tick 4722373, cooldown failures, next accepted shot at created_tick 4722376.
Approximate lower bound from that sample: 3 ticks = 150 ms between accepted shots.
2026-06-10 controlled test: requests spaced around 137-141 ms caused 5 inferred accepted shots.
Observed own-bullet created_tick gaps in that test: 2 ticks and 3 ticks among visible bullets.
```

Because 50 ms requests can still hit server cooldown, the practical safe request interval should include margin. The live data so far supports a minimum accepted cadence in the `100-150 ms` range, depending on server timing and observation lag.

### WebSocket Reconnect

`scheduleReconnect()`:

```text
reconnect delay: 1200 ms
calls connectWs(state.currentUserId)
```

### Coin Drop Fields

Coin drops are present in the one-second authoritative WS snapshot as `coin_drops`; 20fps position frames reuse the last snapshot coin list.

Observed coin object fields:

```text
drop_id
x
y
amount
created_tick
source_user_id
system_spawned
```

Nearest coin check on 2026-06-10:

```text
own position: x=-91041, y=221646
nearest coin: drop_id=9725, amount=1, x=-37234, y=89829
nearest coin distance: 142376 cm = 1423.76 m
```

The page frontend only exposes coin drawing and list fields. It does not expose a client-side pickup radius constant, so coin pickup radius remains a server-side behavior to measure when a safe nearby coin exists.

## Combat And Bullet-Dodge Parameters

These are the parameters needed for precise combat dodging. This section is parameter discovery only; it does not describe or change bot strategy.

### Bullet Physics

Source constants and render code show:

```text
BULLET_RANGE_CM = 15000 cm
BULLET_SPEED_PER_TICK = 500 cm/tick
BULLET_HIT_RADIUS_CM = 90 cm
SERVER_TICK_MS = 50 ms
state.renderDelayMs = 100 ms
```

Derived values:

```text
bullet speed = 500 cm / 50 ms = 10000 cm/s = 100 m/s
bullet lifetime = 15000 / 500 = 30 ticks = 1500 ms
server hit radius constant = 90 cm
render position intentionally lags server time by 100 ms
```

Bullet position used by the page renderer:

```text
nowTick = bullet.local_now_tick ?? getRenderTick()
age = max(0, nowTick - bullet.created_tick)
travelled = min(range_cm, age * speed_per_tick)
dirX = dir_x_micros / 1000000
dirY = dir_y_micros / 1000000
headX = start_x + dirX * travelled
headY = start_y + dirY * travelled
```

The renderer adds a visual-only lane offset:

```text
lane = ((bullet_id % 5) - 2) * 3 cm
offsetX = -dirY * lane
offsetY = dirX * lane
```

This offset is for drawing only and should not be treated as server collision geometry unless later proven otherwise.

### Entity Position And Render Delay

The page keeps up to eight recent snapshots:

```text
snapshot.serverMs = snapshot.tick * state.serverTickMs
snapshot.receivedAt = performance.now()
renderMs = latest.serverMs + (performance.now() - latest.receivedAt) - state.renderDelayMs
```

Other players are interpolated between snapshots when possible. If only the latest snapshot is available, the page predicts up to `450 ms` ahead from `latestEntity.x/y + vx/vy * ticks`.

The own player has an additional local visual predictor:

```text
dtTicks = clamp((now - state.localVisual.lastAt) / 50ms, 0, 3)
cardinal local speed = 50 cm/tick
diagonal local speed = 35 cm/tick per axis
moving correction when server is ahead = 0.08
stop correction starts after LOCAL_SETTLE_AFTER_STOP_MS = 3000 ms
large error snap threshold = 1200 cm
```

For dodge measurement, native `state.entities` and `state.bullets` are the safer server-side source. `getRenderEntities()` and `getRenderBullets()` are useful for visual prediction but include display smoothing and render delay.

### Incoming Bullet Fields

Observed own and enemy bullets share the same fields:

```text
bullet_id
owner_user_id
start_x
start_y
target_x
target_y
dir_x_micros
dir_y_micros
range_cm
speed_per_tick
created_tick
expire_tick
```

Observed hostile bullet sample during an unsafe chase:

```text
self: user_id 28886 / 文月
self hp: 88
self position: x=-96235, y=106092
nearest Active: Xihalele / 21022
nearest Active distance: 13431 cm = 134.31 m
nearest Active hp: 79
nearest Active velocity: vx=-35, vy=35 cm/tick

hostile bullet 135279:
  owner_user_id: 21022
  estimated render head: x=-95352, y=105171
  distance to self: 1276 cm = 12.76 m

hostile bullet 135281:
  owner_user_id: 21022
  estimated render head: x=-98611, y=92926
  distance to self: 13379 cm = 133.79 m
```

This was a real danger state. The active movement/shooting test was aborted immediately. No shot was fired in this aborted test.

Passive enemy-bullet observation on 2026-06-10:

```text
duration: about 15.4 s
own position: x=-91041, y=221646
own hp: 100
own velocity: vx=0, vy=0
unique hostile bullets observed: 0
nearest Active observed during this window: none
```

No safe enemy firing cadence sample was available in this observation window. Enemy shot interval still needs a real combat sample.

### Dodge Timing Implications

A bullet at distance `d` cm from the player has approximate time-to-arrival:

```text
time_ms ~= d / 10000 cm/s * 1000
```

Examples:

```text
15000 cm: 1500 ms
5000 cm: 500 ms
1276 cm: 128 ms
```

One server movement tick changes player position by about:

```text
cardinal: 50 cm per 50 ms
diagonal: 35 cm per axis per 50 ms
```

Crossing only the server hit radius of `90 cm` takes roughly two cardinal ticks (`100 ms`) before network/control latency. Therefore precise dodging needs early detection, preferably while bullet projection is still several hundred milliseconds away, not when the bullet is already within a few meters.

### Shooting Damage And Kill Estimate

Measured hit against Passive target `空灵` / `29522`:

```text
target distance at shot: about 14936 cm
target HP before hit: 100
target HP after hit: 97
damage per hit observed: 3 HP
```

Current best estimate:

```text
single-hit estimate: ceil(100 / 3) = 34 successful hits
five-shot average estimate: ceil(100 / 2.8) = 36 successful hits
estimated stamina cost: 34-36 * 500 ms = 17000-18000 ms from each stamina bucket
```

This is inferred from one clean single-hit sample and one five-shot sample. A full live kill test has not been performed because it is riskier and expensive in daily stamina.

### Aborted Controlled Test 2026-06-10 01:49 CST

A planned three-shot confirmation test was not executed because the page was already unsafe:

```text
self hp: 88
self velocity: vx=-50, vy=0
self stamina: 5s=5569, 1h=2694197, 1d=19694197
nearest Active: Xihalele / 21022
nearest Active distance: 13431 cm
hostile bullets within 300m: yes
abort reason: own hp below safety threshold and Active within 300m
```

Result:

```text
movement commands: none beyond repeated stop commands
shots fired: 0
test status: aborted for safety
```

## Remaining Parameters

Measured or source-confirmed:

- Own entity stamina field values and limits.
- Actual movement speed for cardinal and diagonal movement.
- Diagonal speed normalization.
- Movement stamina cost.
- Movement start/stop observation latency through this CDP/page path.
- Bullet fields after shooting: `speed_per_tick`, `range_cm`, `created_tick`, `expire_tick`, `dir_x_micros`, `dir_y_micros`, `owner_user_id`, `bullet_id`.
- Bullet travel speed, range, and lifetime.
- Source hit radius constant.
- Shooting stamina cost.
- Damage per shot estimate and 100 HP kill-shot estimate.
- Coin drop field schema.

Still not safely measured:

- Enemy firing cadence from a real combat sample.
- Coin pickup radius / confirmation threshold.
- Whether movement/attack are blocked separately when each stamina bucket drops below `1000`.
- Exact server-side hit geometry beyond the `BULLET_HIT_RADIUS_CM = 90` source constant.
