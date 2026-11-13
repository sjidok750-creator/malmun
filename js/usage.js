/* 말문 — API 사용량 표시: 한 줄 띠(이번 달 / 월 예산 · 오늘) + 자세히 보기 시트.
   이 기기의 말문이 부른 호출만 센 추정값이다(가격표는 ai.js). 실제 청구는 Anthropic 콘솔에서 확인한다. */
import { S, save, h, el, icon, sheet, today, addDays, dayUsage, monthUsage, fmtUsd, fmtTok } from './core.js';

/* 예산 대비 단계: 색만으로 알리지 않고 늘 글자(%·'예산 넘음')와 표시(아이콘)를 함께 쓴다 */
function state() {
  const m = monthUsage(), d = dayUsage(), budget = +S.budget || 0, r = budget ? m.usd / budget : 0;
  return { m, d, budget, r, pct: Math.round(r * 100), level: !budget ? 'none' : r >= 1 ? 'over' : r >= 0.8 ? 'warn' : 'ok' };
}
function meter(r) {
  const t = el('i', 'u-meter'), f = el('b');
  f.style.width = (r > 0 ? Math.max(2, Math.min(100, r * 100)) : 0) + '%';
  t.append(f);
  return t;
}

/* 한 줄 띠 — 누르면 자세히 */
export function usageStrip() {
  const b = h('button', { class: 'usage', 'aria-label': 'API 사용량 자세히 보기', onclick: openUsage });
  const draw = () => {
    const s = state();
    b.dataset.level = s.level;
    b.textContent = '';
    b.append(el('span', 'u-l', 'API'), meter(s.budget ? s.r : 0),
      h('span', { class: 'u-v' }, h('b', null, fmtUsd(s.m.usd)), el('small', '', s.budget ? ' / $' + s.budget : ' 이번 달')),
      s.level === 'warn' || s.level === 'over'
        ? h('span', { class: 'u-s' }, icon('warn', 13), s.level === 'over' ? '예산 넘음' : s.pct + '%')
        : h('span', { class: 'u-d' }, '오늘 ', h('b', null, fmtUsd(s.d.usd))),
      icon('arrow', 14));
  };
  const onUse = () => { if (!b.isConnected) { window.removeEventListener('malmun:usage', onUse); return; } draw(); };
  window.addEventListener('malmun:usage', onUse);
  draw();
  return b;
}

/* 자세히: 이번 달 큰 숫자 + 미터 · 숫자 셋 · 최근 14일 막대(누르면 그날 값) · 날짜별 표 · 월 예산 */
export function openUsage() {
  const body = el('div', 'u-sheet');
  let pick = today();
  const dateLabel = k => { const [y, mo, da] = k.split('-').map(Number); return `${mo}/${da} (${'일월화수목금토'[new Date(y, mo - 1, da).getDay()]})`; };
  const draw = () => {
    const s = state();
    body.dataset.level = s.level;
    body.textContent = '';
    body.append(h('div', { class: 'u-hero' }, el('small', '', '이번 달'), h('b', null, fmtUsd(s.m.usd)),
      el('span', '', s.budget ? `/ $${s.budget} 예산 · ${s.pct}%` : '예산을 정하지 않았어요')));
    if (s.budget) body.append(meter(s.r));
    if (s.level === 'warn' || s.level === 'over') body.append(h('div', { class: 'u-status' }, icon('warn', 16), s.level === 'over' ? '이번 달 예산을 넘었어요.' : '이번 달 예산의 80% 를 넘었어요.'));
    const tile = (v, l) => h('div', null, h('b', null, v), el('small', '', l));
    body.append(h('div', { class: 'stats u-kpi' }, tile(fmtUsd(s.d.usd), '오늘'), tile(s.m.calls + '번', '이번 달 호출'), tile(fmtTok(s.m.in + s.m.out), '이번 달 토큰')));

    /* 최근 14일 — 한 가지 색 막대, 고른 날만 먹색. 누르면 위 설명줄이 그날 값으로 바뀐다 */
    const days = Array.from({ length: 14 }, (_, i) => addDays(today(), i - 13));
    const vals = days.map(k => dayUsage(k));
    const max = Math.max(...vals.map(v => v.usd), 0);
    const cap = el('span', 'u-cap');
    const setCap = () => { const v = dayUsage(pick); cap.textContent = `${pick === today() ? '오늘' : dateLabel(pick)} · ${fmtUsd(v.usd)} · ${v.calls}번`; };
    body.append(h('div', { class: 'u-chart-h' }, h('b', null, '최근 14일'), cap));
    const bars = el('div', 'u-bars');
    bars.setAttribute('role', 'group'); bars.setAttribute('aria-label', '최근 14일 하루 사용액');
    days.forEach((k, i) => {
      const v = vals[i];
      const col = h('button', { class: k === pick ? 'on' : '', 'aria-label': `${dateLabel(k)} ${fmtUsd(v.usd)} ${v.calls}번`, 'data-day': k });
      const bar = el('i'); bar.style.height = (max && v.usd ? Math.max(4, (v.usd / max) * 100) : 0) + '%';
      col.append(bar);
      const choose = () => { pick = k; bars.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === col)); setCap(); };
      col.addEventListener('click', choose); col.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') choose(); });
      bars.append(col);
    });
    body.append(bars, h('div', { class: 'u-x' }, el('span', '', dateLabel(days[0])), el('span', '', max ? '하루 최대 ' + fmtUsd(max) : '아직 쓴 기록이 없어요'), el('span', '', '오늘')));
    setCap();

    /* 표로 보기(최근 31일 가운데 쓴 날) */
    const rows = Array.from({ length: 31 }, (_, i) => addDays(today(), -i)).map(k => [k, dayUsage(k)]).filter(([, v]) => v.calls);
    if (rows.length) {
      const tb = h('table', null, h('thead', null, h('tr', null, ...['날짜', '호출', '입력', '출력', '금액'].map(t => el('th', '', t)))),
        h('tbody', null, ...rows.map(([k, v]) => h('tr', null, el('td', '', dateLabel(k)), el('td', '', v.calls + '번'), el('td', '', fmtTok(v.in)), el('td', '', fmtTok(v.out)), el('td', '', fmtUsd(v.usd))))));
      body.append(h('details', { class: 'u-table' }, el('summary', '', '날짜별 표'), tb));
    }

    const sel = h('select', { 'aria-label': '월 예산' }, ...[[0, '정하지 않음'], [5, '$5'], [10, '$10'], [20, '$20'], [50, '$50'], [100, '$100']].map(([v, t]) => h('option', { value: v, selected: (+S.budget || 0) === v }, t)));
    sel.addEventListener('change', () => { S.budget = +sel.value; save(); window.dispatchEvent(new Event('malmun:usage')); });
    body.append(h('label', { class: 'set-row' }, h('span', null, '월 예산', el('small', '', '표시와 알림에만 써요. 넘어도 대화는 막지 않아요.')), sel));
    body.append(h('p', { class: 'fine u-note' }, '이 기기의 말문에서 잰 추정값이에요. 실제 청구액은 ',
      h('a', { href: 'https://console.anthropic.com/', target: '_blank', rel: 'noopener' }, 'Anthropic 콘솔'), '의 사용량(Usage)에서 확인하세요.'));
  };
  const onUse = () => { if (!body.isConnected) { window.removeEventListener('malmun:usage', onUse); return; } draw(); };
  window.addEventListener('malmun:usage', onUse);
  draw();
  sheet('API 사용량', body);
}
