const { contextBridge, ipcRenderer } = require('electron');

// API exposée au renderer de façon sécurisée (contextIsolation = true).
contextBridge.exposeInMainWorld('tradrly', {
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  minimize: () => ipcRenderer.invoke('app:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('app:toggleMaximize'),
  // URL de l'orchestrateur local (couche Node.js)
  orchestratorUrl: 'http://localhost:4000',
  orchestratorWs: 'ws://localhost:4000',
});
