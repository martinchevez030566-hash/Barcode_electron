const Database = require('better-sqlite3')
const path = require('path')
const { app } = require('electron')

let db

function getDbPath() {
  return path.join(app.getPath('userData'), 'productos.db')
}

function initDatabase() {
  const dbPath = getDbPath()
  db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  createTables()
  seedData()

  console.log('Base de datos iniciada en:', dbPath)
  return db
}

function createTables() {
  db.exec(`
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
      estado TEXT DEFAULT 'OK',
      FOREIGN KEY (producto_id) REFERENCES productos(id),
      FOREIGN KEY (plantilla_id) REFERENCES plantillas(id)
    );

    CREATE TABLE IF NOT EXISTS configuracion (
      clave TEXT PRIMARY KEY,
      valor TEXT
    );
  `)
}

function seedData() {
  const count = db.prepare('SELECT COUNT(*) as total FROM plantillas').get()

  if (count.total === 0) {
    const insert = db.prepare(`
      INSERT INTO plantillas (nombre, ancho_mm, alto_mm, columnas, config_json)
      VALUES (?, ?, ?, ?, ?)
    `)

    insert.run(
      'Pequeña 40x20',
      40, 20, 2,
      JSON.stringify({
        barcode: { x: 5, y: 2, width: 30, height: 10 },
        sku:     { x: 5, y: 14, fontSize: 6 }
      })
    )

    insert.run(
      'Mediana 63x50',
      63.5, 50.8, 2,
      JSON.stringify({
        barcode: { x: 5, y: 5, width: 53, height: 20 },
        nombre:  { x: 5, y: 30, fontSize: 8 },
        precio:  { x: 5, y: 40, fontSize: 10 },
        sku:     { x: 5, y: 48, fontSize: 6 }
      })
    )

    insert.run(
      'Grande 80x50',
      80, 50, 2,
      JSON.stringify({
        barcode: { x: 5, y: 5, width: 70, height: 22 },
        nombre:  { x: 5, y: 32, fontSize: 9 },
        precio:  { x: 5, y: 42, fontSize: 12 },
        sku:     { x: 5, y: 48, fontSize: 6 }
      })
    )

    const cfg = db.prepare(`
      INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?, ?)
    `)
    cfg.run('plantilla_default', '2')
    cfg.run('impresora_default', '')
    cfg.run('empresa_nombre', 'MPCL')
    cfg.run('pistola_activa', '1')

    console.log('Datos iniciales creados correctamente')
  }
}

function getDb() {
  if (!db) throw new Error('Base de datos no iniciada')
  return db
}

module.exports = { initDatabase, getDb }