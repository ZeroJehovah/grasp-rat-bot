'use strict';

/**
 * Combat Movement and Spacing
 *
 * Handles combat positioning, spacing, dodge, and tactical movement.
 */

const { COMBAT_CONSTANTS } = require('./combat-constants');

/**
 * Calculate desired spacing distance for combat target
 *
 * @param {Object} self - Self entity
 * @param {Object} target - Combat target
 * @param {Object} context - Combat context
 * @returns {number} Desired spacing distance in cm
 */
function calculateCombatSpacing(self, target, context = {}) {
  const minSpacing = Math.max(1, Number(
    context.normalMinRangeCm ?? context.minSpacing ?? COMBAT_CONSTANTS.TARGET_SPACING_MIN
  ));
  const maxSpacing = Math.max(minSpacing, Number(
    context.normalMaxRangeCm ?? context.maxSpacing ?? COMBAT_CONSTANTS.TARGET_SPACING_MAX
  ));

  // Default to mid-range
  let spacing = (minSpacing + maxSpacing) / 2;

  // Adjust based on context
  if (context.targetPressure) {
    // Under pressure, maintain farther spacing
    spacing = maxSpacing;
  }

  if (context.highEntropyOpponent && !context.finishingTarget) {
    spacing = Math.max(8500, Math.min(10500, Number(context.safeReactionSpacingCm || 9500)));
  }

  if (context.finishingTarget) {
    // Finishing low HP target, close in
    spacing = minSpacing;
  }

  return Math.max(minSpacing, Math.min(maxSpacing, spacing));
}

function normalizedDirection(direction = {}) {
  return {
    dx: Math.max(-1, Math.min(1, Math.sign(Number(direction.dx || 0)))),
    dy: Math.max(-1, Math.min(1, Math.sign(Number(direction.dy || 0))))
  };
}

function directionThreatCore(threatField = [], direction = {}) {
  const normalized = normalizedDirection(direction);
  return (threatField || [])
    .filter(item => Number(item?.dx) === normalized.dx && Number(item?.dy) === normalized.dy)
    .sort((left, right) => Number(left?.directHits || 0) - Number(right?.directHits || 0)
      || Number(right?.minCPA || 0) - Number(left?.minCPA || 0))[0] || null;
}

function movementThreatSafeCore(threat, minimumCpaCm = 200) {
  if (!threat) return true;
  const worstCaseCpa = Number(threat.worstCaseCpaCm ?? threat.minCPA ?? Infinity);
  return Number(threat.directHits || 0) === 0
    && threat.scheduleRobust !== false
    && worstCaseCpa >= Math.max(1, Number(minimumCpaCm || 200));
}

/**
 * Pick movement by collision risk first and tactical progress second.
 * Merely having an in-flight projectile must not grant Dodge ownership.
 */
function selectCombatMovementArbitrationCore(input = {}, options = {}) {
  const threatField = Array.isArray(input.threatField) ? input.threatField : [];
  const minimumCpaCm = Math.max(1, Number(options.minimumCpaCm ?? input.minimumCpaCm ?? 200));
  const strategicDirection = normalizedDirection(input.strategicDirection);
  const currentDirection = normalizedDirection(input.currentDirection);
  const pendingDirection = input.pendingDirection ? normalizedDirection(input.pendingDirection) : null;
  const baselineDirection = pendingDirection || currentDirection;
  const strategicThreat = directionThreatCore(threatField, strategicDirection);
  const baselineThreat = directionThreatCore(threatField, baselineDirection);
  const strategicSafe = movementThreatSafeCore(strategicThreat, minimumCpaCm);
  const baselineSafe = movementThreatSafeCore(baselineThreat, minimumCpaCm);
  const pendingActive = Boolean(input.pendingActive && pendingDirection);

  if (pendingActive && baselineSafe) {
    return {
      ...baselineDirection,
      source: 'pending-safe-hold',
      strategicSafe,
      baselineSafe,
      minimumCpaCm,
      selectedThreat: baselineThreat,
      strategicThreat,
      baselineThreat
    };
  }
  if (strategicSafe) {
    return {
      ...strategicDirection,
      source: 'strategic-safe',
      strategicSafe,
      baselineSafe,
      minimumCpaCm,
      selectedThreat: strategicThreat,
      strategicThreat,
      baselineThreat
    };
  }
  if (baselineSafe) {
    return {
      ...baselineDirection,
      source: 'current-safe-hold',
      strategicSafe,
      baselineSafe,
      minimumCpaCm,
      selectedThreat: baselineThreat,
      strategicThreat,
      baselineThreat
    };
  }
  const emergency = normalizedDirection(input.emergencyDirection);
  return {
    ...emergency,
    source: 'emergency-dodge',
    strategicSafe,
    baselineSafe,
    minimumCpaCm,
    selectedThreat: directionThreatCore(threatField, emergency),
    strategicThreat,
    baselineThreat
  };
}

