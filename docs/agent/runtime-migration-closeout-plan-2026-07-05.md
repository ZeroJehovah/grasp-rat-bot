# 运行时迁移收尾计划 - 2026-07-05

本文从 `main` 当前状态（最新远程版本 `bootstrap-0.4.542`）出发，复核现有迁移说明、当前代码结构和验证脚本，给出剩余待迁移或可收尾内容，以及建议的提交拆分。

## 已读取的基线

- `docs/agent/runtime-bundler-migration-plan-2026-07-05.md`: 旧 browser source-string fragment/bundler 迁移已在 `bootstrap-0.4.524` 完成。
- `docs/agent/runtime-entry-domain-migration-plan-2026-07-05.md`: 18k 行直接运行时入口的域迁移已在 `bootstrap-0.4.532` 完成。
- `docs/agent/remaining-runtime-migration-plan-2026-07-05.md`: `.533` 到 `.542` 的二次拆分计划已全部完成。
- `docs/agent/current-state.md`: 当前最新版本为 `bootstrap-0.4.542`，战斗运行时二级拆分和最终 guard tightening 已落地。
- `docs/agent/test-coverage.md`: 当前 self-test/static/replay 覆盖说明记录 objective build verifier 为 30 项检查。
- `scripts/verify-objective-build.js`: 当前已检查直接入口、旧 source-string 层缺失、owner 防回流、native/realtime combat 锚点、visible/native profit 优先级、entry/composition 大模块行数预算、80 个 runtime 模块进入 esbuild graph。

## 当前事实

严格按前两轮迁移目标统计，剩余必需迁移项为 0。

- 旧源码字符串生成层剩余 0：`src/browser/*source.js`、`src/browser/runtime-fragment-registry.js`、`src/browser/runtime-source.js`、`src/browser/runtime-entry-source.js` 均不存在。
- 生产远程构建和本地 CDP/eval 注入均直接打包 `src/browser/runtime-entry.js`。
- `src/browser/runtime-entry.js` 当前 2,139 行，低于 verifier 的 2,200 行预算。
- `src/browser/runtime/*.js` 当前 80 个可执行运行时模块，合计约 24,670 行。
- `scripts/verify-objective-build.js` 当前 905 行，报告 30 项检查。

当前最大的可收尾模块：

| 文件 | 行数 | 判断 |
| --- | ---: | --- |
| `src/browser/runtime/orchestration-runtime.js` | 2,553 | 最大剩余模块，混合 recent movement、return-block、`classify()`、`chooseAction()`、`tick()`、startup。 |
| `src/browser/runtime-entry.js` | 2,139 | 已是 composition entry，但 wiring/callback forwarding 很密集，接近 2,200 行预算。 |
| `src/browser/runtime/control-flow-runtime.js` | 1,614 | 已低于 1,700 行预算，主要是子模块组合层。 |
| `src/browser/runtime/combat-log-runtime.js` | 1,305 | 仍混合 frame/schema 构造、runtime summary、misc diagnostics、pre-buffer 和 tick logging。 |
| `src/browser/runtime/combat-target-runtime.js` | 1,228 | 混合 target selection、engagement、offline/tick-gap、damage trend。行为相邻，拆分需谨慎。 |
| `src/browser/runtime/combat-movement-runtime.js` | 1,076 | 混合 bullet threat field、strafe、spacing、pressure close/reengage/finish movement。行为相邻，拆分需谨慎。 |
| `src/browser/runtime/combat-aim-runtime.js` | 906 | 混合 motion profile、shooting plan、live/native aim source、dynamic/intercept aim。行为相邻，拆分需谨慎。 |
| `src/browser/runtime/target-overlay.js` | 603 | UI 长尾，混合 DOM/canvas lifecycle、projection、target resolution、login-point overlay drawing。 |

## 剩余可收尾内容

### 1. 文档收口

当前 `docs/agent/*` 中的主迁移说明已经能表达 `.524`、`.532`、`.542` 三个完成节点，但部分测试覆盖和历史重构文档仍包含旧 `*source.js`、`runtime-source.js`、`runtime-fragment-registry.js` 的当前式表述。它们多数是历史记录，不应重写历史，但当前覆盖说明应避免让后续维护者误以为旧 source layer 仍存在。

