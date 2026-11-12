/* 말문 — Claude API (대표님 휴대폰에 넣은 키로 브라우저에서 바로 부름. 키는 이 기기 localStorage 에만) */
import { S } from './core.js';

export const MODELS = {
  'claude-opus-5-5': 'Opus 5.5 — 가장 자연스러움(기본) · 입력 $4 / 출력 $20 (100만 토큰당)',
  'claude-sonnet-5-5': 'Sonnet 5.5 — 빠르고 똑똑함 · $2 / $10',
  'claude-haiku-5-5': 'Haiku 5.5 — 가장 빠르고 저렴 · $0.10 / $0.50',
};
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.134.0/+esm';
let sdk = null, client = null, clientKey = '';

const STR = { type: 'string' };
export const obj = props => ({ type: 'object', additionalProperties: false, required: Object.keys(props), properties: props });
const arr = items => ({ type: 'array', items });
const EnKo = obj({ en: STR, ko: STR });

export const hasKey = () => !!S.apiKey;

export async function callJSON(prompt, schema, { onText, signal, effort = 'low', maxTokens = 16000 } = {}) {
  if (!S.apiKey) throw { code: 'nokey' };
  let Anthropic;
  try { if (!sdk) sdk = await import(SDK_URL); Anthropic = sdk.default || sdk.Anthropic; } catch (e) { throw { code: 'sdk_load' }; }
  if (!client || clientKey !== S.apiKey) { client = new Anthropic({ apiKey: S.apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 }); clientKey = S.apiKey; }
  const model = MODELS[S.model] ? S.model : 'claude-opus-5-5';
  const params = { model, max_tokens: maxTokens, output_config: { effort, format: { type: 'json_schema', schema } }, messages: [{ role: 'user', content: prompt }] };
  let msg;
  try {
    const stream = model === 'claude-haiku-5-5'
      ? client.messages.stream(params, { signal })
      : client.beta.messages.stream({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }, { signal });
    let acc = '';
    for await (const ev of stream) {
      if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') { acc += ev.delta.text; if (onText) onText(acc); }
    }
    msg = await stream.finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.APIUserAbortError) throw { code: 'cancelled' };
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw { code: 'bad_key' };
    if (e instanceof Anthropic.RateLimitError) throw { code: 'rate_limited' };
    if (e instanceof Anthropic.BadRequestError) throw { code: /credit/i.test(e.message || '') ? 'no_credit' : 'bad_request', message: e.message };
    if (e instanceof Anthropic.APIConnectionError) throw { code: 'offline' };
    throw { code: 'upstream_error', message: e && e.message };
  }
  if (msg.stop_reason === 'refusal') throw { code: 'refused' };
  const tb = (msg.content || []).find(b => b.type === 'text');
  if (!tb || msg.stop_reason === 'max_tokens') throw { code: 'invalid_json' };
  try { return JSON.parse(tb.text); } catch (e) { throw { code: 'invalid_json' }; }
}
const ERR = {
  nokey: '내 정보 → 설정에서 Claude API 키를 넣으면 AI 와 대화할 수 있어요.',
  rate_limited: '잠시 너무 많이 보냈거나 사용 한도에 닿았어요. 조금 뒤에 다시 해 주세요.',
  refused: '이 말에는 답할 수 없대요. 다르게 말해 볼까요?',
  cancelled: '보내기를 멈췄어요.',
  bad_key: 'API 키가 맞지 않아요. 내 정보 → 설정에서 다시 넣어 주세요.',
  no_credit: 'Claude API 크레딧이 부족해요. console.anthropic.com 결제(Billing)를 확인해 주세요.',
  sdk_load: 'Claude 연결 프로그램을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.',
  offline: 'Claude 서버에 닿지 못했어요. 인터넷 연결을 확인해 주세요.',
  invalid_json: '답장이 중간에 끊겼어요. 다시 해 주세요.',
};
export function errText(e) {
  const c = (e && e.code) || 'upstream_error';
  if (c === 'bad_request') return 'Claude 서버가 요청을 거절했어요: ' + String((e && e.message) || '').slice(0, 160);
  return ERR[c] || '답을 받지 못했어요. 연결이 잠깐 끊겼을 수 있어요.';
}

/* ---------- 학습자 기억(최근 실수) ---------- */
function learnerLines() {
  const lines = [];
  const m = S.mistakes.slice(-6).map(x => x.why).filter(Boolean);
  if (m.length) lines.push('RECENT WEAK POINTS (from earlier sessions; use quietly, never read out): ' + m.join(' / '));
  return lines;
}
const LEVEL = { c1: 'beginner (A1–A2): use short, simple sentences and common words.', c2: 'pre-intermediate to intermediate (A2–B1): natural everyday English, not too fast or idiomatic.' };
export const levelOf = courseId => LEVEL[courseId] || LEVEL[S.start] || LEVEL.c1;

