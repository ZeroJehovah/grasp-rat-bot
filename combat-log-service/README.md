# Combat Log Service

本地战斗日志收集服务。Tampermonkey 脚本开启战斗日志后，会把战斗窗口内的结构化 JSON 批量 POST 到本服务。

日志按战斗分 JSONL 文件写入。每行是一条事件，包含战斗开始、战斗前缓冲帧、战斗帧、战斗结束等类型。

## 启动

```bash
cd combat-log-service
npm start
```

默认监听：

```text
http://127.0.0.1:18765/combat-log
```

健康检查：

```bash
curl http://127.0.0.1:18765/health
```

外部 Watchdog 状态：

```bash
curl http://127.0.0.1:18765/watchdog/status
```

日志默认按类型拆分写入：

```text
combat-log-service/logs/YYYY-MM-DD/<kind>/<combatId>.jsonl
```

`<kind>` 通常是 `combat`、`important`、`audit` 或 `misc`。需要旧版平铺结构时可加 `--flat-files`。

## 参数

```bash
node server.js --host 127.0.0.1 --port 18765 --dir ./logs
```

`--max-body-bytes` 可以提高单次批量 POST 的最大请求体，默认 8 MiB。

服务启动时会先清理一次详细日志，然后按本地时间每天 `03:30` 清理一次。默认只保留最近 3 个本地日期目录里的详细 `combat`/`misc` JSONL 和旧版平铺战斗 JSONL；`important`、`audit` 和 `daily-*.md` 会保留，用于日报和退出审计。可用参数调整：

```bash
node server.js --cleanup-retention-days 3 --cleanup-at 03:30
node server.js --no-cleanup
```

也可以单独手动执行或预览清理：

```bash
npm run cleanup
npm run cleanup -- --dry-run
```

Watchdog 可以从本地 JSON 文件启动配置，避免把 Clash secret 或 direct-leave 模板粘贴到浏览器控制台。示例文件：

```bash
cp watchdog-config.example.json watchdog-config.local.json
node server.js --watchdog-config ./watchdog-config.local.json
```

启动日志会打印脱敏后的 watchdog 摘要，包括 dry-run/active 状态、direct-leave 是否已验证、Clash 校验状态和配置警告；不会打印 secret、token、Authorization 或完整 descriptor。命令行参数按顺序应用，写在 `--watchdog-config` 后面的 watchdog 参数会覆盖文件值，例如：

```bash
node server.js --watchdog-config ./watchdog-config.local.json --watchdog-dry-run
```

## Tampermonkey 配置

在游戏页面控制台执行：

```js
window.__graspRatBotBootstrap.configureCombatLogging({
  enabled: true,
  endpoint: 'http://127.0.0.1:18765/combat-log'
})
```

关闭：

```js
window.__graspRatBotBootstrap.configureCombatLogging({ enabled: false })
```

配置会通过 Tampermonkey `GM_setValue` 持久化。

## 外部 Watchdog

Watchdog 默认完全关闭。服务端即使启动了 `/watchdog/*` 端点，也不会触发救援；浏览器也不会发送心跳，直到显式配置。

启用浏览器心跳：

```js
window.__graspRatBotBootstrap.configureWatchdog({
  enabled: true,
  endpoint: 'http://127.0.0.1:18765/watchdog/heartbeat'
})
```

关闭：

```js
window.__graspRatBotBootstrap.configureWatchdog({ enabled: false })
```

服务端启用 dry-run 检测：

```bash
curl -X POST http://127.0.0.1:18765/watchdog/config \
  -H 'content-type: application/json' \
  --data '{"enabled":true,"dryRun":true,"damagedCombatStaleMs":2000}'
```

dry-run 只写审计，不会调用游戏退出或 Clash。审计会包含 `watchdog-state-change`、`watchdog-would-rescue`，主动救援时还会包含 direct-leave / Clash 请求结果和最终 `watchdog-rescue-result`。审计写入：

```text
combat-log-service/logs/YYYY-MM-DD/audit/watchdog.jsonl
```

查看状态：

```bash
curl http://127.0.0.1:18765/watchdog/status
```

配置并验证 Clash：

