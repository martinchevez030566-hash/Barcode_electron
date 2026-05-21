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
  )
}

export default App