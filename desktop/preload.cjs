const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('clipboostDesktop', {
  getSettings: () => ipcRenderer.invoke('desktop:get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('desktop:save-settings', settings),
  checkForUpdates: () => ipcRenderer.invoke('desktop:check-updates'),
  installUpdate: () => ipcRenderer.invoke('desktop:install-update'),
  onUpdateEvent: (callback) => { const listener = (_event, payload) => callback(payload); ipcRenderer.on('desktop:update-event', listener); return () => ipcRenderer.removeListener('desktop:update-event', listener); },
  openDataFolder: () => ipcRenderer.invoke('desktop:open-data-folder'),
  openConfig: () => ipcRenderer.invoke('desktop:open-config'),
  openExportsFolder: () => ipcRenderer.invoke('desktop:open-exports-folder'),
  restartApp: () => ipcRenderer.invoke('desktop:restart-app'),
  reportActivity: () => ipcRenderer.send('desktop:activity')
});