```bash
node server.js --watchdog-config ./watchdog-config.local.json

curl -X POST http://127.0.0.1:18765/watchdog/config \
  -H 'content-type: application/json' \
  --data '{"clash":{"enabled":true,"controllerUrl":"http://127.0.0.1:9097","secret":"YOUR_SECRET","group":"GRASP-RAT-GAME","autoProxy":"S2-自动","manualProxy":"S2-手动","directProxy":"DIRECT"}}'

curl -X POST http://127.0.0.1:18765/watchdog/test-clash \
  -H 'content-type: application/json' \
  --data '{}'
```

主动救援还需要 direct leave 明确启用并标记已验证。不要在未完成低风险 live 验证前打开：

```bash
curl -X POST http://127.0.0.1:18765/watchdog/config \
  -H 'content-type: application/json' \
  --data '{"directLeave":{"enabled":true,"verified":true},"activeRescueEnabled":true,"dryRun":false}'
```

手动 direct leave 测试必须显式 `confirm: true`，可以使用最近一次心跳里的 descriptor，也可以在请求体里传入临时 descriptor。请求和审计会脱敏 token、cookie、Authorization 等字段：

```bash
curl -X POST http://127.0.0.1:18765/watchdog/test-leave \
  -H 'content-type: application/json' \
  --data '{"confirm":true,"key":"<pageId>:<userId>"}'
```

浏览器默认只发送 `leaveAuth.available` / `sessionTokenPresent` 等 readiness 字段。只有显式配置 `sendLeaveDescriptor: true` 且提供 `leaveDescriptor` 时，才会把短期 token 快照发送到本地服务：

```js
window.__graspRatBotBootstrap.configureWatchdog({
  enabled: true,
  endpoint: 'http://127.0.0.1:18765/watchdog/heartbeat',
  sendLeaveDescriptor: true,
  leaveDescriptor: {
    url: 'https://grasp-rat-game.h-e.top/api/leave',
    method: 'POST',
    headers: { authorization: 'Bearer ${sessionToken}' },
    bodyJson: { userId: '${userId}' }
  }
})
```

上面的 direct leave endpoint 只是 descriptor 形状示例；真实 endpoint、方法、请求体和认证方式必须先在低风险 live 会话中验证，再把服务端 `directLeave.verified` 设为 `true`。
默认 `directLeave.requireAuthEvidence=true`，所以 descriptor 还必须包含可见的认证证据，例如 `sessionToken`、Authorization/Cookie/header 模板、token 查询参数或 body 里的 token/session 字段；只有 URL/method/userId 不会被标记为 direct-leave ready。

本地 smoke 测试会启动临时服务、启用 watchdog dry-run、发送合成高风险心跳、检查审计脱敏，然后用 fake fetch 验证主动 direct-leave 路径会发出一次请求。它不会访问真实游戏或 Clash：

```bash
npm run watchdog:smoke
```

干跑重放会在本地临时 watchdog 实例里模拟 2026-07-07 的 21 秒页面主循环停顿形态，验证 `damagedCombatStaleMs` 阈值会产生 `watchdog-would-rescue`，并确认 dry-run 不发出任何外部请求：

```bash
npm run watchdog:replay
npm run watchdog:replay -- --stall-ms 1000 --threshold-ms 2000 --expect none
```

## 记录范围

默认记录：

- 战斗触发前约 10 秒的滚动缓冲；
- 战斗中的每个 bot tick；
- 战斗结束后约 10 秒的后置观察窗口。

每帧包含自己的 HP/坐标/体力、最终决策、目标、退出原因、受伤/追击上下文、附近实体、相关子弹、控制状态和快照年龄。附近实体默认最多 12 个，子弹默认最多 24 发，避免把完整页面状态无限写入。

按 120ms tick 估算，1 分钟战斗通常是几百到一两千行 JSONL，体积大致是 MB 级，取决于附近实体和子弹数量。

## 快速检查

```bash
curl http://127.0.0.1:18765/health
```

如果游戏面板里 `战斗日志` 的失败数增长，先确认服务正在运行，并检查 endpoint 是否仍是：

```text
http://127.0.0.1:18765/combat-log
```

## 退出/重连审计

