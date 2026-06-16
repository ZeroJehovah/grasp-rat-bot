# 战斗智能改进意见

> 本文是一次代码走查后的改进建议，针对 `grasp-rat-bot.js` 的战斗（combat）决策逻辑。
> 目标是把当前「启发式调参 + 离散方向控制」的打法，升级为「基于物理模型的预测式打法」。
> 文中所有函数名/常量名均来自当前 `grasp-rat-bot.js`，行号以走查时为准，迭代后可能漂移。

---

## 1. 项目功能速览

这是 `https://grasp-rat-game.h-e.top/`（囤囤鼠）网页游戏的浏览器端自动化脚本：

- **脚本 A（bootstrap）**：`userscript/grasp-rat-bootstrap.user.js` 或 `extension/`，每 10s 拉取 `dist/manifest.json`，校验 SHA-256 后注入脚本 B，并做看门狗热更新。
- **脚本 B（remote bot）**：`dist/grasp-rat-remote-bot.js`，由 `grasp-rat-bot.js` 经 `scripts/build-remote-bot.js` 生成，包含全部策略逻辑和原生页面 WebSocket 控制。
- **控制通道**：直接复用页面已有的 native WebSocket，`ws.send('vel dx dy')` 移动、`ws.send('shoot tx ty sx sy')` 射击，不创建第二条 socket。
- **战斗日志服务**：`combat-log-service/`，把交火窗口记成 JSONL，供离线 replay 与日报分析。

游戏关键物理常量（来自 `docs/agent/measured-parameters.md`）：

| 量 | 值 |
|---|---|
| 服务器 tick | `50ms` |
| 玩家速度 | 直线 `50cm/tick`、对角每轴 `35cm/tick` |
| 子弹速度 | `500cm/tick` |
| 子弹射程 | `15000cm` |
| 子弹命中半径 | `90cm` |
| 渲染延迟 | `100ms` |

这些常量是「物理建模」的全部输入。当前战斗逻辑只用到了其中一部分，且多以经验阈值的形式间接出现——这正是「不够智能」的根因。

---

## 2. 当前战斗逻辑的机制总结

走查后，战斗决策链路大致是：

1. **目标选择** `pickCombatTarget` / `combatTargetPriority`（约 1616/1651 行）
   按优先级打分排序：来袭子弹的主人 > 正在开火 > Active > drop 高 > 距离近。HP 劣势用静态阈值判定（`combatHpGapDisadvantaged`，`hpGap > combatHighHpDisadvantageGap`）。

2. **离场判定** `chooseCombatAction` / `buildCombatAction`（约 2389/15994 行）
   临界血、低血劣势、HP 差劣势、压制劣势、服务器卡位无伤害、目标撤退等条件触发离场或 cover。

3. **间距** `combatSpacingVector`（14901 行）
   太近或正在接近且距离 < preferred 时后退，输出 `dx/dy ∈ {-1,0,1}`（**8 向量化**）。

4. **闪避** `incomingBulletThreat` + `tangentMoveForBullet`（14696/14840 行）
   把所有子弹投影到「自身」坐标，按 lane 偏移与投影距离打分，**选最高威胁的单颗子弹**，朝其垂直方向做切线躲避，用 sign 锁定方向（`combatStrafeHoldMs`）。

5. **瞄准** `combatAimTarget` / `combatAimJitterLimit`（15773/15052 行）
   静止目标精确瞄准；移动目标取 `self→target` 向量旋转一个角度：
   `angle = sign*lead + 随机散布`，其中 `lead = jitterLimit * movement.leadScale * aimScale`，上限 `combatAimJitterMaxRadians = 0.14rad`（≈8°）。无伤害时加宽 jitter，或切到 precision/steady/live 几种策略。

6. **开火节流** `combatShootingPlan`（2317 行）
   正常 160ms、保留带 360ms、低于硬保留或需为闪避留体力时停火。

---

## 3. 核心问题诊断（按影响从大到小）

### 问题 1：瞄准是「角度偏转启发式」，不是「弹道拦截解算」⭐⭐⭐⭐⭐

这是当前最大的智能短板。

`combatAimTarget` 对移动目标的做法是：把指向目标当前位置的向量旋转一个不超过 `0.14rad` 的小角度（`lead` + 随机散布）。这本质上是「往目标横移方向偏一点」的拍脑袋提前量，存在三个根本缺陷：

