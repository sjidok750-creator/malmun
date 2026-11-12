/* 말문 — 소리 내기(미리 만든 Supertonic 3 녹음 → 없으면 기기 목소리)와 음성 인식(마이크) */
import { S } from './core.js';

/* ---------- 미리 만든 녹음 목록 (tools/make_audio.py 가 만든 data/audio.json) ---------- */
let clipMap = {};
export async function loadClips() {
  try { const r = await fetch('data/audio.json', { cache: 'no-cache' }); if (r.ok) clipMap = await r.json(); } catch (e) { clipMap = {}; }
}
const clipKey = (voice, lang, text) => voice + '|' + lang + '|' + String(text).trim();
export const hasClip = (voice, lang, text) => !!clipMap[clipKey(voice, lang, text)];

/* ---------- 기기 목소리 ---------- */
const synth = ('speechSynthesis' in window) ? window.speechSynthesis : null;
let voices = [];
function loadVoices() { try { voices = synth ? synth.getVoices() : []; } catch (e) { voices = []; } }
if (synth) { loadVoices(); try { synth.addEventListener('voiceschanged', loadVoices); } catch (e) { synth.onvoiceschanged = loadVoices; } }
function pickVoice(lang, voiceId) {
  const want = lang.toLowerCase(), base = want.split('-')[0];
  const norm = v => String(v.lang || '').toLowerCase().replace('_', '-');
  let pool = voices.filter(v => norm(v) === want);
  if (!pool.length) pool = voices.filter(v => norm(v).split('-')[0] === base);
  if (!pool.length) return null;
  const good = pool.filter(v => /natural|neural|premium|enhanced|google/i.test(v.name));
  const p = good.length ? good : pool;
  if (voiceId && p.length > 1) { const male = /^M/.test(voiceId); const g = p.filter(v => (male ? /male|guy|david|mark|james|daniel|fred|alex/i : /female|zira|aria|jenny|samantha|karen|victoria/i).test(v.name) && !(male ? /female/i : /\bmale/i).test(v.name)); if (g.length) return g[0]; }
  return p[0];
}

/* ---------- 재생 ---------- */
let audio = null, seq = 0, talkCb = null, unlocked = false;
export function onTalk(fn) { talkCb = fn; }
function talking(v) { if (talkCb) talkCb(v); }
function el() { if (!audio) { audio = new Audio(); audio.preload = 'auto'; } return audio; }
/* 0.05초 무음 WAV(아이폰은 손가락으로 누를 때 한 번 재생한 소리 요소만 나중에 스스로 재생할 수 있다) */
function silentWav() {
  const n = 1102, b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 22050, true); v.setUint32(28, 44100, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
}
export function unlock() {
  if (unlocked) return; unlocked = true;
  try { const a = el(); a.src = silentWav(); a.play().then(() => a.pause()).catch(() => {}); } catch (e) { /* ignore */ }   // 무음 파일이라 음소거 없이(아이폰은 소리 있는 재생만 잠금 해제로 침)
  try { if (synth) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); } } catch (e) { /* ignore */ }
}
let cutPlay = null;   // 재생 중인 녹음을 멈추면 기다리던 say() 도 끝낸다(멈춘 소리는 ended 가 오지 않음)
export function stop() {
  seq++;
  if (cutPlay) { const c = cutPlay; cutPlay = null; c(); }
  if (audio) { try { audio.pause(); } catch (e) { /* ignore */ } }
  try { synth && synth.cancel(); } catch (e) { /* ignore */ }
  talking(false);
}
function deviceSay(text, lang, voiceId, rate, my) {
  return new Promise(resolve => {
    let done = false;
    const est = 1500 + text.length * (lang.startsWith('ko') ? 140 : 80) / rate;
    const finish = () => { if (done) return; done = true; clearTimeout(t); resolve(); };
    const t = setTimeout(finish, est + 3000);
    if (!synth) { setTimeout(finish, Math.min(est, 6000)); return; }
    try { synth.cancel(); } catch (e) { /* ignore */ }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang; const v = pickVoice(lang, voiceId); if (v) u.voice = v;
    u.rate = rate; u.pitch = voiceId && /^M/.test(voiceId) ? 0.92 : 1.05;
    u.onend = finish; u.onerror = finish;
    if (my !== seq) { finish(); return; }
    try { synth.speak(u); } catch (e) { finish(); }
  });
}
/* text 를 읽는다. lang: 'en' | 'ko'. voice: 'F1'~'M5'. slow: 느리게. 끝나면 resolve(중간에 stop 되면 false). */
export async function say(text, { lang = 'en', voice = 'F2', slow = false, avatar = true } = {}) {
  text = String(text || '').trim(); if (!text) return true;
  const my = ++seq;
  if (cutPlay) { const c = cutPlay; cutPlay = null; c(); }
  if (audio) { try { audio.pause(); } catch (e) { /* ignore */ } }
  try { synth && synth.cancel(); } catch (e) { /* ignore */ }
  const rate = (S.rate || 1) * (slow ? 0.72 : 1);
  const file = clipMap[clipKey(voice, lang, text)];
  if (avatar) talking(true);
  if (file) {
    const a = el();
    const ok = await new Promise(resolve => {
      cutPlay = () => resolve(false);
      a.onended = () => { cutPlay = null; resolve(true); }; a.onerror = () => { cutPlay = null; resolve(false); };
      a.src = 'audio/' + file; a.playbackRate = rate; try { a.preservesPitch = true; } catch (e) { /* old */ }
      a.play().catch(() => resolve(false));
    });
    if (my !== seq) return false;
    if (ok) { talking(false); return true; }
  }
  await deviceSay(text, lang === 'ko' ? 'ko-KR' : 'en-US', voice, rate, my);
  if (my === seq) talking(false);
  return my === seq;
}
/* 이어 읽기 대기열(스트리밍 답장용) */
export function queue(voice, onDone) {
  const q = []; let busy = false, ended = false, finished = false;
  const HANGUL = /[가-힯]/;
  async function next() {
    if (finished) return;
    if (!q.length) { busy = false; if (ended) { finished = true; talking(false); if (onDone) onDone(); } return; }
    busy = true;
    const t = q.shift();
    const ok = await say(t, { lang: HANGUL.test(t) ? 'ko' : 'en', voice });
    if (!ok && finished) return;
    next();
  }
  return {
    push(t) { t = String(t).trim(); if (!t || finished) return; q.push(t); if (!busy) next(); },
    end() { ended = true; if (!busy) next(); },
    cancel() { q.length = 0; ended = true; finished = true; },
  };
}
export const deviceVoiceCount = () => voices.length;