分析已收集的 JSONL，检查退出原因是否写入顶层 `exit`，是否出现退出 hold 期间登录，以及特定退出原因是否满足要求的等待。普通非安全退出默认不再要求固定等待；需要临时恢复旧规则时可传 `--min-unsafe-delay-ms <ms>`：

```bash
cd combat-log-service
npm run analyze
```

只查看最近的退出事件：

```bash
npm run analyze -- --latest 10
```

持续监控新日志，发现退出/重连审计结果变化时打印更新：

```bash
npm run monitor
```

降低轮询频率或只跑一次监控扫描：

```bash
npm run monitor -- --watch-interval-ms 5000 --latest 5
npm run monitor -- --watch-count 1
```

只监控当前/未来版本，避免历史旧日志干扰：

```bash
npm run analyze:current
npm run validate:current
npm run validate:objective
npm run monitor:current
npm run monitor:current:strict
npm run monitor:objective
npm run monitor:objective:fresh
npm run monitor:objective:observe
npm run monitor:objective -- --since now --latest 10
npm run monitor:current:strict -- --since now --latest 10
npm run monitor:current -- --since now --latest 10
npm run monitor -- --min-version bootstrap-0.4.101 --latest 10
npm run monitor -- --since now --min-version bootstrap-0.4.101 --latest 10
```

`validate:current` 会额外要求至少存在一条当前 manifest 版本日志；没有匹配日志时返回非零退出码，用来区分“无问题”和“还没有验证证据”。使用 `--manifest` 时，审计也会核对日志 `sourceHash` 是否匹配 manifest SHA。

`validate:objective` 更严格：它要求当前 manifest 版本既有日志，也至少有一个退出事件、至少一个射程内 Active 敌人触发战斗响应的事件、至少一个交战血量劣势退出事件，并且没有退出/重连/行为回归问题。没有当前版本退出样本时会返回 `no-matching-exit-events`，没有射程内 Active 战斗响应样本时会返回 `no-active-in-range-combat-events`，没有血量劣势退出样本时会返回 `no-hp-disadvantage-exit-events`，避免把“还没发生关键场景”误判成“逻辑已验证”。

射程内 Active 行为审计只把可行动的实时证据作为回归问题：`native`、`render`、`realtime` 或当前严格目标里的 Active 玩家被金币动作覆盖时才会触发 `coin-action-with-active-player-in-range`。仅来自 snapshot 的 Active 玩家仍会作为上下文出现，但不会触发该失败项，因为战斗目标、瞄准和开火不能使用 snapshot authority。

需要验证刚发布的当前版本时，建议先启动收集服务并开启 Tampermonkey 战斗日志，然后从当前时间开始严格监控：

```bash
cd combat-log-service
npm start
```

另开一个终端：

```bash
cd combat-log-service
npm run monitor:objective:fresh
```

`monitor:current:strict` 会持续过滤到 `../dist/manifest.json` 当前版本，并把“没有当前版本日志”也显示为 evidence issue。`monitor:objective` 会额外要求当前版本退出事件、射程内 Active 战斗响应事件、血量劣势退出事件，用来验证退出原因、非安全退出重连等待，以及当前版本是否重新出现收益等待/射程内金币行动问题。`monitor:objective:fresh` 等同于 `monitor:objective -- --since now --latest 10`，用于刚发布后只监控未来日志。如果加 `--watch-count 1`，发现审计问题、解析错误或缺少匹配证据时会返回非零退出码。`monitor:objective:observe` 也从当前时间开始监控未来日志并显示缺少证据的状态，但退出码只对真实审计问题或解析错误失败，适合长时间观察日志是否重新出现行为/重连问题。

`stamina-budget-coin-leave` 默认要求 30 分钟等待；如果配置改变，可用 `--stamina-budget-delay-ms <ms>` 调整审计阈值。

用于自动检查时可以让问题返回非零退出码：

```bash
npm run analyze -- --fail-on-issue
npm run analyze:current -- --require-entries --fail-on-audit-issue
npm run analyze:current -- --require-entries --fail-on-issue
npm run validate:objective
```

验证审计器自身的版本过滤和问题识别逻辑：

```bash
npm test
```

## 日报

日报读取当天所有 JSONL 里的 `important-log`，默认使用最新日期目录：

