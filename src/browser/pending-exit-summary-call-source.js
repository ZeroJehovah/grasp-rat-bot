'use strict';

function pendingExitRetryCoreOptionsSource() {
  return `{
        leaveRetryMinMs: cfg.leaveRetryMinMs,
        leaveCommandTimeoutMs: cfg.leaveCommandTimeoutMs,
        offlineLeaveRetryMs: cfg.offlineLeaveRetryMs,
        combatLeaveRetryMs: cfg.combatLeaveRetryMs,
        pursuitLeaveRetryMs: cfg.pursuitLeaveRetryMs
      }`;
}

function pendingExitSummaryPreludeSource(alias, options = {}) {
  if (!options.bundledRuntime) return '';
  const suffix = String(alias || 'Summary').replace(/[^A-Za-z0-9_$]/g, '') || 'Summary';
  const indent = options.indent || '  ';
  return `${indent}const { pendingExitRetryMsCore: pendingExitRetryMsFor${suffix}Core, summarizePendingExitCore: summarizePendingExitFor${suffix}Core } = require('./src/browser/runtime/pending-exit');\n`;
}

function summarizePendingExitCall(pendingExpr = 'bot.pendingExit', options = {}) {
  const expr = pendingExpr || 'bot.pendingExit';
  if (!options.bundledRuntime) return `summarizePendingExit(${expr})`;
  const suffix = String(options.alias || 'Summary').replace(/[^A-Za-z0-9_$]/g, '') || 'Summary';
  const retryCoreName = options.retryCoreName || `pendingExitRetryMsFor${suffix}Core`;
  const summaryCoreName = options.summaryCoreName || `summarizePendingExitFor${suffix}Core`;
  const normalizeReloadName = options.normalizeReloadName || 'normalizePendingExitReloadConfirmationCore';
  return `(() => {
        const pendingExitSummaryPending = ${expr};
        if (!pendingExitSummaryPending) return null;
        const pendingExitSummaryNow = Date.now();
        const pendingExitSummaryReload = ${normalizeReloadName}(pendingExitSummaryPending.reloadConfirmation, pendingExitSummaryPending, pendingExitSummaryNow);
        return ${summaryCoreName}(pendingExitSummaryPending, {
          nowMs: pendingExitSummaryNow,
          retryMs: ${retryCoreName}(pendingExitSummaryPending, ${pendingExitRetryCoreOptionsSource()}),
          reloadConfirmation: pendingExitSummaryReload
        });
      })()`;
}

module.exports = {
  pendingExitRetryCoreOptionsSource,
  pendingExitSummaryPreludeSource,
  summarizePendingExitCall
};
