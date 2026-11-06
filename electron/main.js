/* Точка входа Electron: окно игры */
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');

/* Если видеодрайвер однажды уронил графический процесс (белый экран), дальше игра
   работает с программной отрисовкой. Принудительно: запуск с ключом --no-gpu. */
const GPU_FLAG = path.join(app.getPath('userData'), 'gpu-disabled.flag');
const noGpu = process.argv.includes('--no-gpu') || fs.existsSync(GPU_FLAG);
if (noGpu) app.disableHardwareAcceleration();

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    backgroundColor: '#14100d',
    title: 'Подземелья и Драконы — Боевой стол',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  win.once('ready-to-show', () => win.maximize());

  // Внешние ссылки (dnd.su) открываем в браузере
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (/^https?:\/\//.test(url)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  // Страница упала или зависла — перезагружаем окно (сохранения в профиле не теряются)
  win.webContents.on('render-process-gone', (e, details) => {
    if (details.reason !== 'clean-exit') setTimeout(() => !win.isDestroyed() && win.reload(), 300);
  });
  let hangTimer = null;
  win.on('unresponsive', () => {
    clearTimeout(hangTimer);
    hangTimer = setTimeout(() => {
      if (!win.isDestroyed()) win.webContents.forcefullyCrashRenderer();
    }, 12000);
  });
  win.on('responsive', () => clearTimeout(hangTimer));

  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    } else if (input.key === 'F12') {
      win.webContents.toggleDevTools();
      e.preventDefault();
    } else if (input.key === 'F5') {
      win.webContents.reload();
      e.preventDefault();
    }
  });
}

app.on('child-process-gone', (e, details) => {
  if (details.type !== 'GPU' || details.reason === 'clean-exit' || noGpu) return;
  try {
    fs.mkdirSync(path.dirname(GPU_FLAG), { recursive: true });
    fs.writeFileSync(GPU_FLAG, new Date().toISOString() + ' ' + details.reason + '\n');
  } catch (err) {
    /* не удалось записать — не страшно */
  }
  // Перезапуск без аппаратного ускорения, чтобы не остаться с белым экраном
  app.relaunch({ args: process.argv.slice(1).concat(['--no-gpu']) });
  app.exit(0);
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
