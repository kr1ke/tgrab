'use strict';
// Screenshot harness only. Exposes the same surface as the real preload so the
// genuine renderer (index.html / styles.css / app.js) draws itself unmodified,
// with seeded records standing in for a live Telegram session.

const { contextBridge } = require('electron');

const STATE = JSON.parse(process.env.SHOOT_STATE || '{}');

const settings = {
  lang: STATE.lang ?? null,
  dest: '/Users/you/Downloads/tgrab',
  template: '{{ formatDate .MessageDate "2006-01-02_15-04" }}_{{ if .FileCaption }}{{ filenamify .FileCaption 60 }}_{{ end }}{{ .MessageID }}',
  threads: 4, concurrent: 2, proxy: '', tdlPath: '', theme: 'dark', cleanOnQuit: false,
};

const records = STATE.records || [];

contextBridge.exposeInMainWorld('tgrab', {
  getSettings: async () => settings,
  setSettings: async (p) => Object.assign(settings, p),
  status: async () => ({ tdl: '/Users/you/.local/share/tgrab/bin/tdl', loggedIn: STATE.loggedIn !== false, platform: 'darwin', version: '0.1.0' }),
  installTdl: async () => ({ ok: true }),
  onInstallProgress: () => {},
  start: async () => records[0] || {},
  cancel: async () => true,
  list: async () => records,
  clear: async () => true,
  onUpdate: () => {},
  pickDir: async () => null,
  reveal: () => {},
  openExternal: () => {},
  loginCommand: async () => '"~/.local/share/tgrab/bin/tdl" login -T desktop',
  cleanSession: async () => true,
  openLoginTerminal: async () => ({ ok: true }),
  checkLogin: async () => STATE.loggedIn !== false,
  loginAutomated: async () => STATE.automated === true,
  loginStart: async () => ({ ok: true }),
  loginChoose: async () => true,
  loginCancel: async () => true,
  onLoginEvent: () => {},
  process: async () => ({}),
  mediaAvailable: async () => true,
});
