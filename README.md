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

If an older `0.1.x` bootstrap is already installed, reinstall script A once. Version `0.3.x` adds `document-start` injection, LinuxDO authorization-page matching, OAuth-loop suppression, and Tampermonkey update URLs.

By default the bootstrap loads:

```text
https://raw.githubusercontent.com/ZeroJehovah/grasp-rat-bot/main/dist/manifest.json
```

The bootstrap polls once per second. On refresh, navigation, relogin, or page recovery, Tampermonkey runs again and injects the bot from the latest verified manifest. It also runs a one-second watchdog: if the page bot is missing, stopped, stale, or on the wrong manifest hash, it reinstalls from the verified cache or latest manifest.

When the game page is not logged in, the bootstrap and remote bot try `startLinuxDoLogin()` or the visible login/join control. On the LinuxDO OAuth authorize page, the bootstrap waits 10 seconds before clicking the allow/authorize control, so it acts only as a fallback behind the user's primary authorization script.

After login starts or the OAuth authorize/callback page is seen, the bootstrap suppresses another login attempt for 45 seconds. This prevents a just-authorized page from bouncing back into LinuxDO before the game writes token/self state. If the bot is already in game but page WebSocket control stays offline for more than 3 seconds, the remote bot attempts `leave(userId)` or `#leaveBtn` before any reload fallback.

Remote bot WebSocket reconnects are page-owned. The Tampermonkey remote bot does not call page `connectWs()` / `scheduleReconnect()` and does not create its own fallback `wss://.../ws` connection; these switches are hard-disabled even if runtime config tries to enable them. If native page WebSocket state is unavailable or disconnected, the bot observes that state, stops local movement, and leaves after the configured offline window instead of creating extra sockets.

If the overlay disappears and `[grasp-rat-bot] started live control` prints again, that means the bootstrap watchdog replaced or reinstalled the page bot because it was missing, stopped, stale, or on an older manifest. It is not a bot-owned WebSocket reconnect. The installed script A does not need to be reinstalled for `bootstrap-0.3.4`; the remote script B updates through the manifest poll.

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
