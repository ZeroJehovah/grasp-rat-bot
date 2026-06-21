# Gold Runner 参考分析

分析日期：2026-06-19

参考项目：`https://github.com/jzcangshu/grasp-rat-gold-runner`

参考提交：`4e97561853e403982466589bc34544bb6201e96a`（`feat: add mobile userscript variant`）

本项目基线：远程 bot `bootstrap-0.4.184`，当前策略以 `docs/agent/strategy-summary.md` 为准。

## 范围

本文只整理 `jzcangshu/grasp-rat-gold-runner` 中值得参考的设计点，并结合当前 Grasp Rat Bot 的逻辑判断取舍。本任务不改运行代码。

目标仓库未发现 `LICENSE` 文件，`package.json` 里也标记了 `"private": true`。后续即使采纳某些思路，也应按本项目现有风格重新实现，不直接复制源码。

关键参考位置：

- 桌面脚本常量与主结构：<https://github.com/jzcangshu/grasp-rat-gold-runner/blob/4e97561853e403982466589bc34544bb6201e96a/src/grasp-rat-gold-runner.user.js#L35-L83>
- 弹体归一化与交战躲避：<https://github.com/jzcangshu/grasp-rat-gold-runner/blob/4e97561853e403982466589bc34544bb6201e96a/src/grasp-rat-gold-runner.user.js#L1572-L1902>
- 自动攻击与连发火控：<https://github.com/jzcangshu/grasp-rat-gold-runner/blob/4e97561853e403982466589bc34544bb6201e96a/src/grasp-rat-gold-runner.user.js#L1904-L2182>
- 金币短路线规划：<https://github.com/jzcangshu/grasp-rat-gold-runner/blob/4e97561853e403982466589bc34544bb6201e96a/src/grasp-rat-gold-runner.user.js#L2185-L2488>
- overlay 坐标换算与绘制：<https://github.com/jzcangshu/grasp-rat-gold-runner/blob/4e97561853e403982466589bc34544bb6201e96a/src/grasp-rat-gold-runner.user.js#L2595-L2888>
- 主循环优先级：<https://github.com/jzcangshu/grasp-rat-gold-runner/blob/4e97561853e403982466589bc34544bb6201e96a/src/grasp-rat-gold-runner.user.js#L3107-L3227>
- 行为说明：<https://github.com/jzcangshu/grasp-rat-gold-runner/blob/4e97561853e403982466589bc34544bb6201e96a/docs/behavior.md>

## 项目定位

Gold Runner 是一个 Tampermonkey userscript 项目，桌面和手机端脚本分离。桌面脚本约 3.4k 行，手机端脚本约 3.3k 行，发布方式基本是把 `src/` 同步到 `dist/`。

它的核心定位是“交互式辅助脚本”：

- 自动扫描可见金币并巡航拾取；
- 根据高 Drop 和移动迹象规避潜在危险玩家；
- 提供临时交战模式；
- 提供默认关闭的自动攻击；
- 提供攻击目标锁定列表；
- 支持右键坐标、手机长按坐标；
- 支持按用户名片段追杀；
- 用单个 canvas 绘制目标线、威胁线和战斗标记。

当前 Grasp Rat Bot 的定位不同，更接近“远程发布的全自动策略系统”：

- 有远程 bot、bootstrap、manifest 和发布版本流；
- 运行时优先通过原生页面 WebSocket 直接发送 `vel` / `shoot`；
- 有生存优先的退出、重登抑制、敌人/离线等待和 exit audit；
- 战斗、瞄准、开火坚持 native/realtime 可见状态；
- 普通收益流优先 native/realtime 可见金币和可见 AFK Drop；
- 有体力 ROI、机会评分、目标持有、combat-log、分析器、日报和 replay 验证。

因此，Gold Runner 最有参考价值的是“可见金币短路线”和“交互/观测层”的处理方式，不适合直接作为战斗或发布架构模板。

## 值得借鉴

### P0：可见金币短路线规划

这是目标项目最值得吸收的点。

Gold Runner 的做法：

- 先构建安全金币候选池；
- 从单点高分、近距离、高金额、密集金币团中选 route anchor；
- 按密度决定路线长度，稠密时最多规划 6 个点；
- 评分综合金币金额、预估路程、周边金币密度、转向惩罚、目标点安全和路径中点安全；
- 当前路线有轻微稳定偏置，路线上的当前金币消失后会推进到下一个点并触发重评估。

当前 bot 已有体力感知的单机会评分、post-attack 掉落金币优先、snapshot field migration、目标持有和切换滞后，但还没有把一组 native 可见金币当作一个短路线机会来评分。这里可以减少“吃完一个金币后原地重新选目标”的回头路和目标抖动。

推荐后续适配方式：

