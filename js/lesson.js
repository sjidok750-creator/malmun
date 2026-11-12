/* 말문 — 수업 한 개: 배우기(선생님) → 스피킹 연습 12문장 → 단어 짝 맞추기 → AI 롤플레이 → 결과 */
import { S, save, h, el, icon, toast, chime, addXp, addCard, lessonFinished, shuffle } from './core.js';
import * as V from './voice.js';
import { speakCard, talkingFace, TEACHER } from './drill.js';
import { openTalk } from './talk.js';
import { levelOf } from './ai.js';

function frame(root, { step, total, title, onClose }) {
  root.textContent = '';
  const scr = el('div', 'screen lesson');
  const top = el('div', 'l-top');
  const x = h('button', { class: 'icon-btn', 'aria-label': '그만하기', onclick: onClose }, icon('close'));
  const bar = el('div', 'progress'); const fill = el('i'); fill.style.width = Math.round((step / total) * 100) + '%'; bar.append(fill);
  top.append(x, bar);
  const body = el('div', 'l-body');
  if (title) body.append(el('div', 'l-kicker', title));
  scr.append(top, body); root.append(scr);
  return body;
}

export function runLesson(root, lesson, { courseId, mode = 'full' } = {}) {
  return new Promise(resolveLesson => {
    const total = 3 + lesson.practice.length + 2;
    let step = 0, quit = false, firstOk = 0, drills = 0, xp = 0;
    const level = levelOf(courseId);
    const close = () => {
      if (!confirm('수업을 그만할까요? 진행한 내용은 저장되지 않아요(복습 카드와 XP 는 남아요).')) return;
      quit = true; V.stop(); V.abortListen(); resolveLesson({ quit: true });
    };
    const F = (title) => frame(root, { step, total, title, onClose: close });

    async function intro() {
      root.textContent = '';
      const s = el('div', 'screen l-intro');
      s.append(h('button', { class: 'icon-btn close-tl', 'aria-label': '닫기', onclick: () => resolveLesson({ quit: true }) }, icon('close')));
      const face = talkingFace(96);
      s.append(face, el('div', 'kicker', '오늘 배울 것'), el('h1', '', lesson.title), el('p', 'goal', lesson.goal_ko));
      const steps = el('ol', 'steps');
      [['배우기', '핵심 표현 3개'], ['스피킹 연습', lesson.practice.length + '문장 말하기'], ['단어', '짝 맞추기'], ['롤플레이', 'AI 와 미션 대화']].forEach(([a, b]) => steps.append(h('li', null, h('b', null, a), el('span', '', b))));
      s.append(steps);
      const go = h('button', { class: 'btn primary wide big' }, '시작하기');
      const listenBtn = h('button', { class: 'btn ghost wide' }, icon('play', 18), ' 듣기 모드 — 말하지 않고 듣기만');
      s.append(go, listenBtn, el('p', 'fine', '선생님 목소리는 AI 로 만든 목소리예요(Supertonic 3).'));
      root.append(s);
      const pick = await new Promise(r => { go.addEventListener('click', () => { V.unlock(); r('go'); }, { once: true }); listenBtn.addEventListener('click', () => { V.unlock(); r('listen'); }, { once: true }); });
      if (pick === 'listen') { await runListen(root, lesson); quit = true; resolveLesson({ quit: true, listened: true }); }
    }

    async function learn() {
      for (let i = 0; i < lesson.learn.length && !quit; i++) {
        const it = lesson.learn[i];
        const b = F(`배우기 ${i + 1}/${lesson.learn.length}`);
        const t = el('div', 'teacher');
        const bubble = el('div', 'bubble', it.note_ko);
        t.append(talkingFace(64), h('div', null, el('div', 'tname', TEACHER.name), bubble));
        const ph = el('div', 'phrase');
        ph.append(h('div', { class: 'en', lang: 'en' }, it.en), el('div', 'ko', it.ko));
        if (it.pattern) ph.append(h('div', { class: 'pattern-chip', lang: 'en' }, '틀  ' + it.pattern));
        b.append(t, ph);
        const r = speakCard(b, { type: 'repeat', en: it.en, ko: '', alts: [] }, { autoPlay: false, label: '선생님을 따라 말해 보세요' });
        (async () => { if (await V.say(it.note_ko, { lang: 'ko', voice: TEACHER.voice })) await V.say(it.en, { lang: 'en', voice: TEACHER.voice }); })();
        const res = await r;
        addCard(it.en, it.ko, lesson.id);
        if (res.pass) { addXp(2); xp += 2; }
        step++;
      }
    }

    async function practice() {
      const items = lesson.practice;
      for (let i = 0; i < items.length && !quit; i++) {
        const b = F(`스피킹 연습 ${i + 1}/${items.length}`);
        const res = await speakCard(b, items[i], { autoNext: true });
        drills++;
        if (res.firstTry) { firstOk++; addXp(2); xp += 2; } else if (res.pass) { addXp(1); xp += 1; }
        if (!res.firstTry && items[i].type !== 'repeat') addCard(items[i].en, items[i].ko, lesson.id);
        step++;
      }
    }

    async function vocab() {
      if (!lesson.vocab || !lesson.vocab.length) { step++; return; }
      const b = F('단어 짝 맞추기');
      b.append(el('p', 'l-help', '영어와 뜻을 짝지어 눌러 보세요.'));
      const grid = el('div', 'match');
      const L = el('div', 'col'), R = el('div', 'col');
      grid.append(L, R); b.append(grid);
      let pick = null, left = lesson.vocab.length, miss = 0;
      await new Promise(resolve => {
        const sel = (btn, side, idx) => {
          if (btn.classList.contains('gone')) return;
          if (side === 'en') V.say(lesson.vocab[idx].en, { lang: 'en', voice: TEACHER.voice, avatar: false });
          if (!pick || pick.side === side) { if (pick) pick.btn.classList.remove('sel'); pick = { btn, side, idx }; btn.classList.add('sel'); return; }
          if (pick.idx === idx) {
            chime(true); [pick.btn, btn].forEach(x => { x.classList.remove('sel'); x.classList.add('gone'); x.disabled = true; });
            pick = null; left--;
            if (!left) setTimeout(resolve, 500);
          } else {
            chime(false); miss++; [pick.btn, btn].forEach(x => { x.classList.add('shake'); setTimeout(() => x.classList.remove('shake', 'sel'), 450); });
            pick = null;
          }
        };
        shuffle(lesson.vocab.map((v, i) => i)).forEach(i => { const bt = h('button', { class: 'tile', lang: 'en', 'data-i': i }, lesson.vocab[i].en); bt.onclick = () => sel(bt, 'en', i); L.append(bt); });
        shuffle(lesson.vocab.map((v, i) => i)).forEach(i => { const bt = h('button', { class: 'tile ko', 'data-i': i }, lesson.vocab[i].ko); bt.onclick = () => sel(bt, 'ko', i); R.append(bt); });
      });
      const gain = Math.max(2, 6 - miss); addXp(gain); xp += gain;
      lesson.vocab.forEach(v => { if (v.en.split(' ').length > 1) addCard(v.en, v.ko, lesson.id); });
      step++;
    }

    async function roleplay() {
      const rp = lesson.roleplay;
      if (!rp) { step++; return { missionsDone: [], fixes: [], turns: 0 }; }
      const b = F('롤플레이');
      const card = el('div', 'rp-intro');
      card.append(el('h2', '', '실전 대화'), el('p', 'scene-t', rp.scene_ko), el('p', 'scene-r', '내 역할: ' + (rp.user_role_ko || '나')));
      const ml = el('div', 'missions big');
      rp.missions.forEach((m, i) => ml.append(h('div', { class: 'mission' }, h('i', null, String(i + 1)), h('span', null, m.ko))));
      card.append(el('div', 'sub', '미션'), ml, el('p', 'fine', '마이크를 누르고 말하면 상대가 대답해요. 막히면 「가」 버튼으로 한국어로 물어보세요.'));
      const go = h('button', { class: 'btn primary wide big' }, '대화 시작');
      const skip = h('button', { class: 'btn ghost wide' }, '건너뛰기');
      card.append(go, skip); b.append(card);
      const choice = await new Promise(r => { go.onclick = () => { V.unlock(); r('go'); }; skip.onclick = () => r('skip'); });
      if (choice === 'skip') { step++; return { missionsDone: [], fixes: [], turns: 0, skipped: true }; }
      const r = await openTalk(root, { rp, level, kind: 'lesson', title: lesson.title });
      xp += r.xp || 0;
      step++;
      return r;
    }

    function result(rp) {
      const ratio = drills ? firstOk / drills : 0;
      const missionsAll = lesson.roleplay ? lesson.roleplay.missions.length : 0;
      const mDone = (rp.missionsDone || []).length;
      let stars = ratio >= 0.8 ? 3 : ratio >= 0.5 ? 2 : 1;
      if (missionsAll && mDone < missionsAll && stars === 3 && !rp.offline) stars = 2;
      addXp(10); xp += 10;
      const info = lessonFinished(lesson.id, { stars, score: Math.round(ratio * 100) });
      root.textContent = '';
      const s = el('div', 'screen result');
      const st = el('div', 'stars'); for (let i = 0; i < 3; i++) st.append(h('span', { class: i < stars ? 'on' : '' }, icon('star', 34, true)));
      s.append(st, el('h2', '', '수업 완료!'), el('p', 'sub', lesson.title));
      const g = el('div', 'res-grid');
      g.append(h('div', null, h('b', null, '+' + xp), el('span', '', 'XP')), h('div', null, h('b', null, Math.round(ratio * 100) + '%'), el('span', '', '한 번에 맞힘')),
        h('div', null, h('b', null, missionsAll ? mDone + '/' + missionsAll : '-'), el('span', '', '미션')), h('div', { class: 'flame' + (info.grew ? ' grew' : '') }, h('b', null, icon('flame', 20, true), String(info.streak)), el('span', '', '일 연속')));
      s.append(g);
      if (info.revived) s.append(el('p', 'good', '불꽃을 되살렸어요! 연속 기록이 이어집니다.'));
      if (info.usedFreeze) s.append(el('p', 'good', `불꽃 지키기 ${info.usedFreeze}개로 놓친 날을 메웠어요.`));
      if (info.freezeEarned) s.append(el('p', 'good', `7일 연속! 불꽃 지키기 1개를 받았어요(가진 개수 ${info.freezes}).`));
      if (rp.fixes && rp.fixes.length) s.append(el('p', 'fine', `대화에서 고친 문장 ${rp.fixes.length}개를 복습에 넣었어요.`));
      /* 오늘의 핵심 */
      const take = el('div', 'takeaways');
      take.append(el('h3', '', '오늘의 핵심'));
      lesson.learn.forEach(x => take.append(h('div', { class: 'take' }, h('div', null, h('div', { class: 'en', lang: 'en' }, x.en), el('div', 'ko', x.ko), x.pattern ? h('div', { class: 'pattern-chip', lang: 'en' }, '틀  ' + x.pattern) : ''),
        h('button', { class: 'icon-btn', 'aria-label': '듣기', onclick: () => V.say(x.en, { lang: 'en', voice: TEACHER.voice }) }, icon('play')))));
      s.append(take);
      /* 난이도 묻기 → 다음 추천이 바뀐다 */
      const diffBox = el('div', 'diff');
      const rec = el('div', 'rec');
      diffBox.append(el('h3', '', '이번 수업 어땠어요?'));
      const seg = el('div', 'seg center');
      [['easy', '쉬웠어요'], ['ok', '적당했어요'], ['hard', '어려웠어요']].forEach(([k, t]) => seg.append(h('button', { onclick: e => {
        seg.querySelectorAll('button').forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on');
        if (S.done[lesson.id]) { S.done[lesson.id].diff = k; save(); }
        rec.textContent = '';
        if (k === 'hard') rec.append(el('p', '', '약한 문장을 복습하거나 이 수업을 한 번 더 해 보세요. 설정에서 말하기 판정을 「느슨」으로 바꿀 수도 있어요.'),
          h('button', { class: 'btn primary wide', onclick: () => resolveLesson({ done: true, goto: 'review' }) }, '약한 문장 복습하기'));
        else if (k === 'easy') rec.append(el('p', '', '좋아요! 다음 수업으로 바로 가거나, 실력 체크로 이 코스를 건너뛸 수 있는지 확인해 보세요.'),
          h('button', { class: 'btn primary wide', onclick: () => resolveLesson({ done: true, next: true }) }, '다음 수업 바로 시작'));
        else rec.append(el('p', '', '이대로 꾸준히 가요. 내일 복습에서 오늘 문장이 다시 나와요.'));
      } }, t)));
      diffBox.append(seg, rec);
      s.append(diffBox);
      const home = h('button', { class: 'btn primary wide big', onclick: () => resolveLesson({ done: true, stars }) }, '확인');
      const again = h('button', { class: 'btn ghost wide', onclick: () => resolveLesson({ done: true, again: true }) }, '다시 하기');
      s.append(home, again);
      root.append(s);
      chime(true);
    }

    (async () => {
      await intro(); if (quit) return;
      await learn(); if (quit) return;
      await practice(); if (quit) return;
      await vocab(); if (quit) return;
      const rp = await roleplay(); if (quit) return;
      if (rp && rp.goto) { resolveLesson({ quit: true, goto: rp.goto }); return; }
      result(rp || {});
    })().catch(e => { console.error(e); toast('수업 진행 중 문제가 생겼어요: ' + (e && e.message)); resolveLesson({ quit: true }); });
  });
}

