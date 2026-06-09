# Grasp Rat Bot

This repository contains the browser-side automation scripts for `https://grasp-rat-game.h-e.top/`.

The primary runtime is now Tampermonkey-based:

- `userscript/grasp-rat-bootstrap.user.js` is script A. Install it in the user's normal Chrome. It checks the manifest every second, verifies the remote bot hash, injects the bot, and hot-updates without stopping a working old bot when download or verification fails.
- `dist/grasp-rat-remote-bot.js` is script B. It contains the game strategy and native page WebSocket control.
- `dist/manifest.json` points A at B and includes the SHA-256 hash A must verify before injection.
- `grasp-rat-debug-api.js` is a local WSL debug/development API. It receives browser debug events and can serve local `dist/` files for development.

The older CDP entry points remain available in `grasp-rat-bot.js` as a fallback, but normal use should prefer Tampermonkey injection.

## Install Script A

1. Install Tampermonkey in normal Chrome.
2. Open `userscript/grasp-rat-bootstrap.user.js` and install it.
3. Open `https://grasp-rat-game.h-e.top/` in normal Chrome.

If an older bootstrap is already installed, update or reinstall script A to at least `0.4.0`. Earlier `0.3.x` source changes accidentally kept the Tampermonkey metadata version at `0.3.0`, so Tampermonkey may not auto-update A even though the repository changed.

By default the bootstrap loads:

```text
https://raw.githubusercontent.com/ZeroJehovah/grasp-rat-bot/main/dist/manifest.json
```

The bootstrap polls once per second. On refresh, navigation, relogin, or page recovery, Tampermonkey runs again and fetches the latest verified manifest before falling back to cache. It also runs a one-second watchdog: if the page bot is missing, stopped, stale, or on the wrong manifest hash, it reinstalls from verified source. Version `0.3.5` refuses cached remote bot builds that contain bot-owned game WebSocket creation or page reconnect calls.

Version `0.3.6` fixes a refresh-time bootstrap race: script A no longer waits forever for script B's startup promise, and script B registers `window.__graspRatBot` before waiting on `/snapshot` or `/minimap`. Those page data requests are now timeout-bounded, so a slow page refresh cannot leave the bootstrap stuck in `installing` without future manifest polls.

Version `0.3.7` changes script A's page-context injection path to prefer Tampermonkey `GM_addElement(script)`. This covers pages where normal inline script insertion is blocked by CSP or browser extension policy even though the bootstrap userscript itself is enabled.

Version `0.3.8` changes script B strategy only. If the same unsafe player keeps pressuring the bot for about 5 minutes, the bot leaves the game, stops local movement, suppresses relogin for 30 seconds, then lets the normal login flow resume. The overlay and status include the current pursuit target, duration, and pursuit-leave wait state.

Version `0.3.9` changes script B strategy only. The bot now merges page-native coin drops with `/snapshot` `coin_drops`, uses the snapshot to navigate directly toward known coin areas when no higher-priority local/safety action exists, and removes the old open-area patrol fallback. If no native or fresh snapshot coin is available, it waits for the next snapshot instead of cruising randomly.

Version `0.4.0` changes both script A and script B. At full HP, the bot no longer actively avoids or approaches players and keeps collecting coins. Moving, active, or firing enemies inside attack range trigger combat: the bot shoots more frequently, dodges incoming bullets along a random tangent, aims exactly at stationary targets, and adds small aim jitter for moving targets. In combat, if own HP is below 50 and below the target HP, the bot leaves. Static AFK players with `Drop > 0` inside shooting range are shot opportunistically without switching to combat, while coin movement remains the primary movement target when coins exist. After a recent fight, dropped coins with amount greater than 1 are picked before returning to recovery wait. Script A and the monitor also avoid starting LinuxDO login while the page still has token/self/in-game state unless a leave was issued first.

Version `0.4.1` changes script B strategy and overlay only. AFK `Drop=x` targets now compete in the main opportunity score as the same value as `x` coins; equal-score ties prefer the AFK Drop target, while higher-value coins can still win. Shooting or approaching those AFK Drop targets is not marked as combat. The top-right overlay also shows the current remote bot version and the first 8 characters of the verified source hash, so manifest updates are visible in game.

