# 运行时剩余迁移清单与提交计划 - 2026-07-05

本文从 `main` 当前状态（最新远程版本 `bootstrap-0.4.532`）出发，统计剩余待迁移内容，并给出后续实施提交计划。

## 结论

严格按前两阶段迁移目标统计，剩余必需迁移项为 0：

- 旧浏览器源码字符串生成层已完成迁移：`src/browser/*source.js`、`src/browser/runtime-fragment-registry.js`、`src/browser/runtime-source.js`、`src/browser/runtime-entry-source.js` 均已移除。
- 生产远程构建和本地 CDP/eval 注入均直接打包真实入口 `src/browser/runtime-entry.js`。
- 18k 行运行时入口的域迁移已完成到 `.532`：入口剩余 2,547 行，主要负责 shell/context 创建、公共 `bot` API、状态汇总、跨域函数注入和启动委派。
- `chooseAction()`、`tick()`、`classify()`、startup tail、combat、profit、native state、control flow、logging、UI/status 等主要域行为已迁入 `src/browser/runtime/*.js` 模块。

因此，后续不再是“移除旧 source-string 层”的必要迁移，而是迁移后的二次拆分和收口。建议按维护性收益继续做，但每次仍应保持结构性改动，不夹带策略调参。

## 当前基线

- `src/browser/runtime-entry.js`: 2,547 行。
- `src/browser/runtime/*.js`: 53 个可执行运行时模块，约 21,848 行。
- `scripts/verify-objective-build.js`: 547 行，当前已检查直接入口、缺失旧 source-string 文件、域边界、native/realtime combat 锚点、visible/native profit 优先级等。
- 当前较大的运行时模块：
  - `src/browser/runtime/control-flow-runtime.js`: 4,549 行。
  - `src/browser/runtime/combat-runtime.js`: 3,831 行。
  - `src/browser/runtime/orchestration-runtime.js`: 2,553 行。
  - `src/browser/runtime/native-state-runtime.js`: 2,418 行。
  - `src/browser/runtime/combat-log-runtime.js`: 1,864 行。
  - `src/browser/runtime/profit-runtime.js`: 1,813 行。
  - `src/browser/runtime/important-logging-runtime.js`: 1,171 行。
  - `src/browser/runtime/exit-relogin.js`: 880 行。
  - `src/browser/runtime/target-overlay.js`: 603 行。

进度更新到 `bootstrap-0.4.542`：

- `src/browser/runtime-entry.js`: 2,139 行。
- `src/browser/runtime/*.js`: 80 个可执行运行时模块，约 24,670 行。
- `src/browser/runtime/control-flow-runtime.js`: 1,614 行。
- `src/browser/runtime/native-state-runtime.js`: 376 行。
- `src/browser/runtime/combat-log-runtime.js`: 1,305 行。
- `src/browser/runtime/important-logging-runtime.js`: 76 行。
- `src/browser/runtime/profit-runtime.js`: 161 行。
- `src/browser/runtime/combat-runtime.js`: 189 行。
- `scripts/verify-objective-build.js`: 905 行，当前报告 30 项检查，并覆盖 public API/status、entity-state、exit-detail、entry-glue、control-login、login-point-safety、post-login-zoom、pending-exit、Clash leave rescue、leave-flow、native-data、native-transport、session-stats、stall-diagnostics、network-quality、combat-log queue、exit-audit、important-session、kill-attribution、profit coin/opportunity/post-attack/arbitration、combat target/movement/aim/action 的 owner 防回流检查，以及 runtime-entry/composition 大模块行数预算。
- 10 次实施提交已全部完成，剩余 0 次。

## 剩余待迁移内容

### 1. 入口仍保留的公共 API 和状态汇总

`runtime-entry.js` 仍内联创建 `bot` 对象，并保留以下高耦合胶水：

