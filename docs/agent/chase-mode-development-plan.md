# Chase Mode Development Plan

猎杀模式用于让用户手动标记一个或多个高 Drop 敌方玩家，并让脚本在不破坏现有生存、战斗、回血、退出逻辑的前提下，把这些目标当作高优先级收益目标处理。本文是开发计划，不包含实现代码。

## Goals

- 在脚本面板“当前时间”行末尾增加猎杀面板开关。
- 在现有信息面板右侧显示/隐藏一个样式一致的新猎杀面板。
- 猎杀面板列出当前游戏中的高价值敌方玩家：`Drop >= 10`。
- 面板候选来自视野/native/render/realtime 数据和快照/minimap/global 状态的合并视图。
- 列表显示“Drop 最高的 10 个”和“距离最近的 10 个”的并集，按玩家去重，最多 20 个。
- 每个玩家展示名称、血量、Drop、距离、来源/状态提示，以及猎杀/取消操作。
- 用户可同时标记多个猎杀目标，脚本按距离近到远选择可猎杀目标。
- 猎杀行为优先级高于普通 `amount=1` 金币和挂机玩家击杀，但低于现有战斗、回血、退出与安全逻辑。
- 目标在游戏内但射程外时向其靠近；目标在射程内且 native/realtime/render 可见时进入现有战斗目标流程。
- 猎杀状态跨页面刷新保留；敌方或己方下线不自动清除。
- 成功击杀、目标 Drop 降到 10 以下、目标进入白名单时自动清除猎杀状态。
- 连续猎杀时，猎杀成功后必须优先拾取该目标爆出的金币。

## Terminology

- **Chase mode / 猎杀模式**：本文新增功能的内部名称，代码建议使用 `chaseMode`。不要使用 `pursuit` 命名，避免和现有“被追击退出”逻辑混淆。
- **Chase target / 猎杀目标**：用户手动标记为猎杀中的敌方玩家。
- **High-value enemy / 高价值敌方玩家**：`Drop >= chaseMinDrop`，初始默认 `10`，且不是自身、不是白名单玩家。
- **Visible/native target / 可战斗目标**：来自 native/realtime/render 数据、非 minimap-only、在当前 combat target policy 允许范围内的敌人。只有这类目标能被用于战斗目标、瞄准和开火。
- **Snapshot/minimap target / 远程位置目标**：来自快照、minimap 或全局状态的敌人。只能用于面板展示和赶路接近，不能用于战斗目标、瞄准或开火。

## Non-Goals And Guardrails

- 不改变退出、回血、低血劣势、网络离线、登录点安全、被追击退出等生存逻辑的优先级。
- 不允许对白名单玩家发起猎杀。面板按钮应显示说明文案，运行时如发现已持久化白名单目标，必须自动清除。
- 不使用 snapshot/minimap 数据进行 combat target、aim 或 fire 决策。远程数据只能驱动 `seek-enemy` 式接近动作。
- 不为某个具体玩家名或单次战斗窗口定制逻辑。
- 不把猎杀做成纯 coin-per-stamina 分数压过生存行为；它只进入 profit band，并带更高的 profit 优先级。
- 不在旧 `grasp-rat-bot.js` monolith 中新增浏览器运行时行为。

## User Experience Plan

### Main Panel Button

修改 `userscript/grasp-rat-bootstrap.user.js` 和 `extension/page-bootstrap.js` 的面板渲染：

- 在“当前时间”行末尾放置一个紧凑图标按钮，位于 151m/502m 视野按钮之后。
- 按钮只显示猎杀图标；数量和状态放在 `title`/`aria-label` 中。
- 按钮样式沿用当前时间行旁边的图标控件：深色半透明背景、`rgba(148,163,184,.24)` 边框、约 22px 圆形尺寸。
- 按钮状态：
  - 面板隐藏：普通灰蓝边框。
  - 面板显示：高亮边框和轻微 glow。
  - 存在猎杀目标：使用 amber/red 强调背景。

点击按钮只切换猎杀面板显示状态，不直接改变猎杀目标。

### Chase Panel Placement

新面板应由 bootstrap A 层创建，因为现有可见脚本面板也是 A 层负责渲染：

- DOM id 建议：
  - `grasp-rat-chase-panel`
  - `grasp-rat-chase-panel-style` 如需独立样式块
