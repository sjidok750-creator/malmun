/* 말문 — 말하기 카드(따라 말하기·한국어 보고 말하기·틀에 넣어 말하기)와 선생님 그림 */
import { h, el, icon, chime, toast, S, sheet, addCard } from './core.js';
import { best, align } from './match.js';
import * as V from './voice.js';
import { callJSON, qaPrompt, QA_SCHEMA, errText, hasKey } from './ai.js';

/* 수업 카드에서 '?' → 지금 이 문장을 튜터에게 묻기(카드 내용을 맥락으로 넣음) */
export function askTutor(item) {
  const ctx = `지금 연습 중인 문장: "${item.en}" (뜻: ${item.ko || ''})` + (item.pattern ? ` / 틀: ${item.pattern}` : '');
  const body = el('div', 'ask');
  body.append(el('p', 'note', ctx));
  const ta = h('textarea', { rows: 2 }); ta.value = '이 문장을 언제 쓰는지, 비슷한 다른 표현도 알려 주세요.';
  const go = h('button', { class: 'btn primary wide' }, '묻기');
  const out = el('div', 'ask-out');
  body.append(ta, go, out);
  sheet('튜터에게 묻기', body);
  go.onclick = async () => {
    if (!hasKey()) { out.textContent = '내 정보 → 설정에서 Claude API 키를 넣으면 물어볼 수 있어요.'; return; }
    go.disabled = true; out.textContent = '생각하는 중…';
    try {
      const r = await callJSON(qaPrompt(ctx + '\n질문: ' + ta.value.trim(), []), QA_SCHEMA, { effort: 'low' });
      out.textContent = '';
      out.append(el('p', 'ans', r.answer_ko));
      (r.examples || []).forEach(x => out.append(h('div', { class: 'hint-row' }, h('div', null, h('div', { class: 'en', lang: 'en' }, x.en), el('div', 'ko', x.ko)),
        h('button', { class: 'icon-btn', 'aria-label': '듣기', onclick: () => V.say(x.en, { lang: 'en', voice: TEACHER.voice }) }, icon('play')),
        h('button', { class: 'icon-btn', 'aria-label': '복습에 넣기', onclick: e => { addCard(x.en, x.ko, 'saved'); e.currentTarget.disabled = true; toast('복습에 넣었어요'); } }, icon('plus')))));
    } catch (e) { out.textContent = errText(e); }
    finally { go.disabled = false; }
  };
}

export const TEACHER = { name: '소라 쌤', voice: 'F2' };

/* ---------- 선생님(새로 그린 그림, 말할 때 입이 움직임) ---------- */
export function teacherFace(size = 64) {
  const NS = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 100 100'); s.setAttribute('width', size); s.setAttribute('height', size); s.classList.add('face');
  s.innerHTML = `
    <circle cx="50" cy="50" r="50" fill="#FFE3D3"/>
    <path d="M18 58c0-26 13-40 32-40s32 14 32 40c0 10-3 22-7 30H25c-4-8-7-20-7-30z" fill="#2B2A33"/>
    <ellipse cx="50" cy="55" rx="23" ry="26" fill="#F9CDB3"/>
    <path d="M27 50c2-15 11-24 24-24 12 0 20 7 23 20-9-2-18-8-23-15-5 9-14 16-24 19z" fill="#2B2A33"/>
    <ellipse cx="41" cy="56" rx="2.6" ry="3.2" fill="#2B2A33"/><ellipse cx="59" cy="56" rx="2.6" ry="3.2" fill="#2B2A33"/>
    <ellipse cx="35" cy="64" rx="4" ry="2.4" fill="#FF9F86" opacity=".55"/><ellipse cx="65" cy="64" rx="4" ry="2.4" fill="#FF9F86" opacity=".55"/>
    <path class="mouth" d="M44 68q6 5 12 0" fill="none" stroke="#B4413A" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M22 96c4-10 15-15 28-15s24 5 28 15" fill="#FF5A36"/>`;
  return s;
}
let talkFaces = new Set(), talkT = 0;
V.onTalk(on => {
  clearInterval(talkT);
  const set = open => talkFaces.forEach(f => { if (!f.isConnected) { talkFaces.delete(f); return; } const m = f.querySelector('.mouth'); if (m) m.setAttribute('d', open ? 'M44 67q6 8 12 0q-6 3-12 0z' : 'M44 68q6 5 12 0'); });
  if (on) { let o = false; talkT = setInterval(() => { o = !o; set(o); }, 140); } else set(false);
});
export function talkingFace(size) { const f = teacherFace(size); talkFaces.add(f); return f; }

