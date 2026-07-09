'use strict';

function numberOr(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function distanceBetween(a, b) {
  const ax = Number(a?.x);
  const ay = Number(a?.y);
  const bx = Number(b?.x);
  const by = Number(b?.y);
  if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(bx) || !Number.isFinite(by)) return Infinity;
  return Math.hypot(ax - bx, ay - by);
}

function threatKey(threat) {
  const id = threat?.userId ?? threat?.user_id ?? threat?.entityId ?? threat?.entity_id ?? threat?.id;
  if (id !== undefined && id !== null && id !== '') return String(id);
  const x = Number(threat?.x);
  const y = Number(threat?.y);
  if (Number.isFinite(x) && Number.isFinite(y)) return `xy:${Math.round(x)}:${Math.round(y)}`;
  return '';
}

function actionMovesTowardThreatCore(self, threat, action) {
  const dx = Number(action?.dx || 0);
  const dy = Number(action?.dy || 0);
  if (!(dx || dy)) return false;
  const tx = Number(threat?.x) - Number(self?.x);
  const ty = Number(threat?.y) - Number(self?.y);
  return Number.isFinite(tx) && Number.isFinite(ty) && dx * tx + dy * ty > 0;
}

function fleeDirectionCore(self, threats, options = {}) {
  const dangerRadius = Math.max(1, numberOr(options.dangerRadius, options.threatRadius || 17000));
  let vx = 0;
  let vy = 0;
  for (const threat of threats || []) {
    const d = Math.max(1, numberOr(threat?.distance, distanceBetween(self, threat)));
    const weight = (dangerRadius - Math.min(dangerRadius, d) + 600) / d;
    vx += (Number(self?.x) - Number(threat?.x)) * weight / d;
    vy += (Number(self?.y) - Number(threat?.y)) * weight / d;
  }
  const nearest = (threats || [])[0] || null;
  let dx = Math.abs(vx) > 0.02 ? Math.sign(vx) : 0;
  let dy = Math.abs(vy) > 0.02 ? Math.sign(vy) : 0;
  if (!(dx || dy) && nearest) {
    dx = Math.sign(Number(self?.x) - Number(nearest?.x)) || 0;
    dy = Math.sign(Number(self?.y) - Number(nearest?.y)) || 0;
  }
  return { dx, dy, score: Math.hypot(vx, vy) };
}

function lockedFleeDirectionCore(state, self, threats, reason, options = {}) {
  const nowMs = numberOr(options.nowMs, Date.now());
  const lockMs = Math.max(0, numberOr(options.fleeLockMs, 1200));
  const ids = (threats || []).slice(0, 4).map(threatKey).filter(Boolean);
  const previous = state?.fleeLock || null;
  if (previous && nowMs < numberOr(previous.until, 0) && (previous.dx || previous.dy)) {
    const previousIds = new Set(previous.threatIds || []);
    const overlaps = ids.some(id => previousIds.has(id));
    if (previous.reason === reason && (overlaps || threats.length)) {
      return { dx: previous.dx, dy: previous.dy, score: previous.score || 0, locked: true };
    }
  }

  const flee = fleeDirectionCore(self, threats, options);
  if (!(flee.dx || flee.dy) && previous && (previous.dx || previous.dy)) {
    flee.dx = previous.dx;
    flee.dy = previous.dy;
  }
  if (state) {
    state.fleeLock = {
      dx: flee.dx,
      dy: flee.dy,
      score: flee.score,
      reason,
      threatIds: ids,
      until: nowMs + lockMs
    };
  }
  return { ...flee, locked: false };
}

function returnBlockRadiusCore(threat, options = {}) {
  const avoidMaxDistance = Math.max(0, numberOr(options.activeAvoidMaxDistance, 25000));
  const cautionRadius = Math.max(0, numberOr(threat?.cautionRadius, options.activeCautionRadius || 23000));
  const exitMargin = Math.max(0, numberOr(options.activeCautionExitMargin, 2000));
  const blockMargin = Math.max(0, numberOr(options.activeReturnBlockMargin, 0));
  return Math.min(avoidMaxDistance || Infinity, cautionRadius + exitMargin + blockMargin);
}