收尾目标：

- 将当前有效说明集中到 agent docs 索引和本计划。
- 在 `docs/agent/test-coverage.md` 的当前覆盖段落中保留 `.542` 事实，历史段落明确为 pre-`.524` 背景。
- 不大规模改写 `docs/REFACTORING_COMPLETE.md` 这类历史文档，除非后续阅读者明确需要。

### 2. 防回流 guard 从 composition 层扩展到二级大模块

Verifier 已有 `runtime-entry.js`、`combat-runtime.js`、`profit-runtime.js`、`native-state-runtime.js`、`control-flow-runtime.js` 的行数预算，也有很多 owner anchors。后续收尾的关键是先固定当前二级模块基线，防止在拆分前继续膨胀。

收尾目标：

- 给 `orchestration-runtime.js`、`combat-log-runtime.js`、`combat-target-runtime.js`、`combat-movement-runtime.js`、`combat-aim-runtime.js`、`target-overlay.js` 增加软预算或 owner anchor。
- 每完成一次拆分，就把对应预算收紧，而不是只靠人工记忆。
- 继续检查旧 source-string adapter 不得恢复。

### 3. Orchestration runtime 继续拆分

`orchestration-runtime.js` 是当前最值得收尾的模块。它已经从入口迁出，但仍是新的小型 monolith，且职责边界清楚：

- Recent movement 和 return-block safety helper。
- `classify()` 负责实体/威胁/机会分类。
- `chooseAction()` 负责安全、战斗、收益、恢复、等待的候选动作组合。
- `tick()` 和 `startRuntime()` 负责 tick lifecycle、startup、interval/callback 调度。

收尾目标：

- 将 survival/return-block helper 从普通 action selection 中分离。
- 将 `classify()`/`chooseAction()` 的决策构建与 tick 调度分离。
- 最终让 `orchestration-runtime.js` 成为 orchestration composition，而不是继续承载完整 tick/decision body。

### 4. Combat log runtime 拆分

`combat-log-runtime.js` 当前还承载两类变化频率不同的逻辑：

- Frame/schema/runtime summary 构造：影响 daily report、combat replay、log analyzer。
- Misc diagnostics：coin diagnostics、target-switch diagnostics、network-quality diagnostics 等。

收尾目标：

- 把 combat frame/session schema 相关代码迁入独立 owner，降低 daily report 字段回归风险。
- 把 misc diagnostics 记录迁入独立 owner，避免诊断扩展继续撑大 combat-log 主模块。
- 保持 `combat-log-service` daily summary 依赖的 per-login 和 per-active-player-combat 字段不变。

### 5. UI overlay 长尾

`target-overlay.js` 已不是迁移阻塞项，但 UI 逻辑仍混合 projection、target resolution、login-point overlay 和 DOM/canvas lifecycle。这个拆分风险低于战斗逻辑，但收益也低于 orchestration/combat-log。

收尾目标：

- 只有在需要改 overlay 或进一步压缩 runtime graph 时拆。
- 拆分时保持 manual pause overlay removal、post-exit suppression、login-point overlay state 不变。

### 6. Combat 二级模块暂不作为本轮必做项

`combat-target-runtime.js`、`combat-movement-runtime.js`、`combat-aim-runtime.js` 仍然偏大，但它们承载行为相邻的判断。按项目规则，战斗逻辑优化必须保守；如果没有战斗记录显示清晰判断错误，不应为了行数继续改行为。

收尾目标：

- 本轮只加预算/owner guard，避免继续膨胀。
- 只有当后续战斗记录、replay 或明确维护需求要求时，再拆出 target trend、tick-gap/offline safety、threat-field、pressure movement、aim source/intercept 等二级 owner。
- 若拆分造成任何行为变化，必须按 combat change validation 跑对应 replay；结构性等价拆分至少跑完整 release validation。

## 建议提交计划

建议本轮用 7 次后续提交完成“迁移收尾”。当前这份计划文档提交不计入下面 7 次。

