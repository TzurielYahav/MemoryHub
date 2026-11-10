/**
 * Memory Hub — Windows Desktop Electron Main Process
 * Implements:
 * - FR-13.1: Windows System Tray icon & background execution for routines/reminders
 * - FR-13.2: Global Keyboard Shortcuts (Ctrl+Shift+Space -> Quick Task, Ctrl+Shift+A -> AI Agent)
 * - FR-13.3: Launch at Windows Startup (app.setLoginItemSettings)
 * - FR-6.2: Windows WASAPI System Audio Loopback handler for Zoom / Meet / Teams meeting capture
 * - FR-14.4: Windows DPAPI safeStorage encryption for local API keys
 */

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  ipcMain,
  safeStorage,
  desktopCapturer,
  session,
  nativeImage,
} = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let minimizeToTrayEnabled = true;

const VAULT_FILE = path.join(app.getPath('userData'), 'memoryhub-credentials.enc');

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    title: 'Memory Hub',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // FR-6.2: Enable Windows System Audio Loopback capture for getDisplayMedia without virtual cables
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
      if (sources.length > 0) {
        callback({ video: sources[0], audio: 'loopback' });
      } else {
        callback({});
      }
    });
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
  if (!app.isPackaged) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // FR-13.1: Minimize to System Tray on close so background routines & reminders keep running
  mainWindow.on('close', (event) => {
    if (!isQuitting && minimizeToTrayEnabled) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createSystemTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('Memory Hub — Personal Workspace & AI Agent');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Memory Hub',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quick-Add Task (Ctrl+Shift+Space)',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send('global-shortcut', 'quick-add-task');
        }
      },
    },
    {
      label: 'Open AI Agent (Ctrl+Shift+A)',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send('global-shortcut', 'open-agent');
        }
      },
    },
    {
      label: 'Instant Voice to Agent',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send('global-shortcut', 'quick-voice-agent');
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Memory Hub',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function registerGlobalShortcuts() {
  // FR-13.2: Global Keyboard Shortcuts on Windows
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('global-shortcut', 'quick-add-task');
    }
  });

  globalShortcut.register('CommandOrControl+Shift+A', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('global-shortcut', 'open-agent');
    }
  });
}

// FR-13.3: Launch at Windows Startup & Tray Settings IPC
ipcMain.handle('windows:set-startup', (_event, openAtLogin) => {
  app.setLoginItemSettings({ openAtLogin: Boolean(openAtLogin) });
  return true;
});

ipcMain.handle('windows:set-minimize-to-tray', (_event, enabled) => {
  minimizeToTrayEnabled = Boolean(enabled);
  return true;
});

// FR-14.4: Secure Local Credential Vault using Windows DPAPI (safeStorage)
ipcMain.handle('vault:save-secret', (_event, payloadJson) => {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(payloadJson);
    fs.writeFileSync(VAULT_FILE, encrypted);
    return { encryptedWithDpapi: true };
  }
  fs.writeFileSync(VAULT_FILE, payloadJson, 'utf-8');
  return { encryptedWithDpapi: false };
});

ipcMain.handle('vault:load-secret', () => {
  if (!fs.existsSync(VAULT_FILE)) return null;
  const raw = fs.readFileSync(VAULT_FILE);
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(raw);
    } catch {
      return null;
    }
  }
  return raw.toString('utf-8');
});

app.whenReady().then(() => {
  createMainWindow();
  createSystemTray();
  registerGlobalShortcuts();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