- 位置：信息面板右侧。
  - 桌面宽度充足时：`position: fixed` 或和现有 panel 同步定位，`left/right` 根据现有 panel `getBoundingClientRect()` 计算，宽度建议 336px。
  - 窄屏或右侧空间不足时：面板可覆盖在主面板右侧附近或贴右，避免超出 viewport。
- 样式跟随现有面板：暗色半透明、边框、紧凑字体、section 分隔线、8px 半径，不使用独立花哨主题。
- 面板显示状态可放在 bootstrap A 的 localStorage，例如 `graspRatChasePanelVisible`，只影响 UI 展开/收起，不影响猎杀目标状态。

### Chase Panel Content

面板结构建议：

- 顶部标题行：`猎杀目标`，右侧显示候选数量和猎杀中数量。
- 列表区最多 20 行，按以下策略排序：
  - 默认优先显示正在猎杀中的目标。
  - 其他候选按 `猎杀中 desc -> Drop desc -> distance asc -> name` 排序，或使用两个小分组“高 Drop / 最近”。
  - 需求要求“Drop最高10个”和“距离最近10个”的并集；排序可读性可以按上述规则处理，但候选集合必须来自这两个集合的 union。
- 每行字段：
  - 名称：优先 `name`，缺失时 `#user_id`。
  - HP：已知血量；未知显示 `HP ?`。
  - Drop：整数；Drop 未知或低于阈值的猎杀目标仅在“猎杀中但暂不可用”状态显示。
  - 距离：从当前 self 到目标坐标；未知显示 `距离 ?`。
  - 来源/状态提示：`视野`、`快照`、`minimap`、`离线/未刷新`、`白名单`、`体力不足`、`射程内` 等短文本。
  - 操作：
    - 非猎杀、非白名单、`Drop >= 10`：`猎杀`。
    - 已猎杀：显示炫酷但克制的 `猎杀中` 标签，并显示 `取消` 按钮。
    - 白名单：按钮替换为 `白名单` 或 `不可猎杀`，禁用。
    - Drop 低于 10：如果不是已猎杀候选，不显示；如果已猎杀但刚发现 Drop 低于 10，运行时应清除，UI 下一帧消失或显示清除状态。

“猎杀中”标签建议使用小型 pill：红/amber 渐变边框、微弱 glow、字重 800，不使用大面积动画，避免影响游戏视野和性能。

## Runtime API Plan

在远端 runtime B 的 bot API 中新增方法，供 bootstrap A 点击按钮调用：

- `setChaseTarget(target, options)`
  - 输入包含 `id/user_id`、`name`、`drop`、`x`、`y`、`hp`、来源信息。
  - 只接受非白名单、`Drop >= chaseMinDrop` 的目标。
  - 写入持久化猎杀状态。
- `clearChaseTarget(id, reason)`
  - 手动取消或自动清理单个目标。
- `clearAllChaseTargets(reason)` 可选。
- `summarizeChaseModeStatus()`
  - 返回猎杀目标、候选列表、当前选择、不可猎杀原因、最近自动清理原因。

`status()` 中新增 `chaseMode` 字段，bootstrap A 每次面板刷新直接读取：

```js
{
  enabled: true,
  minDrop: 10,
  activeCount: 2,
  panelCandidates: [...],
  targets: [...],
  selectedTarget: {...} | null,
  lastClear: {...} | null,
  lastDecision: {...} | null
}
```

需要保证扩展和 userscript 两套 A 层都能调用同一套 B 层 API。若 B 脚本尚未加载，A 层按钮仍可打开面板，但操作按钮显示 `等待脚本`。

## Persistence Plan

猎杀目标状态应放在 browser runtime B 层持久化，不依赖 A 层 UI 是否展开：

- localStorage key 建议：`graspRatChaseModeTargets`
- 数据结构：

```json
{
  "version": 1,
  "updatedAt": 1783330000000,
  "targets": [
    {
      "id": "12345",
      "name": "Enemy",
      "dropAtMark": 18,
      "lastDrop": 18,
      "lastHp": 80,
      "lastX": 100,
      "lastY": 200,
      "lastDistance": 32000,
      "lastSeenAt": 1783330000000,
      "lastSource": "native",
      "markedAt": 1783330000000,
      "markedBy": "panel"
    }
  ]
}
```

Hot update preservation should also include `bot.chaseMode`, similar `targetSwitchDiagnostics` and `postLoginZoom`:

