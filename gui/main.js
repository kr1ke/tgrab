'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const https = require('node:https');
const crypto = require('node:crypto');
const { spawn, execFile } = require('node:child_process');

const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';

const DEFAULT_TEMPLATE =
  '{{ formatDate .MessageDate "2006-01-02_15-04" }}_{{ if .FileCaption }}{{ filenamify .FileCaption 60 }}_{{ end }}{{ .MessageID }}';

let win = null;
const downloads = new Map(); // id -> record
let nextId = 1;

// ───────────────────────────── settings ─────────────────────────────

const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

const DEFAULTS = {
  lang: null, // null => ask on first run
  dest: path.join(os.homedir(), 'Downloads', 'tgrab'),
  template: DEFAULT_TEMPLATE,
  threads: 4,
  concurrent: 2,
  proxy: '',
  tdlPath: '',
  theme: 'system',
  cleanOnQuit: false,
};

function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(s) {
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2));
    return true;
  } catch {
    return false;
  }
}

let settings = { ...DEFAULTS };

// ─────────────────────────── tdl management ─────────────────────────
// tdl is fetched at runtime rather than bundled: it is AGPL-3.0, and keeping it a
// separate executable the user obtains themselves avoids that licence reaching this
// app's own code. It also keeps the installer small and the tdl version current.

const vendorDir = () => path.join(app.getPath('userData'), 'bin');
const vendorTdl = () => path.join(vendorDir(), IS_WIN ? 'tdl.exe' : 'tdl');

function findTdl() {
  if (settings.tdlPath && fs.existsSync(settings.tdlPath)) return settings.tdlPath;
  if (fs.existsSync(vendorTdl())) return vendorTdl();
  const local = path.join(os.homedir(), '.local', 'bin', IS_WIN ? 'tdl.exe' : 'tdl');
  if (fs.existsSync(local)) return local;
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const p = path.join(dir, IS_WIN ? 'tdl.exe' : 'tdl');
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch { /* keep looking */ }
  }
  return null;
}

function tdlAsset() {
  const a = process.arch;
  if (IS_MAC) return a === 'arm64' ? 'tdl_MacOS_arm64.tar.gz' : 'tdl_MacOS_64bit.tar.gz';
  if (IS_WIN) return a === 'arm64' ? 'tdl_Windows_arm64.zip' : 'tdl_Windows_64bit.zip';
  return a === 'arm64' ? 'tdl_Linux_arm64.tar.gz' : 'tdl_Linux_64bit.tar.gz';
}

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'tgrab' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(get(res.headers.location));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function installTdl(onProgress) {
  const step = (s) => { onProgress && onProgress(s); };
  step('Resolving latest release…');
  const relRaw = await get('https://api.github.com/repos/iyear/tdl/releases/latest');
  const tag = JSON.parse(relRaw.toString()).tag_name;
  const asset = tdlAsset();
  const base = `https://github.com/iyear/tdl/releases/download/${tag}`;

  step(`Downloading ${asset}…`);
  const [bin, sums] = await Promise.all([get(`${base}/${asset}`), get(`${base}/tdl_checksums.txt`)]);

  step('Verifying checksum…');
  const want = sums.toString().split('\n').find((l) => l.trim().endsWith(asset));
  const actual = crypto.createHash('sha256').update(bin).digest('hex');
  if (!want || !want.trim().startsWith(actual)) {
    // Never install an unverified binary. This proves transit integrity only —
    // it does not vouch for the publisher.
    throw new Error('Checksum mismatch — refusing to install');
  }

  step('Extracting…');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tgrab-'));
  const archive = path.join(tmp, asset);
  fs.writeFileSync(archive, bin);
  await new Promise((resolve, reject) => {
    const cmd = asset.endsWith('.zip')
      ? (IS_WIN ? ['powershell', ['-Command', `Expand-Archive -Path "${archive}" -DestinationPath "${tmp}" -Force`]] : ['unzip', ['-o', archive, '-d', tmp]])
      : ['tar', ['xzf', archive, '-C', tmp]];
    execFile(cmd[0], cmd[1], (err) => (err ? reject(err) : resolve()));
  });

  fs.mkdirSync(vendorDir(), { recursive: true });
  const produced = path.join(tmp, IS_WIN ? 'tdl.exe' : 'tdl');
  fs.copyFileSync(produced, vendorTdl());
  if (!IS_WIN) fs.chmodSync(vendorTdl(), 0o755);
  if (IS_MAC) { try { execFile('xattr', ['-d', 'com.apple.quarantine', vendorTdl()], () => {}); } catch { /* best effort */ } }
  fs.rmSync(tmp, { recursive: true, force: true });
  step('Done');
  return vendorTdl();
}

