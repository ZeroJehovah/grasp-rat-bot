'use strict';

const {
  writePersistentPendingExitStateCall
} = require('./pending-exit-persistence-call-source');
const {
  pendingExitSummaryPreludeSource,
  summarizePendingExitCall
} = require('./pending-exit-summary-call-source');

function leaveCommandSource() {
  const runtimePrelude = pendingExitSummaryPreludeSource('LeaveCommand')
    + "  const { pendingExitDisplayReasonCore: pendingExitDisplayReasonForLeaveCommandCore, leaveDetailHasHttp403Core: leaveDetailHasHttp403ForLeaveCommandCore, leaveDetailSucceededCore: leaveDetailSucceededForLeaveCommandCore } = require('./src/browser/runtime/pending-exit');\n"
    + "  const { leaveCommandFailureMessageCore, summarizeLeaveCommandResultCore, leaveDetailFailedForClashRescueCore, clashLeaveRescueAttemptsCore, nextClashLeaveRescueStageCore, summarizeClashLeaveRescueResultCore, clashLeaveRescueRetryDetailCore, resetClashLeaveRescueRoundCore } = require('./src/browser/runtime/leave-command');\n";
  const writePendingExit = pending => writePersistentPendingExitStateCall(pending);
  const pendingExitDisplayReason = summary => `pendingExitDisplayReasonForLeaveCommandCore(${summary})`;
  const leaveDetailHasHttp403Call = detail => `leaveDetailHasHttp403ForLeaveCommandCore(${detail})`;
  const leaveDetailSucceededCall = detail => `leaveDetailSucceededForLeaveCommandCore(${detail})`;
  const leaveCommandFailureMessageCall = value => `leaveCommandFailureMessageCore(${value})`;
  const summarizeLeaveCommandResultCall = value => `summarizeLeaveCommandResultCore(${value})`;
  const leaveDetailFailedForClashRescueCall = detail => `leaveDetailFailedForClashRescueCore(${detail}, { clashLeaveRescueEnabled: cfg.clashLeaveRescueEnabled, hasClashLeaveRescueHook: () => Boolean(clashLeaveRescueHook()) })`;
  const clashLeaveRescueAttemptsCall = detail => `clashLeaveRescueAttemptsCore(${detail})`;
  const nextClashLeaveRescueStageCall = detail => `nextClashLeaveRescueStageCore(${detail})`;
  const summarizeClashLeaveRescueResultCall = (result, stage, error = "''") => `summarizeClashLeaveRescueResultCore(${result}, ${stage}, ${error})`;
  const clashLeaveRescueRetryDetailCall = (detail, stage) => `clashLeaveRescueRetryDetailCore(${detail}, ${stage}, { nowMs: Date.now(), cloneForPendingExit, pendingExitDisplayReason: summary => ${pendingExitDisplayReason('summary')} })`;
  const resetClashLeaveRescueRoundCall = detail => `resetClashLeaveRescueRoundCore(${detail})`;
  return String.raw`${runtimePrelude}  function waitWithTimeout(promise, timeoutMs, label) {
    const ms = Math.max(100, Number(timeoutMs) || 0);
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error((label || 'operation') + ' timed out after ' + ms + 'ms'));
      }, ms);
      Promise.resolve(promise).then(
        value => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        err => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  function clashLeaveRescueHook() {
    try {
      const hook = readPageGlobal('__graspRatBotClashLeaveRescue', null, pageGlobal);
      return typeof hook === 'function' ? hook : null;
    } catch (_) {
      return null;
    }
  }

  function appendClashLeaveRescueAttempt(detail, attempt) {
    if (!detail || !attempt) return;
    const attempts = ${clashLeaveRescueAttemptsCall('detail')}.concat([attempt]).slice(-6);
    detail.clashLeaveRescueAttempts = attempts;
    detail.clashLeaveRescue = attempt;
    bot.clashLeaveRescue.lastAt = Number(attempt.at || Date.now()) || Date.now();
    bot.clashLeaveRescue.lastStage = attempt.stage || '';
    bot.clashLeaveRescue.lastResult = attempt;
    bot.clashLeaveRescue.attempts = (Array.isArray(bot.clashLeaveRescue.attempts) ? bot.clashLeaveRescue.attempts : [])
      .concat([attempt])
      .slice(-8);
  }

  async function prepareDefaultClashLeaveProxy(detail) {
    if (!cfg.clashLeaveRescueEnabled) return false;
    if (!detail || typeof detail !== 'object') return false;
    if (detail.clashLeaveRescueRetry || ${clashLeaveRescueAttemptsCall('detail')}.length) return false;
    if (bot.clashLeaveRescue.running) return false;
    const hook = clashLeaveRescueHook();
    if (!hook) return false;
    const stage = 'auto';
    bot.clashLeaveRescue.running = true;
    try {
      let attempt = null;
      try {
        const result = await waitWithTimeout(
          hook({
            stage,
            reason: detail.reason || '',
            scope: detail.exitAuditScope || '',
            source: detail.exitAuditSource || '',
            exitAuditId: detail.exitAuditId || '',
            requestId: ''
          }),
          Math.max(1000, Number(cfg.clashLeaveRescueTimeoutMs || 9000) || 9000),
          'Clash leave default ' + stage
        );
        attempt = ${summarizeClashLeaveRescueResultCall('result', 'stage')};
      } catch (err) {
        attempt = ${summarizeClashLeaveRescueResultCall('null', 'stage', 'err?.message || String(err)')};
      }
      appendClashLeaveRescueAttempt(detail, attempt);
      updatePendingExitLastResult(detail);
      recordExitAuditEvent('clash-leave-rescue', detail, {
        at: attempt.at || Date.now(),
        source: detail.exitAuditSource || 'leave-command',
        scope: detail.exitAuditScope || '',
        request: attempt
      });
      logStatus(
        attempt.ok ? 'clash leave default switched ' + stage : 'clash leave default failed ' + stage,
        { stage, clashLeaveRescue: attempt }
      );
      return Boolean(attempt.ok);
    } finally {
      bot.clashLeaveRescue.running = false;
    }
  }

  async function runClashLeaveRescueRetry(detail) {
    if (bot.clashLeaveRescue.running) return null;
    if (!${leaveDetailFailedForClashRescueCall('detail')}) return null;
    let stage = ${nextClashLeaveRescueStageCall('detail')};
    if (!stage) return null;
    bot.clashLeaveRescue.running = true;
    try {
      while (stage) {
        const hook = clashLeaveRescueHook();
        if (!hook) return null;
        let attempt = null;
        try {
          const result = await waitWithTimeout(
            hook({
              stage,
              reason: detail.reason || '',
              scope: detail.exitAuditScope || '',
              source: detail.exitAuditSource || '',
              exitAuditId: detail.exitAuditId || '',
              requestId: detail.lastLeaveRequest?.requestId || ''
            }),
            Math.max(1000, Number(cfg.clashLeaveRescueTimeoutMs || 9000) || 9000),
            'Clash leave rescue ' + stage
          );
          attempt = ${summarizeClashLeaveRescueResultCall('result', 'stage')};
        } catch (err) {
          attempt = ${summarizeClashLeaveRescueResultCall('null', 'stage', 'err?.message || String(err)')};
        }
        appendClashLeaveRescueAttempt(detail, attempt);
        updatePendingExitLastResult(detail);
        recordExitAuditEvent('clash-leave-rescue', detail, {
          at: attempt.at || Date.now(),
          source: detail.exitAuditSource || 'leave-command',
          scope: detail.exitAuditScope || '',
          request: attempt
        });
        if (attempt.ok) {
          logStatus('clash leave rescue switched ' + stage, { stage, clashLeaveRescue: attempt });
          const retryDetail = ${clashLeaveRescueRetryDetailCall('detail', 'stage')};
          const pending = bot.pendingExit;
          const retryAt = Number(retryDetail.at || Date.now()) || Date.now();
          if (pending) {
            bot.pendingExit = {
              ...pending,
              updatedAt: retryAt,
              lastAttemptAt: retryAt,
              retryCount: Number(pending.retryCount || 0) + 1,
              lastResult: cloneForPendingExit(retryDetail)
            };
            ${writePendingExit('bot.pendingExit')};
            retryDetail.pendingExit = ${summarizePendingExitCall('bot.pendingExit', { alias: 'LeaveCommand' })};
          }
          recordPendingExitResult(pending?.source || detail.exitAuditSource || 'offline', retryDetail, retryAt);
          await issueLeaveCommand(retryDetail);
          if (
            !retryDetail.leaveRequestPending
            && ${leaveDetailFailedForClashRescueCall('retryDetail')}
            && ${nextClashLeaveRescueStageCall('retryDetail')}
          ) {
            detail = retryDetail;
            stage = ${nextClashLeaveRescueStageCall('detail')};
            continue;
          }
          return retryDetail;
        }
        logStatus('clash leave rescue failed ' + stage, { stage, clashLeaveRescue: attempt });
        stage = ${nextClashLeaveRescueStageCall('detail')};
      }
    } finally {
      bot.clashLeaveRescue.running = false;
    }
    return null;
  }

  function scheduleClashLeaveRescueRetry(detail) {
    if (!${leaveDetailFailedForClashRescueCall('detail')}) return false;
    if (!${nextClashLeaveRescueStageCall('detail')}) return false;
    if (bot.clashLeaveRescue.running) return true;
    Promise.resolve()
      .then(() => runClashLeaveRescueRetry(detail))
      .catch(err => recordUnhandledTickError('clash-leave-rescue', err));
    return true;
  }

  function updatePendingExitLastResult(detail) {
    const pending = bot.pendingExit;
    if (!pending || !detail?.exitAuditId) return;
    const pendingAuditId = pending.lastResult?.exitAuditId || '';
    if (pendingAuditId && pendingAuditId !== detail.exitAuditId) return;
    bot.pendingExit = {
      ...pending,
      updatedAt: Date.now(),
      lastAttemptAt: Number(detail.at || detail.lastLeaveRequest?.sentAt || pending.lastAttemptAt || Date.now()),
      lastResult: cloneForPendingExit(detail)
    };
    ${writePendingExit('bot.pendingExit')};
  }

  function maybeConfirmPendingExitFromLeaveDetail(detail) {
    const pending = bot.pendingExit;
    if (!pending || !detail?.exitAuditId) return null;
    const pendingAuditId = pending.lastResult?.exitAuditId || '';
    if (pendingAuditId && pendingAuditId !== detail.exitAuditId) return null;
    const self = getSelf();
    const baseState = pendingExitSelfState(self);
    if (${leaveDetailHasHttp403Call('detail')}) {
      if (scheduleClashLeaveRescueRetry(detail)) return null;
      return confirmPendingExit(pending, {
        ...baseState,
        known: true,
        alive: false,
        source: 'leave-http-403',
        http403: true,
        self: null
      });
    }
    if (${leaveDetailSucceededCall('detail')}) {
      requestPendingExitLeaveSuccessReload(detail, 'leave-success');
      return null;
    }
    const localState = pendingExitLocalConfirmationState(pending, self, baseState);
    if (localState.confirmed) return confirmPendingExit(pending, localState);
    return null;
  }

  function completeLeaveRequest(detail, request, rawResult, errorMessage = '') {
    if (!detail || !request || request.completedAt) return detail;
    const failure = errorMessage || ${leaveCommandFailureMessageCall('rawResult')};
    if (failure) detail.error = failure;
    detail.leaveRequestPending = false;
    request.completedAt = Date.now();
    request.durationMs = Math.max(0, Math.round(request.completedAt - request.sentAt));
    request.attempted = Boolean(detail.attempted);
    request.method = detail.method || '';
    request.error = detail.error || '';
	    request.result = ${summarizeLeaveCommandResultCall('rawResult')};
	    request.pending = false;
	    if (!Array.isArray(detail.leaveRequests)) detail.leaveRequests = [];
	    detail.leaveRequests.push(request);
    detail.leaveRequests = detail.leaveRequests.slice(-20);
    detail.lastLeaveRequest = request;
    const http403 = ${leaveDetailHasHttp403Call('detail')};
    const clashRescuePending = http403 && ${leaveDetailFailedForClashRescueCall('detail')} && Boolean(${nextClashLeaveRescueStageCall('detail')});
    if (${leaveDetailSucceededCall('detail')} || http403) {
      stopMotionAfterExit(http403 ? 'leave-http-403' : 'leave-success');
      if (http403 && !clashRescuePending) {
        noteImportantSessionExit('leave-http-403:' + (detail.reason || ''), detail.self || bot.lastSelf, request.completedAt, { exit: detail });
      }
    }
	    updatePendingExitLastResult(detail);
	    recordExitAuditEvent('leave-request', detail, {
	      at: request.completedAt,
      request,
      source: detail.exitAuditSource || detail.reason || 'leave-command',
      scope: detail.exitAuditScope || ''
    });
    if (${leaveDetailSucceededCall('detail')}) requestPendingExitLeaveSuccessReload(detail, 'leave-success');
    const rescueScheduled = scheduleClashLeaveRescueRetry(detail);
    if (!rescueScheduled) maybeConfirmPendingExitFromLeaveDetail(detail);
    return detail;
  }

  async function issueLeaveCommand(detail) {
    if (bot.pendingExit && !detail?.pendingExitRetry) {
      const skipped = pendingExitSkipNewLeave(detail?.exitAuditSource || detail?.reason || 'leave-command', detail?.reason || '', detail || {});
      if (skipped) {
        Object.assign(detail, skipped);
        return detail;
      }
    }
    ensureExitAuditDetail(detail, {
      source: detail?.exitAuditSource || detail?.reason || 'leave-command',
      scope: detail?.exitAuditScope || ''
    });
    await prepareDefaultClashLeaveProxy(detail);
    const request = {
      requestId: newExitAuditRequestId(detail.exitAuditId),
      exitAuditId: detail.exitAuditId || '',
      sentAt: Date.now(),
      completedAt: 0,
      durationMs: 0,
      attempted: false,
      method: '',
      error: '',
      result: null,
      pending: false
    };
	    try {
	      if (typeof leave === 'function') {
	        detail.attempted = true;
	        detail.method = detail.userId ? 'leave(userId)' : 'leave';
	        const result = detail.userId ? leave(detail.userId) : leave();
	        if (result && typeof result.then === 'function') {
          detail.leaveRequestPending = true;
          detail.leaveRequestSentAt = request.sentAt;
          detail.leaveRequestTimeoutMs = Math.max(1000, Number(cfg.leaveCommandTimeoutMs || 0) || 3000);
          request.attempted = true;
          request.method = detail.method;
          request.pending = true;
          detail.lastLeaveRequest = request;
          let settled = false;
          const timeoutMs = detail.leaveRequestTimeoutMs;
          const finish = (rawResult, errorMessage = '') => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            completeLeaveRequest(detail, request, rawResult, errorMessage);
          };
          const timer = setTimeout(() => {
            finish({ error: 'leave request timed out after ' + timeoutMs + 'ms' }, 'leave request timed out after ' + timeoutMs + 'ms');
          }, timeoutMs);
          Promise.resolve(result).then(
            value => finish(value, ''),
            err => finish({ error: err?.message || String(err) }, err?.message || String(err))
          );
          return detail;
	        }
        return completeLeaveRequest(detail, request, result, '');
	      } else {
	        const leaveBtn = document.querySelector('#leaveBtn');
	        if (leaveBtn && isVisible(leaveBtn)) {
	          detail.attempted = true;
	          detail.method = '#leaveBtn';
	          leaveBtn.click();
          return completeLeaveRequest(detail, request, undefined, '');
	        } else {
	          detail.error = 'leave control not found';
          return completeLeaveRequest(detail, request, { error: detail.error }, detail.error);
	        }
	      }
	    } catch (err) {
	      detail.error = err?.message || String(err);
      return completeLeaveRequest(detail, request, { error: detail.error }, detail.error);
	    }
	    return detail;
	  }

`;
}

module.exports = {
  leaveCommandSource
};
