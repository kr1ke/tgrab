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
    signIn: 'Connect your Telegram',
    signInSub: 'tgrab imports the session already signed in on Telegram Desktop. No phone number, no code, no password — nothing leaves this machine.',
    closeDesktop: 'Quit Telegram Desktop first — its session files are being read.',
    connect: 'Connect', pickAccount: 'Choose an account', retry: 'Try again', later: 'Later',
    lgStarting: 'Reading the desktop session…',
    lgImporting: 'Importing…',
    lgFinishing: 'Finishing up — keeping your desktop session signed in.',
    lgDone: 'Connected.',
    lg2fa: 'This account asks for its cloud password. tgrab will not collect it — finish in a terminal.',
    connectBtn: 'Connect Telegram',
    modeSingle: 'One message', modeChannel: 'Whole channel',
    channelLabel: 'Channel or chat', howMuch: 'How much',
    cmLast: 'Latest', cmDates: 'Dates', cmRange: 'Message range',
    postsCount: 'Number of posts', dateRange: 'Date range', msgRange: 'Message ids',
    whatToTake: 'What to take',
    tVideo: 'Video', tAudio: 'Audio', tPhoto: 'Photos', tDocs: 'Documents', tAll: 'Everything',
    needChat: 'Enter a channel name, like @durov.',
    format: 'Format', quality: 'Quality', stListing: 'listing posts',
    qrHint: 'Telegram → Settings → Devices → Link Desktop Device, then scan this.',
    noDesktop: 'Telegram Desktop was not found on this computer. You can sign in by scanning a QR code with the Telegram app on your phone instead.',
    useQr: 'Sign in with a QR code', getDesktop: 'Get Telegram Desktop',
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
    signIn: 'Подключите Telegram',
    signInSub: 'tgrab возьмёт сессию, под которой вы уже вошли в Telegram Desktop. Без номера, без кода, без пароля — ничего не покидает этот компьютер.',
    closeDesktop: 'Сначала закройте Telegram Desktop — читаются его файлы сессии.',
    connect: 'Подключить', pickAccount: 'Выберите аккаунт', retry: 'Ещё раз', later: 'Позже',
    lgStarting: 'Читаю сессию десктопа…',
    lgImporting: 'Импортирую…',
    lgFinishing: 'Завершаю — сессия в Telegram Desktop останется активной.',
    lgDone: 'Подключено.',
    lg2fa: 'Этот аккаунт запрашивает облачный пароль. tgrab его не собирает — завершите вход в терминале.',
    connectBtn: 'Подключить Telegram',
    modeSingle: 'Одно сообщение', modeChannel: 'Канал целиком',
    channelLabel: 'Канал или чат', howMuch: 'Сколько брать',
    cmLast: 'Последние', cmDates: 'По датам', cmRange: 'Диапазон сообщений',
    postsCount: 'Количество постов', dateRange: 'Диапазон дат', msgRange: 'Номера сообщений',
    whatToTake: 'Что забирать',
    tVideo: 'Видео', tAudio: 'Аудио', tPhoto: 'Фото', tDocs: 'Документы', tAll: 'Всё',
    needChat: 'Укажите канал, например @durov.',
    format: 'Формат', quality: 'Качество', stListing: 'собираю список',
    qrHint: 'Telegram → Настройки → Устройства → Подключить устройство, затем наведите камеру.',
    noDesktop: 'Telegram Desktop на этом компьютере не найден. Можно войти, отсканировав QR-код приложением Telegram на телефоне.',
    useQr: 'Войти по QR-коду', getDesktop: 'Скачать Telegram Desktop',
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
    preparing: t('stPreparing'), installing: t('stInstalling'),
    listing: t('stListing'), cancelled: t('stCancelled') }[s] || s;
}