/**
 * Determine if should back away from close target
 *
 * @param {Object} self - Self entity
 * @param {Object} target - Combat target
 * @returns {boolean}
 */
function shouldBackAwayFromTarget(self, target) {
  if (!target) return false;

  const distance = target.distance || Infinity;
  const closeThreshold = COMBAT_CONSTANTS.CLOSE_SPACING_THRESHOLD;

  return distance < closeThreshold;
}

function normalizedPendingVelocityCommands(options = {}) {
  return (options.pendingVelocityCommands || options.velocitySchedule || [])
    .map((command, index) => ({
      commandId: command?.commandId ?? command?.id ?? null,
      repeatOwnerCommandId: command?.repeatOwnerCommandId ?? null,
      dx: Math.max(-1, Math.min(1, Math.round(Number(command?.dx || 0)))),
      dy: Math.max(-1, Math.min(1, Math.round(Number(command?.dy || 0)))),
      effectiveAfterTicks: Math.max(0, Number(command?.effectiveAfterTicks ?? command?.delayTicks ?? 0)),
      sequence: Number(command?.sequence ?? index)
    }))
    .filter(command => Number.isFinite(command.effectiveAfterTicks))
    .sort((a, b) => a.effectiveAfterTicks - b.effectiveAfterTicks || a.sequence - b.sequence)
    .slice(-8);
}

function velocityScheduleVariants(currentVelocity, direction, options = {}) {
  const pending = normalizedPendingVelocityCommands(options);
  const timing = options.movementExecutionTiming || options.velocityExecutionTiming || {};
  const commandDelayTicks = Math.max(0, Number(
    options.commandDelayTicks
      ?? options.commandDelayP90Ticks
      ?? timing.p90Ticks
      ?? 5
  ));
  const diagonalScale = direction.dx && direction.dy ? Math.SQRT1_2 : 1;
  const moveSpeedPerTick = Math.max(0, Number(options.moveSpeedPerTick || 50));
  const candidateVelocity = direction.holdCurrent
    ? { vx: currentVelocity.vx, vy: currentVelocity.vy }
    : (direction.stop
      ? { vx: 0, vy: 0 }
      : {
          vx: direction.dx * diagonalScale * moveSpeedPerTick,
          vy: direction.dy * diagonalScale * moveSpeedPerTick
        });
  const pendingEvents = pending.map(command => {
    const scale = command.dx && command.dy ? Math.SQRT1_2 : 1;
    return {
      ...command,
      vx: command.dx * scale * moveSpeedPerTick,
      vy: command.dy * scale * moveSpeedPerTick,
      source: 'pending-command'
    };
  });
  const lastPendingTick = pendingEvents.reduce((max, command) => Math.max(max, command.effectiveAfterTicks), -1);
  const candidateEffectiveAfterTicks = Math.max(commandDelayTicks, lastPendingTick >= 0 ? lastPendingTick + 1 : 0);
  const expected = [
    ...pendingEvents,
    {
      commandId: null,
      dx: direction.dx,
      dy: direction.dy,
      vx: candidateVelocity.vx,
      vy: candidateVelocity.vy,
      effectiveAfterTicks: candidateEffectiveAfterTicks,
      source: 'candidate-command'
    }
  ];
  const sampleCount = Math.max(0, Number(timing.sampleCount || 0));
  const medianTicks = Math.max(0, Number(timing.medianTicks || 0));
  const p90Ticks = Math.max(commandDelayTicks, Number(timing.p90Ticks || commandDelayTicks));
  const madTicks = Math.max(0, Number(timing.madTicks || 0));
  const timingUncertaintyTicks = Math.max(
    1,
    Math.ceil(madTicks * 2),
    Math.ceil(Math.max(0, p90Ticks - medianTicks))
  );
  if (options.robustScheduleEnabled === false) {
    return {
      variants: [{ name: 'expected', events: expected }],
      pending,
      commandDelayTicks,
      candidateEffectiveAfterTicks,
      timingUncertaintyTicks: 0,
      confidence: 'legacy-expected-only'
    };
  }
  const lowConfidence = sampleCount < 4 || madTicks > 1;
  const currentHold = !pendingEvents.length
    ? expected
    : (direction.holdCurrent ? [] : [{
        commandId: null,
        dx: direction.dx,
        dy: direction.dy,
        vx: candidateVelocity.vx,
        vy: candidateVelocity.vy,
        effectiveAfterTicks: candidateEffectiveAfterTicks + timingUncertaintyTicks,
        source: 'candidate-after-current-hold'
      }]);
  const variants = [
    { name: 'current-hold', events: currentHold },
    { name: 'expected', events: expected }
  ];
  const shifted = shift => {
    let previousTick = -1;
    return expected.map(event => {
      const desired = Math.max(0, Number(event.effectiveAfterTicks) + shift);
      const effectiveAfterTicks = Math.max(desired, previousTick + (previousTick >= 0 ? 1 : 0));
      previousTick = effectiveAfterTicks;
      return { ...event, effectiveAfterTicks };
    });
  };
  // A velocity request is not authoritative until a matching server velocity
  // transition is visible. Always evaluate a late transition, even when the
  // rolling timing distribution is otherwise stable.
  variants.push({ name: 'late-transition', events: shifted(timingUncertaintyTicks) });
  if (lowConfidence) {
    variants.push({ name: 'early-transition', events: shifted(-timingUncertaintyTicks) });
  }
  const uniqueVariants = [];
  const signatures = new Set();
  for (const variant of variants) {
    const signature = variant.events.map(event => `${event.dx},${event.dy},${event.effectiveAfterTicks}`).join('|');
    if (signatures.has(signature)) continue;
    signatures.add(signature);
    uniqueVariants.push(variant);
  }
  return {
    variants: uniqueVariants,
    pending,
    commandDelayTicks,
    candidateEffectiveAfterTicks,
    timingUncertaintyTicks,
    confidence: lowConfidence ? 'low-worst-branch' : (pending.length ? 'measured-robust-schedule' : 'candidate-robust-schedule')
  };
}