- `bot.stop()`、`bot.setPaused()`、`bot.forceLoginNow()`、`bot.configureCombatLogging()`、`bot.configureClashLeaveRescue()`、`bot.step()`、`bot.status()`。
- `bot.status()` 汇总跨域状态，包括 combat logging、important logging、exit audit、session/today session、coin progress、target switch、global state、control、relogin gate、offline/enemy/combat leave 等。
- `logStatus()`、`readPauseReason()`、`syncPausedFromPage()`、`getOwnEntity()` 等入口级辅助函数。

这些内容不再阻塞构建迁移，但它们让入口仍然偏厚，且状态字段变更时容易回到入口里继续增长。

### 2. 入口仍保留的共享实体/状态谓词

入口中仍保留并向多个域模块注入的基础判断包括：

- 距离、速度、存活、HP、Drop、invulnerable、Active join mode、firing、moving threat、AFK/profit target。
- stamina remaining/limit/exhausted、move/attack stamina、full stamina、recovering、conserving stamina。
- active threat decoration 和部分 exit-motion cleanup。

这些函数本身不是旧 source-string 遗留，但已成为 combat/profit/orchestration/control-flow 的共享依赖。后续应迁入明确的 `entity-state` / `runtime-predicates` 类模块，减少入口作为共享工具仓库的角色。

### 3. Control-flow 域模块仍过大

`control-flow-runtime.js` 同时拥有以下子域：

- reload/session mismatch/no-self recovery。
- post-login zoom、native login gate、manual bypass、startLinuxDoLogin gate。
- login-point safety 状态、持久化、危险评估、probe 记录。
- relogin cooldown 汇总和 force-login hold 清理。
- pending exit 记录、确认、重试、local confirmation、403 risk hold。
- Clash leave rescue、leave command、auto-login、offline/injury/pursuit/combat leave flow。

这个文件是当前最大模块，建议优先继续拆分，因为边界相对清晰且验证已有较多锚点。

### 4. Native-state 域模块仍混合数据、传输、统计和网络质量

`native-state-runtime.js` 同时负责：

- page/native state、WS ready state、snapshot observer、native entity/coin/bullet 归一化。
- movement/shooting transport、native tick、message pump。
- session/today session stamina 和收益统计。
- server-position stall、action-settlement stall。
- network-quality sample、latency/loss、movement/shot/damage 观测。

后续拆分应保持“combat 决策只用 native/realtime visible state”的边界，不允许把 snapshot fallback 引入 combat target/aim/fire。

### 5. Combat 域模块已完成本轮子域拆分

`combat-runtime.js` 已在 `bootstrap-0.4.542` 拆出：

- `combat-target-runtime.js`: combat engagement state、offline safety、active combat wait、target selection、engaged target、defensive/profit target gating、combat tick-gap/native tick state。
- `combat-movement-runtime.js`: bullet pressure、threat field、strafe、spacing、close/reengage/finish pressure、out-of-range dodge action。
- `combat-aim-runtime.js`: motion samples、opponent profile、trade estimate、combat trend inputs、shooting plan、aim source、dynamic/live/intercept strategy。
- `combat-action-runtime.js`: leave cover 和 final combat action builder。

本次拆分为结构性迁移，未按战斗记录调参；native/realtime visible combat target、aim、fire 锚点继续由 verifier 检查。

### 6. Profit 域模块已完成本轮机会链路拆分

`profit-runtime.js` 已在 `bootstrap-0.4.541` 拆出：

- `profit-coin-runtime.js`: coin motion options、pickup failure、approach lock、coin diagnostics/safety、realtime/field/distant/high-value coin selection。
- `profit-opportunity-runtime.js`: stamina budget、snapshot wait/fallback、AFK stamina cooldown、coin/enemy scoring、route choice、stable opportunity choice、profitable combat target。
- `profit-post-attack-runtime.js`: post-attack drop wait、coin action、enemy action。
- `profit-arbitration-runtime.js`: coin target helpers、incidental pickup、mark collected、coin progress action、final action arbitration 和 target-switch diagnostics。

剩余 profit 工作不是本轮迁移阻塞项；后续只有在策略行为或字段维护需要时再单独调整。

### 7. Logging 已完成本轮拆分，UI 长尾仍有拆分空间

