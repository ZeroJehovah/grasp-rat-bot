'use strict';

function refreshExitDetailInlineSource() {
  return String.raw`
		  function refreshExitDetail(detail, t = Date.now()) {
	    if (!detail || typeof detail !== 'object') return detail;
	    const reloginUntil = Number(detail.reloginUntil || 0);
	    if (reloginUntil) detail.holdRemainingMs = Math.max(0, Math.round(reloginUntil - t));
	    if (detail.offlineSafety?.staminaBudgetExit) {
	      detail.summary = offlineLeaveSummary(detail.reason || 'stamina budget coin leave', detail.offlineSafety);
	    } else if (detail.offlineSafety?.staminaExhausted) {
	      detail.summary = offlineLeaveSummary(detail.reason || 'stamina exhausted', detail.offlineSafety);
	    }
	    return finalizeLeaveDisplayReason(detail);
	  }`;
}

function bundledRefreshExitDetailSource() {
  return `const { refreshExitDetailCore } = require('./src/browser/runtime/refresh-exit-detail');
const { offlineLeaveSummaryCore: offlineLeaveSummaryForRefreshExitDetailCore } = require('./src/browser/runtime/exit-relogin');

		  function refreshExitDetail(detail, t = Date.now()) {
	    return refreshExitDetailCore(
	      detail,
	      (summaryReason, summarySafety) => offlineLeaveSummaryForRefreshExitDetailCore(summaryReason, summarySafety, { staminaBudgetCoinLeaveSummary, staminaExhaustedWindowLabel }),
	      finalizeLeaveDisplayReason,
	      t
	    );
	  }`;
}

function refreshExitDetailSource(options = {}) {
  if (options.bundledRuntime) return bundledRefreshExitDetailSource();
  return refreshExitDetailInlineSource();
}

module.exports = {
  refreshExitDetailInlineSource,
  bundledRefreshExitDetailSource,
  refreshExitDetailSource
};
