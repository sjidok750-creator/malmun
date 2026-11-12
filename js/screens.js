/* 말문 — 탭 화면: 홈(코스)·복습·AI 튜터·내 정보 */
import { S, save, h, el, icon, toast, sheet, streak, revival, todayXp, level, dueCards, gradeCard, mastery, addXp, lessonFinished, resetAll, KEY, today, addDays, chime, cardId } from './core.js';
import * as V from './voice.js';
import { speakCard, talkingFace, charBadge, TEACHER } from './drill.js';
import { MODELS, callJSON, errText, hasKey, levelOf, QA_SCHEMA, qaPrompt, RP_SCHEMA, rpPrompt, LESSON_SCHEMA, lessonPrompt } from './ai.js';

export const nav = {};   // main.js 가 채움: openLesson(lesson, courseId), openCheck(course), openTalk(rp, opts), go(tab), course

/* ---------- 머리 띠(불꽃·오늘 XP·레벨) ---------- */
function topBar() {
  const lv = level(), xp = todayXp(), goal = S.dailyXp;
  const ring = el('div', 'ring');
  ring.style.setProperty('--p', Math.min(100, Math.round((xp / goal) * 100)));
  ring.append(el('b', '', String(xp)), el('small', '', '/' + goal));
  return h('div', { class: 'topbar' },
    h('div', { class: 'brand' }, h('b', null, '말문'), el('small', '', 'Lv.' + lv.lv)),
    h('div', { class: 'tb-r' }, h('div', { class: 'streak' + (streak() ? ' on' : ''), title: '연속 학습일' + (S.freezes ? ` · 불꽃 지키기 ${S.freezes}개` : '') }, icon('flame', 20, true), h('b', null, String(streak())), S.freezes ? el('small', 'fz', '지키기 ' + S.freezes) : ''), ring));
}

export function allLessons() { const out = []; nav.course.courses.forEach(c => c.units.forEach(u => u.lessons.forEach(l => out.push({ c, u, l })))); return out; }
export function nextLesson() {
  const list = allLessons();
  const startIdx = Math.max(0, list.findIndex(x => x.c.id === S.start));
  const order = list.slice(startIdx).concat(list.slice(0, startIdx));
  return order.find(x => !S.done[x.l.id]) || null;
}

/* ---------- 홈 ---------- */
export function home(root) {
  root.textContent = '';
  const s = el('div', 'screen tab home');
  s.append(topBar());
  const rv = revival();
  if (rv) s.append(h('div', { class: 'banner flame' }, icon('flame', 20, true), h('div', null, h('b', null, '불꽃 살리기'), el('div', '', `어제를 놓쳤어요. 오늘 수업 2개를 끝내면 연속 기록이 이어져요 (${Math.min(2, rv.doneToday)}/2)`))));
  const nx = nextLesson();
  if (nx) {
    const card = h('button', { class: 'today', onclick: () => nav.openLesson(nx.l, nx.c.id) });
    card.append(h('div', { class: 'today-t' }, el('small', '', '오늘의 수업 · ' + nx.c.title + ' · ' + nx.u.title), h('b', null, nx.l.title), el('span', '', nx.l.goal_ko)), talkingFace(72));
    s.append(card);
  } else s.append(h('div', { class: 'today done' }, h('div', { class: 'today-t' }, h('b', null, '모든 수업을 마쳤어요!'), el('span', '', 'AI 튜터에서 나만의 수업을 만들어 보세요.'))));
  const due = dueCards().length;
  s.append(h('button', { class: 'review-cta' + (due ? ' due' : ''), onclick: () => nav.go('review') }, icon('review'), h('div', null, h('b', null, due ? `복습할 문장 ${due}개` : '복습할 문장이 없어요'), el('small', '', '스마트 복습 — 잊을 때쯤 다시 말해 봐요')), icon('back', 18)));

  nav.course.courses.forEach(c => {
    const sec = el('section', 'course');
    const cnt = c.units.reduce((a, u) => a + u.lessons.filter(l => S.done[l.id]).length, 0), all = c.units.reduce((a, u) => a + u.lessons.length, 0);
    sec.append(h('div', { class: 'course-h' }, h('div', null, h('b', null, c.title), el('small', '', c.level + ' · ' + c.desc_ko)), el('span', 'cnt', cnt + '/' + all)));
    c.units.forEach((u, ui) => {
      const box = el('div', 'unit');
      box.append(el('div', 'unit-t', `${ui + 1}단원 · ${u.title}`));
      u.lessons.forEach((l, li) => {
        const d = S.done[l.id];
        const row = h('button', { class: 'lrow' + (d ? ' done' : '') + (nx && nx.l.id === l.id ? ' next' : ''), onclick: () => nav.openLesson(l, c.id) },
          h('i', { class: 'num' }, d ? icon('check', 16) : String(li + 1)), h('div', null, h('b', null, l.title), el('small', '', l.goal_ko)),
          d ? h('span', { class: 'mini-stars' }, ...[0, 1, 2].map(k => h('span', { class: k < d.stars ? 'on' : '' }, icon('star', 13, true)))) : '');
        box.append(row);
      });
      sec.append(box);
    });
    const ck = S.checks[c.id];
    sec.append(h('button', { class: 'lrow check' + (ck && ck.pass ? ' done' : ''), onclick: () => nav.openCheck(c) }, h('i', { class: 'num' }, icon('target', 16)),
      h('div', null, h('b', null, '실력 체크'), el('small', '', ck ? `최고 ${ck.score}점 · ${ck.pass ? '통과' : '75점 이상이면 통과'}` : '이 코스를 힌트 없이 말할 수 있는지 확인해요'))));
    s.append(sec);
  });
  root.append(s);
}

