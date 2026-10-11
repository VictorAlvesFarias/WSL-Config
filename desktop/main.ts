import { join } from 'node:path';
import { app, BrowserWindow, dialog, Menu, session, shell } from 'electron';
import { startServer } from '../server/src/app.ts';
import { state } from '../server/src/events.ts';
import { configurePaths } from '../server/src/paths.ts';

// This file is bundled to desktop/dist/main.mjs, so paths are relative to that folder.
const here = import.meta.dirname;
const repoRoot = join(here, '..', '..');

configurePaths({ clientDistDir: app.isPackaged ? join(process.resourcesPath, 'client') : join(repoRoot, 'client', 'dist') });

let mainWindow: BrowserWindow | null = null;

const opensExternally = (url: string) => url.startsWith('https://') || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url);

function createWindow(port: number) {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 840,
    minWidth: 420,
    minHeight: 560,
    title: 'WSL-Config',
    icon: join(repoRoot, 'build', 'icon.png'),
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true },
  });

  const origin = `http://127.0.0.1:${port}`;
  mainWindow.loadURL(origin);
  mainWindow.once('ready-to-show', () => mainWindow?.show());

  // External links open in the real browser, never inside the app. Besides https, that includes the
  // services the distros publish on localhost (the Portas tab links to them).
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (opensExternally(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(origin)) {
      event.preventDefault();
      if (opensExternally(url)) void shell.openExternal(url);
    }
  });
  // Exports and imports run in wsl.exe: closing midway leaves a half-written file and no library
  // entry for it, so ask first.
  mainWindow.on('close', (event) => {
    if (!state.jobs.length || !mainWindow) return;
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      buttons: ['Continuar aberto', 'Fechar mesmo assim'],
      defaultId: 0,
      cancelId: 0,
      title: 'WSL-Config',
      message: 'Há tarefas em andamento',
      detail: state.jobs.map((job) => `• ${job.label}`).join('\n'),
    });
    if (choice === 0) event.preventDefault();
  });
  mainWindow.on('closed', () => (mainWindow = null));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    // Only our own server may be loaded by the window.
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': ["default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'"],
        },
      });
    });
    try {
      const server = await startServer(0);
      app.on('will-quit', server.close);
      createWindow(server.port);
      app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow(server.port));
    } catch (error) {
      dialog.showErrorBox('WSL-Config', `Não foi possível iniciar o servidor interno:\n${(error as Error).message}`);
      app.quit();
    }
  });

  app.on('window-all-closed', () => app.quit());
}
