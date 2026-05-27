const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getProductos:   ()                      => ipcRenderer.invoke('db:getProductos'),
  saveProducto:   (p)                     => ipcRenderer.invoke('db:saveProducto', p),
  deleteProducto: (id)                    => ipcRenderer.invoke('db:deleteProducto', id),
  getPlantillas:  ()                      => ipcRenderer.invoke('db:getPlantillas'),
  getHistorial:   ()                      => ipcRenderer.invoke('db:getHistorial'),
  saveHistorial:  (d)                     => ipcRenderer.invoke('db:saveHistorial', d),
  getConfig:      (clave)                 => ipcRenderer.invoke('config:get', clave),
  setConfig:      (k, v)                  => ipcRenderer.invoke('config:set', k, v),
  openFileDialog: ()                      => ipcRenderer.invoke('dialog:openFile'),
  getSheets:      (filePath)              => ipcRenderer.invoke('excel:getSheets', filePath),
  getPreview:     (filePath, sheetIndex)  => ipcRenderer.invoke('excel:preview', filePath, sheetIndex),
  importExcel:    (filePath, sheetIndex, colMap) => ipcRenderer.invoke('excel:import', filePath, sheetIndex, colMap)
})
