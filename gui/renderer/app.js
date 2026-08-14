'use strict';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const TEMPLATES = {
  default: '{{ formatDate .MessageDate "2006-01-02_15-04" }}_{{ if .FileCaption }}{{ filenamify .FileCaption 60 }}_{{ end }}{{ .MessageID }}',
  dateid: '{{ formatDate .MessageDate "2006-01-02_15-04" }}_{{ .MessageID }}',
  caption: '{{ if .FileCaption }}{{ filenamify .FileCaption 80 }}{{ else }}{{ .MessageID }}{{ end }}',
  raw: '{{ .DialogID }}_{{ .MessageID }}_{{ filenamify .FileName }}',
};

const I18N = {
  en: {
    settings: 'Settings', download: 'Download', options: 'Options', copy: 'Copy',
    linkLabel: 'Telegram message link',
    linkHint: 'Private, protected, public, groups, Saved Messages — all work.',
    customName: 'Custom file name', autoName: 'Leave empty to use the template',
    saveTo: 'Save to', browse: 'Browse',
    downloads: 'Downloads', clearDone: 'Clear finished',
    emptyTitle: 'Nothing downloaded yet',
    emptyHint: 'Paste a Telegram message link above to start.',
    grpFiles: 'Files', grpTransfer: 'Transfer', grpApp: 'Application', grpSecurity: 'Security',
    template: 'File name template',
    templateHint: 'Go template. The date is the original post time, not the download time.',
    presetDefault: 'Date + caption', presetDateId: 'Date + id',
    presetCaption: 'Caption only', presetRaw: 'Original',
    threads: 'Threads per file', concurrent: 'Concurrent downloads', proxy: 'Proxy',
    theme: 'Theme', themeSystem: 'System', themeDark: 'Dark', themeLight: 'Light',
    language: 'Language', tdlPath: 'tdl binary path', tdlAuto: 'Auto-detected',
    keyWarning: 'The Telegram auth key is stored in ~/.tdl in plain text. Anything that can read your home directory gets full account access — 2FA does not protect against it.',
    cleanOnQuit: 'Delete the auth key when the app quits',
    cleanNow: 'Delete auth key now',
    cleaned: 'Auth key deleted. You will need to log in again.',
    needLoginTitle: 'Not logged in.',
    needLoginText: 'Login uses an interactive account picker, so it has to be run in a terminal. Close Telegram Desktop first, then run:',
    badUrl: 'That does not look like a Telegram message link.',
    stRunning: 'downloading', stDone: 'done', stFailed: 'failed',
    stPreparing: 'preparing', stInstalling: 'installing tdl', stCancelled: 'cancelled',
    cancel: 'Cancel', reveal: 'Show in folder', left: 'left',
    notLoggedInShort: 'Not logged in — run tgrab login in a terminal',
    openTerminal: 'Open terminal',
    vpnNotice: 'Telegram is blocked in Russia — turn on a VPN, or set a proxy in Settings, before downloading.',
    grpAbout: 'About', author: 'Author', source: 'Source',
    audioOnly: 'Audio only', compress: 'Compress', speedUp: 'Speed up', trim: 'Trim',
    from: 'From', to: 'To', apply: 'Apply',
    trimHint: 'mm:ss — leave “To” empty to run to the end',
    stConverting: 'converting',
  },
  ru: {
    settings: 'Настройки', download: 'Скачать', options: 'Параметры', copy: 'Копировать',
    linkLabel: 'Ссылка на сообщение Telegram',
    linkHint: 'Приватные, защищённые, публичные каналы, группы, «Избранное» — всё работает.',
    customName: 'Своё имя файла', autoName: 'Пусто — использовать шаблон',
    saveTo: 'Сохранять в', browse: 'Выбрать',
    downloads: 'Загрузки', clearDone: 'Очистить завершённые',
    emptyTitle: 'Пока ничего не скачано',
    emptyHint: 'Вставьте ссылку на сообщение Telegram выше.',
    grpFiles: 'Файлы', grpTransfer: 'Передача', grpApp: 'Приложение', grpSecurity: 'Безопасность',
    template: 'Шаблон имени файла',
    templateHint: 'Go-шаблон. Дата — момент публикации поста, а не скачивания.',
    presetDefault: 'Дата + подпись', presetDateId: 'Дата + id',
    presetCaption: 'Только подпись', presetRaw: 'Как в Telegram',
    threads: 'Потоков на файл', concurrent: 'Одновременных загрузок', proxy: 'Прокси',
    theme: 'Тема', themeSystem: 'Системная', themeDark: 'Тёмная', themeLight: 'Светлая',
    language: 'Язык', tdlPath: 'Путь к бинарнику tdl', tdlAuto: 'Определяется автоматически',
    keyWarning: 'Ключ авторизации Telegram лежит в ~/.tdl открытым текстом. Любой процесс с доступом к домашней папке получает полный доступ к аккаунту — 2FA от этого не защищает.',
    cleanOnQuit: 'Удалять ключ при выходе из приложения',
    cleanNow: 'Удалить ключ сейчас',
    cleaned: 'Ключ удалён. Потребуется авторизоваться заново.',
    needLoginTitle: 'Нет авторизации.',
    needLoginText: 'Вход использует интерактивный выбор аккаунта, поэтому его нужно выполнить в терминале. Сначала закройте Telegram Desktop, затем выполните:',
    badUrl: 'Это не похоже на ссылку на сообщение Telegram.',
    stRunning: 'загрузка', stDone: 'готово', stFailed: 'ошибка',
    stPreparing: 'подготовка', stInstalling: 'установка tdl', stCancelled: 'отменено',
    cancel: 'Отмена', reveal: 'Показать в папке', left: 'осталось',
    notLoggedInShort: 'Нет авторизации — выполните tgrab login в терминале',
    openTerminal: 'Открыть терминал',
    vpnNotice: 'В России Telegram заблокирован — перед скачиванием включите VPN или пропишите прокси в настройках.',
    grpAbout: 'О программе', author: 'Автор', source: 'Исходники',
    audioOnly: 'Только звук', compress: 'Сжать', speedUp: 'Ускорить', trim: 'Обрезать',
    from: 'С', to: 'До', apply: 'Применить',
    trimHint: 'мм:сс — оставьте «До» пустым, чтобы до конца',
    stConverting: 'обработка',
  },
};

