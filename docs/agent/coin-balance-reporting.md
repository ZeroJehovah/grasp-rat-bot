# Coin Balance API Reporting

This document records the stable method for generating Elysiver natural-month
actual-revenue reports.

## Full-Month Command

Use the full-month command only when no local report exists for the month, or
when the user explicitly requests a full refetch or whole-month verification.
Do not use it for a normal update when any dates are already covered.

```bash
node scripts/coin-balance-report.js --month YYYY-MM --timeout-ms 60000
```

The default output is:

```text
docs/reports/YYYY-MM/monthly-YYYY-MM.md
```

For the current month, the script queries only Beijing calendar days up to today.
It does not query future days.

## Default Incremental Update

For a normal "update monthly report" request, use the incremental update mode.
It inspects the existing monthly report and fetches only missing Beijing
calendar dates:

```bash
node scripts/coin-balance-report.js --update-month YYYY-MM --timeout-ms 60000
```

The mode merges only those newly fetched dates into the existing monthly
report. When the user explicitly identifies one missing date, fetch and merge
only that date:

```bash
node scripts/coin-balance-report.js --update-day YYYY-MM-DD --timeout-ms 60000
```

Never refetch a date already covered by the local report merely to regenerate,
merge, or validate the monthly Markdown. If the current tooling cannot merge
safely, improve the local merge path or report the limitation; do not fall back
to a full-month refetch without explicit user authorization.

## Authentication

The script automatically loads the repository-local `.env` file. Keep this file
local and ignored.

Required variables:

```dotenv
ELYSIVER_COOKIE='session=...; elysiver_style_jwt=...; cf_clearance=...'
ELYSIVER_NEW_API_USER=28886
```

The Cookie can instead be supplied in parts:

```dotenv
ELYSIVER_SESSION='...'
ELYSIVER_JWT='...'
ELYSIVER_CF_CLEARANCE='...'
ELYSIVER_NEW_API_USER=28886
```

Optional API endpoint override:

```dotenv
ELYSIVER_LOG_API_URL='https://elysiver.h-e.top/api/log/self'
```

Never print or commit `.env`, cookies, JWTs, Cloudflare clearance values, or
generated reports.

## Stable Fetch Method

- Endpoint: `https://elysiver.h-e.top/api/log/self`.
- Query parameters: `p`, `page_size=100`, fixed `type=1`, empty
  `token_name`, `model_name`, `group`, and `request_id`, plus Beijing-day
  `start_timestamp` and `end_timestamp`.
- The `type=1` filter is fixed in the script and has no command-line override.
- Requests paginate from page 1 using the API `total` and `page_size`.
- Requests have a default four-second interval.
- The script uses `curl` with browser-like headers, redirect handling, timeouts,
  retries, and `--noproxy *`, which forcefully bypasses all proxy environment
  settings for every data request. Data fetching must use a direct connection;
  do not remove this no-proxy constraint. Node `fetch` is intentionally not
  used because Cloudflare may challenge it while the same authenticated curl
  request succeeds.
- Progress is written to stderr as
  `[coin-report] YYYY-MM-DD page N curl request M`.

The API balance-change records are the authoritative source for the report.
Monthly Markdown contains per-day totals, whole-month totals, API record counts,
classified detail rows, and player rankings before the dated detail sections:

- `本月死亡统计` groups death-loss rows by killer, showing total coin loss and
  kill count sorted by coin loss descending. The section is omitted when the
  month has no death-loss rows.
- `本月击杀统计` groups player-drop pickup rows by defeated player, showing
  collected coins and kill count sorted by collected coins descending, limited
  to the top 10 players.

Incremental merges recompute both ranking sections from the complete local
detail rows. This derived-content refresh does not authorize refetching dates
already covered by the report.

## Obsidian Synchronization

After successfully generating or updating a report, copy:

```text
docs/reports/YYYY-MM/monthly-YYYY-MM.md
```

to:

```text
/mnt/d/同步/软件数据/Obsidian/瞎折腾/PC/游戏/囤囤鼠大战/YYYY-MM/monthly-YYYY-MM.md
```

Verify that source and destination are byte-for-byte identical. If `/mnt/d` is
read-only, use Windows PowerShell `Copy-Item -Force` with the source path
converted by `wslpath -w`, then verify the destination through `/mnt/d`.

## Validation

```bash
node scripts/coin-balance-report.js --self-test
node --check scripts/coin-balance-report.js
git diff --check
```
