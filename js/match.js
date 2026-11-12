/* 말문 — 말한 문장 채점: 받아 적은 글(음성 인식)과 목표 문장을 낱말 단위로 맞춰 본다.
   발음 점수가 아니라 '어느 낱말이 들렸는가'다. 낱말 순서도 본다(최장 공통 부분열). */

const CONTRACTIONS = [
  [/\bcan't\b/g, 'can not'], [/\bcannot\b/g, 'can not'], [/\bwon't\b/g, 'will not'], [/\bshan't\b/g, 'shall not'],
  [/\bain't\b/g, 'is not'], [/n't\b/g, ' not'], [/'re\b/g, ' are'], [/'ve\b/g, ' have'], [/'ll\b/g, ' will'], [/'d\b/g, ' would'],
  [/\bi'm\b/g, 'i am'], [/\blet's\b/g, 'let us'],
  [/\b(it|that|what|where|who|there|here|he|she|how|when|why|this|everything|nothing|something)'s\b/g, '$1 is'],
];
const SAME = {};
[['to', 'too', 'two'], ['for', 'four'], ['there', 'their'], ['right', 'write'], ['hear', 'here'], ['by', 'buy', 'bye'],
  ['know', 'no'], ['wait', 'weight'], ['one', 'won'], ['see', 'sea', 'c'], ['meet', 'meat'], ['ok', 'okay'], ['hi', 'high'],
  ['week', 'weak'], ['eight', 'ate'], ['our', 'hour'], ['whole', 'hole'], ['which', 'witch'], ['would', 'wood'],
  ['flour', 'flower'], ['sun', 'son'], ['tea', 't'], ['you', 'u'], ['are', 'r'], ['cue', 'queue', 'q'], ['jay', 'j'], ['why', 'y']]
  .forEach((g, i) => g.forEach(w => { SAME[w] = 'g' + i; }));
const MINOR = new Set(['a', 'an', 'the']);

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function numWords(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
  if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + numWords(n % 100) : '');
  if (n < 1e6) return numWords(Math.floor(n / 1000)) + ' thousand' + (n % 1000 ? ' ' + numWords(n % 1000) : '');
  return String(n);
}
const ORD = { 1: 'first', 2: 'second', 3: 'third', 5: 'fifth', 8: 'eighth', 9: 'ninth', 12: 'twelfth', 20: 'twentieth', 30: 'thirtieth' };

/* 소문자·축약 풀기·숫자를 낱말로·문장부호 빼기 → 낱말 배열 */
export function words(s) {
  let t = String(s || '').toLowerCase().replace(/[‘’ʼ`´]/g, "'");
  t = t.replace(/(\d+):(\d{2})/g, (m, h, mm) => numWords(+h) + ' ' + (mm === '00' ? "o'clock" : (+mm < 10 ? 'oh ' + ONES[+mm] : numWords(+mm))));
  t = t.replace(/\$(\d+)/g, (m, d) => numWords(+d) + ' dollars');
  t = t.replace(/(\d+)%/g, (m, d) => numWords(+d) + ' percent');
  t = t.replace(/\b(\d+)(st|nd|rd|th)\b/g, (m, d) => ORD[+d] || numWords(+d) + 'th');
  t = t.replace(/\b\d+\b/g, d => numWords(+d));
  for (const [re, rep] of CONTRACTIONS) t = t.replace(re, rep);
  t = t.replace(/o'clock/g, 'oclock').replace(/'s\b/g, 's').replace(/'/g, '');
  t = t.replace(/\ball right\b/g, 'alright').replace(/\bokay\b/g, 'ok').replace(/\bwi[\s-]?fi\b/g, 'wifi').replace(/\be[\s-]?mail\b/g, 'email').replace(/-/g, ' ');
  return t.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

function editDist(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/* 2 = 같음, 1 = 비슷함(동음어 아님, 철자 한 글자 차이·긴 낱말만), 0 = 다름 */
function wordEq(a, b) {
  if (a === b) return 2;
  if (SAME[a] && SAME[a] === SAME[b]) return 2;
  if (a.length >= 6 && b.length >= 6 && editDist(a, b) <= 1) return 1;
  return 0;
}

/* 목표 문장 원문을 화면용 토큰(원래 글자 + 비교용 낱말)으로 나눈다. 한 화면 토큰이 비교 낱말 여러 개(I'm → i am)일 수 있다. */
export function displayTokens(target) {
  return String(target).split(/\s+/).filter(Boolean).map(raw => ({ raw, keys: words(raw) }));
}

/* 판정 엄격도: loose 느슨 · normal 보통 · strict 엄격(비슷함·관사·이름도 정확히) */
const RULE = {
  loose: { allowed: n => (n >= 14 ? 3 : n >= 8 ? 2 : n >= 4 ? 1 : 0), floor: 0.6, lenient: true },
  normal: { allowed: n => (n >= 14 ? 2 : n >= 8 ? 1 : 0), floor: 0.75, lenient: true },
  strict: { allowed: () => 0, floor: 0.999, lenient: false },
};
/* 목표(target)와 들은 말(heard)을 맞춰 본다. 반환: { tokens:[{raw, state:'ok'|'near'|'miss'|'minor'}], score, pass, missing } */
export function align(target, heard, strict = 'normal') {
  const rule = RULE[strict] || RULE.normal;
  const toks = displayTokens(target);
  const tw = [], owner = [];
  toks.forEach((t, i) => t.keys.forEach(k => { tw.push(k); owner.push(i); }));
  const hw = words(heard);
  const n = tw.length, m = hw.length;
  const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    const e = wordEq(tw[i], hw[j]);
    L[i][j] = Math.max(e ? L[i + 1][j + 1] + (e === 2 ? 2 : 1) : 0, L[i + 1][j], L[i][j + 1]);
  }
  const st = new Array(n).fill('miss');
  let i = 0, j = 0;
  while (i < n && j < m) {
    const e = wordEq(tw[i], hw[j]);
    if (e && L[i][j] === L[i + 1][j + 1] + (e === 2 ? 2 : 1)) { st[i] = e === 2 ? 'ok' : 'near'; i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else j++;
  }
  if (rule.lenient) {
    for (let k = 0; k < n; k++) if (st[k] === 'miss' && MINOR.has(tw[k])) st[k] = 'minor';
    /* 문장 가운데 대문자 낱말(사람·지명 이름: Jisoo, Busan)은 영어 음성 인식이 다르게 적기 쉬워 안 들려도 감점하지 않는다(주황) */
    toks.forEach((t, ti) => {
      if (ti === 0 || !/^[A-Z]/.test(t.raw) || /^I(\b|['’])/.test(t.raw) || /[.!?]["'”’]?$/.test(toks[ti - 1].raw)) return;
      for (let k = 0; k < n; k++) if (owner[k] === ti && st[k] === 'miss') st[k] = 'minor';
    });
  } else {
    for (let k = 0; k < n; k++) if (st[k] === 'near') st[k] = 'miss';   // 엄격: 한 글자 차이도 틀림
  }
  const rank = { miss: 0, minor: 1, near: 2, ok: 3 };
  const tokens = toks.map((t, ti) => {
    const mine = st.filter((_, k) => owner[k] === ti);
    const worst = mine.length ? mine.reduce((a, b) => (rank[a] <= rank[b] ? a : b)) : 'ok';
    return { raw: t.raw, state: worst };
  });
  const missing = st.filter(s => s === 'miss').length;
  const got = st.filter(s => s === 'ok' || s === 'near').length;
  const score = n ? got / n : 0;
  return { tokens, score, missing, pass: n > 0 && missing <= rule.allowed(n) && score >= rule.floor };
}

/* 정답 후보 여러 개(en + alts) 가운데 가장 잘 맞는 것 */
export function best(targets, heard, strict = 'normal') {
  let top = null;
  for (const t of targets.filter(Boolean)) {
    const r = align(t, heard, strict);
    r.target = t;
    if (!top || r.score > top.score || (r.score === top.score && r.missing < top.missing)) top = r;
  }
  return top;
}
