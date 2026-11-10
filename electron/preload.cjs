const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onGlobalShortcut: (callback) => {
    ipcRenderer.on('global-shortcut', (_event, action) => callback(action));
  },
  setLaunchAtStartup: (openAtLogin) =>
    ipcRenderer.invoke('windows:set-startup', openAtLogin),
  setMinimizeToTray: (enabled) =>
    ipcRenderer.invoke('windows:set-minimize-to-tray', enabled),
  saveEncryptedVault: (jsonStr) =>
    ipcRenderer.invoke('vault:save-secret', jsonStr),
  loadEncryptedVault: () => ipcRenderer.invoke('vault:load-secret'),
});
