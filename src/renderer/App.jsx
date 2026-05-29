import React, { useState, useEffect, useRef } from 'react';
import bwipjs from 'bwip-js';
import * as XLSX from 'xlsx';

// ============================================================
// CONSTANTES
// ============================================================
const DPI = 203;
const DOT_PER_MM = DPI / 25.4;
const ESPACIO_ENTRE_COLUMNAS_MM = 2;

// ============================================================
// VALIDACIÓN CÓDIGO DE BARRAS
// ============================================================
function validarCodigoCode39(codigo) {
  return /^[A-Z0-9\-\$\%\+\/\.\ ]+$/.test(codigo.toUpperCase().trim());
}

// ============================================================
// DIBUJAR ETIQUETA
// ============================================================
async function dibujarEtiqueta(canvas, producto, plantilla, escala) {
  if (!canvas || !producto || !plantilla) return;
  const ctx = canvas.getContext('2d');
  const anchoPx = plantilla.ancho_mm * escala;
  const altoPx = plantilla.alto_mm * escala;
  canvas.width = anchoPx;
  canvas.height = altoPx;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, anchoPx, altoPx);

  let config;
  try {
    config = JSON.parse(plantilla.config_json || '{}');
  } catch (e) {
    ctx.fillStyle = '#ff0000';
    ctx.font = '12px sans-serif';
    ctx.fillText('Error: JSON inválido', 10, 20);
    return;
  }

  if (config.barcode && producto) {
    if (!validarCodigoCode39(producto.codigo)) {
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#ff0000';
      ctx.fillText(`Código inválido: ${producto.codigo}`, 10, 20);
    } else {
      try {
        const bcCanvas = document.createElement('canvas');
        await bwipjs.toCanvas(bcCanvas, {
          bcid: 'code39',
          text: producto.codigo.toUpperCase(),
          scale: Math.max(1, Math.round(escala / 2)),
          height: (config.barcode.height || 10) * escala,
          includetext: false
        });
        const x = (config.barcode.x || 5) * escala;
        const y = (config.barcode.y || 5) * escala;
        const w = (config.barcode.width || 40) * escala;
        const h = (config.barcode.height || 20) * escala;
        ctx.drawImage(bcCanvas, x, y, w, h);
      } catch (err) {
        ctx.fillStyle = '#ff0000';
        ctx.fillText('Error código', 10, 20);
      }
    }
  }

  if (config.nombre && config.nombre.visible !== false) {
    ctx.font = `${(config.nombre.fontSize || 8) * escala}px monospace`;
    ctx.fillStyle = '#000';
    ctx.fillText(producto.nombre, (config.nombre.x || 5) * escala, (config.nombre.y || 30) * escala);
  }
  if (config.precio && config.precio.visible !== false) {
    ctx.font = `${(config.precio.fontSize || 10) * escala}px monospace`;
    ctx.fillStyle = '#000';
    ctx.fillText(`S/ ${parseFloat(producto.precio).toFixed(2)}`, (config.precio.x || 5) * escala, (config.precio.y || 50) * escala);
  }
  if (config.unidad && config.unidad.visible !== false) {
    ctx.font = `${(config.unidad.fontSize || 6) * escala}px monospace`;
    ctx.fillStyle = '#000';
    ctx.fillText(`Unidad: ${producto.unidad || 'UND'}`, (config.unidad.x || 5) * escala, (config.unidad.y || 70) * escala);
  }
}


