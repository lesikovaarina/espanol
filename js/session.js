// Тренировки: заучивание новых слов, повторение по расписанию, тест и «доучить».
import * as srs from './srs.js';
import * as sp from './speech.js';
import { state, esc, shuffle, go, rerender, saveWords, saveWord, markStudied, updateBadge, checkAnswer, norm, sayBtn, $ } from './core.js';

const ACCENTS = ['á', 'é', 'í', 'ó', 'ú', 'ñ', 'ü', '¿', '¡'];
const BATCH = 6;
const canListen = () => sp.hasVoice();
const isLong = w => w.type !== 'word' || w.es.trim().split(/\s+/).length >= 3;
const clean = s => String(s || '').replace(/\s*\(.*?\)\s*/g, ' ').trim();

// ---------- Построение очереди заданий ----------
function buildLearn(words, withIntro) {
  const tasks = [];
  const groups = [];
  for (let i = 0; i < words.length; i += 3) groups.push(words.slice(i, i + 3));
  for (const g of groups) {
    if (withIntro) g.forEach(w => tasks.push({ kind: 'intro', w }));
    shuffle(g).forEach(w => tasks.push({ kind: 'mc', w, dir: 'es_ru' }));
  }
  shuffle(words).forEach(w => tasks.push({ kind: 'mc', w, dir: 'ru_es' }));
  if (canListen()) shuffle(words).forEach(w => w.type !== 'grammar' && tasks.push({ kind: 'listen', w, dir: 'es_ru' }));
  // длинные слова и фразы собираем из кусочков, короткие пишем сами (ошибка → повтор в виде букв)
  shuffle(words).forEach(w => w.type !== 'grammar' && tasks.push({ kind: isLong(w) ? 'letters' : 'type', w, dir: 'ru_es' }));
  if (words.length >= 3) tasks.push({ kind: 'match', words: shuffle(words).slice(0, 5) });
  return tasks;
}

function reviewKind(w, dir) {
  const st = w.srs[dir].stage;
  if (w.type === 'grammar') return st <= 1 ? 'mc' : 'flash';
  if (dir === 'es_ru') {
    if (st <= 1) return 'mc';
    if (st === 2) return canListen() ? 'listen' : 'mc';
    return 'flash';
  }
  if (st <= 1) return 'mc';
  if (st === 2 || isLong(w)) return 'letters';
  return 'type';
}

function buildReview(words) {
  const items = [];
  for (const w of words) for (const dir of srs.dueDirs(w)) items.push({ w, dir, due: w.srs[dir].due });
  items.sort((a, b) => a.due - b.due);
  return shuffle(items.slice(0, 50)).map(({ w, dir }) => ({ kind: reviewKind(w, dir), w, dir }));
}

function buildTest(words, count) {
  return shuffle(words).slice(0, count || words.length).map(w => {
    const kinds = [{ kind: 'mc', dir: 'es_ru' }, { kind: 'mc', dir: 'ru_es' }];
    if (canListen() && w.type !== 'grammar') kinds.push({ kind: 'listen', dir: 'es_ru' });
    if (!isLong(w)) kinds.push({ kind: 'type', dir: 'ru_es' }, { kind: 'type', dir: 'ru_es' });
    const k = kinds[Math.floor(Math.random() * kinds.length)];
    return { ...k, w };
  });
}

export function startSession(mode, words, opts = {}) {
  let list = words;
  let tasks;
  if (mode === 'learn') { list = words.slice(0, BATCH); tasks = buildLearn(list, true); }
  else if (mode === 'practice') { list = shuffle(words).slice(0, 10); tasks = buildLearn(list, false); }
  else if (mode === 'review') tasks = buildReview(words);
  else tasks = buildTest(words, opts.count);
  if (!tasks.length) return false;
  state.session = { mode, tasks, done: 0, words: list, mistakes: {}, results: [], fb: null, ui: {}, back: opts.back || 'home' };
  go('session');
  return true;
}

