'use strict';
// Renders the real UI and writes one PNG to docs/screenshots/.
// One Electron process per shot — reusing a process races the window loader.
//
//   SHOT=02-downloads npx electron scripts/shoot.js

const { app, BrowserWindow, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const OUT = path.join(__dirname, '..', 'docs', 'screenshots');
const RENDERER = path.join(__dirname, '..', 'gui', 'renderer', 'index.html');

const RECORDS = [
  {
    id: 3, url: 'https://t.me/c/1234567890/318', name: '2026-08-14_09-02_Weekly-build-notes_318.mp4',
    status: 'running', percent: 47.3, transferred: '120.42 MB', speed: '2.11 MB/s', eta: 63,
    dest: '/Users/you/Downloads/tgrab', error: null,
  },
  {
    id: 2, url: 'https://t.me/c/1234567890/207', name: 'conference-keynote.mp4',
    status: 'running', percent: 88.1, transferred: '512.90 MB', speed: '4.02 MB/s', eta: 21,
    dest: '/Users/you/Downloads/tgrab', error: null,
  },
  {
    id: 1, url: 'https://t.me/c/1234567890/42', name: '2026-08-12_11-53_Load-balancer-deep-dive_42.mp4',
    status: 'done', percent: 100, transferred: '254.49 MB', speed: '2.10 MB/s', eta: null,
    dest: '/Users/you/Downloads/tgrab',
    file: { path: '/Users/you/Downloads/tgrab/2026-08-12_11-53_Load-balancer-deep-dive_42.mp4', size: 266850732 },
  },
];

const SHOTS = {
  '01-language': { state: { lang: null, records: [] }, prep: null },
  '02-downloads': { state: { lang: 'en', records: RECORDS }, prep: null },
  '03-settings': { state: { lang: 'en', records: RECORDS }, prep: "document.querySelector('#open-settings').click()" },
  '04-russian': { state: { lang: 'ru', records: RECORDS }, prep: "document.querySelector('#toggle-adv').click()" },
  '05-login': { state: { lang: 'en', records: [], loggedIn: false }, prep: null },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NAME = process.env.SHOT || '02-downloads';

app.whenReady().then(async () => {
  const shot = SHOTS[NAME];
  if (!shot) { console.error('unknown shot', NAME); app.exit(1); return; }

  nativeTheme.themeSource = 'dark';
  fs.mkdirSync(OUT, { recursive: true });
  process.env.SHOOT_STATE = JSON.stringify(shot.state);

  const win = new BrowserWindow({
    width: 940, height: 720, show: true, backgroundColor: '#0e1117',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'shoot-preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
    },
  });

  await win.loadFile(RENDERER);
  await sleep(900);
  if (shot.prep) { await win.webContents.executeJavaScript(shot.prep); await sleep(600); }
  await sleep(300);

  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, `${NAME}.png`), img.toPNG());
  console.log('wrote', `${NAME}.png`);
  app.exit(0);
});
