# Combat Logging Notes


- Local collector lives in `combat-log-service/` and uses Node built-in modules only.
- Start collector with `cd combat-log-service && npm start`.
- Enable in game console:

```js
window.__graspRatBotBootstrap.configureCombatLogging({
  enabled: true,
  endpoint: 'http://127.0.0.1:18765/combat-log'
})
```

- Disable with:

```js
window.__graspRatBotBootstrap.configureCombatLogging({ enabled: false })
```

- Tampermonkey persists `combatLoggingEnabled` and `combatLogEndpoint` via `GM_setValue`; the extension persists the same config in extension storage.
- Logs are written to `combat-log-service/logs/YYYY-MM-DD/<combatId>.jsonl`; this directory is ignored.
- Analyze collected logs with `cd combat-log-service && npm run analyze`; use `-- --latest 10` for recent exits and `-- --fail-on-issue` for a non-zero exit when missing top-level `exit` or unsafe-delay issues are found.
- Continuously monitor collected logs with `cd combat-log-service && npm run monitor`; use `-- --watch-count 1` for a finite smoke check and `-- --watch-interval-ms 5000 --latest 5` to tune polling/noise.
- Current manifest-version commands: `cd combat-log-service && npm run analyze:current`, `npm run validate:current`, `npm run validate:objective`, `npm run monitor:current`, `npm run monitor:current:strict`, `npm run monitor:objective`, `npm run monitor:objective:fresh`, and `npm run monitor:objective:observe`; use `npm run monitor:objective:fresh` to ignore old logs, require fresh current-version exit/combat evidence, and monitor only future current-version entries.
- `npm run validate:current` and one-scan `npm run monitor:current:strict -- --watch-count 1` require at least one current manifest-version log entry and exit non-zero with `no-matching-entries` when current-version logs have not arrived yet; this distinguishes "no issues found" from "no validation evidence".
- `npm run validate:objective` and one-scan `npm run monitor:objective -- --watch-count 1` also require at least one current manifest-version exit event, one Active-in-range combat-response event, and one HP-disadvantage combat exit event. They exit non-zero with `no-matching-exit-events`, `no-active-in-range-combat-events`, or `no-hp-disadvantage-exit-events` when current logs exist but those samples are missing.
- `npm run monitor:objective:observe -- --watch-count 1 --watch-interval-ms 250` currently exits zero with only missing-evidence status when no fresh `.109` logs exist. Use it for long-running observation after release; use `monitor:objective:fresh` / `validate:objective` when missing evidence should fail the run.
- `node scripts/objective-status.js --fail-on-incomplete` is the current completion gate. It currently reports static build `ok`, but overall `not complete` because live evidence has `entries=0/18851`, `exits=0`, `unsafeOrRequiredDelayExits=0` in human output (`unsafeOrRequiredDelayExitEvents=0` in JSON), `activeCombat=0`, and `hpDisadvantageExits=0` for `bootstrap-0.4.109`. Requirement output is now granular: exit/relogin evidence and Active/HP combat evidence are reported independently.
- Manifest-based analysis now also checks matching log `sourceHash` values against manifest SHA-256 and reports `manifest-source-hash-missing` / `manifest-source-hash-mismatch` evidence issues.
- Combat decision logs expose aim authority evidence under `decision.aimTarget`: `snapshot` marks snapshot/server-coordinate aiming, `authorityTargetOutOfRange` marks suppressed fire when the authoritative target is out of attack range, and `authority` carries divergence threshold, native/snapshot distances, and server-stall context for replay/debug analysis.
- Reason-specific delay auditing currently treats `stamina-budget-coin-leave` as requiring 30 minutes by default; use `--stamina-budget-delay-ms <ms>` if that config changes.
- For current-version validation, filter historical noise with `npm run monitor -- --min-version bootstrap-0.4.104 --latest 10` or start clean from invocation time with `npm run monitor -- --since now --min-version bootstrap-0.4.104 --latest 10`.
- Current local old logs (`bootstrap-0.4.71` through `bootstrap-0.4.96`) show 50 exit events, all missing top-level `exit`, and 39 unsafe exits below the 60s delay evidence; this is expected historical evidence and not validation of latest `bootstrap-0.4.109`.
- `bootstrap-0.4.93` historical safety counts show `unsafe=23`, `unsafeDelayOk=0`, `unsafeDelayBelowMin=23`, and `unsafeDelayMissing=23`; reason counts show exits dominated by `injury hp drop=14`, then `cooldown=6`, then `login-suppressed=3`; behavior reason counts show `wait-for-clear-opportunity=6` events covering 902 frames and `best-opportunity-coin=2` events covering 30 frames; Active-in-range combat evidence shows 24 events; HP-disadvantage exit evidence shows 0. This validates the analyzer and old-root-cause explanation, not the current bot.
- If the collector is unavailable, the bot keeps the bounded pending queue, records failure status in the panel/status, and does not affect combat decisions.