- `src/shared/browser-preserved-state.js` 保存热更新内存状态。
- `src/browser/runtime/runtime-bot-state.js` 初始化时从 preserved 或 localStorage 读取。
- 手动设置、手动取消、自动清理后立即写回 localStorage。

下线和刷新页面不清理猎杀目标。只有明确条件清理：

- 用户点击取消。
- 目标进入白名单。
- 观测到同一目标 Drop 明确低于 `chaseMinDrop`。
- 成功击杀目标。
- 可选：持久化记录损坏或 id 无效。

## Candidate Aggregation Plan

新增纯策略模块建议：`src/strategy/chase-mode.js`。

职责：

- 规范化候选目标。
- 合并 native/render/realtime、snapshot/global、minimap 数据。
- 按 `user_id` 去重；没有 id 的数据不允许作为可猎杀目标，只能做诊断。
- 选择面板候选集合：Drop top 10 union nearest top 10。
- 选择当前猎杀目标：已猎杀目标中距离最近且可行动的目标。
- 计算猎杀动作的 stamina 预算需求和不可行动原因。

候选合并优先级：

1. native/render/realtime 坐标和 HP 优先，因为它们代表当前可见状态。
2. snapshot/global 可补充远处位置、Drop、HP 元数据。
3. minimap 可补充远处位置和 Drop，但通常没有名称/HP，显示时保留未知字段。
4. 对同一玩家，Drop 使用最新明确值；如果来源时效接近，保守取较高值用于面板展示，但清理 Drop 低于阈值必须只在新鲜、明确、同 id 数据上执行。

过滤条件：

- 排除自身。
- 排除死亡/非存活实体。
- 排除白名单。
- 面板普通候选必须 `Drop >= chaseMinDrop`。
- 猎杀中目标即使暂时不可见也保留在 `targets`，但不进入可行动候选。

状态字段建议：

- `source`: `native` / `render` / `realtime` / `snapshot` / `minimap` / `persisted`
- `visible`: native/render/realtime 且非 minimap-only
- `attackableNow`: visible、在 `combatAttackRange` 内、非 invulnerable、非白名单、符合现有 combat target gate
- `seekableNow`: 有可信坐标、非白名单、Drop 未明确低于阈值、体力预算允许
- `stale`: 最后观测超过配置时长

## Decision Integration Plan

集成点建议在 `src/browser/runtime/orchestration-decision-runtime.js`，但纯判断放入 `src/strategy/chase-mode.js`。

### Priority Position

猎杀动作应插入在以下逻辑之后：

- pending exit / leave / offline / no-self 控制流。
- 已在战斗、defensive combat、active threat wait。
- low HP/recovery 逻辑。
- post-attack drop coin 和 post-attack wait。
- 长周期体力不足导致退出。
- invulnerable/active safety flee。

猎杀动作应插入在以下普通收益逻辑之前：

- foot coin / near coin 中普通 `amount=1` 金币。
- ordinary opportunity AFK Drop target。
- distant/local ordinary coin seeking。
- opportunistic AFK shot wait。

高价值可见金币、脚下金币、猎杀之间存在边界：

- 需求明确猎杀高于“普通金额=1金币”和“挂机玩家击杀”，但未要求高于高价值金币。
- 建议保守处理：`amount >= highValueCoinPriorityAmount` 的高价值可见金币仍保留现有优先级；`amount=1` 或普通安全金币低于猎杀。
- 战斗后掉落金币必须高于猎杀，保证“猎杀后一定要拾取爆出的金币”。

### Action Shapes

射程外/视野外接近：

```js
{
  kind: 'seek-enemy',
  reason: 'chase-mode-approach',
  chaseMode: true,
  target: { id, name, x, y, drop, hp, distance, source },
  dx,
  dy,
  score,
  staminaCost,
  opportunityChoice: { type: 'chase-target', ... }
}
```

射程内且 visible/native 可战斗：

- 不直接手写开火。
- 将猎杀目标交给现有 `buildCombatAction()` / combat target selection 路径，或新增受控入口 `pickChaseCombatTarget()`，最终仍产出 `combat: true` action。
- action reason 可为 `chase-mode-combat`，但瞄准和 fire 必须继续使用 native/realtime/render 坐标。

如果目标只有 snapshot/minimap 数据且距离显示在射程内，也不能开火；需要继续 seek 或 wait 到 visible/native 确认。

