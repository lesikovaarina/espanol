// Экраны, навигация и действия.
import { db, uid } from './db.js';
import * as srs from './srs.js';
import * as gem from './gemini.js';
import * as sp from './speech.js';
import {
  state, loadAll, loadLibrary, saveProfile, saveWord, saveWords, deleteWords, createModule, saveModule, deleteModule,
  makeWord, moduleWords, moduleById, currentStreak, updateBadge, esc, $, $$, shuffle, setRenderer, rerender, go,
  toast, modal, closeModal, loading, sayBtn, isIOS, isStandalone, norm, localParse,
} from './core.js';
import { startSession, renderSession, afterRenderSession, sessionActions, sessionForms, regionLabel } from './session.js';
import { screenLevel, levelActions, levelInSession } from './level.js';

const view = () => document.getElementById('view');
const NAV = [
  ['home', '🏠', 'Главная'],
  ['learn', '🧠', 'Учить'],
  ['review', '🔁', 'Повторить'],
  ['test', '📝', 'Тест'],
  ['words', '📚', 'Слова'],
];

const STATUS_COLORS = { new: 'var(--s-new)', learning: 'var(--s-learning)', known: 'var(--s-known)', learned: 'var(--s-learned)' };

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
const words = n => `${n} ${plural(n, 'слово', 'слова', 'слов')}`;

// ---------- Роутинг ----------
function parseRoute() {
  const [name = 'home', ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: name || 'home', arg: rest.join('/') ? decodeURIComponent(rest.join('/')) : '' };
}

function render() {
  const { name, arg } = parseRoute();
  const inSession = name === 'session' || (name === 'level' && levelInSession());
  closeModal();
  document.body.classList.toggle('in-session', inSession);
  const screens = {
    home: screenHome, learn: screenLearn, review: screenReview, test: screenTest, words: screenWords,
    module: () => screenModule(arg), add: () => screenAdd(arg), import: screenImport, library: () => screenLibrary(arg),
    settings: screenSettings, level: screenLevel, session: renderSession,
  };
  const fn = screens[name] || screenHome;
  view().innerHTML = fn();
  $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.r === name || (name === 'module' && a.dataset.r === 'words')));
  const due = srs.stats(state.words).due;
  const badge = $('#nav .badge');
  if (badge) { badge.textContent = due; badge.hidden = !due; }
  if (inSession) afterRenderSession();
  if (!inSession) window.scrollTo(0, 0);
}

function header(title, { back, right = '' } = {}) {
  return `<header class="top">
    ${back ? `<a class="icon-btn" href="#/${back}" aria-label="Назад">‹</a>` : ''}
    <h1>${title}</h1>
    <div class="top-right">${right}</div>
  </header>`;
}
const gear = `<a class="icon-btn" href="#/settings" aria-label="Настройки">⚙️</a>`;

// ---------- Главная ----------
function screenHome() {
  const s = srs.stats(state.words);
  const p = state.profile;
  const streak = currentStreak();
  const banners = [];

  if (isIOS() && !isStandalone() && !p.installDismissed) {
    banners.push(`<div class="banner info">
      <b>Установите приложение на экран «Домой»</b>
      <p>Так оно открывается как обычное приложение, а iPhone не сотрёт ваши слова. Нажмите <b>Поделиться</b> <span class="ios-share">⬆︎</span> внизу Safari → <b>На экран «Домой»</b>.</p>
      <button class="link" data-act="dismiss" data-k="installDismissed">Понятно</button></div>`);
  }
  if (state.words.length && Date.now() - (p.lastBackupAt || 0) > 14 * srs.D) {
    banners.push(`<div class="banner warn"><b>Сделайте резервную копию</b>
      <p>Слова хранятся только на этом телефоне. Копия поможет не потерять их.</p>
      <button class="btn small" data-act="export">Скачать копию</button></div>`);
  }

  if (!state.words.length) {
    return `${header('¡Hola! 👋', { right: gear })}
    ${banners.join('')}
    <section class="card welcome">
      <h2>С чего начнём?</h2>
      <p class="muted">Ваш уровень: <b>${esc(p.level)}</b>. Слова будут в аргентинском варианте испанского.</p>
      <a class="btn primary big" href="#/add/photo">📷 Добавить слова из тетради</a>
      <a class="btn big" href="#/add/list">✏️ Вписать слова</a>
      <a class="btn big" href="#/library">📦 Готовые папки уровня B1</a>
      <a class="link" href="#/level">Проверить уровень заново</a>
    </section>`;
  }

  const next = state.words.filter(w => !srs.isNew(w)).map(w => Math.min(...srs.DIRS.map(d => w.srs[d].due))).sort((a, b) => a - b)[0];
  const fc = srs.forecast(state.words);
  const fcMax = Math.max(1, ...fc.map(x => x.count));
  const days = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const seg = k => s.total ? (s[k] / s.total) * 100 : 0;

  return `${header('Мой испанский', { right: gear })}
  ${banners.join('')}
  <section class="card hero">
    <div class="hero-num"><span class="num">${s.learned}</span><span class="of">из ${s.total}</span></div>
    <div class="hero-label">${plural(s.learned, 'слово выучено', 'слова выучено', 'слов выучено')}</div>
    <div class="stack-bar" role="img" aria-label="Прогресс по статусам">
      ${['learned', 'known', 'learning', 'new'].map(k => `<div style="width:${seg(k)}%;background:${STATUS_COLORS[k]}"></div>`).join('')}
    </div>
    <div class="legend">
      <span><i style="background:var(--s-learned)"></i>выучено ${s.learned}</span>
      <span><i style="background:var(--s-known)"></i>знакомо ${s.known}</span>
      <span><i style="background:var(--s-learning)"></i>учу ${s.learning}</span>
      <span><i style="background:var(--s-new)"></i>новые ${s.new}</span>
    </div>
    ${streak ? `<div class="streak">🔥 ${streak} ${plural(streak, 'день', 'дня', 'дней')} подряд</div>` : ''}
  </section>

  ${s.due
    ? `<a class="btn primary big due-btn" href="#/review">🔁 Повторить ${words(s.due)}<small>сейчас самое время, пока не забылось</small></a>`
    : `<div class="card done-today">✓ Всё повторено${next ? `. Следующее повторение ${whenText(next)}` : ''}</div>`}
  ${s.new ? `<a class="btn big" href="#/learn">🧠 Учить новые (${s.new})</a>` : `<a class="btn big" href="#/library">📦 Взять слова из готовых папок</a>`}
  <a class="btn big" href="#/add">＋ Добавить слова</a>

  <section class="card">
    <h3>Повторения на неделю</h3>
    <div class="forecast">
      ${fc.map((x, i) => `<div class="fc-col"><span class="fc-n">${x.count || ''}</span><div class="fc-bar" style="height:${(x.count / fcMax) * 60 + 2}px"></div><span class="fc-d">${i === 0 ? 'сег' : days[x.day.getDay()]}</span></div>`).join('')}
    </div>
  </section>

  <section>
    <h3 class="section-title">Модули</h3>
    ${moduleList()}
  </section>`;
}

