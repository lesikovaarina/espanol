// Распознавание и проверка слов через Gemini API (бесплатный тариф Google AI Studio).
// Модели пробуем по очереди: если Google переименует/уберёт одну, сработает следующая.
// Порядок проверен 2026-10-07 на ключе AI Studio: lite-модель распознаёт страницу за ~10 с,
// полные Flash-модели думают минуты или перегружены (503); gemini-2.5-flash закрыта для новых ключей.
export const MODELS = ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-flash-latest', 'gemini-3.5-flash'];
const API = 'https://generativelanguage.googleapis.com/v1beta/models/';

const ITEM = {
  type: 'OBJECT',
  properties: {
    es: { type: 'STRING', description: 'испанское слово/фраза в правильном написании, существительные с артиклем' },
    ru: { type: 'STRING', description: 'перевод на русский (правильный)' },
    original: { type: 'STRING', description: 'как было записано в источнике, если отличается' },
    note: { type: 'STRING', description: 'короткая заметка: аргентинский/испанский вариант, форма vos, род, управление' },
    example: { type: 'STRING', description: 'короткий пример на испанском (аргентинский вариант, с vos)' },
    type: { type: 'STRING', enum: ['word', 'phrase', 'grammar'] },
    region: { type: 'STRING', enum: ['AR', 'ES', 'LatAm', 'общее'] },
    corrected: { type: 'BOOLEAN', description: 'true, если исправили написание или перевод' },
    correctionNote: { type: 'STRING', description: 'что исправлено и почему, по-русски, коротко' },
    unreadable: { type: 'BOOLEAN', description: 'true, если строку не удалось уверенно прочитать' },
    confidence: { type: 'NUMBER' },
  },
  required: ['es', 'ru', 'type', 'region', 'corrected', 'unreadable'],
};

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    moduleName: { type: 'STRING', description: 'короткое название модуля по-русски по теме слов' },
    items: { type: 'ARRAY', items: ITEM },
    skipped: { type: 'ARRAY', items: { type: 'STRING' }, description: 'строки, которые не являются словами (домашка, заметки)' },
  },
  required: ['items'],
};

function rules(level) {
  return `Ты помогаешь русскоязычной ученице учить испанский. Она живёт в Аргентине, уровень ${level || 'B1'}.
Правила:
- Читай рукопись внимательно, буква за буквой. Слова на одной странице обычно из одного урока — учитывай общую тему (например, если рядом lagarto, pistas de aterrizaje, trazados, то «Nazca» — это линии Наски, а не форма глагола).
- Проверяй по смыслу КАЖДЫЙ её перевод, даже если он похож на правильный. Неверный или неточный перевод — исправь, corrected=true, в correctionNote коротко: «вы написали X, правильнее Y; X по-испански — Z». Пример: aumento — это «повышение (зарплаты)», а «премия» — el bono / la prima.
- Перевод на русский.
- Исправляй орфографию испанского (акценты, опечатки), сохраняй как было в поле original.
- Существительные давай с артиклем (el/la). Глаголы — в инфинитиве.
- Вариант испанского — аргентинский (риоплатский). Если слово типично для Испании, НЕ считай ошибкой, но region="ES" и в note: «в Аргентине чаще говорят …». Аргентинские слова — region="AR".
- Пример (example) — короткий, естественный, на аргентинском испанском с voseo (vos tenés, querés, sabés). Для фраз пример можно не давать.
- Целая фраза/предложение — type="phrase"; грамматическая конструкция (dejar de + inf, формы субхунтива и т.п.) — type="grammar".
- Если перевода в источнике нет — допиши его сам.
- Если не уверена, как прочитано слово или перевод (confidence < 0.7), — НЕ угадывай: unreadable=true, es — как сумела прочитать, ru — пусто или с «?». Не подменяй непонятное слово похожим существующим.
- Строки, которые не являются словами (номера страниц, домашнее задание, пометки), не включай в items — положи их в skipped. Имена и названия оставляй в items — она удалит сама, если не нужно.
- Предложения пиши с заглавной буквы, как в оригинале.
- Если в Аргентине обычно говорят иначе (platillo volador → plato volador, coger → agarrar), напиши это в note.
- moduleName — 2–4 слова по-русски по теме урока (например «Линии Наски и работа»), а не общее «Испанский B1».`;
}

// fetch с ограничением по времени: без него зависший запрос крутится бесконечно
async function fetchWithTimeout(url, opts, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (e) {
    if (e.name === 'AbortError') throw new GeminiError('Gemini слишком долго не отвечает. Попробуйте ещё раз.', 'timeout');
    throw new GeminiError('Нет связи с Gemini. Проверьте интернет.', 'network');
  } finally {
    clearTimeout(timer);
  }
}