如果每次都需要远程发布，可从 `bootstrap-0.4.543` 顺延到 `bootstrap-0.4.549`；实际版本号以落地时 `main` 状态为准。每个代码提交应包含对应 build outputs 和 docs/current-state 更新，避免代码和版本说明脱节。

实施状态：

- [x] Commit 1 - Docs Current-State Closeout
- [x] Commit 2 - Post-Migration Guard Baseline
- [x] Commit 3 - Extract Orchestration Safety Helpers
- [x] Commit 4 - Extract Decision Selection Runtime
- [x] Commit 5 - Extract Tick And Startup Runtime
- [x] Commit 6 - Split Combat Log Frame And Diagnostics Owners
- [ ] Commit 7 - Final Closeout Guards And Handoff

### Commit 1 - Docs Current-State Closeout

目的：

- 将 `.524`、`.532`、`.542` 后的迁移状态整理成当前可读的 handoff。
- 更新 `docs/agent/test-coverage.md` 中仍像当前事实一样描述旧 source layer 的段落，把它们标记为历史覆盖背景或移到历史说明。
- 确认 `docs/agent/README.md` 指向本收尾计划。

主要文件：

- `docs/agent/README.md`
- `docs/agent/test-coverage.md`
- 必要时补充 `docs/agent/current-state.md`

验证：

```bash
git diff --check
```

Completed after `bootstrap-0.4.542`: `docs/agent/README.md` already points to this closeout plan, and `docs/agent/test-coverage.md` now separates current direct-entry verifier coverage from the pre-`bootstrap-0.4.524` source-fragment coverage archive.

### Commit 2 - Post-Migration Guard Baseline

目的：

- 在 `scripts/verify-objective-build.js` 中增加二级大模块基线预算。
- 给 `orchestration-runtime.js`、`combat-log-runtime.js`、combat 二级模块和 `target-overlay.js` 建立“不得继续膨胀”的防线。
- 保持旧 source-string 层缺失检查和 80 runtime modules graph 检查。

主要文件：

- `scripts/verify-objective-build.js`
- `docs/agent/test-coverage.md`
- `docs/agent/current-state.md`

验证：

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

Completed after `bootstrap-0.4.542`: `scripts/verify-objective-build.js` now keeps the existing size-guard check but extends it to the current large second-level modules: `orchestration-runtime.js`, `combat-log-runtime.js`, `combat-target-runtime.js`, `combat-movement-runtime.js`, `combat-aim-runtime.js`, and `target-overlay.js`.

### Commit 3 - Extract Orchestration Safety Helpers

目的：

- 从 `orchestration-runtime.js` 拆出 recent movement、flee direction、return-block radius/scan、return-block pressure 和 `blockThreatReturnAction()`。
- 让 survival/return-block safety helper 有独立 owner，避免和 ordinary profit/decision scoring 混在同一文件继续增长。

建议模块：

- 新增 `src/browser/runtime/orchestration-safety-runtime.js`，或更窄命名为 `return-block-runtime.js`。

主要文件：

- `src/browser/runtime/orchestration-runtime.js`
- 新增 safety/return-block runtime module
- `scripts/verify-objective-build.js`
- `docs/agent/current-state.md`

验证重点：

- Return-block safety 仍保持 priority/hard-gate 语义，不变成 coin-per-stamina scoring。
- Verifier 拒绝 `markRecentMovement()`、`returnBlockRadius()`、`buildReturnBlockScanAction()`、`blockThreatReturnAction()` 回流 `orchestration-runtime.js`。

Completed in `bootstrap-0.4.543`: `src/browser/runtime/orchestration-safety-runtime.js` now owns recent movement, flee direction/lock, return-block radius/scan/pressure helpers, threat merging/picking, and `blockThreatReturnAction()`. `src/browser/runtime/orchestration-runtime.js` composes the safety module and is down to 2,173 lines while retaining `classify()`, `chooseAction()`, `tick()`, and startup bodies for Commit 4/5. `scripts/verify-objective-build.js` rejects safety bodies returning to entry/orchestration, tightens orchestration to a 2,200-line budget, adds a 450-line safety budget, and reports 31 checks across 81 runtime modules. Release commit: `85ff011`; manifest SHA-256: `b40c77b7fd6647960437e36fd0589b93a875a69021b1d4b7e0f94a8e193abc7e`.