// ---------- Отрисовка ----------
function pickDistractors(w, field, n = 3) {
  const seen = new Set([norm(w[field])]);
  const out = [];
  const add = arr => {
    for (const x of shuffle(arr)) {
      if (out.length >= n) return;
      const k = norm(x[field]);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(x[field]);
    }
  };
  const same = state.words.filter(x => x.id !== w.id && x.moduleId === w.moduleId);
  add(same.filter(x => x.type === w.type));
  add(same);
  add(state.words.filter(x => x.id !== w.id && x.type === w.type));
  add(state.words.filter(x => x.id !== w.id));
  if (out.length < n && state.library) add(state.library.folders.flatMap(f => f.words));
  return out;
}

function prompt(t) {
  const w = t.w;
  if (t.dir === 'es_ru') return `<div class="prompt-word es">${esc(clean(w.es))} ${sayBtn(w.es)}</div>`;
  return `<div class="prompt-word">${esc(w.ru)}</div>`;
}

function taskTitle(t, mode) {
  const titles = {
    intro: 'Новое слово',
    mc: t.dir === 'es_ru' ? 'Выберите перевод' : 'Выберите испанское слово',
    listen: 'Послушайте и выберите перевод',
    letters: 'Соберите слово по-испански',
    type: 'Напишите по-испански',
    flash: t.dir === 'es_ru' ? 'Вспомните перевод' : 'Вспомните по-испански',
    match: 'Соедините пары',
  };
  return mode === 'test' && t.kind === 'letters' ? 'Соберите слово' : titles[t.kind];
}

function renderIntro(t) {
  const w = t.w;
  const hint = sp.rioplatenseHint(w.es);
  return `
  <div class="card intro">
    <div class="intro-es">${esc(w.es)} ${sayBtn(w.es)} ${sayBtn(w.es, 'slow').replace('🔊', '🐢').replace('data-act="say"', 'data-act="say" data-slow="1"')}</div>
    <div class="intro-ru">${esc(w.ru)}</div>
    ${w.note ? `<div class="intro-note">${esc(w.note)}</div>` : ''}
    ${w.example ? `<div class="intro-example">«${esc(w.example)}» ${sayBtn(w.example)}</div>` : ''}
    ${w.region && w.region !== 'общее' ? `<span class="chip">${regionLabel(w.region)}</span>` : ''}
    ${hint ? `<div class="intro-hint">💡 ${esc(hint)}</div>` : ''}
  </div>
  <button class="btn primary big" data-act="s-good">Запомнила →</button>`;
}

export const regionLabel = r => ({ AR: '🇦🇷 Аргентина', ES: '🇪🇸 Испания', LatAm: '🌎 Лат. Америка' }[r] || r);

function renderMC(t, S) {
  if (!S.ui.options) {
    const field = t.dir === 'es_ru' ? 'ru' : 'es';
    S.ui.options = shuffle([t.w[field], ...pickDistractors(t.w, field)]);
    S.ui.correct = t.w[field];
  }
  const fb = S.fb;
  const top = t.kind === 'listen'
    ? `<button class="listen-big" data-act="say" data-text="${esc(t.w.es)}">🔊</button><button class="link" data-act="say" data-slow="1" data-text="${esc(t.w.es)}">🐢 медленнее</button>`
    : prompt(t);
  return `${top}
  <div class="options">
    ${S.ui.options.map((o, i) => {
      let cls = '';
      if (fb) { if (o === S.ui.correct) cls = 'right'; else if (i === S.ui.chosen) cls = 'wrong'; }
      return `<button class="option ${cls}" data-act="s-mc" data-i="${i}" ${fb ? 'disabled' : ''}>${esc(t.dir === 'ru_es' ? clean(o) : o)}</button>`;
    }).join('')}
  </div>`;
}