function scheduledVelocityAt(intervalTick, currentVelocity, events) {
  let velocity = currentVelocity;
  for (const event of events) {
    if (Number(event.effectiveAfterTicks) > intervalTick + 1) break;
    velocity = { vx: Number(event.vx || 0), vy: Number(event.vy || 0) };
  }
  return velocity;
}

function simulateScheduledSelfPosition(self, intervalTicks, currentVelocity, events) {
  let x = Number(self?.x || 0);
  let y = Number(self?.y || 0);
  const wholeTicks = Math.max(0, Math.floor(intervalTicks));
  for (let tick = 0; tick < wholeTicks; tick += 1) {
    const velocity = scheduledVelocityAt(tick, currentVelocity, events);
    x += velocity.vx;
    y += velocity.vy;
  }
  const fraction = Math.max(0, intervalTicks - wholeTicks);
  if (fraction > 0) {
    const velocity = scheduledVelocityAt(wholeTicks, currentVelocity, events);
    x += velocity.vx * fraction;
    y += velocity.vy * fraction;
  }
  return { x, y };
}

/**
 * Calculate dodge direction for incoming bullets
 *
 * @param {Object} self - Self entity
 * @param {Array} bullets - Incoming bullets
 * @param {Object} options - Dodge options
 * @returns {Object} { dx, dy, reason, threatField }
 */