function shortName(rec) {
  if (rec.file && rec.file.path) return rec.file.path.split(/[\\/]/).pop();
  if (rec.name && rec.name !== rec.url) return rec.name;
  return rec.url.replace(/^https?:\/\//, '');
}

const isVideo = (p) => /\.(mp4|mkv|mov|webm|m4v|avi)$/i.test(p || '');

// A row of verbs; picking one reveals only that verb's options. Nothing is configured
// until it is asked for, and every result is written to a new file.
function tools(rec) {
  const wrap = document.createElement('div');
  wrap.className = 'tools-wrap';

  const row = document.createElement('div');
  row.className = 'tools';
  const panel = document.createElement('div');
  panel.className = 'tool-panel hidden';

  const run = (op, params) => window.tgrab.process({ file: rec.file.path, op, params })
    .then((r) => { items.set(r.id, r); render(); });

  const btn = (label, onClick, cls) => {
    const b = document.createElement('button');
    b.className = `tool-btn${cls ? ' ' + cls : ''}`;
    b.textContent = label;
    b.onclick = onClick;
    return b;
  };

  const chips = (opts, onPick) => {
    const box = document.createElement('div');
    box.className = 'preset-row';
    opts.forEach(([label, value]) => {
      box.appendChild(btn(label, () => onPick(value), 'tool-mini'));
    });
    return box;
  };

  let open = null;
  const show = (name, build) => {
    if (open === name) { panel.classList.add('hidden'); open = null; return; }
    open = name;
    panel.innerHTML = '';
    panel.appendChild(build());
    panel.classList.remove('hidden');
  };

  row.append(
    btn(t('audioOnly'), () => run('audio', {})),
    btn(t('compress'), () => show('q', () =>
      chips([['1080p', 1080], ['720p', 720], ['480p', 480], ['360p', 360]],
        (q) => run('compress', { quality: q })))),
    btn(t('format'), () => show('f', () =>
      chips([['MP4', 'mp4'], ['MKV', 'mkv'], ['WebM', 'webm'], ['MP3', 'mp3'], ['M4A', 'm4a']],
        (c) => run('format', { container: c })))),
    btn(t('speedUp'), () => show('s', () =>
      chips([['1.25×', 1.25], ['1.5×', 1.5], ['2×', 2]],
        (f) => run('speed', { factor: f })))),
    btn(t('trim'), () => show('t', () => trimPanel(rec, run))),
  );

  wrap.append(row, panel);
  return wrap;
}

// Trim works two ways at once: drag the bar, or type the times. Each edits the same
// values, so whichever the user reaches for, the other stays in sync.
function trimPanel(rec, run) {
  const box = document.createElement('div');
  box.className = 'trim-full';

  const scrub = document.createElement('div');
  scrub.className = 'scrub';
  const sel = document.createElement('div');
  sel.className = 'scrub-sel';
  const ticks = document.createElement('div');
  ticks.className = 'scrub-ticks';
  scrub.append(sel, ticks);

  const rowEl = document.createElement('div');
  rowEl.className = 'trim-row';
  const from = Object.assign(document.createElement('input'),
    { type: 'text', className: 'tool-time', value: '0:00' });
  const to = Object.assign(document.createElement('input'),
    { type: 'text', className: 'tool-time', value: '' });
  const go = document.createElement('button');
  go.className = 'tool-btn tool-mini';
  go.textContent = t('apply');
  rowEl.append(from, to, go);

  let dur = 0, a = 0, b = 0;

  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  const paint = () => {
    if (!dur) return;
    sel.style.left = `${(a / dur) * 100}%`;
    sel.style.width = `${((b - a) / dur) * 100}%`;
    ticks.innerHTML = `<span>${fmt(a)}</span><span>${fmt(b)}</span>`;
  };

  window.tgrab.duration(rec.file.path).then((d) => {
    dur = d || 0;
    if (!dur) { scrub.style.display = 'none'; return; }
    a = 0; b = dur;
    from.value = fmt(a); to.value = fmt(b);
    paint();
  });

  // Click sets the near edge — simpler than drag handles and hard to get wrong.
  scrub.onclick = (e) => {
    if (!dur) return;
    const r = scrub.getBoundingClientRect();
    const at = Math.max(0, Math.min(dur, ((e.clientX - r.left) / r.width) * dur));
    if (Math.abs(at - a) <= Math.abs(at - b)) { a = Math.min(at, b - 1); from.value = fmt(a); }
    else { b = Math.max(at, a + 1); to.value = fmt(b); }
    paint();
  };

  const sync = () => {
    const na = parseInt(norm(from.value), 10);
    const nb = parseInt(norm(to.value), 10);
    if (!isNaN(na)) a = Math.max(0, dur ? Math.min(na, dur) : na);
    if (!isNaN(nb)) b = dur ? Math.min(nb, dur) : nb;
    paint();
  };
  from.onchange = sync;
  to.onchange = sync;

  go.onclick = () => run('trim', { start: norm(from.value), end: norm(to.value) });

  box.append(scrub, rowEl);
  return box;
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
  document.documentElement.dataset.platform = st.platform || '';

  if (!st.loggedIn) {
    // With a PTY available the app can run the whole exchange itself; without one,
    // fall back to handing the command over.
    if (await window.tgrab.loginAutomated()) openLogin();
    else showLoginBanner();
  }

  for (const rec of await window.tgrab.list()) items.set(rec.id, rec);
  render();
}

// ── sign in ────────────────────────────────────────────────────────
const loginSteps = ['close', 'busy', 'pick', 'fail', 'qr', 'nodesktop'];
function loginStep(name) {
  loginSteps.forEach((s) => $(`#login-step-${s}`).classList.toggle('hidden', s !== name));
}
async function openLogin() {
  // No Telegram Desktop means there is no session to import — say so and offer QR
  // rather than starting something that cannot work.
  loginStep(await window.tgrab.hasDesktop() ? 'close' : 'nodesktop');
  $('#login-overlay').classList.remove('hidden');
}
function closeLogin() { $('#login-overlay').classList.add('hidden'); }

$('#login-go').onclick = async () => {
  loginStep('busy');
  $('#login-status').textContent = t('lgStarting');
  const r = await window.tgrab.loginStart({});
  if (!r.ok) {
    loginStep('fail');
    $('#login-error').textContent = r.error;
  }
};

$('#login-qr-go').onclick = async () => {
  loginStep('busy');
  $('#login-status').textContent = t('lgStarting');
  const r = await window.tgrab.loginStart({ mode: 'qr' });
  if (!r.ok) { loginStep('fail'); $('#login-error').textContent = r.error; }
};
$('#login-get-desktop').onclick = () => window.tgrab.openExternal('https://desktop.telegram.org/');

$('#login-close').onclick = () => { window.tgrab.loginCancel(); closeLogin(); };
$('#login-retry').onclick = () => loginStep('close');
$('#login-terminal').onclick = async () => { await window.tgrab.openLoginTerminal(); pollLogin(); closeLogin(); };

window.tgrab.onLoginEvent((p) => {
  if (p.phase === 'choosing') {
    loginStep('pick');
    const box = $('#login-accounts');
    box.innerHTML = '';
    p.accounts.forEach((id, i) => {
      const b = document.createElement('button');
      b.className = 'account-btn';
      b.textContent = id;
      b.onclick = () => { loginStep('busy'); $('#login-status').textContent = t('lgImporting'); window.tgrab.loginChoose(i); };
      box.appendChild(b);
    });
    return;
  }
  if (p.phase === 'qr') { loginStep('qr'); $('#login-qr').textContent = p.qr; return; }
  if (p.phase === 'importing') { loginStep('busy'); $('#login-status').textContent = t('lgImporting'); return; }
  if (p.phase === 'finishing') { loginStep('busy'); $('#login-status').textContent = t('lgFinishing'); return; }
  if (p.phase === 'needs2fa') { loginStep('fail'); $('#login-error').textContent = t('lg2fa'); return; }
  if (p.phase === 'done') {
    $('#login-status').textContent = t('lgDone');
    $('#banner').classList.add('hidden');
    setTimeout(closeLogin, 700);
    return;
  }
  if (p.phase === 'failed') { loginStep('fail'); $('#login-error').textContent = p.error || ''; }
});

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

// Single-message download stays the default and the headline capability; whole-channel
// is the second tab, not the first.
$$('#mode-tabs .mode-tab').forEach((tab) => {
  tab.onclick = () => {
    $$('#mode-tabs .mode-tab').forEach((x) => x.classList.toggle('on', x === tab));
    const channel = tab.dataset.mode === 'channel';
    $('#pane-channel').classList.toggle('hidden', !channel);
    $('#pane-single').classList.toggle('hidden', channel);
  };
});

$$('#ch-mode button').forEach((b) => {
  b.onclick = () => {
    $$('#ch-mode button').forEach((x) => x.classList.toggle('on', x === b));
    const m = b.dataset.cmode;
    $('#ch-last').classList.toggle('hidden', m !== 'last');
    $('#ch-time').classList.toggle('hidden', m !== 'time');
    $('#ch-id').classList.toggle('hidden', m !== 'id');
  };
});

$$('#ch-types .chip').forEach((c) => {
  c.onclick = () => {
    // "Everything" is exclusive; the rest are a multi-select.
    if (c.dataset.ext === '') $$('#ch-types .chip').forEach((x) => x.classList.toggle('on', x === c));
    else {
      $$('#ch-types .chip').forEach((x) => { if (x.dataset.ext === '') x.classList.remove('on'); });
      c.classList.toggle('on');
      if (!$$('#ch-types .chip.on').length) c.classList.add('on');
    }
  };
});

$('#ch-count').oninput = (e) => { $('#v-count').textContent = e.target.value; };

$('#go-channel').onclick = async () => {
  const chat = $('#chat').value.trim();
  if (!chat) { showInfoBanner(t('needChat')); return; }
  $('#banner').classList.add('hidden');

  const mode = $('#ch-mode button.on').dataset.cmode;
  const types = $$('#ch-types .chip.on').map((c) => c.dataset.ext).filter(Boolean).join(',');
  const toUnix = (v) => (v ? Math.floor(new Date(v).getTime() / 1000) : 0);

  const rec = await window.tgrab.startChannel({
    chat, mode,
    count: +$('#ch-count').value,
    fromDate: toUnix($('#ch-from').value),
    toDate: toUnix($('#ch-to').value) || Math.floor(Date.now() / 1000),
    minId: $('#ch-min').value.trim() || '1',
    maxId: $('#ch-max').value.trim() || '999999',
    types: types ? types.split(',') : [],
    dest: settings.dest,
  });
  items.set(rec.id, rec);
  if (rec.error === 'not_logged_in') openLogin();
  render();
};

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