- `combat-log-runtime.js` 已在 `bootstrap-0.4.540` 拆出 combat-log queue/flush/pending persistence 与 exit-audit/pending audit/session-end flush blocker；剩余主体负责 combat-log frame/build/diagnostic/session lifecycle。
- `important-logging-runtime.js` 已在 `bootstrap-0.4.540` 拆出 important store/session/active-combat summaries 与 kill attribution/chat/drop confirmation；剩余文件只负责组合。
- `target-overlay.js` 仍同时包含 overlay state、login-point overlay、entity/coin rendering 和 DOM/canvas lifecycle。

这些不是构建迁移阻塞项；日志拆分已完成，后续 UI 变更审查仍可单独处理 `target-overlay.js`。

### 8. Verifier 仍应从“已迁出”升级到“防回流/防膨胀”

当前 verifier 已覆盖关键边界，但后续拆分后建议新增：

- `runtime-entry.js` 行数或函数声明数量上限。
- 最大域模块行数软上限，至少对 control-flow/combat/native/profit/orchestration 设置防回流检查。
- 新子模块 owner anchor，防止拆出的函数回流入口或回流大模块。
- 每次拆分后的 direct entry graph 检查，确保没有恢复旧 source-string adapter。

## 建议提交计划

建议分为 10 次实施提交完成；当前这份文档是计划提交，不计入下面的实施提交数。如果每次都发布远程版本，可从 `bootstrap-0.4.533` 顺延到 `bootstrap-0.4.542`，实际版本号以落地时主干状态为准。

实施状态：

- [x] Entry Public API And Status Split (`bootstrap-0.4.533`)
- [x] Shared Entity Predicate Split (`bootstrap-0.4.534`)
- [x] Exit Detail, Pause, And Entry Glue Split (`bootstrap-0.4.535`)
- [x] Control-flow Login Gate And Login-point Safety Split (`bootstrap-0.4.536`)
- [x] Control-flow Pending-exit And Leave Flow Split (`bootstrap-0.4.537`)
- [x] Native State And Transport Split (`bootstrap-0.4.538`)
- [x] Session, Stall, And Network Quality Split (`bootstrap-0.4.539`)
- [x] Logging And Important Records Split (`bootstrap-0.4.540`)
- [x] Profit Runtime Split (`bootstrap-0.4.541`)
- [x] Combat Runtime Split And Final Guard Tightening (`bootstrap-0.4.542`)

### 1. Entry Public API And Status Split - Completed

目标：

- 将 `bot.stop()`、pause API、配置 API、`step()` 和 `status()` 状态汇总迁入新的 public API/status 模块。
- `runtime-entry.js` 只负责创建 bot state、注入依赖、安装 API。

主要文件：

- `src/browser/runtime-entry.js`
- 新增 `src/browser/runtime/bot-api-runtime.js` 或 `src/browser/runtime/bot-status-runtime.js`
- `scripts/verify-objective-build.js`

验证重点：

- `bot.status()` 字段结构保持兼容。
- panel、combat-log、daily-report 依赖的 session/active combat/logging 字段不丢失。
- verifier 拒绝大段 status body 回流入口。

Completed in `bootstrap-0.4.533`: `src/browser/runtime/bot-api-runtime.js` owns the public `bot` API methods and full status summary, while `runtime-entry.js` creates bot state and installs the API through `createBotApiRuntime()`. `scripts/verify-objective-build.js` now rejects the public API/status bodies returning to `runtime-entry.js`, requires the bot API module, and checks the direct esbuild graph with 54 runtime modules.

### 2. Shared Entity Predicate Split - Completed

目标：

- 将 invulnerable、firing、moving/Active、AFK/profit target、HP/stamina/recovery/conserving 等共享谓词迁入一个可执行运行时模块。
- combat/profit/orchestration/control-flow 继续通过显式依赖使用这些谓词。

主要文件：

- `src/browser/runtime-entry.js`
- 新增 `src/browser/runtime/entity-state-runtime.js`
- `src/browser/runtime/combat-runtime.js`
- `src/browser/runtime/profit-runtime.js`
- `src/browser/runtime/orchestration-runtime.js`

