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

// Quality presets, named by the thing users actually pick: a resolution.
const QUALITY = {
  1080: { h: 1080, crf: '26', ab: '160k' },
  720: { h: 720, crf: '28', ab: '128k' },
  480: { h: 480, crf: '30', ab: '96k' },
  360: { h: 360, crf: '32', ab: '80k' },
};

const CONTAINERS = {
  // Copy the streams where the container accepts them — instant, no quality loss.
  mp4: ['-c', 'copy', '-movflags', '+faststart'],
  mkv: ['-c', 'copy'],
  // WebM has no h264/aac, so this one genuinely re-encodes and is slow.
  webm: ['-c:v', 'libvpx-vp9', '-crf', '34', '-b:v', '0', '-c:a', 'libopus'],
  mp3: ['-vn', '-c:a', 'libmp3lame', '-b:a', '192k'],
  m4a: ['-vn', '-c:a', 'aac', '-b:a', '192k'],
};

function opArgs(op, params, input, output) {
  switch (op) {
    case 'audio':
      return ['-i', input, '-vn', '-c:a', 'aac', '-b:a', '192k', '-y', output];
    case 'compress': {
      const q = QUALITY[params.quality] || QUALITY[720];
      return ['-i', input, '-vf', `scale=-2:min(${q.h}\\,ih)`, '-c:v', 'libx264',
        '-crf', q.crf, '-preset', 'veryfast', '-c:a', 'aac', '-b:a', q.ab, '-y', output];
    }
    case 'format': {
      const c = CONTAINERS[params.container] || CONTAINERS.mp4;
      return ['-i', input, ...c, '-y', output];
    }
    case 'speed': {
      const n = Math.min(2, Math.max(1.05, parseFloat(params.factor) || 1.5));
      // atempo is only valid across 0.5–2.0, which the clamp above already guarantees.
      return ['-i', input, '-filter_complex',
        `[0:v]setpts=PTS/${n}[v];[0:a]atempo=${n}[a]`,
        '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-crf', '23',
        '-preset', 'veryfast', '-c:a', 'aac', '-y', output];
    }
    case 'trim': {
      // Seek before -i so the decoder skips ahead cheaply, then re-encode the selection.
      // Stream copy would be instant but can only cut on keyframes: a 2s→5s trim of a
      // sparsely-keyframed file came back as 0s→5s in testing. Cutting where the user
      // actually asked is worth the encode.
      const s = Math.max(0, parseFloat(params.start) || 0);
      const e = params.end === '' || params.end == null ? null : parseFloat(params.end);
      const a = ['-ss', String(s), '-i', input];
      if (e !== null && !isNaN(e) && e > s) a.push('-t', String(e - s));
      return [...a, '-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast',
        '-c:a', 'aac', '-b:a', '160k', '-y', output];
    }
    default:
      return null;
  }
}

async function startProcess({ file, op, params }) {
  const id = nextId++;
  const bin = ffmpegBin();
  const labels = {
    audio: 'audio',
    compress: `${(params && params.quality) || 720}p`,
    speed: `${(params && params.factor) || 1.5}x`,
    trim: 'trim',
    format: (params && params.container) || 'mp4',
  };
  const ext = op === 'audio' ? '.m4a'
    : op === 'format' ? `.${(params && params.container) || 'mp4'}`
    : null;
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
ipcMain.handle('media:duration', (_e, file) => probeDuration(file));

// Bulk: export a message list, then hand it to the downloader. This is the whole reason
// tdl beats saving by hand, so it gets a first-class place in the UI rather than a flag.
ipcMain.handle('channel:start', async (_e, opts) => {
  const { chat, mode, count, fromDate, toDate, minId, maxId, types } = opts;
  const dest = opts.dest || settings.dest;
  const id = nextId++;
  const rec = {
    id, kind: 'channel', url: chat, name: chat, dest,
    status: 'preparing', percent: 0, transferred: null, speed: null, eta: null, error: null,
  };
  downloads.set(id, rec);
  push(rec);

  let tdl = findTdl();
  if (!tdl) {
    try { rec.status = 'installing'; push(rec); tdl = await installTdl(); }
    catch (e) { rec.status = 'failed'; rec.error = `tdl unavailable: ${e.message}`; push(rec); return strip(rec); }
  }
  if (!isLoggedIn()) { rec.status = 'failed'; rec.error = 'not_logged_in'; push(rec); return strip(rec); }
  try { fs.mkdirSync(dest, { recursive: true }); }
  catch (e) { rec.status = 'failed'; rec.error = e.message; push(rec); return strip(rec); }

  const exportFile = path.join(app.getPath('temp'), `tgrab-export-${id}.json`);
  const exp = ['chat', 'export', '-c', chat, '-o', exportFile];
  if (mode === 'last') exp.push('-T', 'last', '-i', String(count || 50));
  else if (mode === 'time') exp.push('-T', 'time', '-i', `${fromDate},${toDate}`);
  else if (mode === 'id') exp.push('-T', 'id', '-i', `${minId},${maxId}`);
  else exp.push('-T', 'last', '-i', String(count || 50));

  rec.status = 'listing';
  push(rec);

  const okExport = await new Promise((resolve) => {
    execFile(tdl, exp, { maxBuffer: 1 << 24 }, (err) => resolve(!err));
  });
  if (!okExport) { rec.status = 'failed'; rec.error = 'export failed — check the chat name'; push(rec); return strip(rec); }

  const args = ['dl', '-f', exportFile, '-d', dest, '--template', settings.template || DEFAULT_TEMPLATE,
    '-t', String(settings.threads || 4), '-l', String(settings.concurrent || 2)];
  if (types && types.length) args.push('-i', types.join(','));
  if (settings.proxy) args.push('--proxy', settings.proxy);

  const child = spawn(tdl, args, { windowsHide: true });
  rec._child = child;
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
    if (code === 0 || /done!/.test(clean)) { rec.status = 'done'; rec.percent = 100; }
    else {
      rec.status = 'failed';
      const m = clean.match(/(?:Error|error):\s*(.+)/);
      rec.error = m ? m[1].trim() : `exited with code ${code}`;
    }
    try { fs.unlinkSync(exportFile); } catch { /* best effort */ }
    push(rec);
  });

  return strip(rec);
});

