const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Productos
  getProductos:   () => ipcRenderer.invoke('db:getProductos'),
  saveProducto:   (p) => ipcRenderer.invoke('db:saveProducto', p),
  deleteProducto: (id) => ipcRenderer.invoke('db:deleteProducto', id),

  // Plantillas
  getPlantillas:  () => ipcRenderer.invoke('db:getPlantillas'),
  updatePlantilla: (id, config) => ipcRenderer.invoke('db:updatePlantilla', id, config),

  // Configuración
  getConfig:      (key) => ipcRenderer.invoke('config:get', key),
  setConfig:      (k, v) => ipcRenderer.invoke('config:set', k, v),

  // Historial
  getHistorial:   () => ipcRenderer.invoke('db:getHistorial'),
  saveHistorial:  (d) => ipcRenderer.invoke('db:saveHistorial', d),

  // Impresión
  getPrinters:    () => ipcRenderer.invoke('print:getPrinters'),
  printTSPL:      (data, printer) => ipcRenderer.invoke('print:tspl', data, printer),

  // Excel
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  getSheets:      (fp) => ipcRenderer.invoke('excel:getSheets', fp),
  getPreview:     (fp, idx) => ipcRenderer.invoke('excel:preview', fp, idx),
  importExcel:    (fp, idx) => ipcRenderer.invoke('excel:import', fp, idx)
});