- **提前量与子弹飞行时间无关**：真实需要的提前角取决于「子弹飞到目标要多久」「这段时间目标走多远」。在 145m 处，子弹飞行 ≈ `14500/500 = 29 tick = 1450ms`，目标若以 50cm/tick 横移，会移动 `29×50 = 1450cm`，对应的提前角 `atan(1450/14500) ≈ 0.0997rad`——已经逼近 0.14 上限；若目标在 50–75m 横移，所需提前角更大，**0.14rad 的硬上限会让远距离横移目标系统性脱靶**。战斗日志显示「105–145m 命中率远低于 30–75m」，根因正是远距离提前量算不准、且被上限截断。
- **只用了 `leadScale` 常数表**：`combatMovementAimMode` 里 `leadScale` 是 0.5/0.6/0.75/1.1 的经验系数，没有真正解算落点。
- **没有补偿渲染延迟**：渲染延迟 100ms = 2 个 tick，意味着「看到的目标位置」已落后真实位置约 `2×目标速度`。当前完全没补这一项。

**改进方案：闭式拦截解（quadratic intercept solution）**

把瞄准点从「当前位置」改为「预测命中点」：

```
设 self=S, 目标当前位置 P、速度矢量 V（cm/tick），子弹速度 B=500cm/tick。
渲染延迟补偿：P' = P + V * renderDelayTicks           // renderDelayTicks ≈ 2
求飞行 tick 数 t，使 |P' + V*t - S| = B*t：
  令 D = P' - S
  a = V·V - B²
  b = 2 * (D·V)
  c = D·D
  解 a t² + b t + c = 0，取最小正根 t
命中点 = P' + V * t
瞄准 = 命中点（再叠加一个随距离/目标机动性收缩的小随机散布，而非固定 lead）
```

- 当 `a ≈ 0`（目标速度接近子弹速度，本游戏不会发生）退化为 `t = -c/b`。
- 无正实根（追不上）时退化为当前的横移启发式。
- 散布项保留，但应**随拦截解置信度收缩**：目标匀速直线时散布趋近 0，目标频繁变向时适当加宽。

**涉及**：`combatAimTarget`（15773）、`combatMovementAimMode`（628/15xxx）、新增 `combatInterceptSolution(self, target)`；新增常量 `combatRenderDelayTicks=2`、`combatInterceptMaxTicks`（射程/子弹速 ≈ 30）。
**验证**：用 `combat-log-service` 对历史 105–145m 低命中战斗做 `npm run replay`，对比「估计命中数」应明显提升（AGENTS.md「Combat Change Validation」要求）。

---

### 问题 2：闪避只处理单颗子弹、且不预测「是否真的会被打中」⭐⭐⭐⭐

`incomingBulletThreat` 在多子弹场景里只返回 **score 最高的一颗**，`tangentMoveForBullet` 朝它垂直方向躲。两个问题：

- **弹幕下会顾此失彼**：躲开 A 子弹的切线方向，可能正好走进 B 子弹的弹道。代码里没有把多颗子弹的威胁合成一个方向场。
- **没有命中预测，导致无效闪避/过度闪避**：当前只看「lane 偏移 < `combatBulletLaneRadius`」就算威胁。但子弹命中半径只有 90cm，应该用「我以当前可达速度移动后，在子弹到达时刻能否离开命中半径」来判断**是否需要躲**、**往哪躲最省体力**。现在很可能在「其实躲不掉」或「其实不用躲」的情况下浪费体力位移。

**改进方案：子弹威胁势场 + 命中时间预测**

1. 对每颗来袭子弹计算 `timeToImpact` 与「最近接近距离 CPA（closest point of approach）」：若 CPA > 命中半径，本就打不中，**忽略**。
2. 对会命中的子弹，按 `1/timeToImpact` 加权，在自身周围采样若干候选移动方向（建议直接用连续角度，见问题 3），选「使所有逼近子弹 CPA 之和最大、且不撞向其它威胁/不利地形」的方向。
3. 把「最危险子弹的 timeToImpact」纳入开火决策：临门一脚（impact < 1 tick）优先位移，安全窗口才开火。

**涉及**：`incomingBulletThreat`（14696，改为返回威胁列表）、`tangentMoveForBullet`（14840）、新增 `bulletThreatField(self, bullets)`、`combatShootingPlan` 里加入「最近命中时间」输入。
**验证**：replay 选取多子弹交火窗口，对比自身 HP 损失应下降而目标伤害不减。

---

### 问题 3：移动控制被量化成 8 个方向⭐⭐⭐⭐

`combatSpacingVector`、`combatStrafeVector`、`combatPressureCloseVector` 全部用 `Math.sign(...)` 把方向压成 `dx/dy ∈ {-1,0,1}`，即只有 8 个移动方向。这让间距、切线闪避、压近三者都无法走「最优角度」，闪避尤其吃亏——切线躲避的理想方向往往不是 45°/90° 的整数倍。

