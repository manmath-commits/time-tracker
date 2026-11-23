const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  env: () => ipcRenderer.invoke('env'),
  idle: () => ipcRenderer.invoke('idle'),
  activeWindow: () => ipcRenderer.invoke('active-window'),
  screenshot: (label) => ipcRenderer.invoke('screenshot', label),
  openFolder: () => ipcRenderer.invoke('open-folder'),
});
