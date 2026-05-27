import React, { useState, useEffect } from 'react'

function App() {
  const [plantillas, setPlantillas] = useState([])
  const [config, setConfig] = useState('')
  const [status, setStatus] = useState('Conectando...')

  useEffect(() => {
    async function cargarDatos() {
      try {
        const pl = await window.electronAPI.getPlantillas()
        const cfg = await window.electronAPI.getConfig('empresa_nombre')
        setPlantillas(pl)
        setConfig(cfg)
        setStatus('✅ Base de datos conectada')
      } catch (error) {
        setStatus('❌ Error: ' + error.message)
      }
    }
    cargarDatos()
  }, [])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: '#f8f9fa',
      fontFamily: 'sans-serif',
      gap: '16px'
    }}>
      <h1 style={{ fontSize: '2rem', color: '#1a1a2e' }}>
        MPCL — Códigos de Barra
      </h1>

      <div style={{
        padding: '12px 24px',
        background: '#1a1a2e',
        color: 'white',
        borderRadius: '8px'
      }}>
        {status}
      </div>

      <div style={{ fontSize: '0.9rem', color: '#444' }}>
        Empresa: <strong>{config}</strong>
      </div>

      <div style={{ width: '400px' }}>
        <p style={{ fontWeight: 'bold', marginBottom: '8px' }}>
          Plantillas cargadas: {plantillas.length}
        </p>
        {plantillas.map(p => (
          <div key={p.id} style={{
            padding: '8px 12px',
            background: 'white',
            border: '1px solid #ddd',
            borderRadius: '6px',
            marginBottom: '6px',
            fontSize: '0.85rem'
          }}>
            {p.nombre} — {p.ancho_mm}mm × {p.alto_mm}mm
          </div>
        ))}
      </div>
    </div>
  );
}

function btnStyle(bg) {
  return {
    background: bg, color: 'white', border: 'none',
    borderRadius: 8, padding: '10px 20px',
    cursor: 'pointer', fontSize: 13, fontWeight: 500
  }
}

// ============================================================
// PANEL CONFIGURACIÓN (SELECCIÓN DE IMPRESORA)
// ============================================================
function ConfiguracionPanel() {
  const [impresoras, setImpresoras] = useState([]);
  const [impresoraSeleccionada, setImpresoraSeleccionada] = useState('');
  const [mensaje, setMensaje] = useState('');

  useEffect(() => { cargarImpresoras(); cargarImpresoraGuardada(); }, []);

  async function cargarImpresoras() {
    try {
      const lista = await window.electronAPI.getPrinters();
      setImpresoras(lista);
    } catch (err) { console.error(err); }
  }

  async function cargarImpresoraGuardada() {
    const guardada = await window.electronAPI.getConfig('impresora_default');
    if (guardada) setImpresoraSeleccionada(guardada);
  }

  async function guardarImpresora() {
    if (!impresoraSeleccionada) return;
    await window.electronAPI.setConfig('impresora_default', impresoraSeleccionada);
    setMensaje('✅ Impresora guardada');
    setTimeout(() => setMensaje(''), 3000);
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', background: 'white', borderRadius: 12, padding: 24 }}>
      <h2>⚙️ Configuración de impresora</h2>
      <select value={impresoraSeleccionada} onChange={e => setImpresoraSeleccionada(e.target.value)} style={{ width: '100%', padding: 10, margin: '10px 0', borderRadius: 6, border: '1px solid #cbd5e1' }}>
        <option value="">-- Selecciona una impresora --</option>
        {impresoras.map((printer, idx) => <option key={idx} value={printer.name}>{printer.name}</option>)}
      </select>
      <button onClick={guardarImpresora} style={{ background: '#0d6efd', color: 'white', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer' }}>Guardar</button>
      {mensaje && <p style={{ marginTop: 12, color: '#15803d' }}>{mensaje}</p>}
    </div>
  );
}

export default App;