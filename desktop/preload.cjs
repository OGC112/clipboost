const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('clipboostDesktop', {
  getSettings: () => ipcRenderer.invoke('desktop:get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('desktop:save-settings', settings),
  checkForUpdates: () => ipcRenderer.invoke('desktop:check-updates'),
  openDataFolder: () => ipcRenderer.invoke('desktop:open-data-folder'),
  openConfig: () => ipcRenderer.invoke('desktop:open-config'),
  openExportsFolder: () => ipcRenderer.invoke('desktop:open-exports-folder'),
  restartApp: () => ipcRenderer.invoke('desktop:restart-app')
});
