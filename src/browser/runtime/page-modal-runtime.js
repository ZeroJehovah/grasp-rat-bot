'use strict';

function createPageModalRuntime(runtime = {}) {
  const {
    bot = null,
    isVisible = () => false,
    controlText = () => ''
  } = runtime;

  function describeModalControl(el) {
    if (!el) return '';
    if (el.id) return '#' + el.id;
    const text = controlText(el);
    if (text) return text;
    return String(el.tagName || '').toLowerCase();
  }

  function visibleHelpModal() {
    const modal = document.getElementById('helpModal');
    if (!modal || !isVisible(modal)) return null;
    const shownByClass = modal.classList?.contains('show');
    const shownByAria = String(modal.getAttribute('aria-hidden') || '').toLowerCase() === 'false';
    if (!shownByClass && !shownByAria) return null;
    const titleText = String(document.getElementById('helpTitle')?.textContent || '').trim();
    if (titleText && !/新手教程|help|tutorial/i.test(titleText)) return null;
    return modal;
  }

  function dismissHelpModal(reason = 'tick') {
    const modal = visibleHelpModal();
    if (!modal) return { dismissed: false, reason: 'not-visible' };
    const button = modal.querySelector('#helpOkBtn') || document.getElementById('helpOkBtn');
    if (!button || !isVisible(button)) {
      const result = {
        dismissed: false,
        reason: 'button-missing',
        modal: describeModalControl(modal),
        at: Date.now()
      };
      if (bot) bot.lastHelpModalDismiss = result;
      return result;
    }
    const text = controlText(button);
    if (text && !/知道了|ok|got it|close|关闭|明白/i.test(text)) {
      const result = {
        dismissed: false,
        reason: 'button-text-mismatch',
        button: describeModalControl(button),
        buttonText: text,
        at: Date.now()
      };
      if (bot) bot.lastHelpModalDismiss = result;
      return result;
    }
    try {
      button.click();
      const result = {
        dismissed: true,
        reason: String(reason || 'tick'),
        modal: describeModalControl(modal),
        button: describeModalControl(button),
        at: Date.now()
      };
      if (bot) bot.lastHelpModalDismiss = result;
      return result;
    } catch (err) {
      const result = {
        dismissed: false,
        reason: 'click-error',
        button: describeModalControl(button),
        error: err?.message || String(err),
        at: Date.now()
      };
      if (bot) bot.lastHelpModalDismiss = result;
      return result;
    }
  }

  return {
    visibleHelpModal,
    dismissHelpModal
  };
}

module.exports = {
  createPageModalRuntime
};