function calculateDodgeDirection(self, bullets, options = {}) {
  if (!bullets || !bullets.length) {
    return { dx: 0, dy: 0, reason: 'no-bullets', threatField: null };
  }

  // Filter to real incoming bullets
  const incoming = bullets.filter(b =>
    b.incoming &&
    b.distance !== undefined &&
    b.distance < 20000 &&
    b.timeToImpact !== undefined &&
    b.timeToImpact > 0
  );

  if (!incoming.length) {
    return { dx: 0, dy: 0, reason: 'no-incoming-bullets', threatField: null };
  }

  // Evaluate new directions plus holding the current velocity and stopping.
  const directions = [
    { dx: 0, dy: -1 },   // North
    { dx: 1, dy: -1 },   // NE
    { dx: 1, dy: 0 },    // East
    { dx: 1, dy: 1 },    // SE
    { dx: 0, dy: 1 },    // South
    { dx: -1, dy: 1 },   // SW
    { dx: -1, dy: 0 },   // West
    { dx: -1, dy: -1 },  // NW
    { dx: Math.sign(Number(self?.vx || 0)), dy: Math.sign(Number(self?.vy || 0)), holdCurrent: true },
    { dx: 0, dy: 0, stop: true }
  ];

  const moveSpeedPerTick = Math.max(0, Number(options.moveSpeedPerTick ?? self?.speed_per_tick ?? self?.speedPerTick ?? 50));
  const tickMs = Math.max(1, Number(options.tickMs || 50));
  const hitRadius = Math.max(1, Number(options.hitRadius || 200));
  const movementExecutionTiming = options.movementExecutionTiming || options.velocityExecutionTiming || {};
  const commandDelayTicks = Math.max(0, Number(options.commandDelayTicks
    ?? options.commandDelayP90Ticks
    ?? movementExecutionTiming.p90Ticks
    ?? 5));
  const reactionBudgetMs = Math.max(0, Number(options.reactionBudgetMs
    ?? (commandDelayTicks * tickMs + tickMs + Math.max(0, Number(options.reactionSafetyMarginMs ?? 100)))));
  const currentVx = Number(self?.vx || 0);
  const currentVy = Number(self?.vy || 0);
  const observedVelocity = { vx: currentVx, vy: currentVy };
  const threatField = directions.map(dir => {
    let directHits = 0;
    let avoidableHits = 0;
    let unavoidableHits = 0;
    let minCPA = Infinity;
    let rawMinCPA = Infinity;
    let minTTI = Infinity;
    let scheduleRobust = true;
    let unconfirmedTransitionRisk = false;
    const bulletRisks = [];
    const schedule = velocityScheduleVariants(observedVelocity, dir, {
      ...options,
      commandDelayTicks,
      movementExecutionTiming,
      moveSpeedPerTick
    });

    for (const bullet of incoming) {
      const tti = Number(bullet.timeToImpact || 1000);
      const bulletX = Number(bullet.x);
      const bulletY = Number(bullet.y);
      const directionX = Number(bullet.direction?.dx);
      const directionY = Number(bullet.direction?.dy);
      const bulletSpeed = Number(bullet.speed || COMBAT_CONSTANTS.BULLET_SPEED_CM_PER_TICK);
      let cpa = Number(bullet.cpa ?? bullet.distance ?? Infinity);
      let currentHoldCpa = cpa;
      let expectedCpa = cpa;
      let lateCpa = cpa;
      if ([bulletX, bulletY, directionX, directionY, bulletSpeed].every(Number.isFinite)) {
        cpa = Infinity;
        const ttiTicks = Math.max(1, Math.ceil(tti / tickMs));
        const remainingTicks = Number(bullet.remainingTicks);
        const trajectoryTicks = Number.isFinite(remainingTicks) && remainingTicks > 0
          ? Math.ceil(remainingTicks)
          : ttiTicks;
        const endTick = Math.max(1, Math.min(Math.max(1, Number(options.maxTrajectoryTicks || 60)), trajectoryTicks));
        for (const variant of schedule.variants) {
          let variantCpa = Infinity;
          let selfX = Number(self?.x || 0);
          let selfY = Number(self?.y || 0);
          for (let tick = 0; tick <= endTick; tick += 1) {
            const bulletAtX = bulletX + directionX * bulletSpeed * tick;
            const bulletAtY = bulletY + directionY * bulletSpeed * tick;
            variantCpa = Math.min(variantCpa, Math.hypot(selfX - bulletAtX, selfY - bulletAtY));
            if (tick >= endTick) break;
            const velocity = scheduledVelocityAt(tick, observedVelocity, variant.events);
            selfX += velocity.vx;
            selfY += velocity.vy;
          }
          cpa = Math.min(cpa, variantCpa);
          if (variant.name === 'current-hold') currentHoldCpa = variantCpa;
          if (variant.name === 'expected') expectedCpa = variantCpa;
          if (variant.name === 'late-transition') lateCpa = variantCpa;
        }
      }

      const trajectoryResidualCm = Math.max(0, Number(
        bullet.trajectoryResidualCm
          ?? bullet.trajectory_residual_cm
          ?? 0
      ));
      const trajectoryUncertaintyCm = options.robustScheduleEnabled === false
        ? 0
        : Math.min(260, Math.max(
        trajectoryResidualCm,
        Number(bullet.trajectoryUncertaintyCm ?? bullet.trajectory_uncertainty_cm ?? 0)
      ));
      const robustCpa = Math.max(0, cpa - trajectoryUncertaintyCm);
      const currentHoldRobustCpa = Math.max(0, currentHoldCpa - trajectoryUncertaintyCm);
      const expectedRobustCpa = Math.max(0, expectedCpa - trajectoryUncertaintyCm);
      const lateRobustCpa = Math.max(0, lateCpa - trajectoryUncertaintyCm);
      const expectedHit = expectedRobustCpa < hitRadius;
      const lateHit = lateRobustCpa < hitRadius;
      const currentHoldHit = currentHoldRobustCpa < hitRadius;
      if (!expectedHit && (currentHoldHit || lateHit)) unconfirmedTransitionRisk = true;
      if (robustCpa < hitRadius) scheduleRobust = false;

      if (robustCpa < hitRadius) {
        directHits++;
        if (tti < reactionBudgetMs) unavoidableHits++;
        else avoidableHits++;
      }
      bulletRisks.push({
        bulletId: String(
          bullet?.bullet_id
            ?? bullet?.bulletId
            ?? `${bullet?.createdTick ?? bullet?.created_tick ?? ''}:${bullet?.startX ?? bullet?.x ?? ''}:${bullet?.startY ?? bullet?.y ?? ''}`
        ),
        ownerId: bullet?.ownerId ?? bullet?.owner_id ?? null,
        createdTick: Number.isFinite(Number(bullet?.createdTick ?? bullet?.created_tick))
          ? Number(bullet.createdTick ?? bullet.created_tick)
          : null,
        expireTick: Number.isFinite(Number(bullet?.expireTick ?? bullet?.expire_tick))
          ? Number(bullet.expireTick ?? bullet.expire_tick)
          : null,
        speed: Number.isFinite(bulletSpeed) ? bulletSpeed : null,
        timeToImpact: Number.isFinite(tti) ? tti : null,
        cpa: Number.isFinite(cpa) ? cpa : null,
        worstCaseCpaCm: Number.isFinite(robustCpa) ? robustCpa : null,
        currentHoldCpaCm: Number.isFinite(currentHoldRobustCpa) ? currentHoldRobustCpa : null,
        expectedCpaCm: Number.isFinite(expectedRobustCpa) ? expectedRobustCpa : null,
        lateCpaCm: Number.isFinite(lateRobustCpa) ? lateRobustCpa : null,
        trajectoryResidualCm,
        trajectoryUncertaintyCm,
        predictedHit: robustCpa < hitRadius,
        currentHoldHit,
        expectedHit,
        lateHit,
        avoidable: robustCpa < hitRadius && tti >= reactionBudgetMs
      });
      if (cpa < rawMinCPA) rawMinCPA = cpa;
      if (robustCpa < minCPA) minCPA = robustCpa;
      if (tti < minTTI) minTTI = tti;
    }

    const targetFutureTicks = Number.isFinite(minTTI) ? Math.max(0, minTTI / tickMs - commandDelayTicks) : 0;
    const candidateFutureSelf = simulateScheduledSelfPosition(
      self,
      targetFutureTicks,
      observedVelocity,
      (schedule.variants.find(variant => variant.name === 'expected') || schedule.variants[0]).events
    );
    return {
      dx: dir.dx,
      dy: dir.dy,
      directHits,
      avoidableHits,
      unavoidableHits,
      minCPA,
      rawMinCPA,
      worstCaseCpaCm: minCPA,
      minTTI,
      commandDelayTicks,
      candidateEffectiveAfterTicks: schedule.candidateEffectiveAfterTicks,
      observedVelocity,
      pendingVelocityCommand: schedule.pending[0] || null,
      predictedVelocitySchedule: (schedule.variants.find(variant => variant.name === 'expected') || schedule.variants[0]).events.map(event => ({
        commandId: event.commandId,
        dx: event.dx,
        dy: event.dy,
        effectiveAfterTicks: event.effectiveAfterTicks,
        source: event.source
      })),
      velocityScheduleVariants: schedule.variants.slice(0, 4).map(variant => ({
        name: variant.name,
        events: variant.events.map(event => ({
          commandId: event.commandId,
          dx: event.dx,
          dy: event.dy,
          effectiveAfterTicks: event.effectiveAfterTicks,
          source: event.source
        }))
      })),
      velocityScheduleConfidence: schedule.confidence,
      timingUncertaintyTicks: schedule.timingUncertaintyTicks,
      scheduleRobust,
      robustClassification: scheduleRobust ? 'robust-safe' : 'robust-unsafe',
      unconfirmedTransitionRisk,
      trajectoryResidualCm: Math.max(0, ...bulletRisks.map(item => Number(item.trajectoryResidualCm || 0))),
      reactionBudgetMs,
      dangerousBullets: bulletRisks
        .sort((left, right) => Number(right.predictedHit) - Number(left.predictedHit)
          || Number(left.cpa ?? Infinity) - Number(right.cpa ?? Infinity)
          || Number(left.timeToImpact ?? Infinity) - Number(right.timeToImpact ?? Infinity))
        .slice(0, 8),
      targetDistanceChange: Number.isFinite(Number(options.target?.x)) && Number.isFinite(Number(options.target?.y))
        ? Math.hypot(candidateFutureSelf.x - Number(options.target.x), candidateFutureSelf.y - Number(options.target.y))
          - Math.hypot(Number(self?.x || 0) - Number(options.target.x), Number(self?.y || 0) - Number(options.target.y))
        : 0,
      threat: directHits * 1000000 - Math.min(999999, minCPA)
    };
  });

  // Sort by threat ascending (lowest threat = safest)
  threatField.sort((a, b) => a.avoidableHits - b.avoidableHits
    || a.directHits - b.directHits
    || b.minCPA - a.minCPA
    || b.minTTI - a.minTTI);

  // Prefer tangent movement if safe
  const safest = threatField[0];
  const tangentPreference = options.tangentPreference || null;

  if (tangentPreference && safest.directHits === 0) {
    // Check if tangent direction is reasonably safe
    const tangentDir = threatField.find(d =>
      d.dx === tangentPreference.dx && d.dy === tangentPreference.dy
    );

    if (tangentDir && tangentDir.directHits === safest.directHits && tangentDir.minCPA >= safest.minCPA * 0.92) {
      return {
        dx: tangentDir.dx,
        dy: tangentDir.dy,
        reason: 'tangent-dodge',
        observedVelocity: tangentDir.observedVelocity,
        pendingVelocityCommand: tangentDir.pendingVelocityCommand,
        predictedVelocitySchedule: tangentDir.predictedVelocitySchedule,
        velocityScheduleConfidence: tangentDir.velocityScheduleConfidence,
        threatField
      };
    }
  }

  // Use safest direction
  return {
    dx: safest.dx,
    dy: safest.dy,
    reason: safest.unavoidableHits > 0 && safest.avoidableHits === 0
      ? 'unavoidable-current-shot'
      : (safest.directHits > 0 ? 'direct-threat-dodge' : 'safe-dodge'),
    reactionBudgetMs,
    unavoidableCurrentShot: safest.unavoidableHits > 0,
    observedVelocity: safest.observedVelocity,
    pendingVelocityCommand: safest.pendingVelocityCommand,
    predictedVelocitySchedule: safest.predictedVelocitySchedule,
    velocityScheduleConfidence: safest.velocityScheduleConfidence,
    threatField
  };
}

