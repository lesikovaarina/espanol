// Интервальное повторение: лестница интервалов + коэффициент лёгкости (как SM-2 в Anki).
export const H = 3600e3;
export const D = 86400e3;
const LADDER = [4 * H, 1 * D, 3 * D, 7 * D, 16 * D, 35 * D];
export const LEARNED_INTERVAL = 21 * D;
export const DIRS = ['es_ru', 'ru_es'];

// Тестовый сдвиг времени: ?now=+30d (или +5h) — чтобы проверять расписание без ожидания.
let offset = 0;
try {
  const m = new URLSearchParams(location.search).get('now')?.trim().match(/^\+?(\d+)([dh])$/);
  if (m) offset = Number(m[1]) * (m[2] === 'd' ? D : H);
} catch {}
export const now = () => Date.now() + offset;
export const timeOffset = () => offset;

export function newCard() {
  return { stage: 0, ease: 2.5, interval: 0, due: 0, reps: 0, lapses: 0, lastSeen: 0 };
}

export function newSrs() {
  return { es_ru: newCard(), ru_es: newCard() };
}

function intervalFor(stage, prev, ease) {
  if (stage <= LADDER.length) return LADDER[stage - 1];
  return Math.round(prev * ease);
}

// result: 'good' | 'almost' | 'bad'
export function grade(card, result) {
  const c = { ...card };
  const t = now();
  c.reps += 1;
  c.lastSeen = t;
  if (result === 'bad') {
    c.lapses += 1;
    c.ease = Math.max(1.3, +(c.ease - 0.2).toFixed(2));
    c.stage = 1;
    c.interval = LADDER[0];
  } else if (result === 'almost' && c.stage > 0) {
    c.interval = Math.max(LADDER[0], Math.round(c.interval * 1.2));
  } else {
    c.stage += 1;
    c.interval = intervalFor(c.stage, c.interval, c.ease);
  }
  c.due = t + c.interval;
  return c;
}

// «Я это уже знаю» — сразу на ступень с интервалом 3 дня.
export function markKnown() {
  const c = newCard();
  c.stage = 3;
  c.interval = LADDER[2];
  c.reps = 1;
  c.lastSeen = now();
  c.due = now() + c.interval;
  return { es_ru: { ...c }, ru_es: { ...c } };
}

export function isNew(w) {
  return DIRS.every(d => w.srs[d].reps === 0);
}

// new → learning → known (интервал ≥ 1 дня) → learned (≥ 21 дня в обе стороны)
export function status(w) {
  if (isNew(w)) return 'new';
  const iv = DIRS.map(d => w.srs[d].interval);
  if (iv.every(i => i >= LEARNED_INTERVAL)) return 'learned';
  if (iv.every(i => i >= D)) return 'known';
  return 'learning';
}

export const STATUS_LABEL = { new: 'новое', learning: 'учу', known: 'знакомо', learned: 'выучено' };

export function dueDirs(w, t = now()) {
  if (isNew(w)) return [];
  return DIRS.filter(d => w.srs[d].reps > 0 && w.srs[d].due <= t);
}

export function stats(words) {
  const s = { total: words.length, new: 0, learning: 0, known: 0, learned: 0, due: 0 };
  for (const w of words) {
    s[status(w)] += 1;
    if (dueDirs(w).length) s.due += 1;
  }
  return s;
}

// Сколько слов придёт на повторение в каждый из ближайших 7 дней.
export function forecast(words, days = 7) {
  const start = new Date(now());
  start.setHours(0, 0, 0, 0);
  const out = Array.from({ length: days }, (_, i) => ({ day: new Date(start.getTime() + i * D), count: 0 }));
  for (const w of words) {
    if (isNew(w)) continue;
    const due = Math.min(...DIRS.map(d => w.srs[d].due));
    const idx = Math.max(0, Math.floor((due - start.getTime()) / D));
    if (idx < days) out[idx].count += 1;
  }
  return out;
}

export function humanInterval(ms) {
  if (ms < D) return Math.max(1, Math.round(ms / H)) + ' ч';
  const d = Math.round(ms / D);
  if (d < 30) return d + ' дн';
  return Math.round(d / 30) + ' мес';
}