/* 원 안 머리글자로 그린 상대 캐릭터 */
const PAL = ['#0E7C7B', '#6D5BD0', '#D9480F', '#1C7ED6', '#C2255C', '#2F9E44', '#E67700', '#5C7CFA', '#0B7285', '#862E9C'];
export function charBadge(name, voice, size = 44) {
  const i = Math.abs(Array.from(name || '?').reduce((a, c) => a * 31 + c.charCodeAt(0), 3)) % PAL.length;
  const b = el('div', 'badge', (name || '?').slice(0, 1).toUpperCase());
  b.style.background = PAL[i]; b.style.width = b.style.height = size + 'px'; b.style.fontSize = Math.round(size * 0.44) + 'px';
  talkFaces.add(b);
  void voice; return b;
}

/* 낱말 줄(초록 = 들림, 주황 = 비슷함, 회색 = 아직, 빨강 = 안 들림) */
export function wordLine(target, result, { hidden = false, revealed = null, onReveal = null } = {}) {
  const line = el('div', 'words');
  line.lang = 'en';
  const toks = result ? result.tokens : String(target).split(/\s+/).filter(Boolean).map(raw => ({ raw, state: 'wait' }));
  toks.forEach((t, i) => {
    const rev = revealed && revealed.has(i);
    const show = !hidden || rev || t.state === 'ok' || t.state === 'near';   // 숨긴 정답도 맞힌 낱말·누른 낱말은 보여 준다
    const w = el('span', 'w ' + (t.state || 'wait') + (show ? '' : ' hid') + (rev && t.state !== 'ok' ? ' rev' : ''), show ? t.raw : '•'.repeat(Math.min(6, Math.max(2, t.raw.replace(/[^A-Za-z]/g, '').length))));
    if (!show && onReveal) { w.setAttribute('role', 'button'); w.title = '눌러서 이 낱말 보기(힌트)'; w.addEventListener('click', () => onReveal(i)); }
    line.append(w, document.createTextNode(' '));
  });
  return line;
}

/* ---------- 말하기 카드 ----------
   item: { type:'repeat'|'translate'|'pattern', en, ko, pattern?, cue_ko?, alts? }
   opts: { voice, label, autoPlay, noHint, maxTries }
   반환 Promise<{ pass, firstTry, tries, skipped, heard, score }> — '계속' 을 누르면 끝난다. */