/* ---------- 대화(롤플레이·프리토킹) 한 턴 ---------- */
export const TURN_SCHEMA = obj({
  reply: STR, ko: STR,
  correction: obj({ better: STR, ko: STR, why_ko: STR }),
  hints: arr(EnKo),
  missions_done: arr({ type: 'integer' }),
  finished: { type: 'boolean' },
});
export function turnPrompt(rp, log, missionsDone, level) {
  const ms = (rp.missions || []).map((m, i) => `  ${i}. ${m.en} — ${missionsDone.includes(i) ? 'DONE' : 'not yet'}`);
  const hist = log.slice(-24).map(t => (t.who === 'me' ? 'Learner' : rp.ai_name) + ': ' + t.text);
  return [
    `You are ${rp.ai_name}, ${rp.ai_role}. You are talking with a learner in a Korean English-speaking practice app.`,
    `SCENE (what the learner sees, in Korean): ${rp.scene_ko || ''}. The learner plays: ${rp.user_role_ko || 'themselves'}.`,
    `LEARNER: a Korean speaker. Level: ${level}`,
    ...learnerLines(),
    ms.length ? 'LEARNER MISSIONS (the learner should accomplish these by speaking; status so far):\n' + ms.join('\n') : 'This is free conversation: no missions.',
    'RULES:',
    '- Stay in character and keep it natural, warm and short: 1–3 sentences at the learner\'s level. Do not end every reply with a question; vary it, but leave the learner something to respond to.',
    ms.length ? '- Steer the talk so the learner gets a natural chance to do the missions that are not yet done. Never list or announce the missions.' : '- Follow the learner\'s interests; share a little about yourself too.',
    ms.length ? '- "missions_done": indices of ALL missions the learner has accomplished so far in their own words (small grammar errors are fine). Include earlier ones.' : '- "missions_done" is [].',
    ms.length ? '- When every mission is done, wrap up warmly within one or two turns; set "finished" true on your closing line. Otherwise "finished" is false.' : '- "finished" is true only if the learner says goodbye or wants to stop.',
    '- The learner talks through speech recognition: ignore missing punctuation, capitalisation and homophone slips.',
    '- KOREAN HELP: if the learner writes Korean asking for help (how to say something, a word meaning, they did not understand), answer kindly in natural Korean (1–2 short sentences, 해요체), give the English expression in quotation marks, invite them to say it, and put that expression in correction.better. Next turn, back to English.',
    '- If the learner simply answers in Korean, reply in English and put a natural English way to say what they meant in correction.better.',
    '- CORRECTION: if the learner\'s last message has a grammar mistake or sounds unnatural, set correction.better to a natural way to say it (keep their meaning), correction.ko to its natural Korean meaning, and correction.why_ko to one short Korean sentence explaining why. If it is fine, set all three to "". Never correct inside "reply".',
    '- "ko": natural Korean translation of the English in "reply" ("" if reply is Korean).',
    '- "hints": exactly 2 short things the learner could say next (aimed at a mission not yet done, if any), each with Korean meaning.',
    '- Keep it friendly and suitable for all ages.',
    '',
    'Conversation so far (oldest first; the last line is the learner\'s newest message):',
    ...hist,
  ].join('\n');
}

/* ---------- 문법·표현 질문 ---------- */
export const QA_SCHEMA = obj({ answer_ko: STR, examples: arr(EnKo) });
export function qaPrompt(q, log) {
  const hist = log.slice(-8).map(t => (t.who === 'me' ? '학습자' : '선생님') + ': ' + t.text);
  return [
    'You are a kind, precise English teacher for Korean adults in a speaking-practice app. Answer the learner\'s question about English grammar, words or expressions.',
    '- "answer_ko": clear Korean explanation (해요체), 2–6 short sentences, concrete, no long lectures. Quote English in double quotation marks. If the learner asks how to say something, give the most natural spoken American English first, then one alternative.',
    '- "examples": 2–3 natural spoken English example sentences that show the point, each with Korean meaning.',
    '- If the question is not about English, answer briefly and kindly steer back to English learning.',
    ...learnerLines(),
    '',
    ...(hist.length ? ['Earlier in this chat:', ...hist, ''] : []),
    '학습자의 질문: ' + q,
  ].join('\n');
}

