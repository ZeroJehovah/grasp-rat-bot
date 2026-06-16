# Known Measured Game Parameters


- Server tick: `50ms`.
- Player speed: `50cm/tick` cardinal, `35cm/tick` diagonal per axis.
- Bullet range: `15000cm`.
- Bullet speed: `500cm/tick`.
- Bullet hit radius: `90cm`.
- Render delay: `100ms`.
- Observed stamina buckets:
  - `stamina_5s_remaining_milli / limit = 10000`
  - `stamina_1h_remaining_milli / limit = 3000000`, observed to recover continuously rather than only at hourly reset
  - `stamina_1d_remaining_milli / limit = 20000000`
- Page marks any stamina bucket below `1000ms` as exhausted.

## Control Transport Assessment

- The page `sendVelocity(force = false)` wrapper has a non-forced 100ms send gate and formats `vel <dx> <dy>` before using `state.ws.send(...)`.
- The server tick is 50ms. Directly sending `vel` over the already-open native page WebSocket can therefore align command repeats to the server tick and bypass the page wrapper/key-computation path, but it cannot remove network latency, server tick quantization, or the page render delay.
- A single `vel` command was measured to move only one small server step; sustained movement still needs repeated commands. The bot now repeats direct movement commands every 50ms for a short hold and repeats direct stop commands to reduce stop-lag.
- Shooting already maps to `shoot <pointerWorld.x> <pointerWorld.y> <startX> <startY>` on the same native WebSocket. Direct shoot sends avoid page helper overhead while preserving the same server-side cooldown/stamina behavior.