/* ---------- 듣기 모드: 말하지 않고 듣기만(운전·지하철). 한 줄마다 한국어 → 영어 → 따라 말할 틈 → 영어 ---------- */
export async function runListen(root, lesson) {
  const lines = [];
  const seen = new Set();
  lesson.learn.concat(lesson.practice).forEach(x => { if (!seen.has(x.en)) { seen.add(x.en); lines.push(x); } });
  root.textContent = '';
  const s = el('div', 'screen listen');
  const top = el('div', 'l-top');
  let stop = false, paused = false, wake = null;
  const close = h('button', { class: 'icon-btn', 'aria-label': '그만 듣기', onclick: () => { stop = true; V.stop(); } }, icon('close'));
  const bar = el('div', 'progress'); const fill = el('i'); bar.append(fill);
  top.append(close, bar);
  const face = talkingFace(110);
  const ko = el('div', 'l-ko'), en = h('div', { class: 'l-en', lang: 'en' }), stage = el('div', 'l-stage');
  const pauseBtn = h('button', { class: 'btn ghost wide', onclick: () => { paused = !paused; pauseBtn.textContent = paused ? '이어 듣기' : '잠깐 멈춤'; if (paused) V.stop(); } }, '잠깐 멈춤');
  s.append(top, el('div', 'l-kicker', '듣기 모드 · ' + lesson.title), face, ko, en, stage, pauseBtn, el('p', 'fine', '화면이 켜진 채로 이어 들어요. 영어가 나온 뒤 틈에 따라 말해 보세요.'));
  root.append(s);
  try { if ('wakeLock' in navigator) wake = await navigator.wakeLock.request('screen'); } catch (e) { wake = null; }
  const wait = async ms => { const t0 = Date.now(); while (!stop && (Date.now() - t0 < ms || paused)) await new Promise(r => setTimeout(r, 100)); };
  for (let i = 0; i < lines.length && !stop; i++) {
    const x = lines[i];
    fill.style.width = Math.round((i / lines.length) * 100) + '%';
    ko.textContent = x.ko; en.textContent = ''; stage.textContent = '뜻';
    await wait(0); if (stop) break;
    await V.say(x.ko, { lang: 'ko', voice: TEACHER.voice }); await wait(500); if (stop) break;
    en.textContent = x.en; stage.textContent = '듣기';
    await V.say(x.en, { lang: 'en', voice: TEACHER.voice }); if (stop) break;
    stage.textContent = '따라 말해 보세요';
    await wait(900 + x.en.split(/\s+/).length * 420); if (stop) break;
    stage.textContent = '한 번 더';
    await V.say(x.en, { lang: 'en', voice: TEACHER.voice }); await wait(700);
    s.dataset.done = String(i + 1);
  }
  try { if (wake) await wake.release(); } catch (e) { /* ignore */ }
  V.stop();
  if (!stop) { fill.style.width = '100%'; addXp(5); toast('듣기 모드를 끝까지 들었어요 (+5 XP)'); }
}