function whenText(t) {
  const diff = t - srs.now();
  if (diff <= 0) return 'сейчас';
  if (diff < srs.D) return `через ${srs.humanInterval(diff)}`;
  const d = new Date(t);
  return `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`;
}

function moduleList() {
  const rows = state.modules.map(m => {
    const ws = moduleWords(m.id);
    const st = srs.stats(ws);
    const pct = ws.length ? Math.round(((st.learned + st.known * 0.5) / ws.length) * 100) : 0;
    return `<a class="mod-row" href="#/module/${m.id}">
      <div class="mod-main"><b>${esc(m.name)}</b><span class="muted small">${words(ws.length)} · выучено ${st.learned}${st.due ? ` · <span class="due-dot">к повторению ${st.due}</span>` : ''}</span></div>
      <div class="ring" style="--p:${pct}"><span>${pct}%</span></div>
    </a>`;
  });
  const loose = moduleWords('none');
  if (loose.length) rows.push(`<a class="mod-row" href="#/module/none"><div class="mod-main"><b>Без модуля</b><span class="muted small">${words(loose.length)}</span></div></a>`);
  return rows.length ? `<div class="list">${rows.join('')}</div>` : '<p class="muted">Пока нет модулей.</p>';
}

// ---------- Учить ----------
function screenLearn() {
  const allNew = state.words.filter(srs.isNew);
  const rows = state.modules.map(m => {
    const n = moduleWords(m.id).filter(srs.isNew).length;
    return n ? `<button class="mod-row" data-act="learn" data-m="${m.id}"><div class="mod-main"><b>${esc(m.name)}</b><span class="muted small">новых: ${n}</span></div><span class="chev">›</span></button>` : '';
  }).join('');
  return `${header('Учить новые слова', { right: gear })}
  ${allNew.length ? `
    <p class="muted">За раз — до 6 слов: знакомство, выбор перевода, на слух, собрать из букв, написать самой и пары.</p>
    <button class="btn primary big" data-act="learn" data-m="all">Все новые слова (${allNew.length})</button>
    <h3 class="section-title">Или из модуля</h3>
    <div class="list">${rows}</div>`
  : `<div class="card empty"><p>Новых слов нет 🎉</p>
     <a class="btn primary" href="#/add">＋ Добавить слова</a> <a class="btn" href="#/library">📦 Готовые папки</a></div>`}`;
}

// ---------- Повторить ----------
function screenReview() {
  const s = srs.stats(state.words);
  const learning = state.words.filter(w => !srs.isNew(w));
  return `${header('Повторение', { right: gear })}
  ${s.due ? `
    <div class="card"><p>Пора повторить <b>${words(s.due)}</b>.</p>
    <p class="muted small">Слово показывается как раз тогда, когда начинает забываться. После каждого верного ответа следующий раз будет позже: 4 ч → 1 день → 3 дня → неделя → 2 недели → месяц…</p></div>
    <button class="btn primary big" data-act="review">Начать повторение</button>`
  : `<div class="card empty"><p>✓ Сейчас повторять нечего.</p>
     <p class="muted small">Загляните позже — приложение подскажет на главной, когда слова начнут забываться.</p></div>
     ${learning.length ? `<button class="btn big" data-act="practice-all">Потренироваться всё равно</button><p class="muted small center">Без влияния на расписание.</p>` : ''}`}`;
}

