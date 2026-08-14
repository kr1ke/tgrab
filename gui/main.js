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

// ───────────────────── post-download processing ─────────────────────
// ffmpeg is bundled rather than fetched: unlike tdl it is a library-style dependency
// with no interactive step, and asking a GUI user to install it would defeat the point.
// Packaged builds run it from app.asar.unpacked, hence the path rewrite.

function binFromModule(mod) {
  try {
    let p = require(mod);
    if (p && typeof p === 'object' && p.path) p = p.path;
    if (!p) return null;
    return app.isPackaged ? p.replace('app.asar', 'app.asar.unpacked') : p;
  } catch { return null; }
}
const ffmpegBin = () => binFromModule('ffmpeg-static');
const ffprobeBin = () => binFromModule('ffprobe-static');

function probeDuration(file) {
  return new Promise((resolve) => {
    const bin = ffprobeBin();
    if (!bin) return resolve(0);
    execFile(bin, ['-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', file], (err, out) => {
      resolve(err ? 0 : parseFloat(String(out).trim()) || 0);
    });
  });
}

// Output always goes to a NEW file — the original download is never overwritten.
function suffixed(file, suffix, ext) {
  const dir = path.dirname(file);
  const base = path.basename(file, path.extname(file));
  return path.join(dir, `${base}_${suffix}${ext || path.extname(file)}`);
}

function opArgs(op, params, input, output) {
  switch (op) {
    case 'audio':
      return ['-i', input, '-vn', '-c:a', 'aac', '-b:a', '192k', '-y', output];
    case 'compress':
      // 720p / CRF 28 is the "obviously smaller, still fine" point for talk-style video.
      return ['-i', input, '-vf', 'scale=-2:min(720\\,ih)', '-c:v', 'libx264',
        '-crf', '28', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '128k', '-y', output];
    case 'speed': {
      const n = Math.min(2, Math.max(1.05, parseFloat(params.factor) || 1.5));
      // atempo is only valid across 0.5–2.0, which the clamp above already guarantees.
      return ['-i', input, '-filter_complex',
        `[0:v]setpts=PTS/${n}[v];[0:a]atempo=${n}[a]`,
        '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-crf', '23',
        '-preset', 'veryfast', '-c:a', 'aac', '-y', output];
    }
    case 'trim': {
      // Stream copy keeps this instant even on a 250 MB file; cuts land on the nearest
      // keyframe, which is what every simple trimmer does and what users expect here.
      const a = ['-ss', String(params.start || '0')];
      if (params.end) a.push('-to', String(params.end));
      return [...a, '-i', input, '-c', 'copy', '-avoid_negative_ts', 'make_zero', '-y', output];
    }
    default:
      return null;
  }
}

async function startProcess({ file, op, params }) {
  const id = nextId++;
  const bin = ffmpegBin();
  const labels = { audio: 'audio', compress: 'small', speed: `${params.factor || 1.5}x`, trim: 'trim' };
  const ext = op === 'audio' ? '.m4a' : null;
  const output = suffixed(file, labels[op] || op, ext);

  const rec = {
    id, kind: 'convert', op, url: path.basename(file),
    name: path.basename(output), dest: path.dirname(file),
    status: 'running', percent: 0, transferred: null, speed: null, eta: null, error: null,
  };
  downloads.set(id, rec);
  push(rec);

  if (!bin) { rec.status = 'failed'; rec.error = 'ffmpeg unavailable'; push(rec); return rec; }

  const total = await probeDuration(file);
  const args = opArgs(op, params || {}, file, output);
  if (!args) { rec.status = 'failed'; rec.error = `unknown operation: ${op}`; push(rec); return rec; }

  const child = spawn(bin, ['-hide_banner', '-nostdin', ...args], { windowsHide: true });
  rec._child = child;
  let tail = '';

  child.stderr.on('data', (d) => {
    tail = (tail + d.toString()).slice(-4000);
    const m = /time=(\d+):(\d+):(\d+\.?\d*)/g;
    let last = null, x;
    while ((x = m.exec(tail)) !== null) last = x;
    if (last && total > 0) {
      const done = (+last[1]) * 3600 + (+last[2]) * 60 + parseFloat(last[3]);
      rec.percent = Math.min(99.9, (done / total) * 100);
      push(rec);
    }
  });

  child.on('close', (code) => {
    if (code === 0 && fs.existsSync(output)) {
      rec.status = 'done';
      rec.percent = 100;
      rec.file = { path: output, size: fs.statSync(output).size };
    } else {
      rec.status = 'failed';
      const m = tail.match(/^\s*(?:\[.*?\]\s*)?(Error|Invalid|Unknown|No such).*/mi);
      rec.error = m ? m[0].trim() : `ffmpeg exited with code ${code}`;
    }
    push(rec);
  });

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

ipcMain.handle('media:process', async (_e, payload) => {
  const rec = await startProcess(payload);
  const { _child, ...safe } = rec;
  return safe;
});

ipcMain.handle('media:available', () => !!ffmpegBin());

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

// `tdl login` is an arrow-key account picker that needs a real TTY, which an Electron
// window does not have. Rather than fake it and hang on stdin, the app hands the command
// over — and can open a terminal with it already typed, so the user never copies anything.
// The proper fix is an embedded PTY (node-pty + xterm.js); that needs native prebuilds
// per platform, so it is deliberately deferred.
ipcMain.handle('login:command', () => `"${findTdl() || 'tdl'}" login -T desktop`);

ipcMain.handle('login:openTerminal', async () => {
  const cmd = `"${findTdl() || 'tdl'}" login -T desktop`;
  try {
    if (IS_MAC) {
      // osascript avoids writing a temp script and handles quoting predictably.
      const escaped = cmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      await new Promise((resolve, reject) =>
        execFile('osascript', ['-e', `tell application "Terminal" to do script "${escaped}"`,
          '-e', 'tell application "Terminal" to activate'],
        (e) => (e ? reject(e) : resolve())));
      return { ok: true };
    }
    if (IS_WIN) {
      await new Promise((resolve, reject) =>
        execFile('cmd.exe', ['/c', 'start', 'cmd.exe', '/k', cmd], (e) => (e ? reject(e) : resolve())));
      return { ok: true };
    }
    // Linux desktops disagree on which terminal exists; try the common ones in order.
    const candidates = [
      ['x-terminal-emulator', ['-e', 'bash', '-c', `${cmd}; exec bash`]],
      ['gnome-terminal', ['--', 'bash', '-c', `${cmd}; exec bash`]],
      ['konsole', ['-e', 'bash', '-c', `${cmd}; exec bash`]],
      ['xfce4-terminal', ['-e', `bash -c '${cmd}; exec bash'`]],
      ['xterm', ['-e', `bash -c '${cmd}; exec bash'`]],
    ];
    for (const [bin, args] of candidates) {
      const ok = await new Promise((resolve) => execFile(bin, args, (e) => resolve(!e)));
      if (ok) return { ok: true };
    }
    return { ok: false, error: 'no terminal emulator found' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// The banner needs to disappear once the user finishes logging in elsewhere.
ipcMain.handle('login:check', () => isLoggedIn());

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