let workingModel = null; // модель, которая ответила в прошлый раз, пробуем первой
export const setModel = m => { workingModel = m; };

async function call(key, parts, schema = SCHEMA, timeoutMs = 60000) {
  let lastErr;
  const order = workingModel ? [workingModel, ...MODELS.filter(m => m !== workingModel)] : MODELS;
  for (const model of order) {
    let res;
    try {
      res = await fetchWithTimeout(`${API}${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.2 },
        }),
      }, timeoutMs);
    } catch (e) {
      if (e.code === 'timeout') { lastErr = e; continue; }
      throw e;
    }
    if (res.status === 404) { lastErr = new GeminiError(`Модель ${model} недоступна`, 'model'); continue; }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = body?.error?.message || res.statusText;
      if (res.status === 400 && /API key/i.test(msg)) throw new GeminiError('Ключ Gemini не подходит. Проверьте его в Настройках.', 'key');
      if (res.status === 403) throw new GeminiError('Ключ Gemini не работает на этом сайте (403). Проверьте ограничения ключа.', 'key');
      if (res.status === 429) throw new GeminiError('Лимит бесплатных запросов Gemini на сейчас исчерпан. Попробуйте через минуту или завтра.', 'limit');
      if (res.status >= 500) { lastErr = new GeminiError('Gemini временно не отвечает. Попробуйте ещё раз.', 'server'); continue; }
      throw new GeminiError('Ошибка Gemini: ' + msg, 'other');
    }
    workingModel = model;
    const text = body?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    try {
      return JSON.parse(text);
    } catch {
      throw new GeminiError('Gemini вернул непонятный ответ. Попробуйте ещё раз.', 'parse');
    }
  }
  throw lastErr || new GeminiError('Gemini недоступен', 'other');
}

export class GeminiError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

// Сжимаем фото до ~1600px JPEG: быстрее грузится и тратит меньше бесплатного лимита.
export async function imageToPart(file) {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) {
    const b64 = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(file); });
    return { inline_data: { mime_type: file.type || 'image/jpeg', data: b64 } };
  }
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const data = c.toDataURL('image/jpeg', 0.85).split(',')[1];
  return { inline_data: { mime_type: 'image/jpeg', data } };
}

export async function recognizePhotos(key, files, level) {
  const parts = [{ text: rules(level) + '\n\nНа фото — страницы тетради со словами (испанское слово — перевод). Распознай все строки по порядку.' }];
  for (const f of files) parts.push(await imageToPart(f));
  return call(key, parts);
}

export async function parseList(key, text, level) {
  return call(key, [{ text: rules(level) + '\n\nВот список, который она вписала вручную (формат свободный). Разбери каждую строку:\n\n' + text }]);
}

export async function translateOne(key, es, ru, level) {
  return call(key, [{ text: rules(level) + `\n\nОдно слово. Испанский: «${es}». Её перевод: «${ru || '(нет — переведи сам)'}». Верни ровно один элемент в items.` }]);
}

export async function moreWords(key, topic, existing, level) {
  return call(key, [{ text: rules(level) + `\n\nСоставь подборку из 20 полезных слов и выражений по теме «${topic}» для уровня ${level || 'B1'} — без совсем базовых слов (A1–A2). Аргентинский вариант, у каждого слова пример с vos. corrected=false, unreadable=false.
Не включай слова, которые у неё уже есть: ${existing.slice(0, 400).join(', ')}` }]);
}

// Быстрая проверка ключа: список моделей, без генерации текста.
export async function testKey(key) {
  const res = await fetchWithTimeout(`${API}?pageSize=200`, { headers: { 'x-goog-api-key': key } }, 15000);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.message || '';
    if (res.status === 400 || res.status === 401 || res.status === 404 || /API key/i.test(msg)) throw new GeminiError('Ключ не подходит. Скопируйте его ещё раз целиком (начинается с AIza).', 'key');
    if (res.status === 403) throw new GeminiError('Ключ не работает на этом сайте (403). Проверьте ограничения ключа в Google AI Studio.', 'key');
    throw new GeminiError('Не удалось проверить ключ: ' + (msg || res.status), 'other');
  }
  const names = (body.models || []).map(m => m.name.replace('models/', ''));
  const flash = MODELS.find(m => names.includes(m));
  if (flash) workingModel = flash;
  return { ok: true, models: names };
}