const strip = (r) => { const { _child, ...safe } = r; return safe; };

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

// ───────────────────────────── login ────────────────────────────────
// `tdl login` is a TUI: it refuses a plain pipe with EOF and only runs against a real
// terminal. node-pty gives it one, so the app can drive the whole exchange itself.
//
// tdl asks TWO questions, and the second one matters far more than the first:
//   1. "Choose a user id"                        — arrow keys + Enter
//   2. "Do you want to logout existing desktop session? (y/N)"
// Answering (2) with "y" SIGNS THE USER OUT OF TELEGRAM DESKTOP. It is always answered
// "n" here, explicitly, never by letting a stray keystroke fall through to the default.

// Two ways to get a terminal, preferred in order:
//   1. node-pty — works everywhere including Windows, but it is a native module and CI
//      has to compile it. It is an OPTIONAL dependency: if a runner cannot build it the
//      app still ships, and that platform quietly uses the next option.
//   2. the system `script` utility — no build step, but macOS/Linux only.
// Windows with no node-pty has neither, and falls back to opening a real terminal.
let nodePty = null;
try { nodePty = require('node-pty'); } catch { nodePty = null; }

const PTY_OK = !!nodePty || !IS_WIN;

function spawnViaPty(bin, args) {
  if (nodePty) {
    const term = nodePty.spawn(bin, args, {
      name: 'xterm-color', cols: 100, rows: 34, cwd: os.homedir(), env: process.env,
    });
    // Adapt node-pty's shape to the child_process one used below.
    return {
      stdin: { write: (s) => term.write(s) },
      stdout: { on: (ev, cb) => ev === 'data' && term.onData(cb) },
      stderr: { on: () => {} },
      on: (ev, cb) => { if (ev === 'close') term.onExit(({ exitCode }) => cb(exitCode)); },
      kill: () => term.kill(),
    };
  }
  if (IS_MAC) return spawn('script', ['-q', '/dev/null', bin, ...args], { stdio: 'pipe' });
  const cmd = [bin, ...args].map((a) => `'${String(a).replace(/'/g, `'\\''`)}'`).join(' ');
  return spawn('script', ['-qec', cmd, '/dev/null'], { stdio: 'pipe' });
}

// Where Telegram Desktop keeps its session, per platform. Without this directory there is
// nothing to import, and the app must offer QR sign-in instead of pretending otherwise.
function tdataPath() {
  if (IS_MAC) return path.join(os.homedir(), 'Library', 'Application Support', 'Telegram Desktop', 'tdata');
  if (IS_WIN) return path.join(process.env.APPDATA || '', 'Telegram Desktop', 'tdata');
  return path.join(os.homedir(), '.local', 'share', 'TelegramDesktop', 'tdata');
}

function hasDesktopSession() {
  try { return fs.readdirSync(tdataPath()).length > 0; } catch { return false; }
}

ipcMain.handle('login:hasDesktop', () => hasDesktopSession());

let loginSession = null;

const stripCtl = (s) => s.replace(/\[[0-9;?]*[a-zA-Z]/g, '').replace(/[78]/g, '');

function emitLogin(payload) {
  if (win && !win.isDestroyed()) win.webContents.send('login:event', payload);
}

ipcMain.handle('login:automated', () => PTY_OK);

ipcMain.handle('login:start', async (_e, opts = {}) => {
  if (!PTY_OK) return { ok: false, error: 'pty_unavailable' };
  if (loginSession) return { ok: false, error: 'already_running' };

  const tdl = findTdl() || (await installTdl().catch(() => null));
  if (!tdl) return { ok: false, error: 'tdl_unavailable' };

  // QR sign-in is the fallback when Telegram Desktop is not installed: tdl prints a QR
  // block to the terminal, the user scans it in the phone app. No code, no password —
  // the app never handles a credential either way.
  const qr = opts.mode === 'qr' || !hasDesktopSession();
  const args = qr ? ['login', '-T', 'qr'] : ['login', '-T', 'desktop'];
  if (!qr && opts.passcode) args.push('-p', opts.passcode);

  const child = spawnViaPty(tdl, args);
  const term = {
    write: (s) => { try { child.stdin.write(s); } catch { /* exited */ } },
    kill: () => { try { child.kill('SIGTERM'); } catch { /* already gone */ } },
  };

  const state = { term, child, buf: '', phase: 'starting', accounts: [], picked: false,
    logoutAnswered: false, qr, qrSent: false };
  loginSession = state;

  const settle = () => {
    // The picker redraws as it renders; give it a moment before reading the list.
    if (state.picked) return;
    const lines = stripCtl(state.buf).split(/\r?\n/);
    const ids = [];
    for (const l of lines) {
      const m = l.match(/^\s*[>❯»]?\s*(\d{5,})\s*$/);
      if (m && !ids.includes(m[1])) ids.push(m[1]);
    }
    state.accounts = ids;
    if (ids.length <= 1) {
      state.picked = true;
      state.phase = 'importing';
      emitLogin({ phase: 'importing', accounts: ids });
      term.write('\r');
    } else {
      state.phase = 'choosing';
      emitLogin({ phase: 'choosing', accounts: ids });
    }
  };

  const onChunk = (d) => {
    state.buf = (state.buf + d.toString()).slice(-16000);
    const clean = stripCtl(state.buf);

    // The QR is drawn with block characters; forward the block itself to the renderer,
    // which shows it monospace so a phone camera can read it.
    if (state.qr) {
      const block = clean.split('\n').filter((l) => /[█▀▄ ]{8,}/.test(l));
      if (block.length >= 8) {
        state.qrSent = true;
        emitLogin({ phase: 'qr', qr: block.join('\n') });
      }
      if (/successfully|Welcome/i.test(clean)) emitLogin({ phase: 'importing' });
    }

    if (!state.qr && state.phase === 'starting' && /Choose a user id/i.test(clean)) {
      state.phase = 'listing';
      setTimeout(settle, 700);
      return;
    }

    // Always decline. "y" here logs the user out of Telegram Desktop.
    if (!state.logoutAnswered && /logout existing desktop session/i.test(clean)) {
      state.logoutAnswered = true;
      emitLogin({ phase: 'finishing' });
      term.write('n\r');
      return;
    }

    if (/password/i.test(clean) && !/passcode/i.test(clean) && state.phase !== 'needs2fa') {
      // tdl asks for the cloud password on some accounts. That is a credential the app
      // must not collect or transmit — hand the user back to a terminal instead.
      state.phase = 'needs2fa';
      emitLogin({ phase: 'needs2fa' });
    }
  };

  child.stdout.on('data', onChunk);
  child.stderr.on('data', onChunk);

  child.on('close', (exitCode) => {
    const clean = stripCtl(state.buf);
    const ok = exitCode === 0 || /successfully/i.test(clean);
    loginSession = null;
    if (ok && isLoggedIn()) emitLogin({ phase: 'done' });
    else {
      const m = clean.match(/(?:Error|error):\s*(.+)/);
      emitLogin({ phase: 'failed', error: m ? m[1].trim() : `exited with code ${exitCode}` });
    }
  });

  return { ok: true };
});

ipcMain.handle('login:choose', (_e, index) => {
  const s = loginSession;
  if (!s || s.picked) return false;
  s.picked = true;
  s.phase = 'importing';
  emitLogin({ phase: 'importing' });
  for (let i = 0; i < index; i++) s.term.write('[B');   // arrow-down per step
  s.term.write('\r');
  return true;
});

ipcMain.handle('login:cancel', () => {
  if (!loginSession) return false;
  try { loginSession.term.kill(); } catch { /* already gone */ }
  loginSession = null;
  return true;
});

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

const ICON = path.join(__dirname, 'build', 'icon.png');

function createWindow() {
  win = new BrowserWindow({
    width: 940, height: 720, minWidth: 720, minHeight: 560,
    icon: fs.existsSync(ICON) ? ICON : undefined,
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
  // Without this the dock/taskbar shows Electron's own icon in development.
  if (IS_MAC && app.dock && fs.existsSync(ICON)) { try { app.dock.setIcon(ICON); } catch { /* not fatal */ } }
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (settings.cleanOnQuit) {
    try { fs.rmSync(path.join(os.homedir(), '.tdl'), { recursive: true, force: true }); } catch { /* best effort */ }
  }
  if (!IS_MAC) app.quit();
});
