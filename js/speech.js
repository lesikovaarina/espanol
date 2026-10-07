// Произношение встроенным синтезатором речи телефона.
const PREFS = {
  AR: ['es-AR', 'es-US', 'es-419', 'es-MX', 'es-CO', 'es-CL', 'es'],
  ES: ['es-ES', 'es'],
};

let voices = [];
const listeners = new Set();

function load() {
  if (!('speechSynthesis' in window)) return;
  voices = speechSynthesis.getVoices().filter(v => /^es([-_]|$)/i.test(v.lang));
  listeners.forEach(fn => fn());
}

if ('speechSynthesis' in window) {
  load();
  speechSynthesis.addEventListener?.('voiceschanged', load);
}

export function onVoices(fn) { listeners.add(fn); }

export function hasVoice() { return voices.length > 0; }

function pick(accent) {
  const norm = l => l.replace('_', '-').toLowerCase();
  for (const lang of PREFS[accent] || PREFS.AR) {
    const exact = voices.filter(v => norm(v.lang) === lang.toLowerCase());
    if (exact.length) return exact.find(v => v.localService) || exact[0];
  }
  // для AR не хотим голос из Испании, если есть любой другой
  const other = voices.find(v => accent !== 'AR' || !/es-es/i.test(norm(v.lang)));
  return other || voices[0] || null;
}

export function voiceName(accent) {
  const v = pick(accent);
  return v ? `${v.name} (${v.lang})` : null;
}

export function speak(text, { slow = false, accent = 'AR' } = {}) {
  if (!('speechSynthesis' in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/\s*\(.*?\)\s*/g, ' ').trim());
  const v = pick(accent);
  if (v) { u.voice = v; u.lang = v.lang; } else u.lang = accent === 'ES' ? 'es-ES' : 'es-AR';
  u.rate = slow ? 0.6 : 0.95;
  speechSynthesis.speak(u);
}

// Подсказка про аргентинское «ш» в ll/y — синтезатор так не произносит.
export function rioplatenseHint(es) {
  if (!/ll|y[aeiouáéíóú]/i.test(es)) return '';
  return 'В Аргентине ll и y звучат как «ш»: calle → «каше», yo → «шо».';
}