function contactEntryRiskCore(self, target, previous = null, options = {}) {
  const attackRange = Math.max(0, Number(options.attackRange ?? options.combatAttackRange ?? COMBAT_CONSTANTS.ATTACK_RANGE));
  const guardBuffer = Math.max(0, Number(options.guardBufferCm ?? options.combatContactEntryGuardBufferCm ?? COMBAT_CONSTANTS.DODGE_RANGE_BUFFER));
  const guardRange = attackRange + guardBuffer;
  const distance = Number(target?.distance ?? Math.hypot(
    Number(target?.x || 0) - Number(self?.x || 0),
    Number(target?.y || 0) - Number(self?.y || 0)
  ));
  const selfVx = Number(self?.vx || 0);
  const selfVy = Number(self?.vy || 0);
  const targetVx = Number(target?.vx || 0);
  const targetVy = Number(target?.vy || 0);
  const selfSpeed = Math.hypot(selfVx, selfVy);
  const relativeVx = targetVx - selfVx;
  const relativeVy = targetVy - selfVy;
  const relativeSpeed = Math.hypot(relativeVx, relativeVy);
  const dx = Number(target?.x || 0) - Number(self?.x || 0);
  const dy = Number(target?.y || 0) - Number(self?.y || 0);
  const geometryDistance = Math.max(1, Math.hypot(dx, dy));
  const radialSpeed = (dx * relativeVx + dy * relativeVy) / geometryDistance;
  const closingSpeed = Math.max(0, -radialSpeed);
  const closingAlignment = relativeSpeed > 0 ? Math.max(0, Math.min(1, closingSpeed / relativeSpeed)) : 0;
  const firing = Boolean(target?.firing || target?.is_firing || target?.shooting);
  const realBullet = Boolean(options.realBullet);
  const active = Boolean(target?.active || firing || realBullet);
  const selfStationarySpeed = Math.max(0, Number(options.selfStationarySpeed ?? 5));
  const selfStationary = selfSpeed < selfStationarySpeed;
  const minimumClosingSpeed = Math.max(0, Number(options.minimumClosingSpeed ?? 20));
  const minimumClosingAlignment = Math.max(0, Math.min(1, Number(options.minimumClosingAlignment ?? 0.75)));
  const directApproach = Boolean(
    active
      && selfStationary
      && closingSpeed >= minimumClosingSpeed
      && closingAlignment >= minimumClosingAlignment
  );
  const strongEvidence = realBullet || firing;
  const selfHp = Number(self?.hp ?? self?.knownHp ?? 100);
  const selfMaxHp = Number(self?.max_hp ?? self?.maxHp ?? 100);
  const recoveringSelf = options.recoveringSelf === true
    || (Number.isFinite(selfHp) && Number.isFinite(selfMaxHp) && selfHp < selfMaxHp);
  const trustedWithoutFire = Boolean(target?.easyKillThreatExempt && !strongEvidence && options.recentDanger !== true);
  const stamina5s = Number(self?.stamina_5s_remaining_milli ?? self?.stamina5sRemainingMilli);
  const minimumStamina5s = Math.max(0, Number(options.minimumStamina5s ?? COMBAT_CONSTANTS.SHOOT_DODGE_RESERVE_MS + 1000));
  const staminaBlocked = Number.isFinite(stamina5s) && stamina5s < minimumStamina5s && !realBullet;
  const armed = options.armed !== false;
  const withinGuard = Number.isFinite(distance) && distance <= guardRange;
  const previousDistance = Number(previous?.distance);
  const newlyEnteredGuard = !Number.isFinite(previousDistance) || previousDistance > guardRange;
  let blockedReason = '';
  if (!Number.isFinite(distance)) blockedReason = 'missing-distance';
  else if (!withinGuard) blockedReason = 'outside-contact-guard';
  else if (!active) blockedReason = 'target-not-active';
  else if (recoveringSelf && !strongEvidence) blockedReason = 'recovery-policy-owned';
  else if (trustedWithoutFire) blockedReason = 'trusted-target-no-fire';
  else if (!strongEvidence && !directApproach) blockedReason = selfStationary
    ? 'no-direct-closing-evidence'
    : 'self-already-moving';
  else if (staminaBlocked) blockedReason = 'stamina-insufficient';
  else if (!armed && !strongEvidence) blockedReason = 'contact-not-rearmed';
  return {
    eligible: !blockedReason,
    blockedReason,
    trigger: realBullet
      ? 'target-real-bullet'
      : (firing ? 'target-firing' : 'direct-closing-entry'),
    attackRange: Math.round(attackRange),
    guardBuffer: Math.round(guardBuffer),
    guardRange: Math.round(guardRange),
    distance: Number.isFinite(distance) ? Math.round(distance) : null,
    previousDistance: Number.isFinite(previousDistance) ? Math.round(previousDistance) : null,
    newlyEnteredGuard,
    inRange: Number.isFinite(distance) && distance <= attackRange,
    withinGuard,
    active,
    firing,
    realBullet,
    recoveringSelf,
    directApproach,
    trustedWithoutFire,
    selfStationary,
    selfSpeed: Math.round(selfSpeed * 100) / 100,
    relativeSpeed: Math.round(relativeSpeed * 100) / 100,
    closingSpeed: Math.round(closingSpeed * 100) / 100,
    closingAlignment: Math.round(closingAlignment * 1000) / 1000,
    stamina5s: Number.isFinite(stamina5s) ? stamina5s : null,
    minimumStamina5s,
    armed
  };
}

