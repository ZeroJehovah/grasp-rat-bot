# Coin Balance API Reporting

This document records the stable method for generating Elysiver natural-month
actual-revenue reports.

## Standard Command

```bash
node scripts/coin-balance-report.js --month YYYY-MM --timeout-ms 60000
```

The default output is:

```text
docs/reports/YYYY-MM/monthly-YYYY-MM.md
```

For the current month, the script queries only Beijing calendar days up to today.
It does not query future days.

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
  and retries. Node `fetch` is intentionally not used because Cloudflare may
  challenge it while the same authenticated curl request succeeds.
- Progress is written to stderr as
  `[coin-report] YYYY-MM-DD page N curl request M`.

The API balance-change records are the authoritative source for the report.
Monthly Markdown contains per-day totals, whole-month totals, API record counts,
and classified detail rows.

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
