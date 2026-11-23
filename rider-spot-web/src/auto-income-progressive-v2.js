/* RiderSpot native auto-income: 3-item progressive list. Presentation only.
 * Keep the existing <details> disclosure, native actions, and finance records intact.
 */
(function installAutoIncomeProgressive(win) {
  'use strict';
  if (!win || win.__rsAutoIncomeProgressiveV2) return;
  win.__rsAutoIncomeProgressiveV2 = true;

  const INITIAL = 3;
  const STEP = 3;
  const PANEL_ID = 'rs-native-income-panel-v1';
  const HIDDEN_CLASS = 'rsai-progress-hidden';
  const BUTTON_CLASS = 'rsai-progress-more';
  const STYLE_ID = 'rsai-progress-style-v2';
  const doc = win.document;
  let panel = null;
  let observer = null;
  let visibleCount = INITIAL;

  function ensureStyle() {
    if (doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#' + PANEL_ID + ' > .' + HIDDEN_CLASS + '{display:none!important}',
      '#' + PANEL_ID + ' > .' + BUTTON_CLASS + '{display:flex;justify-content:center;align-items:center;gap:8px;width:100%;min-height:44px;margin:13px 0 8px;padding:10px 12px;border:1px solid #e2e9ef;border-radius:12px;background:#f5f8fb;color:#415c74;font:700 12px/1.4 inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}',
      '#' + PANEL_ID + ' > .' + BUTTON_CLASS + ':focus-visible{outline:2px solid #426db2;outline-offset:2px}'
    ].join('\n');
    doc.head?.appendChild(style);
  }

  function setHidden(element, hidden) {
    if (!element) return;
    if (element.classList.contains(HIDDEN_CLASS) !== hidden) {
      element.classList.toggle(HIDDEN_CLASS, hidden);
    }
    if (element.hidden !== hidden) element.hidden = hidden;
  }

  function paint() {
    if (!panel || !panel.isConnected) return;
    // Native WebView from older APKs still shows the pre-v51 manual-review notice.
    // The RPC now auto-applies valid captures and reallocates manual day topups.
    for (const paragraph of panel.querySelectorAll('.rsai-desc')) {
      if (paragraph.textContent?.includes('수동 입력과 중복되는 날짜의 수익은 자동 합산하지 않고 확인 대상으로 보관해요.')) {
        paragraph.textContent = '완료 배달은 자동 반영해요. 기존에 입력한 실제 총수입과 겹치면 수동 보충액을 자동으로 조정합니다.';
      }
    }
    const rows = Array.from(panel.children).filter(node => node.classList.contains('rsai-item'));
    const shown = Math.min(rows.length, visibleCount);
    let last = null;
    rows.forEach((row, index) => {
      const hide = index >= shown;
      setHidden(row, hide);
      // An unconfirmed record has action buttons immediately after its row.
      // Keep those buttons in the same visibility group as their record.
      const next = row.nextElementSibling;
      const actions = next?.classList.contains('rsai-action') ? next : null;
      setHidden(actions, hide);
      last = actions || row;
    });

    let more = Array.from(panel.children).find(node => node.classList.contains(BUTTON_CLASS));
    const remaining = rows.length - shown;
    if (remaining <= 0) {
      more?.remove();
      return;
    }
    if (!more) {
      more = doc.createElement('button');
      more.type = 'button';
      more.className = BUTTON_CLASS;
      more.addEventListener('click', () => {
        visibleCount += STEP;
        paint();
      });
    }
    const nextCount = Math.min(STEP, remaining);
    const label = '더보기 · ' + nextCount + '건';
    if (more.textContent !== label) more.textContent = label;
    more.setAttribute('aria-label', '자동수익 내역 ' + nextCount + '건 더보기, 남은 ' + remaining + '건');
    if (last && last.nextElementSibling !== more) last.insertAdjacentElement('afterend', more);
  }

  function attach() {
    const current = doc.getElementById(PANEL_ID);
    if (current === panel) return;
    observer?.disconnect();
    observer = null;
    panel = current;
    visibleCount = INITIAL;
    if (!panel) return;
    ensureStyle();
    observer = new MutationObserver(paint);
    // The native bridge replaces the direct children every few seconds.
    // Do not observe attributes: hiding items must not cause a render loop.
    observer.observe(panel, {childList:true});
    paint();
  }

  const schedule = () => win.requestAnimationFrame(attach);
  win.addEventListener('riderspot:screen', schedule);
  win.addEventListener('riderspot:tab-restored', schedule);
  doc.addEventListener('visibilitychange', () => { if (!doc.hidden) schedule(); });
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', schedule, {once:true});
  else schedule();
  // Rebind only if React remounts the native panel without firing a tab event.
  win.setInterval(attach, 2500);
})(typeof window === 'undefined' ? null : window);
