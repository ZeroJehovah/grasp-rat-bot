'use strict';

const {
  escapeHtml,
  formatDistance,
  formatDurationMs,
  actorLabel,
  hpDisplay
} = require('./runtime/display-format');
const { statusPanelSource } = require('./status-panel-source');

function bundledStatusPanelRuntimeSource() {
  return `const { escapeHtml, formatDistance, formatDurationMs, actorLabel, hpDisplay } = require('./src/browser/runtime/display-format');

${statusPanelSource()}`;
}

function statusPanelRuntimeSource(options = {}) {
  if (options.bundledRuntime) return bundledStatusPanelRuntimeSource();
  return statusPanelSource({ escapeHtml, formatDistance, formatDurationMs, actorLabel, hpDisplay });
}

module.exports = {
  bundledStatusPanelRuntimeSource,
  statusPanelRuntimeSource
};
