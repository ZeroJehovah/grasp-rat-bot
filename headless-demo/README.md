# Grasp Rat Headless Demo

This is a deliberately small VPS probe for the browserless runner idea. It exposes a local web page that can:

- request the LinuxDO authorize URL from `/auth/linuxdo/start`;
- accept a manually pasted callback URL or callback response JSON;
- try to exchange that callback through the game callback endpoint;
- run one explicit demo sequence: move up/down/left/right, shoot once, then call `leave`;
- verify `leave` with the same explicit response confirmation helper used by the current bot.

It does not run unattended strategy logic. The action sequence only runs after pressing the web button.

## Run Manually

Requires Node with global `fetch` and `WebSocket` support. Node 22+ is recommended.

```bash
cd /opt/grasp-rat-bot
GRASP_RAT_DEMO_HOST=0.0.0.0 \
GRASP_RAT_DEMO_PORT=18766 \
GRASP_RAT_DEMO_WEB_TOKEN='replace-with-a-secret' \
node headless-demo/server.js
```

Open:

```text
http://<vps-ip>:18766/?token=replace-with-a-secret
```

## Install As A Service

```bash
sudo mkdir -p /opt/grasp-rat-bot
sudo rsync -a --delete ./ /opt/grasp-rat-bot/
sudo cp /opt/grasp-rat-bot/headless-demo/grasp-rat-headless-demo.service /etc/systemd/system/
sudo systemctl edit grasp-rat-headless-demo
```

Set a real token in the override:

```ini
[Service]
Environment=GRASP_RAT_DEMO_WEB_TOKEN=replace-with-a-secret
```

The service refuses to listen on `0.0.0.0` when the token is empty or still set to `change-this-before-start`.

Then start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now grasp-rat-headless-demo
sudo systemctl status grasp-rat-headless-demo
```

Logs are JSONL:

```text
/var/log/grasp-rat-headless-demo/YYYY-MM-DD.jsonl
```

If `leave` is not explicitly confirmed by the game response, the web page shows a red alert and the JSONL log includes `leave-alert`.

OAuth codes are usually one-time use. If the browser has already loaded the game callback URL and the demo cannot exchange that same URL again, paste the callback response JSON instead. The demo accepts a JSON object containing `user_id`/`userId`/`id` plus `token`/`sessionToken`/`session_token`.

Do not paste `https://connect.linux.do/oauth2/approve/...` into the demo as the login callback. That URL still needs your browser's LinuxDO session. Open it in the browser, finish approval, then paste the final `https://grasp-rat-game.h-e.top/auth/linuxdo/callback?...` URL or the callback JSON response.

The WebSocket URL defaults to:

```text
wss://grasp-rat-game.h-e.top/ws?user_id=<id>&token=<token>&compress=gzip%2Cdeflate
```

The important path is `wss://grasp-rat-game.h-e.top/ws`. If the live app uses a different optional query name, override:

```ini
[Service]
Environment=GRASP_RAT_DEMO_WS_PATH=/ws
Environment=GRASP_RAT_DEMO_WS_EXTRA_QUERY=compress=gzip%2Cdeflate
```