// ---------- Тест ----------
function screenTest() {
  const mods = state.modules.filter(m => moduleWords(m.id).length);
  if (!state.words.length) return `${header('Тест')}<div class="card empty"><p>Сначала добавьте слова.</p><a class="btn primary" href="#/add">＋ Добавить</a></div>`;
  return `${header('Тест', { right: gear })}
  <p class="muted">Смешанные вопросы без подсказок. Результат покажу в конце, а ошибки можно будет сразу доучить.</p>
  <form data-form="test" class="card">
    <h3>Модули</h3>
    <label class="check"><input type="checkbox" name="m" value="all" checked> Все слова (${state.words.length})</label>
    ${mods.map(m => `<label class="check"><input type="checkbox" name="m" value="${m.id}"> ${esc(m.name)} (${moduleWords(m.id).length})</label>`).join('')}
    <h3>Количество вопросов</h3>
    <div class="seg">${[10, 20, 0].map((n, i) => `<label><input type="radio" name="n" value="${n}" ${i === 0 ? 'checked' : ''}><span>${n || 'все'}</span></label>`).join('')}</div>
    <button class="btn primary big" type="submit">Начать тест</button>
  </form>`;
}

// ---------- Слова и модули ----------
function screenWords() {
  return `${header('Мои слова', { right: gear })}
  <div class="row"><a class="btn primary" href="#/add">＋ Добавить</a><a class="btn" href="#/library">📦 Готовые папки</a></div>
  <input class="search" type="search" placeholder="Поиск по всем словам…" data-input="search" value="${esc(state.search || '')}">
  <div id="search-results">${state.search ? searchResults(state.search) : moduleList()}</div>`;
}

function searchResults(q) {
  const nq = norm(q);
  const found = state.words.filter(w => norm(w.es).includes(nq) || norm(w.ru).includes(nq)).slice(0, 100);
  return found.length ? `<div class="list">${found.map(wordRow).join('')}</div>` : '<p class="muted">Ничего не найдено.</p>';
}

function wordRow(w) {
  const st = srs.status(w);
  return `<div class="word-row" data-act="edit-word" data-id="${w.id}">
    <i class="dot" style="background:${STATUS_COLORS[st]}" title="${srs.STATUS_LABEL[st]}"></i>
    <div class="word-main"><b>${esc(w.es)}</b><span>${esc(w.ru)}</span>${w.note ? `<span class="muted small">${esc(w.note)}</span>` : ''}</div>
    ${sayBtn(w.es)}
  </div>`;
}

function screenModule(id) {
  const m = id === 'none' ? { id: 'none', name: 'Без модуля' } : moduleById(id);
  if (!m) return screenWords();
  const ws = moduleWords(id).sort((a, b) => a.createdAt - b.createdAt);
  const st = srs.stats(ws);
  const menu = id === 'none' ? '' : `<button class="icon-btn" data-act="module-menu" data-id="${id}" aria-label="Действия">⋯</button>`;
  return `${header(esc(m.name), { back: 'words', right: menu })}
  <p class="muted">${words(ws.length)} · выучено ${st.learned} · знакомо ${st.known} · учу ${st.learning} · новых ${st.new}</p>
  <div class="row wrap">
    ${st.new ? `<button class="btn primary" data-act="learn" data-m="${id}">🧠 Учить новые (${st.new})</button>` : ''}
    ${st.due ? `<button class="btn" data-act="review" data-m="${id}">🔁 Повторить (${st.due})</button>` : ''}
    ${ws.length >= 2 ? `<button class="btn" data-act="practice" data-m="${id}">💪 Тренировка</button>` : ''}
    ${ws.length >= 2 ? `<button class="btn" data-act="test-module" data-m="${id}">📝 Тест</button>` : ''}
  </div>
  <div class="list">${ws.map(wordRow).join('') || '<p class="muted">Слов пока нет.</p>'}</div>
  ${id === 'none' ? '' : `<a class="btn" href="#/add/word?m=${id}">＋ Слово в этот модуль</a>`}`;
}

function editWordModal(id) {
  const w = state.words.find(x => x.id === id);
  if (!w) return;
  const st = srs.status(w);
  modal(`
  <h2>Слово</h2>
  <form data-form="edit-word" data-id="${w.id}" class="form">
    <label>Испанский <input name="es" value="${esc(w.es)}" required lang="es" autocapitalize="off"></label>
    <label>Перевод <input name="ru" value="${esc(w.ru)}"></label>
    <label>Заметка <input name="note" value="${esc(w.note)}"></label>
    <label>Пример <input name="example" value="${esc(w.example)}" lang="es"></label>
    <label>Модуль <select name="moduleId">${moduleOptions(w.moduleId)}</select></label>
    <p class="muted small">Статус: <b>${srs.STATUS_LABEL[st]}</b>${!srs.isNew(w) ? ` · ES→RU через ${srs.humanInterval(w.srs.es_ru.interval)}, RU→ES через ${srs.humanInterval(w.srs.ru_es.interval)}` : ''}</p>
    <div class="row"><button class="btn primary" type="submit">Сохранить</button><button type="button" class="btn ghost" data-act="close-modal">Отмена</button></div>
    <div class="row"><button type="button" class="link" data-act="reset-word" data-id="${w.id}">Начать учить заново</button><button type="button" class="link danger" data-act="delete-word" data-id="${w.id}">Удалить слово</button></div>
  </form>`);
}

