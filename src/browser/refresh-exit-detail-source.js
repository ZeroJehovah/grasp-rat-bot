'use strict';

const {
  finalizeLeaveDisplayReasonCoreCall
} = require('./exit-relogin-display-call-source');

function refreshExitDetailSource() {
  return `const { refreshExitDetailCore } = require('./src/browser/runtime/refresh-exit-detail');
const {
  finalizeLeaveDisplayReasonCore: finalizeLeaveDisplayReasonForRefreshExitDetailCore,
  leaveWaitDisplayCore: leaveWaitDisplayForRefreshExitDetailCore,
  offlineLeaveSummaryCore: offlineLeaveSummaryForRefreshExitDetailCore
} = require('./src/browser/runtime/exit-relogin');

		  function refreshExitDetail(detail, t = Date.now()) {
	    return refreshExitDetailCore(
	      detail,
	      (summaryReason, summarySafety) => offlineLeaveSummaryForRefreshExitDetailCore(summaryReason, summarySafety, { staminaBudgetCoinLeaveSummary, staminaExhaustedWindowLabel }),
	      value => ${finalizeLeaveDisplayReasonCoreCall('value', 'finalizeLeaveDisplayReasonForRefreshExitDetailCore', 'leaveWaitDisplayForRefreshExitDetailCore')},
	      t
	    );
	  }`;
}

module.exports = {
  refreshExitDetailSource
};