验证重点：

- idle invulnerable、moving invulnerable avoidance、AFK recent-activity、Active low-value combat gating、visible/native profit priority 自测仍通过。
- verifier 检查 shared predicate owner，不允许回流入口。

Completed in `bootstrap-0.4.534`: `src/browser/runtime/entity-state-runtime.js` owns shared math helpers, HP/stamina helpers, invulnerability aliases, Active/firing/moving classification, AFK recent-activity gates, idle-invulnerable handling, recovery/conserve predicates, and active threat decoration. `runtime-entry.js` now creates those helpers through `createEntityStateRuntime()` and passes explicit bindings into the existing domain factories. `scripts/verify-objective-build.js` rejects those predicate bodies returning to `runtime-entry.js` and checks the direct esbuild graph with 55 runtime modules.

### 3. Exit Detail, Pause, And Entry Glue Split - Completed

目标：

- 迁出 `activeEnemyLeaveDetail()`、`activeOfflineLeaveDetail()`、latest enemy leave summary/display、`clearPostExitTargetState()`、pause sync、`logStatus()` 等入口胶水。
- 入口保留最小 composition wiring。

主要文件：

- `src/browser/runtime-entry.js`
- 新增 `src/browser/runtime/exit-detail-runtime.js`
- 新增 `src/browser/runtime/pause-runtime.js` 或合并到 public API 模块
- `scripts/verify-objective-build.js`

验证重点：

- relogin/no-self safety wait 的 preserved exit reason 仍优先于 wait-only/gate text。
- post-exit target cleanup、opportunity choice clear、target overlay removal 行为不变。

Completed in `bootstrap-0.4.535`: `src/browser/runtime/exit-detail-runtime.js` owns enemy/offline leave detail refresh plus latest enemy leave summary/display helpers, and `src/browser/runtime/entry-glue-runtime.js` owns post-exit target cleanup, pause reason/sync, own-entity lookup, and status logging glue. `runtime-entry.js` now composes these through `createExitDetailRuntime()` and `createEntryGlueRuntime()`. `scripts/verify-objective-build.js` rejects those helper bodies returning to `runtime-entry.js`, requires both modules in the direct esbuild graph, and reports 26 checks across 57 runtime modules.

### 4. Control-flow Login Gate And Login-point Safety Split - Completed

目标：

- 从 `control-flow-runtime.js` 拆出 native login gate、manual bypass、startLinuxDoLogin gate、post-login zoom、login-point safety 状态和 probe。

主要文件：

- `src/browser/runtime/control-flow-runtime.js`
- 新增 `src/browser/runtime/control-login-runtime.js`
- 新增 `src/browser/runtime/login-point-safety-runtime.js`
- 新增 `src/browser/runtime/post-login-zoom-runtime.js`

验证重点：

- manual immediate login 在 relogin hold/login-point unsafe 时仍可显式点击。
- login-point safety 三连安全快照、动态半径、last-exit HP 记忆、overlay 状态保持兼容。

Completed in `bootstrap-0.4.536`: `src/browser/runtime/control-login-runtime.js` owns native login gate interception, manual login bypass, login suppress status, snapshot-gate display/status, and `startLinuxDoLogin` guarding; `src/browser/runtime/login-point-safety-runtime.js` owns login-point safety persistence, dynamic radius, damage evidence, probe recording, reset, and login-point recording; `src/browser/runtime/post-login-zoom-runtime.js` owns post-login visible-range fit, zoom controls, wheel/fallback clicks, and unavailable-self handling. `src/browser/runtime/control-flow-runtime.js` now composes these through three factories and is down to 3,410 lines. `scripts/verify-objective-build.js` rejects these bodies returning to `control-flow-runtime.js`, requires the three new modules in the direct esbuild graph, and reports 27 checks across 60 runtime modules.

### 5. Control-flow Pending-exit And Leave Flow Split - Completed

目标：