function contactEntrySyntheticBulletCore(self, target, options = {}) {
  const startX = Number(target?.x);
  const startY = Number(target?.y);
  const selfX = Number(self?.x);
  const selfY = Number(self?.y);
  if (![startX, startY, selfX, selfY].every(Number.isFinite)) return null;
  const dx = selfX - startX;
  const dy = selfY - startY;
  const distance = Math.hypot(dx, dy);
  if (!(distance > 0)) return null;
  const speed = Math.max(1, Number(options.bulletSpeedCmPerTick ?? COMBAT_CONSTANTS.BULLET_SPEED_CM_PER_TICK));
  const tickMs = Math.max(1, Number(options.tickMs ?? 50));
  const flightTicks = distance / speed;
  return {
    incoming: true,
    synthetic: true,
    contactEntry: true,
    ownerId: target?.user_id ?? target?.userId ?? target?.id ?? null,
    x: startX,
    y: startY,
    direction: { dx: dx / distance, dy: dy / distance },
    speed,
    distance,
    cpa: 0,
    timeToImpact: flightTicks * tickMs,
    remainingTicks: flightTicks
  };
}

function pickSafeClosingDodgeCore(threatField = [], options = {}) {
  const candidates = (threatField || []).filter(Boolean);
  if (!candidates.length) return null;
  const minimumDirectHits = Math.min(...candidates.map(item => Number(item.directHits ?? Infinity)));
  if (minimumDirectHits > 0) return null;
  const safestCpa = Math.max(...candidates
    .filter(item => Number(item.directHits || 0) === minimumDirectHits)
    .map(item => Number(item.minCPA || 0)));
  const hitRadius = Math.max(1, Number(options.hitRadius || 200));
  const cpaRatio = Math.max(0, Math.min(1, Number(options.minimumCpaRatio ?? 0.75)));
  const minimumCpa = Math.max(hitRadius * 1.25, safestCpa * cpaRatio);
  const minimumClosing = Math.max(0, Number(options.minimumClosingCm ?? 25));
  return candidates
    .filter(item => Number(item.directHits || 0) === 0)
    .filter(item => Number(item.targetDistanceChange || 0) <= -minimumClosing)
    .filter(item => Number(item.minCPA || 0) >= minimumCpa)
    .sort((a, b) => Number(a.targetDistanceChange || 0) - Number(b.targetDistanceChange || 0)
      || Number(b.minCPA || 0) - Number(a.minCPA || 0))[0] || null;
}

