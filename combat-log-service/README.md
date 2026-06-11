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

日志默认写入：

```text
combat-log-service/logs/YYYY-MM-DD/<combatId>.jsonl
```

## 参数

```bash
node server.js --host 127.0.0.1 --port 18765 --dir ./logs
```

`--max-body-bytes` 可以提高单次批量 POST 的最大请求体，默认 8 MiB。

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

分析已收集的 JSONL，检查退出原因是否写入顶层 `exit`，以及非安全退出是否至少保留 60 秒重连等待：

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
npm run monitor:current
npm run monitor:current -- --since now --latest 10
npm run monitor -- --min-version bootstrap-0.4.101 --latest 10
npm run monitor -- --since now --min-version bootstrap-0.4.101 --latest 10
```

`validate:current` 会额外要求至少存在一条当前 manifest 版本日志；没有匹配日志时返回非零退出码，用来区分“无问题”和“还没有验证证据”。

用于自动检查时可以让问题返回非零退出码：

```bash
npm run analyze -- --fail-on-issue
npm run analyze:current -- --require-entries --fail-on-issue
```

验证审计器自身的版本过滤和问题识别逻辑：

```bash
npm test
```

审计会标记：

- `missing-top-level-exit`: 日志帧只有旧的 `enemyExit`/决策原因，没有顶层 `exit` 摘要；
- `unsafe-exit-delay-below-minimum`: 受伤、交战劣势、追击、断连/WebSocket 等非安全退出没有达到最小重连等待。

最新退出事件行也会显示登录/重连上下文，例如 `suppress=...`、`enemyHold=...`、`offlineHold=...`、`lastLogin=...`、`manualLogin=...`，用于判断退出后是否仍有重连抑制、是否被手动登录绕过、或登录逻辑是否忽略了 suppress。
