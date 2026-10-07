// Адаптивная проверка уровня: слова + грамматика, ~40 вопросов.
// Уровень θ: 1 = A2, 2 = B1, 3 = B2, 4 = C1. Верный ответ поднимает θ, неверный или «не знаю» — опускает,
// шаг постепенно уменьшается. Следующий вопрос берётся из уровня, ближайшего к текущему θ.
import { state, loadLibrary, saveProfile, esc, shuffle, go, rerender, sayBtn } from './core.js';

const PLAN = [['vocab', 22], ['grammar', 18]];
const NAMES = ['A2', 'B1', 'B2', 'C1'];
const SECTION_TITLE = { vocab: 'Слова', grammar: 'Грамматика' };

let L = null;

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export function levelLabel(v) {
  if (v < 0.8) return 'A1–A2';
  if (v > 4.3) return 'C1+';
  const i = clamp(Math.round(v), 1, 4);
  const d = v - i;
  const name = NAMES[i - 1];
  if (d < -0.15) return `${name} (начало)`;
  if (d > 0.2) return `${name} (уверенный)`;
  return name;
}

function start(lib) {
  L = {
    bank: lib.levelTest,
    section: 0,
    theta: { vocab: 2, grammar: 2 },
    trace: { vocab: [], grammar: [] },
    count: { vocab: 0, grammar: 0 },
    used: new Set(),
    answers: [],
    item: null,
    options: null,
  };
  nextItem();
}

function nextItem() {
  const [sec, total] = PLAN[L.section] || [];
  if (!sec) { L.item = null; return; }
  if (L.count[sec] >= total) { L.section += 1; nextItem(); return; }
  const target = clamp(Math.round(L.theta[sec]), 1, 4);
  const pool = L.bank[sec].map((it, i) => ({ it, key: sec + i })).filter(x => !L.used.has(x.key));
  // ближайший уровень, где ещё остались вопросы
  pool.sort((a, b) => Math.abs(a.it.level - target) - Math.abs(b.it.level - target) || Math.random() - 0.5);
  const pick = pool[0];
  if (!pick) { L.count[sec] = total; nextItem(); return; }
  L.used.add(pick.key);
  L.item = { sec, ...pick.it };
  L.options = shuffle([sec === 'vocab' ? pick.it.ru : pick.it.answer, ...pick.it.wrong]);
}

function answer(chosen) {
  const it = L.item;
  const correct = it.sec === 'vocab' ? it.ru : it.answer;
  const ok = chosen === correct;
  const n = L.count[it.sec];
  const step = Math.max(0.25, 0.8 * Math.pow(0.85, n));
  L.theta[it.sec] = clamp(L.theta[it.sec] + (ok ? step : -step), 0.5, 4.5);
  L.trace[it.sec].push(L.theta[it.sec]);
  L.count[it.sec] = n + 1;
  L.answers.push({ ...it, ok, chosen });
  nextItem();
  rerender();
}

// Итог по разделу: среднее θ за вторую половину ответов, когда оценка уже устоялась.
function sectionScore(sec) {
  const t = L.trace[sec];
  if (!t.length) return 2;
  const tail = t.slice(Math.floor(t.length / 2));
  return tail.reduce((a, b) => a + b, 0) / tail.length;
}

// «Mi hermana ___ y hoy ___» + «es / está» → обе вставки жирным
function fillBlanks(q, answer) {
  const blanks = q.split('___').length - 1;
  const parts = answer.split(/\s+(?:\/|…)\s+/);
  let i = 0;
  return esc(q).replace(/___/g, () => `<b>${esc(blanks === parts.length ? parts[i++] : answer)}</b>`);
}

