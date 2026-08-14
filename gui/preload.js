'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// contextIsolation is on and nodeIntegration off: the renderer gets this narrow,
// explicit surface and nothing else.
contextBridge.exposeInMainWorld('tgrab', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),

  status: () => ipcRenderer.invoke('app:status'),
  installTdl: () => ipcRenderer.invoke('tdl:install'),
  onInstallProgress: (cb) => ipcRenderer.on('tdl:install-progress', (_e, s) => cb(s)),

  start: (payload) => ipcRenderer.invoke('download:start', payload),
  cancel: (id) => ipcRenderer.invoke('download:cancel', id),
  list: () => ipcRenderer.invoke('download:list'),
  clear: () => ipcRenderer.invoke('download:clear'),
  onUpdate: (cb) => ipcRenderer.on('download:update', (_e, rec) => cb(rec)),

  pickDir: () => ipcRenderer.invoke('dialog:pickDir'),
  reveal: (p) => ipcRenderer.invoke('shell:reveal', p),
  openExternal: (u) => ipcRenderer.invoke('shell:open', u),

  loginCommand: () => ipcRenderer.invoke('login:command'),
  openLoginTerminal: () => ipcRenderer.invoke('login:openTerminal'),
  checkLogin: () => ipcRenderer.invoke('login:check'),

  loginAutomated: () => ipcRenderer.invoke('login:automated'),
  loginStart: (opts) => ipcRenderer.invoke('login:start', opts),
  loginChoose: (i) => ipcRenderer.invoke('login:choose', i),
  loginCancel: () => ipcRenderer.invoke('login:cancel'),
  onLoginEvent: (cb) => ipcRenderer.on('login:event', (_e, p) => cb(p)),
  cleanSession: () => ipcRenderer.invoke('session:clean'),

  process: (payload) => ipcRenderer.invoke('media:process', payload),
  mediaAvailable: () => ipcRenderer.invoke('media:available'),
});
