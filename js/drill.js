/* 말문 — 말하기 카드(따라 말하기·한국어 보고 말하기·틀에 넣어 말하기)와 얼굴(유나 사진)·도장 */
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

export const TEACHER = { name: '유나', voice: 'F2' };
const FACE = 'img/yuna-face.jpg', COVER = 'img/yuna.jpg';

/* ---------- 얼굴: 선생님 유나(사진). 말하는 동안 테두리 고리 + 막대 표시 ---------- */
const talkEls = new Set();
V.onTalk(on => talkEls.forEach(f => { if (!f.isConnected) { talkEls.delete(f); return; } f.classList.toggle('talking', !!on); }));
export function avatar(size = 44) {
  const a = el('span', 'av');
  a.style.width = a.style.height = size + 'px';
  a.append(h('img', { src: FACE, alt: TEACHER.name, width: size, height: size, decoding: 'async' }), h('i', { class: 'eq' }, el('b'), el('b'), el('b')));
  talkEls.add(a);
  return a;
}
export const talkingFace = avatar;
/* 큰 사진(표지) */
export function cover(cls = '') {
  const c = el('div', 'cover' + (cls ? ' ' + cls : ''));
  c.append(h('img', { src: COVER, alt: '', decoding: 'async' }));
  return c;
}

/* 대화 상대: 유나면 사진, 아니면 머리글자 원(차분한 색) */
const PAL = ['#26382F', '#3B3F63', '#7A3B2E', '#1F4E5F', '#5B3A5E', '#4A5D23', '#8A5A19', '#2D4B73', '#6B2D3E', '#3D3D3D'];
export function charBadge(name, voice, size = 44, photo = false) {
  if (photo) return avatar(size);
  const i = Math.abs(Array.from(name || '?').reduce((a, c) => a * 31 + c.charCodeAt(0), 3)) % PAL.length;
  const b = el('span', 'badge', (name || '?').slice(0, 1).toUpperCase());
  b.style.background = PAL[i]; b.style.width = b.style.height = size + 'px'; b.style.fontSize = Math.round(size * 0.46) + 'px';
  b.append(h('i', { class: 'eq' }, el('b'), el('b'), el('b')));
  talkEls.add(b);
  void voice; return b;
}

/* 수업 완료 도장 — grade 1~3 */
export function stamp(grade) {
  const txt = [['', '해냈어요'], ['', '잘했어요'], ['참', '잘했어요']][Math.max(1, Math.min(3, grade)) - 1];
  const d = new Date();
  const date = d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
  const w = el('div', 'stamp');
  w.setAttribute('role', 'img'); w.setAttribute('aria-label', (txt[0] ? txt[0] + ' ' : '') + txt[1]);
  w.innerHTML = `<svg viewBox="0 0 200 200" width="148" height="148" aria-hidden="true">
    <defs>
      <path id="stampArc" d="M100,100 m-76,0 a76,76 0 1,1 152,0 a76,76 0 1,1 -152,0"/>
      <filter id="stampInk" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="11" result="n"/>
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.6 0 0 0 2.25" result="m"/>
        <feComposite in="SourceGraphic" in2="m" operator="in"/>
      </filter>
    </defs>
    <g filter="url(#stampInk)" fill="currentColor">
      <circle cx="100" cy="100" r="94" fill="none" stroke="currentColor" stroke-width="5"/>
      <circle cx="100" cy="100" r="59" fill="none" stroke="currentColor" stroke-width="1.8"/>
      <text class="st-ring" font-size="14.5" textLength="462" lengthAdjust="spacing"><textPath href="#stampArc" startOffset="2">MALMUN · SPEAK IT OUT · ${date} ·</textPath></text>
      ${txt[0] ? `<text class="st-main" x="100" y="88" text-anchor="middle" font-size="24">${txt[0]}</text><text class="st-main" x="100" y="121" text-anchor="middle" font-size="27">${txt[1]}</text>`
        : `<text class="st-main" x="100" y="110" text-anchor="middle" font-size="28">${txt[1]}</text>`}
    </g></svg>`;
  return w;
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
  const subBox = el('div', 'sc-sub');   // 따라 말하기: 영어 아래 한국어 뜻
  const heardBox = el('div', 'sc-heard');
  const fb = el('div', 'sc-fb');
  const ctr = el('div', 'sc-ctr');
  card.append(label, prompt, lineBox, subBox, heardBox, fb, ctr);
  host.append(card);

  const showTarget = () => type === 'repeat' || finished || tries >= maxTries || (result && result.pass);
  function renderPrompt() {
    prompt.textContent = '';
    if (type === 'repeat') { subBox.textContent = (S.showKo || opts.showKo) && item.ko ? item.ko : ''; }
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
    /* 끝나면 마이크 줄 자리에 '계속' 을 둔다(엄지가 있던 자리) */
    const row = h('div', { class: 'fb-btns' });
    const again = fail ? null : h('button', { class: 'btn ghost', onclick: () => { mic.disabled = false; hintBtn.disabled = false; result = null; fb.textContent = ''; heardBox.textContent = ''; renderLine(); row.remove(); ctr.hidden = false; skipBtn.disabled = false; } }, '한 번 더');
    row.append(again || '', go);
    ctr.hidden = true; ctr.after(row);
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
