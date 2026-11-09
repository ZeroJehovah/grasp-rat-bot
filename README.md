# Grasp Rat Bot

The maintained application is a browserless Node.js runner for `https://grasp-rat-game.h-e.top/`. It communicates directly over HTTP and WebSocket and serves its own status/control web page.

The retired Tampermonkey scripts, browser extension, injected browser runtime, remote browser bundle and CDP tools have been removed from this branch. They remain available in Git history at `79c77bd8ad35d36292e40972dde833b67d4e5058`.

## Source layout

- `scripts/browserless-runner.js`: production entrypoint.
- `src/node/browserless/`: transport, lifecycle, state, action execution, logging and status server.
- `src/node/browserless/web-panel.js`: browserless web page, including map controls.
- `src/strategy/` and `src/shared/`: policy and shared helpers.
- `config/target-whitelist.json`: browserless creator-protection data.
- `deploy/` and `scripts/*browserless*release*`: immutable production build and deployment.
- `combat-log-service/`: log analysis, reports, watchdog and combat replay tools.
- `headless-demo/`: standalone Node protocol probe.

## Validation

Install the locked dependencies with `npm ci`, using a compatible Node 22 runtime. Choose tests for the changed surface:

```bash
node --check src/node/browserless/web-panel.js
node scripts/browserless-runner.js --self-test
npm run test:shared
npm run test:browserless-migration
npm run test:headless-demo
npm --prefix combat-log-service test
```

`GRASP_RAT_SELF_TEST_FILTER` selects a named case or substring in `test:shared`. Pure frontend presentation changes use focused checks. The migration audit requires the repository's Git history.

## Production deployment

Production executes root-owned, read-only artifacts under `/opt/grasp-rat-browserless/releases/`, selected by `/opt/grasp-rat-browserless/current`. Source checkouts are for development and build control only.

Review `deploy/browserless-runner.env.example` for configuration. Supply credentials through the operator's protected environment/state files. Commit and push the tested revision before deploying it:

```bash
git push origin HEAD:main
NODE_BIN=/opt/grasp-rat-browserless/runtime/node-v22.23.2-linux-arm64/bin/node \
  scripts/deploy-browserless-release.sh --revision "$(git rev-parse HEAD)"
```

The deployment transaction builds from that exact Git object, validates the artifact and performance gate, installs an immutable release, restarts the service, and verifies the manifest, process directory, health and runtime revision. Configure `NODE_BIN` for the validated service runtime on a new host.

The local status page is served on `http://127.0.0.1:18767/` by default and uses `GRASP_RAT_BROWSERLESS_WEB_TOKEN`. Map expand/collapse SVGs are adapted from [Feather v4.29.2](https://github.com/feathericons/feather/tree/v4.29.2/icons), under the MIT license included in the page source.
