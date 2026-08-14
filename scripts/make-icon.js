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
const HTML = `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;width:${S}px;height:${S}px;background:transparent}
  .plate{
    position:absolute; inset:88px; border-radius:210px;
    background:linear-gradient(135deg,#4a9eff 0%,#6366f1 55%,#7c3aed 100%);
    display:grid; place-items:center;
  }
  svg{width:430px;height:430px}
</style>
<div class="plate">
  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.1"
       stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3v13"/><path d="M6.5 10.5 12 16l5.5-5.5"/><path d="M4 20h16"/>
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