### Multiple Targets

当存在多个猎杀中目标：

- 对当前可行动目标按距离由近到远排序。
- 距离相同或切换频繁时使用短 stick/hysteresis，避免每 tick 在两个目标间抖动。
- 已经进入 combat 的猎杀目标应保持到现有 combat disengage/stop-loss 清除，不因为另一个猎杀目标更近而打断战斗。

### Stamina Budget

“长周期体力不足以完成赶路+击杀则忽略目标”建议使用现有估算：

- 路程成本：`distance * movementCostMsPerCm`，沿用 opportunity stamina budget 的 `1ms/cm` 估计。
- 击杀成本：优先使用 `opportunityEnemyStaminaCost(target)`；若目标 Active/HP 已知，使用保守 kill estimate。
- 预算窗口：使用 `opportunityLongStaminaBudget(self)` 或同时检查 1h/1d。
- 当 `travelCost + killCost` 超过长周期预算，目标状态标记 `staminaBlocked`，不进入行动候选；面板显示 `体力不足`。

猎杀目标被忽略不代表清除猎杀状态。体力恢复后可重新进入可行动候选。

## Post-Kill Drop Pickup Plan

成功击杀猎杀目标后需要两个动作：

1. 清除猎杀状态。
2. 保证爆出金币优先拾取。

现有 `attackHistory`、`post-attack-drop`、`drop-matched-kill` 已经支持战斗后掉落优先。新增逻辑应：

- 在猎杀 attack/combat action 上标记 `chaseMode.targetId/drop/name`。
- 击杀确认或目标消失/Drop coin 匹配时，把该记录写入现有 attack history，确保 `postAttackDropCoin` 和 `postAttackDropWaitTarget` 能优先拾取。
- 如需要新增字段，只扩展现有 attack history item，不重复实现一套掉落追踪。
- 对连续猎杀，post-attack drop coin 和 wait 必须先于下一个 chase approach/combat 执行。

## Whitelist Plan

白名单必须在 UI 和 runtime 双层保护：

- 面板候选聚合时直接排除白名单；如果需要展示猎杀中但已白名单的旧目标，显示 `白名单，已清除` 并触发清理。
- `setChaseTarget()` 二次检查 `isWhitelistedTarget()`，失败返回 `{ ok:false, reason:'target-whitelisted' }`。
- `chooseAction()` 每 tick 维护猎杀目标时，如果目标当前名称命中白名单，自动清除。
- 面板按钮对已知白名单玩家显示 `白名单` / `不可猎杀`，不可点击。
- 白名单只按当前项目规则匹配用户名，不按 user id 匹配。

## Module Change Plan

预计新增：

- `src/strategy/chase-mode.js`
  - 候选合并、排序、目标选择、预算判断的纯函数。
- `src/browser/runtime/chase-mode-runtime.js`
  - localStorage 持久化、API 方法、status summary、runtime glue。

预计修改：

- `src/browser/runtime-entry.js`
  - 引入 chase mode runtime，加入 domain context。
- `src/browser/runtime/runtime-domain-contexts.js`
  - 增加 `chase` context，避免把依赖塞进大 map。
- `src/browser/runtime/runtime-bot-state.js`
  - 初始化 `bot.chaseMode`。
- `src/shared/browser-preserved-state.js`
  - hot update 保存猎杀状态。
- `src/browser/runtime/bot-api-runtime.js`
  - 暴露 `setChaseTarget`、`clearChaseTarget`、`clearAllChaseTargets`，`status()` 返回 `chaseMode`。
- `src/browser/runtime/orchestration-decision-runtime.js`
  - 在上述优先级位置插入 chase action selection。
- `src/browser/runtime/profit-arbitration-runtime.js` 或相关 profit modules
  - 如猎杀接入 opportunity/final arbitration，需要确保 focus key、score、reason 可诊断。
- `src/strategy/action-priority.js`
  - 如果新增 action kind，确保仍归入 `profit` band；combat action 仍归入 `combat` band。
- `userscript/grasp-rat-bootstrap.user.js`
  - 当前时间行图标按钮、猎杀面板 DOM、调用 bot API。
- `extension/page-bootstrap.js`
  - 同步当前时间行图标按钮、猎杀面板 DOM、调用 bot API。
- `src/shared/runtime-defaults.js`
  - 新增配置默认值。
