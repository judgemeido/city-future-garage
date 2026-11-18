const { app, BrowserWindow, Menu, dialog, protocol, session, screen, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

const TITLE = '城市未来车厂';
const ENTRY = 'garage://app/index.html';
const CSP = [
  "default-src 'self' data: blob:",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "form-action 'none'",
  "base-uri 'self'",
].join('; ');

app.setName(TITLE);
app.setAppUserModelId('cn.cityfuture.garage');
// A fixed origin and profile keep saved progress independent of install location.
const profile = app.commandLine.getSwitchValue('user-data-dir');
app.setPath('userData', profile ? path.resolve(profile) : path.join(app.getPath('appData'), 'CityFutureGarage'));
for (const flag of ['disable-background-networking', 'disable-component-update', 'disable-domain-reliability', 'no-pings']) {
  app.commandLine.appendSwitch(flag);
}
protocol.registerSchemesAsPrivileged([{ scheme: 'garage', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

let mainWindow;
let exportingPDF = false;

function isGameSender(event) {
  return mainWindow && event.sender === mainWindow.webContents && event.senderFrame?.url.split('#')[0] === ENTRY;
}
ipcMain.handle('garage:save-file', async (event, payload) => {
  if (!isGameSender(event) || typeof payload?.filename !== 'string' || !(payload.bytes instanceof ArrayBuffer) || payload.bytes.byteLength > 80 * 1024 * 1024) {
    throw new Error('无效的作品文件。');
  }
  const filename = path.basename(payload.filename).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '').slice(0, 180) || '城市未来车厂-作品.html';
  const extension = path.extname(filename).slice(1).toLowerCase();
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: '保存游戏作品', defaultPath: path.join(app.getPath('downloads'), filename),
    filters: [{ name: '作品文件', extensions: [extension || 'html'] }],
  });
  if (canceled || !filePath) return { saved: false };
  await fs.writeFile(filePath, Buffer.from(payload.bytes));
  return { saved: true };
});
ipcMain.handle('garage:print-pdf', async event => { if (isGameSender(event)) await exportPDF(); });

async function offlineReference() {
  await dialog.showMessageBox(mainWindow, {
    type: 'info', title: '离线资料',
    message: '游戏照片、教学说明和素材署名均已内置。',
    detail: '这个链接是资料原始网页的引用地址，离线版不访问互联网。可从“帮助 → 素材与依赖说明”阅读本机资料。',
  });
}

async function exportPDF() {
  if (!mainWindow || exportingPDF) return;
  exportingPDF = true;
  try {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: '保存当前页面为 PDF',
      defaultPath: path.join(app.getPath('documents'), '城市未来车厂-作品.pdf'),
      filters: [{ name: 'PDF 文档', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return;
    const bytes = await mainWindow.webContents.printToPDF({ printBackground: true, pageSize: 'A4', preferCSSPageSize: true });
    await fs.writeFile(filePath, bytes);
  } catch (error) {
    await dialog.showMessageBox(mainWindow, { type: 'error', title: '导出失败', message: 'PDF 未能保存，请重试。', detail: error.message });
  } finally { exportingPDF = false; }
}

async function showLocalDocument(file, title) {
  try {
    const detail = await fs.readFile(path.join(app.getAppPath(), file), 'utf8');
    await dialog.showMessageBox(mainWindow, { type: 'info', title, message: title, detail });
  } catch (error) {
    await dialog.showMessageBox(mainWindow, { type: 'error', message: '本机说明无法读取。', detail: error.message });
  }
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    title: TITLE, width: Math.min(1440, width), height: Math.min(960, height),
    minWidth: Math.min(800, width), minHeight: Math.min(540, height), center: true, show: false,
    backgroundColor: '#080e1d', icon: path.join(__dirname, 'icon.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, spellcheck: false },
  });
  mainWindow.webContents.setWindowOpenHandler(() => { void offlineReference(); return { action: 'deny' }; });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.split('#')[0] !== ENTRY) { event.preventDefault(); void offlineReference(); }
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason !== 'clean-exit') dialog.showErrorBox('游戏画面已停止', '请关闭并重新打开游戏，本机已保存的记录会保留。');
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = undefined; });
  void mainWindow.loadURL(ENTRY).catch(error => {
    // A user reload can cancel the initial navigation without being a failure.
    if (error.code === 'ERR_ABORTED') return;
    dialog.showErrorBox('无法打开游戏', error.message); app.quit();
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '文件', submenu: [
      { label: '保存当前页面为 PDF…', accelerator: 'CmdOrCtrl+P', click: () => void exportPDF() },
      { type: 'separator' }, { label: '退出', role: 'quit' },
    ] },
    { label: '编辑', submenu: [{ label: '撤销', role: 'undo' }, { label: '重做', role: 'redo' }, { type: 'separator' }, { label: '剪切', role: 'cut' }, { label: '复制', role: 'copy' }, { label: '粘贴', role: 'paste' }, { label: '全选', role: 'selectAll' }] },
    { label: '视图', submenu: [{ label: '重新载入', role: 'reload' }, { label: '放大', role: 'zoomIn' }, { label: '缩小', role: 'zoomOut' }, { label: '恢复原始大小', role: 'resetZoom' }, { label: '全屏', role: 'togglefullscreen', accelerator: 'F11' }] },
    { label: '帮助', submenu: [
      { label: '离线版使用说明', click: () => void showLocalDocument('docs/windows-offline.md', '离线版使用说明') },
      { label: '素材与依赖说明', click: () => void showLocalDocument('ATTRIBUTION.md', '素材与依赖说明') },
      { label: '关于城市未来车厂', click: () => void dialog.showMessageBox(mainWindow, { type: 'info', title: TITLE, message: `${TITLE} ${app.getVersion()}`, detail: '完整离线版 · 八款游戏\n内置 Chromium 运行环境、全部图片与音效。\n存档保存在本机，安装和运行无需联网。' }) },
    ] },
  ]));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } });
  app.whenReady().then(async () => {
    // Also block Chromium-initiated HTTP(S) requests, not just game fetches.
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => callback({ cancel: true }));
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    const html = await fs.readFile(path.join(app.getAppPath(), 'dist/index.html'));
    protocol.handle('garage', request => {
      if (request.url.split(/[?#]/)[0] !== ENTRY) return new Response('Not found', { status: 404 });
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': CSP } });
    });
    session.defaultSession.on('will-download', (_event, item) => {
      item.setSaveDialogOptions({ title: '保存游戏作品', defaultPath: path.join(app.getPath('downloads'), path.basename(item.getFilename())) });
      item.on('done', (_doneEvent, state) => {
        if (state === 'interrupted' && mainWindow) void dialog.showMessageBox(mainWindow, { type: 'error', message: '作品未能保存，请检查保存位置后重试。' });
      });
    });
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  }).catch(error => { dialog.showErrorBox('无法启动游戏', error.message); app.quit(); });
}
app.on('window-all-closed', () => app.quit());