function generarTSPL(producto, plantilla, cantidad) {
  if (!plantilla || !producto) return '';

  const anchoMM = plantilla.ancho_mm;
  const altoMM = plantilla.alto_mm;
  const columnas = plantilla.columnas || 1;
  const config = JSON.parse(plantilla.config_json || '{}');

  // 1. **CRUCIAL**: Convertir TODAS las medidas a DOTS (203 DPI)
  const mmToDots = (mm) => Math.round(mm * 8); // 200DPI:1mm=8dots [citation:4]
  
  const anchoDots = mmToDots(anchoMM);
  const altoDots = mmToDots(altoMM);
  const espacioDots = mmToDots(2); // 2mm de espacio

  // 2. Calcular desplazamiento para la segunda/tercera columna (EN DOTS)
  const offsetDots = anchoDots + espacioDots;
  const anchoTotalDots = (anchoDots * columnas) + (espacioDots * (columnas - 1));
  
  // --- PLANTILLA 1 COLUMNA (SIN CAMBIOS) ---
  if (columnas === 1) {
      let tsp = '';
      for (let i = 0; i < cantidad; i++) {
          tsp += `SIZE ${anchoMM} mm, ${altoMM} mm\r\n`;
          tsp += `GAP 2 mm, 0 mm\r\n`;
          tsp += `CLS\r\n`;
          tsp += `BARCODE 90,30,"128",50,1,0,2,2,"${producto.codigo}"\r\n`;
          tsp += `TEXT 60,150,"1",0,1,1,"${producto.nombre}"\r\n`;
          tsp += `PRINT 1,1\r\n`;
      }
      return tsp;
  }

  // --- PLANTILLA 2 COLUMNAS (CORRECCIÓN TOTAL) ---
  if (columnas === 2) {
      let tsp = '';
      for (let i = 0; i < cantidad; i++) {
          // **CRUCIAL**: El SIZE y GAP también pueden ir en DOTS para coherencia [citation:2]
          tsp += `SIZE ${anchoTotalDots} dots, ${altoDots} dots\r\n`;
          tsp += `GAP ${espacioDots} dots, 0 dots\r\n`;
          tsp += `CLS\r\n`;
          
          // Columna 1 (X=45)
          tsp += `BARCODE 25,40,"128",80,1,0,2,2,"${producto.codigo}"\r\n`;
          tsp += `TEXT 25,150,"1",0,1,1,"${producto.nombre}"\r\n`;
          
          // Columna 2 (X = 45 + offsetDots)
          // **SOLUCIÓN QUIRÚRGICA**: Sumar el ancho de una etiqueta + el espacio en DOTS [citation:1]
          tsp += `BARCODE ${-60 + offsetDots},40,"128",80,1,0,2,2,"${producto.codigo}"\r\n`;
          tsp += `TEXT ${-70 + offsetDots},150,"1",0,1,1,"${producto.nombre}"\r\n`;
          
          tsp += `PRINT 1,1\r\n`;
      }
      return tsp;
  }

  // --- PLANTILLA 3 COLUMNAS (YA FUNCIONA, PERO CON ESTA LÓGICA QUEDA MÁS LIMPIA) ---
// ==========================================
// PLANTILLA DE 3 COLUMNAS (CON CÓDIGO 2D DATA MATRIX)
// ==========================================
// ==========================================
// PLANTILLA DE 3 COLUMNAS (DATA MATRIX 2D + CÓDIGO DE BARRAS)
// ==========================================
 if (columnas === 3) {
      const espacioMM = 2;
      const offsetMM = anchoMM + espacioMM;
      const offsetDots = mmToDots(offsetMM);
      const anchoTotalMM = (anchoMM * 3) + (espacioMM * 2);
      
      let tsp = '';
      for (let i = 0; i < cantidad; i++) {
          tsp += `SIZE ${anchoTotalMM} mm, ${altoMM} mm\r\n`;
          tsp += `GAP 2 mm, 0 mm\r\n`;
          tsp += `CLS\r\n`;
          
          // Columna 1
          tsp += `DMATRIX 45,10,8,0,"${producto.codigo}"\r\n`;
          tsp += `TEXT 45,45,"1",0,1,1,"${producto.codigo}"\r\n`;
          tsp += `TEXT 45,80,"2",0,1,1,"${producto.nombre}"\r\n`;
          
          // Columna 2
          tsp += `DMATRIX ${45 + offsetDots},10,8,0,"${producto.codigo}"\r\n`;
          tsp += `TEXT ${45 + offsetDots},45,"1",0,1,1,"${producto.codigo}"\r\n`;
          tsp += `TEXT ${45 + offsetDots},80,"2",0,1,1,"${producto.nombre}"\r\n`;
          
          // Columna 3
          tsp += `DMATRIX ${45 + (offsetDots * 2)},10,8,0,"${producto.codigo}"\r\n`;
          tsp += `TEXT ${45 + (offsetDots * 2)},45,"1",0,1,1,"${producto.codigo}"\r\n`;
          tsp += `TEXT ${45 + (offsetDots * 2)},80,"2",0,1,1,"${producto.nombre}"\r\n`;
          
          tsp += `PRINT 1,1\r\n`;
      }
      return tsp;
  }
  
  return '';
}





// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
function App() {
  const [activeTab, setActiveTab] = useState('inicio');
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { cargarProductos(); }, []);

  async function cargarProductos() {
    setLoading(true);
    try {
      const lista = await window.electronAPI.getProductos();
      setProductos(lista);
    } catch (err) {
      console.error('Error cargando productos:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ fontFamily: 'sans-serif', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', background: '#0d6efd', padding: '0 24px', gap: 4 }}>
        <TabButton active={activeTab === 'inicio'} onClick={() => setActiveTab('inicio')}>🏠 Inicio</TabButton>
        <TabButton active={activeTab === 'productos'} onClick={() => setActiveTab('productos')}>📦 Productos</TabButton>
        <TabButton active={activeTab === 'importar'} onClick={() => setActiveTab('importar')}>📥 Importar Excel</TabButton>
        <TabButton active={activeTab === 'historial'} onClick={() => setActiveTab('historial')}>📋 Historial</TabButton>
        {/*<TabButton active={activeTab === 'editor'} onClick={() => setActiveTab('editor')}>✏️ Editor</TabButton>*/}
        <TabButton active={activeTab === 'config'} onClick={() => setActiveTab('config')}>⚙️ Configuración</TabButton>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 24, background: '#f8f9fa' }}>
        {activeTab === 'inicio' && <InicioPanel />}
        {activeTab === 'productos' && <ProductosPanel productos={productos} loading={loading} onProductosChange={cargarProductos} />}
        {activeTab === 'importar' && <ImportarPanel onImportComplete={cargarProductos} />}
        {activeTab === 'historial' && <HistorialPanel />}
        {activeTab === 'editor' && <EditorPanel />}
        {activeTab === 'config' && <ConfiguracionPanel />}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      background: active ? '#0b5ed7' : 'transparent',
      color: 'white',
      border: 'none',
      padding: '12px 20px',
      cursor: 'pointer',
      fontSize: 14,
      fontWeight: active ? 600 : 400,
      borderTopLeftRadius: 8,
      borderTopRightRadius: 8,
    }}>{children}</button>
  );
}

// ============================================================
// PANEL INICIO
// ============================================================
function InicioPanel() {
  const [productos, setProductos] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);
  const [plantillas, setPlantillas] = useState([]);
  const [plantillaSeleccionada, setPlantillaSeleccionada] = useState(null);
  const [cantidad, setCantidad] = useState(1);
  const [imprimiendo, setImprimiendo] = useState(false);
  const [impresoraConfigurada, setImpresoraConfigurada] = useState('');
  const canvasRef = useRef(null);
  const rolloCanvasRef = useRef(null);

  useEffect(() => { cargarDatos(); cargarImpresora(); }, []);

