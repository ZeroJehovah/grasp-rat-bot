# Elysiver Monthly Revenue Report

This branch retains only the Elysiver actual-revenue monthly reporting utility.

## Usage

```bash
node scripts/coin-balance-report.js --month YYYY-MM --timeout-ms 60000
```

The script loads local authentication from `.env`, queries only API records with
`type=1`, and writes the generated report to:

```text
docs/reports/YYYY-MM/monthly-YYYY-MM.md
```

`docs/reports/` is intentionally ignored by Git. Generated reports must remain
local and be synchronized to the configured Windows Obsidian directory according
to `docs/agent/coin-balance-reporting.md`.

Do not commit cookies, JWTs, Cloudflare clearance values, generated reports, or
other local authentication material.