**前置验证（重要）**：先用 CDP 确认 native `ws.send('vel dx dy')` 是否接受任意浮点方向向量。`measured-parameters.md` 记的「直线 50、对角 35cm/tick」暗示游戏可能内部把 vel 归一化再乘固定速度——若如此，传任意角度才有意义；若服务器只认离散键位方向，则 8 向是硬约束，本条作废。**AGENTS.md 要求 CDP 调试只在用户明确要求的当轮进行**，所以这一步需用户授权后再做。

**改进方案（验证通过后）**：

- 让 `combatStrafeVector` / `combatSpacingVector` 直接输出归一化的连续方向 `(dx, dy)`（浮点），由 `ws.send('vel ' + dx + ' ' + dy)` 下发。
- 闪避方向 = 子弹弹道法向（连续角度），而非量化后的对角线。
- 保留方向锁定时长（`combatStrafeHoldMs`）防抖，但锁定的是连续角度而非 sign。

**涉及**：`combatStrafeVector`（14796）、`combatSpacingVector`（14901）、`combatPressureCloseVector`、`mergeCombatMove`（15010）、直接控制下发处（搜索 `vel `）。
**验证**：先 `--self-test` 保证向量数值正确归一化；CDP 实测移动轨迹更顺滑、闪避脱靶率下降。

---

### 问题 4：目标取舍缺乏「胜率 / 交换比」模型⭐⭐⭐

`combatTargetPriority` 用「优先级分 + drop − 距离」选目标；离场判定用静态 HP 阈值（`combatHighHpDisadvantageGap` 等）。这套规则回答了「谁更值得打」「血差到多少该跑」，但没回答**「这一仗我大概率能赢吗？净收益是多少？」**

后果：

- 面对一个 HP 不占劣势但**命中率/机动性远强于我**的对手，静态血差判定不会触发离场，于是陷入长时间无伤害对耗（代码里只能靠 `combat-pressure-close`、加宽 jitter 等事后补救）。
- 对「打得过的肥羊」和「打得过但要耗光体力的硬骨头」一视同仁，没把**预计耗时/耗体力**算进收益。

**改进方案：轻量战斗结果预测**

定义一个可在线估计的「交换比」：

```
myDps     ≈ 命中率_me × 伤害/发 × 射速
enemyDps  ≈ 命中率_enemy × 伤害/发 × 射速   // 命中率_enemy 用最近窗口我方掉血速率反推
预计我击杀耗时 t_kill   = enemyHp / myDps
预计我被击杀耗时 t_death = myHp / enemyDps
若 t_death < t_kill × 安全系数 → 判定劣势，离场
净收益 = drop − (t_kill 期间体力消耗折算)
```

- `命中率_me` 用 `combatAimDamageState`（15296）已有的「掉血事件」在线统计：最近 N 秒内目标掉血次数 / 我开火次数。
- `命中率_enemy` 用自身掉血速率反推，无需读取对手内部状态。
- 这套模型把「无伤害时间过长」从**事后补救**变成**事前预测**：当预测交换比转负，直接走，而不是先加宽 jitter 再 pressure-close 再超时离场。

**涉及**：`combatTrendState`（2227/15407）、`combatHpGapDisadvantaged`（1636）、`pickCombatTarget`（1651）、新增 `combatTradeEstimate(self, target, history)`。
**验证**：replay 对历史「长时间无伤害最终离场」的战斗，新逻辑应**更早**做出离场决策、减少体力空耗。

---

### 问题 5：缺乏对手行为建模（AGENTS.md 明确要求的方向）⭐⭐⭐

AGENTS.md 规则：「分析对手的可能动态行为和意图，优先做能处理底层模式的通用策略改动，而不是只针对具名对手或精确记录窗口打补丁。」

当前代码确实没针对具名对手（很好），但也**几乎没有任何对手模式识别**。它把每个 tick 当成独立事件反应，没有「这个对手在做什么」的记忆。常见可识别模式：

- **规律性 strafe（左右横跳）**：若对手横移方向周期性翻转，提前量应瞄准其「翻转中点」而非当前速度外推。
- **kiting（边打边退）**：对手持续保持距离，`combatRetreatingTargetState`（15330）已能识别撤退并脱离，但没区分「真要走」和「拉扯放风筝」——后者应压近而非放弃。
- **对穿/绕圈**：可预测其圆周运动，瞄圆周切点。

**改进方案：维护对手短期运动指纹**

为当前交战目标维护一个滚动窗口（如最近 1–2s 的位置/速度样本），在线提取：

- 横移方向翻转频率 → 判定 strafe 周期性 → 切换到「瞄中点 + 收窄散布」。
- 径向速度符号稳定性 → 判定 kiting vs 真撤退 → 决定压近还是脱离。
- 速度自相关 → 匀速直线时拉满拦截解置信度。

把这个指纹喂给问题 1 的拦截解（决定散布大小）和问题 4 的胜率模型（决定是否纠缠）。