function tdlDataFile() {
  return path.join(os.homedir(), '.tdl', 'data', 'default');
}

function isLoggedIn() {
  try { return fs.statSync(tdlDataFile()).size > 140000; } catch { return false; }
}

// ────────────────────────── download engine ─────────────────────────

const stripAnsi = (s) => s.replace(/\[[0-9;?]*[a-zA-Z]/g, '');

function parseProgress(text) {
  const clean = stripAnsi(text).replace(/\r/g, '\n');
  let percent = null;
  const pcts = clean.match(/([\d.]+)%/g);
  if (pcts && pcts.length) percent = parseFloat(pcts[pcts.length - 1]);
  let transferred = null, elapsed = null, speed = null;
  const re = /\[\s*([\d.]+\s*[KMGT]?i?B)\s+in\s+([\dhms.]+)\s*;\s*([\d.]+\s*[KMGT]?i?B\/s)\s*\]/g;
  let m, last = null;
  while ((m = re.exec(clean)) !== null) last = m;
  if (last) { transferred = last[1]; elapsed = last[2]; speed = last[3]; }
  return { percent, transferred, elapsed, speed };
}

function toSeconds(s) {
  if (!s) return 0;
  let t = 0;
  const h = s.match(/([\d.]+)h/); if (h) t += parseFloat(h[1]) * 3600;
  const m = s.match(/([\d.]+)m/); if (m) t += parseFloat(m[1]) * 60;
  const sec = s.match(/([\d.]+)s/); if (sec) t += parseFloat(sec[1]);
  return t;
}

function push(rec) {
  if (win && !win.isDestroyed()) win.webContents.send('download:update', rec);
}

function sanitizeName(name) {
  return String(name).replace(/[\/\\:*?"<>|]/g, '_').replace(/^\.+/, '').trim().slice(0, 120);
}

async function startDownload({ url, customName, dest }) {
  let tdl = findTdl();
  const id = nextId++;
  const rec = {
    id, url,
    name: customName || url,
    dest: dest || settings.dest,
    status: 'preparing', percent: 0, transferred: null, speed: null, eta: null,
    error: null, startedAt: Date.now(),
  };
  downloads.set(id, rec);
  push(rec);

  if (!tdl) {
    try {
      rec.status = 'installing';
      push(rec);
      tdl = await installTdl((s) => { rec.error = null; rec.installStep = s; push(rec); });
    } catch (e) {
      rec.status = 'failed';
      rec.error = `tdl unavailable: ${e.message}`;
      push(rec);
      return rec;
    }
  }

  if (!isLoggedIn()) {
    rec.status = 'failed';
    rec.error = 'not_logged_in';
    push(rec);
    return rec;
  }

  try { fs.mkdirSync(rec.dest, { recursive: true }); }
  catch (e) { rec.status = 'failed'; rec.error = e.message; push(rec); return rec; }

  // A custom name is applied through tdl's own template, so the file is written
  // correctly the first time instead of being renamed afterwards.
  const template = customName ? sanitizeName(customName) : (settings.template || DEFAULT_TEMPLATE);

  const args = ['dl', '-u', url, '-d', rec.dest, '--template', template,
    '-t', String(settings.threads || 4), '-l', String(settings.concurrent || 2)];
  if (settings.proxy) args.push('--proxy', settings.proxy);

  const child = spawn(tdl, args, { windowsHide: true });
  rec.pid = child.pid;
  rec.status = 'running';
  push(rec);

  let buf = '';
  const onData = (d) => {
    buf += d.toString();
    if (buf.length > 65536) buf = buf.slice(-32768);
    const p = parseProgress(buf);
    if (p.percent !== null) rec.percent = p.percent;
    if (p.transferred) rec.transferred = p.transferred;
    if (p.speed) rec.speed = p.speed;
    const el = toSeconds(p.elapsed);
    rec.eta = (rec.percent > 1 && el > 0) ? Math.round(el * (100 - rec.percent) / rec.percent) : null;
    push(rec);
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);

  child.on('close', (code) => {
    const clean = stripAnsi(buf);
    if (code === 0 || /done!/.test(clean)) {
      rec.status = 'done';
      rec.percent = 100;
      rec.file = findNewestIn(rec.dest);
    } else {
      rec.status = 'failed';
      const m = clean.match(/(?:Error|error):\s*(.+)/);
      rec.error = m ? m[1].trim() : `exited with code ${code}`;
    }
    rec.finishedAt = Date.now();
    push(rec);
  });

  rec._child = child;
  return rec;
}

// tdl stamps files with the ORIGINAL post date, so "newest by mtime" is wrong.
// Pick the most recently *created* entry instead (birthtime), falling back to ctime.
function findNewestIn(dir) {
  try {
    const items = fs.readdirSync(dir)
      .filter((f) => !f.startsWith('.'))
      .map((f) => {
        const p = path.join(dir, f);
        const st = fs.statSync(p);
        return { p, t: st.birthtimeMs || st.ctimeMs, size: st.size };
      })
      .sort((a, b) => b.t - a.t);
    return items.length ? { path: items[0].p, size: items[0].size } : null;
  } catch { return null; }
}

// ─────────────────────────────── IPC ────────────────────────────────

ipcMain.handle('settings:get', () => settings);
ipcMain.handle('settings:set', (_e, patch) => {
  settings = { ...settings, ...patch };
  saveSettings(settings);
  if (patch.theme) applyTheme();
  return settings;
});

ipcMain.handle('app:status', async () => ({
  tdl: findTdl(),
  loggedIn: isLoggedIn(),
  platform: process.platform,
  version: app.getVersion(),
}));

ipcMain.handle('tdl:install', async (e) => {
  try {
    const p = await installTdl((s) => e.sender.send('tdl:install-progress', s));
    return { ok: true, path: p };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('download:start', async (_e, payload) => {
  const rec = await startDownload(payload);
  const { _child, ...safe } = rec;
  return safe;
});

ipcMain.handle('download:cancel', (_e, id) => {
  const rec = downloads.get(id);
  if (rec && rec._child && rec.status === 'running') {
    try { rec._child.kill('SIGTERM'); } catch { /* already gone */ }
    rec.status = 'cancelled';
    push(rec);
    return true;
  }
  return false;
});

ipcMain.handle('download:list', () => {
  return [...downloads.values()].map(({ _child, ...r }) => r);
});

ipcMain.handle('download:clear', () => {
  for (const [id, r] of downloads) if (r.status !== 'running') downloads.delete(id);
  return true;
});

ipcMain.handle('dialog:pickDir', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('shell:reveal', (_e, p) => { if (p) shell.showItemInFolder(p); });
ipcMain.handle('shell:open', (_e, u) => shell.openExternal(u));

ipcMain.handle('session:clean', () => {
  try { fs.rmSync(path.join(os.homedir(), '.tdl'), { recursive: true, force: true }); return true; }
  catch { return false; }
});

// Login is an interactive account picker in a terminal. A GUI cannot drive it,
// so hand the user the exact command instead of pretending to automate it.
ipcMain.handle('login:command', () => {
  const tdl = findTdl() || 'tdl';
  return IS_WIN
    ? `"${tdl}" login -T desktop`
    : `"${tdl}" login -T desktop`;
});

// ───────────────────────────── window ───────────────────────────────

function applyTheme() {
  nativeTheme.themeSource = settings.theme === 'system' ? 'system' : settings.theme;
}

function createWindow() {
  win = new BrowserWindow({
    width: 940, height: 720, minWidth: 720, minHeight: 560,
    titleBarStyle: IS_MAC ? 'hiddenInset' : 'default',
    backgroundColor: '#0e1117',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

app.whenReady().then(() => {
  settings = loadSettings();
  applyTheme();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (settings.cleanOnQuit) {
    try { fs.rmSync(path.join(os.homedir(), '.tdl'), { recursive: true, force: true }); } catch { /* best effort */ }
  }
  if (!IS_MAC) app.quit();
});
