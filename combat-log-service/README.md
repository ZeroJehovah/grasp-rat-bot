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