**涉及**：新增 `bot.combatTargetMotionHistory`、`combatOpponentProfile(target)`，被 `combatAimTarget`、`combatRetreatingTargetState`、`combatTradeEstimate` 共用。
**验证**：replay 含明显 strafe / kiting 的对手战斗，命中数提升或更合理脱离。

---

### 问题 6：开火节奏只看体力，不看「命中窗口」⭐⭐

`combatShootingPlan` 的开火/停火完全由体力预算驱动（160/360ms、保留带）。它没有「这一发大概率能打中吗」的概念，于是即便拦截解置信度很低（目标剧烈变向）也照常按节奏开火，白白消耗体力。

**改进方案**：把问题 1 的拦截解置信度、问题 5 的对手机动性纳入开火门控：

- 高置信（匀速、近距、对手指纹稳定）→ 正常甚至更快节奏。
- 低置信（剧烈变向、远距）→ 降频「点射」，把省下的体力留给闪避/压近。

**涉及**：`combatShootingPlan`（2317）增加 `aimConfidence` 输入，由 `combatAimTarget` 产出。
**验证**：replay 对比「每发命中所需体力」下降。

---

## 4. 网络同类项目参考

我搜索了网络上是否有囤囤鼠/grasp-rat 这款游戏的开源自动化脚本——**没有找到这款游戏专门的开源 bot**（它是小众游戏）。

退而求其次，同类 `.io` 多人射击/吞噬游戏的开源 bot 在「预测瞄准」和「威胁规避」上的通用思路可作参考。需说明：这些仓库的公开页面大多只有安装说明，**核心算法在未公开列出的源码文件里**，以下是该类 bot 公认的通用做法，而非逐行确认的实现：

- **PiotrDabkowski/diep_bot** — <https://github.com/PiotrDabkowski/diep_bot>
  diep.io 是与本游戏最接近的「子弹射击 + 躲避」品类。这类 bot 的标准做法正是**弹道拦截解算**（用子弹速度和目标速度矢量求飞行时间、瞄预测落点），印证了本文问题 1 的方向。
- **f26401004/Diep-io-Bot** — <https://github.com/f26401004/Diep-io-Bot>
  标称「AI bot」，同属 diep.io 预测瞄准 + 子弹规避思路。
- **willtc111/DiepioAimBot** — <https://github.com/willtc111/DiepioAimBot>
  纯 aimbot，聚焦提前量解算（基于截图模板匹配识别实体，本项目用 native 数据更优，无需视觉识别）。
- **Apostolique/Agar.io-bot** — <https://github.com/Apostolique/Agar.io-bot>
  agar.io 经典 bot，其「威胁 vs 收益」的方向场决策思路可借鉴到本文问题 2（子弹威胁势场）与问题 4（收益模型）。

关键启示：成熟的 .io 战斗 bot 的「智能」基本都来自**两个物理模型**——拦截预测（打得准）和威胁势场（躲得开），而不是靠堆叠经验阈值。本项目已有非常细致的状态机和体力/收益管控（这部分做得比上述开源项目都扎实），**真正欠缺的恰恰是这两个底层物理模型**。补上它们，性价比最高。

---

## 5. 落地优先级路线图

建议按「投入产出比」分阶段推进，每阶段都遵守 AGENTS.md 的 replay 验证门槛：

| 阶段 | 内容 | 风险 | 依赖 |
|---|---|---|---|
| **P0** | 问题 1：弹道拦截解算替换角度启发式 | 低（纯数值，self-test 可覆盖） | 无 |
| **P0** | 问题 2：多子弹威胁势场 + 命中预测 | 低 | 无 |
| **P1** | 问题 5：对手运动指纹 | 中 | 喂给 P0 |
| **P1** | 问题 6：命中置信度门控开火 | 低 | 依赖 P0 |
| **P1** | 问题 4：交换比/胜率离场模型 | 中 | 部分依赖 P1 指纹 |
| **P2** | 问题 3：连续方向移动 | 中（需 CDP 先验证 vel 接受任意角度） | 用户授权 CDP |

**P0 两项是最高优先级**：它们是纯数值改造，能用 `--self-test` 和离线 replay 充分验证，无需碰 live 页面，且直接命中「命中率低、白挨打」这两个最痛的点。

每条改动落地后，务必按 AGENTS.md 执行：
```bash
node grasp-rat-bot.js --self-test
node scripts/objective-status.js --self-test
cd combat-log-service && npm test
# 针对被引用战斗做 replay，证明命中数/生存有具体提升
npm run replay -- --file <jsonl> --start-line <a> --end-line <b> --self-id <id> --target-id <id>
```
replay 若无改善则继续迭代，不要直接发版。
