'use strict';
// Renders gui/build/icon.png (1024×1024) from the same mark used in the app header.
// electron-builder derives .icns / .ico / Linux sizes from this one file.
//
//   npx electron scripts/make-icon.js

const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const OUT = path.join(__dirname, '..', 'gui', 'build');
const S = 1024;

// Padding keeps the mark clear of macOS's own rounding and of Linux launcher crops.
// Telegram's own blue pair (#2AABEE over #229ED9) with a descending paper plane —
// same family, deliberately not their circular logo mark.
const HTML = `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;width:${S}px;height:${S}px;background:transparent}
  .plate{
    position:absolute; inset:80px; border-radius:220px;
    background:linear-gradient(180deg,#2aabee 0%,#229ed9 100%);
    display:grid; place-items:center;
  }
  svg{width:500px;height:500px;transform:translateX(-10px)}
</style>
<div class="plate">
  <svg viewBox="0 0 24 24">
    <path d="M20.5 4.2 3.6 11.1a.6.6 0 0 0 .04 1.11l4.2 1.42 1.6 4.9a.6.6 0 0 0 1.05.2l2.2-2.66 4.2 3.1a.6.6 0 0 0 .94-.33l3.5-13.9a.6.6 0 0 0-.83-.7Z" fill="#fff"/>
    <path d="m9.5 13.9 8.4-6.6-6.4 7.7Z" fill="#fff" opacity=".42"/>
  </svg>
</div>`;

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    width: S, height: S, show: false, transparent: true, frame: false,
    webPreferences: { offscreen: false },
  });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(HTML));
  await new Promise((r) => setTimeout(r, 900));
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, 'icon.png'), img.toPNG());
  console.log('wrote gui/build/icon.png');
  app.exit(0);
});
