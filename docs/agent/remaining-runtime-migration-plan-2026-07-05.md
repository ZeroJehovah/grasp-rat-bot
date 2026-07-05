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

进度更新到 `bootstrap-0.4.535`：

- `src/browser/runtime-entry.js`: 2,139 行。
- `src/browser/runtime/*.js`: 57 个可执行运行时模块，约 22,614 行。
- `scripts/verify-objective-build.js`: 632 行，当前报告 26 项检查，并覆盖 public API/status、entity-state、exit-detail、entry-glue 的 owner 防回流检查。
- 10 次实施提交中已完成 3 次，剩余 7 次。

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

### 5. Combat 域模块仍包含多个可独立验证的子域

`combat-runtime.js` 目前集中承载：

- combat engagement state、offline safety、active combat wait。
- target selection、engaged target、defensive/profit target gating。
- bullet pressure、threat field、strafe、spacing、close/reengage/finish pressure。
- motion samples、opponent profile、trade estimate、combat trend。
- shooting plan、aim source、dynamic/live/intercept strategy。
- leave cover 和 final combat action builder。

这里的拆分风险最高。后续提交必须保持结构性迁移为主；只要触碰行为判断，应按战斗记录变更规则跑离线 replay 并证明收益。

### 6. Profit 域模块仍可继续按机会选择链路拆分

`profit-runtime.js` 已把 coin/opportunity/final arbitration 从入口迁出，但仍混合：

- coin direction/motion options、pickup failure、approach lock。
- coin safety、distant/high-value coin、AFK stamina cooldown。
- opportunity scoring、route/choice/current held choice、enemy opportunity。
- post-attack drop wait/coin、coin action/enemy action。
- incidental pickup、mark collected、coin progress action。
- final action arbitration 和 target-switch diagnostics。

后续可以拆成 coin tracking、opportunity scoring/action、post-attack、arbitration 四个内部模块。

### 7. Logging 与 UI 长尾模块仍有拆分空间

- `combat-log-runtime.js` 仍包含 combat-log endpoint、exit audit、frame/session 队列、flush/persist/diagnostics 等。
- `important-logging-runtime.js` 同时负责 important store、remote queue、session record、active combat record、kill attribution、chat/drop kill confirmation。
- `target-overlay.js` 同时包含 overlay state、login-point overlay、entity/coin rendering 和 DOM/canvas lifecycle。

这些不是构建迁移阻塞项，但会影响日报字段维护、日志字段兼容和 UI 变更审查。

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
- [ ] Control-flow Login Gate And Login-point Safety Split
- [ ] Control-flow Pending-exit And Leave Flow Split
- [ ] Native State And Transport Split
- [ ] Session, Stall, And Network Quality Split
- [ ] Logging And Important Records Split
- [ ] Profit Runtime Split
- [ ] Combat Runtime Split And Final Guard Tightening

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

### 4. Control-flow Login Gate And Login-point Safety Split

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

### 5. Control-flow Pending-exit And Leave Flow Split

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

### 6. Native State And Transport Split

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

### 7. Session, Stall, And Network Quality Split

目标：

- 从 `native-state-runtime.js` 拆出 session/today session 统计、server-position/action-settlement stall、network-quality latency/loss/damage/shot/movement samples。

主要文件：

- `src/browser/runtime/native-state-runtime.js`
- 新增 `src/browser/runtime/session-stats-runtime.js`
- 新增 `src/browser/runtime/stall-diagnostics-runtime.js`
- 新增 `src/browser/runtime/network-quality-runtime.js`

验证重点：

- panel today/current login 指标、daily stamina delta 修正、network quality pill/status、combat-log network diagnostics 保持兼容。

### 8. Logging And Important Records Split

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

### 9. Profit Runtime Split

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

### 10. Combat Runtime Split And Final Guard Tightening

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