- 从 `control-flow-runtime.js` 拆出 pending exit 记录/确认/重试、403 risk hold、Clash leave rescue、leave command、auto-login、offline/injury/pursuit/combat leave wrappers。

主要文件：

- `src/browser/runtime/control-flow-runtime.js`
- 新增 `src/browser/runtime/pending-exit-runtime.js`
- 新增 `src/browser/runtime/leave-flow-runtime.js`
- 新增 `src/browser/runtime/clash-leave-rescue-runtime.js`

验证重点：

- pending-exit persistence key、retry display、combat-cover clamping、leave 403 rescue order 不变。
- exit audit flush block、important session end flush block、safe/unsafe relogin wait timing 不变。

Completed in `bootstrap-0.4.537`: `src/browser/runtime/pending-exit-runtime.js` owns pending-exit cloning, retry summaries, skip/intent helpers, persistence updates, local confirmation, leave-success reload confirmation, leave-403 snapshot recovery, confirmation, combat-cover wait, retry scheduling, and `handlePendingExit()`; `src/browser/runtime/clash-leave-rescue-runtime.js` owns Clash leave rescue hook/proxy/retry state, pending-exit last-result updates, leave-detail confirmation, async leave request completion, and `issueLeaveCommand()`; `src/browser/runtime/leave-flow-runtime.js` owns pending combat-leave retry state, pursuit tracking summaries/actions, auto/manual login, and offline/injury/pursuit/combat/enemy-hold leave wrappers. `src/browser/runtime/control-flow-runtime.js` now composes these through three factories and is down to 1,614 lines. `scripts/verify-objective-build.js` rejects those bodies returning to `control-flow-runtime.js`, requires the three new modules in the direct esbuild graph, and reports 28 checks across 63 runtime modules.

### 6. Native State And Transport Split - Completed

目标：

- 从 `native-state-runtime.js` 拆出 native/page state access、snapshot observer、entity/coin/bullet normalization、movement/shoot transport、native tick/message pump。

主要文件：

- `src/browser/runtime/native-state-runtime.js`
- 新增 `src/browser/runtime/native-data-runtime.js`
- 新增 `src/browser/runtime/native-transport-runtime.js`
- 新增 `src/browser/runtime/realtime-normalizers.js`

验证重点：

- combat target/aim/fire 仍只使用 native/realtime visible authority。
- direct native WebSocket movement/shooting dispatch、local key/prediction sync、repeat constants 不变。

Completed in `bootstrap-0.4.538`: `src/browser/runtime/native-data-runtime.js` owns WebSocket ready-state helpers, page-native snapshot observer, native state/control access, native/realtime entity and coin source normalization, snapshot freshness gates, coin/bullet merge, fetch helper, self summary, and passive-only `refreshGlobalState()`; `src/browser/runtime/native-transport-runtime.js` owns native WS tick/message pump, control summary/sync, local and direct-WS movement state, stop-motion after exit, velocity repeat, action velocity dispatch, aim, native/direct shoot, combat shot metrics, and fallback WS send. `src/browser/runtime/native-state-runtime.js` now composes these through two factories and is down to 1,233 lines, retaining session, stall, and network-quality bodies for the next split. `scripts/verify-objective-build.js` rejects data/transport bodies returning to `native-state-runtime.js`, requires both new modules in the direct esbuild graph, and reports 29 checks across 65 runtime modules.

### 7. Session, Stall, And Network Quality Split - Completed

目标：

- 从 `native-state-runtime.js` 拆出 session/today session 统计、server-position/action-settlement stall、network-quality latency/loss/damage/shot/movement samples。

主要文件：

- `src/browser/runtime/native-state-runtime.js`
- 新增 `src/browser/runtime/session-stats-runtime.js`
- 新增 `src/browser/runtime/stall-diagnostics-runtime.js`
- 新增 `src/browser/runtime/network-quality-runtime.js`

验证重点：

- panel today/current login 指标、daily stamina delta 修正、network quality pill/status、combat-log network diagnostics 保持兼容。

