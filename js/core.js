// Общее состояние приложения и вспомогательные функции.
import { db, uid } from './db.js';
import * as srs from './srs.js';

export const state = {
  words: [],
  modules: [],
  profile: null,
  library: null,
  pending: null,   // распознанные слова, ожидающие проверки
  session: null,   // текущая тренировка / тест
};

const DEFAULT_PROFILE = {
  level: 'B1 (начало)',
  accent: 'AR',
  geminiKey: '',
  lastBackupAt: 0,
  streak: 0,
  lastStudyDay: '',
  installDismissed: false,
  keyHintDismissed: false,
};

export async function loadAll() {
  const [words, modules, profile] = await Promise.all([db.all('words'), db.all('modules'), db.getKv('profile')]);
  state.words = words;
  state.modules = modules.sort((a, b) => b.createdAt - a.createdAt);
  state.profile = { ...DEFAULT_PROFILE, ...(profile || {}) };
}

export async function loadLibrary() {
  if (state.library) return state.library;
  try {
    const res = await fetch('library.json');
    state.library = await res.json();
  } catch {
    state.library = { folders: [], levelTest: [] };
  }
  return state.library;
}

export async function saveProfile(patch) {
  Object.assign(state.profile, patch);
  await db.setKv('profile', state.profile);
}

export async function saveWord(w) {
  await db.put('words', w);
  const i = state.words.findIndex(x => x.id === w.id);
  if (i >= 0) state.words[i] = w; else state.words.push(w);
}

export async function saveWords(list) {
  await db.putMany('words', list);
  for (const w of list) {
    const i = state.words.findIndex(x => x.id === w.id);
    if (i >= 0) state.words[i] = w; else state.words.push(w);
  }
}

export async function deleteWords(ids) {
  await db.delMany('words', ids);
  const set = new Set(ids);
  state.words = state.words.filter(w => !set.has(w.id));
}

export async function createModule(name, extra = {}) {
  const m = { id: uid(), name: name || 'Новый модуль', createdAt: Date.now(), source: 'text', ...extra };
  await db.put('modules', m);
  state.modules.unshift(m);
  return m;
}

export async function saveModule(m) {
  await db.put('modules', m);
}

export async function deleteModule(id, withWords) {
  if (withWords) await deleteWords(state.words.filter(w => w.moduleId === id).map(w => w.id));
  else {
    const moved = state.words.filter(w => w.moduleId === id).map(w => ({ ...w, moduleId: null }));
    await saveWords(moved);
  }
  await db.del('modules', id);
  state.modules = state.modules.filter(m => m.id !== id);
}

export function makeWord(item, moduleId) {
  return {
    id: uid(),
    es: (item.es || '').trim(),
    ru: (item.ru || '').trim(),
    note: (item.note || '').trim(),
    example: (item.example || '').trim(),
    type: item.type || 'word',
    region: item.region || 'общее',
    moduleId,
    createdAt: Date.now(),
    srs: item.known ? srs.markKnown() : srs.newSrs(),
  };
}

export const moduleWords = id => state.words.filter(w => (id === 'none' ? !w.moduleId : w.moduleId === id));
export const moduleById = id => state.modules.find(m => m.id === id);

// Серия дней подряд
const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
export async function markStudied() {
  const today = dayKey(srs.now());
  const yesterday = dayKey(srs.now() - srs.D);
  const p = state.profile;
  if (p.lastStudyDay === today) return;
  await saveProfile({ streak: p.lastStudyDay === yesterday ? p.streak + 1 : 1, lastStudyDay: today });
}
export function currentStreak() {
  const p = state.profile;
  const ok = [dayKey(srs.now()), dayKey(srs.now() - srs.D)].includes(p.lastStudyDay);
  return ok ? p.streak : 0;
}

export function updateBadge() {
  const due = srs.stats(state.words).due;
  try {
    if (due && navigator.setAppBadge) navigator.setAppBadge(due);
    else if (navigator.clearAppBadge) navigator.clearAppBadge();
  } catch {}
}

// ---------- HTML-помощники ----------
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function shuffle(a) {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

let renderFn = () => {};
export const setRenderer = fn => { renderFn = fn; };
export const rerender = () => renderFn();
export function go(path) {
  const target = '#/' + path;
  if (location.hash === target) renderFn(); else location.hash = target;
}

export function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, kind === 'error' ? 5000 : 2500);
}

export function modal(html) {
  closeModal();
  const el = document.createElement('div');
  el.className = 'modal-backdrop';
  el.id = 'modal';
  el.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  el.addEventListener('click', e => { if (e.target === el) closeModal(); });
  document.body.appendChild(el);
  return el;
}
export function closeModal() { document.getElementById('modal')?.remove(); }

export function loading(text) {
  let el = document.getElementById('loading');
  if (!text) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'loading';
    el.className = 'loading-overlay';
    document.body.appendChild(el);
  }
  el.innerHTML = `<div class="spinner"></div><p>${esc(text)}</p>`;
}

export const sayBtn = (text, extra = '') => `<button class="say ${extra}" data-act="say" data-text="${esc(text)}" aria-label="Произнести">🔊</button>`;

export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// ---------- Проверка ответа ----------
const strip = s => s.replace(/\(.*?\)/g, ' ');
export const norm = s => strip(String(s || '')).toLowerCase().replace(/[¿?¡!.,;:«»"“”]/g, ' ').replace(/\s+/g, ' ').trim();
const noAcc = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const noArt = s => s.replace(/^(el|la|los|las|un|una|lo)\s+/, '');
export const variants = target => String(target || '').split(/\s*[\/;]\s*/).map(norm).filter(Boolean);

function lev(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

// → { result: 'good'|'almost'|'bad', hint }
export function checkAnswer(input, target) {
  const a = norm(input);
  if (!a) return { result: 'bad', hint: '' };
  const vs = variants(target);
  for (const v of vs) if (a === v) return { result: 'good', hint: '' };
  for (const v of vs) if (noArt(a) === noArt(v)) {
    const art = v.match(/^(el|la|los|las|un|una|lo)\s/);
    return art ? { result: 'almost', hint: `Почти! Не забудьте артикль: ${art[1]}` } : { result: 'good', hint: '' };
  }
  for (const v of vs) if (noAcc(noArt(a)) === noAcc(noArt(v))) return { result: 'almost', hint: 'Почти! Проверьте акцент или ñ.' };
  for (const v of vs) {
    const x = noAcc(noArt(a)), y = noAcc(noArt(v));
    const tol = y.length >= 10 ? 2 : y.length >= 5 ? 1 : 0;
    if (tol && lev(x, y) <= tol) return { result: 'almost', hint: 'Почти! Небольшая опечатка.' };
  }
  return { result: 'bad', hint: '' };
}

// Разбор списка без ИИ: «слово - перевод», «слово: перевод», «el perro собака».
export function localParse(text) {
  const items = [];
  for (const raw of text.split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    let es = line, ru = '';
    const m = line.match(/^(.+?)\s*(?:\s[-–—=]\s|[–—=:\t]|\s-|-\s)\s*(.+)$/);
    if (m) { es = m[1]; ru = m[2]; }
    else {
      const c = line.search(/[А-Яа-яЁё]/);
      if (c > 0) { es = line.slice(0, c); ru = line.slice(c); }
    }
    es = es.replace(/[-–—:=\s]+$/, '').trim(); ru = ru.replace(/^[-–—:=\s]+/, '').trim();
    if (!es) continue;
    items.push({ es, ru, type: es.split(/\s+/).length >= 4 ? 'phrase' : 'word', region: 'общее', corrected: false, unreadable: false });
  }
  return items;
}