/**
 * Apply combat movement modifiers
 *
 * @param {Object} baseMovement - Base movement { dx, dy }
 * @param {Object} self - Self entity
 * @param {Object} target - Combat target
 * @param {Object} context - Combat context
 * @returns {Object} Modified movement { dx, dy, modifiers }
 */
function applyCombatMovementModifiers(baseMovement, self, target, context = {}) {
  let { dx, dy } = baseMovement;
  const modifiers = [];

  // Dodge takes precedence
  if (context.dodge && (context.dodge.dx !== 0 || context.dodge.dy !== 0)) {
    dx = context.dodge.dx;
    dy = context.dodge.dy;
    modifiers.push('dodge');
  }

  // Back away from close targets
  if (context.backAway && target) {
    if (modifiers.includes('dodge')) {
      // The threat-field direction already includes target geometry. Do not turn
      // a safe lateral/reversal dodge into a predictable radial retreat.
      modifiers.push('back-away-deferred');
    } else {
      const awayDx = self.x > target.x ? 1 : (self.x < target.x ? -1 : 0);
      const awayDy = self.y > target.y ? 1 : (self.y < target.y ? -1 : 0);
      dx = awayDx;
      dy = awayDy;
      modifiers.push('back-away');
    }
  }

  // Close-in movement
  if (context.closeIn && target && !modifiers.includes('dodge')) {
    const closeDx = target.x > self.x ? 1 : (target.x < self.x ? -1 : 0);
    const closeDy = target.y > self.y ? 1 : (target.y < self.y ? -1 : 0);
    dx = closeDx;
    dy = closeDy;
    modifiers.push('close-in');
  }

  return { dx, dy, modifiers };
}

