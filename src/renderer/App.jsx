import React from 'react'

function App() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: '#f8f9fa',
      fontFamily: 'sans-serif'
    }}>
      <h1 style={{ fontSize: '2rem', color: '#1a1a2e', marginBottom: '8px' }}>
        MPCL — Códigos de Barra
      </h1>
      <p style={{ color: '#666', fontSize: '1rem' }}>
        Sistema de impresión de etiquetas
      </p>
      <div style={{
        marginTop: '32px',
        padding: '16px 32px',
        background: '#1a1a2e',
        color: 'white',
        borderRadius: '8px',
        fontSize: '0.9rem'
      }}>
        Fase 1 completada — Electron + React funcionando
      </div>
    </div>
  )
}

export default App