async function cargarDatos() {
  try {
    const [prods, plants] = await Promise.all([
      window.electronAPI.getProductos(),
      window.electronAPI.getPlantillas()
    ]);
    setProductos(prods);
    // Filtro: ocultar plantillas de 3 columnas
    const plantsFiltradas = plants.filter(p => p.columnas !== 3);
    setPlantillas(plantsFiltradas);
    if (plantsFiltradas.length > 0) setPlantillaSeleccionada(plantsFiltradas[0]);
  } catch (err) { console.error(err); }
}

  async function cargarImpresora() {
    const imp = await window.electronAPI.getConfig('impresora_default');
    setImpresoraConfigurada(imp || '');
  }

  const productosFiltrados = productos.filter(p =>
    p.codigo?.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.nombre?.toLowerCase().includes(busqueda.toLowerCase())
  ).slice(0, 10);

  const seleccionarProducto = (prod) => {
    setProductoSeleccionado(prod);
    setBusqueda(`${prod.codigo} - ${prod.nombre}`);
  };

  useEffect(() => {
    if (productoSeleccionado && plantillaSeleccionada && canvasRef.current) {
      dibujarEtiqueta(canvasRef.current, productoSeleccionado, plantillaSeleccionada, 3);
    }
  }, [productoSeleccionado, plantillaSeleccionada, cantidad]);

  useEffect(() => {
    if (plantillaSeleccionada && rolloCanvasRef.current) {
      const canvas = rolloCanvasRef.current;
      const ctx = canvas.getContext('2d');
      const plantilla = plantillaSeleccionada;
      const columnas = plantilla.columnas || 1;
      const anchoMM = plantilla.ancho_mm;
      const altoMM = plantilla.alto_mm;
      const anchoRolloMM = anchoMM * columnas + (columnas - 1) * ESPACIO_ENTRE_COLUMNAS_MM;
      const escala = 2;
      canvas.width = anchoRolloMM * escala;
      canvas.height = altoMM * escala;
      ctx.fillStyle = '#f8f9fa';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < columnas; i++) {
        const x = i * (anchoMM * escala + ESPACIO_ENTRE_COLUMNAS_MM * escala);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, 0, anchoMM * escala, altoMM * escala);
        ctx.strokeStyle = '#333';
        ctx.strokeRect(x, 0, anchoMM * escala, altoMM * escala);
        ctx.fillStyle = '#000';
        ctx.font = '10px sans-serif';
        ctx.fillText(`${anchoMM}×${altoMM} mm`, x + 2, 15);
        if (columnas > 1) ctx.fillText(`Col ${i+1}`, x + 2, 30);
      }
    }
  }, [plantillaSeleccionada]);

  const imprimir = async () => {
    if (!productoSeleccionado) return alert('Selecciona un producto');
    if (!plantillaSeleccionada) return alert('Selecciona una plantilla');
    if (!impresoraConfigurada) return alert('Configura una impresora en Configuración');
    if (!validarCodigoCode39(productoSeleccionado.codigo)) {
      alert(`Código inválido: ${productoSeleccionado.codigo}`);
      return;
    }
    setImprimiendo(true);
    try {
      const tsp = generarTSPL(productoSeleccionado, plantillaSeleccionada, cantidad);
      await window.electronAPI.printTSPL(tsp, impresoraConfigurada);
      //alert(`✅ Impresión enviada a ${impresoraConfigurada}`);
      await window.electronAPI.saveHistorial({
        producto_id: productoSeleccionado.id,
        plantilla_id: plantillaSeleccionada.id,
        cantidad: cantidad,
        estado: 'OK'
      });
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setImprimiendo(false);
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <h2>🖨️ Imprimir etiquetas</h2>
      <div style={{ marginBottom: 16, padding: '8px 12px', borderRadius: 8, background: '#f1f5f9', display: 'inline-block' }}>
        {impresoraConfigurada ? `✅ Impresora: ${impresoraConfigurada}` : '⚠️ Configura una impresora'}
      </div>
      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <div style={{ marginBottom: 24 }}>
            <label>Buscar producto:</label>
            <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Código o nombre..." style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', marginTop: 5 }} />
            {busqueda && productosFiltrados.length > 0 && (
              <div style={{ border: '1px solid #cbd5e1', borderRadius: 8, marginTop: 8, maxHeight: 200, overflowY: 'auto' }}>
                {productosFiltrados.map(prod => (
                  <div key={prod.id} onClick={() => seleccionarProducto(prod)} style={{ padding: 8, cursor: 'pointer', borderBottom: '1px solid #e2e8f0', background: productoSeleccionado?.id === prod.id ? '#e2e8f0' : 'white' }}>
                    <strong>{prod.codigo}</strong> - {prod.nombre} (S/ {parseFloat(prod.precio).toFixed(2)})
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ marginBottom: 24 }}>
            <label>Cantidad:</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
              <button onClick={() => setCantidad(Math.max(1, cantidad - 1))} style={btnSmall}>-</button>
              <input type="number" value={cantidad} onChange={(e) => setCantidad(Math.min(999, Math.max(1, parseInt(e.target.value) || 1)))} style={{ width: 80, textAlign: 'center', padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} />
              <button onClick={() => setCantidad(Math.min(999, cantidad + 1))} style={btnSmall}>+</button>
            </div>
          </div>
          <button onClick={imprimir} disabled={imprimiendo} style={{ background: '#0d6efd', color: 'white', border: 'none', borderRadius: 8, padding: '12px 24px', fontSize: 16, cursor: 'pointer', width: '100%' }}>
            {imprimiendo ? '⏳ Imprimiendo...' : `🖨️ Imprimir ${cantidad} etiqueta(s)`}
          </button>
        </div>
        <div style={{ flex: 1, minWidth: 250 }}>
          <label>Plantillas:</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {plantillas.map(pl => (
              <div key={pl.id} onClick={() => setPlantillaSeleccionada(pl)} style={{ background: plantillaSeleccionada?.id === pl.id ? '#0d6efd' : '#f1f5f9', color: plantillaSeleccionada?.id === pl.id ? 'white' : '#1e293b', borderRadius: 8, padding: '12px 16px', cursor: 'pointer', border: '1px solid #cbd5e1' }}>
                <strong>{pl.nombre}</strong><br />
                <span style={{ fontSize: 12 }}>{pl.ancho_mm}×{pl.alto_mm} mm | {pl.columnas} col</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ marginBottom: 20 }}><label>Vista del rollo:</label><canvas ref={rolloCanvasRef} style={{ border: '1px solid #cbd5e1', background: '#f8f9fa', maxWidth: '100%', height: 'auto' }} /></div>
          <div><label>Vista previa:</label><div style={{ background: '#f1f5f9', borderRadius: 12, padding: 16, minHeight: 200 }}>{productoSeleccionado ? <canvas ref={canvasRef} style={{ border: '1px solid #cbd5e1', background: 'white', maxWidth: '100%', height: 'auto' }} /> : <div>Selecciona un producto</div>}</div></div>
        </div>
      </div>
    </div>
  );
}

const btnSmall = { background: '#e2e8f0', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 16, fontWeight: 'bold' };

// ============================================================
// PANEL PRODUCTOS
// ============================================================
function ProductosPanel({ productos, loading, onProductosChange }) {
  const [busqueda, setBusqueda] = useState('');
  const [paginaActual, setPaginaActual] = useState(1);
  const [productoEditando, setProductoEditando] = useState(null);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [formData, setFormData] = useState({ codigo: '', nombre: '', precio: '', unidad: 'UND' });
  const [errorForm, setErrorForm] = useState('');
  const itemsPorPagina = 10;

  const productosFiltrados = productos.filter(p => p.codigo?.toLowerCase().includes(busqueda.toLowerCase()) || p.nombre?.toLowerCase().includes(busqueda.toLowerCase()));
  const totalPaginas = Math.ceil(productosFiltrados.length / itemsPorPagina);
  const inicio = (paginaActual - 1) * itemsPorPagina;
  const productosPagina = productosFiltrados.slice(inicio, inicio + itemsPorPagina);

  useEffect(() => setPaginaActual(1), [busqueda]);

  function abrirNuevo() { setProductoEditando(null); setFormData({ codigo: '', nombre: '', precio: '', unidad: 'UND' }); setErrorForm(''); setMostrarModal(true); }
  function abrirEditar(producto) { setProductoEditando(producto); setFormData({ codigo: producto.codigo, nombre: producto.nombre, precio: producto.precio.toString(), unidad: producto.unidad || 'UND' }); setErrorForm(''); setMostrarModal(true); }

  async function guardarProducto() {
    if (!formData.codigo.trim()) return setErrorForm('Código obligatorio');
    if (!formData.nombre.trim()) return setErrorForm('Nombre obligatorio');
    const precioNum = parseFloat(formData.precio);
    if (isNaN(precioNum)) return setErrorForm('Precio inválido');
    if (!productoEditando || (productoEditando && formData.codigo !== productoEditando.codigo)) {
      if (productos.some(p => p.codigo === formData.codigo.trim())) return setErrorForm('Código ya existe');
    }
    const producto = { id: productoEditando?.id, codigo: formData.codigo.trim(), nombre: formData.nombre.trim(), precio: precioNum, unidad: formData.unidad.trim() || 'UND' };
    try { await window.electronAPI.saveProducto(producto); setMostrarModal(false); onProductosChange(); } catch (err) { setErrorForm('Error: ' + err.message); }
  }

  async function desactivarProducto(id, nombre) { if (window.confirm(`¿Desactivar "${nombre}"?`)) { await window.electronAPI.deleteProducto(id); onProductosChange(); } }

  if (loading) return <div>Cargando...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2>📦 Productos</h2>
        <button onClick={abrirNuevo} style={{ background: '#0d6efd', color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>+ Nuevo</button>
      </div>
      <input type="text" placeholder="Buscar por código o nombre..." value={busqueda} onChange={e => setBusqueda(e.target.value)} style={{ width: '100%', padding: 10, marginBottom: 20, borderRadius: 8, border: '1px solid #cbd5e1' }} />
      <div style={{ overflowX: 'auto', background: 'white', borderRadius: 12, border: '1px solid #e2e8f0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f1f5f9' }}>
            <tr>
              <th style={{ padding: 12, textAlign: 'left' }}>Código</th>
              <th style={{ padding: 12, textAlign: 'left' }}>Nombre</th>
              <th style={{ padding: 12, textAlign: 'left' }}>Precio (S/)</th>
              <th style={{ padding: 12, textAlign: 'left' }}>Unidad</th>
              <th style={{ padding: 12, textAlign: 'left' }}>Estado</th>
              <th style={{ padding: 12, textAlign: 'left' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {productosPagina.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', padding: 40 }}>No hay productos</td></tr>
            ) : (
              productosPagina.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: 10 }}>{p.codigo}</td>
                  <td style={{ padding: 10 }}>{p.nombre}</td>
                  <td style={{ padding: 10 }}>{parseFloat(p.precio).toFixed(2)}</td>
                  <td style={{ padding: 10 }}>{p.unidad}</td>
                  <td style={{ padding: 10 }}><span style={{ background: p.activo === 1 ? '#dcfce7' : '#fee2e2', padding: '2px 8px', borderRadius: 20 }}>{p.activo === 1 ? 'Activo' : 'Inactivo'}</span></td>
                  <td style={{ padding: 10 }}>
                    <button onClick={() => abrirEditar(p)} style={{ color: '#0d6efd', marginRight: 8, background: 'none', border: 'none', cursor: 'pointer' }}>✏️</button>
                    <button onClick={() => desactivarProducto(p.id, p.nombre)} style={{ color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}>🗑️</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {totalPaginas > 1 && (
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          Página {paginaActual} de {totalPaginas}
          <button onClick={() => setPaginaActual(p => Math.max(1, p-1))} disabled={paginaActual===1} style={{ padding: '4px 12px', marginLeft: 8, background: '#e2e8f0', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Anterior</button>
          <button onClick={() => setPaginaActual(p => Math.min(totalPaginas, p+1))} disabled={paginaActual===totalPaginas} style={{ padding: '4px 12px', marginLeft: 8, background: '#e2e8f0', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Siguiente</button>
        </div>
      )}
      {mostrarModal && (
        <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, background: 'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: 24, borderRadius: 12, width: 400 }}>
            <h3>{productoEditando ? 'Editar producto' : 'Nuevo producto'}</h3>
            {errorForm && <div style={{ color: 'red', marginBottom: 12 }}>{errorForm}</div>}
            <label>Código *</label>
            <input type="text" value={formData.codigo} onChange={e=>setFormData({...formData, codigo: e.target.value})} style={{ width: '100%', marginBottom: 12, padding: 8, border: '1px solid #cbd5e1', borderRadius: 6 }} />
            <label>Nombre *</label>
            <input type="text" value={formData.nombre} onChange={e=>setFormData({...formData, nombre: e.target.value})} style={{ width: '100%', marginBottom: 12, padding: 8, border: '1px solid #cbd5e1', borderRadius: 6 }} />
            <label>Precio (S/) *</label>
            <input type="number" step="0.01" value={formData.precio} onChange={e=>setFormData({...formData, precio: e.target.value})} style={{ width: '100%', marginBottom: 12, padding: 8, border: '1px solid #cbd5e1', borderRadius: 6 }} />
            <label>Unidad</label>
            <input type="text" value={formData.unidad} onChange={e=>setFormData({...formData, unidad: e.target.value})} style={{ width: '100%', marginBottom: 12, padding: 8, border: '1px solid #cbd5e1', borderRadius: 6 }} />
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={guardarProducto} style={{ background: '#0d6efd', color: 'white', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer' }}>Guardar</button>
              <button onClick={()=>setMostrarModal(false)} style={{ background: '#6c757d', color: 'white', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ============================================================
// PANEL IMPORTAR EXCEL (CORREGIDO)
// ============================================================
function ImportarPanel({ onImportComplete }) {
  const [step, setStep] = useState('IDLE');
  const [filePath, setFilePath] = useState(null);
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [previewData, setPreviewData] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [productosCount, setProductosCount] = useState(0);

  // FIX 2: condición invertida eliminada — se recarga en cada cambio de step, incluido 'DONE'
  useEffect(() => {
    window.electronAPI.getProductos().then(list => setProductosCount(list.length));
  }, [step]);

  const handleSelectFile = async () => {
    setError(null);
    const fp = await window.electronAPI.openFileDialog();
    if (!fp) return;
    setFilePath(fp);
    setFileName(fp.split('\\').pop());
    setLoading(true);
    try {
      const sheetsList = await window.electronAPI.getSheets(fp);
      setSheets(sheetsList);
      setStep('SHEETS');
    // FIX 3: cast defensivo en catch
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el archivo. Verifica que no esté abierto en Excel.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSheet = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await window.electronAPI.getPreview(filePath, sheetIdx);
      if (res.error) throw new Error(res.error);
      setPreviewData({ headers: res.headers, rows: res.rows });
      setStep('PREVIEW');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al obtener vista previa');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    setStep('IMPORTING');
    setError(null);
    try {
      const res = await window.electronAPI.importExcel(filePath, sheetIdx);
      if (res.error) throw new Error(res.error);
      setResult(res);
      setStep('DONE');
      const newList = await window.electronAPI.getProductos();
      setProductosCount(newList.length);
      if (onImportComplete) onImportComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error durante la importación');
      setStep('PREVIEW');
    }
  };

  const handleReset = () => {
    setStep('IDLE');
    setFilePath(null);
    setFileName('');
    setSheets([]);
    setPreviewData(null);
    setResult(null);
    setError(null);
    setSheetIdx(0);
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <h2>📥 Importar productos desde Excel</h2>
      <div style={{ marginBottom: 20, background: '#f1f5f9', padding: '8px 16px', borderRadius: 8, display: 'inline-block' }}>
        📊 Productos actuales en DB: <strong>{productosCount}</strong>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#991b1b' }}>
          ❌ {error}
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: 32 }}>⏳ Procesando...</div>}

      {step === 'IDLE' && !loading && (
        <div style={{ border: '2px dashed #cbd5e1', borderRadius: 16, padding: 40, textAlign: 'center', background: '#f8fafc' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📂</div>
          <p>Selecciona el archivo Excel con los productos</p>
          <p style={{ fontSize: 13, color: '#64748b' }}>La primera fila debe tener: codigo, nombre, precio, unidad</p>
          <button onClick={handleSelectFile} style={{ background: '#0d6efd', color: 'white', border: 'none', borderRadius: 8, padding: '10px 24px', marginTop: 16 }}>
            📁 Seleccionar archivo
          </button>
        </div>
      )}

      {step === 'SHEETS' && !loading && (
        <div style={{ background: 'white', borderRadius: 12, padding: 24 }}>
          <p>Archivo: <strong>{fileName}</strong></p>
          <h3>Selecciona la hoja:</h3>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
            {sheets.map(s => (
              <button
                key={s.index}
                onClick={() => setSheetIdx(s.index)}
                style={{ background: sheetIdx === s.index ? '#0d6efd' : '#e2e8f0', color: sheetIdx === s.index ? 'white' : '#1e293b', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer' }}
              >
                {s.name}
              </button>
            ))}
          </div>
          <button onClick={handleSelectSheet} style={{ background: '#0d6efd', color: 'white', border: 'none', borderRadius: 6, padding: '8px 20px' }}>Continuar →</button>
          <button onClick={handleReset} style={{ marginLeft: 8, background: '#6c757d', color: 'white', border: 'none', borderRadius: 6, padding: '8px 20px' }}>Cancelar</button>
        </div>
      )}

      {step === 'PREVIEW' && previewData && !loading && (
        <div>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, marginBottom: 20 }}>
            <h3>Vista previa</h3>
            <p>Columnas detectadas: <strong>{previewData.headers?.join(', ')}</strong></p>
            <div style={{ overflowX: 'auto', maxHeight: 300 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }} border="1">
                <thead style={{ background: '#0d6efd', color: 'white' }}>
                  <tr>
                    {previewData.headers?.map((h, i) => <th key={i} style={{ padding: '8px' }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {previewData.rows?.map((row, i) => (
                    <tr key={i}>
                      {/* FIX 1: </td> sin barra invertida — era <\/td> */}
                      {row.map((cell, j) => <td key={j} style={{ padding: '6px' }}>{cell ?? ''}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: 12, marginTop: 12 }}>Mostrando primeras {previewData.rows?.length} filas (sin encabezados).</p>
          </div>
          <button onClick={handleImport} style={{ background: '#0d6efd', color: 'white', border: 'none', borderRadius: 6, padding: '10px 24px' }}>✅ Confirmar importación</button>
          <button onClick={handleReset} style={{ marginLeft: 8, background: '#6c757d', color: 'white', border: 'none', borderRadius: 6, padding: '10px 24px' }}>Cancelar</button>
        </div>
      )}

      {step === 'IMPORTING' && (
        <div style={{ textAlign: 'center', padding: 40 }}>⏳ Importando, espere...</div>
      )}

      {step === 'DONE' && result && (
        <div style={{ background: '#f0fdf4', padding: 24, borderRadius: 12 }}>
          <h3 style={{ color: '#15803d' }}>✅ Importación completada</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginTop: 16 }}>
            <div>Nuevos: <strong>{result.nuevos}</strong></div>
            <div>Actualizados: <strong>{result.actualizados}</strong></div>
            <div>Sin cambios: <strong>{result.sinCambios}</strong></div>
            <div>Errores: <strong>{result.errores}</strong></div>
          </div>
          <button onClick={handleReset} style={{ marginTop: 16, background: '#0d6efd', color: 'white', border: 'none', borderRadius: 6, padding: '8px 20px' }}>
            ← Nueva importación
          </button>
        </div>
      )}
    </div>
  );
}



// ============================================================
// PANEL HISTORIAL
// ============================================================
function HistorialPanel() {
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroProducto, setFiltroProducto] = useState('');
  const [filtroFecha, setFiltroFecha] = useState('');
  const [productos, setProductos] = useState([]);
  const [plantillas, setPlantillas] = useState([]);
  const [imprimiendoId, setImprimiendoId] = useState(null);

  useEffect(() => { cargarHistorial(); cargarAuxiliares(); }, []);

  async function cargarHistorial() { setLoading(true); try { setHistorial(await window.electronAPI.getHistorial()); } catch(err) { console.error(err); } finally { setLoading(false); } }
  async function cargarAuxiliares() { try { const [prods, plants] = await Promise.all([window.electronAPI.getProductos(), window.electronAPI.getPlantillas()]); setProductos(prods); setPlantillas(plants); } catch(err) { console.error(err); } }

  const reimprimir = async (item) => {
    const impresora = await window.electronAPI.getConfig('impresora_default');
    if (!impresora) return alert('No has seleccionado impresora');
    const producto = productos.find(p => p.id === item.producto_id);
    const plantilla = plantillas.find(p => p.id === item.plantilla_id);
    if (!producto || !plantilla) return alert('Producto o plantilla no encontrados');
    setImprimiendoId(item.id);
    try {
      const tsp = generarTSPL(producto, plantilla, item.cantidad);
      await window.electronAPI.printTSPL(tsp, impresora);
      alert(`✅ Reimpresión enviada: ${item.cantidad} etiquetas`);
    } catch (err) { alert(err.message); } finally { setImprimiendoId(null); }
  };

  const exportarAExcel = () => {
    const data = historial.map(item => ({ Fecha: item.fecha, Producto: item.producto_nombre, Código: item.codigo, Plantilla: item.plantilla_nombre, Cantidad: item.cantidad, Estado: item.estado }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Historial');
    XLSX.writeFile(wb, `historial_${new Date().toISOString().slice(0,19)}.xlsx`);
  };

  const historialFiltrado = historial.filter(item => (!filtroProducto || item.producto_nombre?.toLowerCase().includes(filtroProducto.toLowerCase())) && (!filtroFecha || item.fecha.includes(filtroFecha)));

  if (loading) return <div>Cargando historial...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2>📋 Historial de impresiones</h2>
        <button onClick={exportarAExcel} style={{ background: '#0d6efd', color: 'white', border: 'none', borderRadius: 6, padding: '6px 12px' }}>📎 Exportar a Excel</button>
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <input type="text" placeholder="Filtrar producto" value={filtroProducto} onChange={e => setFiltroProducto(e.target.value)} style={{ flex: 1, padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }} />
        <input type="date" value={filtroFecha} onChange={e => setFiltroFecha(e.target.value)} style={{ padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }} />
      </div>
      <div style={{ overflowX: 'auto', background: 'white', borderRadius: 12, border: '1px solid #e2e8f0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f1f5f9' }}>
            <tr><th>Fecha</th><th>Producto</th><th>Código</th><th>Plantilla</th><th>Cantidad</th><th>Estado</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            {historialFiltrado.length === 0 ? (
              <tr><td colSpan="7" style={{ textAlign: 'center', padding: 32 }}>No hay registros</td></tr>
            ) : (
              historialFiltrado.map(item => (
                <tr key={item.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: 8 }}>{item.fecha}</td>
                  <td style={{ padding: 8 }}>{item.producto_nombre}</td>
                  <td style={{ padding: 8 }}>{item.codigo}</td>
                  <td style={{ padding: 8 }}>{item.plantilla_nombre}</td>
                  <td style={{ padding: 8 }}>{item.cantidad}</td>
                  <td style={{ padding: 8 }}><span style={{ background: item.estado === 'OK' ? '#dcfce7' : '#fee2e2', padding: '2px 8px', borderRadius: 20 }}>{item.estado}</span></td>
                  <td style={{ padding: 8 }}><button onClick={() => reimprimir(item)} disabled={imprimiendoId === item.id} style={{ background: '#0d6efd', color: 'white', border: 'none', borderRadius: 4, padding: '4px 12px' }}>{imprimiendoId === item.id ? '⏳' : 'Reimprimir'}</button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EditorPanel() {
  const [plantillas, setPlantillas] = useState([]);
  const [plantillaSeleccionada, setPlantillaSeleccionada] = useState(null);
  const [config, setConfig] = useState({});
  const [productoDemo, setProductoDemo] = useState(null);
  const [productos, setProductos] = useState([]);
  const canvasRef = useRef(null);
  const escala = 3;

  useEffect(() => { cargarDatos(); }, []);

  async function cargarDatos() {
    try {
      const plants = await window.electronAPI.getPlantillas();
      setPlantillas(plants);
      if (plants.length) { 
        setPlantillaSeleccionada(plants[0]); 
        const parsedConfig = JSON.parse(plants[0].config_json || '{}');
        // Asegurar que todos los campos existan con valores por defecto
        setConfig({
          barcode: parsedConfig.barcode || { x: 5, y: 5, height: 20, width: 40 },
          nombre: parsedConfig.nombre || { x: 5, y: 30, fontSize: 8, visible: true },
          precio: parsedConfig.precio || { x: 5, y: 50, fontSize: 10, visible: true },
          unidad: parsedConfig.unidad || { x: 5, y: 70, fontSize: 6, visible: true }
        });
      }
      const prods = await window.electronAPI.getProductos();
      setProductos(prods);
      if (prods.length) setProductoDemo(prods[0]);
    } catch (err) { console.error(err); }
  }

  useEffect(() => {
    if (plantillaSeleccionada) {
      const parsedConfig = JSON.parse(plantillaSeleccionada.config_json || '{}');
      setConfig({
        barcode: parsedConfig.barcode || { x: 5, y: 5, height: 20, width: 40 },
        nombre: parsedConfig.nombre || { x: 5, y: 30, fontSize: 8, visible: true },
        precio: parsedConfig.precio || { x: 5, y: 50, fontSize: 10, visible: true },
        unidad: parsedConfig.unidad || { x: 5, y: 70, fontSize: 6, visible: true }
      });
    }
  }, [plantillaSeleccionada]);

  useEffect(() => {
    if (canvasRef.current && plantillaSeleccionada && productoDemo) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const anchoPx = plantillaSeleccionada.ancho_mm * escala;
      const altoPx = plantillaSeleccionada.alto_mm * escala;
      canvas.width = anchoPx;
      canvas.height = altoPx;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, anchoPx, altoPx);
      ctx.strokeStyle = '#ccc';
      ctx.strokeRect(0, 0, anchoPx, altoPx);

      // Código de barras
      if (config.barcode && productoDemo) {
        try {
          const bcCanvas = document.createElement('canvas');
          bwipjs.toCanvas(bcCanvas, {
            bcid: 'code39',
            text: productoDemo.codigo,
            scale: 2,
            height: 10,
            includetext: false
          });
          ctx.drawImage(bcCanvas, (config.barcode.x || 5) * escala, (config.barcode.y || 5) * escala, (config.barcode.width || 40) * escala, (config.barcode.height || 20) * escala);
        } catch(e) { console.error(e); }
      }

      // Nombre
      if (config.nombre?.visible !== false) {
        ctx.font = `${(config.nombre.fontSize || 8) * escala}px monospace`;
        ctx.fillStyle = '#000';
        ctx.fillText(productoDemo.nombre, (config.nombre.x || 5) * escala, (config.nombre.y || 30) * escala);
      }

      // Precio
      if (config.precio?.visible !== false) {
        ctx.font = `${(config.precio.fontSize || 10) * escala}px monospace`;
        ctx.fillStyle = '#000';
        ctx.fillText(`S/ ${productoDemo.precio.toFixed(2)}`, (config.precio.x || 5) * escala, (config.precio.y || 50) * escala);
      }

      // Unidad
      if (config.unidad?.visible !== false) {
        ctx.font = `${(config.unidad.fontSize || 6) * escala}px monospace`;
        ctx.fillStyle = '#000';
        ctx.fillText(`Unidad: ${productoDemo.unidad || 'UND'}`, (config.unidad.x || 5) * escala, (config.unidad.y || 70) * escala);
      }
    }
  }, [config, plantillaSeleccionada, productoDemo]);

  const actualizarPropiedad = (campo, prop, val) => {
    setConfig(prev => ({
      ...prev,
      [campo]: {
        ...(prev[campo] || {}),
        [prop]: val
      }
    }));
  };

  const guardarConfiguracion = async () => {
    if (!plantillaSeleccionada) return;
    await window.electronAPI.updatePlantilla(plantillaSeleccionada.id, JSON.stringify(config));
    alert('✅ Plantilla guardada');
    const plants = await window.electronAPI.getPlantillas();
    setPlantillas(plants);
    setPlantillaSeleccionada(plants.find(p => p.id === plantillaSeleccionada.id));
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <h2>✏️ Editor visual de plantilla</h2>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <label>Seleccionar plantilla:</label>
          <select
            value={plantillaSeleccionada?.id || ''}
            onChange={e => setPlantillaSeleccionada(plantillas.find(p => p.id === parseInt(e.target.value)))}
            style={{ width: '100%', padding: 8, marginBottom: 16, borderRadius: 6, border: '1px solid #cbd5e1' }}
          >
            {plantillas.map(pl => (
              <option key={pl.id} value={pl.id}>
                {pl.nombre} ({pl.ancho_mm}×{pl.alto_mm} mm)
              </option>
            ))}
          </select>

          {plantillaSeleccionada && (
            <>
              <h3>Configuración</h3>
              {['nombre', 'precio', 'unidad'].map(campo => (
                <div key={campo} style={{ border: '1px solid #e2e8f0', padding: 12, borderRadius: 8, marginBottom: 12 }}>
                  <label style={{ fontWeight: 'bold' }}>{campo.charAt(0).toUpperCase() + campo.slice(1)}</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                    <label>
                      <input
                        type="checkbox"
                        checked={config[campo]?.visible !== false}
                        onChange={e => actualizarPropiedad(campo, 'visible', e.target.checked)}
                      /> Visible
                    </label>
                    <label>X: <input type="number" step="1" value={config[campo]?.x ?? 5} onChange={e => actualizarPropiedad(campo, 'x', parseFloat(e.target.value))} style={{ width: 60 }} /></label>
                    <label>Y: <input type="number" step="1" value={config[campo]?.y ?? 40} onChange={e => actualizarPropiedad(campo, 'y', parseFloat(e.target.value))} style={{ width: 60 }} /></label>
                    <label>Fuente: <input type="number" step="1" value={config[campo]?.fontSize ?? 8} onChange={e => actualizarPropiedad(campo, 'fontSize', parseFloat(e.target.value))} style={{ width: 60 }} /></label>
                  </div>
                </div>
              ))}
              <div style={{ border: '1px solid #e2e8f0', padding: 12, borderRadius: 8 }}>
                <label style={{ fontWeight: 'bold' }}>Código de barras</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                  <label>X: <input type="number" step="1" value={config.barcode?.x ?? 5} onChange={e => setConfig(prev => ({ ...prev, barcode: { ...prev.barcode, x: parseFloat(e.target.value) } }))} style={{ width: 60 }} /></label>
                  <label>Y: <input type="number" step="1" value={config.barcode?.y ?? 5} onChange={e => setConfig(prev => ({ ...prev, barcode: { ...prev.barcode, y: parseFloat(e.target.value) } }))} style={{ width: 60 }} /></label>
                  <label>Altura: <input type="number" step="2" value={config.barcode?.height ?? 20} onChange={e => setConfig(prev => ({ ...prev, barcode: { ...prev.barcode, height: parseFloat(e.target.value) } }))} style={{ width: 60 }} /></label>
                </div>
              </div>
              <button onClick={guardarConfiguracion} style={{ background: '#0d6efd', color: 'white', border: 'none', borderRadius: 6, padding: '10px 20px', marginTop: 20, width: '100%' }}>
                💾 Guardar cambios
              </button>
            </>
          )}
        </div>
        <div style={{ flex: 1.5 }}>
          <label>Vista previa</label>
          <div style={{ background: '#f1f5f9', borderRadius: 12, padding: 16 }}>
            <canvas ref={canvasRef} style={{ border: '1px solid #cbd5e1', background: 'white', maxWidth: '100%', height: 'auto' }} />
          </div>
          <div style={{ marginTop: 16 }}>
            <label>Producto ejemplo:</label>
            <select
              value={productoDemo?.id || ''}
              onChange={e => setProductoDemo(productos.find(p => p.id === parseInt(e.target.value)))}
              style={{ padding: 6, borderRadius: 6, width: '100%' }}
            >
              {productos.map(p => <option key={p.id} value={p.id}>{p.nombre} ({p.codigo})</option>)}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PANEL CONFIGURACIÓN
// ============================================================
function ConfiguracionPanel() {
  const [impresoras, setImpresoras] = useState([]);
  const [impresoraSeleccionada, setImpresoraSeleccionada] = useState('');
  const [mensaje, setMensaje] = useState('');

  useEffect(() => { cargarImpresoras(); cargarImpresoraGuardada(); }, []);

  async function cargarImpresoras() { try { setImpresoras(await window.electronAPI.getPrinters()); } catch(e) { console.error(e); } }
  async function cargarImpresoraGuardada() { const g = await window.electronAPI.getConfig('impresora_default'); if(g) setImpresoraSeleccionada(g); }
  async function guardarImpresora() { if (!impresoraSeleccionada) return; await window.electronAPI.setConfig('impresora_default', impresoraSeleccionada); setMensaje('✅ Impresora guardada'); setTimeout(() => setMensaje(''), 3000); }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', background: 'white', borderRadius: 12, padding: 24 }}>
      <h2>⚙️ Configuración de impresora</h2>
      <select value={impresoraSeleccionada} onChange={e => setImpresoraSeleccionada(e.target.value)} style={{ width: '100%', padding: 10, margin: '10px 0', borderRadius: 6 }}>
        <option value="">-- Selecciona una impresora --</option>
        {impresoras.map((p, i) => <option key={i} value={p.name}>{p.name}</option>)}
      </select>
      <button onClick={guardarImpresora} style={{ background: '#0d6efd', color: 'white', border: 'none', borderRadius: 6, padding: '8px 16px' }}>Guardar</button>
      {mensaje && <p style={{ marginTop: 12, color: '#15803d' }}>{mensaje}</p>}
    </div>
  );
}

export default App;