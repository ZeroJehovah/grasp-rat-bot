# Coin Balance API Reporting

This document records the known-good way to fetch Elysiver game coin balance logs. Use this instead of re-deriving the method from old Codex sessions.

## Standard Command

Generate or refresh the natural-month report:

```bash
node scripts/coin-balance-report.js --month YYYY-MM --timeout-ms 60000
```

The default output is `docs/reports/YYYY-MM/monthly-YYYY-MM.md`. For today's daily report workflow, also run the same command for the matching Beijing natural month after generating `docs/reports/YYYY-MM/daily-YYYY-MM-DD.md`.

For a current month, the script intentionally fetches only days up to Beijing today. It does not query future days.

## Authentication

The script auto-loads a local `.env` from the repo root. Keep this file local and ignored.

Required variables:

```dotenv
ELYSIVER_COOKIE='session=...; elysiver_style_jwt=...; cf_clearance=...'
ELYSIVER_NEW_API_USER=28886
```

Alternative split-cookie variables are supported:

```dotenv
ELYSIVER_SESSION='...'
ELYSIVER_JWT='...'
ELYSIVER_CF_CLEARANCE='...'
ELYSIVER_NEW_API_USER=28886
```

Optional:

```dotenv
ELYSIVER_LOG_API_URL='https://elysiver.h-e.top/api/log/self'
```

Do not print or commit `.env`, cookies, JWTs, or Cloudflare clearance values. If auth starts failing, refresh these values from the browser's working console request and keep the file permission restrictive, for example `chmod 600 .env`.

## Settled Fetch Method

The stable implementation is `scripts/coin-balance-report.js`:

- Endpoint: `https://elysiver.h-e.top/api/log/self`.
- Query shape: `p`, `page_size=100`, `type=0`, empty `token_name`, `model_name`, `group`, and `request_id`, with Beijing-day `start_timestamp` and `end_timestamp`.
- Keep `type=0` as the default for balance reports. Earlier manual pickup checks used `type=1`, but full balance accounting needs death-loss records too.
- Request headers mirror the successful browser request: `accept`, `accept-language`, `cache-control`, `dnt`, `new-api-user`, `pragma`, `priority`, `referer`, `sec-ch-ua*`, `sec-fetch-*`, `user-agent`, and Cookie.
- Requests are paginated from page 1 using API `total` and `page_size`.
- Requests are rate limited by default with a 4s delay between API calls. Keep this in the requested 3-5s range unless debugging.
- Node `fetch` is tried first. On fetch error, or Cloudflare-style HTTP 403/HTML challenge, the script retries the same URL through `curl` with the same browser-like headers, `--location`, `--max-time`, `--connect-timeout`, `--retry 2`, and `--retry-all-errors`. If curl returns a transient Cloudflare challenge or TLS/connection error, the page-level fallback retries before failing the monthly report.
- Progress goes to stderr as `[coin-report] YYYY-MM-DD page N request M`, so long monthly pulls are not silent.

The report parser uses the JSON `other` payload and content text to classify:

- system coin pickup,
- player drop pickup,
- death loss,
- ignored non-game quota records,
- unknown game-like records that need review.

Monthly Markdown includes daily totals, whole-month totals, API record counts, and sorted detail rows for player-drop pickup and death loss.

## Validation

After changing the script or generated report behavior, run:

```bash
node scripts/coin-balance-report.js --self-test
node --check scripts/coin-balance-report.js
git diff --check
```

When the daily report path is also touched, run the daily-summary checks from `combat-log-service` as appropriate.