### Commit 4 - Extract Decision Selection Runtime

目的：

- 从 `orchestration-runtime.js` 拆出 `classify()` 和 `chooseAction()`。
- 保留现有 action builders，只迁移决策组合层；不做策略阈值、收益模型或目标选择调参。

建议模块：

- 新增 `src/browser/runtime/decision-selection-runtime.js`。

主要文件：

- `src/browser/runtime/orchestration-runtime.js`
- 新增 decision selection runtime module
- `scripts/verify-objective-build.js`
- `docs/agent/current-state.md`

验证重点：

- Combat target/aim/fire 仍只用 native/realtime visible state。
- Ordinary profit 仍优先 realtime/native visible coins 和 visible/native AFK targets，再 snapshot fallback。
- Verifier 的 visible/native profit priority anchors 跟随新的 owner 模块。

Completed in `bootstrap-0.4.544`: `src/browser/runtime/orchestration-decision-runtime.js` now owns `classify()` and `chooseAction()` while `src/browser/runtime/orchestration-runtime.js` composes safety/decision modules and is down to 1,321 lines. `scripts/verify-objective-build.js` rejects decision bodies returning to entry/orchestration, moves visible/native-before-snapshot profit anchors to the decision module, tightens orchestration to a 1,350-line budget, adds a 1,160-line decision budget, and reports 32 checks across 82 runtime modules. Release commit: `cacd516`; manifest SHA-256: `4fde72e55cc6e73e2b9e6d49e035fe9a6cf589effd1e711930caa0ddd93e07e1`.

### Commit 5 - Extract Tick And Startup Runtime

目的：

- 从 `orchestration-runtime.js` 拆出 `tick()`、tick reentry/lifecycle 调度和 `startRuntime()`。
- 让 `orchestration-runtime.js` 收敛为组合模块，主要负责装配 safety、decision、tick/startup runtime。

建议模块：

- 新增 `src/browser/runtime/runtime-tick-loop.js`，或 `src/browser/runtime/orchestration-tick-runtime.js`。

主要文件：

- `src/browser/runtime/orchestration-runtime.js`
- 新增 tick/startup runtime module
- `scripts/verify-objective-build.js`
- `docs/agent/current-state.md`

验证重点：

- `runtime-entry.js` 仍只调用 `orchestrationRuntime.startRuntime()` 或等价 thin startup API。
- Tick safety、callback safety、native tick interval、post-login startup、panel/overlay update cadence 不变。
- 收紧 `orchestration-runtime.js` 行数预算，使其不再承载完整 tick body。

Completed in `bootstrap-0.4.545`: `src/browser/runtime/orchestration-tick-runtime.js` now owns `tick()` and `startRuntime()`, including tick reentry/lifecycle handling, startup restore/install flow, startup refresh, timer creation, startup error fallback, final action dispatch, and tick-end combat/important-log recording. `src/browser/runtime/orchestration-runtime.js` composes safety, decision, and tick modules and is down to 325 lines. `scripts/verify-objective-build.js` rejects tick/startup bodies returning to entry/orchestration, tightens orchestration to a 360-line budget, adds a 1,280-line tick budget, and reports 32 checks across 83 runtime modules. Release commit: `6f8595f`; manifest SHA-256: `eb0df51f0a30691cf787871679966339de05f49676f22f448837e3d16c1dfe64`.

### Commit 6 - Split Combat Log Frame And Diagnostics Owners

目的：

- 从 `combat-log-runtime.js` 拆出 combat frame/entity/bullet/metric/schema 构造。
- 从 `combat-log-runtime.js` 拆出 misc diagnostics logging：coin diagnostics、target-switch diagnostics、network-quality diagnostics。
- `combat-log-runtime.js` 保留 queue、exit audit、frame owner、diagnostics owner 的 composition。

建议模块：

- 新增 `src/browser/runtime/combat-log-frame-runtime.js`。
- 新增 `src/browser/runtime/combat-log-diagnostics-runtime.js`。

主要文件：