function lettersSetup(t, S) {
  const target = clean(t.w.es);
  const wordsMode = target.split(/\s+/).length >= 3;
  let tokens = wordsMode ? target.split(/\s+/) : [...target.replace(/\s+/g, '')];
  let extras;
  if (wordsMode) {
    const other = pickDistractors(t.w, 'es', 2).flatMap(x => clean(x).split(/\s+/));
    extras = shuffle(other).slice(0, 2);
  } else {
    const pool = 'aeioulnrstcdmpb'.split('').filter(c => !tokens.includes(c));
    extras = shuffle(pool).slice(0, tokens.length > 6 ? 2 : 1);
  }
  S.ui = { target, wordsMode, tokens, tiles: shuffle([...tokens, ...extras]), picked: [] };
}

function renderLetters(t, S) {
  if (!S.ui.tiles) lettersSetup(t, S);
  const u = S.ui;
  const pickedTokens = u.picked.map(i => u.tiles[i]);
  let display;
  if (u.wordsMode) {
    display = pickedTokens.map(esc).join(' ') + (pickedTokens.length < u.tokens.length ? ' <span class="slot">…</span>' : '');
  } else {
    let k = 0;
    display = [...u.target].map(ch => {
      if (/\s/.test(ch)) return '<span class="gap"></span>';
      const c = pickedTokens[k++];
      return c ? `<span class="slot filled">${esc(c)}</span>` : '<span class="slot">_</span>';
    }).join('');
  }
  const fb = S.fb;
  return `${prompt(t)}
  <div class="built ${fb ? fb.result : ''}">${display}</div>
  <div class="tiles">
    ${u.tiles.map((c, i) => `<button class="tile" data-act="s-tile" data-i="${i}" ${u.picked.includes(i) || fb ? 'disabled' : ''}>${esc(c)}</button>`).join('')}
  </div>
  ${fb ? '' : `<div class="row"><button class="btn" data-act="s-untile">⌫ Стереть</button><button class="btn ghost" data-act="s-dontknow">Не знаю</button></div>`}`;
}

function renderType(t, S) {
  const fb = S.fb;
  return `${prompt(t)}
  <form class="type-form" data-form="s-type">
    <input id="ans" class="answer ${fb ? fb.result : ''}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" lang="es"
      placeholder="по-испански…" value="${esc(S.ui.value || '')}" ${fb ? 'disabled' : ''}>
    ${fb ? '' : `<div class="accents">${ACCENTS.map(a => `<button type="button" class="acc" data-act="s-acc" data-c="${a}">${a}</button>`).join('')}</div>
    <div class="row"><button type="button" class="btn ghost" data-act="s-dontknow">Не знаю</button><button class="btn primary" type="submit">Проверить</button></div>`}
  </form>`;
}

function renderFlash(t, S) {
  const w = t.w;
  const front = t.dir === 'es_ru' ? `<div class="prompt-word es">${esc(clean(w.es))} ${sayBtn(w.es)}</div>` : `<div class="prompt-word">${esc(w.ru)}</div>`;
  if (!S.ui.revealed) return `${front}<button class="btn primary big" data-act="s-reveal">Показать ответ</button>`;
  const back = t.dir === 'es_ru' ? esc(w.ru) : `${esc(w.es)} ${sayBtn(w.es)}`;
  return `${front}
  <div class="card reveal"><div class="intro-ru">${back}</div>${w.note ? `<div class="intro-note">${esc(w.note)}</div>` : ''}${w.example ? `<div class="intro-example">«${esc(w.example)}»</div>` : ''}</div>
  <div class="grade-row">
    <button class="btn bad" data-act="s-flash" data-r="bad">Не вспомнила</button>
    <button class="btn almost" data-act="s-flash" data-r="almost">С трудом</button>
    <button class="btn good" data-act="s-flash" data-r="good">Помню</button>
  </div>`;
}