- 只作用于 native/realtime 可见金币；
- 放在生存、战斗、foot coin、post-attack coin、可见 AFK Drop 之后；
- 不把本地权威半径内的 snapshot coin 纳入路线；
- 按整条路线计算移动体力和近距离拾取/brake 成本，而不是只看第一段 ROI；
- 任一路段被 active/invulnerable threat 阻断时立即废弃路线；
- 当前首目标短暂缺失时可以复用现有 missing-hold 机制，但不能长期追失效路线；
- decision/log 中记录 route ids、route value、route stamina cost、leg count、route kind、替换或保持原因。

验证建议：

- self-test：3 个顺路金币团应击败稍近的单金币；
- self-test：路径中点靠近 active/invulnerable threat 时应拒绝路线；
- self-test：整条路线体力预算不足时应拒绝路线；
- live log：比较 coin target switch 次数、拾取后回头距离和单位体力收益。

### P1：金币路径安全不只看终点

Gold Runner 在金币评分和路线评分里不仅检查金币坐标，也检查当前位置到目标点的中点安全。这个思路适合本项目的多金币路线和长距离迁移场景。

当前 bot 已有 active/invulnerable coin danger radius、heading block、lane block。后续可以把这些能力扩展到“路线段”：

- 复用现有 `coinBlockedByThreat` 语义；
- 对每个 route leg 做安全判断；
- 距离较长时不只采样中点，可以做少量分段采样；
- 拒绝原因需要可观测，例如 `coin-route-leg-threat-block`。

### P1：轻量 debug overlay 模式

Gold Runner 的 overlay 实现比较克制：

- 单个透明 canvas；
- `requestAnimationFrame` 刷新；
- 设备像素比有上限；
- 优先用页面原生 `worldToScreen` / `viewParams`；
- 不反复重建 DOM 或 SVG；
- 不接管鼠标事件。

当前 bot 已有 target overlay，但 Gold Runner 的可视信息更丰富，可以作为 debug-only 扩展参考：

- 当前路线/目标线；
- 可见威胁线；
- 危险范围威胁线；
- 战斗中低 HP 目标标记。

适配边界：

- 只能作为观测/调试层，不作为行为数据源；
- 默认关闭或只在调试配置下启用；
- 坐标仍以 native/render 可见状态解析；
- 确认退出、exit motion stop、重登等待时应自动隐藏。

### P1：显式操作者意图层

Gold Runner 的右键坐标、手机长按坐标、用户名追杀都和普通金币巡航分层，优先级在生存/体力之后、普通金币之前。

这不适合作为当前全自动 bot 的默认行为，但适合以后做“调试/验证命令层”：

- 临时 waypoint，用来验证移动、拾取、路线规划；
- 按用户名跟随，用来复现追击或遭遇场景；
- 临时目标锁定，用来做短窗口战斗实验。

适配边界：

- 默认关闭；
- 生存、exit hold、防御战斗、active-threat wait 必须高于人工目标；
- 只在当前会话短期有效；
- 确认退出后默认清除，不跨 exit 持久化。

### P2：Drop 排行和用户名补全

Gold Runner 会合并 entity Drop、minimap point Drop 和 `state.userNames`，并避免把 `User <id>` 这类生成名当真实用户名。

当前 bot 已经有战斗、退出和日报上下文，但显示层仍可借鉴：

- 日报敌方名称补全；
- live panel 最近敌人上下文；
- 重复敌人退出等待摘要；
- 未来 debug target search。

适配边界：

- 优先用于显示和报告，不用于战斗权威；
- 记录 Drop 来源：native entity、render entity、snapshot 或 minimap；
- 继续禁止用账户 `coins` 字段当黄色 Drop。

### P2：移动端独立入口原则

Gold Runner 没有把手机端适配塞进桌面脚本，而是做了独立 mobile userscript。这一点值得保留为未来方向。

如果本项目以后支持移动端 bootstrap/panel：

- 共用策略和 runtime helper；
- 单独维护移动端布局、触控和抽屉交互；
- 不为了移动端改乱桌面 panel。

## 有条件参考或已基本覆盖

### 弹体归一化

Gold Runner 会从 `start_x/start_y`、`dir_x_micros/dir_y_micros`、`speed_per_tick`、`created_tick`、`expire_tick` 还原弹体当前位置，并对非原生结构回退到位置差估速。

当前 bot 已有类似且更完整的 native/snapshot bullet normalization 和多弹体 threat field。这里主要作为检查清单：

- 确认 render bullet source 是否在所有需要的路径里覆盖；
- 保留 expire/range 过滤；
- owner 字段别名要继续健壮。

### 躲避候选评分

Gold Runner 对 9 个候选方向评分，包括原地不动，并在多个未来时间点综合弹体风险和距离带修正。当前 bot 的 threat field 已基于 8 个合法移动方向计算 CPA、direct-hit count 和 time-to-impact。

