/* 말문 — AI 와 말로 하는 대화: 수업 롤플레이(미션 3개)·프리토킹·내가 만든 상황 */
import { S, save, h, el, icon, toast, chime, addXp, addCard, sheet, cardId, usageTotal, fmtUsd } from './core.js';
import * as V from './voice.js';
import { callJSON, turnPrompt, TURN_SCHEMA, replyStreamer, errText, hasKey, REPORT_SCHEMA, reportPrompt } from './ai.js';
import { charBadge, speakCard, cover } from './drill.js';

/* 대화 리포트 내용(요약·잘한 점·다음에 연습할 것·건져 갈 표현) — 대화 끝 화면과 지난 대화 시트에서 같이 쓴다 */
export function reportView(rep) {
  const b = el('div', 'report-body');
  if (rep.summary) b.append(el('p', 'rp-sum', rep.summary));
  const row = (label, text) => (text ? h('div', { class: 'rp-row' }, el('small', '', label), el('p', '', text)) : '');
  b.append(row('잘한 점', rep.praise), row('다음엔 이것만', rep.focus));
  if (rep.expressions && rep.expressions.length) {
    b.append(el('small', 'rp-l', '건져 갈 표현'));
    rep.expressions.forEach(x => {
      const saved = !!S.cards[cardId(x.en)];
      b.append(h('div', { class: 'hint-row' }, h('div', null, h('div', { class: 'en', lang: 'en' }, x.en), el('div', 'ko', x.ko || '')),
        h('button', { class: 'icon-btn', 'aria-label': '듣기', onclick: () => V.say(x.en, { lang: 'en', voice: 'F2' }) }, icon('play')),
        h('button', { class: 'icon-btn', 'aria-label': '복습에 넣기', disabled: saved, onclick: e => { addCard(x.en, x.ko || '대화에서 건진 표현', 'saved'); e.currentTarget.disabled = true; toast('복습에 넣었어요'); } }, icon('plus'))));
    });
  }
  return b;
}

/* rp: { ai_name, ai_voice, ai_role, scene_ko, user_role_ko, opener, opener_ko, missions[], useful[], title_ko }
   반환 Promise<{ missionsDone, fixes, turns, ended }> */