function result() {
  if (!L.result) {
    const vocab = sectionScore('vocab');
    const grammar = sectionScore('grammar');
    const overall = (vocab + grammar) / 2;
    const weakTopics = [...new Set(L.answers.filter(a => a.sec === 'grammar' && !a.ok && a.level <= Math.round(grammar) + 1).map(a => a.topic))].slice(0, 6);
    L.result = { vocab, grammar, overall, weakTopics, level: levelLabel(overall) };
    saveProfile({ level: L.result.level, levelDetail: { vocab: levelLabel(vocab), grammar: levelLabel(grammar), at: Date.now() } });
  }
  const r = L.result;
  const bar = (title, v) => `<div class="lvl-row"><span>${title}</span><div class="bar"><div style="width:${clamp((v - 0.5) / 4, 0, 1) * 100}%"></div></div><b>${levelLabel(v)}</b></div>`;
  const wrongGrammar = L.answers.filter(a => a.sec === 'grammar' && !a.ok);
  return `<header class="top"><h1>Ваш уровень</h1></header>
  <div class="card center"><div class="big-emoji">🎯</div><h2>${esc(r.level)}</h2>
    ${bar('Слова', r.vocab)}
    ${bar('Грамматика', r.grammar)}
    <p class="muted small">Под этот уровень Gemini будет подбирать новые слова и примеры.</p>
  </div>
  ${r.weakTopics.length ? `<div class="card"><h3>Что стоит подтянуть</h3><ul class="result-list">${r.weakTopics.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
  ${wrongGrammar.length ? `<details class="card"><summary>Разбор ошибок в грамматике (${wrongGrammar.length})</summary>
    <ul class="result-list">${wrongGrammar.map(a => `<li>${fillBlanks(a.q, a.answer)}${a.chosen ? ` <span class="muted">— вы выбрали: ${esc(a.chosen)}</span>` : ''}</li>`).join('')}</ul></details>` : ''}
  <button class="btn primary big" data-act="level-done">Готово</button>`;
}

export function screenLevel() {
  if (!state.library) { loadLibrary().then(rerender); return '<div class="spinner"></div>'; }
  if (!L) {
    const d = state.profile.levelDetail;
    return `<header class="top"><a class="icon-btn" href="#/settings" aria-label="Назад">‹</a><h1>Проверка уровня</h1></header>
    <div class="card">
      <p>Около <b>40 вопросов, 5–7 минут</b>: сначала слова, потом грамматика.</p>
      <p>Тест подстраивается под вас: после верных ответов вопросы становятся сложнее, после ошибок — проще. Поэтому если попадаются трудные вопросы, это хороший знак.</p>
      <p>Если не знаете — нажимайте «Не знаю», а не угадывайте: так результат будет точнее.</p>
      <p class="muted small">Сейчас: <b>${esc(state.profile.level)}</b>${d ? ` (слова ${esc(d.vocab)}, грамматика ${esc(d.grammar)})` : ''}.</p>
      <button class="btn primary big" data-act="level-start">Начать</button>
    </div>`;
  }
  if (!L.item) return result();
  const it = L.item;
  const done = L.answers.length;
  const total = PLAN.reduce((a, [, n]) => a + n, 0);
  const prompt = it.sec === 'vocab'
    ? `<h2 class="task-title">Что значит это слово?</h2><div class="prompt-word es">${esc(it.es)} ${sayBtn(it.es)}</div>`
    : `<h2 class="task-title">Выберите, что вставить на место пропуска</h2><div class="gap-sentence" lang="es">${esc(it.q).replace(/___/g, '<span class="blank">___</span>')}</div>`;
  return `<div class="session-top"><button class="icon-btn" data-act="level-quit" aria-label="Выйти">✕</button>
    <div class="progress"><div style="width:${(done / total) * 100}%"></div></div><span class="muted small">${done + 1}/${total}</span></div>
  <div class="task">
    <div class="chip section-chip">${SECTION_TITLE[it.sec]}</div>
    ${prompt}
    <div class="options">
      ${L.options.map((o, i) => `<button class="option" data-act="level-pick" data-i="${i}" lang="${it.sec === 'vocab' ? 'ru' : 'es'}">${esc(o)}</button>`).join('')}
      <button class="option dontknow" data-act="level-pick" data-i="-1">Не знаю</button>
    </div>
  </div>`;
}

export const levelActions = {
  'level-start': async () => { start(await loadLibrary()); rerender(); },
  'level-pick': el => { const i = Number(el.dataset.i); answer(i >= 0 ? L.options[i] : null); },
  'level-quit': () => { if (L.answers.length && !confirm('Выйти из проверки? Результат не сохранится.')) return; L = null; go('settings'); },
  'level-done': () => { L = null; go('home'); },
};

export const levelInSession = () => !!(L && L.item);
