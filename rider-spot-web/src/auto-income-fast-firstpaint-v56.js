/* RiderSpot auto-income v56: instant, read-only first paint.
 *
 * Existing Android accessibility capture/acks, authentication, GPS and all
 * finance writes remain untouched. The APK can still finish its reliable
 * (but sequential) native sync, then replaces this provisional view.
 */
(function installIncomeFastFirstPaint(win) {
  'use strict';
  if (!win || win.__rsIncomeFastFirstPaintV56) return;
  win.__rsIncomeFastFirstPaintV56 = true;

  const doc = win.document;
  const PANEL = 'rs-native-income-panel-v1';
  const STYLE = 'rs-auto-income-fastpaint-style-v56';
  const fmt = new Intl.NumberFormat('ko-KR');
  const clock = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  let pane = null, pending = false, requested = false, requestSerial = 0;
  let lastAttempt = 0, panelObserver = null;

  function workday(at = Date.now()) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date(at - 3 * 3600000));
    const pick = Object.fromEntries(parts.map(piece => [piece.type, piece.value]));
    return pick.year + '-' + pick.month + '-' + pick.day;
  }

  const nativeReady = node => !!node?.querySelector?.('.rsai-primary');
  const isCurrent = (node, serial) =>
    node?.isConnected && node === pane && serial === requestSerial &&
    !nativeReady(node);
  function create(tag, cssClass, content) {
    const element = doc.createElement(tag);
    if (cssClass) element.className = cssClass;
    if (content !== undefined) element.textContent = String(content);
    return element;
  }
  function style() {
    if (doc.getElementById(STYLE)) return;
    const css = create('style');
    css.id = STYLE;
    css.textContent = [
      '#' + PANEL + '.rsai-fastpaint{padding:16px 16px 13px;margin:14px 0;',
      'border:1px solid #e5eaf1;border-radius:17px;background:#fff;',
      'box-shadow:0 2px 9px rgba(28,48,69,.025);color:#293f54}',
      '#' + PANEL + '.rsai-fastpaint .rsaf-row{display:flex;gap:8px;',
      'justify-content:space-between;align-items:center}',
      '#' + PANEL + '.rsai-fastpaint .rsaf-title{font-size:14px;font-weight:760;',
      'letter-spacing:-.035em}',
      '#' + PANEL + '.rsai-fastpaint .rsaf-state{font-size:11px;color:#688096}',
      '#' + PANEL + '.rsai-fastpaint .rsaf-cells{display:grid;grid-template-columns:1fr 1fr;',
      'gap:8px;margin:12px 0 5px}',
      '#' + PANEL + '.rsai-fastpaint .rsaf-cell{background:#f4f7fa;',
      'border-radius:12px;padding:11px 12px;display:grid;gap:4px}',
      '#' + PANEL + '.rsai-fastpaint .rsaf-cell small{font-size:10px;color:#7f8e9d}',
      '#' + PANEL + '.rsai-fastpaint .rsaf-cell strong{font-size:17px;',
      'font-weight:770;white-space:nowrap;font-variant-numeric:tabular-nums}',
      '#' + PANEL + '.rsai-fastpaint .rsaf-list{margin-top:6px;font-size:11px;',
      'color:#60758a}',
      '#' + PANEL + '.rsai-fastpaint .rsaf-item{display:flex;justify-content:space-between;',
      'gap:8px;padding:6px 0;border-top:1px solid #eef2f6}',
      '#' + PANEL + '.rsai-fastpaint .rsaf-note{font-size:10px;',
      'color:#8595a6;margin:9px 0 0;line-height:1.5}'
    ].join('');
    doc.head?.appendChild(css);
  }
  function paintSkeleton(node) {
    node.classList.add('rsai-fastpaint');
    node.replaceChildren();
    const header = create('div', 'rsaf-row');
    header.append(create('strong', 'rsaf-title', '배달 수익 자동수집'),
      create('span', 'rsaf-state', '기록 확인 중'));
    node.append(header);
    const cells = create('div', 'rsaf-cells');
    for (const label of ['오늘 누적 수익', '최근 자동 인식']) {
      const cell = create('div', 'rsaf-cell');
      cell.append(create('small', '', label),
        create('strong', label === '오늘 누적 수익' ? 'rsaf-total' : 'rsaf-count',
          '확인 중'));
      cells.append(cell);
    }
    node.append(cells, create('div', 'rsaf-list', '기록을 불러오고 있어요.'),
      create('p', 'rsaf-note', '저장된 수익을 먼저 확인하고, 기기 자동수집 상태는 뒤이어 동기화합니다.'));
  }
  function updateTotal(node, serial, rows) {
    if (!isCurrent(node, serial)) return;
    const value = node.querySelector('.rsaf-total');
    if (!value) return;
    const sum = rows.filter(row => row.gross_entered !== false)
      .reduce((amount, row) => amount + (Number(row.gross_won) || 0), 0);
    value.textContent = fmt.format(sum) + '원';
    node.querySelector('.rsaf-state').textContent = '서버 수익 확인 · 동기화 중';
  }
  function updateRecords(node, serial, rows) {
    if (!isCurrent(node, serial)) return;
    const count = node.querySelector('.rsaf-count');
    const list = node.querySelector('.rsaf-list');
    if (!count || !list) return;
    count.textContent = rows.length ? '최근 ' + rows.length + '건' : '0건';
    list.replaceChildren();
    if (!rows.length) {
      list.textContent = '오늘 자동 인식된 배달이 아직 없어요.';
      return;
    }
    for (const row of rows.slice(0, 3)) {
      const item = create('div', 'rsaf-item');
      const when = new Date(row.captured_at || '');
      const stamp = Number.isFinite(when.getTime()) ? clock.format(when) : '';
      item.append(
        create('span', '', String(row.platform || '배달') + (stamp ? ' · ' + stamp : '')),
        create('strong', '', (row.status === 'applied' ? '+' : '') +
          fmt.format(Number(row.gross_won) || 0) + '원')
      );
      list.append(item);
    }
    node.querySelector('.rsaf-state').textContent = '서버 기록 확인 · 동기화 중';
  }
  async function readSummary(node, serial) {
    try {
      const client = win.__rsClient;
      if (!client?.auth?.getSession) return;
      const auth = await client.auth.getSession();
      const session = auth?.data?.session;
      const uid = session?.user?.id;
      if (!uid || !isCurrent(node, serial)) return;
      const day = workday();
      requested = true;
      // The two small scoped reads are independent and run in parallel,
      // without waiting for native candidate upload/ack processing.
      const earnings = client.from('rider_earnings')
        .select('gross_won,gross_entered')
        .eq('user_id', uid).eq('work_date', day).limit(100);
      const captures = client.from('rider_auto_deliveries')
        .select('captured_at,platform,gross_won,status')
        .eq('user_id', uid).eq('work_date', day)
        .order('captured_at', {ascending:false}).limit(3);
      const first = Promise.resolve(earnings).then(result => {
        if (result?.error) throw result.error;
        if (Array.isArray(result?.data) && result.data.length < 100)
          updateTotal(node, serial, result.data);
      }).catch(() => {
        if (isCurrent(node, serial)) {
          const value = node.querySelector('.rsaf-total');
          if (value) value.textContent = '동기화 중';
        }
      });
      const second = Promise.resolve(captures).then(result => {
        if (result?.error) throw result.error;
        if (Array.isArray(result?.data)) updateRecords(node, serial, result.data);
      }).catch(() => {
        if (isCurrent(node, serial)) {
          const value = node.querySelector('.rsaf-count');
          if (value) value.textContent = '동기화 중';
        }
      });
      await Promise.allSettled([first, second]);
    } catch {
      // App's native bridge remains authoritative; never mark a failed read as zero.
    } finally {
      if (isCurrent(node, serial)) pending = false;
    }
  }

  function attach() {
    const page = doc.querySelector('.finance-page');
    // Never create a fake capture menu in ordinary mobile browsers or APKs
    // that do not expose the native auto-income bridge.
    if (!page?.isConnected || !win.__rsIncomeNative || !win.__rsNativeInstalled) {
      if (!pane?.isConnected) {
        pane = null;pending = false;requested = false;
        panelObserver?.disconnect();panelObserver=null;
      }
      return;
    }
    let node = doc.getElementById(PANEL);
    if (nativeReady(node)) {
      if (node.classList.contains('rsai-fastpaint'))node.classList.remove('rsai-fastpaint');
      if (pane === node) { ++requestSerial; pending = false; requested = true; }
      panelObserver?.disconnect();panelObserver=null;
      return;
    }
    if (!node) {
      node = create('section');node.id = PANEL;
      node.setAttribute('aria-label', '자동 배달 수익');
      page.insertBefore(node, page.firstChild);
    }
    if (node !== pane) {
      pane = node;pending = false;requested = false;++requestSerial;
      panelObserver?.disconnect();panelObserver=null;
      style();paintSkeleton(node);
      if (typeof MutationObserver === 'function') {
        panelObserver = new MutationObserver(() => {
          if (!nativeReady(node)) return;
          node.classList.remove('rsai-fastpaint');
          panelObserver?.disconnect();panelObserver=null;
          if (pane === node) { ++requestSerial;pending = false;requested = true; }
        });
        panelObserver.observe(node,{childList:true});
      }
    }
    if (!pending && !requested) {
      const now = Date.now();
      if (now - lastAttempt < 1500) return;
      lastAttempt = now;
      pending = true;
      void readSummary(node, requestSerial);
    }
  }
  const schedule = () => win.requestAnimationFrame?.(attach);
  win.addEventListener('riderspot:screen', schedule);
  win.addEventListener('riderspot:tab-restored', schedule);
  doc.addEventListener('visibilitychange', () => { if (!doc.hidden) schedule(); });
  if (doc.readyState === 'loading')
    doc.addEventListener('DOMContentLoaded', schedule, {once:true});
  else schedule();
  win.setInterval(attach, 1200);
})(typeof window === 'undefined' ? null : window);