/* ---------- 복습 ---------- */
export function review(root) {
  root.textContent = '';
  const s = el('div', 'screen tab review');
  s.append(topBar());
  const due = dueCards(), all = Object.values(S.cards);
  const head = el('div', 'rev-head');
  head.append(h('div', null, h('b', null, `오늘 복습 ${due.length}개`), el('small', '', `모은 문장 ${all.length}개 · 잊을 때쯤 다시 나와요`)));
  const go = h('button', { class: 'btn primary', disabled: !due.length, onclick: () => runReview(root, due.slice(0, 15)) }, '복습 시작');
  head.append(go);
  s.append(head);
  const mis = S.mistakes.filter(m => m.said && m.better);
  if (mis.length) {
    const last = mis.slice(-10).reverse();
    const box = el('div', 'mistakes');
    box.append(h('div', { class: 'mis-h' }, h('div', null, h('b', null, `내 실수 ${mis.length}개`), el('small', '', 'AI 대화에서 고친 문장 — 원래 말을 보고 고쳐 말해 봐요')),
      h('button', { class: 'btn ghost', onclick: () => runFixDrill(root, last) }, '고쳐 말하기')));
    last.slice(0, 3).forEach(m => box.append(h('div', { class: 'fix-card' }, h('div', { class: 'said' }, m.said), h('div', { class: 'better', lang: 'en' }, m.better), m.why ? el('div', 'why', m.why) : '')));
    s.append(box);
  }
  if (!all.length) s.append(el('p', 'empty', '수업에서 배운 표현과 대화에서 고친 문장이 여기에 모여요.'));
  const filt = el('div', 'seg');
  let mode = 'all';
  const listBox = el('div', 'cards');
  const draw = () => {
    listBox.textContent = '';
    let cs = all.slice().sort((a, b) => b.at - a.at);
    if (mode === 'weak') cs = cs.filter(c => c.box <= 2);
    if (mode === 'fix') cs = cs.filter(c => c.src === 'fix');
    if (mode === 'saved') cs = cs.filter(c => c.src === 'saved' || c.src === 'qa');
    cs.forEach(c => {
      const bar = el('i', 'mbar'); const f = el('b'); f.style.width = Math.max(4, mastery(c)) + '%'; bar.append(f);
      listBox.append(h('div', { class: 'pcard' },
        h('div', { class: 'pc-t' }, h('div', { class: 'en', lang: 'en' }, c.en), el('div', 'ko', c.ko), h('div', { class: 'pc-m' }, bar, el('small', '', `숙련도 ${mastery(c)}% · 다음 ${c.due <= today() ? '오늘' : c.due.slice(5).replace('-', '/')}`))),
        h('div', { class: 'pc-b' }, h('button', { class: 'icon-btn', 'aria-label': '듣기', onclick: () => V.say(c.en, { lang: 'en', voice: TEACHER.voice }) }, icon('play')),
          h('button', { class: 'icon-btn', 'aria-label': '지우기', onclick: () => { if (confirm('이 문장을 복습에서 뺄까요?')) { delete S.cards[c.id]; save(); review(root); } } }, icon('trash')))));
    });
  };
  [['all', '전체'], ['weak', '약한 문장'], ['fix', '고친 문장'], ['saved', '저장한 문장']].forEach(([k, t]) => filt.append(h('button', { class: k === mode ? 'on' : '', onclick: e => { mode = k; filt.querySelectorAll('button').forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on'); draw(); } }, t)));
  if (all.length) s.append(filt, listBox);
  draw();
  root.append(s);
}
/* 내 실수 고쳐 말하기: 원래 한 말·이유를 보고, 고친 문장을 말한다(기기 안에서 채점, API 안 씀) */
async function runFixDrill(root, list) {
  let ok = 0, quit = false;
  for (let i = 0; i < list.length && !quit; i++) {
    root.textContent = '';
    const scr = el('div', 'screen lesson');
    const bar = el('div', 'progress'); const fill = el('i'); fill.style.width = Math.round((i / list.length) * 100) + '%'; bar.append(fill);
    scr.append(h('div', { class: 'l-top' }, h('button', { class: 'icon-btn', 'aria-label': '그만하기', onclick: () => { quit = true; V.stop(); V.abortListen(); nav.go('review'); } }, icon('close')), bar));
    const body = el('div', 'l-body'); body.append(el('div', 'l-kicker', `내 실수 고쳐 말하기 ${i + 1}/${list.length}`));
    scr.append(body); root.append(scr);
    const m = list[i];
    const card = S.cards[cardId(m.better)];
    const r = await speakCard(body, { type: 'fix', en: m.better, said: m.said, why: m.why, ko: card && card.ko !== m.why ? card.ko : '', alts: [] }, { autoNext: true, maxTries: 2 });
    if (quit) return;
    if (r.pass && !r.skipped) { ok++; addXp(r.firstTry ? 2 : 1); if (card) gradeCard(card.id, true); }
  }
  if (quit) return;
  root.textContent = '';
  const s = el('div', 'screen result');
  s.append(el('h2', '', '실수 고쳐 말하기 끝!'), el('p', 'big-num', `${ok}/${list.length}`), el('p', 'sub', '자주 틀리는 문장은 대화에서 다시 써 보면 오래 남아요.'),
    h('button', { class: 'btn primary wide big', onclick: () => nav.go('review') }, '확인'));
  root.append(s); chime(true);
}
async function runReview(root, cards) {
  let ok = 0, quit = false;
  for (let i = 0; i < cards.length && !quit; i++) {
    root.textContent = '';
    const scr = el('div', 'screen lesson');
    const bar = el('div', 'progress'); const fill = el('i'); fill.style.width = Math.round((i / cards.length) * 100) + '%'; bar.append(fill);
    scr.append(h('div', { class: 'l-top' }, h('button', { class: 'icon-btn', 'aria-label': '그만하기', onclick: () => { quit = true; V.stop(); V.abortListen(); nav.go('review'); } }, icon('close')), bar));
    const body = el('div', 'l-body'); body.append(el('div', 'l-kicker', `스마트 복습 ${i + 1}/${cards.length}`));
    scr.append(body); root.append(scr);
    const c = cards[i];
    const r = await speakCard(body, { type: 'translate', en: c.en, ko: c.ko, alts: [] }, { autoNext: true, maxTries: 2 });
    if (quit) return;
    const good = r.pass && !r.skipped;
    gradeCard(c.id, good);
    if (good) { ok++; addXp(r.firstTry ? 2 : 1); }
  }
  if (quit) return;
  lessonFinished(null, {});
  root.textContent = '';
  const s = el('div', 'screen result');
  s.append(el('h2', '', '복습 완료!'), el('p', 'big-num', `${ok}/${cards.length}`), el('p', 'sub', '맞힌 문장은 더 긴 간격 뒤에, 틀린 문장은 곧 다시 나와요.'),
    h('button', { class: 'btn primary wide big', onclick: () => nav.go('review') }, '확인'));
  root.append(s); chime(true);
}

/* ---------- AI 튜터 ---------- */
const TOPICS = [
  ['요즘 빠진 취미', 'a hobby you are into these days'], ['주말 계획', 'plans for the weekend'], ['좋아하는 음식', 'your favorite food and where to eat it'],
  ['여행 이야기', 'a trip you remember'], ['일과 회사 생활', 'your work and a typical day'], ['영화·드라마', 'a movie or series you liked recently'],
  ['운동과 건강', 'exercise and staying healthy'], ['우리 동네', 'the neighborhood you live in'], ['어릴 적 추억', 'a childhood memory'],
  ['커피 vs 차', 'coffee or tea and your daily routine'], ['반려동물', 'pets'], ['요즘 고민', 'something you are thinking about lately (light topics)'],
  ['한국 소개하기', 'introducing Korea to a foreign friend'], ['출퇴근', 'commuting'], ['좋아하는 계절', 'your favorite season'], ['음악', 'music you listen to'],
];
const TUTOR_RP = { ai_name: 'Ellie', ai_voice: 'F3', ai_role: 'a friendly English conversation partner from Portland who is curious about Korea' };

export function tutor(root) {
  root.textContent = '';
  const s = el('div', 'screen tab tutor');
  s.append(topBar());
  if (!hasKey()) s.append(h('div', { class: 'banner' }, icon('sparkle'), h('div', null, h('b', null, 'AI 튜터는 Claude API 키가 필요해요'), el('div', '', '내 정보 → 설정에서 키를 넣어 주세요. 키는 이 기기에만 저장돼요.'))));
  const grid = el('div', 'tgrid');
  const tile = (ic, t, d, fn) => h('button', { class: 'ttile', onclick: fn }, icon(ic, 26), h('b', null, t), el('small', '', d));
  grid.append(
    tile('tutor', '프리토킹', '주제를 골라 자유롭게', () => pickTopic()),
    tile('target', '롤플레이 만들기', '내가 겪을 상황을 연습', () => makeRp()),
    tile('book', '문법·표현 질문', '헷갈리는 것을 한국어로', () => qa(root)),
    tile('sparkle', '나만의 수업', '주제·내 실수로 수업 생성', () => makeLesson()));
  s.append(grid);

  if (S.custom.length) {
    s.append(el('h3', 'sec', '내가 만든 수업'));
    S.custom.slice().reverse().forEach(l => s.append(h('div', { class: 'lrow-wrap' },
      h('button', { class: 'lrow' + (S.done[l.id] ? ' done' : ''), onclick: () => nav.openLesson(l, S.start) }, h('i', { class: 'num' }, S.done[l.id] ? icon('check', 16) : icon('sparkle', 16)), h('div', null, h('b', null, l.title), el('small', '', l.goal_ko))),
      h('button', { class: 'icon-btn', 'aria-label': '지우기', onclick: () => { if (confirm('이 수업을 지울까요?')) { S.custom = S.custom.filter(x => x.id !== l.id); save(); tutor(root); } } }, icon('trash')))));
  }
  if (S.talks.length) {
    s.append(el('h3', 'sec', '지난 대화'));
    S.talks.slice(0, 8).forEach(t => s.append(h('div', { class: 'talk-row' }, h('b', null, t.title), el('small', '', `${new Date(t.at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' })} · 말 ${t.turns}번 · 고침 ${t.fixes}개` + (t.missions && t.missions !== '0/0' ? ' · 미션 ' + t.missions : '')))));
  }
  root.append(s);

  function pickTopic() {
    const body = el('div', 'topics');
    const sh = sheet('프리토킹 주제', body);
    TOPICS.forEach(([ko, en]) => body.append(h('button', { class: 'topic', onclick: () => { sh.close(); V.unlock(); startFree(ko, en); } }, ko)));
    const own = h('form', { class: 'type-box', onsubmit: e => { e.preventDefault(); const v = oi.value.trim(); if (v) { sh.close(); V.unlock(); startFree(v, v); } } });
    const oi = h('input', { type: 'text', placeholder: '직접 주제 입력(한국어 가능)' });
    own.append(oi, h('button', { class: 'icon-btn', type: 'submit', 'aria-label': '시작' }, icon('send')));
    body.append(own);
  }
  function startFree(ko, en) {
    const opener = `Hi! I'm Ellie. Let's chat about ${en}. So, tell me, what comes to mind first?`;
    nav.openTalk({ ...TUTOR_RP, title_ko: '프리토킹 · ' + ko, scene_ko: `엘리와 「${ko}」 이야기를 나눠요. 틀려도 괜찮아요, 고칠 문장은 알려 줄게요.`, user_role_ko: '나', opener, opener_ko: `안녕하세요! 저는 엘리예요. ${ko} 이야기를 해 봐요. 먼저 떠오르는 게 뭐예요?`, missions: [], useful: [{ en: 'Let me think.', ko: '생각 좀 해 볼게요.' }, { en: 'How do you say that in English?', ko: '그걸 영어로 뭐라고 해요?' }, { en: 'Could you say that again, please?', ko: '다시 말해 줄래요?' }] }, { kind: 'free' });
  }
  function makeRp() {
    const body = el('div', 'gen');
    body.append(el('p', '', '연습하고 싶은 상황을 한국어로 적어 주세요. 상대 역할·미션 3개를 만들어 드려요.'));
    const ta = h('textarea', { rows: 3, placeholder: '예: 미용실에서 앞머리만 조금 자르고 싶다고 말하기' });
    const go = h('button', { class: 'btn primary wide' }, '만들기');
    const msg = el('p', 'note');
    body.append(ta, go, msg);
    const sh = sheet('롤플레이 만들기', body);
    go.onclick = async () => {
      const v = ta.value.trim(); if (!v) return;
      if (!hasKey()) { msg.textContent = '먼저 내 정보 → 설정에서 API 키를 넣어 주세요.'; return; }
      go.disabled = true; msg.textContent = '상황을 만드는 중…';
      try { const rp = await callJSON(rpPrompt(v, levelOf(S.start)), RP_SCHEMA, { effort: 'low' }); sh.close(); V.unlock(); nav.openTalk(rp, { kind: 'custom' }); }
      catch (e) { msg.textContent = errText(e); go.disabled = false; }
    };
  }
  function makeLesson() {
    const body = el('div', 'gen');
    body.append(el('p', '', '배우고 싶은 주제나 상황을 적으면 배우기·스피킹 연습·롤플레이가 있는 수업 하나를 만들어 드려요.'));
    const ta = h('textarea', { rows: 3, placeholder: '예: 해외 출장 중 거래처와 저녁 식사하며 스몰토크' });
    const go = h('button', { class: 'btn primary wide' }, '주제로 만들기');
    const recent = S.mistakes.slice(-8);
    const fromFix = h('button', { class: 'btn ghost wide', disabled: recent.length < 2 }, `내 실수로 맞춤 수업 만들기 (최근 고친 문장 ${recent.length}개)`);
    const msg = el('p', 'note', recent.length < 2 ? '맞춤 수업은 AI 대화에서 고친 문장이 2개 이상 모이면 만들 수 있어요.' : '');
    body.append(ta, go, fromFix, msg);
    const sh = sheet('나만의 수업', body);
    const run = async (args, btn) => {
      if (!hasKey()) { msg.textContent = '먼저 내 정보 → 설정에서 API 키를 넣어 주세요.'; return; }
      go.disabled = fromFix.disabled = true; msg.textContent = '수업을 만드는 중… (30초~1분)';
      try {
        const l = await callJSON(lessonPrompt({ ...args, level: levelOf(S.start) }), LESSON_SCHEMA, { effort: 'medium' });
        const lesson = sanitizeLesson(l);
        S.custom.push(lesson); save(); sh.close(); toast('새 수업을 만들었어요: ' + lesson.title); tutor(root);
      } catch (e) { msg.textContent = typeof e === 'string' ? e : errText(e); go.disabled = false; fromFix.disabled = recent.length < 2; }
      void btn;
    };
    go.onclick = () => { const v = ta.value.trim(); if (v) run({ topic: v }, go); };
    fromFix.onclick = () => run({ topic: '', mistakes: recent }, fromFix);
  }
}
function sanitizeLesson(l) {
  const str = v => (typeof v === 'string' ? v.trim() : '');
  if (!l || !Array.isArray(l.learn) || !Array.isArray(l.practice) || !l.learn.length || !l.practice.length) throw '수업 형식이 맞지 않아요. 다시 만들어 주세요.';
  const id = 'my' + Date.now().toString(36);
  return {
    id, custom: true, title: str(l.title) || '나만의 수업', goal_ko: str(l.goal_ko),
    learn: l.learn.slice(0, 4).map(x => ({ en: str(x.en), ko: str(x.ko), note_ko: str(x.note_ko), pattern: str(x.pattern) })).filter(x => x.en),
    practice: l.practice.slice(0, 14).map(x => ({ type: ['repeat', 'translate', 'pattern'].includes(x.type) ? x.type : 'translate', en: str(x.en), ko: str(x.ko), pattern: str(x.pattern), cue_ko: str(x.cue_ko), alts: Array.isArray(x.alts) ? x.alts.map(str).filter(Boolean) : [] }))
      .filter(x => x.en && x.ko).map(x => (x.type === 'pattern' && !x.pattern.includes('___') ? { ...x, type: 'translate' } : x)),
    vocab: (l.vocab || []).slice(0, 8).map(x => ({ en: str(x.en), ko: str(x.ko) })).filter(x => x.en && x.ko),
    roleplay: l.roleplay && Array.isArray(l.roleplay.missions) ? { ...l.roleplay, missions: l.roleplay.missions.slice(0, 3) } : null,
  };
}

/* 문법·표현 질문 채팅 */
function qa(root) {
  if (nav.full) nav.full();
  root.textContent = '';
  const s = el('div', 'screen talk qa');
  const log = [];
  const head = h('header', { class: 'talk-head' }, h('button', { class: 'icon-btn', 'aria-label': '뒤로', onclick: () => { V.stop(); nav.go('tutor'); } }, icon('back')),
    h('div', { class: 'who' }, talkingFace(40), h('div', null, h('b', null, TEACHER.name), el('small', '', '문법·표현 질문'))));
  const list = el('div', 'msgs');
  list.append(h('div', { class: 'msg them' }, el('div', 't', '헷갈리는 문법이나 "이건 영어로 뭐라고 해요?" 같은 질문을 한국어로 편하게 물어보세요.')));
  const form = h('form', { class: 'type-box solid' });
  const inp = h('input', { type: 'text', placeholder: '예: I have been 과 I went 차이가 뭐예요?' });
  const mic = h('button', { class: 'icon-btn', type: 'button', 'aria-label': '말로 묻기', onclick: async () => {
    if (!V.micAvailable()) { toast(V.MIC_ERR['no-sr']); return; }
    mic.classList.add('on'); const l = V.listen({ lang: 'ko-KR', onInterim: t => { inp.value = t; } });
    try { const { text } = await l.promise; if (text) inp.value = text; } catch (e) { toast(V.MIC_ERR[e.code] || V.MIC_ERR.start); } finally { mic.classList.remove('on'); }
  } }, icon('mic'));
  form.append(mic, inp, h('button', { class: 'icon-btn', type: 'submit', 'aria-label': '보내기' }, icon('send')));
  s.append(head, list, form);
  root.append(s);
  let busy = false;
  form.onsubmit = async e => {
    e.preventDefault();
    const q = inp.value.trim(); if (!q || busy) return;
    if (!hasKey()) { toast('먼저 내 정보 → 설정에서 API 키를 넣어 주세요.', 3500); return; }
    inp.value = ''; busy = true;
    list.append(h('div', { class: 'msg me' }, el('div', 't', q)));
    const pend = h('div', { class: 'msg them pending' }, el('div', 't', '생각하는 중…')); list.append(pend); list.scrollTop = list.scrollHeight;
    try {
      const r = await callJSON(qaPrompt(q, log), QA_SCHEMA, { effort: 'low' });
      log.push({ who: 'me', text: q }, { who: 'them', text: r.answer_ko });
      pend.remove();
      const b = h('div', { class: 'msg them' }, el('div', 't', r.answer_ko));
      (r.examples || []).forEach(x => b.append(h('div', { class: 'ex' }, h('div', { class: 'en', lang: 'en' }, x.en), el('div', 'ko', x.ko),
        h('div', { class: 'tools' }, h('button', { class: 'mini', onclick: () => V.say(x.en, { lang: 'en', voice: TEACHER.voice }) }, icon('play', 14), '듣기'),
          h('button', { class: 'mini', onclick: ev => { import('./core.js').then(m => { m.addCard(x.en, x.ko, 'qa'); ev.currentTarget.textContent = '복습에 넣음'; ev.currentTarget.disabled = true; }); } }, icon('plus', 14), '복습에 넣기')))));
      list.append(b);
    } catch (err) { pend.remove(); list.append(el('div', 'msg sys', errText(err))); }
    finally { busy = false; list.scrollTop = list.scrollHeight; }
  };
}

/* ---------- 내 정보·설정 ---------- */
export function me(root) {
  root.textContent = '';
  const s = el('div', 'screen tab me');
  s.append(topBar());
  const lv = level();
  const doneN = Object.keys(S.done).length;
  const spoken = Object.values(S.days).reduce((a, d) => a + d.xp, 0);
  s.append(h('div', { class: 'stats' },
    h('div', null, h('b', null, 'Lv.' + lv.lv), el('small', '', `다음 레벨까지 ${lv.need - lv.into} XP`)),
    h('div', null, h('b', null, String(streak())), el('small', '', '일 연속')),
    h('div', null, h('b', null, String(doneN)), el('small', '', '끝낸 수업')),
    h('div', null, h('b', null, String(S.xp)), el('small', '', '전체 XP'))));
  void spoken;
  /* 최근 5주 달력 */
  const cal = el('div', 'cal');
  const t = today();
  const start = addDays(t, -34 - ((new Date().getDay() + 6) % 7) + 6);
  for (let i = 0; i < 35; i++) {
    const k = addDays(start, i); const d = S.days[k];
    const c = el('i', d && d.lessons ? (d.xp >= S.dailyXp ? 'lv2' : 'lv1') : S.repaired.includes(k) ? 'rep' : '');
    if (k === t) c.classList.add('today'); if (k > t) c.classList.add('future');
    c.title = k + (d ? ` · ${d.xp} XP` : ''); cal.append(c);
  }
  s.append(el('h3', 'sec', '최근 5주'), cal);

  s.append(el('h3', 'sec', '설정'));
  const set = el('div', 'settings');
  const keyIn = h('input', { type: 'password', placeholder: 'sk-ant-…', value: S.apiKey || '', autocomplete: 'off' });
  const model = h('select', null, ...Object.entries(MODELS).map(([k, v]) => h('option', { value: k, selected: S.model === k }, v)));
  const goal = h('select', null, ...[[20, '가볍게 — 하루 20 XP'], [40, '보통 — 하루 40 XP'], [70, '열심히 — 하루 70 XP']].map(([v, t2]) => h('option', { value: v, selected: S.dailyXp === v }, t2)));
  const rate = h('select', null, ...[[0.85, '조금 느리게'], [1, '보통'], [1.1, '조금 빠르게']].map(([v, t2]) => h('option', { value: v, selected: S.rate === v }, t2)));
  const showKo = h('input', { type: 'checkbox', checked: S.showKo });
  const hands = h('input', { type: 'checkbox', checked: S.handsFree });
  const strict = h('select', null, ...[['loose', '느슨 — 낱말 몇 개 빠져도 통과'], ['normal', '보통'], ['strict', '엄격 — 관사·이름까지 정확히']].map(([v, t2]) => h('option', { value: v, selected: S.strict === v }, t2)));
  const turn = h('select', null, ...[['auto', '자동 — 말을 멈추면 끝'], ['manual', '직접 — 버튼을 다시 눌러 끝']].map(([v, t2]) => h('option', { value: v, selected: S.turnMode === v }, t2)));
  const fbAt = h('select', null, ...[['now', '바로 — 말할 때마다'], ['end', '대화 끝에 모아서']].map(([v, t2]) => h('option', { value: v, selected: S.feedbackAt === v }, t2)));
  const row = (label, ctl, note) => h('label', { class: 'set-row' }, h('span', null, label, note ? el('small', '', note) : ''), ctl);
  set.append(
    row('Claude API 키', keyIn, '롤플레이·튜터에만 쓰여요. 이 기기에만 저장되고 다른 곳에 보내지 않아요.'),
    row('AI 모델', model),
    row('하루 목표', goal),
    row('말하기 속도', rate),
    row('말하기 판정', strict, '연습·복습에서 몇 낱말까지 봐줄지'),
    row('말 끝내기', turn, '말하다 자주 쉬면 「직접」이 편해요'),
    row('대화 교정 보기', fbAt),
    row('한국어 뜻 보이기', showKo),
    row('대화 자동 듣기', hands, '상대가 말을 마치면 마이크가 바로 켜져요'),
  );
  const saveBtn = h('button', { class: 'btn primary wide', onclick: () => {
    S.apiKey = keyIn.value.trim(); S.model = model.value; S.dailyXp = +goal.value; S.rate = +rate.value; S.showKo = showKo.checked; S.handsFree = hands.checked;
    S.strict = strict.value; S.turnMode = turn.value; S.feedbackAt = fbAt.value; save(); toast('저장했어요'); me(root);
  } }, '설정 저장');
  set.append(saveBtn);
  s.append(set);

  s.append(el('h3', 'sec', '마이크·소리 시험'));
  const test = el('div', 'mic-test');
  s.append(test);
  speakCard(test, { type: 'repeat', en: 'Nice to meet you.', ko: '만나서 반가워요.', alts: [] }, { label: '마이크가 잘 되는지 따라 말해 보세요', autoPlay: false, noAsk: true }).then(() => toast('마이크 시험 끝'));

  s.append(el('h3', 'sec', '백업'));
  s.append(h('div', { class: 'row-btns' },
    h('button', { class: 'btn ghost', onclick: () => { const blob = new Blob([JSON.stringify({ ...S, apiKey: '' }, null, 1)], { type: 'application/json' }); const a = h('a', { href: URL.createObjectURL(blob), download: 'malmun-backup-' + today() + '.json' }); a.click(); } }, '내보내기(키 빼고)'),
    h('button', { class: 'btn ghost', onclick: () => { const f = h('input', { type: 'file', accept: 'application/json' }); f.onchange = async () => { try { const j = JSON.parse(await f.files[0].text()); j.apiKey = S.apiKey; localStorage.setItem(KEY, JSON.stringify(j)); location.reload(); } catch (e) { toast('백업 파일을 읽지 못했어요'); } }; f.click(); } }, '불러오기'),
    h('button', { class: 'btn danger', onclick: () => { if (confirm('모든 기록(수업·복습·XP)을 지울까요? 되돌릴 수 없어요.')) resetAll(); } }, '처음부터')));
  s.append(h('p', { class: 'fine about' }, '말문 — 개인 학습용. 선생님·연습 문장 목소리는 Supertonic 3(OpenRAIL-M)로 만든 AI 목소리이고, 대화 상대 목소리는 이 기기의 음성 합성입니다. 음성 인식은 브라우저 기능을 씁니다. AI 대화는 Claude(Anthropic)가 답합니다.'));
  root.append(s);
  void addXp; void charBadge; void dueCards;
}