function renderMatch(t, S) {
  if (!S.ui.left) S.ui = { left: shuffle(t.words), right: shuffle(t.words), sel: null, done: [], wrong: null };
  const u = S.ui;
  const cell = (w, side) => {
    const done = u.done.includes(w.id);
    const sel = side === 'l' && u.sel === w.id;
    const wrong = u.wrong && u.wrong[side] === w.id;
    return `<button class="match ${done ? 'done' : ''} ${sel ? 'sel' : ''} ${wrong ? 'wrong' : ''}" data-act="s-match" data-side="${side}" data-id="${w.id}" ${done ? 'disabled' : ''}>${esc(side === 'l' ? clean(w.es) : w.ru)}</button>`;
  };
  return `<div class="match-grid"><div>${u.left.map(w => cell(w, 'l')).join('')}</div><div>${u.right.map(w => cell(w, 'r')).join('')}</div></div>`;
}

function feedback(S, t) {
  const fb = S.fb;
  if (!fb || S.mode === 'test' || t.kind === 'intro' || t.kind === 'match' || t.kind === 'flash') return '';
  const answer = t.dir === 'es_ru' ? `${esc(t.w.ru)}` : `${esc(t.w.es)}`;
  const msg = fb.result === 'good' ? '✓ Верно!' : fb.result === 'almost' ? `≈ ${esc(fb.hint || 'Почти!')}` : '✗ Неверно';
  return `<div class="feedback ${fb.result}">
    <div class="fb-msg">${msg}</div>
    ${fb.result !== 'good' ? `<div class="fb-answer">Правильно: <b>${answer}</b></div>` : ''}
    <div class="fb-answer muted">${esc(t.w.es)} — ${esc(t.w.ru)} ${sayBtn(t.w.es)}</div>
    <button class="btn primary big" data-act="s-next">Дальше →</button>
  </div>`;
}

export function renderSession() {
  const S = state.session;
  if (!S) { go('home'); return ''; }
  const t = S.tasks[0];
  if (!t) return renderFinish(S);
  const total = S.done + S.tasks.length;
  const pct = Math.round((S.done / total) * 100);
  const label = S.mode === 'test' ? `Вопрос ${S.done + 1} из ${total}` : `${S.done} / ${total}`;
  let body = '';
  if (t.kind === 'intro') body = renderIntro(t);
  else if (t.kind === 'mc' || t.kind === 'listen') body = renderMC(t, S);
  else if (t.kind === 'letters') body = renderLetters(t, S);
  else if (t.kind === 'type') body = renderType(t, S);
  else if (t.kind === 'flash') body = renderFlash(t, S);
  else if (t.kind === 'match') body = renderMatch(t, S);
  return `
  <div class="session-top">
    <button class="icon-btn" data-act="s-quit" aria-label="Выйти">✕</button>
    <div class="progress"><div style="width:${pct}%"></div></div>
    <span class="muted small">${label}</span>
  </div>
  <div class="task">
    <h2 class="task-title">${taskTitle(t, S.mode)}</h2>
    ${body}
    ${feedback(S, t)}
  </div>`;
}

export function afterRenderSession() {
  const S = state.session;
  const t = S?.tasks[0];
  if (!t || S.fb) return;
  const accent = state.profile.accent;
  if (t.kind === 'intro' || (t.kind === 'listen' && !S.ui.spoken)) {
    S.ui.spoken = true;
    setTimeout(() => sp.speak(t.w.es, { accent }), 250);
  }
  if (t.kind === 'type') $('#ans')?.focus();
}