可选后续实验：

- 在低弹压、距离已经合适时，把 hold 作为 threat field 显式候选；
- 必须通过 replay 或 live log 验证，因为 hold 可能减少无意义漂移，也可能延误躲避。

### 手动移动接管

Gold Runner 在交战模式中检测用户 WASD，并暂停自己的自动躲避。当前 bot 通常无人值守，这不应进入默认逻辑。若以后有 live-debug/manual mode，可以参考它的分层方式。

### 高 Drop 与移动低 Drop 威胁

Gold Runner 把 Drop `> 10` 视为富敌危险，把 170m 内最近移动过的低 Drop 敌人也视为危险。当前 bot 已有更细的 Active、invulnerable、combat target 和 recovery 判断，不应退化成 Drop-only。

窄范围可用点：

- 当 join-mode/activity 字段缺失或陈旧时，recent movement 可以作为 caution fallback；
- 不能覆盖现有 native Active threat 和 combat target 逻辑。

## 不建议直接借鉴

### 鼠标事件连发火控

Gold Runner 的自动攻击通过 mouse event 长按连发 5 到 8 发，并加入覆盖偏移。当前 bot 已经通过原生 WebSocket 直接发送 `shoot`，并且有 replay 调整过的体力节制、quadratic/live intercept、低置信度降频和 finish pressure。

不建议采用的原因：

- mouse event 路径比 direct WebSocket 更慢、更不稳定；
- 5 到 8 发 burst 容易掏空 5s 体力，与 dodge reserve 冲突；
- 随机覆盖偏移不容易用 replay 做因果验证；
- 现有战斗日志已经围绕 direct shoot 和 aim strategy 建模。

可保留的只是“目标路径覆盖”这个概念，未来若实验也应放在现有体力门控和 replay 验证之后。

### 常态 HP 一下降就离开

Gold Runner 在非交战巡航中只要 HP 下降就点击离开。当前 bot 的生存逻辑更细：战斗劣势观察、pending exit cover、unsafe exit suppress、relogin hold、combat state 和 exit audit 都已经围绕实战日志迭代。

不应把当前逻辑简化成 any-HP-drop leave，否则容易放弃可控战斗，也会破坏现有退出审计语义。

### 以侧栏文本作为体力主权威

Gold Runner 读取 `.side` 文本里的 `1h体力限制` 并离开。当前 bot 已经直接读取 native stamina，并区分 1h、1d、5s 预算和重登等待。

文本检测最多作为兜底，不应替代 native stamina budget 和当前 relogin delay 逻辑。

### minimap/snapshot 参与战斗权威

Gold Runner 的 minimap 数据用于追杀 fallback 和 Drop 排行。这个适合显示或人工搜索，不适合本项目战斗。

当前规则保持不变：combat target、aim、fire 决策只能用 native/realtime 可见状态。

### 100 到 150m 交战距离带

Gold Runner 的临时交战模式倾向保持 100 到 150m。当前项目的战斗日志已经显示 105 到 145m 命中收益差，默认战斗距离已转向 45 到 65m，并且有 retreat-edge 和 finish-pressure 特例。

不建议把 100 到 150m 距离带导入当前 autonomous combat。

### `sendVelocity`/key-state 作为主控制通道

Gold Runner 用页面 key state 和 `sendVelocity(true)` 控制移动。当前 bot 已经用原生页面 WebSocket 直接发送 `vel`，同时同步页面 key/prediction 状态。现有控制通道更符合当前低延迟目标。

## 候选 Backlog

1. 新增 native-visible coin micro-route planner，作为普通收益流的新机会来源。
2. 给多金币路线和长距离迁移补 route-leg safety check。
3. 扩展 target overlay，增加可选 debug 路线线、威胁线和战斗标记。
4. 为报告/面板增加 Drop/name enrichment，合并 minimap 和 `state.userNames`。
5. 用 replay 或 live log 评估 combat threat field 的 hold 候选。
6. 考虑 debug-only manual waypoint 或 target search。
7. 若做移动端支持，保持移动端 bootstrap/panel 与桌面端分离。

## 建议的第一步

如果后续要真正实现，优先做 native-visible coin micro-route planner，而不是战斗或火控。

理由：

- Gold Runner 在普通金币巡航上的思路最完整；
- 不违反本项目 combat live-only 约束；
- 可以用 self-test 覆盖，不需要 CDP；
- 可以通过现有决策日志比较 target switch 和移动浪费；
- 不触碰高风险的 exit/relogin/combat 行为面。

未来实现约束：

- 需要单独任务授权后再改代码；
- 不复制 Gold Runner 源码；
- 继续把生存和战斗优先级放在路线之前；
- 路线长度必须小而有界；
- 整条路线评分必须体力感知；
- 发布前补 self-test。