```bash
cd combat-log-service
npm run daily
npm run daily -- --day 2026-06-13
```

默认会写入仓库统一报告目录 `docs/reports/YYYY-MM/daily-YYYY-MM-DD.md`，并在终端输出路径和汇总 JSON。需要直接打印 Markdown 时使用：

```bash
npm run daily -- --day 2026-06-13 --stdout
```

输出包含三类统计：

- 登录统计：登录时间、退出时间、耗时、消耗体力、拾取刷新金币、挂机击杀次数/收益、活跃击杀次数/收益、总收益、退出原因；
- 实际战斗收益统计：只列确认击杀和失败/劣势离场，不列敌方逃离、目标切换和安全避让。输出为 Markdown 表格，列出开始/结束时间、耗时、战斗体力消耗、敌人、活跃/挂机、Drop、结果和实际收益；确认击杀但未拾取掉落显示 `0币（未拾取）`，失败/劣势离场显示 `0币（未击杀）`；
- 活跃玩家战斗统计：战斗对象、开始/结束时间、耗时、战斗期间消耗体力、我方/对方血量变化、战斗结果。战斗结果会直接写事件含义，例如 `主动退出本局`、`战后恢复`、`恢复期安全撤开`、`敌方逃离`、`切换交战目标`、`交火停止`。

机器可读输出：

```bash
npm run daily -- --json
```

审计会标记：

- `missing-top-level-exit`: 日志帧只有旧的 `enemyExit`/决策原因，没有顶层 `exit` 摘要；
- `missing-exit-reason`: 日志帧有顶层 `exit` 摘要，但没有明确的 `exit.reason`；
- `generic-exit-reason`: 顶层 `exit.reason` 是 `cooldown` 等泛化值，不能说明真实退出根因；
- `unsafe-exit-delay-below-minimum`: 受伤、交战劣势、追击、断连/WebSocket 等非安全退出没有达到命令行指定的最小重连等待；默认最小值为 `0`，带 `safeReloginAllowed` 的普通安全离线退出允许零等待；
- `exit-delay-below-required`: 退出等待低于该退出原因要求的等待，例如 1h 体力预算退出低于 30 分钟；
- `login-attempt-during-exit-hold`: 退出后的 suppress/hold 仍有效时出现自动登录尝试；
- `manual-login-cleared-exit-hold`: 手动登录清除了退出后的 suppress/hold；
- `ambiguous-opportunity-wait`: 当前版本日志里重新出现“收益接近，原地等待更明确目标”；
- `coin-action-with-active-player-in-range`: 射程内存在非无敌且有移动、开火、非满体力或显式 active 标记的 Active 玩家时，决策仍在执行金币行动而不是战斗/退出；纯 join-mode Active、满体力、静止、无开火证据的站桩目标不会触发此问题。审计会读取附近实体列表，也会读取当前决策目标里带有模式/距离的玩家证据。

证据缺口会标记：

- `no-matching-entries`: 当前过滤条件没有任何日志；
- `no-matching-exit-events`: 当前过滤条件有日志，但没有退出事件；
- `no-active-in-range-combat-events`: 当前过滤条件有日志，但没有射程内非无敌且有真实活动证据的 Active 敌人触发战斗/攻击/战斗退出响应的样本；
- `no-hp-disadvantage-exit-events`: 当前过滤条件有日志，但没有 `combat-hp-disadvantage-leave` 或 `combat-low-hp-leave` 退出样本；
- `manifest-source-hash-missing`: 当前过滤条件有日志，但部分日志缺少 `sourceHash`，无法证明来自当前构建；
- `manifest-source-hash-mismatch`: 日志 `sourceHash` 与 manifest SHA 不一致。

审计输出会先汇总安全/非安全退出等待是否达标，再按退出 reason / 行为 reason / 射程内 Active 战斗响应 reason 聚合计数，最后列出最新事件。最新退出事件行也会显示登录/重连上下文，例如 `safeRelogin`、`suppress=...`、`enemyHold=...`、`offlineHold=...`、`lastLogin=...`、`manualLogin=...`，用于判断退出后是否允许立即重连、是否仍有重连抑制、是否被手动登录绕过、或登录逻辑是否忽略了 suppress。
