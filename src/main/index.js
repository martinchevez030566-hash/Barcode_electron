<<<<<<< HEAD
﻿const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')

let db
let SQL

async function initDatabase() {
  const initSqlJs = require('sql.js')
  SQL = await initSqlJs()

  const dbPath = path.join(app.getPath('userData'), 'productos.db')

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }

  function saveDb() {
    const data = db.export()
    const buffer = Buffer.from(data)
    fs.writeFileSync(dbPath, buffer)
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS productos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      nombre TEXT NOT NULL,
      precio REAL DEFAULT 0,
      sku TEXT,
      unidad TEXT DEFAULT 'UND',
      activo INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS plantillas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      ancho_mm REAL NOT NULL,
      alto_mm REAL NOT NULL,
      columnas INTEGER DEFAULT 2,
      config_json TEXT,
      activo INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS historial_impresiones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      producto_id INTEGER,
      plantilla_id INTEGER,
      cantidad INTEGER DEFAULT 1,
      fecha TEXT DEFAULT (datetime('now')),
      estado TEXT DEFAULT 'OK'
    );
    CREATE TABLE IF NOT EXISTS configuracion (
      clave TEXT PRIMARY KEY,
      valor TEXT
    );
  `)

  const count = db.exec('SELECT COUNT(*) as total FROM plantillas')
  const total = count[0] ? count[0].values[0][0] : 0

  if (total === 0) {
    db.run(`INSERT INTO plantillas (nombre, ancho_mm, alto_mm, columnas, config_json) VALUES (?, ?, ?, ?, ?)`,
      ['Pequeña 40x20', 40, 20, 2, JSON.stringify({
        barcode: { x: 5, y: 2, width: 30, height: 10 },
        sku: { x: 5, y: 14, fontSize: 6 }
      })])
    db.run(`INSERT INTO plantillas (nombre, ancho_mm, alto_mm, columnas, config_json) VALUES (?, ?, ?, ?, ?)`,
      ['Mediana 63x50', 63.5, 50.8, 2, JSON.stringify({
        barcode: { x: 5, y: 5, width: 53, height: 20 },
        nombre: { x: 5, y: 30, fontSize: 8 },
        precio: { x: 5, y: 40, fontSize: 10 },
        sku: { x: 5, y: 48, fontSize: 6 }
      })])
    db.run(`INSERT INTO plantillas (nombre, ancho_mm, alto_mm, columnas, config_json) VALUES (?, ?, ?, ?, ?)`,
      ['Grande 80x50', 80, 50, 2, JSON.stringify({
        barcode: { x: 5, y: 5, width: 70, height: 22 },
        nombre: { x: 5, y: 32, fontSize: 9 },
        precio: { x: 5, y: 42, fontSize: 12 },
        sku: { x: 5, y: 48, fontSize: 6 }
      })])

    db.run(`INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('plantilla_default', '2')`)
    db.run(`INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('impresora_default', '')`)
    db.run(`INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('empresa_nombre', 'MPCL')`)
    db.run(`INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('pistola_activa', '1')`)

    saveDb()
  }

  console.log('DB iniciada en:', dbPath)

  // Helper para convertir resultado sql.js a array de objetos
  function toObjects(results) {
    if (!results || results.length === 0) return []
    const { columns, values } = results[0]
    return values.map(row => {
      const obj = {}
      columns.forEach((col, i) => { obj[col] = row[i] })
      return obj
    })
  }

  // ── IPC Handlers ─────────────────────────────────────────
  ipcMain.handle('db:getProductos', () => {
    const r = db.exec('SELECT * FROM productos WHERE activo = 1 ORDER BY nombre')
    return toObjects(r)
  })

  ipcMain.handle('db:saveProducto', (_, p) => {
    if (p.id) {
      db.run(`UPDATE productos SET codigo=?, nombre=?, precio=?, sku=?, unidad=?, updated_at=datetime('now') WHERE id=?`,
        [p.codigo, p.nombre, p.precio, p.sku, p.unidad, p.id])
    } else {
      db.run(`INSERT INTO productos (codigo, nombre, precio, sku, unidad) VALUES (?, ?, ?, ?, ?)`,
        [p.codigo, p.nombre, p.precio, p.sku, p.unidad])
    }
    saveDb()
    return { success: true }
  })

  ipcMain.handle('db:deleteProducto', (_, id) => {
    db.run('UPDATE productos SET activo = 0 WHERE id = ?', [id])
    saveDb()
    return { success: true }
  })

  ipcMain.handle('db:getPlantillas', () => {
    const r = db.exec('SELECT * FROM plantillas WHERE activo = 1')
    return toObjects(r)
  })

  ipcMain.handle('config:get', (_, clave) => {
    const r = db.exec('SELECT valor FROM configuracion WHERE clave = ?', [clave])
    const rows = toObjects(r)
    return rows.length > 0 ? rows[0].valor : null
  })

  ipcMain.handle('config:set', (_, clave, valor) => {
    db.run('INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?, ?)', [clave, valor])
    saveDb()
    return { success: true }
  })

  ipcMain.handle('db:getHistorial', () => {
    const r = db.exec(`
      SELECT h.*, p.nombre as producto_nombre, p.codigo,
             pl.nombre as plantilla_nombre
      FROM historial_impresiones h
      LEFT JOIN productos p ON h.producto_id = p.id
      LEFT JOIN plantillas pl ON h.plantilla_id = pl.id
      ORDER BY h.fecha DESC LIMIT 500
    `)
    return toObjects(r)
  })

  ipcMain.handle('db:saveHistorial', (_, data) => {
    db.run(`INSERT INTO historial_impresiones (producto_id, plantilla_id, cantidad, estado) VALUES (?, ?, ?, ?)`,
      [data.producto_id, data.plantilla_id, data.cantidad, data.estado || 'OK'])
    saveDb()
    return { success: true }
  })
}

// ── Ventana principal ─────────────────────────────────────
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
    title: 'MPCL - Codigos de Barra',
    show: false
  })
=======
﻿const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const os = require('os');

let db;
let SQL;
let mainWindow;

// ============================================================
// LOGGING (opcional, para depuración)
// ============================================================
const logFile = path.join(app.getPath('desktop'), 'mpcl_log.txt');
function logToFile(msg) {
  try { fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`); } catch(e) {}
}
logToFile('=== APP INICIADA ===');
>>>>>>> 125d969 (Actualizar código fuente y configurar .gitignore para ignorar builds)

