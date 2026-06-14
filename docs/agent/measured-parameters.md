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