Version `0.4.7` moves the top-right overlay to script A. The panel is visible on game pages even before the remote bot is injected, shows manifest/script fetch and install/cache status, and includes a pause/resume button. While paused, script A still fetches and verifies remote updates into cache but does not inject/reinstall the bot or start login, and script B stops sending movement/attack control so manual control is possible. Injury, combat disadvantage, and sustained-pursuit exits now suppress relogin for a random 1-3 minute enemy-leave wait before normal login resumes.

Version `0.4.9` hardens the bootstrap panel and pause sync paths. Script A records panel/pause bridge errors in the overlay instead of letting a document-start or malformed-status edge case throw repeatedly from the userscript interval. Version `0.4.8` fixed pause synchronization so panel refreshes no longer repeatedly call script B's pause handler or interfere with manual control.

When the game page is not logged in, the bootstrap and remote bot try `startLinuxDoLogin()` or the visible login/join control. On the LinuxDO OAuth authorize page, the bootstrap waits 10 seconds before clicking the allow/authorize control, so it acts only as a fallback behind the user's primary authorization script.

After login starts or the OAuth authorize/callback page is seen, the bootstrap suppresses another login attempt for 45 seconds. This prevents a just-authorized page from bouncing back into LinuxDO before the game writes token/self state. If the bot is already in game but page WebSocket control stays offline for more than 3 seconds, the remote bot attempts `leave(userId)` or `#leaveBtn` before any reload fallback.

Remote bot WebSocket reconnects are page-owned. The Tampermonkey remote bot does not call page `connectWs()` / `scheduleReconnect()` and does not create its own fallback `wss://.../ws` connection; these switches are hard-disabled even if runtime config tries to enable them. If native page WebSocket state is unavailable or disconnected, the bot observes that state, stops local movement, and leaves after the configured offline window instead of creating extra sockets.

If the overlay disappears and `[grasp-rat-bot] started live control` prints again, that means the bootstrap watchdog replaced or reinstalled the page bot because it was missing, stopped, stale, or on an older manifest. It is not a bot-owned WebSocket reconnect. For the stale-cache, refresh-startup, and CSP-safe injection fixes, script A must be updated to `0.3.7`; future strategy-only script B changes update through the manifest poll.

Static full-stamina `Active` entities are treated as ordinary targets instead of active threats. Moving or non-full-stamina `Active` entities still trigger avoidance, but avoidance distances are narrower than the old bootstrap `0.2.x` build so the bot stops fleeing far across the map.

## Build Script B

After changing strategy code in `grasp-rat-bot.js`, regenerate the remote bot and manifest:

```bash
node scripts/build-remote-bot.js
```

Use an explicit version when needed:

```bash
node scripts/build-remote-bot.js --version 20260608-remote-loader
```

Then commit and push `dist/grasp-rat-remote-bot.js` and `dist/manifest.json`. Installed bootstrap scripts will pick up the new manifest on the next poll.

## Local Debug API

Start the debug API from WSL:

```bash
node grasp-rat-debug-api.js
```

It listens on `0.0.0.0:18777` and provides:

- `POST /events` for bot/debug events.
- `GET /events` for recent events.
- `GET /health` for status.
- `GET /bot/manifest.json` and `GET /bot/grasp-rat-remote-bot.js` for local development files.

Events are written to `grasp-rat-debug-events.log`, which is ignored by git.

## Local Development Loader

To temporarily load from the WSL debug API instead of GitHub, run this in the game page console:

```js
window.__graspRatBotBootstrap.setManifestUrl('http://127.0.0.1:18777/bot/manifest.json')
```

To switch back to GitHub:

```js
window.__graspRatBotBootstrap.setManifestUrl('https://raw.githubusercontent.com/ZeroJehovah/grasp-rat-bot/main/dist/manifest.json')
```

If Windows Chrome cannot reach WSL through `127.0.0.1`, use the WSL IP instead and update the URL accordingly.

## Validation

Run these checks before pushing strategy changes:

```bash
node --check grasp-rat-bot.js
node --check grasp-rat-debug-api.js
node --check scripts/build-remote-bot.js
node --check userscript/grasp-rat-bootstrap.user.js
node grasp-rat-bot.js --self-test
node scripts/build-remote-bot.js
```

## CDP Fallback

The old CDP fallback commands still exist:

```bash
node grasp-rat-bot.js
node grasp-rat-bot.js --status
node grasp-rat-bot.js --diagnose
node grasp-rat-stop.js
```

Use them only for deliberate debugging. The primary injection path is the Tampermonkey bootstrap.