// ============================================================
// FECHA LOCAL
// ============================================================
function getLocalDateTime() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

<<<<<<< HEAD
// ── Inicio ────────────────────────────────────────────────
app.whenReady().then(async () => {
  await initDatabase()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})
// ── Excel Import ──────────────────────────────────────────
ipcMain.handle('dialog:openFile', async () => {
  const { dialog } = require('electron')
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Seleccionar archivo Excel',
    filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }],
    properties: ['openFile']
  })
  if (result.canceled) return null
  return result.filePaths[0]
})

ipcMain.handle('excel:getSheets', async (_, filePath) => {
  const ExcelJS = require('exceljs')
  const os = require('os')
  const tmpPath = path.join(os.tmpdir(), 'mpcl_import_' + Date.now() + '.xlsx')
  fs.copyFileSync(filePath, tmpPath)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(tmpPath)
  fs.unlinkSync(tmpPath)
  return workbook.worksheets.map((ws, i) => ({ index: i, name: ws.name }))
})

ipcMain.handle('excel:preview', async (_, filePath, sheetIndex) => {
  const ExcelJS = require('exceljs')
  const os = require('os')
  const tmpPath = path.join(os.tmpdir(), 'mpcl_import_' + Date.now() + '.xlsx')
  fs.copyFileSync(filePath, tmpPath)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(tmpPath)
  fs.unlinkSync(tmpPath)

  const worksheet = workbook.worksheets[sheetIndex]
  const rows = []
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 6) rows.push(row.values.slice(1))
  })

  if (rows.length === 0) return { error: 'La hoja está vacía' }

  const headers = rows[0].map(h => String(h || '').trim().toLowerCase())
  const required = ['codigo', 'nombre', 'precio', 'unidad']
  const missing = required.filter(r => !headers.includes(r))

  if (missing.length > 0) {
    return { error: `Faltan columnas requeridas: ${missing.join(', ')}. La fila 1 debe contener: codigo, nombre, precio, unidad` }
  }

  const colMap = {
    codigo: headers.indexOf('codigo'),
    nombre: headers.indexOf('nombre'),
    precio: headers.indexOf('precio'),
    unidad: headers.indexOf('unidad')
  }

  return { rows: rows.slice(1, 6), colMap, headers }
})

