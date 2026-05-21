import React, { useState, useEffect } from 'react'

const STEPS = { IDLE: 0, SHEETS: 1, PREVIEW: 2, IMPORTING: 3, DONE: 4 }

function App() {
  const [step, setStep]           = useState(STEPS.IDLE)
  const [filePath, setFilePath]   = useState(null)
  const [fileName, setFileName]   = useState('')
  const [sheets, setSheets]       = useState([])
  const [sheetIdx, setSheetIdx]   = useState(0)
  const [preview, setPreview]     = useState([])
  const [headers, setHeaders]     = useState([])
  const [result, setResult]       = useState(null)
  const [error, setError]         = useState(null)
  const [loading, setLoading]     = useState(false)
  const [productos, setProductos] = useState([])

  useEffect(() => { loadProductos() }, [])

  async function loadProductos() {
    const list = await window.electronAPI.getProductos()
    setProductos(list)
  }

  async function handleSelectFile() {
    setError(null)
    const fp = await window.electronAPI.openFileDialog()
    if (!fp) return
    setFilePath(fp)
    setFileName(fp.split('\\').pop())
    setLoading(true)
    try {
      const sh = await window.electronAPI.getSheets(fp)
      setSheets(sh)
      setStep(STEPS.SHEETS)
    } catch (e) {
      setError('No se pudo leer el archivo. Verifica que no esté abierto en Excel.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSelectSheet() {
    setError(null)
    setLoading(true)
    try {
      const res = await window.electronAPI.getPreview(filePath, sheetIdx)
      if (res.error) { setError(res.error); setLoading(false); return }
      setPreview(res.rows)
      setHeaders(res.headers)
      setStep(STEPS.PREVIEW)
    } catch (e) {
      setError('Error al leer la hoja: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleImport() {
    setStep(STEPS.IMPORTING)
    try {
      const res = await window.electronAPI.importExcel(filePath, sheetIdx)
      if (res.error) { setError(res.error); setStep(STEPS.PREVIEW); return }
      setResult(res)
      setStep(STEPS.DONE)
      loadProductos()
    } catch (e) {
      setError(e.message)
      setStep(STEPS.PREVIEW)
    }
  }

  function handleReset() {
    setStep(STEPS.IDLE)
    setFilePath(null)
    setFileName('')
    setSheets([])
    setPreview([])
    setHeaders([])
    setResult(null)
    setError(null)
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: 24, fontFamily: 'sans-serif' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, color: '#1a1a2e', margin: 0 }}>MPCL — Importar Productos</h1>
          <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>
            Productos en DB: <strong>{productos.length}</strong>
          </p>
        </div>
        {step !== STEPS.IDLE && (
          <button onClick={handleReset} style={btnStyle('#94a3b8')}>← Volver</button>
        )}
      </div>

      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 16px', marginBottom: 16, color: '#991b1b', fontSize: 13 }}>
          ❌ {error}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>⏳ Procesando...</div>
      )}

      {/* PASO 0 — Seleccionar archivo */}
      {step === STEPS.IDLE && !loading && (
        <div style={{ border: '2px dashed #cbd5e1', borderRadius: 12, padding: 40, textAlign: 'center' }}>
          <p style={{ fontSize: 15, color: '#1a1a2e', fontWeight: 500, marginBottom: 8 }}>
            Selecciona el archivo Excel con los productos
          </p>
          <div style={{ background: '#f1f5f9', borderRadius: 8, padding: '12px 20px', display: 'inline-block', marginBottom: 20, textAlign: 'left' }}>
            <p style={{ fontSize: 12, color: '#475569', margin: 0, fontWeight: 600, marginBottom: 6 }}>
              📋 Requisitos del archivo:
            </p>
            <ul style={{ fontSize: 12, color: '#64748b', margin: 0, paddingLeft: 16, lineHeight: 1.8 }}>
              <li>La <strong>fila 1</strong> debe contener los nombres de columna</li>
              <li>Columnas requeridas: <strong>codigo, nombre, precio, unidad</strong></li>
              <li>Los nombres deben estar en <strong>minúsculas y sin tildes</strong></li>
              <li>El precio debe ser un <strong>número</strong> (sin S/. ni $)</li>
              <li>Cierra el archivo en Excel antes de importar</li>
            </ul>
          </div>
          <br />
          <button onClick={handleSelectFile} style={btnStyle('#1a1a2e')}>
            📂 Seleccionar Excel
          </button>
        </div>
      )}

      {/* PASO 1 — Seleccionar hoja */}
      {step === STEPS.SHEETS && !loading && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24 }}>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>Archivo: <strong>{fileName}</strong></p>
          <h3 style={{ fontSize: 15, marginBottom: 16 }}>Selecciona la hoja con los productos:</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            {sheets.map(s => (
              <button key={s.index} onClick={() => setSheetIdx(s.index)}
                style={btnStyle(sheetIdx === s.index ? '#1a1a2e' : '#94a3b8')}>
                {s.name}
              </button>
            ))}
          </div>
          <button onClick={handleSelectSheet} style={btnStyle('#16a34a')}>Continuar →</button>
        </div>
      )}

      {/* PASO 2 — Previsualización */}
      {step === STEPS.PREVIEW && !loading && (
        <div>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24, marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, marginBottom: 4 }}>Vista previa (primeras 5 filas de datos):</h3>
            <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
              Columnas detectadas: <strong>{headers.join(', ')}</strong>
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {headers.map((h, i) => (
                      <th key={i} style={{ background: '#1a1a2e', color: 'white', padding: '6px 10px', textAlign: 'left' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, ri) => (
                    <tr key={ri} style={{ background: ri % 2 === 0 ? 'white' : '#f8fafc' }}>
                      {row.map((cell, ci) => (
                        <td key={ci} style={{ padding: '5px 10px', border: '1px solid #e2e8f0' }}>
                          {String(cell ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <button onClick={handleImport} style={btnStyle('#16a34a')}>✅ Confirmar e importar</button>
        </div>
      )}

      {/* PASO 3 — Importando */}
      {step === STEPS.IMPORTING && (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <p style={{ fontSize: 18, color: '#1a1a2e' }}>⏳ Importando productos...</p>
          <p style={{ fontSize: 13, color: '#64748b' }}>No cierres la aplicación</p>
        </div>
      )}

      {/* PASO 4 — Resultado */}
      {step === STEPS.DONE && result && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12, padding: 24 }}>
          <h3 style={{ color: '#15803d', marginBottom: 16, fontSize: 16 }}>✅ Importación completada</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
            {[
              ['Nuevos',      result.nuevos,      '#16a34a'],
              ['Actualizados',result.actualizados, '#2563eb'],
              ['Sin cambios', result.sinCambios,   '#64748b'],
              ['Errores',     result.errores,      '#dc2626']
            ].map(([label, val, color]) => (
              <div key={label} style={{ textAlign: 'center', background: 'white', borderRadius: 8, padding: 16, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 32, fontWeight: 'bold', color }}>{val}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
            Total en DB: <strong>{productos.length}</strong> productos
          </p>
          <button onClick={handleReset} style={btnStyle('#1a1a2e')}>← Nueva importación</button>
        </div>
      )}

    </div>
  )
}

function btnStyle(bg) {
  return {
    background: bg, color: 'white', border: 'none',
    borderRadius: 8, padding: '10px 20px',
    cursor: 'pointer', fontSize: 13, fontWeight: 500
  }
}

export default App