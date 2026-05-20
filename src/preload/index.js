const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Base de datos
  getProductos: () => ipcRenderer.invoke('db:getProductos'),
  saveProducto: (producto) => ipcRenderer.invoke('db:saveProducto', producto),
  deleteProducto: (id) => ipcRenderer.invoke('db:deleteProducto', id),

  // Impresión
  printLabel: (data) => ipcRenderer.invoke('print:label', data),
  getPrinters: () => ipcRenderer.invoke('print:getPrinters'),

  // Excel
  importExcel: (filePath) => ipcRenderer.invoke('excel:import', filePath),
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),

  // Configuración
  getConfig: (key) => ipcRenderer.invoke('config:get', key),
  setConfig: (key, value) => ipcRenderer.invoke('config:set', key, value)
})
