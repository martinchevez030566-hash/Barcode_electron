const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { initDatabase, getDb } = require('./database')

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'MPCL - Códigos de Barra',
    show: false
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })
}

// ── Handlers de Productos ──────────────────────────────────
ipcMain.handle('db:getProductos', () => {
  const db = getDb()
  return db.prepare('SELECT * FROM productos WHERE activo = 1 ORDER BY nombre').all()
})

ipcMain.handle('db:saveProducto', (_, producto) => {
  const db = getDb()
  if (producto.id) {
    db.prepare(`
      UPDATE productos
      SET codigo=?, nombre=?, precio=?, sku=?, unidad=?, updated_at=datetime('now')
      WHERE id=?
    `).run(producto.codigo, producto.nombre, producto.precio, producto.sku, producto.unidad, producto.id)
    return { success: true, id: producto.id }
  } else {
    const result = db.prepare(`
      INSERT INTO productos (codigo, nombre, precio, sku, unidad)
      VALUES (?, ?, ?, ?, ?)
    `).run(producto.codigo, producto.nombre, producto.precio, producto.sku, producto.unidad)
    return { success: true, id: result.lastInsertRowid }
  }
})

ipcMain.handle('db:deleteProducto', (_, id) => {
  const db = getDb()
  db.prepare('UPDATE productos SET activo = 0 WHERE id = ?').run(id)
  return { success: true }
})

// ── Handlers de Plantillas ─────────────────────────────────
ipcMain.handle('db:getPlantillas', () => {
  const db = getDb()
  return db.prepare('SELECT * FROM plantillas WHERE activo = 1').all()
})

// ── Handlers de Configuración ──────────────────────────────
ipcMain.handle('config:get', (_, clave) => {
  const db = getDb()
  const row = db.prepare('SELECT valor FROM configuracion WHERE clave = ?').get(clave)
  return row ? row.valor : null
})

ipcMain.handle('config:set', (_, clave, valor) => {
  const db = getDb()
  db.prepare('INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?, ?)').run(clave, valor)
  return { success: true }
})

// ── Historial ──────────────────────────────────────────────
ipcMain.handle('db:getHistorial', () => {
  const db = getDb()
  return db.prepare(`
    SELECT h.*, p.nombre as producto_nombre, p.codigo,
           pl.nombre as plantilla_nombre
    FROM historial_impresiones h
    LEFT JOIN productos p ON h.producto_id = p.id
    LEFT JOIN plantillas pl ON h.plantilla_id = pl.id
    ORDER BY h.fecha DESC
    LIMIT 500
  `).all()
})

ipcMain.handle('db:saveHistorial', (_, data) => {
  const db = getDb()
  db.prepare(`
    INSERT INTO historial_impresiones (producto_id, plantilla_id, cantidad, estado)
    VALUES (?, ?, ?, ?)
  `).run(data.producto_id, data.plantilla_id, data.cantidad, data.estado || 'OK')
  return { success: true }
})

// ── Inicio de la app ───────────────────────────────────────
app.whenReady().then(() => {
  initDatabase()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})