const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('clipboostDesktop', {
  getSettings: () => ipcRenderer.invoke('desktop:get-settings'),
  importCampaignAuthenticated: (url) => ipcRenderer.invoke('desktop:import-campaign-authenticated', url),
  inspectCampaignAssetPack: (url) => ipcRenderer.invoke('desktop:inspect-campaign-asset-pack', url),
  importCampaignAsset: (payload) => ipcRenderer.invoke('desktop:import-campaign-asset', payload),
  clearCampaignImportSession: () => ipcRenderer.invoke('desktop:clear-campaign-import-session'),
  saveSettings: (settings) => ipcRenderer.invoke('desktop:save-settings', settings),
  checkForUpdates: () => ipcRenderer.invoke('desktop:check-updates'),
  installUpdate: () => ipcRenderer.invoke('desktop:install-update'),
  onUpdateEvent: (callback) => { const listener = (_event, payload) => callback(payload); ipcRenderer.on('desktop:update-event', listener); return () => ipcRenderer.removeListener('desktop:update-event', listener); },
  openDataFolder: () => ipcRenderer.invoke('desktop:open-data-folder'),
  openConfig: () => ipcRenderer.invoke('desktop:open-config'),
  openExportsFolder: () => ipcRenderer.invoke('desktop:open-exports-folder'),
  restartApp: () => ipcRenderer.invoke('desktop:restart-app'),
  minimizeWindow: () => ipcRenderer.invoke('desktop:window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('desktop:window-maximize'),
  closeWindow: () => ipcRenderer.invoke('desktop:window-close'),
  getWindowState: () => ipcRenderer.invoke('desktop:window-state'),
  reportActivity: () => ipcRenderer.send('desktop:activity')
});