// ---------- Ответы ----------
async function answer(result, extra = {}) {
  const S = state.session;
  const t = S.tasks[0];
  if (S.mode === 'test') {
    S.results.push({ w: t.w, dir: t.dir, kind: t.kind, result, given: extra.given });
    next();
    return;
  }
  if (t.kind !== 'intro' && t.dir && result === 'bad') {
    S.mistakes[t.w.id] = { ...(S.mistakes[t.w.id] || {}), [t.dir]: true };
  }
  if (S.mode === 'review' && t.dir && !t.retry) {
    // берём свежую версию слова: в сессии оба направления одного слова — разные задания
    const cur = state.words.find(x => x.id === t.w.id) || t.w;
    const w = { ...cur, srs: { ...cur.srs, [t.dir]: srs.grade(cur.srs[t.dir], result) } };
    S.results.push({ w, dir: t.dir, result });
    t.w = w;
    await saveWord(w);
  }
  if (result === 'bad' && t.kind !== 'intro') {
    const retryKind = t.kind === 'type' ? 'letters' : t.kind;
    S.tasks.splice(Math.min(3, S.tasks.length), 0, { ...t, kind: retryKind, retry: true });
  }
  if (t.kind === 'intro') { next(); return; }
  if (t.kind === 'flash') { next(); return; }
  S.fb = { result, hint: extra.hint };
  rerender();
  if (result === 'good') {
    const shownTask = t;
    setTimeout(() => { if (state.session === S && S.tasks[0] === shownTask && S.fb) next(); }, 750);
  }
}

function next() {
  const S = state.session;
  if (!S) return;
  S.tasks.shift();
  S.done += 1;
  S.fb = null;
  S.ui = {};
  rerender();
}

// ---------- Итоги ----------
function renderFinish(S) {
  if (!S.finished) { S.finished = true; S.summary = summarize(S); finish(S); }
  const r = S.summary || {};
  let html = '';
  if (S.mode === 'learn') {
    html = `<div class="big-emoji">🎉</div><h2>Новых слов: ${S.words.length}</h2>
      <p class="muted">Первое повторение — примерно через 4 часа. Потом интервалы будут расти: 1 день, 3 дня, неделя…</p>
      <ul class="result-list">${S.words.map(w => `<li><b>${esc(w.es)}</b> — ${esc(w.ru)}</li>`).join('')}</ul>`;
  } else if (S.mode === 'review') {
    html = `<div class="big-emoji">✅</div><h2>Повторение готово</h2>
      <p>С первого раза верно: <b>${r.good}</b> из ${r.total}</p>
      ${r.bad ? `<p class="muted">Слова с ошибками вернутся на повторение через несколько часов.</p>` : ''}`;
  } else if (S.mode === 'practice') {
    html = `<div class="big-emoji">💪</div><h2>Тренировка готова</h2><p class="muted">Расписание повторений не менялось.</p>`;
  } else {
    html = `<div class="big-emoji">${r.pct >= 80 ? '🏆' : r.pct >= 50 ? '👍' : '📚'}</div>
      <h2>Результат: ${r.pct}%</h2><p>${r.right} из ${r.total} верно</p>
      ${r.wrong.length ? `<h3>Ошибки</h3><ul class="result-list">${r.wrong.map(x => `<li><b>${esc(x.w.es)}</b> — ${esc(x.w.ru)}${x.given ? ` <span class="muted">(ваш ответ: ${esc(x.given)})</span>` : ''}</li>`).join('')}</ul>
      <button class="btn primary big" data-act="s-fix">Доучить ошибки</button>` : ''}`;
  }
  return `<div class="finish">${html}<button class="btn big" data-act="s-home">Готово</button></div>`;
}

function summarize(S) {
  if (S.mode === 'review') {
    const good = S.results.filter(x => x.result !== 'bad').length;
    return { good, total: S.results.length, bad: S.results.length - good };
  }
  if (S.mode === 'test') {
    const right = S.results.filter(x => x.result !== 'bad').length;
    const wrong = S.results.filter(x => x.result === 'bad');
    return { right, total: S.results.length, pct: Math.round((right / Math.max(1, S.results.length)) * 100), wrong };
  }
  return {};
}