function moduleOptions(selected) {
  return `<option value="">— без модуля —</option>` + state.modules.map(m => `<option value="${m.id}" ${m.id === selected ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
}

// ---------- Добавление слов ----------
function screenAdd(arg) {
  const [tab0, query] = (arg || 'photo').split('?');
  const tab = ['photo', 'word', 'list'].includes(tab0) ? tab0 : 'photo';
  const presetModule = new URLSearchParams(query || '').get('m') || '';
  const hasKey = !!state.profile.geminiKey;
  const tabs = [['photo', '📷 Фото'], ['word', '✏️ Слово'], ['list', '📋 Списком']];
  const keyNote = hasKey ? '' : `<div class="banner info"><b>Нужен ключ Gemini</b><p>Чтобы распознавать фото и проверять слова, один раз добавьте бесплатный ключ.</p><a class="btn small" href="#/settings">Как получить ключ</a></div>`;
  let body = '';
  if (tab === 'photo') {
    body = `${keyNote}
    <form data-form="photo" class="card form">
      <p class="muted">Сфотографируйте страницы тетради. Можно несколько фото сразу. Gemini распознает слова, исправит ошибки и допишет переводы.</p>
      <label class="file-drop"><input type="file" name="files" accept="image/*" multiple data-input="photo-preview"><span>📷 Сфотографировать или выбрать фото</span></label>
      <div id="previews" class="previews"></div>
      <button class="btn primary big" type="submit" ${hasKey ? '' : 'disabled'}>Распознать</button>
    </form>`;
  } else if (tab === 'word') {
    body = `<form data-form="one-word" class="card form">
      <label>Испанский <input name="es" required lang="es" autocapitalize="off" autocomplete="off" placeholder="la mesa"></label>
      <label>Перевод <input name="ru" autocomplete="off" placeholder="${hasKey ? 'можно оставить пустым — переведу' : 'стол'}"></label>
      <label>Заметка <input name="note" autocomplete="off" placeholder="необязательно"></label>
      <label>Модуль <select name="moduleId">${moduleOptions(presetModule)}</select></label>
      <div class="row">
        ${hasKey ? '<button class="btn primary" type="submit" name="mode" value="ai">Проверить и сохранить</button>' : ''}
        <button class="btn ${hasKey ? '' : 'primary'}" type="submit" name="mode" value="plain">Сохранить как есть</button>
      </div>
    </form>`;
  } else {
    body = `<form data-form="list" class="card form">
      <p class="muted">Каждое слово с новой строки, формат любой: <code>mesa - стол</code>, <code>el perro собака</code>, <code>tal vez: может быть</code>.</p>
      <textarea name="text" rows="10" lang="es" placeholder="aprovechar - воспользоваться&#10;la huelga - забастовка&#10;agotador"></textarea>
      <div class="row">
        ${hasKey ? '<button class="btn primary" type="submit" name="mode" value="ai">Разобрать и проверить</button>' : ''}
        <button class="btn ${hasKey ? '' : 'primary'}" type="submit" name="mode" value="plain">Без проверки</button>
      </div>
    </form>`;
  }
  return `${header('Добавить слова', { right: gear })}
  <nav class="tabs">${tabs.map(([k, l]) => `<a href="#/add/${k}" class="${k === tab ? 'active' : ''}">${l}</a>`).join('')}</nav>
  ${body}
  <a class="btn" href="#/library">📦 Или взять из готовых папок</a>`;
}

function setPending(result, source, extra = {}) {
  const existing = new Set(state.words.map(w => norm(w.es)));
  const items = (result.items || []).map(it => {
    const dup = existing.has(norm(it.es));
    return { ...it, include: !dup && !(it.unreadable && !it.ru), dup };
  });
  state.pending = { items, moduleName: result.moduleName || extra.moduleName || '', skipped: result.skipped || [], source, moduleId: extra.moduleId || '' };
  go('import');
}

function screenImport() {
  const P = state.pending;
  if (!P) return screenAdd();
  const n = P.items.filter(x => x.include).length;
  return `${header('Проверьте слова', { back: 'add' })}
  <p class="muted">Исправления подсвечены. Поправьте, если нужно, и снимите галочки со строк, которые не нужны.</p>
  <form data-form="import" class="form">
    <div class="import-list">
    ${P.items.map((it, i) => `
      <div class="import-row ${it.corrected ? 'corrected' : ''} ${it.unreadable ? 'unreadable' : ''} ${it.include ? '' : 'off'}" data-i="${i}">
        <label class="inc"><input type="checkbox" data-input="inc" data-i="${i}" ${it.include ? 'checked' : ''}></label>
        <div class="import-fields">
          <div class="pair ${(it.es || '').length > 18 || it.type === 'phrase' ? 'stack' : ''}">
            <input data-input="field" data-f="es" data-i="${i}" value="${esc(it.es)}" lang="es" autocapitalize="off" aria-label="Испанский">
            <input data-input="field" data-f="ru" data-i="${i}" value="${esc(it.ru)}" aria-label="Перевод" placeholder="перевод">
          </div>
          <input class="note-input" data-input="field" data-f="note" data-i="${i}" value="${esc(it.note || '')}" placeholder="заметка" aria-label="Заметка">
          <div class="chips">
            ${it.unreadable ? '<span class="chip warn">❓ не удалось прочитать — проверьте</span>' : ''}
            ${it.dup ? '<span class="chip">уже есть в ваших словах</span>' : ''}
            ${it.type === 'phrase' ? '<span class="chip">фраза</span>' : it.type === 'grammar' ? '<span class="chip">грамматика</span>' : ''}
            ${it.region && it.region !== 'общее' ? `<span class="chip">${regionLabel(it.region)}</span>` : ''}
          </div>
          ${it.corrected && it.correctionNote ? `<div class="correction">✏️ ${esc(it.correctionNote)}${it.original ? ` <span class="muted">(было: ${esc(it.original)})</span>` : ''}</div>` : ''}
          ${it.example ? `<div class="muted small">«${esc(it.example)}»</div>` : ''}
        </div>
      </div>`).join('')}
    </div>
    <button class="btn" type="button" data-act="import-add-row">＋ Добавить слово вручную</button>
    ${P.skipped.length ? `<p class="muted small">Не добавлено (не слова): ${P.skipped.map(esc).join('; ')}</p>` : ''}
    <div class="card">
      <label>Сохранить в модуль
        <select name="moduleId" data-input="mod-select">
          <option value="__new" ${P.moduleId ? '' : 'selected'}>➕ Новый модуль</option>
          ${state.modules.map(m => `<option value="${m.id}" ${m.id === P.moduleId ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
        </select>
      </label>
      <label id="new-mod-name" ${P.moduleId ? 'hidden' : ''}>Название нового модуля <input name="moduleName" value="${esc(P.moduleName || defaultModuleName())}"></label>
      <button class="btn primary big" type="submit">Сохранить ${words(n)}</button>
      <button class="btn ghost" type="button" data-act="cancel-import">Отмена</button>
    </div>
  </form>`;
}

const defaultModuleName = () => 'Занятие ' + new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

// ---------- Библиотека ----------
function screenLibrary(fid) {
  const lib = state.library;
  if (!lib) { loadLibrary().then(rerender); return `${header('Готовые папки', { back: 'words' })}<div class="spinner"></div>`; }
  const added = new Set(state.modules.map(m => m.libId).filter(Boolean));
  if (fid) {
    const f = lib.folders.find(x => x.id === fid);
    if (!f) return screenLibrary('');
    const have = new Set(state.words.map(w => norm(w.es)));
    const ws = f.words.filter(w => !have.has(norm(w.es)));
    return `${header(esc(f.name), { back: 'library' })}
    <p class="muted">${esc(f.level)} · ${words(f.words.length)}${ws.length < f.words.length ? ` · ${f.words.length - ws.length} уже есть у вас` : ''}</p>
    <p class="small">Отметьте слова, которые <b>уже знаете</b>: они не будут учиться как новые, а сразу пойдут в повторение.</p>
    <form data-form="lib-add" data-id="${f.id}" class="form">
      <div class="list">
        ${ws.map((w, i) => `<label class="lib-word"><input type="checkbox" name="known" value="${i}"><div><b>${esc(w.es)}</b> — ${esc(w.ru)}${w.note ? `<div class="muted small">${esc(w.note)}</div>` : ''}</div>${sayBtn(w.es)}</label>`).join('')}
      </div>
      ${ws.length ? `<button class="btn primary big sticky" type="submit">Добавить в мои модули</button>` : '<p>Все слова этой папки у вас уже есть.</p>'}
    </form>`;
  }
  return `${header('Готовые папки', { back: 'words', right: gear })}
  <p class="muted">Подобраны под ваш уровень (${esc(state.profile.level)}), в аргентинском варианте, с примерами на vos.</p>
  <div class="list">
    ${lib.folders.map(f => `<a class="mod-row" href="#/library/${f.id}"><div class="mod-main"><b>${f.emoji || '📁'} ${esc(f.name)}</b><span class="muted small">${esc(f.level)} · ${words(f.words.length)}${added.has(f.id) ? ' · ✓ добавлена' : ''}</span></div><span class="chev">›</span></a>`).join('')}
  </div>
  <form data-form="more" class="card form">
    <h3>Ещё слова по теме</h3>
    <p class="muted small">Gemini подберёт 20 слов вашего уровня по любой теме, без тех, что у вас уже есть.</p>
    <input name="topic" placeholder="например: кино, эмоции, кухня, политика" required>
    <button class="btn primary" type="submit" ${state.profile.geminiKey ? '' : 'disabled'}>Подобрать слова</button>
    ${state.profile.geminiKey ? '' : '<p class="muted small">Нужен ключ Gemini — <a href="#/settings">добавить</a>.</p>'}
  </form>`;
}

// ---------- Настройки ----------
function screenSettings() {
  const p = state.profile;
  const voice = sp.voiceName(p.accent);
  return `${header('Настройки', { back: 'home' })}
  <section class="card form">
    <h3>Ключ Gemini (бесплатно)</h3>
    <p class="muted small">Нужен для распознавания фото и проверки слов. Хранится только на этом телефоне.</p>
    <details ${p.geminiKey ? '' : 'open'}><summary>Как получить ключ (2 минуты)</summary>
      <ol class="small">
        <li>Откройте <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> и войдите через Google-аккаунт.</li>
        <li>Если попросят — примите условия.</li>
        <li>Нажмите <b>Create API key</b> (Создать ключ).</li>
        <li>Скопируйте ключ (начинается с <code>AIza…</code>) и вставьте ниже.</li>
      </ol>
      <p class="muted small">Это бесплатно, карта не нужна. На бесплатном тарифе Google может использовать запросы для улучшения своих моделей — для фото тетради это не страшно.</p>
    </details>
    <form data-form="key" class="row">
      <input name="key" type="password" placeholder="AIza…" value="${esc(p.geminiKey)}" autocomplete="off" autocapitalize="off" spellcheck="false">
      <button class="btn primary" type="submit">Сохранить</button>
    </form>
    ${p.geminiKey ? '<p class="small ok-text">✓ Ключ сохранён</p>' : ''}
  </section>

  <section class="card form">
    <h3>Произношение</h3>
    <label>Акцент
      <select data-input="accent">
        <option value="AR" ${p.accent === 'AR' ? 'selected' : ''}>🇦🇷 Аргентина / Лат. Америка</option>
        <option value="ES" ${p.accent === 'ES' ? 'selected' : ''}>🇪🇸 Испания</option>
      </select>
    </label>
    <p class="muted small">${voice ? `Голос: ${esc(voice)}` : 'На этом устройстве не найден испанский голос. На iPhone: Настройки → Универсальный доступ → Устный контент → Голоса → Испанский.'}</p>
    <button class="btn" data-act="say" data-text="¿Qué hacés, che? Vamos a tomar unos mates.">🔊 Проверить голос</button>
  </section>

  <section class="card form">
    <h3>Резервная копия</h3>
    <p class="muted small">Слова хранятся только на этом устройстве. ${p.lastBackupAt ? `Последняя копия: ${new Date(p.lastBackupAt).toLocaleDateString('ru-RU')}.` : 'Копий ещё не было.'}</p>
    <div class="row"><button class="btn primary" data-act="export">Скачать копию</button>
    <label class="btn">Загрузить копию<input type="file" accept="application/json,.json" data-input="import" hidden></label></div>
  </section>

  <section class="card form">
    <h3>Уровень</h3>
    <p>Сейчас: <b>${esc(p.level)}</b></p>
    <a class="btn" href="#/level">Пройти проверку уровня</a>
  </section>

  ${isIOS() && !isStandalone() ? `<section class="card"><h3>Установка</h3><p class="small">В Safari нажмите <b>Поделиться</b> ⬆︎ → <b>На экран «Домой»</b>. Так iPhone не удалит ваши слова.</p></section>` : ''}

  <section class="card">
    <h3>Как считается «выучено»</h3>
    <p class="small">У каждого слова два направления: ES→RU и RU→ES. После верного ответа следующее повторение откладывается: 4 ч → 1 день → 3 дня → 7 → 16 → 35 дней и дальше. <b>Знакомо</b> — когда оба направления продержались хотя бы день, <b>выучено</b> — когда оба продержались 3 недели. Если слово забылось, оно возвращается на повторение.</p>
  </section>

  <button class="link danger" data-act="wipe">Удалить все данные</button>`;
}

// ---------- Действия ----------
const actions = {
  ...sessionActions,
  ...levelActions,
  say: el => sp.speak(el.dataset.text, { slow: !!el.dataset.slow, accent: state.profile.accent }),
  dismiss: async el => { await saveProfile({ [el.dataset.k]: true }); rerender(); },
  'close-modal': () => closeModal(),
  learn: el => {
    const m = el.dataset.m;
    const pool = (m === 'all' ? state.words : moduleWords(m)).filter(srs.isNew).sort((a, b) => a.createdAt - b.createdAt);
    if (!startSession('learn', pool, { back: m === 'all' ? 'home' : `module/${m}` })) toast('Новых слов нет');
  },
  review: el => {
    const m = el.dataset.m;
    const pool = m ? moduleWords(m) : state.words;
    if (!startSession('review', pool, { back: m ? `module/${m}` : 'home' })) toast('Сейчас повторять нечего');
  },
  practice: el => startSession('practice', moduleWords(el.dataset.m), { back: `module/${el.dataset.m}` }),
  'practice-all': () => {
    const ws = state.words.filter(w => !srs.isNew(w)).sort((a, b) => Math.min(a.srs.es_ru.interval, a.srs.ru_es.interval) - Math.min(b.srs.es_ru.interval, b.srs.ru_es.interval));
    startSession('practice', ws.slice(0, 20), { back: 'review' });
  },
  'test-module': el => startSession('test', moduleWords(el.dataset.m), { count: 20, back: `module/${el.dataset.m}` }),
  'edit-word': (el, e) => { if (e.target.closest('.say')) return; editWordModal(el.dataset.id); },
  'delete-word': async el => {
    if (!confirm('Удалить слово?')) return;
    await deleteWords([el.dataset.id]);
    closeModal(); updateBadge(); rerender();
  },
  'reset-word': async el => {
    const w = state.words.find(x => x.id === el.dataset.id);
    if (!w || !confirm('Сбросить прогресс? Слово станет новым.')) return;
    await saveWord({ ...w, srs: srs.newSrs() });
    closeModal(); updateBadge(); rerender();
  },
  'module-menu': el => {
    const m = moduleById(el.dataset.id);
    modal(`<h2>${esc(m.name)}</h2>
      <form data-form="rename-module" data-id="${m.id}" class="form">
        <label>Название <input name="name" value="${esc(m.name)}" required></label>
        <button class="btn primary" type="submit">Переименовать</button>
      </form>
      <div class="row wrap">
        <button class="btn" data-act="delete-module" data-id="${m.id}" data-words="0">Удалить модуль, слова оставить</button>
        <button class="btn danger" data-act="delete-module" data-id="${m.id}" data-words="1">Удалить вместе со словами</button>
      </div>
      <button class="btn ghost" data-act="close-modal">Закрыть</button>`);
  },
  'delete-module': async el => {
    const withWords = el.dataset.words === '1';
    if (!confirm(withWords ? 'Удалить модуль и все его слова вместе с прогрессом?' : 'Удалить модуль? Слова останутся в «Без модуля».')) return;
    await deleteModule(el.dataset.id, withWords);
    closeModal(); updateBadge(); go('words');
  },
  'cancel-import': () => { state.pending = null; go('add'); },
  'import-add-row': () => {
    state.pending.items.push({ es: '', ru: '', note: '', type: 'word', region: 'общее', include: true, manual: true });
    rerender();
    const inputs = $$('.import-row input[data-f=es]');
    inputs[inputs.length - 1]?.focus();
  },
  export: async () => {
    const data = await db.exportAll();
    const name = `espanol-${new Date().toISOString().slice(0, 10)}.json`;
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const file = new File([blob], name, { type: 'application/json' });
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Резервная копия: испанский' });
      else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }
      await saveProfile({ lastBackupAt: Date.now() });
      toast('Копия сохранена ✓');
      rerender();
    } catch (e) {
      if (e.name !== 'AbortError') toast('Не удалось сохранить копию: ' + e.message, 'error');
    }
  },
  wipe: async () => {
    if (!confirm('Удалить все слова и прогресс с этого устройства?')) return;
    if (!confirm('Точно? Это нельзя отменить. Сначала лучше скачать резервную копию.')) return;
    await db.clearAll();
    await loadAll();
    updateBadge();
    go('home');
  },
};

async function withGemini(text, fn) {
  const key = state.profile.geminiKey;
  if (!key) { toast('Сначала добавьте ключ Gemini в Настройках', 'error'); return null; }
  loading(text);
  try {
    return await fn(key, state.profile.level);
  } catch (e) {
    toast(e.message || String(e), 'error');
    return null;
  } finally {
    loading(null);
  }
}

const forms = {
  ...sessionForms,
  test: form => {
    const fd = new FormData(form);
    const mods = fd.getAll('m');
    const pool = mods.includes('all') || !mods.length ? state.words : state.words.filter(w => mods.includes(w.moduleId));
    if (pool.length < 2) { toast('Нужно хотя бы 2 слова'); return; }
    startSession('test', pool, { count: Number(fd.get('n')) || 0, back: 'test' });
  },
  'edit-word': async form => {
    const fd = new FormData(form);
    const w = state.words.find(x => x.id === form.dataset.id);
    await saveWord({ ...w, es: fd.get('es').trim(), ru: fd.get('ru').trim(), note: fd.get('note').trim(), example: fd.get('example').trim(), moduleId: fd.get('moduleId') || null });
    closeModal(); rerender();
  },
  'rename-module': async form => {
    const m = moduleById(form.dataset.id);
    m.name = new FormData(form).get('name').trim() || m.name;
    await saveModule(m);
    closeModal(); rerender();
  },
  photo: async form => {
    const files = [...form.querySelector('input[type=file]').files];
    if (!files.length) { toast('Выберите фото'); return; }
    const res = await withGemini(`Распознаю ${files.length > 1 ? files.length + ' фото' : 'фото'}… это займёт 10–30 секунд`, (k, lv) => gem.recognizePhotos(k, files, lv));
    if (res) setPending(res, 'photo');
  },
  'one-word': async (form, submitter) => {
    const fd = new FormData(form);
    const es = fd.get('es').trim();
    const ru = fd.get('ru').trim();
    const moduleId = fd.get('moduleId') || null;
    if (!es) return;
    if (submitter?.value === 'ai') {
      const res = await withGemini('Проверяю слово…', (k, lv) => gem.translateOne(k, es, ru, lv));
      if (!res) return;
      const it = res.items?.[0];
      if (it && fd.get('note')) it.note = [fd.get('note'), it.note].filter(Boolean).join('; ');
      setPending({ items: it ? [it] : [] }, 'text', { moduleId });
      return;
    }
    await saveWords([makeWord({ es, ru, note: fd.get('note') }, moduleId)]);
    toast('Слово добавлено ✓');
    form.reset();
    updateBadge();
  },
  list: async (form, submitter) => {
    const text = new FormData(form).get('text').trim();
    if (!text) return;
    if (submitter?.value === 'ai') {
      const res = await withGemini('Разбираю и проверяю список…', (k, lv) => gem.parseList(k, text, lv));
      if (res) setPending(res, 'text');
    } else setPending({ items: localParse(text) }, 'text');
  },
  import: async form => {
    const P = state.pending;
    const fd = new FormData(form);
    let moduleId = fd.get('moduleId');
    const chosen = P.items.filter(x => x.include && x.es.trim());
    if (!chosen.length) { toast('Не выбрано ни одного слова'); return; }
    if (moduleId === '__new') moduleId = (await createModule(fd.get('moduleName').trim() || defaultModuleName(), { source: P.source })).id;
    await saveWords(chosen.map(it => makeWord(it, moduleId)));
    state.pending = null;
    updateBadge();
    toast(`Сохранено: ${words(chosen.length)} ✓`);
    go(`module/${moduleId}`);
  },
  'lib-add': async form => {
    const f = state.library.folders.find(x => x.id === form.dataset.id);
    const have = new Set(state.words.map(w => norm(w.es)));
    const ws = f.words.filter(w => !have.has(norm(w.es)));
    const known = new Set(new FormData(form).getAll('known').map(Number));
    let m = state.modules.find(x => x.libId === f.id);
    if (!m) m = await createModule(f.name, { source: 'library', libId: f.id });
    await saveWords(ws.map((w, i) => makeWord({ ...w, known: known.has(i) }, m.id)));
    updateBadge();
    toast(`Добавлено: ${words(ws.length)}${known.size ? `, из них знакомых ${known.size}` : ''} ✓`);
    go(`module/${m.id}`);
  },
  more: async form => {
    const topic = new FormData(form).get('topic').trim();
    if (!topic) return;
    const res = await withGemini(`Подбираю слова по теме «${topic}»…`, (k, lv) => gem.moreWords(k, topic, state.words.map(w => w.es), lv));
    if (res) setPending(res, 'library', { moduleName: res.moduleName || topic });
  },
  key: async form => {
    const key = new FormData(form).get('key').trim();
    if (!key) { await saveProfile({ geminiKey: '' }); rerender(); return; }
    loading('Проверяю ключ…');
    try {
      await gem.testKey(key);
      await saveProfile({ geminiKey: key });
      toast('Ключ работает ✓');
    } catch (e) {
      if (e.code === 'network' || e.code === 'timeout') { await saveProfile({ geminiKey: key }); toast('Ключ сохранён, но проверить его сейчас не удалось — попробуйте распознать фото', 'error'); }
      else toast(e.message, 'error');
    } finally {
      loading(null);
      rerender();
    }
  },
};

const inputs = {
  search: el => {
    state.search = el.value;
    $('#search-results').innerHTML = el.value ? searchResults(el.value) : moduleList();
  },
  'photo-preview': el => {
    const box = $('#previews');
    box.innerHTML = '';
    [...el.files].forEach(f => {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(f);
      box.appendChild(img);
    });
  },
  inc: el => {
    const it = state.pending.items[Number(el.dataset.i)];
    it.include = el.checked;
    el.closest('.import-row').classList.toggle('off', !el.checked);
    const n = state.pending.items.filter(x => x.include).length;
    $('form[data-form=import] button[type=submit]').textContent = `Сохранить ${words(n)}`;
  },
  field: el => { state.pending.items[Number(el.dataset.i)][el.dataset.f] = el.value; },
  'mod-select': el => { $('#new-mod-name').hidden = el.value !== '__new'; },
  accent: async el => { await saveProfile({ accent: el.value }); rerender(); },
  import: async el => {
    const file = el.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!confirm(`Загрузить копию от ${new Date(data.exportedAt).toLocaleDateString('ru-RU')} (${words(data.words?.length || 0)})? Текущие данные на устройстве будут заменены.`)) return;
      await db.importAll(data);
      await loadAll();
      updateBadge();
      toast('Копия загружена ✓');
      go('home');
    } catch (e) {
      toast('Не удалось загрузить: ' + e.message, 'error');
    }
  },
};

