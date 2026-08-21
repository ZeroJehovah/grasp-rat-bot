'use strict';

const MAX_RECOVERY_ATTEMPT_ID_LENGTH = 160;

function boundedRecoveryAttemptId(value) {
  const text = String(value == null ? '' : value).trim();
  return text ? text.slice(0, MAX_RECOVERY_ATTEMPT_ID_LENGTH) : '';
}

function normalizedIsoTimestamp(value) {
  const text = String(value == null ? '' : value);
  return Number.isFinite(Date.parse(text)) ? text : '';
}

function normalizePendingLoginRecovery(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const recoveredFromExitAttemptId = boundedRecoveryAttemptId(
    value.recoveredFromExitAttemptId ?? value.exitAttemptId
  );
  if (!recoveredFromExitAttemptId) return null;
  return {
    recoveredFromExitAttemptId,
    armedAt: normalizedIsoTimestamp(value.armedAt)
  };
}

function armLoginRecoveryAssociation(outcome, armedAt = '') {
  if (String(outcome?.outcome || '') !== 'confirmed-absent') return null;
  const recoveredFromExitAttemptId = boundedRecoveryAttemptId(outcome?.exitAttemptId);
  if (!recoveredFromExitAttemptId) return null;
  return {
    recoveredFromExitAttemptId,
    armedAt: normalizedIsoTimestamp(armedAt)
  };
}

function consumeLoginRecoveryAssociation(value) {
  const pending = normalizePendingLoginRecovery(value);
  return {
    recoveredFromExitAttemptId: pending?.recoveredFromExitAttemptId || '',
    pendingLoginRecovery: null
  };
}

function runLoginRecoveryAssociationSelfTest() {
  const attemptId = 'exit:recovery-association-fixture:123:0';
  const armed = armLoginRecoveryAssociation({
    outcome: 'confirmed-absent',
    exitAttemptId: attemptId
  }, '2026-08-20T16:00:00.000Z');
  const consumed = consumeLoginRecoveryAssociation(armed);
  const blocked = armLoginRecoveryAssociation({
    outcome: 'self-present-recovered',
    exitAttemptId: attemptId
  }, '2026-08-20T16:00:00.000Z');
  const oversized = normalizePendingLoginRecovery({
    recoveredFromExitAttemptId: 'x'.repeat(MAX_RECOVERY_ATTEMPT_ID_LENGTH + 20)
  });
  return {
    ok: Boolean(
      armed?.recoveredFromExitAttemptId === attemptId
        && armed.armedAt === '2026-08-20T16:00:00.000Z'
        && consumed.recoveredFromExitAttemptId === attemptId
        && consumed.pendingLoginRecovery === null
        && blocked === null
        && oversized?.recoveredFromExitAttemptId.length === MAX_RECOVERY_ATTEMPT_ID_LENGTH
        && consumeLoginRecoveryAssociation(null).recoveredFromExitAttemptId === ''
    ),
    attemptId,
    maxAttemptIdLength: MAX_RECOVERY_ATTEMPT_ID_LENGTH
  };
}

module.exports = {
  MAX_RECOVERY_ATTEMPT_ID_LENGTH,
  armLoginRecoveryAssociation,
  boundedRecoveryAttemptId,
  consumeLoginRecoveryAssociation,
  normalizePendingLoginRecovery,
  runLoginRecoveryAssociationSelfTest
};