/* ---------- 코스 실력 체크: 코스 전체에서 12문장, 힌트 없이 한국어 보고 말하기. 75% 이상이면 통과 ---------- */
export function runCheck(root, course) {
  return new Promise(resolve => {
    const pool = [];
    course.units.forEach(u => u.lessons.forEach(l => l.practice.filter(p => p.type !== 'repeat').forEach(p => pool.push(p))));
    const items = shuffle(pool).slice(0, 12).map(p => ({ ...p, type: 'translate' }));
    let ok = 0, quit = false, i = 0;
    const close = () => { if (confirm('실력 체크를 그만할까요?')) { quit = true; V.stop(); V.abortListen(); resolve({ quit: true }); } };
    (async () => {
      for (; i < items.length && !quit; i++) {
        const b = frame(root, { step: i, total: items.length, title: `실력 체크 ${i + 1}/${items.length}`, onClose: close });
        const r = await speakCard(b, items[i], { noHint: true, maxTries: 2, autoNext: true });
        if (r.pass && r.tries <= 2 && !r.skipped) ok++;
      }
      if (quit) return;
      const score = Math.round((ok / items.length) * 100), pass = score >= 75;
      S.checks[course.id] = { at: Date.now(), score, pass: pass || !!(S.checks[course.id] && S.checks[course.id].pass) };
      addXp(pass ? 30 : 10);
      lessonFinished(null, {});
      save();
      root.textContent = '';
      const s = el('div', 'screen result');
      s.append(el('h2', '', pass ? course.title + ' 통과!' : '조금만 더!'), el('p', 'big-num', score + '점'),
        el('p', 'sub', pass ? '이 코스의 표현을 힌트 없이 말할 수 있어요. 다음 코스로 넘어가 보세요.' : '75점이 넘으면 통과예요. 복습으로 약한 문장을 다진 뒤 다시 도전해 보세요.'),
        h('button', { class: 'btn primary wide big', onclick: () => resolve({ done: true, pass }) }, '확인'));
      root.append(s);
      chime(pass);
    })();
  });
}
