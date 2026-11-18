const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('garageDesktop', {
  saveFile: (filename, bytes) => ipcRenderer.invoke('garage:save-file', { filename, bytes }),
  printPDF: () => ipcRenderer.invoke('garage:print-pdf'),
});
