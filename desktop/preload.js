// Exposes a minimal, safe bridge from the page to the desktop shell.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('DesktopBridge', {
  platform: process.platform,
  setMenus: (menus, labels) => ipcRenderer.send('menus', menus, labels),
  onMenu: (cb) => ipcRenderer.on('menu', (e, id) => cb(id)),
  onOpenFile: (cb) => ipcRenderer.on('open-file', (e, f) => cb(f)),
  rendererReady: () => ipcRenderer.send('renderer-ready'),
  save: (name, data) => ipcRenderer.invoke('save', { name, data }),
  open: (filters) => ipcRenderer.invoke('open', { filters }),
});