export function openTalk(root, { rp, level, kind = 'lesson', title }) {
  return new Promise(resolveTalk => {
    const voice = rp.ai_voice || 'F3';
    const missions = rp.missions || [];
    const log = [];
    /* 유나와는 통화 화면(사진이 화면 가득, 자막처럼 뜨는 대화, 기본이 자동 듣기) */
    const call = !!rp.photo;
    let doneM = [], busy = false, ctl = null, listening = null, finished = false, lastHints = [], handsFree = call ? S.callAuto !== false : !!S.handsFree, ended = false, xpGot = 0, talkRec = null;

    root.textContent = '';
    const scr = el('div', 'screen talk' + (call ? ' call' : ''));
    if (call) scr.append(cover('call-bg'));
    let wake = null;   // 통화 중에는 화면이 꺼지지 않게
    if (call && 'wakeLock' in navigator) navigator.wakeLock.request('screen').then(w => { if (ended) w.release().catch(() => {}); else wake = w; }).catch(() => {});
    const head = el('header', 'talk-head');
    const back = h('button', { class: 'icon-btn', 'aria-label': '나가기', onclick: () => endTalk(true) }, icon('back'));
    const who = el('div', 'who');
    /* 이 대화에 쓴 API 금액(추정)을 제목 옆에 작게 — 답이 올 때마다 갱신 */
    const usd0 = usageTotal(), subTitle = title || rp.title_ko || '';
    const spent = () => usageTotal() - usd0;
    const whoSub = el('small', '', subTitle);
    const onUse = () => { if (!whoSub.isConnected) { window.removeEventListener('malmun:usage', onUse); return; } whoSub.textContent = subTitle + (spent() > 0 && !rp.photo ? ' · API ' + fmtUsd(spent()) : ''); };   // 통화 화면은 제목만(금액은 끝난 뒤 요약에)
    window.addEventListener('malmun:usage', onUse);
    who.append(charBadge(rp.ai_name, voice, 38, !!rp.photo), h('div', null, h('b', null, rp.ai_name), whoSub));
    const hf = h('button', { class: 'chip-btn', 'aria-pressed': String(handsFree), title: '내 차례가 되면 자동으로 듣기', onclick: () => { handsFree = !handsFree; if (call) S.callAuto = handsFree; else S.handsFree = handsFree; save(); hf.setAttribute('aria-pressed', String(handsFree)); toast(handsFree ? '자동 듣기 켬 — 답을 다 들으면 바로 마이크가 켜져요' : '자동 듣기 끔'); } }, '자동 듣기');
    const endBtn = h('button', { class: 'chip-btn', onclick: () => endTalk(false) }, '끝내기');
    head.append(back, who, h('div', { class: 'head-r' }, hf, endBtn));
    const mBox = el('div', 'missions');
    const renderMissions = () => {
      mBox.textContent = '';
      missions.forEach((m, i) => mBox.append(h('div', { class: 'mission' + (doneM.includes(i) ? ' done' : '') }, h('i', null, doneM.includes(i) ? icon('check', 14) : String(i + 1)), h('span', null, m.ko))));
      mBox.hidden = !missions.length;
    };
    const list = el('div', 'msgs');
    const scene = el('div', 'scene');
    scene.append(el('div', 'scene-t', rp.scene_ko || ''), rp.user_role_ko ? el('div', 'scene-r', '내 역할: ' + rp.user_role_ko) : '');
    list.append(scene);
    const live = el('div', 'live'); live.hidden = true;
    const bar = el('div', 'talk-bar');
    const hintBtn = h('button', { class: 'icon-btn', 'aria-label': '힌트', title: '힌트', onclick: showHints }, icon('bulb'));
    const koBtn = h('button', { class: 'icon-btn ko-btn', 'aria-label': '한국어로 묻기', title: '한국어로 묻기(한 마디)', onclick: () => startListen('ko-KR') }, '가');
    const mic = h('button', { class: 'mic', 'aria-label': '말하기', onclick: () => (listening ? listening.stop() : startListen('en-US')) }, icon('mic', 30));
    const kb = h('button', { class: 'icon-btn', 'aria-label': '키보드', title: '키보드로 입력', onclick: () => { form.hidden = !form.hidden; if (!form.hidden) inp.focus(); } }, icon('keyboard'));
    const form = h('form', { class: 'type-box', hidden: true, onsubmit: e => { e.preventDefault(); const v = inp.value.trim(); if (v) { inp.value = ''; send(v); } } });
    const inp = h('input', { type: 'text', placeholder: '영어로(막히면 한국어로) 입력', autocomplete: 'off' });
    form.append(inp, h('button', { class: 'icon-btn', type: 'submit', 'aria-label': '보내기' }, icon('send')));
    bar.append(hintBtn, koBtn, mic, kb);
    scr.append(head, mBox, list, live, form, bar);
    root.append(scr);
    renderMissions();

    const scroll = () => { list.scrollTop = list.scrollHeight; };
    function themNode(m) {
      const b = el('div', 'msg them');
      const t = el('div', 't', m.text); t.lang = /[가-힯]/.test(m.text) ? 'ko' : 'en';
      b.append(t);
      if (m.ko && S.showKo) b.append(el('div', 'ko', m.ko));
      const tools = el('div', 'tools');
      tools.append(h('button', { class: 'mini', onclick: () => V.say(m.text, { lang: t.lang, voice }) }, icon('play', 14), '다시'),
        h('button', { class: 'mini', onclick: () => V.say(m.text, { lang: t.lang, voice, slow: true }) }, icon('slow', 14), '천천히'));
      if (t.lang === 'en') tools.append(saveBtn(m.text, m.ko));
      if (m.ko && !S.showKo) tools.append(h('button', { class: 'mini', onclick: e => { e.currentTarget.replaceWith(el('div', 'ko', m.ko)); } }, '뜻'));
      b.append(tools);
      return b;
    }
    function saveBtn(en, ko) {
      const saved = !!S.cards[cardId(en)];
      return h('button', { class: 'mini', disabled: saved, onclick: e => { addCard(en, ko || '대화에서 저장한 문장', 'saved'); e.currentTarget.disabled = true; e.currentTarget.lastChild.textContent = '저장됨'; } }, icon('plus', 14), saved ? '저장됨' : '저장');
    }
    function meNode(m) {
      const b = el('div', 'msg me');
      const t = el('div', 't', m.text); if (!/[가-힯]/.test(m.text)) t.lang = 'en'; b.append(t);
      if (m.fix && m.fix.better && S.feedbackAt === 'end') b.append(el('div', 'fix-later', '고칠 점은 대화 끝에 보여 드려요'));
      else if (m.fix && m.fix.better) {
        const f = el('div', 'fix');
        f.append(el('div', 'fix-l', '이렇게 말해 보세요'), h('div', { class: 'fix-b', lang: 'en' }, m.fix.better), m.fix.why ? el('div', 'fix-w', m.fix.why) : '',
          h('button', { class: 'mini', onclick: () => V.say(m.fix.better, { lang: 'en', voice: 'F2' }) }, icon('play', 14), '듣기'));
        b.append(f);
      }
      return b;
    }
    function renderLog() {
      list.querySelectorAll('.msg').forEach(n => n.remove());
      log.forEach(m => list.append(m.who === 'me' ? meNode(m) : themNode(m)));
      scroll();
    }

    async function startListen(lang) {
      if (finished || busy) return;
      V.unlock(); V.stop();
      if (listening) listening.abort();
      if (!V.micAvailable()) { toast(V.MIC_ERR['no-sr'], 4000); form.hidden = false; return; }
      mic.dataset.state = 'on'; mic.textContent = ''; mic.append(icon('stop', 30));
      const manual = S.turnMode === 'manual';
      live.hidden = false; live.textContent = (lang === 'ko-KR' ? '한국어로 듣고 있어요 — 모르는 표현을 물어보세요' : '듣고 있어요 — 영어로 말해 보세요') + (manual ? ' · 다 말했으면 버튼을 한 번 더' : '');
      live.classList.toggle('ko', lang === 'ko-KR');
      listening = V.listen({ lang, manual, onInterim: t => { live.textContent = t; } });
      try {
        const { text, aborted } = await listening.promise;
        if (aborted) return;
        if (!text) { live.textContent = '잘 못 들었어요. 다시 눌러 말해 보세요.'; setTimeout(() => { if (!listening) live.hidden = true; }, 2200); return; }
        live.hidden = true;
        send(text);
      } catch (e) { live.hidden = false; live.textContent = V.MIC_ERR[e.code] || V.MIC_ERR.start; if (e.code === 'no-sr' || e.code === 'mic-blocked') form.hidden = false; }
      finally { listening = null; mic.dataset.state = 'idle'; mic.textContent = ''; mic.append(icon('mic', 30)); }
    }

    async function send(text) {
      if (busy || finished) return;
      if (!hasKey()) { noKey(); return; }
      V.stop();
      log.push({ who: 'me', text });
      renderLog();
      busy = true; bar.classList.add('busy');
      const pend = h('div', { class: 'msg them pending', 'aria-label': '답하는 중' }, h('div', { class: 't' }, h('i', { class: 'typing' }, el('b'), el('b'), el('b')))); list.append(pend); scroll();
      ctl = new AbortController();
      let q = null;
      const feed = replyStreamer((chunk, partial) => {
        if (partial) { const t = pend.querySelector('.t'); t.textContent = partial; t.lang = /[가-힣]/.test(partial) ? 'ko' : 'en'; pend.classList.remove('pending'); }
        if (chunk) { if (!q) q = V.queue(voice, afterSpeak); q.push(chunk); }
        scroll();
      });
      try {
        const r = await callJSON(turnPrompt(rp, log, doneM, level), TURN_SCHEMA, { signal: ctl.signal, onText: feed });
        if (!r || typeof r.reply !== 'string') throw { code: 'invalid_json' };
        const me = log[log.length - 1];
        if (r.correction && r.correction.better && norm(r.correction.better) !== norm(text)) {
          me.fix = { better: r.correction.better.trim(), ko: (r.correction.ko || '').trim(), why: (r.correction.why_ko || '').trim() };
          S.mistakes.push({ at: Date.now(), said: text, better: me.fix.better, why: me.fix.why, src: rp.title_ko || title || '' });
          if (S.mistakes.length > 60) S.mistakes.splice(0, S.mistakes.length - 60);
          addCard(me.fix.better, me.fix.ko || me.fix.why || '대화에서 고친 문장', 'fix');
        }
        log.push({ who: 'them', text: r.reply.trim(), ko: (r.ko || '').trim() });
        lastHints = Array.isArray(r.hints) ? r.hints.filter(x => x && x.en) : [];
        const newly = (r.missions_done || []).filter(i => Number.isInteger(i) && i >= 0 && i < missions.length && !doneM.includes(i));
        if (newly.length) { doneM = doneM.concat(newly).sort(); chime(true); addXp(5 * newly.length); xpGot += 5 * newly.length; toast('미션 달성! ' + newly.map(i => missions[i].ko).join(', ')); }
        renderMissions();
        pend.remove(); renderLog();
        if (r.finished && (!missions.length || doneM.length === missions.length)) finished = true;
        if (q) q.end(); else { await V.say(r.reply, { lang: /[가-힯]/.test(r.reply) ? 'ko' : 'en', voice }); afterSpeak(); }
      } catch (e) {
        pend.remove();
        if (q) q.cancel();
        if (e && e.code !== 'cancelled') { const n = el('div', 'msg sys', errText(e)); list.append(n); scroll(); }
        if (e && (e.code === 'nokey' || e.code === 'bad_key')) noKey();
      } finally { busy = false; ctl = null; bar.classList.remove('busy'); save(); }
    }
    function afterSpeak() {
      if (finished) { setTimeout(() => endTalk(false), 600); return; }
      if (handsFree && !listening && !busy && document.visibilityState === 'visible') setTimeout(() => { if (!listening && !busy && !finished) startListen('en-US'); }, 350);
    }
    const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

    function showHints() {
      const body = el('div', 'hint-sheet');
      const row = (x) => h('div', { class: 'hint-row' }, h('div', null, h('div', { class: 'en', lang: 'en' }, x.en), el('div', 'ko', x.ko || '')),
        h('button', { class: 'icon-btn', 'aria-label': '듣기', onclick: () => V.say(x.en, { lang: 'en', voice: 'F2' }) }, icon('play')), saveBtn(x.en, x.ko));
      if (lastHints.length) { body.append(el('div', 'sub', '이렇게 말해 볼 수 있어요')); lastHints.forEach(x => body.append(row(x))); }
      if (rp.useful && rp.useful.length) { body.append(el('div', 'sub', '이 대화에 쓸 표현')); rp.useful.forEach(x => body.append(row(x))); }
      body.append(el('p', 'note', '막히면 「가」 버튼을 누르고 한국어로 물어보세요. 예: "계산서 달라고 어떻게 말해요?"'));
      sheet('힌트', body);
    }
    function noKey() {
      const body = el('div', 'nokey');
      body.append(el('p', '', 'AI 와 대화하려면 Claude API 키가 필요해요(내 정보 → 설정). 키가 없으면 이 대화에 쓸 표현을 말해 보는 연습으로 대신할 수 있어요.'));
      const s = sheet('AI 대화 준비', body);
      body.append(h('div', { class: 'fb-btns' },
        h('button', { class: 'btn ghost', onclick: () => { s.close(); offlinePractice(); } }, '표현 말하기로 대신'),
        h('button', { class: 'btn primary', onclick: () => { s.close(); ended = true; V.stop(); if (listening) listening.abort(); resolveTalk({ missionsDone: [], fixes: [], turns: 0, ended: false, goto: 'me', xp: xpGot }); } }, '키 넣으러 가기')));
    }
    async function offlinePractice() {
      const items = (rp.useful || []).map(u => ({ type: 'translate', en: u.en, ko: u.ko, alts: [] }));
      root.textContent = '';
      const wrap = el('div', 'screen solo'); root.append(wrap);
      for (const it of items) { wrap.textContent = ''; wrap.append(el('h2', '', rp.title_ko || '표현 연습')); const r = await speakCard(wrap, it, { voice }); if (r.pass) { addXp(2); xpGot += 2; } }
      finished = true; ended = true;
      resolveTalk({ missionsDone: [], fixes: [], turns: 0, ended: true, offline: true, xp: xpGot });
    }

    function endTalk(leave, silent) {
      if (ended) return;
      if (busy && ctl) ctl.abort();
      if (listening) listening.abort();
      V.stop();
      const turns = log.filter(m => m.who === 'me').length;
      const fixes = log.filter(m => m.who === 'me' && m.fix).map(m => ({ said: m.text, ...m.fix }));
      if (leave && !silent && turns && !confirm('대화를 끝낼까요? 지금까지 한 내용은 저장돼요.')) return;
      ended = true;
      if (wake) { wake.release().catch(() => {}); wake = null; }
      if (turns) { talkRec = { at: Date.now(), kind, title: rp.title_ko || title || rp.ai_name, turns, fixes: fixes.length, missions: doneM.length + '/' + missions.length, usd: +spent().toFixed(5) }; S.talks.unshift(talkRec); S.talks = S.talks.slice(0, 40); save(); }
      if (silent || (leave && !turns)) { resolveTalk({ missionsDone: doneM, fixes, turns, ended: false, xp: xpGot }); return; }
      summary(turns, fixes);
    }
    function summary(turns, fixes) {
      root.textContent = '';
      const s = el('div', 'screen result');
      s.append(el('h2', '', missions.length ? (doneM.length === missions.length ? '미션 완료!' : '대화를 마쳤어요') : '대화를 마쳤어요'));
      if (missions.length) {
        const ml = el('div', 'missions big');
        missions.forEach((m, i) => ml.append(h('div', { class: 'mission' + (doneM.includes(i) ? ' done' : '') }, h('i', null, doneM.includes(i) ? icon('check', 14) : String(i + 1)), h('span', null, m.ko))));
        s.append(ml);
      }
      s.append(el('p', 'stat', `내가 한 말 ${turns}번 · 고친 문장 ${fixes.length}개` + (xpGot ? ` · +${xpGot} XP` : '') + (spent() > 0 ? ` · API ${fmtUsd(spent())}` : '')));
      if (fixes.length) {
        s.append(el('h3', '', '이렇게 말해 보세요 (복습에 넣었어요)'));
        fixes.forEach(f => s.append(h('div', { class: 'fix-card' }, h('div', { class: 'said' }, f.said), h('div', { class: 'better', lang: 'en' }, f.better), f.why ? el('div', 'why', f.why) : '',
          h('button', { class: 'mini', onclick: () => V.say(f.better, { lang: 'en', voice: 'F2' }) }, icon('play', 14), '듣기'))));
      } else if (turns) s.append(el('p', 'good', '고칠 문장이 없었어요. 잘했어요!'));
      /* 프리토킹·내 롤플레이는 상대가 대화를 돌아보는 리포트를 쓴다(수업 롤플레이는 수업 결과가 대신함) */
      if (kind !== 'lesson' && turns >= 2 && hasKey() && S.report !== false) {
        const box = h('div', { class: 'report' }, h('div', { class: 'rp-head' }, charBadge(rp.ai_name, voice, 34, call), h('b', null, call ? '유나의 리포트' : rp.ai_name + '의 리포트')),
          h('div', { class: 'rp-wait' }, h('i', { class: 'typing' }, el('b'), el('b'), el('b')), el('span', '', '대화를 돌아보는 중')));
        s.append(box);
        makeReport(box);
      }
      s.append(h('button', { class: 'btn primary wide', onclick: () => resolveTalk({ missionsDone: doneM, fixes, turns, ended: true, xp: xpGot }) }, '계속'));
      root.append(s);
    }
    async function makeReport(box) {
      const str = v => (typeof v === 'string' ? v.trim() : '');
      try {
        const r = await callJSON(reportPrompt(rp, log, S.profile), REPORT_SCHEMA, { effort: 'low' });
        const rep = { summary: str(r.summary_ko), praise: str(r.praise_ko), focus: str(r.focus_ko),
          expressions: (Array.isArray(r.expressions) ? r.expressions : []).filter(x => x && str(x.en)).slice(0, 3).map(x => ({ en: str(x.en), ko: str(x.ko) })) };
        const p = r.profile || {}, old = S.profile || {};
        const list = (a, n) => (Array.isArray(a) ? a : []).map(str).filter(Boolean).slice(0, n);
        S.profile = { level_ko: str(p.level_ko) || old.level_ko || '', weak: list(p.weak, 4), interests: list(p.interests, 5), note_ko: str(p.note_ko) || old.note_ko || '', at: Date.now() };
        if (talkRec) { talkRec.report = rep; talkRec.usd = +spent().toFixed(5); }
        save();
        if (box.isConnected) box.querySelector('.rp-wait').replaceWith(reportView(rep));
      } catch (e) {
        if (box.isConnected) box.querySelector('.rp-wait').replaceWith(el('p', 'note', '리포트를 만들지 못했어요. ' + errText(e)));
      }
    }

    /* 첫마디 */
    log.push({ who: 'them', text: rp.opener, ko: rp.opener_ko || '' });
    renderLog();
    V.say(rp.opener, { lang: 'en', voice }).then(() => afterSpeak());
    if (!hasKey()) setTimeout(noKey, 600);
  });
}