function returnBlockExitRadiusCore(threat, options = {}) {
  return returnBlockRadiusCore(threat, options) + Math.max(0, numberOr(options.activeReturnBlockExitMargin, 0));
}

function returnBlockResumeRadiusCore(threat, options = {}) {
  return returnBlockExitRadiusCore(threat, options) + Math.max(0, numberOr(options.activeReturnBlockResumeMargin, 0));
}

function returnBlockSuppressRadiusCore(threat, options = {}) {
  return returnBlockResumeRadiusCore(threat, options) + Math.max(0, numberOr(options.activeReturnBlockClearMargin, 0));
}

function summarizeReturnBlockThreat(threat, options = {}) {
  return {
    id: threat?.userId ?? threat?.user_id ?? threat?.entityId ?? threat?.entity_id ?? threat?.id ?? null,
    name: threat?.name || '',
    d: Math.round(numberOr(threat?.distance, Infinity)),
    drop: numberOr(threat?.drop, 0),
    speed: Math.round(numberOr(threat?.speed, 0)),
    moving: Boolean(threat?.moving),
    r: Math.round(returnBlockRadiusCore(threat, options)),
    exitR: Math.round(returnBlockExitRadiusCore(threat, options)),
    resumeR: Math.round(returnBlockResumeRadiusCore(threat, options))
  };
}

function pickReturnBlockThreatCore(state, self, activeThreats, action, options = {}) {
  const threats = (activeThreats || []).filter(Boolean);
  const lock = state?.returnBlockLock || null;
  if (lock?.id) {
    const locked = threats.find(threat => threatKey(threat) === String(lock.id));
    if (locked && numberOr(locked.distance, distanceBetween(self, locked)) <= returnBlockExitRadiusCore(locked, options)) {
      return { threat: locked, locked: true, mode: 'exit' };
    }
    if (locked
      && numberOr(locked.distance, distanceBetween(self, locked)) <= returnBlockResumeRadiusCore(locked, options)
      && actionMovesTowardThreatCore(self, locked, action)) {
      return { threat: locked, locked: true, mode: 'resume-guard' };
    }
    if (state) state.returnBlockLock = null;
  }
  const threat = threats.find(item => numberOr(item.distance, distanceBetween(self, item)) <= returnBlockExitRadiusCore(item, options));
  if (threat) {
    if (state) state.returnBlockLock = { id: threatKey(threat), startedAt: numberOr(options.nowMs, Date.now()) };
    return { threat, locked: false, mode: 'exit' };
  }
  const returnThreat = threats.find(item => (
    numberOr(item.distance, distanceBetween(self, item)) <= returnBlockResumeRadiusCore(item, options)
    && actionMovesTowardThreatCore(self, item, action)
  ));
  if (!returnThreat) return null;
  if (state) state.returnBlockLock = { id: threatKey(returnThreat), startedAt: numberOr(options.nowMs, Date.now()) };
  return { threat: returnThreat, locked: false, mode: 'resume-guard' };
}

