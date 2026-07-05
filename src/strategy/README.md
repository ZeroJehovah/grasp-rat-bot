# Strategy Module Architecture

`src/strategy/` contains browser-independent policy and scoring logic. These modules should be pure where practical: receive explicit inputs, return decisions or summaries, and avoid page globals, DOM APIs, transport side effects, and direct `bot` mutation.

Browser runtime modules under `src/browser/runtime/` adapt live/native/page state into these strategy helpers and apply the returned decisions.

## Modules

- `action-priority.js`: action priority band definitions and focus summaries.
- `action-arbitration.js`: final action hold/switch arbitration.
- `action-switch-diagnostics.js`: target/focus switch diagnostics and oscillation detection.
- `attack-worth.js`: target eligibility and attack value helpers.
- `coin-diagnostics.js`: visible/realtime coin diagnostic summaries.
- `coin-motion.js`: coin pickup direction and motion metadata core.
- `coin-target.js`: coin identity, matching, snapshot normalization, and incidental pickup helpers.
- `coin-progress.js`: coin failure backoff, stale escape, progress, ignored-action, and cleanup helpers.
- `coin-route.js`: visible coin route planning and route action metadata.
- `combat-constants.js`: combat numeric defaults.
- `combat-target-selection.js`: combat target eligibility and priority helpers.
- `combat-movement.js`: combat spacing and dodge helpers.
- `combat-fire-discipline.js`: combat shooting state machine.
- `drop-matched-kill.js`: post-kill drop matching helpers.
- `exit-motion.js`: post-exit targetless-decision and overlay lock helpers.
- `integration-helpers.js`: small bridge helpers for strategy/runtime integration.
- `leave-command.js`: leave-command result/failure and Clash rescue summaries.
- `opportunity-candidates.js`: opportunity candidate descriptors and value scores.
- `opportunity-choice.js`: stable opportunity choice, persistence, and missing-held helpers.
- `opportunity-clear.js`: opportunity choice cleanup helpers.
- `opportunity-constants.js`: profit and opportunity numeric defaults.
- `opportunity-pick.js`: best-opportunity selection.
- `patrol.js`: patrol and safe-spacing helper decisions.
- `pending-exit.js`: pending-exit retry/display/summary helpers.
- `post-attack-drop.js`: post-attack drop coin/wait selection.
- `stamina-budget.js`: stamina budget summaries and selectors.
- `self-test.js`: strategy module test suite.

## Ownership Rules

- Put reusable policy, scoring, and state-machine cores here when they can be tested without a browser.
- Keep runtime-only concerns in `src/browser/runtime/`: config reads, `bot` state writes, localStorage, DOM, WebSocket/native transport, combat-log queueing, and panel rendering.
- Keep generated/browser entry concerns out of strategy modules. `src/browser/runtime-entry.js` should call runtime domain factories, not strategy helpers directly unless a small composition bridge is clearly enough.
- Avoid duplicating strategy logic inside browser runtime modules. If runtime code needs the same decision in multiple places, extract or extend a strategy helper and add self-tests.
- Do not tune combat behavior as part of structural cleanup. Battle-record-driven combat changes require replay validation under the project rules.

## Current Test Surface

`src/strategy/self-test.js` is the focused test suite for these modules. It currently covers 107 strategy cases, and `node grasp-rat-bot.js --self-test` fails if this strategy suite fails.

Run the strategy tests through either:

```bash
node grasp-rat-bot.js --self-test
```

or, when working only in the strategy layer and needing faster iteration, call the strategy self-test module from the Node self-test path used by the main suite.

## Design Principles

- Pure functions where possible.
- Explicit inputs and return values.
- No hidden page/global dependencies.
- Small contracts that can be covered by self-tests.
- Runtime wrappers own side effects and browser integration.
- Strategy helpers should remain useful to replay, analyzer, or Node validation code.
