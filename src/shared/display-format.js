'use strict';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function formatDistance(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  const meters = n / 100;
  if (Math.abs(meters) < 10) return Number(meters.toFixed(1)) + '米';
  return Math.round(meters) + '米';
}

function formatDurationMs(ms) {
  const value = Math.max(0, Math.round(Number(ms) || 0));
  if (value >= 3600000) {
    const minutes = Math.round(value / 60000);
    if (minutes % 60 === 0) return Math.round(minutes / 60) + '小时';
    return minutes + '分钟';
  }
  if (value >= 60000) return Math.round(value / 60000) + '分钟';
  if (value >= 1000) return Math.round(value / 1000) + '秒';
  return value + 'ms';
}

function actorLabel(actor) {
  if (!actor) return '未知目标';
  const id = actor.user_id ?? actor.id ?? actor.targetId;
  return actor.name || actor.label || (id !== undefined && id !== null && id !== '' ? '#' + id : '未知目标');
}

function hpDisplay(value) {
  const n = Number(value);
  return Number.isFinite(n) ? String(Math.round(n)) : '-';
}

module.exports = {
  escapeHtml,
  formatDistance,
  formatDurationMs,
  actorLabel,
  hpDisplay
};