function returnBlockScanDirectionCore(state, self, activeThreats, nearbyHumans = [], options = {}) {
  const nowMs = numberOr(options.nowMs, Date.now());
  const headingMs = Math.max(1, numberOr(options.returnBlockScanHeadingMs, 2600));
  const stuckMs = Math.max(1, numberOr(options.returnBlockScanStuckMs, 1400));
  const stuckDistance = Math.max(0, numberOr(options.returnBlockScanStuckDistance, 350));
  const threat = (activeThreats || [])[0] || null;
  const key = threatKey(threat);
  const locked = state?.returnBlockScan || null;
  if (locked && nowMs < numberOr(locked.until, 0) && (locked.dx || locked.dy)) {
    const moved = Math.hypot(Number(self?.x) - numberOr(locked.x, self?.x), Number(self?.y) - numberOr(locked.y, self?.y));
    const stale = nowMs - numberOr(locked.startedAt, nowMs) >= stuckMs && moved < stuckDistance;
    if (!stale && (!key || String(locked.threatId || '') === key)) {
      return { dx: locked.dx, dy: locked.dy, locked: true, threat };
    }
  }

  const awayX = threat ? Math.sign(Number(self?.x) - Number(threat?.x)) : 0;
  const awayY = threat ? Math.sign(Number(self?.y) - Number(threat?.y)) : 0;
  const phase = Math.floor(nowMs / headingMs) % 8;
  const pattern = [
    { dx: -awayY, dy: awayX },
    { dx: awayY, dy: -awayX },
    { dx: awayX, dy: 0 },
    { dx: 0, dy: awayY },
    { dx: awayX, dy: awayY },
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: -1 }
  ];
  const candidates = pattern
    .map((item, index) => ({ dx: Math.sign(item.dx || 0), dy: Math.sign(item.dy || 0), index }))
    .filter(item => item.dx || item.dy)
    .filter(item => !threat || !actionMovesTowardThreatCore(self, threat, item));
  const scored = candidates.map(item => {
    let score = item.index === phase ? 500 : 0;
    if (threat) {
      const tx = Number(self?.x) - Number(threat?.x);
      const ty = Number(self?.y) - Number(threat?.y);
      score += item.dx * tx + item.dy * ty >= 0 ? 200 : -1000;
    }
    for (const human of (nearbyHumans || []).slice(0, 6)) {
      const hx = Number(self?.x) - Number(human?.x);
      const hy = Number(self?.y) - Number(human?.y);
      score += item.dx * hx + item.dy * hy >= 0 ? 5 : -20;
    }
    if (locked && item.dx === -Number(locked.dx || 0) && item.dy === -Number(locked.dy || 0)) score -= 30;
    return { ...item, score };
  }).sort((a, b) => b.score - a.score);
  const next = scored[0] || { dx: awayX || 1, dy: awayY || 0, score: 0 };
  if (state) {
    state.returnBlockScan = {
      threatId: key,
      dx: next.dx,
      dy: next.dy,
      x: numberOr(self?.x, 0),
      y: numberOr(self?.y, 0),
      startedAt: nowMs,
      until: nowMs + headingMs
    };
  }
  return { dx: next.dx, dy: next.dy, locked: false, threat };
}

function buildReturnBlockActionCore(state, self, activeThreats, action, options = {}) {
  const picked = pickReturnBlockThreatCore(state, self, activeThreats, action, options);
  if (!picked) return null;
  const threat = picked.threat;
  const distance = numberOr(threat?.distance, distanceBetween(self, threat));
  const threatRadius = Math.max(0, numberOr(threat?.threatRadius, options.dangerRadius || options.activeCautionRadius || 17000));
  if (distance > threatRadius && !actionMovesTowardThreatCore(self, threat, action)) {
    const dir = returnBlockScanDirectionCore(state, self, [threat], [], options);
    return {
      kind: 'return-block-scan',
      band: 'safety',
      reason: 'return-block-lateral-scan',
      dx: dir.dx,
      dy: dir.dy,
      locked: dir.locked,
      blockedAction: {
        kind: action?.kind || '',
        reason: action?.reason || '',
        target: action?.target || null,
        returnBlockMode: picked.mode || ''
      },
      threats: [summarizeReturnBlockThreat(threat, options)]
    };
  }
  const flee = lockedFleeDirectionCore(state, self, [threat], 'active-threat-return-block', options);
  return {
    kind: 'flee',
    band: 'safety',
    reason: 'active-threat-return-block',
    dx: flee.dx,
    dy: flee.dy,
    locked: flee.locked,
    blockedAction: {
      kind: action?.kind || '',
      reason: action?.reason || '',
      target: action?.target || null,
      returnBlockLocked: Boolean(picked.locked),
      returnBlockMode: picked.mode || ''
    },
    threats: [summarizeReturnBlockThreat(threat, options)]
  };
}

module.exports = {
  actionMovesTowardThreatCore,
  buildReturnBlockActionCore,
  distanceBetween,
  fleeDirectionCore,
  lockedFleeDirectionCore,
  pickReturnBlockThreatCore,
  returnBlockExitRadiusCore,
  returnBlockRadiusCore,
  returnBlockResumeRadiusCore,
  returnBlockScanDirectionCore,
  returnBlockSuppressRadiusCore,
  summarizeReturnBlockThreat,
  threatKey
};