Completed in `bootstrap-0.4.539`: `src/browser/runtime/session-stats-runtime.js` owns current-login and today-session stamina/coin/kill accounting; `src/browser/runtime/stall-diagnostics-runtime.js` owns server-position stall and action-settlement stall summaries/assessment; and `src/browser/runtime/network-quality-runtime.js` owns latency/loss frame samples plus movement/shot/damage ACK tracking. `src/browser/runtime/native-state-runtime.js` now composes native data, native transport, session stats, stall diagnostics, and network quality through five factories and is down to 376 lines. `scripts/verify-objective-build.js` rejects session/stall/network bodies returning to `native-state-runtime.js`, requires the three new modules in the direct esbuild graph, and reports 29 checks across 68 runtime modules.

### 8. Logging And Important Records Split - Completed

目标：

- 拆分 combat-log endpoint/queue/flush/exit-audit 与 important-log store/session/active-combat/kill attribution。
- 保留日报依赖的 per-login statistics 和 per-active-player-combat statistics 字段。

主要文件：

- `src/browser/runtime/combat-log-runtime.js`
- `src/browser/runtime/important-logging-runtime.js`
- 新增 `src/browser/runtime/combat-log-queue-runtime.js`
- 新增 `src/browser/runtime/exit-audit-runtime.js`
- 新增 `src/browser/runtime/important-session-runtime.js`
- 新增 `src/browser/runtime/kill-attribution-runtime.js`

验证重点：

- `combat-log-service` 测试通过。
- daily summary 的 login statistics、active-player combat statistics、actual battle profit reporting 字段保持兼容。

Completed in `bootstrap-0.4.540`: `src/browser/runtime/combat-log-queue-runtime.js` owns combat-log endpoint configuration, pending entry keys, pending persistence, queueing, flushing, and combat-log status summaries; `src/browser/runtime/exit-audit-runtime.js` owns persisted exit audit logs, pending audit counts, audit/session-end flush blockers, important-session close before login/reload, and `recordExitAuditEvent()`; `src/browser/runtime/important-session-runtime.js` owns important log store/remote queue, per-login session records, active-player combat summaries, and `recordImportantCombatTick()`; and `src/browser/runtime/kill-attribution-runtime.js` owns attack memory, kill identity matching, kill history, chat/snapshot kill message collection, and `updateKillHistory()`. `src/browser/runtime/combat-log-runtime.js` now composes queue and exit-audit through two factories and is down to 1,305 lines; `src/browser/runtime/important-logging-runtime.js` composes session and kill-attribution through two factories and is down to 76 lines. `scripts/verify-objective-build.js` rejects those bodies returning to the large logging modules, requires the four new modules in the direct esbuild graph, and reports 29 checks across 72 runtime modules.

### 9. Profit Runtime Split - Completed

目标：

- 将 `profit-runtime.js` 拆为 coin tracking/safety、opportunity scoring/action、post-attack drop、final arbitration/target-switch diagnostics。
- 保持 survival priority band 与 ordinary profit ROI scoring 的分离。

主要文件：

- `src/browser/runtime/profit-runtime.js`
- 新增 `src/browser/runtime/profit-coin-runtime.js`
- 新增 `src/browser/runtime/profit-opportunity-runtime.js`
- 新增 `src/browser/runtime/profit-post-attack-runtime.js`
- 新增 `src/browser/runtime/profit-arbitration-runtime.js`

验证重点：

- visible/native coins 和 visible/native AFK targets 仍优先于 snapshot fallback。
- final action arbitration、target-stick/switch hysteresis、target-switch diagnostics/status/misc logging 不变。