/* ---------- 상황을 말하면 롤플레이 만들기 ---------- */
export const RP_SCHEMA = obj({
  title_ko: STR, ai_name: STR, ai_voice: { type: 'string', enum: ['F1', 'F2', 'F3', 'F4', 'F5', 'M1', 'M2', 'M3', 'M4', 'M5'] },
  ai_role: STR, scene_ko: STR, user_role_ko: STR, opener: STR, opener_ko: STR,
  missions: arr(obj({ ko: STR, en: STR })), useful: arr(EnKo),
});
export function rpPrompt(situation, level) {
  return [
    'Design a short English speaking role-play for a Korean learner, based on the situation they describe (in Korean or English).',
    `Learner level: ${level}`,
    `Situation from the learner: ${situation}`,
    '- ai_name: an invented English first name (no celebrities or fictional characters). ai_voice: a voice id matching the character (F = female, M = male).',
    '- ai_role: one English sentence describing who you are in the scene (used as your instructions). scene_ko: one Korean sentence the learner sees. user_role_ko: the learner\'s role in Korean. title_ko: short Korean title (under 15 characters).',
    '- opener: your first line in natural spoken English (1–2 sentences), opener_ko its Korean translation.',
    '- missions: exactly 3 concrete things the learner should accomplish by speaking, in order of the conversation (ko: Korean, en: English).',
    '- useful: 4 short expressions that help with the missions (en, ko).',
    '- Keep it realistic, friendly, suitable for all ages; no real brands.',
  ].join('\n');
}

/* ---------- 나만의 수업 만들기(주제·목표 또는 내 실수에서) ---------- */
const PRACTICE = obj({ type: { type: 'string', enum: ['repeat', 'translate', 'pattern'] }, en: STR, ko: STR, pattern: STR, cue_ko: STR, alts: arr(STR) });
export const LESSON_SCHEMA = obj({
  title: STR, goal_ko: STR,
  learn: arr(obj({ en: STR, ko: STR, note_ko: STR, pattern: STR })),
  practice: arr(PRACTICE),
  vocab: arr(EnKo),
  roleplay: RP_SCHEMA,
});
export function lessonPrompt({ topic, mistakes, level }) {
  return [
    'Create one short English speaking lesson for a Korean adult learner in a speaking-practice app. All English must be natural spoken American English; all Korean natural 해요체 (no translationese).',
    `Learner level: ${level}`,
    topic ? `The learner wants: ${topic}` : '',
    mistakes && mistakes.length ? 'Build the lesson around fixing these recent mistakes of the learner (said → better, why):\n' + mistakes.map(m => `- "${m.said}" → "${m.better}" (${m.why})`).join('\n') : '',
    'STRUCTURE:',
    '- title: Korean, under 15 characters. goal_ko: one Korean sentence starting what the learner will be able to say.',
    '- learn: exactly 3 key expressions. note_ko: the teacher\'s Korean explanation, 1–2 sentences, under 70 characters. pattern: a reusable frame with one "___" or "".',
    '- practice: exactly 12 items: first 3 are type "repeat" (the 3 learn expressions, same en/ko); then 9 items mixing "pattern" (pattern = the frame with ___, cue_ko = Korean hint for the blank) and "translate" (learner sees ko, says en), easy to harder, reusing the learn frames in new situations. alts: other equally correct English answers ([] if none). For non-pattern items pattern and cue_ko are "". Sentences are spoken aloud: no brackets, slashes or symbols; write times and amounts in words.',
    '- vocab: exactly 6 useful words or short phrases (en, ko).',
    '- roleplay: a scene where the learner must use the learn expressions. ai_name invented English name, ai_voice F1–F5 or M1–M5, ai_role one English sentence, scene_ko, user_role_ko, title_ko, opener + opener_ko, exactly 3 missions (ko, en), 4 useful expressions.',
    '- Suitable for all ages, no real brands or celebrities.',
  ].filter(Boolean).join('\n');
}

/* 스트리밍 JSON 에서 "reply" 글자만 뽑아 문장 단위로 넘긴다 */
export function replyStreamer(onChunk) {
  let start = -1, sent = 0, closed = false;
  return function feed(full) {
    if (closed) return;
    if (start < 0) { const m = /"reply"\s*:\s*"/.exec(full); if (!m) return; start = m.index + m[0].length; }
    let txt = '', i = start;
    while (i < full.length) {
      const ch = full[i];
      if (ch === '"') { closed = true; break; }
      if (ch === '\\') {
        const nx = full[i + 1]; if (nx === undefined) break;
        if (nx === 'u') { const hex = full.substr(i + 2, 4); if (hex.length < 4) break; txt += String.fromCharCode(parseInt(hex, 16)); i += 6; continue; }
        txt += (nx === 'n' || nx === 't' || nx === 'r') ? ' ' : nx; i += 2; continue;
      }
      txt += ch; i++;
    }
    let cut = sent;
    if (closed) cut = txt.length;
    else { const re = /[.!?…]+(?=\s)/g; re.lastIndex = sent; let m; while ((m = re.exec(txt))) cut = m.index + m[0].length; }
    if (cut > sent) { const chunk = txt.slice(sent, cut); sent = cut; onChunk(chunk, txt); }
    else onChunk('', txt);
  };
}
