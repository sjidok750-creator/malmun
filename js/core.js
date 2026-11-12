/* 말문 — 상태·저장·불꽃(연속 학습)·XP·복습 간격·화면 도우미 */

export const KEY = 'malmun.v1';
const DEF = {
  onboarded: false,
  goal: 'daily',            // travel | work | daily | fun
  start: 'c1',              // 시작 코스
  dailyXp: 40,              // 하루 목표 XP
  name: '',
  apiKey: '', model: 'claude-opus-5-5',
  rate: 1, handsFree: false, showKo: true,
  strict: 'normal',         // 말하기 판정: loose | normal | strict
  turnMode: 'auto',         // 말 끝: auto(멈추면 끝) | manual(직접 끝내기)
  feedbackAt: 'now',        // 대화 교정: now(바로) | end(대화 끝에)
  freezes: 0, frozen: [],   // 불꽃 지키기: 가진 개수, 쓴 날짜
  done: {},                 // lessonId → { at, stars, best }
  days: {},                 // 'YYYY-MM-DD' → { xp, lessons }
  repaired: [],             // 되살린 날짜
  lastLessonAt: 0,
  xp: 0,
  cards: {},                // 복습 카드 id → { id, en, ko, box, due, seen, ok, ng, src, at }
  mistakes: [],             // { at, said, better, why, src }
  custom: [],               // AI 가 만든 내 수업(lesson 객체)
  checks: {},               // 코스 실력 체크 결과 courseId → { at, score, pass }
  talks: [],                // 지난 대화 요약 { at, kind, title, turns, fixes }
};
function load() {
  try { const j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j && typeof j === 'object') return { ...structuredClone(DEF), ...j }; } catch (e) { /* 깨진 저장값: 새로 시작 */ }
  return structuredClone(DEF);
}
export const S = load();
export function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('저장 공간이 부족해요. 내 정보 → 백업 후 정리해 주세요.'); } }
export function resetAll() { localStorage.removeItem(KEY); location.reload(); }

/* ---------- 날짜 ---------- */
export function dayKey(t = Date.now()) {
  const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
export function addDays(key, n) { const [y, m, d] = key.split('-').map(Number); return dayKey(new Date(y, m - 1, d + n).getTime()); }
export const today = () => dayKey();
function dayOk(k) { return (S.days[k] && S.days[k].lessons > 0) || S.repaired.includes(k) || (S.frozen || []).includes(k); }

/* ---------- 불꽃 지키기(말문이 정한 규칙): 연속 7일마다 1개(최대 2개). 놓친 날(어제부터 거꾸로, 최대 2일)을 가진 개수만큼 자동으로 메운다 — 되살리기보다 먼저 ---------- */
export const FREEZE_MAX = 2;
export function applyFreezes() {
  S.frozen = S.frozen || [];
  const gap = [];
  let k = addDays(today(), -1);
  while (!dayOk(k) && gap.length <= FREEZE_MAX) { gap.push(k); k = addDays(k, -1); }
  if (!gap.length || gap.length > FREEZE_MAX || !dayOk(k) || gap.length > (S.freezes || 0)) return 0;
  gap.forEach(d => S.frozen.push(d));
  S.freezes -= gap.length; save();
  return gap.length;
}

/* ---------- 불꽃: 하루 수업 1개 이상이면 이어짐. 하루 빠졌어도 마지막 수업 뒤 48시간 안에 수업 2개를 끝내면 되살림 ---------- */
export function streak() {
  let k = today(), n = 0;
  if (!dayOk(k)) k = addDays(k, -1);
  while (dayOk(k)) { if (!(S.frozen || []).includes(k)) n++; k = addDays(k, -1); }   // 지킨 날은 끊기지 않게만, 세지는 않음
  return n;
}
export function revival() {
  const t = today(), y = addDays(t, -1), y2 = addDays(t, -2);
  if (dayOk(y) || !dayOk(y2)) return null;           // 어제 했거나, 그제도 안 했으면 대상 아님
  const base = dayKey(S.lastLessonAt) === t ? (S.prevDayLessonAt || 0) : S.lastLessonAt;   // 끊기기 전 마지막 수업 시각
  if (Date.now() - base > 48 * 3600 * 1000) return null;
  const doneToday = (S.days[t] && S.days[t].lessons) || 0;
  return { need: 2, doneToday, missed: y };
}
function tryRevive() {
  const r = revival();
  if (r && r.doneToday >= 2 && !S.repaired.includes(r.missed)) { S.repaired.push(r.missed); return true; }
  return false;
}

/* ---------- XP ---------- */
export function addXp(n) {
  if (!n) return;
  const k = today();
  S.days[k] = S.days[k] || { xp: 0, lessons: 0 };
  S.days[k].xp += n; S.xp += n; save();
}
export function todayXp() { const d = S.days[today()]; return d ? d.xp : 0; }
export function lessonFinished(id, info) {
  const k = today();
  const usedFreeze = applyFreezes();
  const before = streak();
  S.days[k] = S.days[k] || { xp: 0, lessons: 0 };
  S.days[k].lessons++;
  if (S.lastLessonAt && dayKey(S.lastLessonAt) !== k) S.prevDayLessonAt = S.lastLessonAt;
  S.lastLessonAt = Date.now();
  const revived = tryRevive();
  if (id) {
    const prev = S.done[id];
    S.done[id] = { at: Date.now(), stars: Math.max(info.stars || 0, prev ? prev.stars : 0), best: Math.max(info.score || 0, prev ? prev.best : 0) };
  }
  const now = streak(), grew = now > before;
  let freezeEarned = false;
  if (grew && now % 7 === 0 && (S.freezes || 0) < FREEZE_MAX) { S.freezes = (S.freezes || 0) + 1; freezeEarned = true; }
  save();
  return { streak: now, grew, revived, usedFreeze, freezeEarned, freezes: S.freezes || 0 };
}

/* ---------- 말문 레벨: 쌓인 XP 로 1~30 ---------- */
export function level() {
  let lv = 1, need = 60, left = S.xp;
  while (left >= need && lv < 30) { left -= need; lv++; need = Math.round(need * 1.18); }
  return { lv, into: left, need };
}

/* ---------- 스마트 복습: 상자(0~6) 간격 = 0·1·2·4·7·15·30일, 숙련도 = 상자/6 ---------- */
const GAP = [0, 1, 2, 4, 7, 15, 30];
export function cardId(en) { return 'k' + Array.from(String(en).toLowerCase().replace(/[^a-z0-9]/g, '')).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36); }
export function addCard(en, ko, src, box = 0) {
  if (!en || !ko) return null;
  const id = cardId(en);
  if (!S.cards[id]) { S.cards[id] = { id, en, ko, box, due: today(), seen: 0, ok: 0, ng: 0, src: src || '', at: Date.now() }; save(); }
  return S.cards[id];
}
export function dueCards() { const t = today(); return Object.values(S.cards).filter(c => c.due <= t).sort((a, b) => a.box - b.box || a.at - b.at); }
export function gradeCard(id, ok) {
  const c = S.cards[id]; if (!c) return;
  c.seen++;
  if (ok) { c.ok++; c.box = Math.min(6, c.box + 1); } else { c.ng++; c.box = Math.max(0, c.box - 2); }
  c.due = addDays(today(), ok ? GAP[c.box] || 1 : 0);
  if (!ok) c.due = today();
  save();
}
export const mastery = c => Math.round((c.box / 6) * 100);