- `src/browser/runtime/combat-log-runtime.js`
- 新增 combat-log frame/diagnostics runtime modules
- `scripts/verify-objective-build.js`
- `docs/agent/current-state.md`
- `docs/agent/combat-logging.md`
- `docs/agent/test-coverage.md`

验证重点：

- `combat-log-service` 测试通过。
- Daily report 的 per-login statistics 和 per-active-player-combat statistics 字段不变。
- Verifier 拒绝 frame/schema 和 misc diagnostics body 回流 `combat-log-runtime.js`。

Completed in `bootstrap-0.4.546`: `src/browser/runtime/combat-log-frame-runtime.js` now owns combat-log self/entity/bullet summaries, combat frame metrics, global/decision/login/runtime summaries, timed frame building, trigger/suspend classification, and `buildCombatLogEntry()`. `src/browser/runtime/combat-log-diagnostics-runtime.js` owns coin diagnostics, target-switch diagnostics, and network-quality diagnostic log throttling/queueing. `src/browser/runtime/combat-log-runtime.js` composes queue, frame, diagnostics, and exit-audit modules while retaining session/prebuffer orchestration and `recordCombatLogTick()`. `scripts/verify-objective-build.js` rejects frame/diagnostics bodies returning to combat-log runtime, tightens the combat-log composition budget to 450 lines, adds 940/260-line frame/diagnostics budgets, and reports 32 checks across 85 runtime modules. Release commit: `180c1b7`; manifest SHA-256: `1242569ab5494c850abe0df7f2687f8ccc714d17b453b2b18129a84202952ba3`.

### Commit 7 - Final Closeout Guards And Handoff

目的：

- 根据 Commit 3-6 的实际结果，收紧 verifier 行数预算和 owner anchors。
- 更新 docs，把本轮 closeout 标为完成，并记录最终最大模块、runtime module count、objective verifier check count、最新版本和 manifest hash。
- 明确 combat 二级模块、target overlay、entry wiring 的后续策略：默认不继续为行数拆，只有在行为维护、UI 维护或预算压力出现时再单独处理。

主要文件：

- `scripts/verify-objective-build.js`
- `docs/agent/current-state.md`
- `docs/agent/test-coverage.md`
- `docs/agent/runtime-migration-closeout-plan-2026-07-05.md`

验证：

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
git diff --check
```

## 不纳入本轮完成标准的候选项

以下不是当前迁移收尾阻塞项，建议记录但不主动做：

- `src/browser/runtime-entry.js` wiring consolidation：当前 2,139 行，仍低于预算；除非新增 wiring 会突破 2,200 行，否则不为美观单独重排。
- Combat target/movement/aim 深拆：行为相邻，只有在战斗记录或 replay 明确支持时再做。不能为了减少行数改变策略。
- `target-overlay.js` 深拆：UI 长尾，只有后续 overlay 维护时顺手拆。
- 全量重写历史文档：`docs/REFACTORING_COMPLETE.md` 等历史文件可保留当时上下文；当前 handoff 文档更重要。

## 每次代码提交共同要求

- 优先机械迁移，不夹带策略阈值、战斗调参或收益模型调整。
- 每个新 owner 模块都要有 verifier anchor；迁出的 body 不允许回流到原大模块。
- 每次 release slice 均更新 `docs/agent/current-state.md` 的版本、manifest hash、latest release commit、release note 和 live-validation target。
- 每次 build 变更均提交 `grasp-rat-bot.js`、`dist/grasp-rat-remote-bot.js`、`dist/manifest.json` 和相关 docs。
- 如果 combat 行为有任何变化，按 `AGENTS.md` 的 replay 要求运行对应离线 replay；没有战斗记录时至少运行现有 replay self-tests。

## 完成标准

- 旧 source-string 层保持删除状态。
- `runtime-entry.js` 保持 thin composition entry，且低于 verifier 行数预算。
- `orchestration-runtime.js` 不再承载完整 safety、decision、tick、startup body。
- `combat-log-runtime.js` 不再同时承载 frame/schema 和 misc diagnostics body。
- Verifier 同时覆盖 source-layer absence、direct entry graph、owner anchors、module size guards、native/realtime combat anchors、visible/native profit priority anchors。
- 文档能清楚区分历史迁移记录、当前事实和未来条件触发项。