/* ---------- 마이크(브라우저 음성 인식) ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
export const micAvailable = () => !!SR;
let cur = null;
/* 한 마디 듣기. onInterim(text) 로 중간 글자. 반환 { promise, stop }. promise → { text } 또는 reject({code})
   manual = true: '직접 끝내기' — 말 중간에 쉬어도 끝내지 않고, stop() 을 부를 때까지(최대 maxMs) 이어 듣는다.
   브라우저가 스스로 인식을 끝내면 다시 켜고 앞서 들은 글에 이어 붙인다. */
export function listen({ lang = 'en-US', onInterim, maxMs, manual = false } = {}) {
  if (!SR) return { promise: Promise.reject({ code: 'no-sr' }), stop() {}, abort() {} };
  if (cur) cur.abort();
  const limit = maxMs || (manual ? 60000 : 20000);
  const deadline = Date.now() + limit;
  let r = null, base = '', finalText = '', interim = '', settled = false, userStop = false, endT = 0, maxT = 0;
  let resolveP, rejectP;
  const promise = new Promise((res, rej) => { resolveP = res; rejectP = rej; });
  const all = () => (finalText + ' ' + interim).replace(/\s+/g, ' ').trim();
  const done = (err) => {
    if (settled) return; settled = true; clearTimeout(endT); clearTimeout(maxT);
    if (cur === ctl) cur = null;
    try { r && r.abort(); } catch (e) { /* ignore */ }
    if (err) rejectP(err); else resolveP({ text: all() });
  };
  const ctl = {
    stop() { if (settled) return; userStop = true; try { r.stop(); } catch (e) { done(); } endT = setTimeout(() => done(), 1200); },
    abort() { if (!settled) { settled = true; clearTimeout(endT); clearTimeout(maxT); if (cur === ctl) cur = null; try { r && r.abort(); } catch (e) { /* ignore */ } resolveP({ text: '', aborted: true }); } },
  };
  function start() {
    try { r = new SR(); } catch (e) { done({ code: 'start' }); return; }
    r.lang = lang; r.continuous = manual; r.interimResults = true; r.maxAlternatives = 1;
    r.onresult = e => {
      let f = '', i = '';
      for (let k = 0; k < e.results.length; k++) { const t = e.results[k][0].transcript; if (e.results[k].isFinal) f += t + ' '; else i += t; }
      finalText = (base + ' ' + f).trim(); interim = i.trim();
      if (onInterim) onInterim(all());
      if (!manual && f.trim() && !interim) { clearTimeout(endT); endT = setTimeout(() => done(), 250); }
    };
    r.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') done({ code: 'mic-blocked' });
      else if (e.error === 'audio-capture') done({ code: 'no-mic' });
      else if (e.error === 'network') done({ code: 'network' });
      else if (!manual) done();   // no-speech·aborted 등: 직접 끝내기면 onend 에서 다시 켬
    };
    r.onend = () => {
      if (settled) return;
      if (manual && !userStop && Date.now() < deadline) { base = all(); finalText = base; interim = ''; setTimeout(() => { if (!settled) start(); }, 120); return; }
      done();
    };
    try { r.start(); } catch (e) { done({ code: 'start' }); }
  }
  cur = ctl;
  maxT = setTimeout(() => ctl.stop(), limit);
  start();
  return { promise, stop: ctl.stop, abort: ctl.abort };
}
export function abortListen() { if (cur) cur.abort(); }
export const MIC_ERR = {
  'mic-blocked': '마이크가 막혀 있어요. 주소창 자물쇠 → 사이트 설정에서 마이크를 허용해 주세요.',
  'no-mic': '마이크를 찾지 못했어요.',
  network: '음성 인식 서버에 닿지 못했어요. 인터넷 연결을 확인해 주세요.',
  'no-sr': '이 브라우저는 음성 인식을 지원하지 않아요. 크롬·엣지·사파리에서 열거나 키보드로 입력해 주세요.',
  start: '음성 인식을 시작하지 못했어요.',
};