/* ---------- 화면 도우미 ---------- */
export const $ = (s, r = document) => r.querySelector(s);
export function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
export function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
}
const ICONS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  review: 'M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4',
  tutor: 'M4 5h16v11H9l-5 4z',
  me: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  stop: 'M7 7h10v10H7z',
  play: 'M8 5v14l11-7z',
  slow: 'M12 8v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M15 5l-7 7 7 7',
  check: 'M5 12l5 5 9-10',
  flame: 'M12 2.5c.6 3.2 2.6 4.8 4.2 6.8 1.3 1.6 2.3 3.4 2.3 5.6A6.5 6.5 0 0 1 12 21.5a6.5 6.5 0 0 1-6.5-6.6c0-2.6 1.3-4.6 2.9-6.1-.1 1.9.6 3.2 1.9 3.9-.2-3.9 .6-7.2 1.7-10.2z',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z',
  keyboard: 'M3 6h18v12H3zM7 10h1M11 10h1M15 10h1M7 14h10',
  skip: 'M5 5l8 7-8 7zM15 5v14',
  send: 'M4 12l16-8-6 16-3-6z',
  plus: 'M12 5v14M5 12h14',
  book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4',
  lock: 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  ko: 'M5 6h6v5H5zM15 5v14M15 12h4',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 4a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
};
export function icon(name, size = 22, fill = false) {
  const NS = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('aria-hidden', 'true'); s.classList.add('ic');
  const p = document.createElementNS(NS, 'path'); p.setAttribute('d', ICONS[name] || '');
  p.setAttribute('fill', fill ? 'currentColor' : 'none'); p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '2'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
  s.append(p); return s;
}
let toastT = 0;
export function toast(msg, ms = 2600) {
  let t = $('#toast'); if (!t) { t = el('div', 'toast'); t.id = 'toast'; document.body.append(t); }
  t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms);
}
export function sheet(title, body, { onClose } = {}) {
  const back = el('div', 'sheet-back'), box = el('div', 'sheet');
  const close = () => { back.remove(); if (onClose) onClose(); };
  const head = h('div', { class: 'sheet-head' }, h('b', null, title), h('button', { class: 'icon-btn', 'aria-label': '닫기', onclick: close }, icon('close')));
  box.append(head, body); back.append(box);
  back.addEventListener('click', e => { if (e.target === back) close(); });
  document.body.append(back);
  return { close };
}
export function chime(ok = true) {
  try {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    const c = chime.c || (chime.c = new C()); if (c.state === 'suspended') c.resume();
    const notes = ok ? [660, 880] : [330, 247];
    notes.forEach((f, i) => {
      const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = f;
      const t0 = c.currentTime + i * 0.09; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + 0.25);
    });
  } catch (e) { /* 소리 없음 */ }
}
export function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