ipcMain.handle('excel:import', async (_, filePath, sheetIndex) => {
  const ExcelJS = require('exceljs')
  const os = require('os')
  const tmpPath = path.join(os.tmpdir(), 'mpcl_import_' + Date.now() + '.xlsx')
  fs.copyFileSync(filePath, tmpPath)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(tmpPath)
  fs.unlinkSync(tmpPath)

  const worksheet = workbook.worksheets[sheetIndex]
  let nuevos = 0, actualizados = 0, sinCambios = 0, errores = 0

  const allRows = []
  worksheet.eachRow((row, rowNumber) => {
    allRows.push(row.values.slice(1))
  })

  if (allRows.length === 0) return { error: 'Hoja vacía' }

  const headers = allRows[0].map(h => String(h || '').trim().toLowerCase())
  const colMap = {
    codigo: headers.indexOf('codigo'),
    nombre: headers.indexOf('nombre'),
    precio: headers.indexOf('precio'),
    unidad: headers.indexOf('unidad')
  }

  for (let i = 1; i < allRows.length; i++) {
    try {
      const values = allRows[i]
      const codigo = String(values[colMap.codigo] || '').trim()
      const nombre = String(values[colMap.nombre] || '').trim()
      const unidad = String(values[colMap.unidad] || 'UND').trim()
      const precio = parseFloat(String(values[colMap.precio] || '0').replace(/[^0-9.]/g, '')) || 0

      if (!codigo || !nombre) continue

      const r = db.exec('SELECT id, nombre, precio, unidad FROM productos WHERE codigo = ?', [codigo])

      if (r.length === 0 || r[0].values.length === 0) {
        db.run(
          `INSERT INTO productos (codigo, nombre, precio, unidad) VALUES (?, ?, ?, ?)`,
          [codigo, nombre, precio, unidad]
        )
        nuevos++
      } else {
        const { columns, values: vals } = r[0]
        const existing = {}
        columns.forEach((c, idx) => { existing[c] = vals[0][idx] })

        const changed = existing.nombre !== nombre ||
                        Number(existing.precio) !== precio ||
                        existing.unidad !== unidad

        if (changed) {
          db.run(
            `UPDATE productos SET nombre=?, precio=?, unidad=?, updated_at=datetime('now') WHERE codigo=?`,
            [nombre, precio, unidad, codigo]
          )
          actualizados++
        } else {
          sinCambios++
        }
      }
    } catch (e) {
      errores++
    }
  }

  const data = db.export()
  fs.writeFileSync(path.join(app.getPath('userData'), 'productos.db'), Buffer.from(data))

  return { nuevos, actualizados, sinCambios, errores }
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
=======
// ============================================================
// BASE DE DATOS PORTABLE
// ============================================================
function getDbPath() {
  let basePath;
  if (app.isPackaged) {
    basePath = path.dirname(app.getPath('exe'));
  } else {
    basePath = app.getPath('userData');
  }
  if (!fs.existsSync(basePath)) fs.mkdirSync(basePath, { recursive: true });
  return path.join(basePath, 'productos.db');
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(getDbPath(), Buffer.from(data));
}

function toObjects(results) {
  if (!results || results.length === 0) return [];
  const { columns, values } = results[0];
  return values.map(row => {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

async function initDatabase() {
  const initSqlJs = require('sql.js');
  SQL = await initSqlJs();
  const dbPath = getDbPath();
  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS productos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      nombre TEXT NOT NULL,
      precio REAL DEFAULT 0,
      sku TEXT,
      unidad TEXT DEFAULT 'UND',
      activo INTEGER DEFAULT 1,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS plantillas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      ancho_mm REAL NOT NULL,
      alto_mm REAL NOT NULL,
      columnas INTEGER DEFAULT 2,
      config_json TEXT,
      activo INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS historial_impresiones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      producto_id INTEGER,
      plantilla_id INTEGER,
      cantidad INTEGER DEFAULT 1,
      fecha TEXT,
      estado TEXT DEFAULT 'OK'
    );
    CREATE TABLE IF NOT EXISTS configuracion (
      clave TEXT PRIMARY KEY,
      valor TEXT
    );
  `);

  const count = db.exec('SELECT COUNT(*) as total FROM plantillas');
  const total = count[0] ? count[0].values[0][0] : 0;
if (total === 0) {
  // Plantilla 63.5x50.8 1 columna (más grande)
  db.run(`INSERT INTO plantillas (nombre, ancho_mm, alto_mm, columnas, config_json) VALUES (?, ?, ?, ?, ?)`,
    ['63.5x50.8 1 columna', 63.5, 50.8, 1, JSON.stringify({
      barcode: { x: 5, y: 5, width: 60, height: 30 },   // más alto y ancho
      nombre:  { x: 5, y: 40, fontSize: 8, visible: true },
      precio:  { x: 5, y: 55, fontSize: 10, visible: true },
      unidad:  { x: 5, y: 70, fontSize: 6, visible: true }
    })]);

  // Plantilla 63.5x50.8 2 columnas (más grande)
  db.run(`INSERT INTO plantillas (nombre, ancho_mm, alto_mm, columnas, config_json) VALUES (?, ?, ?, ?, ?)`,
    ['63.5x50.8 2 columnas', 63.5, 50.8, 2, JSON.stringify({
      barcode: { x: 5, y: 5, width: 60, height: 30 },
      nombre:  { x: 5, y: 40, fontSize: 8, visible: true },
      precio:  { x: 5, y: 55, fontSize: 10, visible: true },
      unidad:  { x: 5, y: 70, fontSize: 6, visible: true }
    })]);

  // Plantilla 30x20 3 columnas (ajustada proporcionalmente)
  db.run(`INSERT INTO plantillas (nombre, ancho_mm, alto_mm, columnas, config_json) VALUES (?, ?, ?, ?, ?)`,
    ['30x20 3 columnas', 30, 20, 3, JSON.stringify({
      barcode: { x: 2, y: 2, width: 26, height: 10 },
      nombre:  { x: 2, y: 13, fontSize: 5, visible: true },
      precio:  { x: 2, y: 17, fontSize: 6, visible: true },
      unidad:  { x: 2, y: 19, fontSize: 4, visible: true }
    })]);

  // ... (el resto del código de configuración sigue igual)
}
  logToFile(`DB en: ${dbPath}`);
}

// ============================================================
// HANDLERS
// ============================================================
ipcMain.handle('db:getProductos', () => toObjects(db.exec('SELECT * FROM productos WHERE activo = 1 ORDER BY nombre')));
ipcMain.handle('db:saveProducto', async (_, p) => {
  try {
    const codigo = (p.codigo || '').trim().toUpperCase();
    const nombre = (p.nombre || '').trim().toUpperCase();
    const precio = parseFloat(p.precio) || 0;
    const unidad = (p.unidad || 'UND').trim().toUpperCase();
    const id = p.id || null;
    const now = getLocalDateTime();
    if (!codigo || !nombre) throw new Error('Código y nombre obligatorios');
    if (id) {
      db.run(`UPDATE productos SET codigo=?, nombre=?, precio=?, unidad=?, updated_at=? WHERE id=?`, [codigo, nombre, precio, unidad, now, id]);
    } else {
      db.run(`INSERT INTO productos (codigo, nombre, precio, unidad, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`, [codigo, nombre, precio, unidad, now, now]);
    }
    saveDb();
    return { success: true };
  } catch (err) { logToFile(`saveProducto error: ${err.message}`); throw err; }
});
ipcMain.handle('db:deleteProducto', (_, id) => { db.run('UPDATE productos SET activo = 0 WHERE id = ?', [id]); saveDb(); return { success: true }; });
ipcMain.handle('db:getPlantillas', () => toObjects(db.exec('SELECT * FROM plantillas WHERE activo = 1')));
ipcMain.handle('db:updatePlantilla', (_, id, configJson) => { db.run('UPDATE plantillas SET config_json = ? WHERE id = ?', [configJson, id]); saveDb(); return { success: true }; });
ipcMain.handle('config:get', (_, clave) => { const rows = toObjects(db.exec('SELECT valor FROM configuracion WHERE clave = ?', [clave])); return rows.length ? rows[0].valor : null; });
ipcMain.handle('config:set', (_, clave, valor) => { db.run('INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?, ?)', [clave, valor]); saveDb(); return { success: true }; });
ipcMain.handle('db:getHistorial', () => toObjects(db.exec(`SELECT h.*, p.nombre as producto_nombre, p.codigo, pl.nombre as plantilla_nombre FROM historial_impresiones h LEFT JOIN productos p ON h.producto_id = p.id LEFT JOIN plantillas pl ON h.plantilla_id = pl.id ORDER BY h.fecha DESC LIMIT 500`)));
ipcMain.handle('db:saveHistorial', (_, data) => { db.run(`INSERT INTO historial_impresiones (producto_id, plantilla_id, cantidad, estado, fecha) VALUES (?, ?, ?, ?, ?)`, [data.producto_id, data.plantilla_id, data.cantidad, data.estado || 'OK', getLocalDateTime()]); saveDb(); return { success: true }; });

// ============================================================
// LISTAR IMPRESORAS
// ============================================================
ipcMain.handle('print:getPrinters', async () => {
  return new Promise((resolve) => {
    exec('powershell "Get-Printer | ForEach-Object { $_.Name }"', (error, stdout) => {
      if (error) { logToFile(`Error listando impresoras: ${error.message}`); resolve([]); return; }
      const printers = stdout.split('\n').map(l => l.trim()).filter(l => l && !l.toLowerCase().includes('microsoft') && !l.toLowerCase().includes('pdf'));
      resolve(printers.map(name => ({ name })));
    });
  });
});

ipcMain.handle('print:image', async (_, base64Image, printerName, widthMM, heightMM) => {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({ show: false, webPreferences: { offscreen: false } });
    const html = `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Imprimir Etiqueta</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          display: flex;
          justify-content: center;
          align-items: center;
          width: 100%;
          height: 100%;
        }
        img {
          width: 100%;
          height: auto;
          display: block;
        }
      </style>
    </head>
    <body>
      <img src="data:image/png;base64,${base64Image}" />
    </body>
    </html>`;
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    win.webContents.on('did-finish-load', () => {
      const printOptions = {
        silent: true,
        deviceName: printerName,
        pageSize: { width: widthMM, height: heightMM, unit: 'mm' },
        margins: { marginType: 'none' },
        scaleFactor: 1
      };
      win.webContents.print(printOptions, (success, error) => {
        win.close();
        if (success) resolve({ success: true });
        else reject(new Error(error));
      });
    });
    win.webContents.on('did-fail-load', (_, code, desc) => {
      win.close();
      reject(new Error(desc));
    });
  });
});

// Función para obtener el puerto (ej: USB001, COM3, etc.) desde el nombre de la impresora
function getPrinterPort(printerName) {
  return new Promise((resolve) => {
    exec(`powershell "Get-Printer -Name '${printerName}' | Select-Object -ExpandProperty PortName"`, (error, stdout) => {
      if (error) {
        console.error('Error obteniendo puerto:', error);
        resolve(null);
      } else {
        resolve(stdout.trim() || null);
      }
    });
  });
}

// Handler para enviar TSPL raw al puerto de la impresora
ipcMain.handle('print:tspl', async (_, tsplData, printerName) => {
  const tempFile = path.join(os.tmpdir(), `tspl_${Date.now()}.prn`);
  return new Promise((resolve, reject) => {
    fs.writeFile(tempFile, tsplData, 'utf8', (err) => {
      if (err) return reject(new Error(`No se pudo crear archivo temporal: ${err.message}`));
      const command = `copy /B "${tempFile}" \\\\localhost\\${printerName}`;
      exec(command, (error, stdout, stderr) => {
        fs.unlink(tempFile, () => {});
        if (error) {
          console.error('Error enviando TSPL:', error);
          reject(new Error(`Error al enviar a impresora: ${error.message || stderr}`));
        } else {
          resolve({ success: true });
        }
      });
    });
  });
});

// ============================================================
// EXCEL (resumido, igual que antes)
// ============================================================
ipcMain.handle('dialog:openFile', async () => (await dialog.showOpenDialog(mainWindow, { title: 'Seleccionar archivo Excel', filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }], properties: ['openFile'] })).filePaths[0]);
ipcMain.handle('excel:getSheets', async (_, filePath) => {
  const ExcelJS = require('exceljs');
  const tmpPath = path.join(os.tmpdir(), 'mpcl_import_' + Date.now() + '.xlsx');
  fs.copyFileSync(filePath, tmpPath);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(tmpPath);
  fs.unlinkSync(tmpPath);
  return workbook.worksheets.map((ws, i) => ({ index: i, name: ws.name }));
});
ipcMain.handle('excel:preview', async (_, filePath, sheetIndex) => {
  const ExcelJS = require('exceljs');
  const tmpPath = path.join(os.tmpdir(), 'mpcl_import_' + Date.now() + '.xlsx');
  fs.copyFileSync(filePath, tmpPath);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(tmpPath);
  fs.unlinkSync(tmpPath);
  const worksheet = workbook.worksheets[sheetIndex];
  const rows = [];
  worksheet.eachRow((row, rowNumber) => { if (rowNumber <= 6) rows.push(row.values.slice(1)); });
  if (rows.length === 0) return { error: 'Hoja vacía' };
  const headers = rows[0].map(h => String(h || '').trim().toLowerCase());
  const required = ['codigo', 'nombre', 'precio', 'unidad'];
  const missing = required.filter(r => !headers.includes(r));
  if (missing.length) return { error: `Faltan columnas: ${missing.join(', ')}` };
  return { rows: rows.slice(1, 6), headers };
});
ipcMain.handle('excel:import', async (_, filePath, sheetIndex) => {
  const ExcelJS = require('exceljs');
  const tmpPath = path.join(os.tmpdir(), 'mpcl_import_' + Date.now() + '.xlsx');
  fs.copyFileSync(filePath, tmpPath);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(tmpPath);
  fs.unlinkSync(tmpPath);
  const worksheet = workbook.worksheets[sheetIndex];
  const allRows = [];
  worksheet.eachRow((row, rowNumber) => { allRows.push(row.values.slice(1)); });
  if (allRows.length < 2) return { error: 'Sin datos' };
  const headers = allRows[0].map(h => String(h || '').trim().toLowerCase());
  const colMap = {
    codigo: headers.indexOf('codigo'),
    nombre: headers.indexOf('nombre'),
    precio: headers.indexOf('precio'),
    unidad: headers.indexOf('unidad')
  };
  let nuevos = 0, actualizados = 0, sinCambios = 0, errores = 0;
  for (let i = 1; i < allRows.length; i++) {
    const values = allRows[i];
    const codigo = String(values[colMap.codigo] || '').trim();
    const nombre = String(values[colMap.nombre] || '').trim();
    const unidad = String(values[colMap.unidad] || 'UND').trim();
    let precio = 0;
    if (values[colMap.precio] !== undefined && values[colMap.precio] !== null) {
      precio = parseFloat(String(values[colMap.precio]).replace(/[^0-9.-]/g, '')) || 0;
    }
    if (!codigo || !nombre) { errores++; continue; }
    const existing = db.exec('SELECT id, nombre, precio, unidad FROM productos WHERE codigo = ?', [codigo]);
    const now = getLocalDateTime();
    if (existing.length === 0 || existing[0].values.length === 0) {
      db.run(`INSERT INTO productos (codigo, nombre, precio, unidad, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`, [codigo, nombre, precio, unidad, now, now]);
      nuevos++;
    } else {
      const old = existing[0].values[0];
      if (old[1] !== nombre || old[2] !== precio || old[3] !== unidad) {
        db.run(`UPDATE productos SET nombre=?, precio=?, unidad=?, updated_at=? WHERE codigo=?`, [nombre, precio, unidad, now, codigo]);
        actualizados++;
      } else {
        sinCambios++;
      }
    }
  }
  saveDb();
  return { nuevos, actualizados, sinCambios, errores };
});

// ============================================================
// VENTANA PRINCIPAL
// ============================================================
function createWindow() {
  Menu.setApplicationMenu(null);
  mainWindow = new BrowserWindow({
    width: 1200, height: 800, minWidth: 800, minHeight: 600,
    webPreferences: { preload: path.join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false },
    title: 'MPCL - Códigos de Barra', show: false
  });
  mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] || `file://${path.join(__dirname, '../renderer/index.html')}`);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  //if (!app.isPackaged) mainWindow.webContents.openDevTools();
}

app.whenReady().then(async () => {
  await initDatabase();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
>>>>>>> 125d969 (Actualizar código fuente y configurar .gitignore para ignorar builds)