// ---------- Запуск ----------
function bind() {
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = actions[el.dataset.act];
    if (!fn) return;
    e.preventDefault();
    if (el.dataset.act !== 'edit-word' && el.closest('.word-row') && el.dataset.act === 'say') e.stopPropagation();
    fn(el, e);
  });
  document.addEventListener('submit', e => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    forms[form.dataset.form]?.(form, e.submitter);
  });
  document.addEventListener('input', e => {
    const el = e.target.closest('[data-input]');
    if (el && el.type !== 'file' && el.type !== 'checkbox' && el.tagName !== 'SELECT') inputs[el.dataset.input]?.(el);
  });
  document.addEventListener('change', e => {
    const el = e.target.closest('[data-input]');
    if (el && (el.type === 'file' || el.type === 'checkbox' || el.tagName === 'SELECT')) inputs[el.dataset.input]?.(el);
  });
  window.addEventListener('hashchange', render);
  sp.onVoices(() => { if (parseRoute().name === 'settings') render(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && parseRoute().name === 'home') render(); });
}

async function main() {
  await loadAll();
  setRenderer(render);
  bind();
  $('#nav').innerHTML = NAV.map(([r, i, l]) => `<a href="#/${r}" data-r="${r}"><span class="ni">${i}</span><span>${l}</span>${r === 'review' ? '<span class="badge" hidden></span>' : ''}</a>`).join('');
  render();
  updateBadge();
  loadLibrary();
  navigator.storage?.persist?.().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  if (srs.timeOffset()) toast(`Тестовый режим: время сдвинуто на ${srs.humanInterval(srs.timeOffset())}`);
}

main().catch(e => {
  document.getElementById('view').innerHTML = `<div class="card"><h2>Ошибка запуска</h2><p>${esc(e.message)}</p></div>`;
  console.error(e);
});
