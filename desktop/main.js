// VarStat desktop shell (Electron): native window, Sisvar-style native menus, native file dialogs.
const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let win = null;
let rendererReady = false;
const pendingFiles = [];

function sendFile(fp) {
  try {
    const data = fs.readFileSync(fp);
    const payload = { name: path.basename(fp), data: new Uint8Array(data) };
    if (win && rendererReady) win.webContents.send('open-file', payload);
    else pendingFiles.push(payload);
  } catch (e) { dialog.showErrorBox('VarStat', String(e.message || e)); }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1320, height: 860, minWidth: 760, minHeight: 520, title: 'VarStat', show: false,
    backgroundColor: '#eef1ec',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, spellcheck: false },
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (url !== win.webContents.getURL()) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); } });
  win.on('closed', () => { win = null; rendererReady = false; });
}

function buildMenu(menus, L) {
  const isMac = process.platform === 'darwin';
  const click = (id) => () => { if (win) win.webContents.send('menu', id); };
  const conv = (items) => items.map((it) => {
    if (it === '-') return { type: 'separator' };
    if (it.header) return { label: it.header, enabled: false };
    return { label: it.label, accelerator: it.accel || undefined, click: click(it.id) };
  });
  const [file, analysis, report, help] = menus;
  const aboutItem = help[1].find((x) => x && x.label === L.about);
  const template = [];
  if (isMac) {
    template.push({ label: 'VarStat', submenu: [
      aboutItem ? { label: L.about, click: click(aboutItem.id) } : { role: 'about' },
      { type: 'separator' }, { role: 'services' }, { type: 'separator' },
      { role: 'hide', label: L.hide }, { role: 'hideOthers', label: L.hideOthers }, { role: 'unhide', label: L.unhide },
      { type: 'separator' }, { role: 'quit', label: L.quit }] });
  }
  template.push({ label: file[0], submenu: [...conv(file[1]), ...(isMac ? [] : [{ type: 'separator' }, { role: 'quit', label: L.exit }])] });
  template.push({ label: L.edit, submenu: [
    { role: 'undo', label: L.undo }, { role: 'redo', label: L.redo }, { type: 'separator' },
    { role: 'cut', label: L.cut }, { role: 'copy', label: L.copy }, { role: 'paste', label: L.paste }, { role: 'selectAll', label: L.selectAll }] });
  template.push({ label: analysis[0], submenu: conv(analysis[1]) });
  template.push({ label: report[0], submenu: conv(report[1]) });
  template.push({ label: L.view, submenu: [{ role: 'zoomIn', label: L.zoomIn }, { role: 'zoomOut', label: L.zoomOut }, { role: 'resetZoom', label: L.resetZoom }, { type: 'separator' }, { role: 'togglefullscreen', label: L.fullscreen }] });
  if (isMac) template.push({ label: L.window, submenu: [{ role: 'minimize', label: L.minimize }, { role: 'zoom', label: L.zoom }] });
  template.push({ label: help[0], role: isMac ? 'help' : undefined, submenu: conv(help[1]) });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.on('menus', (e, menus, labels) => buildMenu(menus, labels));
ipcMain.on('renderer-ready', () => { rendererReady = true; while (pendingFiles.length && win) win.webContents.send('open-file', pendingFiles.shift()); });
ipcMain.handle('save', async (e, { name, data }) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), name) });
  if (r.canceled || !r.filePath) return { canceled: true };
  fs.writeFileSync(r.filePath, typeof data === 'string' ? data : Buffer.from(data));
  return { path: r.filePath };
});
ipcMain.handle('open', async (e, { filters }) => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters });
  if (r.canceled || !r.filePaths.length) return null;
  const fp = r.filePaths[0];
  return { name: path.basename(fp), data: new Uint8Array(fs.readFileSync(fp)) };
});

// files opened via Finder / Explorer ("Open with VarStat") or the command line
app.on('open-file', (e, fp) => { e.preventDefault(); sendFile(fp); });
const argFiles = process.argv.slice(1).filter((a) => /\.(csv|txt|tsv|dat|xlsx|xls|ods|fdt)$/i.test(a) && fs.existsSync(a));

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (e, argv) => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
    argv.slice(1).filter((a) => /\.(csv|txt|tsv|dat|xlsx|xls|ods|fdt)$/i.test(a) && fs.existsSync(a)).forEach(sendFile);
  });
  app.whenReady().then(() => {
    createWindow();
    argFiles.forEach(sendFile);
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