let lang = 'en';
let settings = {};
const items = new Map();

const t = (k) => (I18N[lang] && I18N[lang][k]) || I18N.en[k] || k;

function applyI18n() {
  $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  $$('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  $('#lang-label').textContent = lang.toUpperCase();
  document.documentElement.lang = lang;
  render();
}

function fmtEta(sec) {
  if (sec == null || sec < 0 || sec > 86400) return '—';
  if (lang === 'ru') {
    if (sec >= 3600) return `${Math.floor(sec / 3600)}ч${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}м`;
    if (sec >= 60) return `${Math.floor(sec / 60)}м${String(sec % 60).padStart(2, '0')}с`;
    return `${sec}с`;
  }
  if (sec >= 3600) return `${Math.floor(sec / 3600)}h${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}m`;
  if (sec >= 60) return `${Math.floor(sec / 60)}m${String(sec % 60).padStart(2, '0')}s`;
  return `${sec}s`;
}

function statusLabel(s, rec) {
  if (s === 'running' && rec && rec.kind === 'convert') return t('stConverting');
  return { running: t('stRunning'), done: t('stDone'), failed: t('stFailed'),
    preparing: t('stPreparing'), installing: t('stInstalling'), cancelled: t('stCancelled') }[s] || s;
}

function shortName(rec) {
  if (rec.file && rec.file.path) return rec.file.path.split(/[\\/]/).pop();
  if (rec.name && rec.name !== rec.url) return rec.name;
  return rec.url.replace(/^https?:\/\//, '');
}

const isVideo = (p) => /\.(mp4|mkv|mov|webm|m4v|avi)$/i.test(p || '');

// One click for the two that need no input; a single control for the two that do.
// Every result is written to a new file — the download itself is never touched.
function tools(rec) {
  const wrap = document.createElement('div');
  wrap.className = 'tools';

  const run = (op, params) => window.tgrab.process({ file: rec.file.path, op, params })
    .then((r) => { items.set(r.id, r); render(); });

  const btn = (label, onClick) => {
    const b = document.createElement('button');
    b.className = 'tool-btn';
    b.textContent = label;
    b.onclick = onClick;
    return b;
  };

  wrap.append(
    btn(t('audioOnly'), () => run('audio', {})),
    btn(t('compress'), () => run('compress', {})),
  );

  const speedWrap = document.createElement('div');
  speedWrap.className = 'tool-group';
  speedWrap.appendChild(Object.assign(document.createElement('span'),
    { className: 'tool-label', textContent: t('speedUp') }));
  [1.25, 1.5, 2].forEach((f) => {
    const b = btn(`${f}×`, () => run('speed', { factor: f }));
    b.classList.add('tool-mini');
    speedWrap.appendChild(b);
  });
  wrap.appendChild(speedWrap);

  const trimWrap = document.createElement('div');
  trimWrap.className = 'tool-group';
  trimWrap.appendChild(Object.assign(document.createElement('span'),
    { className: 'tool-label', textContent: t('trim') }));
  const from = Object.assign(document.createElement('input'),
    { type: 'text', className: 'tool-time', placeholder: '0:00' });
  const to = Object.assign(document.createElement('input'),
    { type: 'text', className: 'tool-time', placeholder: t('to') });
  const go = btn(t('apply'), () => run('trim', { start: norm(from.value), end: norm(to.value) }));
  go.classList.add('tool-mini');
  trimWrap.append(from, to, go);
  wrap.appendChild(trimWrap);

  return wrap;
}

// Accepts 90, 1:30 or 00:01:30 and hands ffmpeg something it always understands.
function norm(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (/^\d+$/.test(s)) return s;
  const parts = s.split(':').map((x) => parseInt(x, 10) || 0);
  if (parts.length === 2) return String(parts[0] * 60 + parts[1]);
  if (parts.length === 3) return String(parts[0] * 3600 + parts[1] * 60 + parts[2]);
  return s;
}

function render() {
  const list = $('#list');
  const arr = [...items.values()].sort((a, b) => b.id - a.id);
  $('#empty').classList.toggle('hidden', arr.length > 0);
  list.innerHTML = '';

  for (const rec of arr) {
    const el = document.createElement('div');
    el.className = `item ${rec.status}`;   // status drives the left state stripe
    const pct = Math.max(0, Math.min(100, rec.percent || 0));
    const fillCls = rec.status === 'done' ? 'done' : rec.status === 'failed' ? 'failed' : '';

    const top = document.createElement('div');
    top.className = 'item-top';
    const nm = document.createElement('div');
    nm.className = 'item-name';
    nm.textContent = shortName(rec);
    const badge = document.createElement('span');
    badge.className = `badge ${rec.status}`;
    badge.textContent = statusLabel(rec.status, rec);
    const acts = document.createElement('div');
    acts.className = 'item-actions';
    if (rec.status === 'running') {
      const b = document.createElement('button');
      b.className = 'mini-btn'; b.textContent = t('cancel');
      b.onclick = () => window.tgrab.cancel(rec.id);
      acts.appendChild(b);
    }
    if (rec.status === 'done' && rec.file) {
      const b = document.createElement('button');
      b.className = 'mini-btn'; b.textContent = t('reveal');
      b.onclick = () => window.tgrab.reveal(rec.file.path);
      acts.appendChild(b);
    }
    top.append(nm, badge, acts);

    const sub = document.createElement('div');
    sub.className = 'item-sub';
    sub.textContent = rec.url;

    const track = document.createElement('div');
    track.className = 'track';
    const fill = document.createElement('div');
    fill.className = `fill ${fillCls}`;
    fill.style.width = `${pct}%`;
    track.appendChild(fill);

    el.append(top, sub, track);

    if (rec.status === 'running' || rec.status === 'done') {
      const meta = document.createElement('div');
      meta.className = 'item-meta';
      const parts = [`${pct.toFixed(1)}%`];
      if (rec.transferred) parts.push(rec.transferred);
      if (rec.speed && rec.status === 'running') parts.push(rec.speed);
      if (rec.eta != null && rec.status === 'running') parts.push(`${t('left')} ${fmtEta(rec.eta)}`);
      parts.forEach((p) => { const s = document.createElement('span'); s.textContent = p; meta.appendChild(s); });
      el.appendChild(meta);
    }

    if (rec.status === 'installing' && rec.installStep) {
      const m = document.createElement('div');
      m.className = 'item-meta';
      m.textContent = rec.installStep;
      el.appendChild(m);
    }

    if (rec.error) {
      const err = document.createElement('div');
      err.className = 'item-error';
      err.textContent = rec.error === 'not_logged_in' ? t('notLoggedInShort') : rec.error;
      el.appendChild(err);
    }

    if (rec.status === 'done' && rec.file && isVideo(rec.file.path)) el.appendChild(tools(rec));

    list.appendChild(el);
  }
}

// ── banners ────────────────────────────────────────────────────────
async function showLoginBanner() {
  const cmd = await window.tgrab.loginCommand();
  $('#banner-title').textContent = t('needLoginTitle');
  $('#banner-text').textContent = t('needLoginText');
  const code = $('#banner-code');
  code.textContent = cmd;
  code.classList.remove('hidden');
  $('#banner-copy').classList.remove('hidden');
  $('#banner-copy').onclick = () => navigator.clipboard.writeText(cmd);
  $('#banner-terminal').classList.remove('hidden');
  $('#banner-terminal').onclick = async () => {
    const r = await window.tgrab.openLoginTerminal();
    if (!r.ok) navigator.clipboard.writeText(cmd);
    pollLogin();
  };
  $('#banner').classList.remove('hidden');
}

// The user finishes logging in outside the app, so watch for it and clear the banner
// instead of making them restart.
let loginTimer = null;
function pollLogin() {
  clearInterval(loginTimer);
  loginTimer = setInterval(async () => {
    if (await window.tgrab.checkLogin()) {
      clearInterval(loginTimer);
      $('#banner').classList.add('hidden');
    }
  }, 2000);
}

function showInfoBanner(text) {
  $('#banner-title').textContent = '';
  $('#banner-text').textContent = text;
  $('#banner-code').classList.add('hidden');
  $('#banner-copy').classList.add('hidden');
  $('#banner').classList.remove('hidden');
}

// ── settings panel ─────────────────────────────────────────────────
function syncPanel() {
  $('#s-dest').value = settings.dest || '';
  $('#s-template').value = settings.template || TEMPLATES.default;
  $('#s-threads').value = settings.threads ?? 4;
  $('#s-conc').value = settings.concurrent ?? 2;
  $('#v-threads').textContent = settings.threads ?? 4;
  $('#v-conc').textContent = settings.concurrent ?? 2;
  $('#s-proxy').value = settings.proxy || '';
  $('#s-tdl').value = settings.tdlPath || '';
  $('#s-clean').checked = !!settings.cleanOnQuit;
  $$('#s-theme button').forEach((b) => b.classList.toggle('on', b.dataset.theme === (settings.theme || 'system')));
  $$('#s-lang button').forEach((b) => b.classList.toggle('on', b.dataset.lang === lang));
  $$('.chip').forEach((c) => c.classList.toggle('on', TEMPLATES[c.dataset.preset] === settings.template));
  $('#dest').value = settings.dest || '';
}

async function patch(p) {
  settings = await window.tgrab.setSettings(p);
  syncPanel();
}

// ── boot ───────────────────────────────────────────────────────────
async function boot() {
  settings = await window.tgrab.getSettings();

  if (!settings.lang) {
    $('#lang-gate').classList.remove('hidden');
    $$('.lang-btn').forEach((b) => {
      b.onclick = async () => {
        lang = b.dataset.lang;
        await patch({ lang });
        $('#lang-gate').classList.add('hidden');
        $('#app').classList.remove('hidden');
        applyI18n();
        afterReady();
      };
    });
    return;
  }

  lang = settings.lang;
  $('#app').classList.remove('hidden');
  applyI18n();
  afterReady();
}

async function afterReady() {
  syncPanel();
  const st = await window.tgrab.status();
  if (!st.loggedIn) showLoginBanner();

  for (const rec of await window.tgrab.list()) items.set(rec.id, rec);
  render();
}

// ── events ─────────────────────────────────────────────────────────
window.tgrab.onUpdate((rec) => { items.set(rec.id, { ...items.get(rec.id), ...rec }); render(); });
window.tgrab.onInstallProgress(() => { /* surfaced through the record itself */ });

$('#go').onclick = async () => {
  const url = $('#url').value.trim();
  if (!/^(https?:\/\/)?t\.me\//i.test(url)) { showInfoBanner(t('badUrl')); return; }
  $('#banner').classList.add('hidden');
  const customName = $('#custom-name').value.trim();
  const rec = await window.tgrab.start({ url, customName, dest: settings.dest });
  items.set(rec.id, rec);
  if (rec.error === 'not_logged_in') showLoginBanner();
  $('#url').value = '';
  $('#custom-name').value = '';
  render();
};

$('#url').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#go').click(); });

$('#toggle-adv').onclick = () => $('#advanced').classList.toggle('hidden');
$('#pick-dir').onclick = async () => { const d = await window.tgrab.pickDir(); if (d) await patch({ dest: d }); };
$('#s-pick').onclick = async () => { const d = await window.tgrab.pickDir(); if (d) await patch({ dest: d }); };

$('#clear-done').onclick = async () => {
  await window.tgrab.clear();
  for (const [id, r] of items) if (r.status !== 'running') items.delete(id);
  render();
};

$('#open-settings').onclick = () => { syncPanel(); $('#settings-overlay').classList.remove('hidden'); };
$('#close-settings').onclick = () => $('#settings-overlay').classList.add('hidden');
$('#settings-overlay').onclick = (e) => { if (e.target.id === 'settings-overlay') $('#settings-overlay').classList.add('hidden'); };

$('#banner-dismiss').onclick = () => $('#banner').classList.add('hidden');

$('#lang-toggle').onclick = async () => { lang = lang === 'en' ? 'ru' : 'en'; await patch({ lang }); applyI18n(); };

$('#s-threads').oninput = (e) => { $('#v-threads').textContent = e.target.value; };
$('#s-threads').onchange = (e) => patch({ threads: +e.target.value });
$('#s-conc').oninput = (e) => { $('#v-conc').textContent = e.target.value; };
$('#s-conc').onchange = (e) => patch({ concurrent: +e.target.value });
$('#s-template').onchange = (e) => patch({ template: e.target.value });
$('#s-proxy').onchange = (e) => patch({ proxy: e.target.value.trim() });
$('#s-tdl').onchange = (e) => patch({ tdlPath: e.target.value.trim() });
$('#s-clean').onchange = (e) => patch({ cleanOnQuit: e.target.checked });

$$('.chip').forEach((c) => { c.onclick = () => patch({ template: TEMPLATES[c.dataset.preset] }); });
$$('#s-theme button').forEach((b) => { b.onclick = () => patch({ theme: b.dataset.theme }); });
$$('#s-lang button').forEach((b) => {
  b.onclick = async () => { lang = b.dataset.lang; await patch({ lang }); applyI18n(); };
});

$('#clean-now').onclick = async () => {
  await window.tgrab.cleanSession();
  showInfoBanner(t('cleaned'));
};

const TG = 'https://t.me/kr1ke';
const REPO = 'https://github.com/kr1ke/tgrab';
$('#tg-link').onclick = () => window.tgrab.openExternal(TG);
$('#tg-link-2').onclick = () => window.tgrab.openExternal(TG);
$('#repo-link').onclick = () => window.tgrab.openExternal(REPO);

boot();
