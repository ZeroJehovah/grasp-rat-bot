'use strict';

function finalizeLeaveDisplayReasonCoreCall(detail, finalizeName = 'finalizeLeaveDisplayReasonCore', waitName = 'leaveWaitDisplayCore') {
  return `${finalizeName}(${detail}, (base, value) => ${waitName}(base, value, formatDurationMs))`;
}

function finalizeLeaveDisplayReasonCoreBinding(finalizeName = 'finalizeLeaveDisplayReasonCore', waitName = 'leaveWaitDisplayCore') {
  return `finalizeLeaveDisplayReason: detail => ${finalizeLeaveDisplayReasonCoreCall('detail', finalizeName, waitName)}`;
}

module.exports = {
  finalizeLeaveDisplayReasonCoreBinding,
  finalizeLeaveDisplayReasonCoreCall
};