Completed in `bootstrap-0.4.541`: `src/browser/runtime/profit-coin-runtime.js` owns coin motion options, pickup failure counts, approach locks, coin diagnostics, threat filtering, realtime/local/field/distant/high-value coin pickers, and high-value coin priority gates; `src/browser/runtime/profit-opportunity-runtime.js` owns stamina budget helpers, snapshot coin wait/fallback helpers, coin/enemy opportunity scoring, AFK stamina cooldown, route opportunity choice, stable opportunity choice, and profitable combat target comparison; `src/browser/runtime/profit-post-attack-runtime.js` owns post-attack drop wait plus coin/enemy action builders; and `src/browser/runtime/profit-arbitration-runtime.js` owns coin target helpers, incidental pickup tracking, collected-coin marking, coin progress state machine, final action arbitration, and target-switch diagnostics. `src/browser/runtime/profit-runtime.js` now composes those four modules and is down to 161 lines. `scripts/verify-objective-build.js` rejects those bodies returning to `profit-runtime.js`, requires the four new modules in the direct esbuild graph, and reports 29 checks across 76 runtime modules.

### 10. Combat Runtime Split And Final Guard Tightening - Completed

目标：

- 将 `combat-runtime.js` 拆成 target/offline safety、movement/pressure/trend、aim/fire、leave-cover/action builder。
- 最后收紧 verifier，设置 entry 和大模块防回流检查。

主要文件：

- `src/browser/runtime/combat-runtime.js`
- 新增 `src/browser/runtime/combat-target-runtime.js`
- 新增 `src/browser/runtime/combat-movement-runtime.js`
- 新增 `src/browser/runtime/combat-aim-runtime.js`
- 新增 `src/browser/runtime/combat-action-runtime.js`
- `scripts/verify-objective-build.js`
- `docs/agent/test-coverage.md`

验证重点：

- native/realtime visible combat target、aim、fire anchor 保持。
- replay self-tests 通过。
- 若拆分触及行为判断或战斗记录驱动变更，必须运行对应 battle replay 并证明改进。

Completed in `bootstrap-0.4.542`: `src/browser/runtime/combat-target-runtime.js` owns combat engagement state, offline safety, active-combat wait, target selection, engaged target retention, defensive/profit target gating, opportunistic AFK shot helpers, combat tick-gap offline state, native tick combat interval, and tick-reentry combat-gap handling; `src/browser/runtime/combat-movement-runtime.js` owns incoming bullet pressure, threat-field scoring, strafe locks, spacing, pressure close/reengage/finish movement, passive-runner close movement, pressure threat summaries, and out-of-range dodge action; `src/browser/runtime/combat-aim-runtime.js` owns motion samples, opponent profile, trade estimate, shooting plan, no-damage aim widening, live/native aim source, dynamic aim strategy, intercept solve, and `combatAimTarget()`; and `src/browser/runtime/combat-action-runtime.js` owns `combatLeaveCoverAction()` and `buildCombatAction()`. `src/browser/runtime/combat-runtime.js` now composes those four modules and is down to 189 lines. `scripts/verify-objective-build.js` rejects those bodies returning to `combat-runtime.js`, requires the four new modules in the direct esbuild graph, keeps combat target/aim/fire native/realtime-visible checks on the new modules, adds line-budget guards for runtime-entry and major composition modules, and reports 30 checks across 80 runtime modules.

## 每次实施提交的共同要求

- 优先机械迁移，避免在同一提交中调整策略阈值或行为。
- 每次只拆一个清晰边界，并在 verifier 增加对应 owner anchor。
- 改代码时运行完整 release validation：

```bash
node grasp-rat-bot.js --self-test
node scripts/objective-status.js --self-test
node --check grasp-rat-bot.js
node --check scripts/build-remote-bot.js
node --check scripts/objective-status.js
node --check scripts/verify-objective-build.js
cd combat-log-service && npm test
node scripts/build-remote-bot.js --version bootstrap-0.4.xx
node scripts/verify-objective-build.js
```

- 文档-only 计划或索引更新至少运行：

```bash
git diff --check
```

## 完成标准

- `runtime-entry.js` 只保留 entry composition、domain factory wiring、startup promise export。
- 最大域模块不再集中承载多个独立子域；control-flow/combat/native/profit/logging 至少拆到可独立审查的 owner 模块。
- verifier 可以阻止旧 source-string 层、入口大函数、以及已迁出子域回流。
- combat 可见性规则和 profit 优先级规则保持不变，除非单独行为提交按 replay/自测证明收益。