export function speakCard(host, item, opts = {}) {
  const voice = opts.voice || TEACHER.voice;
  const type = item.type || 'repeat';
  const targets = [item.en, ...(item.alts || [])];
  const maxTries = opts.maxTries || 3;
  let tries = 0, firstTry = null, result = null, listening = null, hintN = 0, typed = false, finished = false, lastHeard = '', hintUsed = false;
  const revealed = new Set();
  const manual = S.turnMode === 'manual';
  let resolveCard;
  const done = new Promise(r => { resolveCard = r; });

  const card = el('div', 'speak-card t-' + type);
  card.dataset.en = item.en;   // 자동 시험용(화면에는 안 보임)
  const label = el('div', 'sc-label', opts.label || (type === 'repeat' ? '들은 대로 따라 말해 보세요' : type === 'pattern' ? '틀에 넣어 영어로 말해 보세요' : type === 'fix' ? '더 자연스럽게 고쳐 말해 보세요' : '영어로 말해 보세요'));
  const prompt = el('div', 'sc-prompt');
  const lineBox = el('div', 'sc-line');
  const heardBox = el('div', 'sc-heard');
  const fb = el('div', 'sc-fb');
  const ctr = el('div', 'sc-ctr');
  card.append(label, prompt, lineBox, heardBox, fb, ctr);
  host.append(card);

  const showTarget = () => type === 'repeat' || finished || tries >= maxTries || (result && result.pass);
  function renderPrompt() {
    prompt.textContent = '';
    if (type === 'repeat') { if (S.showKo) prompt.append(el('div', 'ko', item.ko)); }
    else if (type === 'pattern') {
      prompt.append(h('div', { class: 'pattern', lang: 'en' }, ...String(item.pattern || '').split('___').flatMap((p, i, a) => i < a.length - 1 ? [p, h('span', { class: 'blank' }, item.cue_ko || '…')] : [p])));
      prompt.append(el('div', 'ko small', item.ko));
    } else if (type === 'fix') {
      prompt.append(h('div', { class: 'said', lang: 'en' }, item.said || ''), item.ko ? el('div', 'ko small', item.ko) : '', item.why ? el('div', 'why', item.why) : '');
    } else prompt.append(el('div', 'ko big', item.ko));
  }
  function renderLine(live) {
    lineBox.textContent = '';
    const vis = showTarget();
    const res = live || result;
    const target = res && res.target ? res.target : item.en;
    lineBox.append(wordLine(target, res, { hidden: !vis, revealed, onReveal: vis || listening ? null : i => { revealed.add(i); hintUsed = true; renderLine(); } }));   // 정답을 숨긴 문제는 맞힌 낱말·누른 낱말만 드러난다
    if (!vis && hintN) lineBox.append(el('div', 'hint-line', '힌트: ' + item.en.split(/\s+/).slice(0, hintN).join(' ') + ' …'));
  }
  const btn = (name, lab, fn, cls = 'icon-btn') => { const b = h('button', { class: cls, 'aria-label': lab, title: lab, onclick: fn }, icon(name)); return b; };
  const playBtn = btn('play', '듣기', () => play(false));
  const slowBtn = btn('slow', '천천히 듣기', () => play(true));
  const mic = h('button', { class: 'mic', 'aria-label': '말하기' }, icon('mic', 30));
  const kbBtn = btn('keyboard', '키보드로 입력', () => toggleType());
  const hintBtn = btn('bulb', '힌트', () => { hintN = Math.min(item.en.split(/\s+/).length, hintN + 2); hintUsed = true; renderLine(); });
  const skipBtn = btn('skip', '건너뛰기', () => finish(true));
  const askBtn = opts.noAsk ? null : h('button', { class: 'ask-btn', 'aria-label': '이 문장 튜터에게 묻기', title: '이 문장 튜터에게 묻기', onclick: () => askTutor(item) }, '?');
  if (askBtn) card.append(askBtn);
  const typeBox = h('form', { class: 'type-box', hidden: true, onsubmit: e => { e.preventDefault(); const v = inp.value.trim(); if (v) { inp.value = ''; evaluate(v); } } });
  const inp = h('input', { type: 'text', placeholder: '영어로 입력', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', lang: 'en' });
  typeBox.append(inp, h('button', { class: 'icon-btn', type: 'submit', 'aria-label': '확인' }, icon('send')));
  const left = el('div', 'side'), right = el('div', 'side');
  left.append(playBtn, slowBtn);
  right.append(...(type !== 'repeat' && !opts.noHint ? [hintBtn] : []), kbBtn, skipBtn);
  ctr.append(left, mic, right);
  card.append(typeBox);

  async function play(slow) {
    if (listening) return;
    if (type !== 'repeat' && !showTarget()) { toast('먼저 말해 본 뒤에 정답을 들을 수 있어요.'); return; }
    await V.say(item.en, { lang: 'en', voice, slow });
  }
  function toggleType() { typed = !typed; typeBox.hidden = !typed; if (typed) inp.focus(); }
  function setMic(state) { mic.dataset.state = state; mic.textContent = ''; mic.append(icon(state === 'on' ? 'stop' : 'mic', 30)); }

  mic.addEventListener('click', () => {
    if (finished) return;
    V.unlock();
    if (listening) { listening.stop(); return; }
    if (!V.micAvailable()) { toast(V.MIC_ERR['no-sr'], 4000); toggleType(); return; }
    V.stop();
    setMic('on'); heardBox.textContent = manual ? '다 말했으면 버튼을 한 번 더 누르세요' : ''; fb.textContent = ''; result = null; renderLine();
    listening = V.listen({ lang: 'en-US', manual, onInterim: t => {
      heardBox.textContent = t;
      renderLine(align(item.en, t, S.strict));
    } });
    listening.promise.then(({ text, aborted }) => {
      listening = null; setMic('idle');
      if (aborted) return;
      if (!text) { heardBox.textContent = ''; fb.textContent = '잘 못 들었어요. 마이크 버튼을 누르고 또박또박 말해 보세요.'; fb.className = 'sc-fb warn'; return; }
      evaluate(text);
    }, err => { listening = null; setMic('idle'); fb.className = 'sc-fb warn'; fb.textContent = V.MIC_ERR[err.code] || V.MIC_ERR.start; if (err.code === 'no-sr' || err.code === 'mic-blocked') { typed = false; toggleType(); } });
  });

  function evaluate(text) {
    tries++;
    lastHeard = text;
    result = best(targets, text, S.strict);
    if (firstTry === null) firstTry = result.pass && !hintUsed;
    heardBox.textContent = '';
    heardBox.append(el('span', 'heard-label', '들린 말 '), h('span', { lang: 'en' }, text));
    renderLine();
    fb.textContent = '';
    if (result.pass) {
      chime(true);
      fb.className = 'sc-fb ok';
      const msg = result.score >= 0.999 ? (tries === 1 ? '완벽해요!' : '좋아요, 해냈어요!') : '좋아요! 빠진 낱말만 한 번 더 보세요.';
      fb.append(icon('check', 18), el('span', '', msg));
      if (result.target !== item.en) fb.append(el('div', 'alt', '이렇게도 말해요: ' + item.en));
      endButtons();
    } else if (tries >= maxTries) {
      chime(false);
      fb.className = 'sc-fb bad';
      fb.append(el('span', '', '정답을 듣고 따라 해 보세요.'));
      renderLine();
      V.say(item.en, { lang: 'en', voice });
      endButtons(true);
    } else {
      chime(false);
      fb.className = 'sc-fb warn';
      const miss = result.tokens.filter(t => t.state === 'miss').map(t => t.raw.replace(/[^A-Za-z'’-]/g, ''));
      fb.append(el('span', '', showTarget() && miss.length ? `빨간 낱말(${miss.slice(0, 3).join(', ')})이 안 들렸어요. 다시 해 볼까요?` : '아깝네요. 다시 말해 볼까요?'));
      if (type !== 'repeat' && tries === maxTries - 1 && !hintN) { hintN = 2; renderLine(); }
    }
  }
  function endButtons(fail) {
    mic.disabled = true; skipBtn.disabled = true; hintBtn.disabled = true;
    const go = h('button', { class: 'btn primary wide', onclick: () => finish(false) }, '계속');
    const again = fail ? null : h('button', { class: 'btn ghost', onclick: () => { mic.disabled = false; result = null; fb.textContent = ''; heardBox.textContent = ''; renderLine(); again.remove(); go.remove(); skipBtn.disabled = false; } }, '한 번 더');
    fb.append(h('div', { class: 'fb-btns' }, again, go));
    go.focus({ preventScroll: true });
    if (opts.autoNext && !fail) setTimeout(() => { if (!finished && go.isConnected) finish(false); }, 1400);
  }
  function finish(skipped) {
    if (finished) return;
    finished = true;
    if (listening) listening.abort();
    V.stop();
    resolveCard({ pass: !!(result && result.pass), firstTry: !!firstTry, tries, skipped, heard: lastHeard, score: result ? result.score : 0 });
  }
  renderPrompt(); renderLine();
  if (opts.autoPlay !== false && type === 'repeat') setTimeout(() => { if (!finished) V.say(item.en, { lang: 'en', voice }); }, 250);
  return done;
}
