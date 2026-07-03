'use strict';

const {
  escapeHtml,
  formatDistance,
  formatDurationMs,
  actorLabel,
  hpDisplay
} = require('../shared/display-format');
const { statusPanelSource } = require('./status-panel-source');

function statusPanelRuntimeSource() {
  return statusPanelSource({ escapeHtml, formatDistance, formatDurationMs, actorLabel, hpDisplay });
}

module.exports = { statusPanelRuntimeSource };
