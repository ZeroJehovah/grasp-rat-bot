# Browserless VPS Observation

Keep this file short. It is the current live-observation handoff for the Oracle Singapore VPS runner and should record only known issues, fixes, current watch items, and the latest measured runtime baseline.

## Latest Baseline

- Updated: 2026-07-09 11:10 CST / 2026-07-09 03:10 UTC.
- VPS service: `grasp-rat-browserless-runner` is active on the VPS, checkout `9ff0d65`. The running service process was started from code commit `6142c2a`; `9ff0d65` is documentation-only.
- Production env: `GRASP_RAT_BROWSERLESS_DRY_RUN=false`, `GRASP_RAT_BROWSERLESS_CONTROL_MODE=profit-live`, `GRASP_RAT_BROWSERLESS_COMBAT_ENABLED=true`.
- Current state: loop-wait / `snapshot-safety-retry`. Last retry `profit-live-20260709T031036556Z` stopped before WS because snapshot safety found Active player `Caoyinsu/#30919` 14,285cm from the learned login point `(33285,33570)`.
- Latest verified fixed-code leave: `profit-live-20260709T030155471Z` exited on `profit-live-snapshot-active-threat` at `2026-07-09T03:06:04Z` with verified `leave`, HP 100, Drop 67, coins 1000, 1d stamina remaining 18,939,948, death count 2, and `joined=UserRecordOnly/current_join_mode=None/life=Alive/visible=Hidden`.
- Delta from the pre-fix-deploy leave baseline `profit-live-20260709T025717918Z`: Drop +2, 1d stamina spent 97,980, death count +0. Drop is counted only from self Drop / `death_drop_coins`, not kill messages or in-game target lists.
- Fixed-run decision evidence: `profit-live-20260709T030155471Z` sampled rows showed best targets Drop 12 then Drop 11; candidate Drops included 12/5/4/3 and later 11/3/3, with `hasLowDropAfkCandidate=false`.

## Known Issues

- The 2026-07-09 run `profit-live-20260709T012930981Z` died once after a realtime target lacked `current_join_mode` and was treated as AFK while fresh snapshot metadata showed the same user as Active. Death count rose from 1 to 2 and Drop fell from 162 to 16.
- Before `25c69db`, non-`--once` runner processes stayed systemd-active after a run ended but did not start another game cycle. This made the status service look alive while profit/combat control was inert.
- `profit-live` is currently conservative around snapshot-confirmed Active threats. Recent fixed-code runs exited safely instead of dying, but this can reduce uptime when active players are near the current login point.
- Active combat still needs more evidence before relaxing safety exits. Recent combat rows showed target authority stayed realtime, but shooting against the snapshot-active threat was suppressed by fire/reserve gates.

## Fixed Or Mitigated

- Browserless AFK-profit admission now matches the browser runtime default `attackMinAfkDrop=3`. VPS decisions in `profit-live-20260709T022052916Z` showed `lopoincare`/`#19369` selected as `attack` with Drop 1 from `2026-07-09T02:32:53Z` to `02:33:23Z`; after deploying `6142c2a`, sampled fixed-run decisions have no Drop 1/2 AFK candidates and verified self Drop still increased by +2.
- Snapshot Active metadata is now used as profit/safety veto metadata so realtime targets without mode are not attacked as AFK when fresh snapshot evidence says Active.
- Passive/non-firing moving targets no longer take over `profit-live` combat action selection ahead of AFK profit or player-drop pickup.
- Snapshot self-kill player drops are eligible for pickup only when tied to fresh self kill evidence; unrelated system/player drops remain blocked as ordinary snapshot fallback.
- Browserless direct velocity commands are clamped/rounded to the native `vel -1|0|1 -1|0|1` command shape.
- The runner now has a non-`--once` loop plan deployed on the VPS: recoverable exits continue after a delay; `explicit-stop`, `no-self`, direct leave failure, and auth-like 403 errors stop for inspection.

## Current Watch Items

- Verify `runner-loop-wait` followed by a new `profit-live-*` run after the next recoverable safety exit.
- Continue reporting Drop changes from self Drop / `death_drop_coins`; do not count kill messages or visible coin drops as realized income.
- Watch `death_count`, HP at leave, verified `leave`, and `current_join_mode=None` after every exit. The target remains zero new deaths after the fix.
- For profit quality, compare 1d stamina spent against Drop delta between consecutive verified leave responses.
- Watch for any future backend `游戏拾取` rows with amount 1 from self-killed AFK targets; those should no longer come from newly selected Drop=1 AFK attacks after the threshold fix.
- If repeated `profit-live-snapshot-active-threat` exits happen at the same login point with no damage, inspect whether the target is truly dangerous before relaxing the safety threshold.
