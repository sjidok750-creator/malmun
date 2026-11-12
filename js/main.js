/* 말문 — 시작·첫 설정·탭 이동 */
import { S, save, h, el, icon, toast } from './core.js';
import * as V from './voice.js';
import { nav, home, review, tutor, me, nextLesson } from './screens.js';
import { applyFreezes } from './core.js';
import { runLesson, runCheck } from './lesson.js';
import { openTalk } from './talk.js';
import { cover, speakCard } from './drill.js';
import { levelOf } from './ai.js';

const root = document.getElementById('app');
const view = el('main', 'view');
const tabs = el('nav', 'tabs');
root.append(view, tabs);

const TABS = [['home', '수업', 'home', home], ['review', '복습', 'review', review], ['tutor', 'AI 튜터', 'tutor', tutor], ['me', '내 정보', 'me', me]];
let current = 'home';
function go(tab) {
  if (!TABS.find(t => t[0] === tab)) tab = 'home';
  current = tab;
  V.stop(); V.abortListen();
  document.body.classList.remove('full');
  tabs.textContent = '';
  TABS.forEach(([k, label, ic]) => tabs.append(h('button', { class: k === tab ? 'on' : '', onclick: () => { if (location.hash !== '#' + k) location.hash = '#' + k; else go(k); } }, icon(ic, 22), el('span', '', label))));
  TABS.find(t => t[0] === tab)[3](view);
  view.scrollTop = 0; window.scrollTo(0, 0);
}
function full() { document.body.classList.add('full'); tabs.textContent = ''; window.scrollTo(0, 0); }

nav.full = full;
nav.go = (tab) => { if (location.hash !== '#' + tab) location.hash = '#' + tab; else go(tab); };
nav.openLesson = async (lesson, courseId) => {
  full();
  for (;;) {
    const r = await runLesson(view, lesson, { courseId });
    if (r.again) continue;
    if (r.next) { const nx = nextLesson(); if (nx) { lesson = nx.l; courseId = nx.c.id; continue; } }
    if (r.goto === 'me') { nav.go('me'); toast('Claude API 키를 넣고 설정 저장을 눌러 주세요.', 4000); return; }
    if (r.goto) { nav.go(r.goto); return; }
    break;
  }
  go(current);
};
nav.openCheck = async (course) => { full(); await runCheck(view, course); go('home'); };
nav.openTalk = async (rp, { kind = 'custom' } = {}) => {
  full();
  const r = await openTalk(view, { rp, level: levelOf(S.start), kind, title: rp.title_ko });
  if (r.goto) { nav.go(r.goto); toast('Claude API 키를 넣고 설정 저장을 눌러 주세요.', 4000); return; }
  go('tutor');
};
window.addEventListener('hashchange', () => go(location.hash.slice(1)));

/* ---------- 첫 설정 ---------- */
function onboarding() {
  full();
  const ans = { goal: 'daily', start: 'c1', dailyXp: 40 };
  const pages = [
    () => h('div', { class: 'ob welcome' }, cover('ob-img'),
      h('h1', { class: 'wordmark big' }, '말문', el('i', 'dot')), el('p', 'lead', '말문이 트이는 영어. 하루 10분, 소리 내어 말한 만큼 늘어요.'),
      h('ol', { class: 'ob-list' }, ...['유나를 따라 핵심 표현 배우기', '말하면 낱말에 초록불이 켜지는 스피킹 연습', 'AI 와 미션 롤플레이 · 프리토킹', '잊을 때쯤 다시 나오는 스마트 복습'].map((t, k) => h('li', null, el('i', 'num', '0' + (k + 1)), t)))),
    () => choice('영어로 무엇을 하고 싶어요?', 'goal', [['daily', '일상 대화', '친구·이웃과 편하게'], ['travel', '여행', '공항·호텔·식당에서'], ['work', '회사·업무', '회의·부탁·스몰토크'], ['fun', '그냥 재미로', '부담 없이 조금씩']]),
    () => choice('지금 영어 말하기는 어느 정도예요?', 'start', [['c1', '간단한 인사도 어려워요', '기초 회화부터 시작해요'], ['c1b', '짧은 문장은 말해요', '기초 회화부터 시작해요'], ['c2', '일상 대화는 조금 돼요', '여행·일상 회화부터 시작해요']]),
    () => choice('하루 목표를 정해요', 'dailyXp', [[20, '가볍게 — 5분', '하루 20 XP'], [40, '보통 — 10분', '하루 40 XP'], [70, '열심히 — 20분', '하루 70 XP']]),
    () => { const b = h('div', { class: 'ob' }, el('div', 'kicker', `${pages.length - 1} / ${pages.length - 1}`), el('h2', '', '마이크 시험'), el('p', 'lead', '마이크 버튼을 누르고 따라 말해 보세요. 들린 낱말이 초록색으로 바뀌어요.')); speakCard(b, { type: 'repeat', en: 'Hello, nice to meet you.', ko: '안녕하세요, 만나서 반가워요.', alts: [] }, { label: '따라 말해 보세요', noAsk: true }).then(() => next()); return b; },
  ];
  let i = 0;
  function choice(q, key, opts) {
    const b = h('div', { class: 'ob' }, el('div', 'kicker', `${i} / ${pages.length - 1}`), el('h2', '', q));
    opts.forEach(([v, t, sub]) => b.append(h('button', { class: 'opt' + (ans[key] === v ? ' on' : ''), onclick: () => { ans[key] = v; next(); } }, h('span', null, h('b', null, t), sub ? el('small', '', sub) : ''), icon('arrow', 16))));
    return b;
  }
  function render() {
    view.textContent = '';
    const s = el('div', 'screen onboard' + (i === 0 ? ' first' : ''));
    const dots = el('div', 'dots'); pages.forEach((_, k) => dots.append(el('i', k <= i ? 'on' : '')));
    s.append(dots, pages[i]());
    if (i === 0) s.append(h('button', { class: 'btn primary wide big', onclick: () => { V.unlock(); next(); } }, '시작하기'));
    if (i === pages.length - 1) s.append(h('button', { class: 'btn ghost wide', onclick: () => next() }, '나중에 할게요'));
    view.append(s);
  }
  function next() {
    if (i < pages.length - 1) { i++; render(); return; }
    S.goal = ans.goal; S.start = ans.start === 'c2' ? 'c2' : 'c1'; S.dailyXp = ans.dailyXp; S.onboarded = true; save();
    location.hash = '#home'; go('home');
  }
  render();
}

/* ---------- 시작 ---------- */
(async () => {
  view.append(el('div', 'loading', '불러오는 중…'));
  try {
    const [course] = await Promise.all([fetch('data/course.json', { cache: 'no-cache' }).then(r => r.json()), V.loadClips()]);
    nav.course = course;
  } catch (e) { view.textContent = '수업 자료를 불러오지 못했어요. 새로 고침해 주세요.'; return; }
  document.addEventListener('pointerdown', () => V.unlock(), { once: true });
  const used = applyFreezes();
  if (used) setTimeout(() => toast(`불꽃 지키기 ${used}개로 놓친 날을 메웠어요`, 3500), 600);
  if (!S.onboarded) onboarding(); else go(location.hash.slice(1) || 'home');
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