/**
 * Check if out-of-range target is recoverable for reengage
 *
 * @param {Object} self - Self entity
 * @param {Object} target - Combat target
 * @param {Object} engagement - Engagement context
 * @returns {boolean}
 */
function isRecoverableOutOfRangeTarget(self, target, engagement = {}) {
  if (!target) return false;

  const distance = target.distance || Infinity;
  const attackRange = COMBAT_CONSTANTS.ATTACK_RANGE;
  const finishReengageRange = COMBAT_CONSTANTS.FINISH_REENGAGE_RANGE;

  // Outside attack range but inside reengage range
  if (distance > attackRange && distance <= finishReengageRange) {
    // Check engagement context
    const selfHp = Number(self.hp || 100);
    const targetHp = Number(target.hp || 100);

    // Healthy HP and not already disadvantaged
    if (selfHp >= 60 && selfHp >= targetHp - 10) {
      return true;
    }

    // Target has real bullet pressure and just slipped out
    if (engagement.targetPressure && distance <= attackRange + 500) {
      return true;
    }
  }

  return false;
}

module.exports = {
  calculateCombatSpacing,
  directionThreatCore,
  movementThreatSafeCore,
  selectCombatMovementArbitrationCore,
  shouldBackAwayFromTarget,
  calculateDodgeDirection,
  contactEntryRiskCore,
  contactEntrySyntheticBulletCore,
  pickSafeClosingDodgeCore,
  applyCombatMovementModifiers,
  isRecoverableOutOfRangeTarget
};
