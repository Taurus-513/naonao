const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pet', {
  initialize: () => ipcRenderer.invoke('initialize'),
  hit: hit => ipcRenderer.send('hit', Boolean(hit)),
  dragStart: point => ipcRenderer.send('drag-start', point),
  dragMove: point => ipcRenderer.send('drag-move', point),
  dragEnd: () => ipcRenderer.send('drag-end'),
  onSnapshot: callback => ipcRenderer.on('snapshot', (_event, value) => callback(value)),
  onSettings: callback => ipcRenderer.on('settings', (_event, value) => callback(value))
});