async function finish(S) {
  if (S.mode === 'learn') {
    const updated = S.words.map(w0 => {
      const w = state.words.find(x => x.id === w0.id) || w0;
      const s = { ...w.srs };
      for (const d of srs.DIRS) s[d] = srs.grade(s[d], S.mistakes[w.id]?.[d] ? 'bad' : 'good');
      return { ...w, srs: s };
    });
    await saveWords(updated);
  } else if (S.mode === 'test') {
    const t = srs.now();
    const updated = [];
    for (const x of S.results) {
      const w = state.words.find(y => y.id === x.w.id);
      if (!w) continue;
      const card = w.srs[x.dir];
      const fresh = card.reps === 0;
      if (x.result === 'bad' || fresh || card.due <= t) {
        updated.push({ ...w, srs: { ...w.srs, [x.dir]: srs.grade(card, x.result) } });
      }
    }
    await saveWords(updated);
  }
  if (S.mode !== 'practice') await markStudied();
  updateBadge();
}

// ---------- Действия ----------
export const sessionActions = {
  's-good': () => answer('good'),
  's-next': () => next(),
  's-quit': () => {
    const S = state.session;
    if (S && S.mode === 'learn' && S.done > 0 && !confirm('Выйти? Прогресс этой сессии заучивания не сохранится.')) return;
    const back = S?.back || 'home';
    state.session = null;
    go(back);
  },
  's-home': () => { const back = state.session?.back || 'home'; state.session = null; go(back); },
  's-fix': () => {
    const words = state.session.summary.wrong.map(x => state.words.find(w => w.id === x.w.id)).filter(Boolean);
    const uniq = [...new Map(words.map(w => [w.id, w])).values()];
    startSession('practice', uniq, { back: state.session.back });
  },
  's-mc': el => {
    const S = state.session;
    if (S.fb) return;
    const i = Number(el.dataset.i);
    S.ui.chosen = i;
    const ok = S.ui.options[i] === S.ui.correct;
    answer(ok ? 'good' : 'bad', { given: S.ui.options[i] });
  },
  's-tile': el => {
    const S = state.session;
    const u = S.ui;
    if (S.fb) return;
    u.picked.push(Number(el.dataset.i));
    if (u.picked.length === u.tokens.length) {
      const got = u.picked.map(i => u.tiles[i]).join(u.wordsMode ? ' ' : '').toLowerCase();
      const want = u.tokens.join(u.wordsMode ? ' ' : '').toLowerCase();
      answer(got === want ? 'good' : 'bad', { given: u.picked.map(i => u.tiles[i]).join(u.wordsMode ? ' ' : '') });
    } else rerender();
  },
  's-untile': () => { state.session.ui.picked.pop(); rerender(); },
  's-dontknow': () => answer('bad', { given: '—' }),
  's-acc': el => {
    const input = $('#ans');
    if (!input) return;
    const s = input.selectionStart ?? input.value.length;
    const e = input.selectionEnd ?? s;
    input.value = input.value.slice(0, s) + el.dataset.c + input.value.slice(e);
    input.focus();
    input.setSelectionRange(s + 1, s + 1);
  },
  's-reveal': () => { state.session.ui.revealed = true; rerender(); },
  's-flash': el => answer(el.dataset.r),
  's-match': el => {
    const S = state.session;
    const u = S.ui;
    const id = el.dataset.id;
    if (el.dataset.side === 'l') { u.sel = id; u.wrong = null; rerender(); return; }
    if (!u.sel) return;
    if (u.sel === id) {
      u.done.push(id);
      u.sel = null;
      const w = S.tasks[0].words.find(x => x.id === id);
      if (w) sp.speak(w.es, { accent: state.profile.accent });
      if (u.done.length === u.left.length) { setTimeout(() => next(), 400); }
      rerender();
    } else {
      u.wrong = { l: u.sel, r: id };
      u.sel = null;
      rerender();
      setTimeout(() => { if (state.session === S) { u.wrong = null; rerender(); } }, 600);
    }
  },
};

export const sessionForms = {
  's-type': () => {
    const S = state.session;
    if (S.fb) return;
    const val = $('#ans').value;
    S.ui.value = val;
    const t = S.tasks[0];
    const { result, hint } = checkAnswer(val, t.w.es);
    answer(result, { hint, given: val });
  },
};
