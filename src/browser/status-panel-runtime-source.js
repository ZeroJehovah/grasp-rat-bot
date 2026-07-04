'use strict';

const { statusPanelSource } = require('./status-panel-source');

function statusPanelRuntimeSource() {
  return `const { escapeHtml, formatDistance, formatDurationMs, actorLabel, hpDisplay } = require('./src/browser/runtime/display-format');

${statusPanelSource()}`;
}

module.exports = {
  statusPanelRuntimeSource
};
