const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const os = require('os');

let db;
let SQL;
let mainWindow;

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

// ============================================================
// BASE DE DATOS
// ============================================================
async function initDatabase() {
  const initSqlJs = require('sql.js');
  SQL = await initSqlJs();
  const dbPath = path.join(app.getPath('userData'), 'productos.db');

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  function saveDb() {
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
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
    db.run(`INSERT INTO plantillas (nombre, ancho_mm, alto_mm, columnas, config_json) VALUES (?, ?, ?, ?, ?)`,
      ['63.5x50.8 1 columna', 63.5, 50.8, 1, JSON.stringify({
        barcode: { x: 5, y: 5, height: 30, width: 60 },
        nombre: { x: 5, y: 40, fontSize: 12, visible: true },
        precio: { x: 5, y: 60, fontSize: 14, visible: true },
        unidad: { x: 5, y: 75, fontSize: 10, visible: true }
      })]);
    db.run(`INSERT INTO plantillas (nombre, ancho_mm, alto_mm, columnas, config_json) VALUES (?, ?, ?, ?, ?)`,
      ['63.5x50.8 2 columnas', 63.5, 50.8, 2, JSON.stringify({
        barcode: { x: 5, y: 5, height: 30, width: 60 },
        nombre: { x: 5, y: 40, fontSize: 12, visible: true },
        precio: { x: 5, y: 60, fontSize: 14, visible: true },
        unidad: { x: 5, y: 75, fontSize: 10, visible: true }
      })]);
    db.run(`INSERT INTO plantillas (nombre, ancho_mm, alto_mm, columnas, config_json) VALUES (?, ?, ?, ?, ?)`,
      ['30x20 3 columnas', 30, 20, 3, JSON.stringify({
        barcode: { x: 2, y: 2, height: 10, width: 26 },
        nombre: { x: 2, y: 13, fontSize: 7, visible: true },
        precio: { x: 2, y: 17, fontSize: 8, visible: true },
        unidad: { x: 2, y: 19, fontSize: 6, visible: true }
      })]);

    db.run(`INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('impresora_default', '')`);
    saveDb();
  }

  console.log('DB iniciada en:', dbPath);

  function toObjects(results) {
    if (!results || results.length === 0) return [];
    const { columns, values } = results[0];
    return values.map(row => {
      const obj = {};
      columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  }

  // ============================================================
  // HANDLERS PRINCIPALES
  // ============================================================
  ipcMain.handle('db:getProductos', () => {
    const r = db.exec('SELECT * FROM productos WHERE activo = 1 ORDER BY nombre');
    return toObjects(r);
  });

  ipcMain.handle('db:saveProducto', (_, p) => {
    const now = getLocalDateTime();
    if (p.id) {
      db.run(`UPDATE productos SET codigo=?, nombre=?, precio=?, unidad=?, updated_at=? WHERE id=?`,
        [p.codigo, p.nombre, p.precio, p.unidad, now, p.id]);
    } else {
      db.run(`INSERT INTO productos (codigo, nombre, precio, unidad, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [p.codigo, p.nombre, p.precio, p.unidad, now, now]);
    }
    saveDb();
    return { success: true };
  });

  ipcMain.handle('db:deleteProducto', (_, id) => {
    db.run('UPDATE productos SET activo = 0 WHERE id = ?', [id]);
    saveDb();
    return { success: true };
  });

  ipcMain.handle('db:getPlantillas', () => {
    const r = db.exec('SELECT * FROM plantillas WHERE activo = 1');
    return toObjects(r);
  });

  ipcMain.handle('db:updatePlantilla', (_, id, configJson) => {
    db.run(`UPDATE plantillas SET config_json = ? WHERE id = ?`, [configJson, id]);
    saveDb();
    return { success: true };
  });

  ipcMain.handle('config:get', (_, clave) => {
    const r = db.exec('SELECT valor FROM configuracion WHERE clave = ?', [clave]);
    const rows = toObjects(r);
    return rows.length ? rows[0].valor : null;
  });

  ipcMain.handle('config:set', (_, clave, valor) => {
    db.run('INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?, ?)', [clave, valor]);
    saveDb();
    return { success: true };
  });

  ipcMain.handle('db:getHistorial', () => {
    const r = db.exec(`
      SELECT h.*, p.nombre as producto_nombre, p.codigo,
             pl.nombre as plantilla_nombre
      FROM historial_impresiones h
      LEFT JOIN productos p ON h.producto_id = p.id
      LEFT JOIN plantillas pl ON h.plantilla_id = pl.id
      ORDER BY h.fecha DESC LIMIT 500
    `);
    return toObjects(r);
  });

  ipcMain.handle('db:saveHistorial', (_, data) => {
    const now = getLocalDateTime();
    db.run(`INSERT INTO historial_impresiones (producto_id, plantilla_id, cantidad, estado, fecha) VALUES (?, ?, ?, ?, ?)`,
      [data.producto_id, data.plantilla_id, data.cantidad, data.estado || 'OK', now]);
    saveDb();
    return { success: true };
  });

  // ============================================================
  // IMPRESIÓN TSPL (ENVÍO A IMPRESORA)
  // ============================================================
  ipcMain.handle('print:getPrinters', async () => {
    return new Promise((resolve) => {
      exec('powershell "Get-Printer | ForEach-Object { $_.Name }"', (error, stdout) => {
        if (error) {
          console.error('Error listando impresoras:', error);
          resolve([]);
          return;
        }
        const printers = stdout.split('\n').map(l => l.trim()).filter(l => l && !l.toLowerCase().includes('microsoft') && !l.toLowerCase().includes('pdf'));
        console.log('Impresoras detectadas:', printers);
        resolve(printers.map(name => ({ name })));
      });
    });
  });

  ipcMain.handle('print:tspl', async (_, tsplData, printerName) => {
    console.log('print:tspl llamado para:', printerName);
    console.log('Datos TSPL:', tsplData);
    
    const tempFile = path.join(os.tmpdir(), `tspl_${Date.now()}.prn`);
    return new Promise((resolve, reject) => {
      fs.writeFile(tempFile, tsplData, 'utf8', (err) => {
        if (err) {
          console.error('Error escribiendo archivo temporal:', err);
          return reject(new Error(`No se pudo crear archivo: ${err.message}`));
        }
        const command = `copy /B "${tempFile}" \\\\localhost\\${printerName}`;
        console.log('Ejecutando comando:', command);
        exec(command, (error, stdout, stderr) => {
          fs.unlink(tempFile, () => {});
          if (error) {
            console.error('Error en comando copy:', error);
            reject(new Error(`Error al enviar a la impresora "${printerName}". Verifique que esté compartida.`));
          } else {
            console.log('✅ Comando TSPL enviado correctamente');
            resolve({ success: true });
          }
        });
      });
    });
  });

  // ============================================================
  // EXCEL
  // ============================================================
  ipcMain.handle('dialog:openFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Seleccionar archivo Excel',
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }],
      properties: ['openFile']
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

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
    if (rows.length === 0) return { error: 'La hoja está vacía' };
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
    if (allRows.length < 2) return { error: 'No hay datos' };
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
        db.run(`INSERT INTO productos (codigo, nombre, precio, unidad, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
          [codigo, nombre, precio, unidad, now, now]);
        nuevos++;
      } else {
        const existingObj = {};
        existing[0].columns.forEach((c, idx) => { existingObj[c] = existing[0].values[0][idx]; });
        const changed = existingObj.nombre !== nombre || existingObj.precio !== precio || existingObj.unidad !== unidad;
        if (changed) {
          db.run(`UPDATE productos SET nombre=?, precio=?, unidad=?, updated_at=? WHERE codigo=?`,
            [nombre, precio, unidad, now, codigo]);
          actualizados++;
        } else {
          sinCambios++;
        }
      }
    }
    saveDb();
    return { nuevos, actualizados, sinCambios, errores };
  });
}

// ============================================================
// VENTANA PRINCIPAL
// ============================================================
function createWindow() {
  // No elimines el menú de Electron, eso solo quita el menú nativo (Archivo, Editar, etc.)
  // Tu menú de React sigue funcionando independientemente.
  Menu.setApplicationMenu(null);
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
  });

  mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] || `file://${path.join(__dirname, '../renderer/index.html')}`);
  mainWindow.once('ready-to-show', () => { mainWindow.show(); });

  // Abrir consola con F12
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      mainWindow.webContents.openDevTools();
      event.preventDefault();
    }
  });

  // Abrir consola automática en desarrollo
  if (!app.isPackaged) {
    //mainWindow.webContents.openDevTools();
  }
}

// ============================================================
// INICIO DE LA APP
// ============================================================
app.whenReady().then(async () => {
  await initDatabase();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});