- `docs/agent/config-defaults.md`
  - 记录新增默认值。
- `docs/agent/strategy-summary.md` 和 `docs/agent/data-model.md`
  - 实现完成后补充策略和状态模型。

建议新增默认值：

- `chaseMinDrop = 10`
- `chasePanelTopDropLimit = 10`
- `chasePanelNearestLimit = 10`
- `chasePanelMaxCandidates = 20`
- `chaseTargetPersistMax = 20`
- `chaseSnapshotMaxAgeMs = 15000` 或沿用现有 snapshot freshness。
- `chaseMinimapMaxAgeMs = 15000` 或沿用现有 minimap freshness。
- `chaseTargetStickMs = 3000`
- `chaseKillStaminaBudgetMs = 100000` 可先复用 proactive Active kill budget。

## Testing Plan

### Pure Strategy Tests

在 `src/strategy/self-test.js` 或新增测试入口覆盖：

- Drop top 10 与 nearest top 10 并集去重，最多 20 个。
- native/render 数据覆盖 snapshot 坐标，snapshot 补充缺失 Drop/HP。
- 白名单目标不能进入候选，也不能被 set。
- 猎杀中目标 Drop 明确低于 10 时产生 clear intent。
- 多猎杀目标按距离选择，stick window 内不抖动。
- snapshot/minimap 目标只能产生 seek，不能产生 combat/fire。
- 体力预算不足时目标被忽略但不清除。
- 成功击杀 clear target，并保留 post-attack drop pickup intent。

### Runtime/API Tests

- `setChaseTarget` 写入 localStorage，刷新/hot update 后恢复。
- `clearChaseTarget` 删除单个目标并写回。
- status `chaseMode.panelCandidates` 字段对 A 层足够渲染。
- 白名单更新后自动清除已猎杀目标。
- B 未加载时 A 层 UI 不抛错。

### UI Verification

用浏览器/CDP 或 Playwright 在测试页面验证：

- “当前行为”行右侧按钮不挤压文字，长行为文本下不重叠。
- 猎杀面板在桌面宽度显示在主面板右侧。
- 窄屏下猎杀面板不超出 viewport，按钮和文字不溢出。
- 猎杀中标签、取消按钮、白名单禁用态可读。
- userscript 和 extension 两套 bootstrap 都一致。

### Existing Validation Gate For Implementation

实现猎杀模式后按 runtime/strategy 改动完整跑：

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

如果改动 `runtime-entry`、bundler、runtime helper entry 或生成脚本 B 路径，还需运行：

```bash
npm run test:runtime-helper-entry
npm run test:remote-bundled
```

如果猎杀逻辑基于具体战斗记录调整战斗策略，还必须按 `AGENTS.md` 的 combat replay 要求跑对应离线 replay。首次实现若没有具体战斗记录，运行现有 self-tests 和 runtime tests 即可。

## Implementation Sequence

1. 新增 `src/strategy/chase-mode.js` 和纯测试，先解决候选合并、排序、预算、清理 intent。
2. 新增 `src/browser/runtime/chase-mode-runtime.js`，实现持久化、API、status summary。
3. 接入 runtime state preservation 和 `status()` 输出，但暂不改变行动决策；验证面板数据可读。
4. 实现 userscript/extension 面板按钮与猎杀面板，支持 set/clear API。
5. 在 orchestration decision 中接入 chase action，先只做 seek/combat target handoff，不改 combat aim/fire。
6. 接入 post-kill clear 和 post-attack drop pickup 保障。
7. 增加 reason 文案、诊断字段、docs 更新。
8. 完整验证、build release、更新 `docs/agent/current-state.md` 后提交推送。

## Open Questions For Implementation

- 高价值可见金币是否应继续高于猎杀：本计划建议保留现有高价值金币优先级，只让猎杀高于普通 `amount=1` 金币和 AFK 击杀。
- 远程目标的 snapshot/minimap 时效阈值：建议先沿用现有 freshness，若面板出现陈旧目标再调小。
- 猎杀目标 Drop 低于 10 的清理是否要求 native/realtime 确认：本计划建议“明确同 id 新鲜数据”即可，native 优先，snapshot 可作为远处清理依据但需要 freshness。
- 猎杀目标下线很久是否要过期：需求要求下线和刷新不清除，因此不设自动过期；只在 UI 标注 `未刷新`。
